import assert from 'assert'
import { BigIntPoint } from "../../reference/types"
import { ExtPointType } from "@noble/curves/abstract/edwards";
import { FieldMath } from "../../reference/utils/FieldMath";
import { cpu_transpose } from './transpose_wgsl'
import {
    get_device,
    create_and_write_sb,
    create_bind_group,
    create_bind_group_layout,
    create_compute_pipeline,
    create_sb,
    read_from_gpu,
    execute_pipeline,
} from '../gpu'
import {
    to_words_le,
    u8s_to_bigints,
    u8s_to_numbers,
    u8s_to_numbers_32,
    numbers_to_u8s_for_gpu,
    bigints_to_u8_for_gpu,
    compute_misc_params,
    decompose_scalars,
} from '../utils'
import { precompile_shaders } from './precompile_shaders'
import { convert_inputs_to_bytes } from './convert_inputs_to_bytes'
import { ShaderManager } from '../shader_manager'

const fieldMath = new FieldMath()

// Hardcode params for word_size = 13
const p = BigInt('8444461749428370424248824938781546531375899335154063827935233455917409239041')
const word_size = 13
const params = compute_misc_params(p, word_size)
const num_words = params.num_words
const r = params.r
const rinv = params.rinv

const shaderManager = new ShaderManager(word_size)

/*
 * End-to-end implementation of the cuZK MSM algorithm.
 */
