{{> structs }}
{{> bigint_funcs }}
{{> field_funcs }}
{{> ec_funcs }}
{{> montgomery_product_funcs }}
{{> curve_parameters }}

@group(0) @binding(0)
var<storage, read> points: array<Point>;
@group(0) @binding(1)
var<storage, read> scalars: array<u32>;
@group(0) @binding(2)
var<storage, read_write> results: array<Point>;

fn get_paf() -> Point {
    var result: Point;
    let r = get_r();
    result.y = r;
    result.z = r;
    return result;
}

// Double-and-add algo from the ZPrize test harness
fn double_and_add(point: Point, scalar: u32) -> Point {
    // Set result to the point at infinity
    var result: Point = get_paf();

    var s = scalar;
    var temp = point;

    while (s != 0u) {
        if ((s & 1u) == 1u) {
            result = add_points(result, temp);
        }
        temp = double_point(temp);
        s = s >> 1u;
    }
    return result;
}

fn negate_point(point: Point) -> Point {
    var p = get_p();
    var x = point.x;
    var t = point.t;
    var neg_x: BigInt;
    var neg_t: BigInt;
    bigint_sub(&p, &x, &neg_x);
    bigint_sub(&p, &t, &neg_t);
    return Point(neg_x, point.y, neg_t, point.z);
}

// Booth encoding method
fn booth(point: Point, scalar: u32) -> Point {
    if (scalar == 0u) {
        return point;
    }

    // Binary decomposition of the scalar
    var a: array<u32, 17>;

    var s = scalar;
    var i = 0u;
    while (s != 0u) {
        a[i] = s & 1u;
        s = s >> 1u;
        i ++;
    }

    for (var i = 16u; i >= 1u; i --) {
        if (a[i] == 0u && a[i - 1u] == 1u) {
            a[i] = 1u;
        } else if (a[i] == 1u && a[i - 1u] == 0u) {
            a[i] = 2u;
        } else if (a[i] == 1u && a[i - 1u] == 1u) {
            a[i] = 0u;
        }
    }

    if (a[0] == 1u) {
        a[0] = 2u;
    }

    // Find the last 1
    var max_idx = 16u;
    while (a[max_idx] == 0u) {
        max_idx --;
    }

    // Set result to the point at infinity
    var result: Point;
    result.y = get_r();
    result.z = get_r();

    var temp = point;
    for (var i = 0u; i < max_idx + 1u; i ++) {
        if (a[i] == 1u) {
            result = add_points(result, temp);
        } else if (a[i] == 2u) {
            result = add_points(result, negate_point(temp));
        }
        temp = double_point(temp);
    }

    return result;
}

fn encode_pair(pair: u32) -> u32 {
    if (pair == 4u) {
        return 5u;
    } else if (pair == 1u) {
        return 2u;
    } else if (pair == 5u) {
        return 4u;
    }
    return 0u;
}

// Booth encoding method
fn booth_new(point: Point, scalar: u32) -> Point {
    if (scalar == 0u) {
        return point;
    }

    // Set result to the point at infinity
    var result: Point = get_paf();

    var s = scalar;

    // Store the Booth-encoded scalar in booth.
    var booth = 0u;

    // The zeroth digit has to be stored separately because booth is limited to
    // 32 bits
    var zeroth = s & 1u;

    // Truncuate the zeroth bit
    s = s >> 1u;

    // Use 2 digits per bit. e.g. 0b1111 should become 01, 01, 01, 01
    var i = 30u;
    while (s != 0u) {
        let digit = s & 1u;
        booth += digit << i;
        s = s >> 1u;
        i -= 2u;
    }

    // Perform Booth encoding
    var pair: u32;
    for (var i = 0u; i < 15u; i ++) {
        // Replace the digits
        pair = (booth >> (i * 2u)) & 15u;
        pair = encode_pair(pair);

        let left = booth >> ((i * 2u) + 4u);
        let right = booth & ((1u << (i * 2u)) - 1u);
        booth = (((left << 4u) + pair) << (i * 2u)) + right;
    }

    // Encode the last digit and the 0th digit
    var im = booth >> 30u;
    if (im == 0u && zeroth == 1u) {
        im = 1u;
    } else if (im == 1u && zeroth == 0u) {
        im = 2u;
    } else if (im == 1u && zeroth == 1u) {
        im = 0u;
    }
    var temp = point;

    // Handle the zeroth and 1st digits
    if (zeroth == 1u) {
        result = add_points(result, negate_point(temp));
    }
    temp = double_point(temp);

    let mask = (1u << 30u) - 1u;
    booth = (booth & mask) + (im << 30u);

    for (var idx = 0u; idx < 15u; idx ++) {
        let i = 15u - idx;
        let x = (booth >> (i * 2u)) & 3u;

        if (x == 1u) {
            result = add_points(result, temp);
        } else if (x == 2u) {
            result = add_points(result, negate_point(temp));
        }
        temp = double_point(temp);
    }

    return result;
}

@compute
@workgroup_size({{ workgroup_size }})
fn double_and_add_benchmark(@builtin(global_invocation_id) global_id: vec3<u32>) {
    var result = double_and_add(points[0], scalars[0]);
    for (var i = 1u; i < arrayLength(&scalars); i ++) {
        result = double_and_add(result, scalars[i]);
    }
    results[0] = result;
}

@compute
@workgroup_size({{ workgroup_size }})
fn booth_benchmark(@builtin(global_invocation_id) global_id: vec3<u32>) {
    var result = booth(points[0], scalars[0]);
    for (var i = 1u; i < arrayLength(&scalars); i ++) {
        result = booth(result, scalars[i]);
    }
    results[0] = result;
}
