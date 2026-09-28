use super::{
    attach_len_to_msg_block, build_msg_block, partial_sha256_var_end,
    partial_sha256_var_interstitial, sha256, sha256_var,
};
use super::constants::{INITIAL_STATE, INT_BLOCK};

#[export]
fn test_sha256_1(input: [u8; 1], len: u32) -> [u8; 32] {
    sha256_var(input, len)
}

#[export]
fn test_sha256_200(input: [u8; 200], len: u32) -> [u8; 32] {
    sha256_var(input, len)
}

#[export]
fn test_sha256_511(input: [u8; 511], len: u32) -> [u8; 32] {
    sha256_var(input, len)
}

#[export]
fn test_sha256_512(input: [u8; 512], len: u32) -> [u8; 32] {
    sha256_var(input, len)
}

#[test]
fn empty_sha256() {
    let input = [];
    let result = [
        0xe3, 0xb0, 0xc4, 0x42, 0x98, 0xfc, 0x1c, 0x14, 0x9a, 0xfb, 0xf4, 0xc8, 0x99, 0x6f, 0xb9,
        0x24, 0x27, 0xae, 0x41, 0xe4, 0x64, 0x9b, 0x93, 0x4c, 0xa4, 0x95, 0x99, 0x1b, 0x78, 0x52,
        0xb8, 0x55,
    ];
    assert_eq(sha256_var(input, input.len()), result);
}

#[test]
fn smoke_test() {
    let input = [0xbd];
    let result = [
        0x68, 0x32, 0x57, 0x20, 0xaa, 0xbd, 0x7c, 0x82, 0xf3, 0x0f, 0x55, 0x4b, 0x31, 0x3d, 0x05,
        0x70, 0xc9, 0x5a, 0xcc, 0xbb, 0x7d, 0xc4, 0xb5, 0xaa, 0xe1, 0x12, 0x04, 0xc0, 0x8f, 0xfe,
        0x73, 0x2b,
    ];
    assert_eq(sha256_var(input, input.len()), result);
}

#[test]
fn msg_just_over_block() {
    let input = [
        102, 114, 111, 109, 58, 114, 117, 110, 110, 105, 101, 114, 46, 108, 101, 97, 103, 117, 101,
        115, 46, 48, 106, 64, 105, 99, 108, 111, 117, 100, 46, 99, 111, 109, 13, 10, 99, 111, 110,
        116, 101, 110, 116, 45, 116, 121, 112, 101, 58, 116, 101, 120, 116, 47, 112, 108, 97, 105,
        110, 59, 32, 99, 104, 97, 114, 115, 101, 116,
    ];
    let result = [
        91, 122, 146, 93, 52, 109, 133, 148, 171, 61, 156, 70, 189, 238, 153, 7, 222, 184, 94, 24,
        65, 114, 192, 244, 207, 199, 87, 232, 192, 224, 171, 207,
    ];
    assert_eq(sha256_var(input, input.len()), result);
}

