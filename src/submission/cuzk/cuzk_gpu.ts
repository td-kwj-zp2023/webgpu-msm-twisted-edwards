import mustache from 'mustache'
import assert from 'assert'
import { BigIntPoint } from "../../reference/types"
import { ExtPointType } from "@noble/curves/abstract/edwards";
import {
    get_device,
    create_and_write_sb,
    create_bind_group,
    create_bind_group_layout,
    create_compute_pipeline,
    create_sb,
    read_from_gpu,
    execute_pipeline,
    read_from_gpu_1,
} from '../gpu'
import {
    to_words_le,
    gen_p_limbs,
    gen_r_limbs,
    gen_mu_limbs,
    u8s_to_bigints,
    u8s_to_numbers,
    u8s_to_numbers_32,
    bigints_to_u8_for_gpu,
    compute_misc_params,
    decompose_scalars,
    are_point_arr_equal,
} from '../utils'
import { cpu_transpose } from './transpose'
import { cpu_smvp } from './smvp';
import { shader_invocation } from '../bucket_points_reduction'

import convert_point_coords_and_decompose_scalars from '../wgsl/convert_point_coords_and_decompose_scalars.template.wgsl'
import extract_word_from_bytes_le_funcs from '../wgsl/extract_word_from_bytes_le.template.wgsl'
import structs from '../wgsl/struct/structs.template.wgsl'
import bigint_funcs from '../wgsl/bigint/bigint.template.wgsl'
import field_funcs from '../wgsl/field/field.template.wgsl'
import ec_funcs from '../wgsl/curve/ec.template.wgsl'
import barrett_funcs from '../wgsl/barrett.template.wgsl'
import montgomery_product_funcs from '../wgsl/montgomery/mont_pro_product.template.wgsl'
import curve_parameters from '../wgsl/curve/parameters.template.wgsl'
import transpose_serial_shader from '../wgsl/transpose_serial.wgsl'
import smvp_shader from '../wgsl/smvp.template.wgsl'
import bucket_points_reduction_shader from '../wgsl/bucket_points_reduction.template.wgsl'

// Hardcode params for word_size = 13
const p = BigInt('8444461749428370424248824938781546531375899335154063827935233455917409239041')
const word_size = 13
const params = compute_misc_params(p, word_size)
const n0 = params.n0
const num_words = params.num_words
const r = params.r
const rinv = params.rinv

import { FieldMath } from "../../reference/utils/FieldMath"
const fieldMath = new FieldMath()

/*
 * End-to-end implementation of the cuZK MSM algorithm.
 */
