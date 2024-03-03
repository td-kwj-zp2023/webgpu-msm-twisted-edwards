const run = (
  num_words = 20,
  word_size = 13,
  mask = 8191,
  two_pow_word_size = 8192,
) => {
  console.log(`fn bigint_add(a: ptr<function, BigInt>, b: ptr<function, BigInt>, res: ptr<function, BigInt>) -> u32 {`)
  console.log(`    var carry: u32 = 0u;`)
  console.log(`    var c: u32;`)

  for (let i = 0; i < num_words; i ++) {
    console.log(`    c = (*a).limbs[${i}] + (*b).limbs[${i}] + carry;`)
    console.log(`    (*res).limbs[${i}] = c & ${mask};`)
    console.log(`    carry = c >> ${word_size};\n`)
  }

  console.log(`    return carry;`)
  console.log(`}`)
  console.log()

  console.log(`fn bigint_sub(a: ptr<function, BigInt>, b: ptr<function, BigInt>, res: ptr<function, BigInt>) -> u32 {`)
  console.log(`    var borrow: u32 = 0u;`)
  for (let i = 0; i < num_words; i ++) {
    console.log(`    (*res).limbs[${i}] = (*a).limbs[${i}] - (*b).limbs[${i}] - borrow;`)
    console.log(`    if ((*a).limbs[${i}] < ((*b).limbs[${i}] + borrow)) {`)
    console.log(`        (*res).limbs[${i}] += ${two_pow_word_size};`)
    console.log(`        borrow = 1u;`)
    console.log(`    } else {`)
    console.log(`        borrow = 0u;`)
    console.log(`    }`)
  }
  console.log(`    return borrow;`)
  console.log(`}`)
  console.log()

  console.log(`fn bigint_gt(x: ptr<function, BigInt>, y: ptr<function, BigInt>) -> u32 {`)
  for (let idx = 0; idx < num_words; idx ++) {
    const i = num_words - 1 - idx
    console.log(`    if ((*x).limbs[${i}] < (*y).limbs[${i}]) {`)
    console.log(`        return 0u;`)
    console.log(`    } else if ((*x).limbs[${i}] > (*y).limbs[${i}]) {`)
    console.log(`        return 1u;`)
    console.log(`    }`)
  }
  console.log(`    return 0u;`)
  console.log(`}`)
  console.log()
}

run()
