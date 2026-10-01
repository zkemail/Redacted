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
- **Only publish signed bytes.** `mask_text` (zkemail.nr) outputs all N storage bytes, but
  SHA-256 and RSA cover only `len`, so the tail is prover-controlled and could inject unsigned text.
  `mask_signed_bytes` in main.nr zeroes everything at index ≥ len, and the circuit publishes both
  lengths. Keep it. The regression test is `yarn test` (tests/soundness.test.ts, which fails
  without it). It costs about 4 gates per byte, and the large tier is at 98% of 2^22, so re-measure
  before adding any per-byte logic.
- **Quoted-printable is decoded in the display layer, NOT in the circuit.** An in-circuit decode
  variant (commit b9791be) cost ~55 gates/byte: QP mid went to 2^21, QP large to 2^23, and the
  large compile OOM'd at 20.3 GB. It added no soundness, because decoding is a public function of
  the proven raw bytes. What matters is mapping decoded-text masks to the exact raw bytes
  (`viewMaskToRawMask`); the old search-based UI mapping silently leaked QP text.
- **c=simple / folded DKIM fields** are supported by the vendored zkemail.nr patches, and the
  whole field is range-checked up to 1024 bytes. Still unsupported: a bh= value folded mid-value
  (Fastmail), which needs whitespace-skipping in `get_body_hash`.
- **Large tier budget:** 48,000-byte body at 4,126,238 gates (98.4% of 2^22) after the c=simple
  hardening. Anything per-byte added to large spills it to 2^23 (twice the proving cost).
- **Key hash = two fields.** v2 outputs `[poseidon(modulus), poseidon(redc)]`. Checking only the
  modulus hash reopens the Veridise forgery (zkemail.nr #62).
- **CRS cache (browser).** bb.js 5 fails when IndexedDB `g1Data` holds *more* points than
  `srsSize` ("SrsInitSrs: invalid points_buf size … got 128"). Legacy bb.js 0.84 writes the same
  key. Request `max(needed, cached)`, and use sizes that are multiples of 2^17, because compressed
  CRS chunks are 4 MB.
- **Tier sizing.** Prover cost follows the dyadic size (next power of 2 above the gate count). Fill
  the domain: about 72 gates per body byte, so 2^22 holds a 48 KB body plus a 4 KB header
  (3.91M gates).
- **Browser tiers must stay <= 2^20.** bb.js caches the uncompressed CRS in IndexedDB as one
  value: 2^21 points is 134 MB, over Chromium's ~127 MB per-value cap, so proving throws
  "serialized keys and/or value are too large".
- **Browser limits.** The mid tier (2^20) proves in about 25 s in a browser. The large tier (2^22)
  needs about 7 GB and is CLI-only (native bb via bb.js 5 in Node).
- Measure proving memory with `/usr/bin/time -l <bb> prove ...` ("peak memory footprint"). Sampling
  `footprint`/`vmmap`/RSS of pgrep children read ~2 GB for XL while the real peak is 13.7 GB (large
  7.4 GB): the sampler caught the wrong process or missed the short MSM spikes.
- `nargo test` inside `src/circuit/vendor/zkemail` resolves the parent package ("Selected package
  `email_mask` was not found"). Copy the vendor dir elsewhere to run the lib tests.

## Verification checklist for any circuit change
- `bb gates` for every tier; compare with the last build.
- CLI: prove a real email for each tier you touched, `verify` it (exit 0, both hashes match DNS),
  and tamper one output (exit 2).
- Headless browser: prove small and mid through `src/lib.ts`, and verify a large proof with fresh
  storage and with an oversized cached CRS.
- Check that an old v1 link still verifies (legacy warning; CLI exit 4).
- Run `yarn test`: soundness plus exact decoding. Any change to the circuit's outputs must keep
  it green.

## DKIM key lookup and the archive rate limit
- Keys come from `src/utils/dkimKeys.ts` (a copy lives in the CLI). It tries Google + Cloudflare
  DoH first, then every archived key for the selector. `@zk-email/helpers` alone tries one DNS
  key, and only the first archived key, and only if the DNS lookup fails. That missed 12 of 132
  corpus emails whose keys were rotated under the same selector (mostly Amazon/SES).
- archive.prove.email allows **10 requests/min per IP**. On a 429 it returns an error object, and
  the helper's own fallback crashes ("data.find is not a function"). An unpaced corpus
  DKIM sweep therefore misreports ~30 emails as failures. When sweeping, space archive calls
  ≥6.5 s apart (wrap `fetch`), or interleave them with proving. Always compare before and after
  runs under the same pacing.

## XXL tier (2^24) build and measurement
- XXL = 4,096-byte header / 200,704-byte body (2× XL), 15.70M gates (1024-bit) and 15.71M (2048-bit),
  93.6% of 2^24. About 76 gates per body byte above XL, so a bigger body needs a 2^25 tier.
- Compile on a Linux box with at least 32 GB (cortex): `NARGO_BIN=… BB_BIN=node_modules/@aztec/bb.js/build/amd64-linux/bb
  npx tsx scripts/compile-circuits.ts --only=email_mask_1024_xxl` takes 13–16 min and peaks at ~20 GB
  (proving-key computation inside write_vk). Don't build it on the Mac during the day.
- Proving takes 124–132 s on 12 cores and peaks at 22.4–22.5 GB RSS of `bb` on Linux (six real emails,
  2026-10-01). Linux RSS is reliable when swap doesn't grow; sample `/proc/<bb pid>/status` VmRSS, not
  `/usr/bin/time` on node (bb.js's native bb isn't a reaped child, so time reports ~2 GB).
- The artifacts are 37 MB each. The pin script regenerates the CLI's whole circuit table from
  `src/circuit-configs.json`, so a new tier only needs configs, artifacts, a pin run and docs.