export const cuzk_gpu = async (
    baseAffinePoints: BigIntPoint[],
    scalars: bigint[]
): Promise<{x: bigint, y: bigint}> => {
    const input_size = baseAffinePoints.length
    const chunk_size = 16

    const num_columns = 2 ** chunk_size

    const num_chunks_per_scalar = Math.ceil(256 / chunk_size)
    const num_subtasks = num_chunks_per_scalar

    // Each pass must use the same GPUDevice and GPUCommandEncoder, or else
    // storage buffers can't be reused across compute passes
    const device = await get_device()
    const commandEncoder = device.createCommandEncoder()
 
    // Convert the affine points to Montgomery form and decompose the scalars
    // using a single shader
    const { point_x_sb, point_y_sb, scalar_chunks_sb } =
        await convert_point_coords_and_decompose_shaders(
            device,
            // commandEncoder,
            baseAffinePoints,
            num_words, 
            word_size,
            scalars,
            num_subtasks,
            chunk_size,
            true
        )

    const aggregated_x_sbs: GPUBuffer[] = []
    const aggregated_y_sbs: GPUBuffer[] = []
    const aggregated_t_sbs: GPUBuffer[] = []
    const aggregated_z_sbs: GPUBuffer[] = []

    // Size: (2 ** chunk_size) pairs of BigInts
    const output_buffer_length = num_columns * num_words * 4
    const bucket_sum_x_sb = create_sb(device, output_buffer_length)
    const bucket_sum_y_sb = create_sb(device, output_buffer_length)
    const bucket_sum_t_sb = create_sb(device, output_buffer_length)
    const bucket_sum_z_sb = create_sb(device, output_buffer_length)
    const csr_col_idx_sb = create_sb(device, input_size * 4)

    for (let subtask_idx = 0; subtask_idx < num_subtasks; subtask_idx ++) {
        // Copy subtask_chunks to csr_col_idx
        commandEncoder.copyBufferToBuffer(
            scalar_chunks_sb,
            subtask_idx * csr_col_idx_sb.size,
            csr_col_idx_sb,
            0,
            csr_col_idx_sb.size,
        )

        // Construct row_ptr
        const csr_row_ptr_sb = await gen_row_ptr(
            device,
            // commandEncoder,
            input_size,
            num_columns,
            true
        )

        // Transpose
        const {
            csc_col_ptr_sb,
            csc_val_idxs_sb,
        } = await transpose_gpu(
            device,
            // commandEncoder,
            input_size,
            num_columns,
            csr_row_ptr_sb,
            scalar_chunks_sb,
            true
        )

        // SMVP and multiplication by the bucket index
        await smvp_gpu(
            device,
            // commandEncoder,
            num_columns,
            input_size,
            csc_col_ptr_sb,
            point_x_sb,
            point_y_sb,
            csc_val_idxs_sb,
            bucket_sum_x_sb,
            bucket_sum_y_sb,
            bucket_sum_t_sb,
            bucket_sum_z_sb,
            true
        )

        // Bucket aggregation
        const {
            out_x_sb,
            out_y_sb,
            out_t_sb,
            out_z_sb,
        } = await bucket_aggregation(
            device,
            // commandEncoder,
            bucket_sum_x_sb,
            bucket_sum_y_sb,
            bucket_sum_t_sb,
            bucket_sum_z_sb,
            num_columns,
            true
        )

        // TODO: improve memory handling of these buffers. Instead of
        // initialising a new buffer every time, copy the data to an aggregate
        // buffer
        // aggregated_x_sbs.push(out_x_sb)
        // aggregated_y_sbs.push(out_y_sb)
        // aggregated_t_sbs.push(out_t_sb)
        // aggregated_z_sbs.push(out_z_sb)
    }

    // const bucket_sum_data = await read_from_gpu_1(
    //     device,
    //     commandEncoder,
    //     aggregated_x_sbs.concat(aggregated_y_sbs).concat(aggregated_t_sbs).concat(aggregated_z_sbs),
    //     num_words * 4,
    // )
    // console.log("bucket_sum_data is: ", bucket_sum_data)

    // device.destroy()

    // const points: ExtPointType[] = []
    // const k = aggregated_x_sbs.length
    // for (let i = 0; i < k; i ++) {
    //     // Convert each point out of Montgomery form
    //     const x_mont_coords = u8s_to_bigints(bucket_sum_data[i], num_words, word_size)
    //     const y_mont_coords = u8s_to_bigints(bucket_sum_data[i + k], num_words, word_size)
    //     const t_mont_coords = u8s_to_bigints(bucket_sum_data[i + 2 * k], num_words, word_size)
    //     const z_mont_coords = u8s_to_bigints(bucket_sum_data[i + 3 * k], num_words, word_size)

    //     const pt = fieldMath.createPoint(
    //         fieldMath.Fp.mul(x_mont_coords[0], rinv),
    //         fieldMath.Fp.mul(y_mont_coords[0], rinv),
    //         fieldMath.Fp.mul(t_mont_coords[0], rinv),
    //         fieldMath.Fp.mul(z_mont_coords[0], rinv),
    //     )
    //     points.push(pt)
    // }

    // // Horner's rule
    // const m = BigInt(2) ** BigInt(chunk_size)
    // // The last scalar chunk is the most significant digit (base m)
    // let result = points[points.length - 1]
    // for (let i = points.length - 2; i >= 0; i --) {
    //     result = result.multiply(m)
    //     result = result.add(points[i])
    // }

    // // console.log("result is: ", result.toAffine())
    // return result.toAffine()
    //device.destroy()
    return { x: BigInt(0), y: BigInt(1) }
}

