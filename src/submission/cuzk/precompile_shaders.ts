import {
    get_device,
    create_and_write_sb,
    create_bind_group,
    create_bind_group_layout,
    create_compute_pipeline,
    create_sb,
    execute_pipeline,
} from '../gpu'

export const precompile_shaders = async (
    convert_point_coords_shader: string,
    convert_point_coords_y_workgroups: number,
    decompose_scalars_shader: string,
    decompose_scalars_y_workgroups: number,
    csr_precompute_shader: string,
    preaggregation_stage_1_shader: string,
    preaggregation_stage_1_y_workgroups: number,
) => {
    const device = await get_device()
    const commandEncoder = device.createCommandEncoder()

    // Precompile convert_point_coords_shader
    const x_y_coords_sb = create_and_write_sb(device, new Uint8Array([0, 0, 0, 0]))
    const point_x_y_sb = create_sb(device, 4)
    const point_t_z_sb = create_sb(device, 4)
    let bindGroupLayout = create_bind_group_layout(
        device,
        [ 'read-only-storage', 'storage', 'storage' ],
    )
    let bindGroup = create_bind_group(
        device,
        bindGroupLayout,
        [ x_y_coords_sb, point_x_y_sb, point_t_z_sb ],
    )
    let computePipeline = await create_compute_pipeline(
        device,
        [bindGroupLayout],
        convert_point_coords_shader,
        'main',
    )
    const num_x_workgroups = 1
    const num_y_workgroups = convert_point_coords_y_workgroups
    execute_pipeline(commandEncoder, computePipeline, bindGroup, num_x_workgroups, num_y_workgroups, 1)

    // Precompile decompose_scalars_shader
    const scalars_sb = create_and_write_sb(device, new Uint8Array([0, 0, 0, 0]))
    const chunks_sb = create_sb(device, 4)
    bindGroupLayout = create_bind_group_layout(
        device,
        ['read-only-storage', 'storage'],
    )
    bindGroup = create_bind_group(
        device,
        bindGroupLayout,
        [scalars_sb, chunks_sb],
    )
    computePipeline = await create_compute_pipeline(
        device,
        [bindGroupLayout],
        decompose_scalars_shader,
        'main',
    )
    execute_pipeline(commandEncoder, computePipeline, bindGroup, 256, decompose_scalars_y_workgroups, 1)

    // Precompile precomputation shader
    const new_point_indices_sb = create_sb(device, 4)
    const cluster_start_indices_sb = create_sb(device, 4)
    const cluster_end_indices_sb = create_sb(device, 4)
    const map_sb = create_sb(device, 4)
    const overflow_sb = create_sb(device, 4)
    const keys_sb = create_sb(device, 4)
    const subtask_idx_sb = create_and_write_sb(device, new Uint8Array([0, 0, 0, 0]))

    bindGroupLayout = create_bind_group_layout(
        device,
        [
            'read-only-storage', 'read-only-storage', 'storage', 'storage',
            'storage', 'storage', 'storage', 'storage',
        ]
    )
    bindGroup = create_bind_group(
        device,
        bindGroupLayout,
        [
            chunks_sb,
            subtask_idx_sb,
            new_point_indices_sb,
            cluster_start_indices_sb,
            cluster_end_indices_sb,
            map_sb,
            overflow_sb,
            keys_sb
        ],
    )

    computePipeline = await create_compute_pipeline(
        device,
        [bindGroupLayout],
        csr_precompute_shader,
        'main',
    )

    execute_pipeline(commandEncoder, computePipeline, bindGroup, 1, 1, 1)

    // Precompile the preaggregation_stage_1 shader
    const new_point_x_y_sb = create_sb(device, 4)
    const new_point_t_z_sb = create_sb(device, 4)

    bindGroupLayout = create_bind_group_layout(
        device,
        [
            'read-only-storage', 'read-only-storage',
            'read-only-storage', 'read-only-storage',
            'read-only-storage',
            'storage',
            'storage',
        ],
    )
    bindGroup = create_bind_group(
        device,
        bindGroupLayout,
        [
            point_x_y_sb,
            point_t_z_sb,
            new_point_indices_sb,
            cluster_start_indices_sb,
            cluster_end_indices_sb,
            new_point_x_y_sb,
            new_point_t_z_sb,
        ],
    )
    computePipeline = await create_compute_pipeline(
        device,
        [bindGroupLayout],
        preaggregation_stage_1_shader,
        'main',
    )

    execute_pipeline(commandEncoder, computePipeline, bindGroup, 256, preaggregation_stage_1_y_workgroups, 1)

    device.destroy()
}
