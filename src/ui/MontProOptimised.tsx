import {
    compute_misc_params,
    genRandomFieldElement,
    from_words_le,
    gen_p_limbs,
    bigints_to_u8_for_gpu,
} from '../submission/utils'
import shader from '../submission/wgsl/mont_pro_optimised.template.wgsl'
import bigint_struct from '../submission/wgsl/structs/bigint.template.wgsl'
import montgomery_product_func from '../submission/wgsl/montgomery_product.template.wgsl'

//import { our_msm } from '../submission/entries/entry'
import React, { useEffect } from 'react';

import mustache from 'mustache'

export const MontProOptimised: React.FC = () => {
    useEffect(() => {
        async function mont_mul() {
            // Define and generate params
            const num_inputs = 1
            const num_x_workgroups = 1
            const cost = 8192

            const p = BigInt('0x12ab655e9a2ca55660b44d1e5c37b00159aa76fed00000010a11800000000001')

            const expensive_computation = (
                a: bigint,
                b: bigint,
                r: bigint,
                cost: number,
            ): bigint => {
                const c = a ** BigInt(cost)
                return (c * b * r) % p
            }

            const num_runs = 5

            const timings: any = {}

            for (let word_size = 12; word_size < 14; word_size ++) {
                timings[word_size] = []

                const misc_params = compute_misc_params(p, word_size)
                const num_words = misc_params.num_words
                const n0 = misc_params.n0
                const mask = BigInt(2) ** BigInt(word_size) - BigInt(1)
                const r = misc_params.r

                //console.log(
                    //`Limb size: ${word_size}, Number of limbs: ${num_words}, ` +
                    //`N: ${word_size * num_words}, ` + 
                    //`Max terms: ${misc_params.max_terms}, k: ${misc_params.k}, ` +
                    //`nSafe: ${misc_params.nsafe}`
                //)
                console.log(`Performing ${num_inputs} (a ^ ${cost} * b * r) (using MontProOptimised) with ${word_size}-bit limbs over ${num_words} runs on ${num_x_workgroups} workgroups`)

                const p_limbs = gen_p_limbs(p, num_words, word_size)

                const shaderCode = mustache.render(
                    shader,
                    {
                        num_words,
                        word_size,
                        n0,
                        mask,
                        cost,
                        p_limbs,
                    },
                    {
                        bigint_struct,
                        montgomery_product_func,
                    }
                )
                //console.log(shaderCode)

                for (let run = 0; run < num_runs; run ++) {
                    const expected: bigint[] = []
                    const inputs: bigint[] = []

                    // Generate random inputs
                    for (let i = 0; i < num_inputs; i ++) {
                        const a = genRandomFieldElement(p)
                        const b = genRandomFieldElement(p)
                        const ar = (a * r) % p
                        const br = (b * r) % p

                        inputs.push(ar)
                        inputs.push(br)

                        expected.push(expensive_computation(a, b, r, cost))
                    }

                    const input_bytes = bigints_to_u8_for_gpu(inputs, num_words, word_size)

                    const gpuErrMsg = "Please use a browser that has WebGPU enabled.";
                    const adapter = await navigator.gpu.requestAdapter({
                        powerPreference: 'high-performance',
                    });
                    if (!adapter) {
                        console.log(gpuErrMsg)
                        throw Error('Couldn\'t request WebGPU adapter.')
                    }

                    const device = await adapter.requestDevice()

                    // 2: Create a shader module from the shader template literal
                    const shaderModule = device.createShaderModule({
                        code: shaderCode
                    })

                    const a_storage_buffer = device.createBuffer({
                        size: input_bytes.length,
                        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST
                    });
                    device.queue.writeBuffer(a_storage_buffer, 0, input_bytes);


                    const stagingBuffer = device.createBuffer({
                        size: input_bytes.length,
                        usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST
                    });

                    const bindGroupLayout = device.createBindGroupLayout({
                        entries: [
                            {
                                binding: 0,
                                visibility: GPUShaderStage.COMPUTE,
                                buffer: {
                                    type: "storage"
                                },
                            },
                        ]
                    });

                    const bindGroup = device.createBindGroup({
                        layout: bindGroupLayout,
                        entries: [
                            {
                                binding: 0,
                                resource: {
                                    buffer: a_storage_buffer,
                                }
                            },
                        ]
                    });

                    const computePipeline = device.createComputePipeline({
                        layout: device.createPipelineLayout({
                            bindGroupLayouts: [bindGroupLayout]
                        }),
                        compute: {
                            module: shaderModule,
                            entryPoint: 'main'
                        }
                    });

                    // 5: Create GPUCommandEncoder to issue commands to the GPU
                    const commandEncoder = device.createCommandEncoder();

                    const start = Date.now()
                    // 6: Initiate render pass
                    const passEncoder = commandEncoder.beginComputePass();

                    // 7: Issue commands
                    passEncoder.setPipeline(computePipeline);
                    passEncoder.setBindGroup(0, bindGroup);
                    passEncoder.dispatchWorkgroups(num_x_workgroups)

                    // End the render pass
                    passEncoder.end();

                    commandEncoder.copyBufferToBuffer(
                        a_storage_buffer,
                        0, // Source offset
                        stagingBuffer,
                        0, // Destination offset
                        input_bytes.length
                    );

                    // 8: End frame by passing array of command buffers to command queue for execution
                    device.queue.submit([commandEncoder.finish()]);

                    // map staging buffer to read results back to JS
                    await stagingBuffer.mapAsync(
                        GPUMapMode.READ,
                        0, // Offset
                        input_bytes.length
                    );

                    const copyArrayBuffer = stagingBuffer.getMappedRange(0, input_bytes.length)
                    const data = copyArrayBuffer.slice(0);
                    stagingBuffer.unmap();

                    const dataBuf = new Uint32Array(data);
                    const elapsed = Date.now() - start

                    timings[word_size].push(elapsed)

                    const results: bigint[] = []
                    for (let i = 0; i < num_inputs; i ++) {
                        const r: number[] = []
                        for (let j = 0; j < num_words; j ++) {
                            r.push(dataBuf[i * num_words + j])
                        }
                        results.push(from_words_le(new Uint16Array(r), num_words, word_size))
                    }

                    //if (results.toString() === expected.toString()) {
                        //console.log('Success')
                    //}

                    for (let i = 0; i < num_inputs; i ++) {
                        if (results[i] !== expected[i]) {
                            console.error(`Result mismatch at ${i}`)
                            break
                        }
                    }
                }

                if (num_runs < 2) {
                    console.log(`Limb size: ${word_size}. Time taken for 1 run: ${timings[word_size][0]}ms`)
                } else {
                    const sum = timings[word_size].reduce((a: number, b: number) => {return a + b}, 0)
                    const avg = Math.floor(sum / num_runs)
                    console.log(`Limb size: ${word_size}. Average time taken: ${avg}ms`)
                }
            }
        }
        mont_mul();

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <div>
        </div>
    );
}
