{{> structs }}
{{> montgomery_product_funcs }}
{{> field_funcs }}
{{> bigint_funcs }}
{{> curve_parameters }}
{{> ec_funcs }}

@group(0) @binding(0)
var<storage, read> bucket_sum_x_y: array<BigInt>;
@group(0) @binding(1)
var<storage, read> bucket_sum_t_z: array<BigInt>;
@group(0) @binding(2)
var<storage, read_write> result: Point;

@compute
@workgroup_size(1)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {    
    var r: BigInt = get_r();
    var inf: Point;
    inf.y = r;
    inf.z = r;

    var sum = inf;
    for (var i = (1u << {{ input_size }}) - 2u; i > 0; i--) {
        let x = bucket_sum_x_y[2u];
        let y = bucket_sum_x_y[2u + 1u];
        let t = bucket_sum_t_z[2u];
        let z = bucket_sum_t_z[2u + 1u];
        let pt = Point(x, y, t, z);
        sum = add_points(sum, pt);
    }

    result = sum;
}
