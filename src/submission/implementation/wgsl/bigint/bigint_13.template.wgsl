fn bigint_add(a: ptr<function, BigInt>, b: ptr<function, BigInt>, res: ptr<function, BigInt>) -> u32 {
    var carry: u32 = 0u;
    var c: u32;
    c = (*a).limbs[0] + (*b).limbs[0] + carry;
    (*res).limbs[0] = c & 8191;
    carry = c >> 13;

    c = (*a).limbs[1] + (*b).limbs[1] + carry;
    (*res).limbs[1] = c & 8191;
    carry = c >> 13;

    c = (*a).limbs[2] + (*b).limbs[2] + carry;
    (*res).limbs[2] = c & 8191;
    carry = c >> 13;

    c = (*a).limbs[3] + (*b).limbs[3] + carry;
    (*res).limbs[3] = c & 8191;
    carry = c >> 13;

    c = (*a).limbs[4] + (*b).limbs[4] + carry;
    (*res).limbs[4] = c & 8191;
    carry = c >> 13;

    c = (*a).limbs[5] + (*b).limbs[5] + carry;
    (*res).limbs[5] = c & 8191;
    carry = c >> 13;

    c = (*a).limbs[6] + (*b).limbs[6] + carry;
    (*res).limbs[6] = c & 8191;
    carry = c >> 13;

    c = (*a).limbs[7] + (*b).limbs[7] + carry;
    (*res).limbs[7] = c & 8191;
    carry = c >> 13;

    c = (*a).limbs[8] + (*b).limbs[8] + carry;
    (*res).limbs[8] = c & 8191;
    carry = c >> 13;

    c = (*a).limbs[9] + (*b).limbs[9] + carry;
    (*res).limbs[9] = c & 8191;
    carry = c >> 13;

    c = (*a).limbs[10] + (*b).limbs[10] + carry;
    (*res).limbs[10] = c & 8191;
    carry = c >> 13;

    c = (*a).limbs[11] + (*b).limbs[11] + carry;
    (*res).limbs[11] = c & 8191;
    carry = c >> 13;

    c = (*a).limbs[12] + (*b).limbs[12] + carry;
    (*res).limbs[12] = c & 8191;
    carry = c >> 13;

    c = (*a).limbs[13] + (*b).limbs[13] + carry;
    (*res).limbs[13] = c & 8191;
    carry = c >> 13;

    c = (*a).limbs[14] + (*b).limbs[14] + carry;
    (*res).limbs[14] = c & 8191;
    carry = c >> 13;

    c = (*a).limbs[15] + (*b).limbs[15] + carry;
    (*res).limbs[15] = c & 8191;
    carry = c >> 13;

    c = (*a).limbs[16] + (*b).limbs[16] + carry;
    (*res).limbs[16] = c & 8191;
    carry = c >> 13;

    c = (*a).limbs[17] + (*b).limbs[17] + carry;
    (*res).limbs[17] = c & 8191;
    carry = c >> 13;

    c = (*a).limbs[18] + (*b).limbs[18] + carry;
    (*res).limbs[18] = c & 8191;
    carry = c >> 13;

    c = (*a).limbs[19] + (*b).limbs[19] + carry;
    (*res).limbs[19] = c & 8191;
    carry = c >> 13;

    return carry;
}

