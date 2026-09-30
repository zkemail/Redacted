# Vendored Noir libraries

Both are compiled with **nargo 1.0.0-rc.3** and proved and verified with **Barretenberg 5.0.0**,
the bb version Noir pins for rc.3 in `scripts/install_bb.sh`. Rebuild everything with
`yarn compile:circuits`.

## Why these are vendored rather than referenced by tag

- The Redacted circuits need zkemail.nr **v2.0.0**, which contains the redc-binding security fix
  (zkemail/zkemail.nr#62). It pins noir_rsa v0.7 and noir-bignum v0.6 and does not compile on any
  Noir release that has the 2026 Brillig/SSA security fixes (beta.19 through beta.22, rc.x;
  see the noir-lang/noir security advisories).
- zkemail/zkemail.nr#65 (open) ports v2.0.0 to Noir beta.18. It needs a few more changes for rc.3,
  and one of its dependencies (noir_base64) has its rc fix only on `main`, untagged. Nargo git
  dependencies can only pin a tag.

Once zkemail.nr publishes an rc-compatible tag, replace `vendor/` with git dependencies.

## zkemail (`vendor/zkemail`)

- Source: zkemail/zkemail.nr PR #65 head `7006851` (critesjosh:update/aztec-4.2.0-compat), which
  is zkemail.nr `main` (8264758, includes #62) plus the beta.18 port. Only `lib/` is kept.
- Local changes for rc.3:
  - `BoundedVec::from_parts_unchecked` → `BoundedVec::from_parts`. In rc.3 `from_parts` has the
    old unchecked semantics: it asserts `len <= MaxLen` and does not zero the tail.
  - `std::hash::poseidon2_permutation(state, 4)` → `poseidon2_permutation(state)`. The state
    size is now a const generic.
  - Dependency bumps: bignum → zkpassport/noir-bignum v0.10.0-2 (the fork that
    zkpassport/noir_rsa v0.12.0 uses), rsa → zkpassport/noir_rsa v0.12.0 (noir-lang/noir_rsa is
    deprecated in favour of this fork), nodash v0.45.0, poseidon v0.3.0, sha256 →
    `../sha256` (below), and base64 → `../noir_base64` (below).
- `nargo test` in `vendor/zkemail` on rc.3: 48/48 pass, including `test_redc_binding_1024/2048`
  and the tampered header/body tests.

## noir_base64 (`vendor/noir_base64`)

- Source: noir-lang/noir_base64 `main` at `6b85980` ("chore: use BoundedVec::from_parts (#61)",
  2026-09-01). This is after v0.5.0, whose use of `from_parts_unchecked` doesn't compile on rc.3.
  Unmodified.

## sha256 (`vendor/sha256`) — patched

- Source: noir-lang/sha256 `main` at `a82d3ea` (2026-07-29). This is v0.3.0 plus a
  `partial_sha256_var_end` constrained/unconstrained divergence fix.
- **Patch (`src/sha256.nr`):** `build_msg_block_helper` (unconstrained) now receives only the
  64-byte window it reads (`msg_window(msg, msg_start)`) instead of the whole `msg: [u8; N]`.
  - Why: each Brillig call serializes all of its input witnesses, and `sha256_var` makes one call
    per 64-byte block, so ACIR size grew as (N / 64) × N. For the 49,152-byte body tier that was
    **2.9 GB of bytecode (171 MB JSON)**, which acvm_js can't deserialize ("Failed to deserialize
    circuit"). With the patch it's 6.5 MB.
  - Soundness is unchanged. In constrained code `msg_start` is a compile-time constant once the
    block loop is unrolled, so the window copy is wiring only, and `build_msg_block` still
    constrains the returned block against `msg` itself. The gate count is identical before and
    after (email_mask_2048_large: 3,911,860 both ways).
  - `nargo test` on rc.3: 59 passed and 8 failed, identical to unpatched `main`. The 8 failures
    are the `oracle_tests`, which need an external foreign-call oracle.
- Worth sending upstream; then this vendored copy can go.
