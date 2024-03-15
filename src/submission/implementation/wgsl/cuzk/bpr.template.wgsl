{{> structs }}
{{> montgomery_product_funcs }}
{{> field_funcs }}
{{> bigint_funcs }}
{{> ec_funcs }}

/// Used as input buffers for the bucket sums from SMVP, but also repurposed to
/// store the m points.
@group(0) @binding(0)
var<storage, read_write> bucket_sum_x: array<BigInt>;
@group(0) @binding(1)
var<storage, read_write> bucket_sum_y: array<BigInt>;
@group(0) @binding(2)
var<storage, read_write> bucket_sum_t: array<BigInt>;
@group(0) @binding(3)
var<storage, read_write> bucket_sum_z: array<BigInt>;

/// Output buffers to store the g points.
@group(0) @binding(4)
var<storage, read_write> g_points_x: array<u32>;
@group(0) @binding(5)
var<storage, read_write> g_points_y: array<BigInt>;
@group(0) @binding(6)
var<storage, read_write> g_points_t: array<BigInt>;
@group(0) @binding(7)
var<storage, read_write> g_points_z: array<BigInt>;

// Unfiform storage buffer.
@group(0) @binding(8)
var<uniform> params: vec2<u32>;

fn get_r() -> BigInt {
    var r: BigInt;
{{{ r_limbs }}}
    return r;
}

fn get_paf() -> Point {
    var result: Point;
    let r = get_r();
    result.y = r;
    result.z = r;
    return result;
}
/// This double-and-add code is adapted from the ZPrize test harness:
/// https://github.com/demox-labs/webgpu-msm/blob/main/src/reference/webgpu/wgsl/Curve.ts#L78.
fn double_and_add(point: Point, scalar: u32) -> Point {
    /// Set result to the point at infinity.
    var result: Point = get_paf();

    var s = scalar;
    var temp = point;

    while (s != 0u) {
        if ((s & 1u) == 1u) {
            result = add_points(result, temp);
        }
        temp = double_point(temp);
        s = s >> 1u;
    }
    return result;
}