fn bigint_sub(a: ptr<function, BigInt>, b: ptr<function, BigInt>, res: ptr<function, BigInt>) -> u32 {
    var borrow: u32 = 0u;
    (*res).limbs[0] = (*a).limbs[0] - (*b).limbs[0] - borrow;
    if ((*a).limbs[0] < ((*b).limbs[0] + borrow)) {
        (*res).limbs[0] += 8192;
        borrow = 1u;
    } else {
        borrow = 0u;
    }
    (*res).limbs[1] = (*a).limbs[1] - (*b).limbs[1] - borrow;
    if ((*a).limbs[1] < ((*b).limbs[1] + borrow)) {
        (*res).limbs[1] += 8192;
        borrow = 1u;
    } else {
        borrow = 0u;
    }
    (*res).limbs[2] = (*a).limbs[2] - (*b).limbs[2] - borrow;
    if ((*a).limbs[2] < ((*b).limbs[2] + borrow)) {
        (*res).limbs[2] += 8192;
        borrow = 1u;
    } else {
        borrow = 0u;
    }
    (*res).limbs[3] = (*a).limbs[3] - (*b).limbs[3] - borrow;
    if ((*a).limbs[3] < ((*b).limbs[3] + borrow)) {
        (*res).limbs[3] += 8192;
        borrow = 1u;
    } else {
        borrow = 0u;
    }
    (*res).limbs[4] = (*a).limbs[4] - (*b).limbs[4] - borrow;
    if ((*a).limbs[4] < ((*b).limbs[4] + borrow)) {
        (*res).limbs[4] += 8192;
        borrow = 1u;
    } else {
        borrow = 0u;
    }
    (*res).limbs[5] = (*a).limbs[5] - (*b).limbs[5] - borrow;
    if ((*a).limbs[5] < ((*b).limbs[5] + borrow)) {
        (*res).limbs[5] += 8192;
        borrow = 1u;
    } else {
        borrow = 0u;
    }
    (*res).limbs[6] = (*a).limbs[6] - (*b).limbs[6] - borrow;
    if ((*a).limbs[6] < ((*b).limbs[6] + borrow)) {
        (*res).limbs[6] += 8192;
        borrow = 1u;
    } else {
        borrow = 0u;
    }
    (*res).limbs[7] = (*a).limbs[7] - (*b).limbs[7] - borrow;
    if ((*a).limbs[7] < ((*b).limbs[7] + borrow)) {
        (*res).limbs[7] += 8192;
        borrow = 1u;
    } else {
        borrow = 0u;
    }
    (*res).limbs[8] = (*a).limbs[8] - (*b).limbs[8] - borrow;
    if ((*a).limbs[8] < ((*b).limbs[8] + borrow)) {
        (*res).limbs[8] += 8192;
        borrow = 1u;
    } else {
        borrow = 0u;
    }
    (*res).limbs[9] = (*a).limbs[9] - (*b).limbs[9] - borrow;
    if ((*a).limbs[9] < ((*b).limbs[9] + borrow)) {
        (*res).limbs[9] += 8192;
        borrow = 1u;
    } else {
        borrow = 0u;
    }
    (*res).limbs[10] = (*a).limbs[10] - (*b).limbs[10] - borrow;
    if ((*a).limbs[10] < ((*b).limbs[10] + borrow)) {
        (*res).limbs[10] += 8192;
        borrow = 1u;
    } else {
        borrow = 0u;
    }
    (*res).limbs[11] = (*a).limbs[11] - (*b).limbs[11] - borrow;
    if ((*a).limbs[11] < ((*b).limbs[11] + borrow)) {
        (*res).limbs[11] += 8192;
        borrow = 1u;
    } else {
        borrow = 0u;
    }
    (*res).limbs[12] = (*a).limbs[12] - (*b).limbs[12] - borrow;
    if ((*a).limbs[12] < ((*b).limbs[12] + borrow)) {
        (*res).limbs[12] += 8192;
        borrow = 1u;
    } else {
        borrow = 0u;
    }
    (*res).limbs[13] = (*a).limbs[13] - (*b).limbs[13] - borrow;
    if ((*a).limbs[13] < ((*b).limbs[13] + borrow)) {
        (*res).limbs[13] += 8192;
        borrow = 1u;
    } else {
        borrow = 0u;
    }
    (*res).limbs[14] = (*a).limbs[14] - (*b).limbs[14] - borrow;
    if ((*a).limbs[14] < ((*b).limbs[14] + borrow)) {
        (*res).limbs[14] += 8192;
        borrow = 1u;
    } else {
        borrow = 0u;
    }
    (*res).limbs[15] = (*a).limbs[15] - (*b).limbs[15] - borrow;
    if ((*a).limbs[15] < ((*b).limbs[15] + borrow)) {
        (*res).limbs[15] += 8192;
        borrow = 1u;
    } else {
        borrow = 0u;
    }
    (*res).limbs[16] = (*a).limbs[16] - (*b).limbs[16] - borrow;
    if ((*a).limbs[16] < ((*b).limbs[16] + borrow)) {
        (*res).limbs[16] += 8192;
        borrow = 1u;
    } else {
        borrow = 0u;
    }
    (*res).limbs[17] = (*a).limbs[17] - (*b).limbs[17] - borrow;
    if ((*a).limbs[17] < ((*b).limbs[17] + borrow)) {
        (*res).limbs[17] += 8192;
        borrow = 1u;
    } else {
        borrow = 0u;
    }
    (*res).limbs[18] = (*a).limbs[18] - (*b).limbs[18] - borrow;
    if ((*a).limbs[18] < ((*b).limbs[18] + borrow)) {
        (*res).limbs[18] += 8192;
        borrow = 1u;
    } else {
        borrow = 0u;
    }
    (*res).limbs[19] = (*a).limbs[19] - (*b).limbs[19] - borrow;
    if ((*a).limbs[19] < ((*b).limbs[19] + borrow)) {
        (*res).limbs[19] += 8192;
        borrow = 1u;
    } else {
        borrow = 0u;
    }
    return borrow;
}

