{{> structs }}
{{> montgomery_product_funcs }}
{{> field_funcs }}
{{> bigint_funcs }}
{{> curve_parameters }}
{{> ec_funcs }}

@group(0) @binding(0)
var<storage, read> new_point_x: array<BigInt>; // contains X coordinates, followed by row_ptr values
@group(0) @binding(1)
var<storage, read> new_point_y: array<BigInt>;
@group(0) @binding(2)
var<storage, read> new_point_t: array<BigInt>;
@group(0) @binding(3)
var<storage, read> new_point_z: array<BigInt>;
@group(0) @binding(4)
var<storage, read_write> bucket_sum_x: array<BigInt>;
@group(0) @binding(5)
var<storage, read_write> bucket_sum_y: array<BigInt>;
@group(0) @binding(6)
var<storage, read_write> bucket_sum_t: array<BigInt>;
@group(0) @binding(7)
var<storage, read_write> bucket_sum_z: array<BigInt>;

fn compute_row_ptr_idx(
    id: u32,
) -> vec2<u32> {
    let num_words = {{ num_words }}u;
    var bigint_idx = id / num_words;
    var limb_idx = id % num_words;
    return vec2(bigint_idx, limb_idx);
}

@compute
@workgroup_size(256)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {    
    let gidx = global_id.x; 
    let gidy = global_id.y; 
    let id = gidx * {{ num_y_workgroups }} + gidy;

    let offset = arrayLength(&new_point_y);

    // bucket_sum_x contains `offset` BigInts, each of which contains
    // `num_words` limbs of u32s, followed by at least (num_cols + 1) u32s which 
    // contains the row_ptr values.
    // bucket_sum_x[offset].limbs contains the first num_words values of
    // row_ptr
    // bucket_sum_x[offset + 1u].limbs contains the second num_words values of
    // row_ptr, and so on
    if (id < offset) {
        var begin = compute_row_ptr_idx(id);
        let row_begin = new_point_x[offset + begin[0]].limbs[begin[1]];

        var end = compute_row_ptr_idx(id + 1);
        let row_end = new_point_x[offset + end[0]].limbs[end[1]];

        var r: BigInt = get_r();
        var inf: Point;
        inf.y = r;
        inf.z = r;

        var sum = inf;
        for (var j = row_begin; j < row_end; j++) {
            let x = new_point_x[j];
            let y = new_point_y[j];
            let t = new_point_t[j];
            let z = new_point_z[j];
            let pt = Point(x, y, t, z);
            sum = add_points(sum, pt);
        }

        bucket_sum_x[id] = sum.x;
        bucket_sum_y[id] = sum.y;
        bucket_sum_t[id] = sum.t;
        bucket_sum_z[id] = sum.z;
    }
}