export const cuzk_gpu = async (
    baseAffinePoints: BigIntPoint[],
    scalars: bigint[]
): Promise<{x: bigint, y: bigint}> => {
    const input_size = scalars.length

    // The bitwidth of each scalar chunk.
    // TODO: determine the optimal chunk (window) size dynamically based on a
    // static analysis of varying input sizes. This will be determined using a
    // seperate function.
    const chunk_size = 16

    // The number of sparse matrices.
    const num_subtasks = Math.ceil(256 / chunk_size)

    // The number of scalar chunks per sparse matrix.
    const num_chunks = input_size / num_subtasks

    // The number of rows per sparse matrix.
    const num_rows_per_subtask = 256

    // The number of columns of each matrix. Since the scalar chunk is the
    // column index, the number of columns is 2 ** chunk_size.
    const num_cols = 2 ** chunk_size

    // Generate shaders
    const convert_point_coords_and_decompose_scalars_workgroup_size = 64
    const convert_point_coords_and_decompose_scalars_y_workgroups =
            input_size / 256 / convert_point_coords_and_decompose_scalars_workgroup_size

    const convert_point_coords_and_decompose_scalars_shader = 
        shaderManager.gen_convert_point_coords_and_decompose_scalars_shader(
            convert_point_coords_and_decompose_scalars_workgroup_size,
            convert_point_coords_and_decompose_scalars_y_workgroups,
            num_subtasks,
            chunk_size, 
            input_size
        )
    
    const max_chunk_val = 2 ** chunk_size
    // Adjust max_cluster_size based on the input size
    let max_cluster_size = 4
    if (input_size >= 2 ** 20) {
        max_cluster_size = 2
    } else if (input_size >= 2 ** 16) {
        max_cluster_size = 3
    }
    const overflow_size = num_chunks - max_cluster_size
    const csr_precompute_shader = shaderManager.gen_csr_precompute_shader(
        1,
        max_chunk_val,
		input_size,
        num_subtasks,
        max_cluster_size,
        overflow_size,
    )

    const preaggregation_stage_1_workgroup_size = 64
    const preaggregation_stage_1_y_workgroups = input_size / 256 / preaggregation_stage_1_workgroup_size
    const preaggregation_stage_1_shader = shaderManager.gen_preaggregation_stage_1_shader(
        preaggregation_stage_1_workgroup_size,
        preaggregation_stage_1_y_workgroups,
        num_chunks,
    )

    const preaggregation_stage_2_workgroup_size = 16
    const preaggregation_stage_2_y_workgroups = Math.ceil(num_chunks / preaggregation_stage_2_workgroup_size / 256)
    const preaggregation_stage_2_shader = shaderManager.gen_preaggregation_stage_2_shader(
        preaggregation_stage_2_workgroup_size,
        preaggregation_stage_2_y_workgroups,
        num_chunks,
    )

    const compute_row_ptr_workgroup_size = 1
    const compute_row_ptr_y_workgroups = 1
    const max_row_size = num_chunks / num_rows_per_subtask
    const compute_row_ptr_shader = shaderManager.gen_compute_row_ptr_shader(
        compute_row_ptr_workgroup_size,
        compute_row_ptr_y_workgroups,
        num_chunks,
        max_row_size,
    )

    const transpose_shader = shaderManager.gen_transpose_shader(num_cols)

    /*
    let x_y_coords_bytes
    let scalars_bytes
    if (input_size >= 2 ** 19 && false) {
        // Perform shader precompilation
        const start = Date.now()
        const workerPromises = []

        workerPromises.push(convertInputsToBytesWorker(baseAffinePoints, scalars))
        workerPromises.push(precompileShadersWorker(
            convert_point_coords_shader,
            convert_point_coords_y_workgroups,
            decompose_scalars_shader,
            decompose_scalars_y_workgroups,
            csr_precompute_shader,
            preaggregation_stage_1_shader,
            preaggregation_stage_1_y_workgroups,
        ))

        const results = await Promise.all(workerPromises)
        x_y_coords_bytes = results[0].x_y_coords_bytes
        scalars_bytes = results[0].scalars_bytes
        const elapsed = Date.now() - start
        console.log(`shader precompilation and inputs conversion to bytes took ${elapsed}ms including WebWorker overhead`)
    } else {
        const r = convert_inputs_to_bytes(
            baseAffinePoints, scalars
        )
        x_y_coords_bytes = r.x_y_coords_bytes
        scalars_bytes = r.scalars_bytes
    }
    precompile_shaders(
        convert_point_coords_shader,
        convert_point_coords_y_workgroups,
        decompose_scalars_shader,
        decompose_scalars_y_workgroups,
        csr_precompute_shader,
        preaggregation_stage_1_shader,
        preaggregation_stage_1_y_workgroups,
    )
    */

    const { x_y_coords_bytes, scalars_bytes } = convert_inputs_to_bytes(
        baseAffinePoints, scalars
    )
    //const start = Date.now()
    //const elapsed = Date.now() - start
    //console.log(`shader precompilation and inputs conversion to bytes took ${elapsed}ms`)

    // Each pass must use the same GPUDevice and GPUCommandEncoder, or else
    // storage buffers can't be reused across compute passes
    const device = await get_device()
    const commandEncoder = device.createCommandEncoder()

    // Convert the affine points to Montgomery form and decompose the scalars
    // using a single shader
    const { point_x_sb, point_y_sb, scalar_chunks_sb } =
        await convert_point_coords_and_decompose_shaders(
            convert_point_coords_and_decompose_scalars_shader,
            convert_point_coords_and_decompose_scalars_y_workgroups,
            device,
            commandEncoder,
            baseAffinePoints,
            x_y_coords_bytes,
            num_words, 
            word_size,
            scalars,
            num_subtasks,
            chunk_size,
            false,
        )

    // Used in pre_aggregation_stage_1_gpu. To save memory, we allocate these
    // buffers only once and reuse them for each subtask.
    const new_point_x_sb = create_sb(device, input_size * num_words * 4)
    const new_point_y_sb = create_sb(device, input_size * num_words * 4)
    const new_point_t_sb = create_sb(device, input_size * num_words * 4)
    const new_point_z_sb = create_sb(device, input_size * num_words * 4)
    
    for (let subtask_idx = 0; subtask_idx < num_subtasks; subtask_idx ++) {
        // Use debug_idx to debug any particular subtask_idx
        const debug_idx = 0

        // TODO: if debug is set to true in any invocations within a loop, the
        // sanity check will fail on the second iteration, because the
        // commandEncoder's finish() function has been used. To correctly
        // sanity-check these outputs, do so in a separate test file.
        const {
            cluster_and_new_point_indices_sb
        } = await csr_precompute_gpu(
            csr_precompute_shader,
            device,
            commandEncoder,
            input_size,
            num_subtasks,
            subtask_idx,
            chunk_size,
            max_cluster_size,
            scalar_chunks_sb,
            false,
        )

        await pre_aggregation_stage_1_gpu(
            preaggregation_stage_1_shader,
            preaggregation_stage_1_y_workgroups,
            device,
            commandEncoder,
            input_size,
            point_x_sb,
            point_y_sb,
            new_point_x_sb,
            new_point_y_sb,
            new_point_t_sb,
            new_point_z_sb,
            cluster_and_new_point_indices_sb,
            num_chunks,
            false,
        )

        const new_scalar_chunks_sb = await pre_aggregation_stage_2_gpu(
            preaggregation_stage_2_shader,
            preaggregation_stage_2_y_workgroups,
            device,
            commandEncoder,
            num_chunks,
            scalar_chunks_sb,
            cluster_and_new_point_indices_sb,
            false,
        )

        const row_ptr_sb = await compute_row_ptr(
            compute_row_ptr_shader,
            compute_row_ptr_workgroup_size,
            compute_row_ptr_y_workgroups,
            device,
            commandEncoder,
            input_size,
            num_subtasks,
            num_rows_per_subtask,
            cluster_and_new_point_indices_sb,
            false,
        )

        const transpose_sb = await transpose_gpu(
            transpose_shader,
            device,
            commandEncoder,
            num_rows_per_subtask,
            num_cols,
            row_ptr_sb,
            new_scalar_chunks_sb,
            false,
            //debug_idx === subtask_idx,
        )
        //if (debug_idx === subtask_idx) { break }

        // TODO: perform SMVP
        // TODO: perform bucket aggregation
    }

    device.destroy()

    return { x: BigInt(1), y: BigInt(0) }
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
    shader_code: string,
    convert_point_coords_and_decompose_scalars_y_workgroups: number,
    device: GPUDevice,
    commandEncoder: GPUCommandEncoder,
    baseAffinePoints: BigIntPoint[],
    x_y_coords_bytes: Uint8Array,
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

    // Convert points to bytes (performs ~2x faster than
    // `bigints_to_16_bit_words_for_gpu`)
    const x_coords_bytes = bigints_to_u8_for_gpu(x_coords, 16, 16)
    const y_coords_bytes = bigints_to_u8_for_gpu(y_coords, 16, 16)

    // Convert scalars to bytes
    const scalars_bytes = bigints_to_u8_for_gpu(scalars, 16, 16)

    // Input buffers
    const x_coords_sb = create_and_write_sb(device, x_coords_bytes)
    const y_coords_sb = create_and_write_sb(device, y_coords_bytes)
    const scalars_sb = create_and_write_sb(device, scalars_bytes)

    // Output buffers
    const point_x_sb = create_sb(device, input_size * num_words * 4)
    const point_y_sb = create_sb(device, input_size * num_words * 4)
    const scalar_chunks_sb = create_sb(device, input_size * num_subtasks * 4)

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

    const computePipeline = await create_compute_pipeline(
        device,
        [bindGroupLayout],
        shader_code,
        'main',
    )

    const num_x_workgroups = 256
    const num_y_workgroups = convert_point_coords_and_decompose_scalars_y_workgroups
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
        
        // Verify point coords
        const computed_x_coords = u8s_to_bigints(data[0], num_words, word_size)
        const computed_y_coords = u8s_to_bigints(data[1], num_words, word_size)

        for (let i = 0; i < input_size; i ++) {
            const expected_x = baseAffinePoints[i].x * r % p
            const expected_y = baseAffinePoints[i].y * r % p

            if (!(expected_x === computed_x_coords[i] && expected_y === computed_y_coords[i])) {
                console.log('mismatch at', i)
                debugger
                break
            }
        }

        // Verify scalar chunks
        const computed_chunks = u8s_to_numbers(data[2])

        const all_chunks: Uint16Array[] = []

        const expected: number[] = Array(scalars.length * num_subtasks).fill(0)
        for (let i = 0; i < scalars.length; i ++) {
            const chunks = to_words_le(scalars[i], num_subtasks, chunk_size)
            all_chunks.push(chunks)
        }
        for (let i = 0; i < chunk_size; i ++) {
            for (let j = 0; j < scalars.length; j ++) {
                expected[j * chunk_size + i] = all_chunks[j][i]
            }
        }

        const decompose_scalars_original = decompose_scalars(scalars, num_subtasks, chunk_size)

        if (computed_chunks.length !== expected.length) {
            throw Error('output size mismatch')
        }

        for (let j = 0; j < decompose_scalars_original.length; j++) {
            let z = 0;
            for (let i = j * input_size; i < (j + 1) * input_size; i++) {
                if (computed_chunks[i] !== decompose_scalars_original[j][z]) {
                    throw Error(`scalar decomp mismatch at ${i}`)
                }
                z++;
            }
        }
    }

    return { point_x_sb, point_y_sb, scalar_chunks_sb }
}