@compute
@workgroup_size({{ workgroup_size }})
fn stage_1(@builtin(global_invocation_id) global_id: vec3<u32>) {    
    let thread_id = global_id.x; 
    let num_threads = {{ workgroup_size }}u;

    let subtask_idx = params[0];
    let num_columns = params[1];

    /// Number of buckets per subtask.
    let n = num_columns / 2u;

    /// Number of buckets to reduce per thread.
    let buckets_per_thread = n / 256u;

    /// Bucket offset per 2 subtasks.
    let bucket_sum_offset = n * subtask_idx; // (num_columns * subtask_idx) / 2; 

    /// subtask_idx offsets:
    /// 2^16 * 0 = 0
    /// (2^16 * 2) / 2 = 2^16
    /// (2^16 * 4) / 2 = 2^16 * 2
    /// (2^16 * 6) / 2 = 2^16 * 3
    /// (2^16 * 8) / 2 = 2^16 * 4
    /// (2^16 * 10) / 2 = 2^16 * 5
    /// (2^16 * 12) / 2 = 2^16 * 6
    /// (2^16 * 14) / 2 = 2^16 * 7

    var idx = bucket_sum_offset; 
    if (thread_id != 0u) {
        idx = (num_threads - thread_id) * buckets_per_thread + bucket_sum_offset; 
        /// Iteration 0 (256 threads):
        /// thread 0 idx = 0
        /// thread 1 idx = (256 - 1) * 128 + 0 = 32640
        /// thread 2 idx = (256 - 2) * 128 + 0 = 32512
        /// ...
        /// thread 255 idx = (256 - 255) * 128 + 0 = 128

        /// Iteraton 1 (256 threads):
        /// thread 0 idx = 2^15 = 32,768
        /// thread 1 idx = (256 - 1) * 128 + 2^15 = 65408
        /// thread 2 idx = (256 - 2) * 128 + 2^15 = 65280
        /// ...
        /// thread 255 idx = (256 - 255) * 128 + 2^15 = 32896

        ///////////////////////////////////////////////////////
        /// Iteration 0 + 1 (512 threads)
        /// thread 0 idx = 0
        /// thread 1 idx = (512 - 1) * 128 + 0 = 65408
        /// thread 2 idx = (512 - 2) * 128 + 0 = 65280
        /// thread 256 idx = (512 - 256) * 128 + 0 = 32768
        /// ...
        /// thread 511 idx = (512 - 511) * 128 + 0 = 128

        /// --> seems to be the same to me.
    }

    var m = Point(
        bucket_sum_x[idx],
        bucket_sum_y[idx],
        bucket_sum_t[idx],
        bucket_sum_z[idx]
    );
    var g = m;

    // --> seems to be the same to me.

    for (var i = 0u; i < buckets_per_thread - 1u; i++) {
        let idx = (num_threads - thread_id) * buckets_per_thread - 1u - i;
        /// Iteration 0 (256 threads):
        /// thread 0:
        /// idx = (256 - 0) * 128 - 1 - 0 = 32767
        /// idx = (256 - 0) * 128 - 1 - 1 = 32766
        /// ...
        /// idx = (256 - 0) * 128 - 1 - 127 = 32640   
        /// thread 1:
        /// idx = (256 - 1) * 128 - 1 - 0 = 32639
        /// idx = (256 - 1) * 128 - 1 - 1 = 32638
        /// ...
        /// idx = (256 - 1) * 128 - 1 - 127 = 32512
        ///       
        /// Iteration 1 (256 threads):
        /// same

        /////////////////////////////////////
        /// Iteration 0 + 1 (512 threads):
        /// thread 0:
        /// idx = (512 - 0) * 128 - 1 - 0 = 65535
        /// idx = (512 - 0) * 128 - 1 - 1 = 65534
        /// ...
        /// idx = (512 - 0) * 128 - 1 - 127 = 65408   
        /// thread 1:
        /// idx = (512 - 1) * 128 - 1 - 0 = 65407
        /// idx = (512 - 1) * 128 - 1 - 1 = 65406
        /// ...
        /// idx = (512 - 1) * 128 - 1 - 127 = 65280   
        /// 
        /// Iteration 1:
        /// same
        
        let bi = bucket_sum_offset + idx;
        /// Iteration 0 (256 threads):
        /// thread 0:
        /// idx 0 = 0 + 32767 = 32767
        /// idx 1 = 0 + 32766 = 32766
        /// ...
        /// idx 127 =  0 + 32640 = 32640
        /// 
        /// Iteration 1 (256 threads): 
        /// thread 0:
        /// idx 0: 2^15 + 32767 = 65535
        /// idx 1: 2^15 + 32766 = 65534
        /// ...
        /// idx 127: 2^15 + 32640 = 65408     

        ///////////////////////////////////
        /// Iteration 0 + 1 (512 threads):
        /// thread 0:
        /// idx 0 = 0 + 65535 = 65535
        /// idx 1 = 0 + 65534 = 65534
        /// ...
        /// idx 127 =  0 + 65408 = 65408

        let b = Point(
            bucket_sum_x[bi],
            bucket_sum_y[bi],
            bucket_sum_t[bi],
            bucket_sum_z[bi]
        );

        /// Iteration 0 (256 threads):
        /// thread 0:
        /// bucket_sum_x[32767]
        /// bucket_sum_x[32766]
        /// ...
        /// bucket_sum_x[32640]
        ///
        /// Iteration 1 (256 threads):
        /// bucket_sum_x[65535]
        /// bucket_sum_x[65534]
        /// ...
        /// bucket_sum_x[65408]

        /////////////////////////////////
        /// Iteration 0 + 1 (512 threads);
        /// bucket_sum_x[65535]
        /// bucket_sum_x[65534]
        /// ....
        /// bucket_sum_x[65408]

        m = add_points(m, b);
        g = add_points(g, m);
    }

    /// --> why isn't this the same for me!

    bucket_sum_x[idx] = m.x;
    bucket_sum_y[idx] = m.y;
    bucket_sum_t[idx] = m.t;
    bucket_sum_z[idx] = m.z;

    let t = subtask_idx * num_threads + thread_id;
    g_points_x[t] = idx;
    // g_points_y[t] = g.y;
    // g_points_t[t] = g.t;
    // g_points_z[t] = g.z;

    {{{ recompile }}}
}

// @compute
// @workgroup_size({{ workgroup_size }})
// fn stage_2(@builtin(global_invocation_id) global_id: vec3<u32>) {    
//     let thread_id = global_id.x; 
//     let num_threads = {{ workgroup_size }}u;

//     let subtask_idx = params[0];
//     let num_columns = params[1];

//     /// Number of buckets per subtask.
//     let n = num_columns / 2u;

//     /// Number of buckets to reduce per thread.
//     let buckets_per_thread = n / num_threads;
//     let bucket_sum_offset = n * subtask_idx;

//     var idx = bucket_sum_offset; 
//     if (thread_id != 0u) {
//         idx = (num_threads - thread_id) * buckets_per_thread + bucket_sum_offset;
//     }

//     var m = Point(
//         bucket_sum_x[idx],
//         bucket_sum_y[idx],
//         bucket_sum_t[idx],
//         bucket_sum_z[idx]
//     );

//     let t = subtask_idx * num_threads + thread_id;
//     var g = Point(
//         g_points_x[t],
//         g_points_y[t],
//         g_points_t[t],
//         g_points_z[t],
//     );

//     /// Perform scalar mul on m and add the result to g.
//     let s = buckets_per_thread * (num_threads - thread_id - 1u);
//     g = add_points(g, double_and_add(m, s));

//     g_points_x[t] = g.x;
//     g_points_y[t] = g.y;
//     g_points_t[t] = g.t;
//     g_points_z[t] = g.z;

//     {{{ recompile }}}
// }
