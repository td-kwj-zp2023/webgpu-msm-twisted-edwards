import { spawn, Thread, Worker } from 'threads';
import { CSRSparseMatrix } from '../../matrices/matrices'; 
import { BigIntPoint } from "../../../reference/types"
import { ExtPointType } from "@noble/curves/abstract/edwards";

export const webWorkers = async (csr_sparse_matrix: CSRSparseMatrix): Promise<ExtPointType> => {
    // Spawn web workers
    const worker = await spawn(new Worker('./webworkers.js'));
    const result: ExtPointType = await worker(csr_sparse_matrix.data, csr_sparse_matrix.col_idx, csr_sparse_matrix.row_ptr);
    await Thread.terminate(worker);
    return result;
}

export const convertInputsToBytesWorker = async (
    baseAffinePoints: BigIntPoint[],
    scalars: bigint[]
): Promise<{ x_y_coords_bytes: Uint8Array, scalars_bytes: Uint8Array }> => {
    // Spawn web workers
    const worker = await spawn(new Worker('./convert_inputs_worker.js'));
    const result = await worker(baseAffinePoints, scalars);
    await Thread.terminate(worker);
    return result;
}

export const precompileShadersWorker = async (
    convert_point_coords_shader: string,
    convert_point_coords_y_workgroups: number,
    decompose_scalars_shader: string,
    decompose_scalars_y_workgroups: number,
    csr_precompute_shader: string,
    preaggregation_stage_1_shader: string,
    preaggregation_stage_1_y_workgroups: number,
) => {
    const worker = await spawn(new Worker('./precompile_shaders_worker.js'));
    const result = await worker(
        convert_point_coords_shader,
        convert_point_coords_y_workgroups,
        decompose_scalars_shader,
        decompose_scalars_y_workgroups,
        csr_precompute_shader,
        preaggregation_stage_1_shader,
        preaggregation_stage_1_y_workgroups,
    )
    await Thread.terminate(worker);
    return result;
}