export const csr_precompute_gpu = async (
    shader_code: string,
    device: GPUDevice,
    commandEncoder: GPUCommandEncoder,
    input_size: number,
    num_subtasks: number,
    subtask_idx: number,
    chunk_size: number,
    max_cluster_size: number,
    scalar_chunks_sb: GPUBuffer,
    debug = true,
): Promise<{
    cluster_and_new_point_indices_sb: GPUBuffer,
}> => {
    /*
    // Test values
    const test_scalar_chunks = 
        [
            1, 1, 1, 1, 0, 1, 6, 7, 1, 1, 1, 1, 4, 4, 6, 7,
            1, 1, 1, 1, 0, 1, 6, 7, 1, 1, 1, 1, 4, 4, 6, 7,
        ]
    const test_scalar_chunks_bytes = numbers_to_u8s_for_gpu(test_scalar_chunks)
    scalar_chunks_sb = create_and_write_sb(device, test_scalar_chunks_bytes)
    input_size = test_scalar_chunks.length
    num_subtasks = 2
    subtask_idx = 0

    const test_scalar_chunks_bytes = numbers_to_u8s_for_gpu(TEST_CHUNKS)
    scalar_chunks_sb = create_and_write_sb(device, test_scalar_chunks_bytes)
    subtask_idx = 1
    */

    // This is a serial operation, so only 1 shader should be used
    const num_x_workgroups = 1
    const num_y_workgroups = 1 

    const num_chunks = input_size / num_subtasks

    const max_chunk_val = 2 ** chunk_size
    const overflow_size = num_chunks - max_cluster_size

    // Output buffers
    const cluster_and_new_point_indices_sb = create_sb(device, num_chunks * 2 * 4)
    const map_sb = create_sb(device, (max_cluster_size + 1) * max_chunk_val * 4)
    const overflow_sb = create_sb(device, overflow_size * 4)
    const keys_sb = create_sb(device, max_chunk_val * 4)
    const subtask_idx_sb = create_and_write_sb(device, numbers_to_u8s_for_gpu([subtask_idx]))

    const bindGroupLayout = create_bind_group_layout(
        device,
        [
            'read-only-storage', 'read-only-storage', 
            'storage', 'storage', 'storage', 'storage',
        ]
    )

    // Reuse the output buffer from the scalar decomp step as one of the input buffers
    const bindGroup = create_bind_group(
        device,
        bindGroupLayout,
        [
            scalar_chunks_sb,
            subtask_idx_sb,
            cluster_and_new_point_indices_sb,
            map_sb,
            overflow_sb,
            keys_sb
        ],
    )

    const computePipeline = await create_compute_pipeline(
        device,
        [bindGroupLayout],
        shader_code,
        'main',
    )

    execute_pipeline(commandEncoder, computePipeline, bindGroup, num_x_workgroups, num_y_workgroups, 1);

    if (debug) {
        const data = await read_from_gpu(
            device,
            commandEncoder,
            [
                cluster_and_new_point_indices_sb,
                scalar_chunks_sb,
                map_sb,
            ],
        )

        const [
            cluster_and_new_point_indices,
            scalar_chunks,
        ] = data.map(u8s_to_numbers_32)

        verify_gpu_precompute_output(
            input_size,
            subtask_idx,
            num_subtasks,
            max_cluster_size,
            overflow_size,
            scalar_chunks,
            cluster_and_new_point_indices,
        )
    }

    return { cluster_and_new_point_indices_sb }
}

