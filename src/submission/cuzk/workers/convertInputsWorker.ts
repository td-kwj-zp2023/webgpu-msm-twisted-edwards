import { expose } from 'threads/worker';
import { convert_inputs_to_bytes } from '../convert_inputs_to_bytes'
import { BigIntPoint } from "../../../reference/types"

export async function convert_inputs_to_bytes_worker(
    baseAffinePoints: BigIntPoint[],
    scalars: bigint[]
): Promise<{ x_y_coords_bytes: Uint8Array, scalars_bytes: Uint8Array }> {
    return convert_inputs_to_bytes(baseAffinePoints, scalars)
}

expose(convert_inputs_to_bytes_worker)
