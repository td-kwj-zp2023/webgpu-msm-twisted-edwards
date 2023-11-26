const W_MASK = {{ w_mask }}u;
const SLACK = {{ slack }}u;

fn get_m() -> BigInt {
    var m: BigInt;
{{{ m_limbs }}}
    return m;
}

fn get_p_wide() -> BigIntWide {
    var p: BigIntWide;
{{{ p_limbs }}}
    return p;
}

fn machine_multiply(a: u32, b: u32) -> vec2<u32> {
    let ab = a * b;
    let hi = ab >> WORD_SIZE;
    let lo = ab & MASK;
    return vec2(lo, hi);
}

fn machine_two_digit_add(a: vec2<u32>, b: vec2<u32>) -> vec3<u32> {
    var carry = 0u;
    var res = vec3(0u, 0u, 0u);
    for (var i = 0u; i < 2u; i ++) {
        let sum = a[i] + b[i] + carry;
        res[i] = sum & MASK;
        carry = sum >> WORD_SIZE;
    }
    res[2] = carry;
    return res;
}


/*
 * Bitshift to the left. The shift value must be greater than the word size.
 */
fn mp_shifter_left(a: BigIntWide, shift: u32) -> BigIntWide {
    var res: BigIntWide;
    var carry = 0u;
    let x = shift - WORD_SIZE;
    for (var i = 1u; i < NUM_WORDS * 2u; i ++) {
        res.limbs[i] = ((a.limbs[i - 1] << x) & W_MASK) + carry;
        carry = a.limbs[i - 1] >> (WORD_SIZE - x);
    }
    return res;
}

fn mp_shifter_right(a: BigInt, shift: u32) -> BigInt {
    var res: BigInt;
    var borrow = 0u;
    let borrow_shift = WORD_SIZE - shift;
    let two_w = 1u << WORD_SIZE;
    for (var idx = 0u; idx < NUM_WORDS; idx ++) {
        let i = NUM_WORDS - idx - 1u;
        let new_borrow = a.limbs[i] << borrow_shift;
        res.limbs[i] = ((a.limbs[i] >> shift) | borrow) % two_w;
        borrow = new_borrow;
    }
    return res;
}

fn mp_msb_multiply(a: BigInt, b: BigInt) -> BigInt {
    var c: array<u32, NUM_WORDS * 2 + 1>;
    for (var l = NUM_WORDS - 1u; l < NUM_WORDS * 2u - 1u; l ++) {
        let i_min = l - (NUM_WORDS - 1u);
        /*let i_max = NUM_WORDS - 1 + 1  // + 1 for inclusive*/
        for (var i = i_min; i < NUM_WORDS; i ++) {
            let mult_res = machine_multiply(a.limbs[i], b.limbs[l-i]);
            let add_res = machine_two_digit_add(mult_res, vec2(c[l], c[l+1]));
            c[l] = add_res[0];
            c[l + 1] = add_res[1];
            c[l + 2] = c[l + 2] + add_res[2];
        }
    }

    var result: BigInt;
    for (var i = 0u; i < NUM_WORDS; i ++) {
        result.limbs[i] = c[NUM_WORDS + i];
    }
    return result;
}

fn mp_lsb_multiply(a: BigInt, b: BigInt) -> BigIntMediumWide {
    var c: array<u32, NUM_WORDS * 2 + 1>;
    for (var l = 0u; l < NUM_WORDS; l ++) {
        let i_min = max(0i, i32(l) - (i32(NUM_WORDS) - 1i));
        let i_max = min(i32(l), (i32(NUM_WORDS) - 1i)) + 1i;  // + 1 for inclusive
        for (var i = i_min; i < i_max; i ++) {
            let mult_res = machine_multiply(a.limbs[i], b.limbs[l - u32(i)]);
            let add_res = machine_two_digit_add(mult_res, vec2(c[l], c[l + 1]));
            c[l] = add_res[0];
            c[l + 1] = add_res[1];
            c[l + 2] = c[l + 2] + add_res[2];
        }
    }
    var result: BigIntMediumWide;
    for (var i = 0u; i < NUM_WORDS + 1u; i ++) {
        result.limbs[i] = c[i];
    }
    return result;
}

fn mp_adder(a: BigInt, b: BigInt) -> BigIntMediumWide {
    var c: BigIntMediumWide;
    var carry = 0u;
    for (var i = 0u; i < NUM_WORDS; i ++) {
        let x = a.limbs[i] + b.limbs[i] + carry;
        c.limbs[i] = x & MASK;
        carry = x >> WORD_SIZE;
    }
    return c;
}

fn mp_subtracter(a: BigInt, b: BigInt) -> BigInt {
    var res: BigInt;
    var borrow = 0u;
    for (var i = 0u; i < NUM_WORDS; i ++) {
        res.limbs[i] = a.limbs[i] - b.limbs[i] - borrow;
        if (a.limbs[i] < (b.limbs[i] + borrow)) {
            res.limbs[i] += TWO_POW_WORD_SIZE;
            borrow = 1u;
        } else {
            borrow = 0u;
        }
    }
    return res;
}

fn mp_full_multiply(a: BigInt, b: BigInt) -> BigIntWide {
    var c: array<u32, NUM_WORDS * 2 + 1>;
    for (var l = 0u; l < NUM_WORDS * 2u - 1u; l ++) {
        let i_min = u32(max(0i, i32(l) - i32(NUM_WORDS - 1u)));
        let i_max = u32(min(l, NUM_WORDS - 1u) + 1u);  // + 1 for inclusive
        for (var i = i_min; i < i_max; i ++) {
            let mult_res = machine_multiply(a.limbs[i], b.limbs[l - u32(i)]);
            let add_res = machine_two_digit_add(mult_res, vec2(c[l], c[l+1]));
            c[l] = add_res[0];
            c[l + 1] = add_res[1];
            c[l + 2] += add_res[2];
        }
    }
    var result: BigIntWide;
    for (var i = 0u; i < NUM_WORDS * 2u; i ++) {
        result.limbs[i] = c[i];
    }
    return result;
}

fn mp_subtract_red(a: ptr<function, BigInt>, b: ptr<function, BigInt>) -> BigInt {
    var res = *a;
    while (bigint_gt(&res, b) == 1u) {
        res = mp_subtracter(res, *b);
    }
    return res;
}

fn field_mul(a: BigInt, b: BigInt) -> BigInt {
    let ab = mp_full_multiply(a, b);
    let z = {{ z }}u;

    // AB msb extraction (+ shift)
    let ab_shift = mp_shifter_left(ab, z * 2u);
    var ab_msb: BigInt;
    for (var i = 0u; i < NUM_WORDS; i ++) {
        ab_msb.limbs[i] = ab_shift.limbs[NUM_WORDS + i];
    }

    // L estimation
    let m = get_m();
    var l = mp_msb_multiply(ab_msb, m); // calculate l estimator (MSB multiply)
    let l_add_ab_msb = mp_adder(l, ab_msb);
    for (var i = 0u; i < NUM_WORDS; i ++) {
        l.limbs[i] = l_add_ab_msb.limbs[i];
    }
    l = mp_shifter_right(l, z);
    var p = get_p();

    // LS calculation
    let ls_mw: BigIntMediumWide = mp_lsb_multiply(l, p);
    var ls: BigInt;
    var ab_lsb: BigInt;
    for (var i = 0u; i < NUM_WORDS; i ++) {
        ls.limbs[i] = ls_mw.limbs[i];
        ab_lsb.limbs[i] = ab.limbs[i];
    }

    var result = mp_subtracter(ab_lsb, ls);
    return mp_subtract_red(&result, &p);
}