/*
 * Convert the affine points to Montgomery form, and decompose scalars into
 * chunk_size windows.

 * ASSUMPTION: the vast majority of WebGPU-enabled consumer devices have a
 * maximum buffer size of at least 268435456 bytes.
 * 
 * The default maximum buffer size is 268435456 bytes. Since each point
 * consumes 320 bytes, a maximum of around 2 ** 19 points can be stored in a
 * single buffer. If, however, we use 4 buffers - one for each point coordiante
 * X, Y, T, and Z - we can support up an input size of up to 2 ** 21 points.
 * Our implementation, however, will only support up to 2 ** 20 points as that
 * is the maximum input size for the ZPrize competition.
 * 
 * The test harness readme at https://github.com/demox-labs/webgpu-msm states:
 * "The submission should produce correct outputs on input vectors with length
 * up to 2^20. The evaluation will be using input randomly sampled from size
 * 2^16 ~ 2^20."
*/
export const convert_point_coords_and_decompose_shaders = async (
    device: GPUDevice,
    // commandEncoder: GPUCommandEncoder,
    baseAffinePoints: BigIntPoint[],
    num_words: number,
    word_size: number,
    scalars: bigint[],
    num_subtasks: number,
    chunk_size: number,
    debug = false,
) => {
    assert(num_subtasks * chunk_size === 256)
    const input_size = baseAffinePoints.length

    // An affine point only contains X and Y points.
    const x_coords = Array(input_size).fill(BigInt(0))
    const y_coords = Array(input_size).fill(BigInt(0))
    for (let i = 0; i < input_size; i ++) {
        x_coords[i] = baseAffinePoints[i].x
        y_coords[i] = baseAffinePoints[i].y
    }
    
    const start = Date.now()

    // Convert points to bytes (performs ~2x faster than
    // `bigints_to_16_bit_words_for_gpu`)
    const x_coords_bytes = bigints_to_u8_for_gpu(x_coords, 16, 16)
    const y_coords_bytes = bigints_to_u8_for_gpu(y_coords, 16, 16)

    // Convert scalars to bytes
    const scalars_bytes = bigints_to_u8_for_gpu(scalars, 16, 16)

    const commandEncoder = device.createCommandEncoder();

    const elapsed = Date.now() - start
    console.log(`GPU 0 took ${elapsed}ms`)

    // Input buffers
    const x_coords_sb = create_and_write_sb(device, x_coords_bytes)
    const y_coords_sb = create_and_write_sb(device, y_coords_bytes)
    const scalars_sb = create_and_write_sb(device, scalars_bytes)

    // Output buffers
    const point_x_sb = create_sb(device, input_size * num_words * 4)
    const point_y_sb = create_sb(device, input_size * num_words * 4)
    const scalar_chunks_sb = create_sb(device, input_size * num_subtasks * 4)

    // const commandEncoder = device.createCommandEncoder();

    const bindGroupLayout = create_bind_group_layout(
        device,
        [
            'read-only-storage',
            'read-only-storage',
            'read-only-storage',
            'storage',
            'storage',
            'storage',
        ],
    )
    const bindGroup = create_bind_group(
        device,
        bindGroupLayout,
        [
            x_coords_sb,
            y_coords_sb,
            scalars_sb,
            point_x_sb,
            point_y_sb,
            scalar_chunks_sb,
        ],
    )

    let workgroup_size = 256
    let num_x_workgroups = 1
    let num_y_workgroups = input_size / workgroup_size / num_x_workgroups

    if (input_size < 256) {
        workgroup_size = input_size
        num_x_workgroups = 1
        num_y_workgroups = 1
    } else if (input_size >= 256 && input_size < 65536) {
        workgroup_size = 256
        num_x_workgroups = input_size / workgroup_size
        num_y_workgroups = input_size / workgroup_size / num_x_workgroups
    }

    const shaderCode = genConvertPointCoordsAndDecomposeScalarsShaderCode(
        workgroup_size,
        num_y_workgroups,
        num_subtasks,
        chunk_size, 
        input_size
    )

    const computePipeline = await create_compute_pipeline(
        device,
        [bindGroupLayout],
        shaderCode,
        'main',
    )

    execute_pipeline(commandEncoder, computePipeline, bindGroup, num_x_workgroups, num_y_workgroups, 1)

    if (debug) {
        const data = await read_from_gpu(
            device,
            commandEncoder,
            [
                point_x_sb,
                point_y_sb,
                scalar_chunks_sb,
            ],
        )
        
        // // Verify point coords
        // const computed_x_coords = u8s_to_bigints(data[0], num_words, word_size)
        // const computed_y_coords = u8s_to_bigints(data[1], num_words, word_size)

        // for (let i = 0; i < input_size; i ++) {
        //     const expected_x = baseAffinePoints[i].x * r % p
        //     const expected_y = baseAffinePoints[i].y * r % p

        //     if (!(expected_x === computed_x_coords[i] && expected_y === computed_y_coords[i])) {
        //         console.log('mismatch at', i)
        //         break
        //     }
        // }

        // // Verify scalar chunks
        // const computed_chunks = u8s_to_numbers(data[2])

        // const all_chunks: Uint16Array[] = []

        // const expected: number[] = Array(scalars.length * num_subtasks).fill(0)
        // for (let i = 0; i < scalars.length; i ++) {
        //     const chunks = to_words_le(scalars[i], num_subtasks, chunk_size)
        //     all_chunks.push(chunks)
        // }
        // for (let i = 0; i < chunk_size; i ++) {
        //     for (let j = 0; j < scalars.length; j ++) {
        //         expected[j * chunk_size + i] = all_chunks[j][i]
        //     }
        // }

        // const decompose_scalars_original = decompose_scalars(scalars, num_subtasks, chunk_size)

        // if (computed_chunks.length !== expected.length) {
        //     throw Error('output size mismatch')
        // }

        // for (let j = 0; j < decompose_scalars_original.length; j++) {
        //     let z = 0;
        //     for (let i = j * input_size; i < (j + 1) * input_size; i++) {
        //         if (computed_chunks[i] !== decompose_scalars_original[j][z]) {
        //             throw Error(`scalar decomp mismatch at ${i}`)
        //         }
        //         z++;
        //     }
        // }
    }

    return { point_x_sb, point_y_sb, scalar_chunks_sb }
}

