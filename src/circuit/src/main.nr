use sha256::sha256_var;
use std::{collections::bounded_vec::BoundedVec, hash::pedersen_hash};
use zkemail::{
    dkim::RSAPubkey, headers::body_hash::get_body_hash, KEY_LIMBS_1024, KEY_LIMBS_2048, Sequence,
};

global MAX_EMAIL_HEADER_LENGTH: u32 = 2048;
global MAX_EMAIL_BODY_LENGTH: u32 = 4096;
global KEY_LIMBS: u32 = KEY_LIMBS_1024;

/**
 * Verify an arbitrary email signed by a 1024-bit or 2048-bit RSA DKIM signature and mask outputs
 *
 * @param header - The email header, 0-padded at end to the MAX_EMAIL_HEADER_LENGTH
 * @param body - The email body, 0-padded at end to the MAX_EMAIL_BODY_LENGTH
 * @param pubkey - The DKIM RSA Public Key modulus and reduction parameter
 * @param signature - The DKIM RSA Signature
 * @param body_hash_index - The index of the body hash in the partial hash array
 * @param dkim_header_sequence - The index and length of the DKIM header field
 * @param header_mask - The mask for the header
 * @param body_mask - The mask for the body
 * @return -
 *         0: Poseidon hash of the DKIM RSA modulus (root of trust; compare to the DNS key)
 *         1: Poseidon hash of the DKIM RSA reduction parameter (redc)
 *         2: Pedersen hash of DKIM signature (email nullifier)
 *         3: header length (bytes covered by the DKIM signature)
 *         4: body length (bytes covered by the body hash)
 *         then the masked header bytes, then the masked body bytes (every byte at index >= length is 0)
 *
 * REASON (outputs 0 and 1): zkemail.nr v2 binds redc into the key hash. Before that fix the 2048-bit
 * hash covered only the modulus, so a prover could pick an arbitrary redc and still match the real
 * key hash (Veridise finding; zkemail.nr PR #62). Verifiers must check BOTH hashes.
 */
fn main(
    header: BoundedVec<u8, MAX_EMAIL_HEADER_LENGTH>,
    body: BoundedVec<u8, MAX_EMAIL_BODY_LENGTH>,
    pubkey: RSAPubkey<KEY_LIMBS>,
    signature: [Field; KEY_LIMBS],
    body_hash_index: u32,
    dkim_header_sequence: Sequence,
    header_mask: [bool; MAX_EMAIL_HEADER_LENGTH],
    body_mask: [bool; MAX_EMAIL_BODY_LENGTH],
) -> pub ([Field; 5], [u8; MAX_EMAIL_HEADER_LENGTH], [u8; MAX_EMAIL_BODY_LENGTH]) {

    // verify the dkim signature over the header
    pubkey.verify_dkim_signature(header, signature);

    // extract the body hash from the header
    let signed_body_hash = get_body_hash(header, dkim_header_sequence, body_hash_index);

    // hash the asserted body
    let computed_body_hash: [u8; 32] = sha256_var(body.storage(), body.len());

    // compare the body hashes
    assert(
        signed_body_hash == computed_body_hash,
        "SHA256 hash computed over body does not match body hash found in DKIM-signed header",
    );

    // mask the header and body
    let masked_header = mask_signed_bytes(header, header_mask);
    let masked_body = mask_signed_bytes(body, body_mask);

    // hash the pubkey and signature for the standard outputs
    let email_nullifier = pedersen_hash(signature);
    let pubkey_hash = pubkey.hash();
    let standard_out = [
        pubkey_hash[0],
        pubkey_hash[1],
        email_nullifier,
        header.len() as Field,
        body.len() as Field,
    ];
    (standard_out, masked_header, masked_body)
}

/**
 * Mask `text` and publish ONLY its first `text.len()` bytes; every later byte is output as 0.
 *
 * REASON (security): zkemail.nr's `mask_text` outputs all N storage bytes, but SHA-256 and the
 * DKIM RSA check cover only the first `len` bytes. Storage past `len` is unconstrained prover
 * input, so a prover could append unsigned text ("\r\nsubject:FORGED…", "I owe you $1,000,000")
 * and it would be displayed as part of the signed email. Found in review of PR #21; regression
 * tests: tests/soundness.test.ts. The same flaw exists in every legacy v1 proof.
 *
 * `in_range` is a running flag that switches off at i == len, which costs about 3 gates per byte.
 * The alternative, a `<` range check per index, costs more.
 */
fn mask_signed_bytes<let N: u32>(text: BoundedVec<u8, N>, mask: [bool; N]) -> [u8; N] {
    let len = text.len();
    let mut out = [0; N];
    let mut in_range = true;
    for i in 0..N {
        in_range = in_range & (i != len);
        out[i] = text.get_unchecked(i) * ((mask[i] & in_range) as u8);
    }
    out
}