#[test]
fn msg_multiple_over_block() {
    let input = [
        102, 114, 111, 109, 58, 114, 117, 110, 110, 105, 101, 114, 46, 108, 101, 97, 103, 117, 101,
        115, 46, 48, 106, 64, 105, 99, 108, 111, 117, 100, 46, 99, 111, 109, 13, 10, 99, 111, 110,
        116, 101, 110, 116, 45, 116, 121, 112, 101, 58, 116, 101, 120, 116, 47, 112, 108, 97, 105,
        110, 59, 32, 99, 104, 97, 114, 115, 101, 116, 61, 117, 115, 45, 97, 115, 99, 105, 105, 13,
        10, 109, 105, 109, 101, 45, 118, 101, 114, 115, 105, 111, 110, 58, 49, 46, 48, 32, 40, 77,
        97, 99, 32, 79, 83, 32, 88, 32, 77, 97, 105, 108, 32, 49, 54, 46, 48, 32, 92, 40, 51, 55,
        51, 49, 46, 53, 48, 48, 46, 50, 51, 49, 92, 41, 41, 13, 10, 115, 117, 98, 106, 101, 99, 116,
        58, 72, 101, 108, 108, 111, 13, 10, 109, 101, 115, 115, 97, 103, 101, 45, 105, 100, 58, 60,
        56, 70, 56, 49, 57, 68, 51, 50, 45, 66, 54, 65, 67, 45, 52, 56, 57, 68, 45, 57, 55, 55, 70,
        45, 52, 51, 56, 66, 66, 67, 52, 67, 65, 66, 50, 55, 64, 109, 101, 46, 99, 111, 109, 62, 13,
        10, 100, 97, 116, 101, 58, 83, 97, 116, 44, 32, 50, 54, 32, 65, 117, 103, 32, 50, 48, 50,
        51, 32, 49, 50, 58, 50, 53, 58, 50, 50, 32, 43, 48, 52, 48, 48, 13, 10, 116, 111, 58, 122,
        107, 101, 119, 116, 101, 115, 116, 64, 103, 109, 97, 105, 108, 46, 99, 111, 109, 13, 10,
        100, 107, 105, 109, 45, 115, 105, 103, 110, 97, 116, 117, 114, 101, 58, 118, 61, 49, 59, 32,
        97, 61, 114, 115, 97, 45, 115, 104, 97, 50, 53, 54, 59, 32, 99, 61, 114, 101, 108, 97, 120,
        101, 100, 47, 114, 101, 108, 97, 120, 101, 100, 59, 32, 100, 61, 105, 99, 108, 111, 117,
        100, 46, 99, 111, 109, 59, 32, 115, 61, 49, 97, 49, 104, 97, 105, 59, 32, 116, 61, 49, 54,
        57, 51, 48, 51, 56, 51, 51, 55, 59, 32, 98, 104, 61, 55, 120, 81, 77, 68, 117, 111, 86, 86,
        85, 52, 109, 48, 87, 48, 87, 82, 86, 83, 114, 86, 88, 77, 101, 71, 83, 73, 65, 83, 115, 110,
        117, 99, 75, 57, 100, 74, 115, 114, 99, 43, 118, 85, 61, 59, 32, 104, 61, 102, 114, 111,
        109, 58, 67, 111, 110, 116, 101, 110, 116, 45, 84, 121, 112, 101, 58, 77, 105, 109, 101, 45,
        86, 101, 114, 115, 105, 111, 110, 58, 83, 117, 98, 106, 101, 99,
    ];
    let result = [
        116, 90, 151, 31, 78, 22, 138, 180, 211, 189, 69, 76, 227, 200, 155, 29, 59, 123, 154, 60,
        47, 153, 203, 129, 157, 251, 48, 2, 79, 11, 65, 47,
    ];
    assert_eq(sha256_var(input, input.len()), result);
}

#[test]
fn msg_just_under_block() {
    let input = [
        102, 114, 111, 109, 58, 114, 117, 110, 110, 105, 101, 114, 46, 108, 101, 97, 103, 117, 101,
        115, 46, 48, 106, 64, 105, 99, 108, 111, 117, 100, 46, 99, 111, 109, 13, 10, 99, 111, 110,
        116, 101, 110, 116, 45, 116, 121, 112, 101, 58, 116, 101, 120, 116, 47, 112, 108, 97, 105,
        110, 59,
    ];
    let result = [
        143, 140, 76, 173, 222, 123, 102, 68, 70, 149, 207, 43, 39, 61, 34, 79, 216, 252, 213, 165,
        74, 16, 110, 74, 29, 64, 138, 167, 30, 1, 9, 119,
    ];
    assert_eq(sha256_var(input, input.len()), result);
}