const verify_gpu_precompute_output = (
    input_size: number,
    subtask_idx: number,
    num_subtasks: number,
    max_cluster_size: number,
    overflow_size: number,
    scalar_chunks: number[],
    cluster_and_new_point_indices: number[],
) => {
    const num_chunks = input_size / num_subtasks

    const cluster_indices: number[] = cluster_and_new_point_indices.slice(0, num_chunks)
    const new_point_indices: number[] = cluster_and_new_point_indices.slice(num_chunks, num_chunks * 2)

    // During testing
    if (scalar_chunks.length < input_size) {
        const pad = Array(subtask_idx * num_chunks).fill(0)
        scalar_chunks = pad.concat(scalar_chunks)
    }

    const scalar_chunks_for_this_subtask = scalar_chunks.slice(
        subtask_idx * num_chunks,
        subtask_idx * num_chunks + num_chunks,
    )

    // Check that the values in new_point_indices can be used to reconstruct a
    // list of scalar chunks which, when sorted, match the sorted scalar chunks
    const reconstructed = Array(num_chunks).fill(0)

    for (let i = 0; i < num_chunks; i ++) {
        if (i > 0 && new_point_indices[i] === 0) {
            break
        }
        reconstructed[i] = scalar_chunks[new_point_indices[i]]
    }

    const sc_copy = scalar_chunks_for_this_subtask.map((x) => Number(x))
    const r_copy = reconstructed.map((x) => Number(x))
    sc_copy.sort((a, b) => a - b)
    r_copy.sort((a, b) => a - b)

    assert(sc_copy.toString() === r_copy.toString(), 'new_point_indices invalid')

    // Ensure that cluster_start_indices and cluster_end_indices have
    // the correct structure and that the cluster start- and end- indices
    // respect max_cluster_size 
    let start = 0
    for (let i = 0; i < cluster_indices.length - 1; i ++) {
        if (cluster_indices[i] === 0) {
            break
        }
        const end = cluster_indices[i]
        assert(start <= end, `invalid cluster index at ${i}`)
        assert(end - start <= max_cluster_size)
        start = end
    }
 
    // Generate random "points" and compute their linear combination
    // without any preaggregation, then compare the result using an algorithm
    // that uses preaggregation first
    const random_points: bigint[] = []
    for (let i = 0; i < input_size; i ++) {
        //const r = BigInt(Math.floor(Math.random() * 100000000))
        const r = BigInt(1)
        random_points.push(r)
    }

    // Calcualte the linear combination naively
    let lc_result = BigInt(0)
    for (let i = 0; i < num_chunks; i ++) {
        const prod = BigInt(scalar_chunks_for_this_subtask[i]) * random_points[i]
        lc_result += BigInt(prod)
    }

    // Calculate the linear combination with preaggregation
    let preagg_result = BigInt(0)
    let start_idx = 0
    for (let i = 0; i < cluster_indices.length - 1; i ++) {
        const end_idx = cluster_indices[i]

        if (end_idx === 0) {
            break
        }

        let point = BigInt(0)

        for (let idx = start_idx; idx < end_idx; idx ++) {
            point += BigInt(random_points[new_point_indices[idx]])
        }

        preagg_result += point * BigInt(scalar_chunks[new_point_indices[start_idx]])
        start_idx = end_idx
    }

    assert(preagg_result === lc_result, 'result mismatch')
}

