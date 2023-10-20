const NUM_ROWS = {{ num_rows }}u;

{{> bigint_struct }}

struct Point {
  x: BigInt,
  y: BigInt,
  t: BigInt,
  z: BigInt
}

// Already defined in montgomery_product.template.wgsl
// const WORD_SIZE = {{ word_size }}u;
// const NUM_WORDS = {{ num_words }}u; 

@group(0) @binding(0)
var<storage, read_write> output: array<Point>;

@group(0) @binding(1)
var<storage, read> col_idx: array<u32>;

@group(0) @binding(2)
var<storage, read> row_ptr: array<u32>;

@group(0) @binding(3)
var<storage, read> points: array<Point>;

/*
TODO: debug this!
fn add_points(p1: Point, p2: Point) -> Point {
    var p1x = p1.x;
    var p2x = p2.x;
    var a = montgomery_product(&p1x, &p2x);

    var p1y = p1.y;
    var p2y = p2.y;
    var b = montgomery_product(&p1y, &p2y);

    var p1t = p1.t;
    var p2t = p1.t;
    var t2 = montgomery_product(&p1t, &p2t);

    var EDWARDS_D: BigInt;
    EDWARDS_D.limbs[0] = 3021u;
    var c = montgomery_product(&EDWARDS_D, &t2);

    var p1z = p1.z;
    var p2z = p2.z;
    var d = montgomery_product(&p1z, &p2z);

    var p1_added = fr_add(&p1x, &p1y);
    var p2_added = fr_add(&p2x, &p2y);

    var xpy = fr_add(&p1x, &p1y);
    var xpy2 = fr_add(&p2x, &p2y);
    var e = montgomery_product(&xpy, &xpy2);
    e = fr_sub(&e, &a);
    e = fr_sub(&e, &b);
    var f = fr_sub(&d, &c);
    var g = fr_add(&d, &c);

    //var a_neg = mul_by_a(a);
    // a_neg = p - a
    var p = get_p();
    var a_neg = fr_sub(&p, &a);

    var h = fr_sub(&b, &a_neg);
    var added_x = montgomery_product(&e, &f);
    var added_y = montgomery_product(&g, &h);
    var added_t = montgomery_product(&e, &h);
    var added_z = montgomery_product(&f, &g);

    return Point(added_x, added_y, added_t, added_z);
}
*/

fn add_points(p1: Point, p2: Point) -> Point {
    var p1x = p1.x;
    var p2x = p2.x;
    var a = montgomery_product(&p1x, &p2x);

    var p1y = p1.y;
    var p2y = p2.y;
    var b = montgomery_product(&p1y, &p2y);

    var p1t = p1.t;
    var p2t = p1.t;
    var t2 = montgomery_product(&p1t, &p2t);

    var EDWARDS_D: BigInt;
    EDWARDS_D.limbs[0] = 3021u;
    var c = montgomery_product(&EDWARDS_D, &t2);

    var p1z = p1.z;
    var p2z = p2.z;
    var d = montgomery_product(&p1z, &p2z);

    /*var p1_added = fr_add(&p1x, &p1y);*/
    /*var p2_added = fr_add(&p2x, &p2y);*/

    var xpy = fr_add(&p1x, &p1y);
    var xpy2 = fr_add(&p2x, &p2y);
    var e = montgomery_product(&xpy, &xpy2);
    e = fr_sub(&e, &a);
    return Point(e, e, e, e);

    /*e = fr_sub(&e, &b);*/

    /*var f = fr_sub(&d, &c);*/
    /*var g = fr_add(&d, &c);*/

    /*var p = get_p();*/
    /*var a_neg = fr_sub(&p, &a);*/

    /*var h = fr_sub(&b, &a_neg);*/
    /*var added_x = montgomery_product(&e, &f);*/
    /*var added_y = montgomery_product(&g, &h);*/
    /*var added_t = montgomery_product(&e, &h);*/
    /*var added_z = montgomery_product(&f, &g);*/

    /*return Point(added_x, added_y, added_t, added_z);*/
}

{{> montgomery_product_funcs }}

fn fr_add(a: ptr<function, BigInt>, b: ptr<function, BigInt>) -> BigInt { 
    var res: BigInt;
    bigint_add(a, b, &res);
    return fr_reduce(&res);
}

fn fr_reduce(a: ptr<function, BigInt>) -> BigInt {
    var res: BigInt;
    var p: BigInt = get_p();
    var underflow = bigint_sub(a, &p, &res);
    if (underflow == 1u) {
        return *a;
    }

    return res;
}

fn fr_sub(a: ptr<function, BigInt>, b: ptr<function, BigInt>) -> BigInt { 
    var res: BigInt;

    // if a > b: return a - b 
    // else:     return p - (b - a)

    var c = bigint_gt(a, b);
    if (c == 0u) { // a < b
        var r: BigInt;
        bigint_sub(b, a, &r);
        var p = get_p();
        bigint_sub(&p, &r, &res);
        return res;
    } else { // a > b
        bigint_sub(a, b, &res);
        return res;
    }
}

@compute
@workgroup_size(1)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    // Assumes that the output buffer already contains the point at infinity at
    // each index

    /*output[global_id.x] = points[global_id.x];*/
    output[global_id.x] = add_points(points[global_id.x], points[global_id.x]);

    /*
    // Perform SMTVP
    for (var i = 0u; i < NUM_ROWS; i ++) {
        let row_start = row_ptr[global_id.x + i];
        let row_end = row_ptr[global_id.x + i + 1];
        for (var j = row_start; j < row_end; j ++) {
            var temp = points[global_id.x + j];
            var col = col_idx[global_id.x + j];

            var ycol = output[global_id.x + col];

            var res = add_points(ycol, temp);
            output[global_id.x + col] = res;
        }
    }
    */
}
