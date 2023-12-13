import { FieldMath } from "../reference/utils/FieldMath";
import { mods, wnaf_scalar_mul, five_naf_scalar_mul, fieldMath } from './wnaf'

describe('wNAF scalar multiplication ', () => {
    it('wNAF encoding', () => {
        const scalar = 1122334455
        //const scalar = 13422
        const w = 5
        const x = BigInt('2796670805570508460920584878396618987767121022598342527208237783066948667246')
        const y = BigInt('8134280397689638111748378379571739274369602049665521098046934931245960532166')
        const t = BigInt('3446088593515175914550487355059397868296219355049460558182099906777968652023')
        const z = BigInt('1')
        const pt = fieldMath.createPoint(x, y, t, z)

        const expected = pt.multiply(BigInt(scalar)).toAffine()
        const result = wnaf_scalar_mul(scalar, w, pt).toAffine()
        const result_five = five_naf_scalar_mul(pt, scalar).toAffine()

        expect(expected.x).toEqual(result.x)
        expect(expected.y).toEqual(result.y)
        expect(expected.x).toEqual(result_five.x)
        expect(expected.y).toEqual(result_five.y)
    })

    it('mods', () => {
        expect(mods(0, 3)).toEqual(0)
        expect(mods(1, 3)).toEqual(1)
        expect(mods(2, 3)).toEqual(2)
        expect(mods(3, 3)).toEqual(3)
        expect(mods(4, 3)).toEqual(4)
        expect(mods(5, 3)).toEqual(-3)
        expect(mods(6, 3)).toEqual(-2)
        expect(mods(7, 3)).toEqual(-1)
        expect(mods(8, 3)).toEqual(0)
        expect(mods(9, 3)).toEqual(1)
        expect(mods(15, 3)).toEqual(-1)
    })
})
