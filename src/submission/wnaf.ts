import { ExtPointType } from "@noble/curves/abstract/edwards";
import { FieldMath } from "../reference/utils/FieldMath";

export const fieldMath = new FieldMath();

const ZERO_POINT = fieldMath.createPoint(
    BigInt(0), BigInt(1), BigInt(0), BigInt(1),
)

export const mods = (
    scalar: number,
    w: number,
) => {
    // From "Guide to Elliptic Curve Cryptography" by Darrel Hankerson, Scott
    // Vanstone, and Alfred Menezes, p99
    // u = scalar mods 2^w 
    // where u = scalar mod 2^w
    // and -2^(w-1) <= u <= 2^(w-1)
    
    const two_w = 2 ** w
    const two_w_m_1 = 2 ** (w - 1)

    let u = scalar % two_w
    if (u > two_w_m_1) {
        const d = u - two_w_m_1
        u = -two_w_m_1 + d
    }
    return u
}

export const wnaf_encode = (
    scalar: number,
    w: number,
): number[] => {
    // From "Guide to Elliptic Curve Cryptography" by Darrel Hankerson, Scott
    // Vanstone, and Alfred Menezes, algorithm 3.35
    const result: number[] = []
    while (scalar >= 1) {
        let ki = 0
        if (scalar % 2 === 1) {
            ki = mods(scalar, w)
            scalar = scalar - ki
        }
        result.push(ki)
        scalar = Math.floor(scalar / 2)
    }
    return result
}

export const wnaf_scalar_mul = (
    scalar: number,
    w: number,
    point: ExtPointType,
) => {
    // From "Guide to Elliptic Curve Cryptography" by Darrel Hankerson, Scott
    // Vanstone, and Alfred Menezes, algorithm 3.36
    const encoding = wnaf_encode(scalar, w)
    const precomputed: ExtPointType[] = [point]

    const two_p = point.double()
    for (let i = 3; i < (2 ** (w-1)); i += 2) {
        const pt = precomputed[(i - 3) / 2].add(two_p)
        precomputed.push(pt)
    }

    let q = ZERO_POINT
    for (let i = encoding.length - 1; i >= 0; i --) {
        q = q.double()

        if (encoding[i] !== 0) {
            const e = (Math.abs(encoding[i]) - 1) / 2

            let p = precomputed[e]

            if (encoding[i] < 0) { 
                p = p.negate()
            }
            q = q.add(p)
        }
    }

    return q
}

export const five_naf_scalar_mul = (
    point: ExtPointType,
    scalar: number,
) => {
    const w = 5
    // From "Guide to Elliptic Curve Cryptography" by Darrel Hankerson, Scott
    // Vanstone, and Alfred Menezes, algorithm 3.36
    const encoding = wnaf_encode(scalar, w)
    const precomputed: ExtPointType[] = [point]

    const two_p = point.double()
    for (let i = 3; i < (2 ** (w-1)); i += 2) {
        const pt = precomputed[(i - 3) / 2].add(two_p)
        precomputed.push(pt)
    }

    let q = ZERO_POINT
    for (let i = encoding.length - 1; i >= 0; i --) {
        q = q.double()
        if (encoding[i] !== 0) {
            const e = (Math.abs(encoding[i]) - 1) / 2

            let p = precomputed[e]

            if (encoding[i] < 0) { 
                p = p.negate()
            }

            q = q.add(p)
        }
    }
    return q
}

