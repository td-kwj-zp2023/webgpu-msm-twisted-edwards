import { expose } from 'threads/worker';
import { precompile_shaders } from '../precompile_shaders'

export async function precompile_shaders_worker(
    convert_point_coords_shader: string,
    convert_point_coords_y_workgroups: number,
    decompose_scalars_shader: string,
    decompose_scalars_y_workgroups: number,
    csr_precompute_shader: string,
    preaggregation_stage_1_shader: string,
    preaggregation_stage_1_y_workgroups: number,
) {
    await precompile_shaders(
        convert_point_coords_shader,
        convert_point_coords_y_workgroups,
        decompose_scalars_shader,
        decompose_scalars_y_workgroups,
        csr_precompute_shader,
        preaggregation_stage_1_shader,
        preaggregation_stage_1_y_workgroups,
    )
}

expose(precompile_shaders_worker)