export const pre_aggregation_stage_1_gpu = async (
    shader_code: string,
    preaggregation_stage_1_y_workgroups: number,
    device: GPUDevice,
    commandEncoder: GPUCommandEncoder,
    input_size: number,
    point_x_sb: GPUBuffer,
    point_y_sb: GPUBuffer,
    new_point_x_sb: GPUBuffer,
    new_point_y_sb: GPUBuffer,
    new_point_t_sb: GPUBuffer,
    new_point_z_sb: GPUBuffer,
    cluster_and_new_point_indices_sb: GPUBuffer,
    num_chunks: number,
    debug = false,
): Promise<{
    new_point_x_sb: GPUBuffer,
    new_point_y_sb: GPUBuffer,
    new_point_t_sb: GPUBuffer,
    new_point_z_sb: GPUBuffer,
}> => {
    const bindGroupLayout = create_bind_group_layout(
        device,
        [
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
            point_x_sb,
            point_y_sb,
            cluster_and_new_point_indices_sb,
            new_point_x_sb,
            new_point_y_sb,
            new_point_t_sb,
            new_point_z_sb,
        ],
    )

    const computePipeline = await create_compute_pipeline(
        device,
        [bindGroupLayout],
        shader_code,
        'main',
    )

    const num_x_workgroups = 256
    const num_y_workgroups = preaggregation_stage_1_y_workgroups
    execute_pipeline(commandEncoder, computePipeline, bindGroup, num_x_workgroups, num_y_workgroups, 1)

    if (debug) {
        const data = await read_from_gpu(
            device,
            commandEncoder,
            [
                point_x_sb,
                point_y_sb,
                cluster_and_new_point_indices_sb,
                new_point_x_sb,
                new_point_y_sb,
                new_point_t_sb,
                new_point_z_sb,
            ],
        )

        const point_x = u8s_to_bigints(data[0], num_words, word_size)
        const point_y = u8s_to_bigints(data[1], num_words, word_size)
        const cluster_and_new_point_indices = u8s_to_numbers(data[2])
        const new_point_x = u8s_to_bigints(data[3], num_words, word_size)
        const new_point_y = u8s_to_bigints(data[4], num_words, word_size)
        const new_point_t = u8s_to_bigints(data[5], num_words, word_size)
        const new_point_z = u8s_to_bigints(data[6], num_words, word_size)

        verify_preagg_stage_1(
            point_x,
            point_y,
            cluster_and_new_point_indices,
            new_point_x,
            new_point_y,
            new_point_t,
            new_point_z,
            num_chunks,
        )
    }

    return {
        new_point_x_sb,
        new_point_y_sb,
        new_point_t_sb,
        new_point_z_sb,
    }
}

