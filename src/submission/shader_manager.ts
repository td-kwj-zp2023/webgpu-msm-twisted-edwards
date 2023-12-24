import mustache from 'mustache'
import convert_point_coords_shader from './wgsl/convert_point_coords.template.wgsl'
import decompose_scalars_shader from './wgsl/decompose_scalars.template.wgsl'
import gen_csr_precompute_shader from './wgsl/gen_csr_precompute.template.wgsl'
import preaggregation_stage_1_shader from './wgsl/preaggregation_stage_1.template.wgsl'
import preaggregation_stage_2_shader from './wgsl/preaggregation_stage_2.template.wgsl'
import compute_row_ptr_shader from './wgsl/compute_row_ptr_shader.template.wgsl'
import transpose_serial_shader from './wgsl/transpose_serial.wgsl'

import structs from './wgsl/struct/structs.template.wgsl'
import bigint_funcs from './wgsl/bigint/bigint.template.wgsl'
import field_funcs from './wgsl/field/field.template.wgsl'
import ec_funcs from './wgsl/curve/ec.template.wgsl'
import barrett_funcs from './wgsl/barrett.template.wgsl'
import montgomery_product_funcs from './wgsl/montgomery/mont_pro_product.template.wgsl'
import extract_word_from_bytes_le_funcs from './wgsl/extract_word_from_bytes_le.template.wgsl'
import {
    gen_p_limbs,
    gen_r_limbs,
    gen_mu_limbs,
    compute_misc_params,
} from './utils'

export class ShaderManager {
    // The number of bits per big integer limb for point coordinates
    p = BigInt('8444461749428370424248824938781546531375899335154063827935233455917409239041')
    word_size: number
    num_words: number
    n0: bigint
    r: bigint
    rinv: bigint
    p_limbs: string
    r_limbs: string
    mu_limbs: string
    mask: bigint
    two_pow_word_size: bigint

    constructor(
        word_size: number,
    ) {
        this.word_size = word_size
        const params = compute_misc_params(this.p, word_size)
        this.n0 = params.n0
        this.num_words = params.num_words
        this.r = params.r
        this.rinv = params.rinv

        this.p_limbs = gen_p_limbs(this.p, this.num_words, word_size)
        this.r_limbs = gen_r_limbs(this.r, this.num_words, word_size)
        this.mu_limbs = gen_mu_limbs(this.p, this.num_words, word_size)
        this.mask = BigInt(2) ** BigInt(word_size) - BigInt(1)
        this.two_pow_word_size = BigInt(2) ** BigInt(word_size)
    }

    gen_convert_point_coords_shader(
        workgroup_size: number,
        num_y_workgroups: number,
    ): string {
        const p_bitlength = this.p.toString(2).length
        const slack = this.num_words * this.word_size - p_bitlength
        const shaderCode = mustache.render(
            convert_point_coords_shader,
            {
                workgroup_size,
                num_y_workgroups,
                num_words: this.num_words,
                word_size: this.word_size,
                n0: this.n0,
                mask: this.mask,
                two_pow_word_size: this.two_pow_word_size,
                p_limbs: this.p_limbs,
                r_limbs: this.r_limbs,
                mu_limbs: this.mu_limbs,
                w_mask: (1 << this.word_size) - 1,
                slack,
                num_words_mul_two: this.num_words * 2,
                num_words_plus_one: this.num_words + 1,
            },
            {
                structs,
                bigint_funcs,
                field_funcs,
                barrett_funcs,
                montgomery_product_funcs,
                extract_word_from_bytes_le_funcs,
            },
        )
        return shaderCode
    }

    gen_decompose_scalars_shader(
        workgroup_size: number,
        num_y_workgroups: number,
        num_subtasks: number,
        chunk_size: number,
        input_size: number
    ) {
        const shaderCode = mustache.render(
            decompose_scalars_shader,
            {
                workgroup_size,
                num_y_workgroups,
                num_subtasks,
                chunk_size,
                input_size,
            },
            {
                extract_word_from_bytes_le_funcs,
            },
        )
        return shaderCode
    }
    
    gen_csr_precompute_shader(
        num_y_workgroups: number,
        max_chunk_val: number,
		input_size: number,
        num_subtasks: number,
        max_cluster_size: number,
        overflow_size: number,
    ) {
        const shaderCode = mustache.render(
            gen_csr_precompute_shader,
            {
                num_y_workgroups,
                num_subtasks,
                max_cluster_size,
                max_cluster_size_plus_one: max_cluster_size + 1,
                max_chunk_val,
                num_chunks: input_size / num_subtasks,
                overflow_size,
            },
            {},
        )
        return shaderCode
    }

    gen_preaggregation_stage_1_shader(
        workgroup_size: number,
        num_y_workgroups: number,
        num_chunks: number,
    ) {
        const p_bitlength = this.p.toString(2).length
        const slack = this.num_words * this.word_size - p_bitlength

        const shaderCode = mustache.render(
            preaggregation_stage_1_shader,
            {
                num_y_workgroups,
                workgroup_size,
                word_size: this.word_size,
                num_words: this.num_words,
                n0: this.n0,
                p_limbs: this.p_limbs,
                r_limbs: this.r_limbs,
                mu_limbs: this.mu_limbs,
                w_mask: (1 << this.word_size) - 1,
                slack,
                num_words_mul_two: this.num_words * 2,
                num_words_plus_one: this.num_words + 1,
                mask: this.mask,
                two_pow_word_size: this.two_pow_word_size,
                num_chunks,
            },
            {
                structs,
                bigint_funcs,
                field_funcs,
                ec_funcs,
                montgomery_product_funcs,
            },
        )
        return shaderCode
    }
    
    gen_preaggregation_stage_2_shader(
        workgroup_size: number,
        num_y_workgroups: number,
        num_chunks: number,
    ) {
        const shaderCode = mustache.render(
            preaggregation_stage_2_shader,
            {
                num_y_workgroups,
                workgroup_size,
                num_chunks,
            },
            { },
        )
        return shaderCode
    }
    
    gen_compute_row_ptr_shader(
        workgroup_size: number,
        num_y_workgroups: number,
        num_chunks: number,
        max_row_size: number,
    ) {
        const shaderCode = mustache.render(
            compute_row_ptr_shader,
            {
                num_y_workgroups,
                workgroup_size,
                num_chunks,
                max_row_size,
            },
            { },
        )
        return shaderCode
    }

    gen_transpose_shader(
        num_cols: number,
    ) {
        const shaderCode = mustache.render(
            transpose_serial_shader,
            { num_cols },
            {},
        )
        return shaderCode
    }
}
