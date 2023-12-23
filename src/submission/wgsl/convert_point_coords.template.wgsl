{{> structs }}
{{> bigint_funcs }}
{{> field_funcs }}
{{> barrett_funcs }}
{{> montgomery_product_funcs }}

const CHUNK_SIZE = {{ word_size }}u;
{{ > extract_word_from_bytes_le_funcs }}

// Input buffers
@group(0) @binding(0)
var<storage, read> x_coords: array<u32>;
@group(0) @binding(1)
var<storage, read> y_coords: array<u32>;

// Output buffers
@group(0) @binding(2)
var<storage, read_write> point_x: array<BigInt>;
@group(0) @binding(3)
var<storage, read_write> point_y: array<BigInt>;

fn get_r() -> BigInt {
    var r: BigInt;
{{{ r_limbs }}}
    return r;
}

@compute
@workgroup_size({{ workgroup_size }})
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let gidx = global_id.x; 
    let gidy = global_id.y; 
    let id = gidx * {{ num_y_workgroups }} + gidy;

    // Convert x and y coordinates to byte arrays
    var x_bytes: array<u32, 16>;
    var y_bytes: array<u32, 16>;
    for (var i = 0u; i < 16u; i ++) {
        x_bytes[15u - i] = x_coords[id * 16 + i];
        y_bytes[15u - i] = y_coords[id * 16 + i];
    }

    // Convert the byte arrays to BigInts with word_size limbs
    var x_bigint: BigInt;
    var y_bigint: BigInt;
    for (var i = 0u; i < NUM_WORDS - 1u; i ++) {
        x_bigint.limbs[i] = extract_word_from_bytes_le(x_bytes, i);
        y_bigint.limbs[i] = extract_word_from_bytes_le(y_bytes, i);
    }

    let shift = (((NUM_WORDS * WORD_SIZE - 256u) + 16u) - WORD_SIZE);
    x_bigint.limbs[NUM_WORDS - 1u] = x_bytes[0] >> shift;
    y_bigint.limbs[NUM_WORDS - 1u] = y_bytes[0] >> shift;

    // Convert x and y coordinates to Montgomery form
    var r = get_r();
    point_x[id] = field_mul(&x_bigint, &r);
    point_y[id] = field_mul(&y_bigint, &r);
}