#[test]
fn msg_big_not_block_multiple() {
    let input = [
        102, 114, 111, 109, 58, 114, 117, 110, 110, 105, 101, 114, 46, 108, 101, 97, 103, 117, 101,
        115, 46, 48, 106, 64, 105, 99, 108, 111, 117, 100, 46, 99, 111, 109, 13, 10, 99, 111, 110,
        116, 101, 110, 116, 45, 116, 121, 112, 101, 58, 116, 101, 120, 116, 47, 112, 108, 97, 105,
        110, 59, 32, 99, 104, 97, 114, 115, 101, 116, 61, 117, 115, 45, 97, 115, 99, 105, 105, 13,
        10, 109, 105, 109, 101, 45, 118, 101, 114, 115, 105, 111, 110, 58, 49, 46, 48, 32, 40, 77,
        97, 99, 32, 79, 83, 32, 88, 32, 77, 97, 105, 108, 32, 49, 54, 46, 48, 32, 92, 40, 51, 55,
        51, 49, 46, 53, 48, 48, 46, 50, 51, 49, 92, 41, 41, 13, 10, 115, 117, 98, 106, 101, 99, 116,
        58, 72, 101, 108, 108, 111, 13, 10, 109, 101, 115, 115, 97, 103, 101, 45, 105, 100, 58, 60,
        56, 70, 56, 49, 57, 68, 51, 50, 45, 66, 54, 65, 67, 45, 52, 56, 57, 68, 45, 57, 55, 55, 70,
        45, 52, 51, 56, 66, 66, 67, 52, 67, 65, 66, 50, 55, 64, 109, 101, 46, 99, 111, 109, 62, 13,
        10, 100, 97, 116, 101, 58, 83, 97, 116, 44, 32, 50, 54, 32, 65, 117, 103, 32, 50, 48, 50,
        51, 32, 49, 50, 58, 50, 53, 58, 50, 50, 32, 43, 48, 52, 48, 48, 13, 10, 116, 111, 58, 122,
        107, 101, 119, 116, 101, 115, 116, 64, 103, 109, 97, 105, 108, 46, 99, 111, 109, 13, 10,
        100, 107, 105, 109, 45, 115, 105, 103, 110, 97, 116, 117, 114, 101, 58, 118, 61, 49, 59, 32,
        97, 61, 114, 115, 97, 45, 115, 104, 97, 50, 53, 54, 59, 32, 99, 61, 114, 101, 108, 97, 120,
        101, 100, 47, 114, 101, 108, 97, 120, 101, 100, 59, 32, 100, 61, 105, 99, 108, 111, 117,
        100, 46, 99, 111, 109, 59, 32, 115, 61, 49, 97, 49, 104, 97, 105, 59, 32, 116, 61, 49, 54,
        57, 51, 48, 51, 56, 51, 51, 55, 59, 32, 98, 104, 61, 55, 120, 81, 77, 68, 117, 111, 86, 86,
        85, 52, 109, 48, 87, 48, 87, 82, 86, 83, 114, 86, 88, 77, 101, 71, 83, 73, 65, 83, 115, 110,
        117, 99, 75, 57, 100, 74, 115, 114, 99, 43, 118, 85, 61, 59, 32, 104, 61, 102, 114, 111,
        109, 58, 67, 111, 110, 116, 101, 110, 116, 45, 84, 121, 112, 101, 58, 77, 105, 109, 101, 45,
        86, 101, 114, 115, 105, 111, 110, 58, 83, 117, 98, 106, 101, 99, 116, 58, 77, 101, 115, 115,
        97, 103, 101, 45, 73, 100, 58, 68, 97, 116, 101, 58, 116, 111, 59, 32, 98, 61,
    ];
    let result = [
        112, 144, 73, 182, 208, 98, 9, 238, 54, 229, 61, 145, 222, 17, 72, 62, 148, 222, 186, 55,
        192, 82, 220, 35, 66, 47, 193, 200, 22, 38, 26, 186,
    ];
    assert_eq(sha256_var(input, input.len()), result);
}

