// Quoted-printable decoding, proven in-circuit (Redacted).
//
// Decoding (applied to the signed body's first len bytes, left to right):
//   "=" + 2 hex digits (either case)  -> the byte with that value (e.g. "=3D" -> "=")
//   "=" + CR + LF (soft line break)    -> nothing
//   anything else                      -> itself
// Two escapes can never overlap, because a hex digit is never "=". So each position's role
// depends only on the byte there and the 2 bytes before it, which is what the flags below compute.
//
// Soundness: the prover supplies `decoded`. We check it with a random linear combination: the
// k-th emitted encoded value times r^k must sum to the same as decoded[k] times r^k, where
// r = Poseidon2(packed encoded || packed decoded) (Fiat-Shamir, as zkemail.nr's
// remove_soft_line_breaks does). Bytes of `encoded` past len count as 0; bytes of `decoded` past
// the emitted count must be 0; that count is computed here and returned as the decoded length.

// 16 = not a hex digit
global HEX_VALUE: [u8; 256] = [
    16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16,
    16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 16, 16, 16, 16, 16, 16,
    16, 10, 11, 12, 13, 14, 15, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16,
    16, 10, 11, 12, 13, 14, 15, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16,
    16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16,
    16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16,
    16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16,
    16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16
];

fn poseidon2_sponge<let N: u32>(input: [Field; N]) -> Field {
    let two_pow_64: Field = 18446744073709551616;
    let mut state: [Field; 4] = [0, 0, 0, (N as Field) * two_pow_64];
    let mut cache: [Field; 3] = [0; 3];
    let mut cache_size: u32 = 0;
    for i in 0..N {
        if cache_size == 3 {
            for j in 0..3 {
                state[j] += cache[j];
            }
            state = std::hash::poseidon2_permutation(state);
            cache[0] = input[i];
            cache_size = 1;
        } else {
            cache[cache_size] = input[i];
            cache_size += 1;
        }
    }
    for i in 0..3 {
        if i < cache_size {
            state[i] += cache[i];
        }
    }
    state = std::hash::poseidon2_permutation(state);
    state[0]
}

// 31 bytes per field element (fits below the BN254 modulus)
fn pack31<let N: u32>(bytes: [u8; N]) -> [Field; N / 31 + 1] {
    let mut out: [Field; N / 31 + 1] = [0; N / 31 + 1];
    for i in 0..N {
        out[i / 31] = out[i / 31] * 256 + bytes[i] as Field;
    }
    out
}

/// Check `decoded` is the quoted-printable decoding of encoded[0..encoded_len]; returns its length.
pub fn qp_decode_check<let N: u32>(encoded: [u8; N], encoded_len: u32, decoded: [u8; N]) -> u32 {
    // encoded bytes past encoded_len are unconstrained prover input: treat them as 0
    let mut e: [u8; N] = [0; N];
    let mut in_range: [bool; N] = [false; N];
    let mut inside = true;
    for i in 0..N {
        inside = inside & (i != encoded_len);
        in_range[i] = inside;
        e[i] = encoded[i] * (inside as u8);
    }

    // soft[i]: "=\r\n" starts at i. esc[i]: "=XX" starts at i (value in val[i]).
    let mut soft: [bool; N] = [false; N];
    let mut esc: [bool; N] = [false; N];
    let mut val: [Field; N] = [0; N];
    for i in 0..N - 2 {
        let is_eq = e[i] == 0x3d;
        let h1 = HEX_VALUE[e[i + 1] as u32];
        let h2 = HEX_VALUE[e[i + 2] as u32];
        soft[i] = is_eq & (e[i + 1] == 0x0d) & (e[i + 2] == 0x0a);
        esc[i] = is_eq & (h1 < 16) & (h2 < 16);
        val[i] = (h1 as Field) * 16 + (h2 as Field);
    }

    let r = {
        let pe = pack31(e);
        let pd = pack31(decoded);
        let mut input: [Field; 2 * (N / 31 + 1)] = [0; 2 * (N / 31 + 1)];
        for i in 0..(N / 31 + 1) {
            input[i] = pe[i];
            input[i + N / 31 + 1] = pd[i];
        }
        poseidon2_sponge(input)
    };

    // encoded side: emitted values weighted by r^k, k = number of values emitted before
    let mut enc_acc: Field = 0;
    let mut pow: Field = 1;
    let mut count: u32 = 0;
    for i in 0..N {
        let mut consumed = soft[i];
        if i >= 1 {
            consumed = consumed | soft[i - 1] | esc[i - 1];
        }
        if i >= 2 {
            consumed = consumed | soft[i - 2] | esc[i - 2];
        }
        let emit = in_range[i] & !consumed;
        let v = if esc[i] { val[i] } else { e[i] as Field };
        if emit {
            enc_acc += v * pow;
            pow *= r;
            count += 1;
        }
    }

    // decoded side: r^j weights; everything at or past `count` must be 0
    let mut dec_acc: Field = 0;
    let mut dpow: Field = 1;
    let mut live = true;
    for j in 0..N {
        live = live & (j != count);
        if !live {
            assert(decoded[j] == 0, "decoded body has bytes past its length");
        }
        dec_acc += (decoded[j] as Field) * dpow;
        dpow *= r;
    }
    assert(enc_acc == dec_acc, "decoded body is not the quoted-printable decoding of the signed body");
    count
}