const verify_preagg_stage_1 = (
    point_x: bigint[],
    point_y: bigint[],
    cluster_and_new_point_indices: number[],
    new_point_x: bigint[],
    new_point_y: bigint[],
    new_point_t: bigint[],
    new_point_z: bigint[],
    num_chunks: number,
) => {
    assert(point_x.length === point_y.length)
    assert(cluster_and_new_point_indices.length === num_chunks * 2)

    const points = construct_points_from_affine(point_x, point_y)

    const cluster_indices = cluster_and_new_point_indices.slice(0, num_chunks)
    const new_point_indices = cluster_and_new_point_indices.slice(num_chunks)

    const expected: ExtPointType[] = []
    for (let i = 0; i < cluster_indices.length - 1; i ++) {
        const start = cluster_indices[i]
        const end = cluster_indices[i + 1]
        let acc = points[new_point_indices[start]]
        for (let j = start + 1; j < end; j ++) {
            acc = acc.add(points[new_point_indices[j]])
        }
        expected.push(acc)
    }

    const new_points = construct_points(new_point_x, new_point_y, new_point_t, new_point_z)
    for (let i = 0; i < expected.length; i ++) {
        const n = new_points[i].toAffine()
        const m = expected[i].toAffine()
        assert(n.x === m.x && n.y === m.y, `mismatch at ${i}`)
    }
}

