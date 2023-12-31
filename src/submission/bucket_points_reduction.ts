import assert from 'assert'
import {
    create_and_write_ub,
    create_bind_group,
    create_bind_group_layout,
    create_compute_pipeline,
    execute_pipeline,
} from './gpu'
import { numbers_to_u8s_for_gpu } from './utils'

export const shader_invocation = async (
    device: GPUDevice,
    commandEncoder: GPUCommandEncoder,
    shaderCode: string,
    x_coords_sb: GPUBuffer,
    y_coords_sb: GPUBuffer,
    t_coords_sb: GPUBuffer,
    z_coords_sb: GPUBuffer,
    out_x_sb: GPUBuffer,
    out_y_sb: GPUBuffer,
    out_t_sb: GPUBuffer,
    out_z_sb: GPUBuffer,
    num_points: number,
    num_words: number,
) => {
    assert(num_points <= 2 ** 16)


    const num_points_bytes = numbers_to_u8s_for_gpu([num_points])
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
            'uniform',
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
            num_points_sb,
        ]
    )

    const computePipeline = await create_compute_pipeline(
        device,
        [bindGroupLayout],
        shaderCode,
        'main',
    )

    const num_x_workgroups = 256
    const num_y_workgroups = 256

    execute_pipeline(commandEncoder, computePipeline, bindGroup, num_x_workgroups, num_y_workgroups, 1);

    const size = Math.ceil(num_points / 2) * 4 * num_words
    commandEncoder.copyBufferToBuffer(out_x_sb, 0, x_coords_sb, 0, size)
    commandEncoder.copyBufferToBuffer(out_y_sb, 0, y_coords_sb, 0, size)
    commandEncoder.copyBufferToBuffer(out_t_sb, 0, t_coords_sb, 0, size)
    commandEncoder.copyBufferToBuffer(out_z_sb, 0, z_coords_sb, 0, size)

    return {
        out_x_sb,
        out_y_sb,
        out_t_sb,
        out_z_sb,
        num_points_sb,
    }
}
