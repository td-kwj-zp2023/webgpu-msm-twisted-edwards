{{> structs }}
{{> bigint_funcs }}
// {{> field_funcs }}
// {{> ec_funcs }}
// {{> montgomery_product_funcs }}

@group(0) @binding(0)
var<storage, read_write> points: array<BigInt>;
@group(0) @binding(1)
var<storage, read_write> output: array<BigInt>;

@compute
@workgroup_size(1)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    var a = points[global_id.x];
    var b = points[global_id.x + 1];

    var res: BigInt;
    bigint_add(&a, &b, &res);
    
    output[0] = res;
}
