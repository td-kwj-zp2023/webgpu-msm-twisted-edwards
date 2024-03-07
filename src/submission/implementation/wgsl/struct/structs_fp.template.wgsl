struct BigInt {
    limbs: array<f32, {{ num_words }}>
}

struct Point {
  x: BigInt,
  y: BigInt,
  t: BigInt,
  z: BigInt
}
