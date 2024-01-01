import assert from 'assert'
import mustache from 'mustache'
import { BigIntPoint } from "../reference/types"
import { FieldMath } from "../reference/utils/FieldMath";
import {
    get_device,
    create_and_write_sb,
    create_bind_group,
    create_bind_group_layout,
    create_compute_pipeline,
    create_sb,
    read_from_gpu,
    execute_pipeline,
    create_and_write_ub,
} from './gpu'
import structs from './wgsl/struct/structs.template.wgsl'
import bigint_funcs from './wgsl/bigint/bigint.template.wgsl'
import field_funcs from './wgsl/field/field.template.wgsl'
import ec_funcs from './wgsl/curve/ec.template.wgsl'
import curve_parameters from './wgsl/curve/parameters.template.wgsl'
import montgomery_product_funcs from './wgsl/montgomery/mont_pro_product.template.wgsl'
import bucket_points_reduction_shader from './wgsl/bucket_points_reduction.template.wgsl'
import { are_point_arr_equal, compute_misc_params, u8s_to_bigints, numbers_to_u8s_for_gpu, gen_p_limbs, bigints_to_u8_for_gpu } from './utils'
import running_sum_shader from './wgsl/running_sum.template.wgsl'

export const running_sum_benchmark = async (
    baseAffinePoints: BigIntPoint[],
    scalars: bigint[]
): Promise<{x: bigint, y: bigint}> => {
    console.log("entered running_sum_benchmark!")
    await running_sum(baseAffinePoints, baseAffinePoints.length)
    return { x: BigInt(0), y: BigInt(0) }
}

export const running_sum = async (
    baseAffinePoints: BigIntPoint[],
    input_size: number,
) => {
    console.log("entered running_sum!")

    assert(baseAffinePoints.length >= input_size)

    const fieldMath = new FieldMath()
    const p = BigInt('0x12ab655e9a2ca55660b44d1e5c37b00159aa76fed00000010a11800000000001')
    const word_size = 13

    const params = compute_misc_params(p, word_size)
    const n0 = params.n0
    const num_words = params.num_words
    const r = params.r
    const rinv = params.rinv
    const p_limbs = gen_p_limbs(p, num_words, word_size)

    const x_coords: bigint[] = []
    const y_coords: bigint[] = []
    const t_coords: bigint[] = []
    const z_coords: bigint[] = []
    for (const pt of baseAffinePoints.slice(0, input_size)) {
        x_coords.push(fieldMath.Fp.mul(pt.x, r))
        y_coords.push(fieldMath.Fp.mul(pt.y, r))
        t_coords.push(fieldMath.Fp.mul(pt.t, r))
        z_coords.push(fieldMath.Fp.mul(pt.z, r))
    }

    const points = baseAffinePoints.slice(0, input_size).map((x) => fieldMath.createPoint(x.x, x.y, x.t, x.z))

    const start_cpu = Date.now()
    let expected = points[0]
    for (let i = 1; i < points.length; i ++) {
        expected  = expected.add(points[i])
    }

    const elapsed_cpu = Date.now() - start_cpu
    console.log(`CPU took ${elapsed_cpu}ms to sum ${input_size} points serially`)

    const device = await get_device()
    const commandEncoder = device.createCommandEncoder()

    const x_coords_bytes = bigints_to_u8_for_gpu(x_coords, num_words, word_size)
    const y_coords_bytes = bigints_to_u8_for_gpu(y_coords, num_words, word_size)
    const t_coords_bytes = bigints_to_u8_for_gpu(t_coords, num_words, word_size)
    const z_coords_bytes = bigints_to_u8_for_gpu(z_coords, num_words, word_size)

    const x_coords_sb = create_and_write_sb(device, x_coords_bytes)
    const y_coords_sb = create_and_write_sb(device, y_coords_bytes)
    const t_coords_sb = create_and_write_sb(device, t_coords_bytes)
    const z_coords_sb = create_and_write_sb(device, z_coords_bytes)
    const out_x_sb = create_sb(device, 80)
    const out_y_sb = create_sb(device, 80)
    const out_t_sb = create_sb(device, 80)
    const out_z_sb = create_sb(device, 80)

    const start = Date.now()

    const shaderCode = mustache.render(
        running_sum_shader,
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

    assert(input_size <= 2 ** 16)

    const num_points_bytes = numbers_to_u8s_for_gpu([input_size])
    const num_points_sb = create_and_write_ub(device, num_points_bytes)

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
            x_coords_sb,
            y_coords_sb,
            t_coords_sb,
            z_coords_sb,
            out_x_sb,
            out_y_sb,
            out_t_sb,
            out_z_sb,
        ]
    )

    const computePipeline = await create_compute_pipeline(
        device,
        [bindGroupLayout],
        shaderCode,
        'main',
    )

    const num_x_workgroups = 1
    const num_y_workgroups = 1

    execute_pipeline(commandEncoder, computePipeline, bindGroup, num_x_workgroups, num_y_workgroups, 1);

    const data = await read_from_gpu(
        device,
        commandEncoder,
        [
            out_x_sb,
            out_y_sb,
            out_t_sb,
            out_z_sb,
        ],
        320
    )

    const elapsed = Date.now() - start
    console.log(`Running-Sum GPU shader for ${input_size} points took ${elapsed}ms`)

    const x_mont_coords_result = u8s_to_bigints(data[0], num_words, word_size)
    const y_mont_coords_result = u8s_to_bigints(data[1], num_words, word_size)
    const t_mont_coords_result = u8s_to_bigints(data[2], num_words, word_size)
    const z_mont_coords_result = u8s_to_bigints(data[3], num_words, word_size)

    const result = fieldMath.createPoint(
        fieldMath.Fp.mul(x_mont_coords_result[0], rinv),
        fieldMath.Fp.mul(y_mont_coords_result[0], rinv),
        fieldMath.Fp.mul(t_mont_coords_result[0], rinv),
        fieldMath.Fp.mul(z_mont_coords_result[0], rinv),
    )

    device.destroy()
}