export const pre_aggregation_stage_2_gpu = async (
    shader_code: string,
    preaggregation_stage_2_y_workgroups: number,
    device: GPUDevice,
    commandEncoder: GPUCommandEncoder,
    num_chunks: number,
    scalar_chunks_sb: GPUBuffer,
    cluster_and_new_point_indices_sb: GPUBuffer,
    debug = false,
): Promise<GPUBuffer> => {
    // TODO: new_scalar_chunks_sb should be reused instead of created every
    // iteration
    const new_scalar_chunks_sb = create_sb(device, num_chunks * 4)

    const bindGroupLayout = create_bind_group_layout(
        device,
        [
            'read-only-storage',
            'read-only-storage',
            'storage',
        ],
    )

    const bindGroup = create_bind_group(
        device,
        bindGroupLayout,
        [
            scalar_chunks_sb,
            cluster_and_new_point_indices_sb,
            new_scalar_chunks_sb,
        ],
    )

    const computePipeline = await create_compute_pipeline(
        device,
        [bindGroupLayout],
        shader_code,
        'main',
    )

    const num_x_workgroups = 256
    const num_y_workgroups = preaggregation_stage_2_y_workgroups
    execute_pipeline(commandEncoder, computePipeline, bindGroup, num_x_workgroups, num_y_workgroups, 1)
    
    if (debug) {
        const data = await read_from_gpu(
            device,
            commandEncoder,
            [
                new_scalar_chunks_sb,
                cluster_and_new_point_indices_sb,
                scalar_chunks_sb,
            ],
        )
        const nums = data.map(u8s_to_numbers_32)
        const new_scalar_chunks = nums[0]
        const cluster_and_new_point_indices = nums[1]
        const scalar_chunks = nums[2]

        // TODO: write code to verify, but this may not be needed if the
        // verification code for the transpose shader passes
        debugger
    }

    return new_scalar_chunks_sb
}

const compute_row_ptr = async (
    shader_code: string,
    compute_row_ptr_workgroup_size: number,
    compute_row_ptr_y_workgroups: number,
    device: GPUDevice,
    commandEncoder: GPUCommandEncoder,
    input_size: number,
    num_subtasks: number,
    num_rows_per_subtask: number,
    cluster_and_new_point_indices_sb: GPUBuffer,
    debug = false,
): Promise<GPUBuffer> => {
    /*
    const test_new_point_indices = [0, 2, 1, 3, 4, 5, 6, 0]
    new_point_indices_sb = create_and_write_sb(device, numbers_to_u8s_for_gpu(test_new_point_indices))
    input_size = test_new_point_indices.length
    num_subtasks = 1
    num_rows_per_subtask = 4
    */

    const row_ptr_sb = create_sb(device, (num_rows_per_subtask + 1) * 4)
    const num_chunks = input_size / num_subtasks
    const max_row_size = num_chunks / num_rows_per_subtask

    const bindGroupLayout = create_bind_group_layout(
        device,
        [
            'read-only-storage',
            'storage',
        ],
    )

    const bindGroup = create_bind_group(
        device,
        bindGroupLayout,
        [
            cluster_and_new_point_indices_sb,
            row_ptr_sb,
        ],
    )

    const computePipeline = await create_compute_pipeline(
        device,
        [bindGroupLayout],
        shader_code,
        'main',
    )

    const num_x_workgroups = 1
    const num_y_workgroups = compute_row_ptr_y_workgroups
    execute_pipeline(commandEncoder, computePipeline, bindGroup, num_x_workgroups, num_y_workgroups, 1)

    if (debug) {
        const data = await read_from_gpu(
            device,
            commandEncoder,
            [ cluster_and_new_point_indices_sb, row_ptr_sb ],
        )
        
        const cluster_and_new_point_indices = u8s_to_numbers(data[0])
        const row_ptr = u8s_to_numbers(data[1])

        console.log("row_ptr is: ", row_ptr)

        // Verify
        const expected: number[] = [0]
        for (let i = 0; i < num_chunks; i += max_row_size) {
            let j = 0
            if (i === 0) {
                j = 1
            }
            for (; j < max_row_size; j ++) {
                if (cluster_and_new_point_indices[num_chunks + i + j] === 0) {
                    break
                }
            }
            expected.push(expected[expected.length - 1] + j)
        }

        assert(row_ptr.toString() === expected.toString(), `row_ptr mismatch`)
    }

    return row_ptr_sb
}