const genConvertPointCoordsAndDecomposeScalarsShaderCode = (
    workgroup_size: number,
    num_y_workgroups: number,
    num_subtasks: number,
    chunk_size: number, 
    input_size: number,
) => {
    const mask = BigInt(2) ** BigInt(word_size) - BigInt(1)
    const two_pow_word_size = 2 ** word_size
    const p_limbs = gen_p_limbs(p, num_words, word_size)
    const r_limbs = gen_r_limbs(r, num_words, word_size)
    const mu_limbs = gen_mu_limbs(p, num_words, word_size)
    const p_bitlength = p.toString(2).length
    const slack = num_words * word_size - p_bitlength
        const shaderCode = mustache.render(
        convert_point_coords_and_decompose_scalars,
        {
            workgroup_size,
            num_y_workgroups,
            num_words,
            word_size,
            n0,
            mask,
            two_pow_word_size,
            p_limbs,
            r_limbs,
            mu_limbs,
            w_mask: (1 << word_size) - 1,
            slack,
            num_words_mul_two: num_words * 2,
            num_words_plus_one: num_words + 1,
            num_subtasks,
            chunk_size,
            input_size,
        },
        {
            structs,
            bigint_funcs,
            field_funcs,
            barrett_funcs,
            montgomery_product_funcs,
            extract_word_from_bytes_le_funcs,
        },
    )
    return shaderCode
}

export const gen_row_ptr = async (
    device: GPUDevice,
    // commandEncoder: GPUCommandEncoder,
    input_size: number,
    num_columns: number,
    debug = false,
) => {
    const row_ptr_sb = create_sb(device, (input_size + 1) * 4)

    const commandEncoder = device.createCommandEncoder()

    const bindGroupLayout = create_bind_group_layout(
        device,
        [
            'storage',
        ],
    )
    const bindGroup = create_bind_group(
        device,
        bindGroupLayout,
        [
            row_ptr_sb,
        ],
    )
    const num_x_workgroups = 1
    const num_y_workgroups = 1

    const shaderCode = `
// Input buffers
@group(0) @binding(0)
var<storage, read_write> row_ptr: array<u32>;
@compute
@workgroup_size(1)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let num_chunks = ${input_size}u;
    let num_columns = ${num_columns}u;
    row_ptr[0] = 0u;
    var j = 1u;
    for (var i = 0u; i < num_chunks; i += num_columns) {
        row_ptr[j] = row_ptr[j - 1u] + num_columns;
        j ++;
    }

    for (; j < arrayLength(&row_ptr); j ++) {
        row_ptr[j] = row_ptr[j - 1u];
    }
}
`

    const computePipeline = await create_compute_pipeline(
        device,
        [bindGroupLayout],
        shaderCode,
        'main',
    )

    execute_pipeline(commandEncoder, computePipeline, bindGroup, num_x_workgroups, num_y_workgroups, 1)

    if (debug) {
        const data = await read_from_gpu(
            device,
            commandEncoder,
            [ row_ptr_sb ],
        )
        // const row_ptr = u8s_to_numbers_32(data[0])
        // console.log(row_ptr)
    }

    return row_ptr_sb
}