#[test]
fn msg_big_with_padding() {
    let input = [
        48, 130, 1, 37, 2, 1, 0, 48, 11, 6, 9, 96, 134, 72, 1, 101, 3, 4, 2, 1, 48, 130, 1, 17, 48,
        37, 2, 1, 1, 4, 32, 176, 223, 31, 133, 108, 84, 158, 102, 70, 11, 165, 175, 196, 12, 201,
        130, 25, 131, 46, 125, 156, 194, 28, 23, 55, 133, 157, 164, 135, 136, 220, 78, 48, 37, 2, 1,
        2, 4, 32, 190, 82, 180, 235, 222, 33, 79, 50, 152, 136, 142, 35, 116, 224, 6, 242, 156, 141,
        128, 248, 10, 61, 98, 86, 248, 45, 207, 210, 90, 232, 175, 38, 48, 37, 2, 1, 3, 4, 32, 0,
        194, 104, 108, 237, 246, 97, 230, 116, 198, 69, 110, 26, 87, 17, 89, 110, 199, 108, 250, 36,
        21, 39, 87, 110, 102, 250, 213, 174, 131, 171, 174, 48, 37, 2, 1, 11, 4, 32, 136, 155, 87,
        144, 111, 15, 152, 127, 85, 25, 154, 81, 20, 58, 51, 75, 193, 116, 234, 0, 60, 30, 29, 30,
        183, 141, 72, 247, 255, 203, 100, 124, 48, 37, 2, 1, 12, 4, 32, 41, 234, 106, 78, 31, 11,
        114, 137, 237, 17, 92, 71, 134, 47, 62, 78, 189, 233, 201, 214, 53, 4, 47, 189, 201, 133, 6,
        121, 34, 131, 64, 142, 48, 37, 2, 1, 13, 4, 32, 91, 222, 210, 193, 62, 222, 104, 82, 36, 41,
        138, 253, 70, 15, 148, 208, 156, 45, 105, 171, 241, 195, 185, 43, 217, 162, 146, 201, 222,
        89, 238, 38, 48, 37, 2, 1, 14, 4, 32, 76, 123, 216, 13, 51, 227, 72, 245, 59, 193, 238, 166,
        103, 49, 23, 164, 171, 188, 194, 197, 156, 187, 249, 28, 198, 95, 69, 15, 182, 56, 54, 38,
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    ];
    let result = [
        32, 85, 108, 174, 127, 112, 178, 182, 8, 43, 134, 123, 192, 211, 131, 66, 184, 240, 212,
        181, 240, 180, 106, 195, 24, 117, 54, 129, 19, 10, 250, 53,
    ];
    let message_size = 297;
    assert_eq(sha256_var(input, message_size), result);
}

#[test]
fn msg_big_no_padding() {
    let input = [
        48, 130, 1, 37, 2, 1, 0, 48, 11, 6, 9, 96, 134, 72, 1, 101, 3, 4, 2, 1, 48, 130, 1, 17, 48,
        37, 2, 1, 1, 4, 32, 176, 223, 31, 133, 108, 84, 158, 102, 70, 11, 165, 175, 196, 12, 201,
        130, 25, 131, 46, 125, 156, 194, 28, 23, 55, 133, 157, 164, 135, 136, 220, 78, 48, 37, 2, 1,
        2, 4, 32, 190, 82, 180, 235, 222, 33, 79, 50, 152, 136, 142, 35, 116, 224, 6, 242, 156, 141,
        128, 248, 10, 61, 98, 86, 248, 45, 207, 210, 90, 232, 175, 38, 48, 37, 2, 1, 3, 4, 32, 0,
        194, 104, 108, 237, 246, 97, 230, 116, 198, 69, 110, 26, 87, 17, 89, 110, 199, 108, 250, 36,
        21, 39, 87, 110, 102, 250, 213, 174, 131, 171, 174, 48, 37, 2, 1, 11, 4, 32, 136, 155, 87,
        144, 111, 15, 152, 127, 85, 25, 154, 81, 20, 58, 51, 75, 193, 116, 234, 0, 60, 30, 29, 30,
        183, 141, 72, 247, 255, 203, 100, 124, 48, 37, 2, 1, 12, 4, 32, 41, 234, 106, 78, 31, 11,
        114, 137, 237, 17, 92, 71, 134, 47, 62, 78, 189, 233, 201, 214, 53, 4, 47, 189, 201, 133, 6,
        121, 34, 131, 64, 142, 48, 37, 2, 1, 13, 4, 32, 91, 222, 210, 193, 62, 222, 104, 82, 36, 41,
        138, 253, 70, 15, 148, 208, 156, 45, 105, 171, 241, 195, 185, 43, 217, 162, 146, 201, 222,
        89, 238, 38, 48, 37, 2, 1, 14, 4, 32, 76, 123, 216, 13, 51, 227, 72, 245, 59, 193, 238, 166,
        103, 49, 23, 164, 171, 188, 194, 197, 156, 187, 249, 28, 198, 95, 69, 15, 182, 56, 54, 38,
    ];
    let result = [
        32, 85, 108, 174, 127, 112, 178, 182, 8, 43, 134, 123, 192, 211, 131, 66, 184, 240, 212,
        181, 240, 180, 106, 195, 24, 117, 54, 129, 19, 10, 250, 53,
    ];
    assert_eq(sha256_var(input, input.len()), result);
}

