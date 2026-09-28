---
name: redacted-circuit-maintenance
description: How to upgrade, recompile, resize or re-pin the Redacted Noir circuits (src/circuit) and keep the website, the agent CLI and old verify links consistent. Use before bumping Noir/Barretenberg/zkemail.nr, adding a size tier, touching src/circuit/vendor, changing lib.ts proving/verification, or debugging "Failed to deserialize circuit", "Failed to solve brillig function", or "SrsInitSrs: invalid points_buf size".
---

# Redacted circuit maintenance

Each section below is a rule plus the incident that produced it (2026-09-27, PR #21).

## Pick the toolchain pair from Noir itself
- Take the bb version from `scripts/install_bb.sh` at the Noir tag
  (`gh api repos/noir-lang/noir/contents/scripts/install_bb.sh?ref=v<noir>`), or from
  bbup's `bb-versions.json`. rc.3 → bb 5.0.0. Mismatched pairs fail with deserialization errors.
- Before upgrading, list security advisories with
  `gh api repos/noir-lang/noir/security-advisories`. Upgrade to a version at or above every
  `patched_versions` entry.

## Rebuild and re-pin (order matters)
1. `NARGO_BIN=… BB_BIN=… yarn compile:circuits` (use `--only=name` for one circuit). It writes
   `target/*.json` plus `target/vk/*.vk`.
2. Commit and **push** the artifacts first.
3. Run `node scripts/pin-cli-circuits.mjs <that commit sha>`, then commit the CLI. The CLI
   downloads artifacts and VKs by commit and checks each against its sha256. The website bundles
   the same VKs, so the pins and the bundle must come from one build.
4. Never delete `src/circuit/legacy-v1`. Old links depend on it.

## Gotchas that each cost an hour
- **Quadratic ACIR from sha256_var.** Upstream `build_msg_block_helper` takes the whole message,
  once per block, so bytecode is O(blocks × N): 48 KB body → 2.9 GB, and acvm_js fails with
  "Failed to deserialize circuit". The vendored sha256 passes a 64-byte window instead. Keep that
  patch if you bump sha256. Check that `bb gates` reports the same gate count before and after.
- **redc formula.** noir-bignum ≥ 0.9 uses `⌊2^(2k+6)/n⌋`. `@zk-email/zkemail-nr` 2.0.0 JS still
  generates `2^(2k+4)`, which gives "Failed to solve brillig function" inside `__barrett_reduction`.
  lib.ts and the CLI override `inputs.pubkey.redc`. Verifiers must derive the expected redc hash
  with the same formula.
- **Key hash = two fields.** v2 outputs `[poseidon(modulus), poseidon(redc)]`. Checking only the
  modulus hash reopens the Veridise forgery (zkemail.nr #62).
- **CRS cache (browser).** bb.js 5 fails when IndexedDB `g1Data` holds *more* points than
  `srsSize` ("SrsInitSrs: invalid points_buf size … got 128"). Legacy bb.js 0.84 writes the same
  key. Request `max(needed, cached)`, and use sizes that are multiples of 2^17, because compressed
  CRS chunks are 4 MB.
- **Tier sizing.** Prover cost follows the dyadic size (next power of 2 above the gate count). Fill
  the domain: about 72 gates per body byte, so 2^22 holds a 48 KB body plus a 4 KB header
  (3.91M gates).
- **Browser limits.** The mid tier (2^20) proves in about 25 s in a browser. The large tier (2^22)
  needs about 7 GB and is CLI-only (native bb via bb.js 5 in Node).
- `nargo test` inside `src/circuit/vendor/zkemail` resolves the parent package ("Selected package
  `email_mask` was not found"). Copy the vendor dir elsewhere to run the lib tests.

## Verification checklist for any circuit change
- `bb gates` for every tier; compare with the last build.
- CLI: prove a real email for each tier you touched, `verify` it (exit 0, both hashes match DNS),
  and tamper one output (exit 2).
- Headless browser: prove small and mid through `src/lib.ts`, and verify a large proof with fresh
  storage and with an oversized cached CRS.
- Check that an old v1 link still verifies (legacy warning; CLI exit 4).
