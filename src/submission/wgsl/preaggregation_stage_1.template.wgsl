{{> structs }}
{{> bigint_funcs }}
{{> field_funcs }}
{{> ec_funcs }}
{{> montgomery_product_funcs }}

// Input buffers
@group(0) @binding(0)
var<storage, read> point_x: array<BigInt>;
@group(0) @binding(1)
var<storage, read> point_y: array<BigInt>;
@group(0) @binding(2)
var<storage, read> cluster_and_new_point_indices: array<u32>;

// Output buffers
@group(0) @binding(3)
var<storage, read_write> new_point_x: array<BigInt>;
@group(0) @binding(4)
var<storage, read_write> new_point_y: array<BigInt>;
@group(0) @binding(5)
var<storage, read_write> new_point_t: array<BigInt>;
@group(0) @binding(6)
var<storage, read_write> new_point_z: array<BigInt>;

fn get_r() -> BigInt {
    var r: BigInt;
{{{ r_limbs }}}
    return r;
}

@compute
@workgroup_size({{ workgroup_size }})
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let force = 65u;
    let gidx = global_id.x; 
    let gidy = global_id.y; 
    let id = gidx * {{ num_y_workgroups }} + gidy;

    let num_chunks = {{ num_chunks }}u;

    let start_idx = cluster_and_new_point_indices[id];
    let end_idx = cluster_and_new_point_indices[id + 1u];

    let acc_point_idx = cluster_and_new_point_indices[num_chunks + start_idx];

    var acc_x = point_x[acc_point_idx];
    var acc_y = point_y[acc_point_idx];
    let acc_t = montgomery_product(&acc_x, &acc_y);
    let acc_z = get_r();

    var acc = Point(acc_x, acc_y, acc_t, acc_z);

    for (var i = start_idx + 1u; i < end_idx; i ++) {
        let point_idx = cluster_and_new_point_indices[num_chunks + i];
        var pt_x = point_x[point_idx];
        var pt_y = point_y[point_idx];
        let pt_t = montgomery_product(&pt_x, &pt_y);
        let pt_z = get_r();

        let pt = Point(pt_x, pt_y, pt_t, pt_z);

        acc = add_points(acc, pt);
    }

    new_point_x[id] = acc.x;
    new_point_y[id] = acc.y;
    new_point_t[id] = acc.t;
    new_point_z[id] = acc.z;
}