#[test]
fn same_msg_len_variable_padding() {
    let input = [
        29, 81, 165, 84, 243, 114, 101, 37, 242, 146, 127, 99, 69, 145, 39, 72, 213, 39, 253, 179,
        218, 37, 217, 201, 172, 93, 198, 50, 249, 70, 15, 30, 162, 112, 187, 40, 140, 9, 236, 53,
        32, 44, 38, 163, 113, 254, 192, 197, 44, 89, 71, 130, 169, 242, 17, 211, 214, 72, 19, 178,
        186, 168, 147, 127, 99, 101, 252, 227, 8, 147, 150, 85, 97, 158, 17, 107, 218, 244, 82, 113,
        247, 91, 208, 214, 60, 244, 87, 137, 173, 201, 130, 18, 66, 56, 198, 149, 207, 189, 175,
        120, 123, 224, 177, 167, 251, 159, 143, 110, 68, 183, 189, 70, 126, 32, 35, 164, 44, 30, 44,
        12, 65, 18, 62, 239, 242, 2, 248, 104, 2, 178, 64, 28, 126, 36, 137, 24, 14, 116, 91, 98,
        90, 159, 218, 102, 45, 11, 110, 223, 245, 184, 52, 99, 59, 245, 136, 175, 3, 72, 164, 146,
        145, 116, 22, 66, 24, 49, 193, 121, 3, 60, 37, 41, 97, 3, 190, 66, 195, 225, 63, 46, 3, 118,
        4, 208, 15, 1, 40, 254, 235, 151, 123, 70, 180, 170, 44, 172, 90, 4, 254, 53, 239, 116, 246,
        67, 56, 129, 61, 22, 169, 213, 65, 27, 216, 116, 162, 239, 214, 207, 126, 177, 20, 100, 25,
        48, 143, 84, 215, 70, 197, 53, 65, 70, 86, 172, 61, 62, 9, 212, 167, 169, 133, 41, 126, 213,
        196, 33, 192, 238, 0, 63, 246, 215, 58, 128, 110, 101, 92, 3, 170, 214, 130, 149, 52, 81,
        125, 118, 233, 3, 118, 193, 104, 207, 120, 115, 77, 253, 191, 122, 0, 107, 164, 207, 113,
        81, 169, 36, 201, 228, 74, 134, 131, 218, 178, 35, 30, 216, 101, 2, 103, 174, 87, 95, 50,
        50, 215, 157, 5, 210, 188, 54, 211, 78, 45, 199, 96, 121, 241, 241, 176, 226, 194, 134, 130,
        89, 217, 210, 186, 32, 140, 39, 91, 103, 212, 26, 87, 32, 72, 144, 228, 230, 117, 99, 188,
        50, 15, 69, 79, 179, 50, 12, 106, 86, 218, 101, 73, 142, 243, 29, 250, 122, 228, 233, 29,
        255, 22, 121, 114, 125, 103, 41, 250, 241, 179, 126, 158, 198, 116, 209, 65, 94, 98, 228,
        175, 169, 96, 3, 9, 233, 133, 214, 55, 161, 164, 103, 80, 85, 24, 186, 64, 167, 92, 131, 53,
        101, 202, 47, 25, 104, 118, 155, 14, 12, 12, 25, 116, 45, 221, 249, 28, 246, 212, 200, 157,
        167, 169, 56, 197, 181, 4, 245, 146, 1, 140, 234, 191, 212, 228, 125, 87, 81, 86, 119, 30,
        63, 129, 143, 32, 96,
    ];

    // Prepare inputs of different lengths
    let mut input_511 = [0; 511];
    let mut input_512 = [0; 512]; // Next block
    let mut input_575 = [0; 575];
    let mut input_576 = [0; 576]; // Next block
    for i in 0..input.len() {
        input_511[i] = input[i];
        input_512[i] = input[i];
        input_575[i] = input[i];
        input_576[i] = input[i];
    }

    // Compute hashes of all inputs (with same message length)
    let fixed_length_hash = sha256(input);
    let var_full_length_hash = sha256_var(input, input.len());
    let var_length_hash_511 = sha256_var(input_511, input.len());
    let var_length_hash_512 = sha256_var(input_512, input.len());
    let var_length_hash_575 = sha256_var(input_575, input.len());
    let var_length_hash_576 = sha256_var(input_576, input.len());

    // All of the above should have produced the same hash
    assert_eq(var_full_length_hash, fixed_length_hash);
    assert_eq(var_length_hash_511, fixed_length_hash);
    assert_eq(var_length_hash_512, fixed_length_hash);
    assert_eq(var_length_hash_575, fixed_length_hash);
    assert_eq(var_length_hash_576, fixed_length_hash);
}

