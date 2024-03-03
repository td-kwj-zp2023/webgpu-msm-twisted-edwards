const run = (
  num_words = 20,
  word_size = 13,
  mask = 8191,
  two_pow_word_size = 8192,
  n0 = 8191,
) => {

  console.log(`
const NUM_WORDS = {{ num_words }}u;
const WORD_SIZE = {{ word_size }}u;
const MASK = {{ mask }}u;
const TWO_POW_WORD_SIZE = {{ two_pow_word_size }}u;
const N0 = {{ n0 }}u;
fn get_p() -> BigInt {
    var p: BigInt;
{{{ p_limbs }}}
    return p;
}
`)

  console.log(`fn montgomery_product(x: ptr<function, BigInt>, y: ptr<function, BigInt>) -> BigInt {`)
  console.log(`    var s: BigInt;`)
  console.log(`    var p = get_p();`)
  console.log(`    var t: u32;`)
  console.log(`    var tprime: u32;`)
  console.log(`    var qi: u32;`)
  console.log(`    var c: u32;`)

  for (let i = 0; i < num_words; i ++) {
    console.log(`    t = s.limbs[0] + (*x).limbs[${i}] * (*y).limbs[0];`)
    console.log(`    tprime = t & ${mask};`)
    console.log(`    qi = (${n0} * tprime) & ${mask};`)
    console.log(`    c = (t + qi * p.limbs[0]) >> ${word_size};`)
    console.log(`    s.limbs[0] = s.limbs[1] + (*x).limbs[${i}] * (*y).limbs[1] + qi * p.limbs[1] + c;`)

    for (let j = 2; j < num_words; j ++) {
      console.log(`    s.limbs[${j - 1}] = s.limbs[${j}] + (*x).limbs[${i}] * (*y).limbs[${j}] + qi * p.limbs[${j}];`)
    }
    console.log(`    s.limbs[${num_words - 2}] = (*x).limbs[${i}] * (*y).limbs[${num_words - 1}] + qi * p.limbs[${num_words - 1}];`)
  }

  console.log(`    c = 0u;`)
  console.log(`    var v: u32;`)
  for (let i = 0; i < num_words; i ++) {
    console.log(`    v = s.limbs[${i}] + c;`)
    console.log(`    c = v >> ${word_size};`)
    console.log(`    s.limbs[${i}] = v & ${mask};`)
  }
  console.log(`    return conditional_reduce(&s, &p);`)

  console.log(`}`)
  console.log()

  console.log(`fn conditional_reduce(x: ptr<function, BigInt>, y: ptr<function, BigInt>) -> BigInt {
    // Determine if x > y
    var x_gt_y = bigint_gt(x, y);

    if (x_gt_y == 1u) {
        var res: BigInt;
        bigint_sub(x, y, &res);
        return res;
    }

    return *x;
}
`)
}

run()
