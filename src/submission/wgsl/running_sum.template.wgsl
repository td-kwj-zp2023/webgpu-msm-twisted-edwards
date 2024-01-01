{{> structs }}
{{> montgomery_product_funcs }}
{{> field_funcs }}
{{> bigint_funcs }}
{{> curve_parameters }}
{{> ec_funcs }}

@group(0) @binding(0)
var<storage, read> point_x: array<BigInt>;
@group(0) @binding(1)
var<storage, read> point_y: array<BigInt>;
@group(0) @binding(2)
var<storage, read> point_t: array<BigInt>;
@group(0) @binding(3)
var<storage, read> point_z: array<BigInt>;
@group(0) @binding(4)
var<storage, read_write> bucket_sum_x: BigInt;
@group(0) @binding(5)
var<storage, read_write> bucket_sum_y: BigInt;
@group(0) @binding(6)
var<storage, read_write> bucket_sum_t: BigInt;
@group(0) @binding(7)
var<storage, read_write> bucket_sum_z: BigInt;

@compute
@workgroup_size(1)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {    
    var r: BigInt = get_r();
    var inf: Point;
    inf.y = r;
    inf.z = r;

    var sum = inf;
    for (var i = (1u << 15) - 2u; i > 0; i--) {
        let x = point_x[i * 2u];
        let y = point_y[i * 2u];
        let t = point_t[i * 2u];
        let z = point_z[i * 2u];
        let pt = Point(x, y, t, z);
        sum = add_points(sum, pt);
    }

    bucket_sum_x = sum.x;
    bucket_sum_y = sum.y;
    bucket_sum_t = sum.t;
    bucket_sum_z = sum.z;
}