// Construct a u32 out of 4 bytes.
fn make_item(b0: u8, b1: u8, b2: u8, b3: u8) -> u32 {
    let mut item = b0 as u32;
    item = (item << 8) + b1 as u32;
    item = (item << 8) + b2 as u32;
    item = (item << 8) + b3 as u32;
    item
}

#[test]
fn test_build_msg_block_start_0() {
    let input = [
        102, 114, 111, 109, 58, 114, 117, 110, 110, 105, 101, 114, 46, 108, 101, 97, 103, 117, 101,
        115, 46, 48,
    ];
    assert_eq(input.len(), 22);
    let (msg_block) = build_msg_block(input, input.len(), 0);
    assert_eq(msg_block[0], make_item(input[0], input[1], input[2], input[3]));
    assert_eq(msg_block[1], make_item(input[4], input[5], input[6], input[7]));
    assert_eq(msg_block[5], make_item(input[20], input[21], 0, 0));
    assert_eq(msg_block[6], 0);
}

#[test]
fn test_build_msg_block_start_1() {
    let input = [
        102, 114, 111, 109, 58, 114, 117, 110, 110, 105, 101, 114, 46, 108, 101, 97, 103, 117, 101,
        115, 46, 48, 106, 64, 105, 99, 108, 111, 117, 100, 46, 99, 111, 109, 13, 10, 99, 111, 110,
        116, 101, 110, 116, 45, 116, 121, 112, 101, 58, 116, 101, 120, 116, 47, 112, 108, 97, 105,
        110, 59, 32, 99, 104, 97, 114, 115, 101, 116,
    ];
    assert_eq(input.len(), 68);
    let msg_block = build_msg_block(input, input.len(), 64);
    assert_eq(msg_block[0], make_item(input[64], input[65], input[66], input[67]));
    assert_eq(msg_block[1], 0);
}

#[test]
// last 8 bytes of msg_block for message_size = 1 is 00 00 00 00 00 00 00 08
fn test_attach_len_to_msg_block() {
    let input: INT_BLOCK =
        [2152555847, 1397309779, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1849316213, 1651139939];
    let msg_block = attach_len_to_msg_block(input, 1);
    for i in 0..14 {
        assert_eq(msg_block[i], input[i]);
    }
    assert_eq(msg_block[14], 0);
    assert_eq(msg_block[15], 8);
}

#[test]
fn regression_test_partial_hash_non_block_aligned() {
    let mut data = [0; 100];
    for i in 0..data.len() {
        // Non-zero, position-dependent bytes so the tail actually changes the hash.
        data[i] = ((i * 7 + 1) % 256) as u8;
    }
    let hash = partial_sha256_var_end(INITIAL_STATE, data, 64, data.len());
    let correct_hash = sha256_var(data, data.len());
    assert_eq(hash, correct_hash);
}

#[test]
fn fuzz_test_partial_hash(data: [u8; 192]) {
    let mut data0 = [0; 128];
    for i in 0..data0.len() {
        data0[i] = data[i];
    }
    let mut data1 = [0; 64];
    for i in 0..data1.len() {
        data1[i] = data[data0.len() + i];
    }
    let state = partial_sha256_var_interstitial(INITIAL_STATE, data0, 128);
    let hash = partial_sha256_var_end(state, data1, data1.len(), data.len());
    let correct_hash = sha256_var(data, data.len());
    assert_eq(hash, correct_hash);
}

