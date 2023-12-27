{{> structs }}
{{> bigint_funcs }}
{{> field_funcs }}
{{> ec_funcs }}
{{> curve_parameters }}
{{> montgomery_product_funcs }}

@group(0) @binding(0)
var<storage, read> point_x: array<BigInt>;
@group(0) @binding(1)
var<storage, read> point_y: array<BigInt>;
@group(0) @binding(2)
var<storage, read> point_t: array<BigInt>;
@group(0) @binding(3)
var<storage, read> point_z: array<BigInt>;

@group(0) @binding(4)
var<storage, read_write> out_x: array<BigInt>;
@group(0) @binding(5)
var<storage, read_write> out_y: array<BigInt>;
@group(0) @binding(6)
var<storage, read_write> out_t: array<BigInt>;
@group(0) @binding(7)
var<storage, read_write> out_z: array<BigInt>;
@group(0) @binding(8)
var<uniform> num_points: u32;

fn get_paf() -> Point {
    var result: Point;
    let r = get_r();
    result.y = r;
    result.z = r;
    return result;
}

@compute
@workgroup_size(16)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    var gidx = global_id.x;
    var gidy = global_id.y;
    let id = gidx * 256u + gidy;

    let a_x = point_x[id * 2u];
    let a_y = point_y[id * 2u];
    let a_t = point_t[id * 2u];
    let a_z = point_z[id * 2u];
    let pt_a = Point(a_x, a_y, a_t, a_z);

    let b_x = point_x[id * 2u + 1u];
    let b_y = point_y[id * 2u + 1u];
    let b_t = point_t[id * 2u + 1u];
    let b_z = point_z[id * 2u + 1u];
    var pt_b = Point(b_x, b_y, b_t, b_z);

    // If the number of points is odd, and id is at or past the last point,
    // assign the point at infinity to B
    if (num_points % 2u == 1u && id * 2u + 1u >= num_points) {
        pt_b = get_paf();
    } 

    let result = add_points(pt_a, pt_b);

    out_x[id] = result.x;
    out_y[id] = result.y;
    out_t[id] = result.t;
    out_z[id] = result.z;
}