export const transpose_gpu = async (
    device: GPUDevice,
    // commandEncoder: GPUCommandEncoder,
    input_size: number,
    num_cols: number,
    csr_row_ptr_sb: GPUBuffer,
    new_scalar_chunks_sb: GPUBuffer,
    debug = false,
): Promise<{
    csc_col_ptr_sb: GPUBuffer,
    csc_row_idx_sb: GPUBuffer,
    csc_val_idxs_sb: GPUBuffer,
}> => {
    /*
     * n = number of columns (before transposition)
     * m = number of columns (before transposition)
     * nnz = number of nonzero elements
     *
     * Given: 
     *   - csr_col_idx (nnz) (aka the new_scalar_chunks)
     *   - csr_row_ptr (m + 1)
     *
     * Output the transpose of the above:
     *   - csc_row_idx (nnz)
     *      - The cumulative sum of the number of nonzero elements per row
     *   - csc_col_ptr (m + 1)
     *      - The column index of each nonzero element
     *   - csc_val_idxs (nnz)
     *      - The new index of each nonzero element
     */

    // TODO: create these buffers only once?
    const csc_col_ptr_sb = create_sb(device, (num_cols + 1) * 4)
    const csc_row_idx_sb = create_sb(device, new_scalar_chunks_sb.size)
    const csc_val_idxs_sb = create_sb(device, new_scalar_chunks_sb.size)
    const curr_sb = create_sb(device, num_cols * 4)

    const commandEncoder = device.createCommandEncoder()

    const bindGroupLayout = create_bind_group_layout(
        device,
        [
            'read-only-storage',
            'read-only-storage',
            'storage',
            'storage',
            'storage',
            'storage',
        ],
    )

    const bindGroup = create_bind_group(
        device,
        bindGroupLayout,
        [
            csr_row_ptr_sb,
            new_scalar_chunks_sb,
            csc_col_ptr_sb,
            csc_row_idx_sb,
            csc_val_idxs_sb,
            curr_sb,
        ],
    )

    const num_x_workgroups = 1
    const num_y_workgroups = 1

    const shaderCode = mustache.render(
        transpose_serial_shader,
        { num_cols },
        {},
    )
    const computePipeline = await create_compute_pipeline(
        device,
        [bindGroupLayout],
        shaderCode,
        'main',
    )

    execute_pipeline(commandEncoder, computePipeline, bindGroup, num_x_workgroups, num_y_workgroups, 1)

    if (debug) {
        const data = await read_from_gpu(
            device,
            commandEncoder,
            [
                csc_col_ptr_sb,
                csc_row_idx_sb,
                csc_val_idxs_sb,
                csr_row_ptr_sb,
                new_scalar_chunks_sb],
        )
    
        // const csc_col_ptr_result = u8s_to_numbers_32(data[0])
        // const csc_row_idx_result = u8s_to_numbers_32(data[1])
        // const csc_val_idxs_result = u8s_to_numbers_32(data[2])
        // const csr_row_ptr = u8s_to_numbers_32(data[3])
        // const new_scalar_chunks = u8s_to_numbers_32(data[4])

        // console.log(
        //     //'row_ptr:', csr_row_ptr,
        //     //'new_scalar_chunks:', new_scalar_chunks, 
        //     //'num_columns:', num_cols,
        //     'csc_col_ptr_result:', csc_col_ptr_result,
        //     //'csc_val_idxs_result:', csc_val_idxs_result,
        // )

        // // Verify the output of the shader
        // const expected = cpu_transpose(csr_row_ptr, new_scalar_chunks, num_cols)

        // console.log('expected.csc_col_ptr', expected.csc_col_ptr)
        // //console.log('expected.csc_row_idx', expected.csc_row_idx)
        // //console.log('expected.csc_vals', expected.csc_row_idx)

        // debugger
        // assert(expected.csc_col_ptr.toString() === csc_col_ptr_result.toString(), 'csc_col_ptr mismatch')
        // assert(expected.csc_row_idx.toString() === csc_row_idx_result.toString(), 'csc_row_idx mismatch')
        // assert(expected.csc_vals.toString() === csc_val_idxs_result.toString(), 'csc_vals mismatch')
    }

    return {
        csc_col_ptr_sb,
        csc_row_idx_sb,
        csc_val_idxs_sb,
    }
}

