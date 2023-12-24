{{> structs }}
{{> montgomery_product_funcs }}
{{> field_funcs }}
{{> bigint_funcs }}
{{> curve_parameters }}
{{> ec_funcs }}

@group(0) @binding(0)
var<storage, read> row_ptr: array<u32>;
@group(0) @binding(1)
var<storage, read> new_point_x_y: array<BigInt>;
@group(0) @binding(2)
var<storage, read> new_point_t_z: array<BigInt>;

@group(0) @binding(3)
var<storage, read_write> bucket_sum_x_y: array<BigInt>;
@group(0) @binding(4)
var<storage, read_write> bucket_sum_t_z: array<BigInt>;

@compute
@workgroup_size(256)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {    
    let gidx = global_id.x; 
    let gidy = global_id.y; 
    let id = gidx * {{ num_y_workgroups }} + gidy;

    var r: BigInt = get_r();
    var inf: Point;
    inf.y = r;
    inf.z = r;

    if (id < arrayLength(&bucket_sum_x_y)) {
        let row_begin = row_ptr[id];
        let row_end = row_ptr[id + 1u];
        var sum = inf;
        for (var j = row_begin; j < row_end; j++) {
            let x = new_point_x_y[id * 2u];
            let y = new_point_x_y[id * 2u + 1u];
            let t = new_point_t_z[id * 2u];
            let z = new_point_t_z[id * 2u + 1u];
            let pt = Point(x, y, t, z);
            sum = add_points(sum, pt);
        }

        bucket_sum_x_y[id * 2u] = sum.x;
        bucket_sum_x_y[id * 2u + 1u] = sum.y;
        bucket_sum_t_z[id * 2u] = sum.t;
        bucket_sum_t_z[id * 2u + 1u] = sum.z;
    }
}