const construct_points = (
    x_coords: bigint[],
    y_coords: bigint[],
    t_coords: bigint[],
    z_coords: bigint[],
) => {
    const points: ExtPointType[] = []
    for (let i = 0; i < x_coords.length; i ++) {
        const pt = fieldMath.createPoint(
            fieldMath.Fp.mul(x_coords[i], rinv),
            fieldMath.Fp.mul(y_coords[i], rinv),
            fieldMath.Fp.mul(t_coords[i], rinv),
            fieldMath.Fp.mul(z_coords[i], rinv),
        )
        pt.assertValidity()
        points.push(pt)
    }
    return points
}

const construct_points_from_affine = (
    x_coords: bigint[],
    y_coords: bigint[],
) => {
    const points: ExtPointType[] = []
    for (let i = 0; i < x_coords.length; i ++) {
        const x = fieldMath.Fp.mul(x_coords[i], rinv)
        const y = fieldMath.Fp.mul(y_coords[i], rinv)
        const t = fieldMath.Fp.mul(x, y)
        const pt = fieldMath.createPoint(x, y, t, BigInt(1))
        pt.assertValidity()
        points.push(pt)
    }
    return points
}

export const transpose_gpu = async (
    shader_code: string,
    device: GPUDevice,
    commandEncoder: GPUCommandEncoder,
    num_rows_per_subtask: number,
    num_cols: number,
    csr_row_ptr_sb: GPUBuffer,
    new_scalar_chunks_sb: GPUBuffer,
    debug = false,
): Promise<any> => {
    /*
     * n = width
     * m = height
     * nnz = number of nonzero elements
     *
     * Given: 
     *   - csr_col_idx (nnz)
     *   - csr_row_ptr (m + 1)
     *
     * Output the transpose of the above:
     *   - csc_row_idx (nnz)
     *   - csc_col_ptr (n + 1)
     *   - csc_vals (nnz)
     *
     * num_inputs = 65536
     * num_subtasks = 16
     * new_scalar_chunks_sb = 4096
     * num_rows_per_subtask = 16
     */
    const csc_col_ptr_sb = create_sb(device, (num_cols + 1) * 4)
    const csc_row_idx_sb = create_sb(device, new_scalar_chunks_sb.size)
    const csc_val_idxs_sb = create_sb(device, new_scalar_chunks_sb.size)
    const curr_sb = create_sb(device, num_cols * 4)

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

    const computePipeline = await create_compute_pipeline(
        device,
        [bindGroupLayout],
        shader_code,
        'main',
    )

    execute_pipeline(commandEncoder, computePipeline, bindGroup, num_x_workgroups, num_y_workgroups, 1)

    if (debug) {
        const data = await read_from_gpu(
            device,
            commandEncoder,
            [csc_col_ptr_sb, csc_row_idx_sb, csc_val_idxs_sb, csr_row_ptr_sb, new_scalar_chunks_sb],
        )
    
        const csc_col_ptr_result = u8s_to_numbers_32(data[0])
        const csc_row_idx_result = u8s_to_numbers_32(data[1])
        const csc_val_idxs_result = u8s_to_numbers_32(data[2])
        const csr_row_ptr = u8s_to_numbers_32(data[3])
        const new_scalar_chunks = u8s_to_numbers_32(data[4])

        // Verify the output of the shader
        const expected = cpu_transpose(csr_row_ptr, new_scalar_chunks, num_cols)
        assert(expected.csc_vals.toString() === csc_val_idxs_result.toString())
        assert(expected.csc_col_ptr.toString() === csc_col_ptr_result.toString())
        assert(expected.csc_row_idx.toString() === csc_row_idx_result.toString())
    }

    return csr_row_ptr_sb
}
