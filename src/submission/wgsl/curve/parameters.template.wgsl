// Montgomery radix
fn get_r() -> BigInt {
    var r: BigInt;

    r.limbs[0] = 7973u;
    r.limbs[1] = 8191u;
    r.limbs[2] = 8191u;
    r.limbs[3] = 3839u;
    r.limbs[4] = 1584u;
    r.limbs[5] = 8078u;
    r.limbs[6] = 8191u;
    r.limbs[7] = 129u;
    r.limbs[8] = 3124u;
    r.limbs[9] = 601u;
    r.limbs[10] = 7094u;
    r.limbs[11] = 6328u;
    r.limbs[12] = 4209u;
    r.limbs[13] = 259u;
    r.limbs[14] = 3351u;
    r.limbs[15] = 4579u;
    r.limbs[16] = 7118u;
    r.limbs[17] = 144u;
    r.limbs[18] = 6162u;
    r.limbs[19] = 14u;

    return r;
}

// Montgomery form of Edwards curve 
fn get_edwards_d() -> BigInt {
    var d: BigInt;
    
    d.limbs[0] = 760u;
    d.limbs[1] = 8111u;
    d.limbs[2] = 8191u;
    d.limbs[3] = 2047u;
    d.limbs[4] = 2879u;
    d.limbs[5] = 7826u;
    d.limbs[6] = 8149u;
    d.limbs[7] = 3887u;
    d.limbs[8] = 7498u;
    d.limbs[9] = 489u;
    d.limbs[10] = 5641u;
    d.limbs[11] = 7817u;
    d.limbs[12] = 1758u;
    d.limbs[13] = 6342u;
    d.limbs[14] = 5673u;
    d.limbs[15] = 2217u;
    d.limbs[16] = 2688u;
    d.limbs[17] = 7853u;
    d.limbs[18] = 7621u;
    d.limbs[19] = 20u;
    
    return d;
}