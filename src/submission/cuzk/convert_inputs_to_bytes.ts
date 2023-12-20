import { bigints_to_u8_for_gpu } from '../utils'
import { BigIntPoint } from "../../reference/types"

export const convert_inputs_to_bytes = (
    baseAffinePoints: BigIntPoint[],
    scalars: bigint[]
) => {
    const input_size = baseAffinePoints.length
    // An affine point only contains X and Y points.
    const x_y_coords = Array(input_size * 2).fill(BigInt(0))
    for (let i = 0; i < input_size; i ++) {
        x_y_coords[i * 2] = baseAffinePoints[i].x
        x_y_coords[i * 2 + 1] = baseAffinePoints[i].y
    }

    // Convert points to bytes (performs ~2x faster than
    // `bigints_to_16_bit_words_for_gpu`)
    const x_y_coords_bytes = bigints_to_u8_for_gpu(x_y_coords, 16, 16)
    const scalars_bytes = bigints_to_u8_for_gpu(scalars, 16, 16)

    return { x_y_coords_bytes, scalars_bytes }
}

