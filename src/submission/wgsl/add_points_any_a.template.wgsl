{{> structs }}

const NUM_WORDS = {{ num_words }}u;
const WORD_SIZE = {{ word_size }}u;
const MASK = {{ mask }}u;
const TWO_POW_WORD_SIZE = {{ two_pow_word_size }}u;
const N0 = {{ n0 }}u;

{{> bigint_funcs }}

fn get_p() -> BigInt {
    var p: BigInt;
{{{ p_limbs }}}
    return p;
}

fn montgomery_product(x: ptr<function, BigInt>, y: ptr<function, BigInt>) -> BigInt {
    var s: BigInt;
    var p = get_p();

    for (var i = 0u; i < NUM_WORDS; i ++) {
        var t = s.limbs[0] + (*x).limbs[i] * (*y).limbs[0];

        var tprime = t & MASK;

        var qi = (N0 * tprime) & MASK;

        var c = (t + qi * p.limbs[0]) >> WORD_SIZE;

        s.limbs[0] = s.limbs[1] + (*x).limbs[i] * (*y).limbs[1] + qi * p.limbs[1] + c;

        for (var j = 2u; j < NUM_WORDS; j ++) {
            s.limbs[j - 1u] = s.limbs[j] + (*x).limbs[i] * (*y).limbs[j] + qi * p.limbs[j];
        }

        s.limbs[NUM_WORDS - 2u] = (*x).limbs[i] * (*y).limbs[NUM_WORDS - 1u] + qi * p.limbs[NUM_WORDS - 1u];
    }

    var c = 0u;
    for (var i = 0u; i < NUM_WORDS; i ++) {
        var v = s.limbs[i] + c;
        c = v >> WORD_SIZE;
        s.limbs[i] = v & MASK;
    }

    return conditional_reduce(&s, &p);
}

fn conditional_reduce(x: ptr<function, BigInt>, y: ptr<function, BigInt>) -> BigInt {
    // Determine if x > y
    var x_gt_y = bigint_gt(x, y);

    if (x_gt_y == 1u) {
        var res: BigInt;
        bigint_sub(x, y, &res);
        return res;
    }

    return *x;
}

@group(0) @binding(0)
var<storage, read_write> points: array<Point>;
@group(0) @binding(1)
var<storage, read_write> output: array<Point>;

fn get_edwards_d() -> BigInt {
    var d: BigInt;
    d.limbs[0] = 760u;
    d.limbs[1] = 8111u;
    d.limbs[2] = 8191u;
    d.limbs[3] = 2047u;
    d.limbs[4] = 2879u;
    d.limbs[5] = 7826u;
    d.limbs[6] = 8149u;
    d.limbs[7] = 3887u;
    d.limbs[8] = 7498u;
    d.limbs[9] = 489u;
    d.limbs[10] = 5641u;
    d.limbs[11] = 7817u;
    d.limbs[12] = 1758u;
    d.limbs[13] = 6342u;
    d.limbs[14] = 5673u;
    d.limbs[15] = 2217u;
    d.limbs[16] = 2688u;
    d.limbs[17] = 7853u;
    d.limbs[18] = 7621u;
    d.limbs[19] = 20u;
    return d;
}

fn add_points(p1: Point, p2: Point) -> Point {
    // This is add-2008-hwcd
    // https://eprint.iacr.org/2008/522.pdf section 3.1, p5 (9M + 2D)
    // https://hyperelliptic.org/EFD/g1p/auto-twisted-extended.html#addition-add-2008-hwcd
    // Operation counts
    // montgomery_product: 10
    // fr_add: 3
    // fr_sub: 5

    var p1x = p1.x;
    var p2x = p2.x;
    var a = montgomery_product(&p1x, &p2x);

    var p1y = p1.y;
    var p2y = p2.y;
    var b = montgomery_product(&p1y, &p2y);

    var p1t = p1.t;
    var p2t = p2.t;
    var t2 = montgomery_product(&p1t, &p2t);

    var EDWARDS_D = get_edwards_d();
    var c = montgomery_product(&EDWARDS_D, &t2);

    var p1z = p1.z;
    var p2z = p2.z;
    var d = montgomery_product(&p1z, &p2z);

    var xpy = fr_add(&p1x, &p1y);
    var xpy2 = fr_add(&p2x, &p2y);
    var e = montgomery_product(&xpy, &xpy2);
    e = fr_sub(&e, &a);
    e = fr_sub(&e, &b);

    var f = fr_sub(&d, &c);
    var g = fr_add(&d, &c);

    var p = get_p();
    var a_neg = fr_sub(&p, &a);

    var h = fr_sub(&b, &a_neg);
    var added_x = montgomery_product(&e, &f);
    var added_y = montgomery_product(&g, &h);
    var added_t = montgomery_product(&e, &h);
    var added_z = montgomery_product(&f, &g);

    return Point(added_x, added_y, added_t, added_z);
}

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
    var a = points[global_id.x];
    var b = points[global_id.x + 1u];
    var c = add_points(a, b);
    for (var i = 1u; i < {{ cost }}; i ++) {
        c = add_points(c, a);
    }
    output[global_id.x] = c;
}