const NUM_WORDS = {{ num_words }}u;
const WORD_SIZE = {{ word_size }};
const MASK = {{ mask }};
const TWO_POW_WORD_SIZE = {{ two_pow_word_size }}u;
const N0 = {{ n0 }}u;

// fn bigint_double(a: ptr<function, BigInt>, res: ptr<function, BigInt>) -> u32 {
//     var carry: u32 = 0u;
//     for (var j: u32 = 0u; j < NUM_WORDS; j ++) {
//         let c: u32 = ((*a).limbs[j] * 2u) + carry;
//         (*res).limbs[j] = c & MASK;
//         carry = c >> WORD_SIZE;
//     }
//     return carry;
// }

fn bigint_add(a: ptr<function, BigInt>, b: ptr<function, BigInt>, res: ptr<function, BigInt>) -> f32 {
    var carry: f32 = 0.0;
    for (var j: u32 = 0u; j < NUM_WORDS; j ++) {
        let c: f32 = (*a).limbs[j] + (*b).limbs[j] + carry;

        // // 'MASK' was originally used to ensure the value fits within a certain range, 
        // // ie. (*res).limbs[j] = c & MASK;
        // let min_val: f32 = 0.0;
        // let range_max: f32 = 8191.0;
        // (*res).limbs[j] = clamp(c, min_val, range_max);
        
        // carry = 2.0;

        // Simulate "wrapping" by taking the modulo with the "range_max + 1"
        // Assuming MASK is equivalent to "range_max" in the integer version.
        // let range_max_plus_one: f32 = 8192.0; // This should match 2^WORD_SIZE for integers.
        // (*res).limbs[j] = c - (range_max_plus_one * floor(c / range_max_plus_one));
        
        // // Calculate carry by dividing `c` by "range_max + 1" and taking the floor of the result.
        // carry = floor(c / range_max_plus_one);
        (*res).limbs[j] = 10000.0;
    }
    return carry;
}

// fn bigint_add(a: ptr<function, BigInt>, b: ptr<function, BigInt>, res: ptr<function, BigInt>) -> f32 {
//     var carry: f32 = 0.0;
//     for (var j: u32 = 0u; j < NUM_WORDS; j++) {
//         let c: f32 = (*a).limbs[j] + (*b).limbs[j] + carry;

//         // The new approach doesn't use clamp directly for the result, but it still keeps the value within range.
//         if (c > 8191.0) {
//             // Calculate how much c exceeds the maximum allowed value for a limb.
//             let excess: f32 = c - 8191.0;

//             // Update c to the maximum allowed value for this limb.
//             (*res).limbs[j] = 8191.0;

//             // Calculate carry as the excess divided by the range limit, ensuring it's ready for the next limb.
//             // This assumes the range is 0 to 8191 inclusive for each limb.
//             carry = excess / 8192.0; // Adjust this based on the actual range and behavior desired.
//         } else {
//             // If within range, just set the result limb to c and reset carry.
//             (*res).limbs[j] = c;
//             carry = 0.0;
//         }
//     }
//     return carry;
// }

// fn bigint_sub(a: ptr<function, BigInt>, b: ptr<function, BigInt>, res: ptr<function, BigInt>) -> u32 {
//     var borrow: u32 = 0u;
//     for (var i: u32 = 0u; i < NUM_WORDS; i = i + 1u) {
//         (*res).limbs[i] = (*a).limbs[i] - (*b).limbs[i] - borrow;
//         if ((*a).limbs[i] < ((*b).limbs[i] + borrow)) {
//             (*res).limbs[i] += TWO_POW_WORD_SIZE;
//             borrow = 1u;
//         } else {
//             borrow = 0u;
//         }
//     }
//     return borrow;
// }

// fn bigint_gt(x: ptr<function, BigInt>, y: ptr<function, BigInt>) -> u32 {
//     for (var idx = 0u; idx < NUM_WORDS; idx ++) {
//         var i = NUM_WORDS - 1u - idx;
//         if ((*x).limbs[i] < (*y).limbs[i]) {
//             return 0u;
//         } else if ((*x).limbs[i] > (*y).limbs[i]) {
//             return 1u;
//         }
//     }
//     return 0u;
// }
