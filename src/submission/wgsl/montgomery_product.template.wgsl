const NUM_WORDS = {{ num_words }}u;
const WORD_SIZE = {{ word_size }}u;
const MASK = {{ mask }}u;
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