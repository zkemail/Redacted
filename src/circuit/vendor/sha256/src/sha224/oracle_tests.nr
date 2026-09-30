use super::sha224_var;

/// This calls the typescript sha256 implementation
#[oracle(getSHA224)]
unconstrained fn sha224_hash_oracle(input: [u8]) -> [u8; 28] {}

unconstrained fn get_sha224_hash(input: [u8]) -> [u8; 28] {
    sha224_hash_oracle(input)
}

#[test]
unconstrained fn test_sha224_1(input: [u8; 1]) {
    // get hash from Noir implementation
    let noir_hash = sha224_var(input, input.len());

    // get hash from typescript implementation
    let ts_hash = get_sha224_hash(input);

    assert_eq(noir_hash, ts_hash);
}

#[test]
unconstrained fn test_sha224_63(input: [u8; 63]) {
    // get hash from Noir implementation
    let noir_hash = sha224_var(input, input.len());

    // get hash from typescript implementation
    let ts_hash = get_sha224_hash(input);

    assert_eq(noir_hash, ts_hash);
}

#[test]
unconstrained fn test_sha224_511(input: [u8; 511]) {
    // get hash from Noir implementation
    let noir_hash = sha224_var(input, input.len());

    // get hash from typescript implementation
    let ts_hash = get_sha224_hash(input);

    assert_eq(noir_hash, ts_hash);
}

#[test]
unconstrained fn test_sha224_512(input: [u8; 512]) {
    // get hash from Noir implementation
    let noir_hash = sha224_var(input, input.len());

    // get hash from typescript implementation
    let ts_hash = get_sha224_hash(input);

    assert_eq(noir_hash, ts_hash);
}
