/*
 * Global parameters to seed the program
 */

import { compute_misc_params } from "./utils";

export const p = BigInt("8444461749428370424248824938781546531375899335154063827935233455917409239041");
export const word_size = 13;
export const params = compute_misc_params(p, word_size);
export const num_words = params.num_words;
export const r = params.r;
export const rinv = params.rinv;