export const smvp_gpu = async (
    device: GPUDevice,
    // commandEncoder: GPUCommandEncoder,
    num_csr_cols: number,
    input_size: number,
    csc_col_ptr_sb: GPUBuffer,
    point_x_sb: GPUBuffer,
    point_y_sb: GPUBuffer,
    csc_val_idxs_sb: GPUBuffer,
    bucket_sum_x_sb: GPUBuffer,
    bucket_sum_y_sb: GPUBuffer,
    bucket_sum_t_sb: GPUBuffer,
    bucket_sum_z_sb: GPUBuffer,
    debug = false,
) => {
    let workgroup_size = 256
    let num_x_workgroups = 256
    let num_y_workgroups = num_csr_cols / workgroup_size / num_x_workgroups

    if (num_csr_cols < 256) {
        workgroup_size = num_csr_cols
        num_x_workgroups = 1
        num_y_workgroups = 1
    } else if (num_csr_cols >= 256 && num_csr_cols < 65536) {
        workgroup_size = 256
        num_x_workgroups = num_csr_cols / workgroup_size
        num_y_workgroups = num_csr_cols / workgroup_size / num_x_workgroups
    }

    const commandEncoder = device.createCommandEncoder();

    const bindGroupLayout = create_bind_group_layout(
        device,
        [
            'read-only-storage',
            'read-only-storage',
            'read-only-storage',
            'read-only-storage',
            'storage',
            'storage',
            'storage',
            'storage',
        ],
    )

    const bindGroup = create_bind_group(
        device,
        bindGroupLayout,
        [
            csc_col_ptr_sb,
            csc_val_idxs_sb,
            point_x_sb,
            point_y_sb,
            bucket_sum_x_sb,
            bucket_sum_y_sb,
            bucket_sum_t_sb,
            bucket_sum_z_sb,
        ],
    )

    const p_limbs = gen_p_limbs(p, num_words, word_size)
    const shaderCode = mustache.render(
        smvp_shader,
        {
            word_size,
            num_words,
            n0,
            p_limbs,
            mask: BigInt(2) ** BigInt(word_size) - BigInt(1),
            two_pow_word_size: BigInt(2) ** BigInt(word_size),
            workgroup_size,
            num_y_workgroups,
        },
        {
            structs,
            bigint_funcs,
            montgomery_product_funcs,
            field_funcs,
            curve_parameters,
            ec_funcs,
        },
    )

    const computePipeline = await create_compute_pipeline(
        device,
        [bindGroupLayout],
        shaderCode,
        'main',
    )

    execute_pipeline(commandEncoder, computePipeline, bindGroup, num_x_workgroups, num_y_workgroups, 1)

    if (debug) {
        console.log("Entered!")
        const data = await read_from_gpu(
            device,
            commandEncoder,
            [
                csc_col_ptr_sb,
                csc_val_idxs_sb,
                point_x_sb,
                point_y_sb,
                bucket_sum_x_sb,
                bucket_sum_y_sb,
                bucket_sum_t_sb,
                bucket_sum_z_sb,
            ],
        )

        // const bucket_sum_x_sb_result = u8s_to_bigints(data[4], num_words, word_size)
        // console.log("bucket_sum_x_sb_result: ", bucket_sum_x_sb_result)
    
        // const csc_val_idxs_result = u8s_to_numbers_32(data[1])
        // const point_x_sb_result = u8s_to_bigints(data[2], num_words, word_size)
        // const point_y_sb_result = u8s_to_bigints(data[3], num_words, word_size)
        // const bucket_sum_x_sb_result = u8s_to_bigints(data[4], num_words, word_size)
        // const bucket_sum_y_sb_result = u8s_to_bigints(data[5], num_words, word_size)
        // const bucket_sum_t_sb_result = u8s_to_bigints(data[6], num_words, word_size)
        // const bucket_sum_z_sb_result = u8s_to_bigints(data[7], num_words, word_size)

        // // Convert GPU output out of Montgomery coordinates
        // const bigIntPointToExtPointType = (bip: BigIntPoint): ExtPointType => {
        //     return fieldMath.createPoint(bip.x, bip.y, bip.t, bip.z)
        // }
        // const output_points_gpu: ExtPointType[] = []
        // for (let i = 0; i < num_csr_cols; i++) {
        //     const non = {
        //         x: fieldMath.Fp.mul(bucket_sum_x_sb_result[i], rinv),
        //         y: fieldMath.Fp.mul(bucket_sum_y_sb_result[i], rinv),
        //         t: fieldMath.Fp.mul(bucket_sum_t_sb_result[i], rinv),
        //         z: fieldMath.Fp.mul(bucket_sum_z_sb_result[i], rinv),
        //     }
        //     output_points_gpu.push(bigIntPointToExtPointType(non))
        // }

        // // Convert CPU output out of Montgomery coordinates
        // const output_points_cpu_out_of_mont: ExtPointType[] = []
        // for (let i = 0; i < input_size; i++) {
        //     const x = fieldMath.Fp.mul(point_x_sb_result[i], rinv)
        //     const y = fieldMath.Fp.mul(point_y_sb_result[i], rinv)
        //     const t = fieldMath.Fp.mul(x, y)
        //     const pt = fieldMath.createPoint(x, y, t, BigInt(1))
        //     pt.assertValidity()
        //     output_points_cpu_out_of_mont.push(pt)
        // }

        // // Calculate SMVP in CPU 
        // const output_points_cpu: ExtPointType[] = cpu_smvp(
        //     csc_col_ptr_sb_result,
        //     csc_val_idxs_result,
        //     output_points_cpu_out_of_mont,
        //     fieldMath,
        // )

        // const ZERO_POINT = fieldMath.customEdwards.ExtendedPoint.ZERO
        // output_points_cpu[0] = ZERO_POINT
        // for (let i = 1; i < output_points_cpu.length; i ++) {
        //     output_points_cpu[i] = output_points_cpu[i].multiply(BigInt(i))
        // }
       
        // // Transform results into affine representation
        // const output_points_affine_cpu = output_points_cpu.map((x) => x.toAffine())
        // const output_points_affine_gpu = output_points_gpu.map((x) => x.toAffine())

        // // Assert CPU and GPU output
        // for (let i = 0; i < output_points_affine_gpu.length; i ++) {
        //     assert(output_points_affine_gpu[i].x === output_points_affine_cpu[i].x, "failed at i: " + i.toString())
        //     assert(output_points_affine_gpu[i].y === output_points_affine_cpu[i].y, "failed at i: " + i.toString())
        // }
    }

    return {
        bucket_sum_x_sb,
        bucket_sum_y_sb,
        bucket_sum_t_sb,
        bucket_sum_z_sb,
    }
}

