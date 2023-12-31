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
} from './gpu'
import structs from './wgsl/struct/structs.template.wgsl'
import bigint_funcs from './wgsl/bigint/bigint.template.wgsl'
import field_funcs from './wgsl/field/field.template.wgsl'
import ec_funcs from './wgsl/curve/ec.template.wgsl'
import curve_parameters from './wgsl/curve/parameters.template.wgsl'
import montgomery_product_funcs from './wgsl/montgomery/mont_pro_product.template.wgsl'
import bucket_points_reduction_shader from './wgsl/bucket_points_reduction.template.wgsl'
import { are_point_arr_equal, compute_misc_params, u8s_to_bigints, numbers_to_u8s_for_gpu, gen_p_limbs, bigints_to_u8_for_gpu } from './utils'
import { shader_invocation } from './bucket_points_reduction'

export const bucket_points_reduction = async (
    baseAffinePoints: BigIntPoint[],
    scalars: bigint[]
): Promise<{x: bigint, y: bigint}> => {
    //for (let i = 2; i < 64; i ++) {
        //await test_bucket_points_reduction(baseAffinePoints, i)
    //}
    await test_bucket_points_reduction(baseAffinePoints, baseAffinePoints.length)
    return { x: BigInt(0), y: BigInt(0) }
}

export const test_bucket_points_reduction = async (
    baseAffinePoints: BigIntPoint[],
    input_size: number,
) => {
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
    const out_x_sb = create_sb(device, x_coords_sb.size)
    const out_y_sb = create_sb(device, y_coords_sb.size)
    const out_t_sb = create_sb(device, y_coords_sb.size)
    const out_z_sb = create_sb(device, z_coords_sb.size)

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

    let num_invocations = 0
    let s = input_size
    console.log("x_coords_sb size: ", x_coords_sb.size)
    console.log("y_coords_sb size: ", y_coords_sb.size)
    console.log("t_coords_sb size: ", t_coords_sb.size)
    console.log("z_coords_sb size: ", z_coords_sb.size)
    const start = Date.now()
    while (s > 1) {
        await shader_invocation(
            device,
            commandEncoder,
            shaderCode,
            x_coords_sb,
            y_coords_sb,
            t_coords_sb,
            z_coords_sb,
            out_x_sb,
            out_y_sb,
            out_t_sb,
            out_z_sb,
            s,
            num_words,
        )
        num_invocations ++

        const e = s
        s = Math.ceil(s / 2)
        if (e === 1 && s === 1) {
            break
        }
    }
    const elapsed = Date.now() - start
    console.log(`${num_invocations} GPU invocations of the point reduction shader for ${input_size} points took ${elapsed}ms`)

    const data = await read_from_gpu(
        device,
        commandEncoder,
        [
            out_x_sb,
            out_y_sb,
            out_t_sb,
            out_z_sb,
        ]
    )

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

    //console.log('result:', result)
    //console.log('result.isAffine():', result.toAffine())
    //console.log('expected.isAffine():', expected.toAffine())
    assert(are_point_arr_equal([result], [expected]))

    device.destroy()
}