#[test]
fn fuzz_test_partial_hash_interstitial(data: [u8; 192]) {
    let mut data0 = [0; 64];
    let mut data1 = [0; 64];
    let mut data2 = [0; 64];
    for i in 0..data0.len() {
        data0[i] = data[i];
        data1[i] = data[64 + i];
        data2[i] = data[128 + i];
    }
    let pre_hash = partial_sha256_var_interstitial(INITIAL_STATE, data0, 64);
    let interstitial_hash = partial_sha256_var_interstitial(pre_hash, data1, 64);
    let hash = partial_sha256_var_end(interstitial_hash, data2, data2.len(), data.len());
    let correct_hash = sha256_var(data, data.len());
    assert_eq(hash, correct_hash);
}

#[test]
fn fuzz_test_partial_hash_end(data: [u8; 192]) {
    let mut data0 = [0; 64];
    let mut data1 = [0; 128]; // last 64 bytes not used
    let mut data2 = [0; 64];
    for i in 0..data0.len() {
        data0[i] = data[i];
        data1[i] = data[64 + i];
        data2[i] = data[128 + i];
    }
    let pre_hash = partial_sha256_var_interstitial(INITIAL_STATE, data0, 64);
    let interstitial_hash = partial_sha256_var_interstitial(pre_hash, data1, 64);
    let hash = partial_sha256_var_end(interstitial_hash, data2, data2.len(), data.len());
    let correct_hash = sha256_var(data, data.len());
    assert_eq(hash, correct_hash);
}

// Dual-mode coverage for the partial-hash API.
//
// These tests use the standalone `partial_sha256_var_end` usage (starting from
// INITIAL_STATE with the whole preimage in `msg`), which is the unambiguous
// case for a non-block-aligned total: the final chunk begins at absolute offset
// 0, so `message_size` (full blocks) and the trailing `real_message_size % 64`
// bytes both index into `msg` directly.

unconstrained fn unconstrained_partial_sha256_var_end<let N: u32>(
    h: [u32; 8],
    msg: [u8; N],
    message_size: u32,
    real_message_size: u32,
) -> [u8; 32] {
    partial_sha256_var_end(h, msg, message_size, real_message_size)
}

unconstrained fn unconstrained_partial_sha256_var_interstitial<let N: u32>(
    h: [u32; 8],
    msg: [u8; N],
    message_size: u32,
) -> [u32; 8] {
    partial_sha256_var_interstitial(h, msg, message_size)
}

fn assert_partial_end_matches_reference(real_message_size: u32) {
    let mut msg = [0; 192];
    for i in 0..msg.len() {
        msg[i] = ((i * 7 + 1) % 256) as u8;
    }
    let message_size = (real_message_size / 64) * 64;
    let hash = partial_sha256_var_end(INITIAL_STATE, msg, message_size, real_message_size);
    let reference = sha256_var(msg, real_message_size);
    assert_eq(hash, reference);
}

// Non-block-aligned totals: should equal a plain sha256_var over the same bytes.
#[test]
fn test_partial_end_size_1() {
    assert_partial_end_matches_reference(1);
}

#[test]
fn test_partial_end_size_33() {
    assert_partial_end_matches_reference(33);
}

#[test]
fn test_partial_end_size_63() {
    assert_partial_end_matches_reference(63);
}

#[test]
fn test_partial_end_size_65() {
    assert_partial_end_matches_reference(65);
}

#[test]
fn test_partial_end_size_100() {
    assert_partial_end_matches_reference(100);
}

#[test]
fn test_partial_end_size_127() {
    assert_partial_end_matches_reference(127);
}

#[test]
fn test_partial_end_size_129() {
    assert_partial_end_matches_reference(129);
}

#[test]
fn test_partial_end_size_191() {
    assert_partial_end_matches_reference(191);
}

// Block-aligned totals: these should already pass today.
#[test]
fn test_partial_end_size_64() {
    assert_partial_end_matches_reference(64);
}

#[test]
fn test_partial_end_size_128() {
    assert_partial_end_matches_reference(128);
}

// Constrained vs unconstrained must agree for any total size.
#[test]
fn fuzz_partial_end_implementations_agree(msg: [u8; 192], real_message_size: u32) {
    let real = real_message_size % 193; // 0..=192
    let message_size = (real / 64) * 64;
    // Safety: test function
    let oracle =
        unsafe { unconstrained_partial_sha256_var_end(INITIAL_STATE, msg, message_size, real) };
    let circuit = partial_sha256_var_end(INITIAL_STATE, msg, message_size, real);
    assert_eq(circuit, oracle);
}