export const bucket_aggregation = async (
    device: GPUDevice,
    // commandEncoder: GPUCommandEncoder,
    bucket_sum_x_sb: GPUBuffer,
    bucket_sum_y_sb: GPUBuffer,
    bucket_sum_t_sb: GPUBuffer,
    bucket_sum_z_sb: GPUBuffer,
    num_cols: number,
    debug = false,
) => {
    // TODO: improve memory allocation; see above
    const out_x_sb = create_sb(device, bucket_sum_x_sb.size)
    const out_y_sb = create_sb(device, bucket_sum_y_sb.size)
    const out_t_sb = create_sb(device, bucket_sum_t_sb.size)
    const out_z_sb = create_sb(device, bucket_sum_z_sb.size)

    const commandEncoder = device.createCommandEncoder();

    const params = compute_misc_params(p, word_size)
    const n0 = params.n0
    const num_words = params.num_words
    const p_limbs = gen_p_limbs(p, num_words, word_size)

    const shaderCode = mustache.render(
        bucket_points_reduction_shader,
        {
            word_size,
            num_words,
            n0,
            p_limbs,
            mask: BigInt(2) ** BigInt(word_size) - BigInt(1),
            two_pow_word_size: BigInt(2) ** BigInt(word_size),
        },
        {
            structs,
            bigint_funcs,
            field_funcs,
            ec_funcs,
            curve_parameters,
            montgomery_product_funcs,
        },
    )

    let original_bucket_sum_x_sb
    let original_bucket_sum_y_sb
    let original_bucket_sum_t_sb
    let original_bucket_sum_z_sb

    if (debug) {
        original_bucket_sum_x_sb = create_sb(device, bucket_sum_x_sb.size)
        original_bucket_sum_y_sb = create_sb(device, bucket_sum_y_sb.size)
        original_bucket_sum_t_sb = create_sb(device, bucket_sum_t_sb.size)
        original_bucket_sum_z_sb = create_sb(device, bucket_sum_z_sb.size)

        commandEncoder.copyBufferToBuffer(
            bucket_sum_x_sb,
            0,
            original_bucket_sum_x_sb,
            0,
            bucket_sum_x_sb.size,
        )
        commandEncoder.copyBufferToBuffer(
            bucket_sum_y_sb,
            0,
            original_bucket_sum_y_sb,
            0,
            bucket_sum_y_sb.size,
        )
        commandEncoder.copyBufferToBuffer(
            bucket_sum_t_sb,
            0,
            original_bucket_sum_t_sb,
            0,
            bucket_sum_t_sb.size,
        )
        commandEncoder.copyBufferToBuffer(
            bucket_sum_z_sb,
            0,
            original_bucket_sum_z_sb,
            0,
            bucket_sum_z_sb.size,
        )
    }

    //let num_invocations = 0
    let s = num_cols
    while (s > 1) {
        await shader_invocation(
            device,
            commandEncoder,
            shaderCode,
            bucket_sum_x_sb,
            bucket_sum_y_sb,
            bucket_sum_t_sb,
            bucket_sum_z_sb,
            out_x_sb,
            out_y_sb,
            out_t_sb,
            out_z_sb,
            s,
            num_words,
        )
        //num_invocations ++

        const e = s
        s = Math.ceil(s / 2)
        if (e === 1 && s === 1) {
            break
        }
    }
    
    if (
        debug
        && original_bucket_sum_x_sb != undefined // prevent TS warnings
        && original_bucket_sum_y_sb != undefined
        && original_bucket_sum_t_sb != undefined
        && original_bucket_sum_z_sb != undefined
    ) {
        const data = await read_from_gpu(
            device,
            commandEncoder,
            [
                out_x_sb,
                out_y_sb,
                out_t_sb,
                out_z_sb,
                original_bucket_sum_x_sb,
                original_bucket_sum_y_sb,
                original_bucket_sum_t_sb,
                original_bucket_sum_z_sb,
            ]
        )

        // const x_mont_coords_result = u8s_to_bigints(data[0], num_words, word_size)
        // console.log("x_mont_coords_result: ", x_mont_coords_result)
        // const y_mont_coords_result = u8s_to_bigints(data[1], num_words, word_size)
        // const t_mont_coords_result = u8s_to_bigints(data[2], num_words, word_size)
        // const z_mont_coords_result = u8s_to_bigints(data[3], num_words, word_size)

        // // Convert the resulting point coordiantes out of Montgomery form
        // const result = fieldMath.createPoint(
        //     fieldMath.Fp.mul(x_mont_coords_result[0], rinv),
        //     fieldMath.Fp.mul(y_mont_coords_result[0], rinv),
        //     fieldMath.Fp.mul(t_mont_coords_result[0], rinv),
        //     fieldMath.Fp.mul(z_mont_coords_result[0], rinv),
        // )

        // // Check that the sum of the points is correct
        // const bucket_x_mont = u8s_to_bigints(data[4], num_words, word_size)
        // const bucket_y_mont = u8s_to_bigints(data[5], num_words, word_size)
        // const bucket_t_mont = u8s_to_bigints(data[6], num_words, word_size)
        // const bucket_z_mont = u8s_to_bigints(data[7], num_words, word_size)

        // const points: ExtPointType[] = []
        // for (let i = 0; i < num_cols; i ++) {
        //     points.push(fieldMath.createPoint(
        //         fieldMath.Fp.mul(bucket_x_mont[i], rinv),
        //         fieldMath.Fp.mul(bucket_y_mont[i], rinv),
        //         fieldMath.Fp.mul(bucket_t_mont[i], rinv),
        //         fieldMath.Fp.mul(bucket_z_mont[i], rinv),
        //     ))
        // }

        // // Add up the original points
        // let expected = points[0]
        // for (let i = 1; i < points.length; i ++) {
        //     expected = expected.add(points[i])
        // }

        // assert(are_point_arr_equal([result], [expected]))
    }

    return {
        out_x_sb,
        out_y_sb,
        out_t_sb,
        out_z_sb,
    }
}
