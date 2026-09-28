use super::sha256_var;

/// This calls the typescript sha256 implementation
#[oracle(getSHA256)]
unconstrained fn sha256_hash_oracle(input: [u8]) -> [u8; 32] {}

unconstrained fn get_sha256_hash(input: [u8]) -> [u8; 32] {
    sha256_hash_oracle(input)
}

#[test]
unconstrained fn test_sha256_1(input: [u8; 1]) {
    // get hash from Noir implementation
    let noir_hash = sha256_var(input, input.len());

    // get hash from typescript implementation
    let ts_hash = get_sha256_hash(input);

    assert_eq(noir_hash, ts_hash);
}

#[test]
unconstrained fn test_sha256_63(input: [u8; 63]) {
    // get hash from Noir implementation
    let noir_hash = sha256_var(input, input.len());

    // get hash from typescript implementation
    let ts_hash = get_sha256_hash(input);

    assert_eq(noir_hash, ts_hash);
}

#[test]
unconstrained fn test_sha256_511(input: [u8; 511]) {
    // get hash from Noir implementation
    let noir_hash = sha256_var(input, input.len());

    // get hash from typescript implementation
    let ts_hash = get_sha256_hash(input);

    assert_eq(noir_hash, ts_hash);
}

#[test]
unconstrained fn test_sha256_512(input: [u8; 512]) {
    // get hash from Noir implementation
    let noir_hash = sha256_var(input, input.len());

    // get hash from typescript implementation
    let ts_hash = get_sha256_hash(input);

    assert_eq(noir_hash, ts_hash);
}