// Constrained partial-end must match the reference sha256_var for any total size.
#[test]
fn fuzz_partial_end_matches_reference(msg: [u8; 192], real_message_size: u32) {
    let real = real_message_size % 193; // 0..=192
    let message_size = (real / 64) * 64;
    let hash = partial_sha256_var_end(INITIAL_STATE, msg, message_size, real);
    assert_eq(hash, sha256_var(msg, real));
}

// Regression tests: the size arguments must not describe bytes outside `msg`.
//
// If `message_size` plus the trailing `real_message_size % 64` bytes exceeds the
// array capacity `N`, the call reads past the end of `msg`. This must be rejected
// (in both runtimes) rather than silently hashing the missing bytes as zeros in
// the constrained path while the unconstrained path reads out of bounds.

#[test(should_fail_with = "does not fit in the input array")]
fn regression_partial_end_tail_beyond_capacity() {
    // msg holds 64 bytes, but real=100 claims a 36-byte tail at msg[64..100].
    let msg = [7; 64];
    let _ = partial_sha256_var_end(INITIAL_STATE, msg, 64, 100);
}

#[test(should_fail_with = "does not fit in the input array")]
fn regression_partial_end_tail_beyond_capacity_unconstrained() {
    let msg = [7; 64];
    // Safety: test function
    let _ = unsafe { unconstrained_partial_sha256_var_end(INITIAL_STATE, msg, 64, 100) };
}

#[test(should_fail_with = "does not fit in the input array")]
fn regression_partial_interstitial_message_beyond_capacity() {
    // message_size (128) exceeds the array capacity N (64).
    let msg = [7; 64];
    let _ = partial_sha256_var_interstitial(INITIAL_STATE, msg, 128);
}

// Composed (interstitial + end) hashing of a non-block-aligned message, with the
// final chunk re-based to offset 0. Both the constrained and unconstrained paths
// must match a plain sha256_var over the whole preimage.

#[test]
fn test_composed_non_aligned_tail_only() {
    // 100 bytes: interstitial absorbs one block, end handles a 36-byte tail.
    let mut full = [0; 100];
    for i in 0..full.len() {
        full[i] = ((i * 7 + 1) % 256) as u8;
    }
    let state = partial_sha256_var_interstitial(INITIAL_STATE, full, 64);
    let mut tail = [0; 36];
    for i in 0..tail.len() {
        tail[i] = full[64 + i];
    }
    let circuit = partial_sha256_var_end(state, tail, 0, 100);
    // Safety: test function
    let oracle = unsafe { unconstrained_partial_sha256_var_end(state, tail, 0, 100) };
    let reference = sha256_var(full, 100);
    assert_eq(circuit, reference);
    assert_eq(oracle, reference);
}

#[test]
fn test_composed_non_aligned_block_plus_tail() {
    // 200 bytes: interstitial absorbs two blocks, end handles one block + 8-byte tail.
    let mut full = [0; 200];
    for i in 0..full.len() {
        full[i] = ((i * 7 + 1) % 256) as u8;
    }
    let state = partial_sha256_var_interstitial(INITIAL_STATE, full, 128);
    let mut chunk = [0; 72];
    for i in 0..chunk.len() {
        chunk[i] = full[128 + i];
    }
    let circuit = partial_sha256_var_end(state, chunk, 64, 200);
    // Safety: test function
    let oracle = unsafe { unconstrained_partial_sha256_var_end(state, chunk, 64, 200) };
    let reference = sha256_var(full, 200);
    assert_eq(circuit, reference);
    assert_eq(oracle, reference);
}

// The interstitial step (whole blocks only) must agree across modes.
#[test]
fn fuzz_partial_interstitial_implementations_agree(msg: [u8; 192], num_blocks: u32) {
    let message_size = (num_blocks % 4) * 64; // 0, 64, 128, 192
    // Safety: test function
    let oracle =
        unsafe { unconstrained_partial_sha256_var_interstitial(INITIAL_STATE, msg, message_size) };
    let circuit = partial_sha256_var_interstitial(INITIAL_STATE, msg, message_size);
    assert_eq(circuit, oracle);
}