fn bigint_gt(x: ptr<function, BigInt>, y: ptr<function, BigInt>) -> u32 {
    if ((*x).limbs[19] < (*y).limbs[19]) {
        return 0u;
    } else if ((*x).limbs[19] > (*y).limbs[19]) {
        return 1u;
    }
    if ((*x).limbs[18] < (*y).limbs[18]) {
        return 0u;
    } else if ((*x).limbs[18] > (*y).limbs[18]) {
        return 1u;
    }
    if ((*x).limbs[17] < (*y).limbs[17]) {
        return 0u;
    } else if ((*x).limbs[17] > (*y).limbs[17]) {
        return 1u;
    }
    if ((*x).limbs[16] < (*y).limbs[16]) {
        return 0u;
    } else if ((*x).limbs[16] > (*y).limbs[16]) {
        return 1u;
    }
    if ((*x).limbs[15] < (*y).limbs[15]) {
        return 0u;
    } else if ((*x).limbs[15] > (*y).limbs[15]) {
        return 1u;
    }
    if ((*x).limbs[14] < (*y).limbs[14]) {
        return 0u;
    } else if ((*x).limbs[14] > (*y).limbs[14]) {
        return 1u;
    }
    if ((*x).limbs[13] < (*y).limbs[13]) {
        return 0u;
    } else if ((*x).limbs[13] > (*y).limbs[13]) {
        return 1u;
    }
    if ((*x).limbs[12] < (*y).limbs[12]) {
        return 0u;
    } else if ((*x).limbs[12] > (*y).limbs[12]) {
        return 1u;
    }
    if ((*x).limbs[11] < (*y).limbs[11]) {
        return 0u;
    } else if ((*x).limbs[11] > (*y).limbs[11]) {
        return 1u;
    }
    if ((*x).limbs[10] < (*y).limbs[10]) {
        return 0u;
    } else if ((*x).limbs[10] > (*y).limbs[10]) {
        return 1u;
    }
    if ((*x).limbs[9] < (*y).limbs[9]) {
        return 0u;
    } else if ((*x).limbs[9] > (*y).limbs[9]) {
        return 1u;
    }
    if ((*x).limbs[8] < (*y).limbs[8]) {
        return 0u;
    } else if ((*x).limbs[8] > (*y).limbs[8]) {
        return 1u;
    }
    if ((*x).limbs[7] < (*y).limbs[7]) {
        return 0u;
    } else if ((*x).limbs[7] > (*y).limbs[7]) {
        return 1u;
    }
    if ((*x).limbs[6] < (*y).limbs[6]) {
        return 0u;
    } else if ((*x).limbs[6] > (*y).limbs[6]) {
        return 1u;
    }
    if ((*x).limbs[5] < (*y).limbs[5]) {
        return 0u;
    } else if ((*x).limbs[5] > (*y).limbs[5]) {
        return 1u;
    }
    if ((*x).limbs[4] < (*y).limbs[4]) {
        return 0u;
    } else if ((*x).limbs[4] > (*y).limbs[4]) {
        return 1u;
    }
    if ((*x).limbs[3] < (*y).limbs[3]) {
        return 0u;
    } else if ((*x).limbs[3] > (*y).limbs[3]) {
        return 1u;
    }
    if ((*x).limbs[2] < (*y).limbs[2]) {
        return 0u;
    } else if ((*x).limbs[2] > (*y).limbs[2]) {
        return 1u;
    }
    if ((*x).limbs[1] < (*y).limbs[1]) {
        return 0u;
    } else if ((*x).limbs[1] > (*y).limbs[1]) {
        return 1u;
    }
    if ((*x).limbs[0] < (*y).limbs[0]) {
        return 0u;
    } else if ((*x).limbs[0] > (*y).limbs[0]) {
        return 1u;
    }
    return 0u;
}

