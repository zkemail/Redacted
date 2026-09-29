# ProveKit evaluation for on-device Redacted proving (2026-09-29)

**Question:** can ProveKit (github.com/worldfnd/provekit) prove Redacted emails locally
(laptop, browser, phone) faster or with less memory than Barretenberg UltraHonk (bb 5.0.0 /
bb.js 5.0.0), which is what Redacted uses today?

**Answer: no-go for now.** ProveKit works on our circuit (native and in-browser), but it was
**slower, used more memory, produced ~55× larger proofs and ~10–25× slower verification** than
bb on every tier we could measure. The audited branch cannot compile our circuit at all. The one
feature bb lacks, file-backed mmap proving on phones, is worth revisiting when we target mobile.

## What ProveKit is (checked 2026-09-29)

| | |
|---|---|
| Proof system | Noir ACIR → R1CS → Spartan-style protocol with **WHIR** (hash-based, no trusted setup). Merkle hash selectable: skyscraper (default), sha256, blake3, keccak, poseidon2. ZK witness commitment by default. |
| License / activity | MIT, 141 stars, `main` pushed 2026-09-10, releases v1.0.0 (2026-05) → v1.0.2 (2026-09-08). |
| Branches | `v1`: "stable and **audited**", pins Noir **beta.26** (via republished `provekit_*` crates; the FAQ still says beta.11). `main`: rolling, **not covered by the audit**, pins Noir **beta.20**. |
| Audit status | Open audit-derived issues #265–#268 (M-1…M-4: verifier panics on malformed proofs → DoS-class). Open soundness trackers exist only for small fields (M31); BN254 path unaffected. |
| Black boxes (r1cs-compiler) | `v1`: RANGE, AND, XOR, Poseidon2Permutation, Sha256Compression. **No MultiScalarMul.** `main`: adds MultiScalarMul. |
| Targets | Native Rust CLI/crates; C FFI → Swift/iOS, Kotlin/Android (with `pk_configure_memory` file-backed mmap to prove beyond RAM); WASM (`tooling/provekit-wasm`, rayon threads via SharedArrayBuffer, **4 GB wasm32 cap**); JS SDK `@atheonxyz/verity` 0.3.2-alpha (third party, Noir beta.11, stale vs `v1`). Go/gnark recursive verifier → Groth16. |

## Compatibility with our circuit (stack/02, Noir rc.3)

- **`v1` (audited): fails.** Our exact circuit source compiles unmodified on nargo beta.26, but
  `provekit-cli prepare` panics:
  `not implemented: Other black box function: MULTI_SCALAR_MUL`. That black box comes from
  `pedersen_hash(signature)`, the email nullifier.
- **`main`: works** once the circuit compiles on beta.20. That needed a scratch-only compat copy:
  non-ASCII comments stripped (beta.20 rejects them), plus one type-inference line in
  noir-bignum v0.10.0-2 rewritten. Same dependency versions otherwise. The witness solves and
  proofs verify.

## Measurements (this Mac: 18-core Apple Silicon, 64 GB; **load average 250–540 from other sessions throughout**)

Synthetic DKIM-shaped inputs with an ephemeral 2048-bit RSA key, no real email. bb numbers use
the committed stack/02 circuit on nargo rc.3; ProveKit uses the beta.20 compat copy of the same
circuit. Every pair was run back-to-back, so treat **ratios** as meaningful and absolute seconds
as inflated.

| Tier (2048-bit key) | bb 5.0.0 native prove | ProveKit `main` native prove | bb proof / verify | ProveKit proof / verify |
|---|---|---|---|---|
| small (2 KB hdr / 4 KB body; 3.9 KB used) | **6.8 s, 1.25 GB** (13 s in another run) | 17.1 s blake3 / 24.1 s skyscraper, **2.0 GB** | 14.6 KB / 0.05 s | 786 KB / 1.0 s |
| mid (2 KB / 8.4 KB; 8 KB used) | **20.5 s, 1.6 GB** | 62 s (25 s CPU), **3.3 GB** | 14.6 KB / 0.10 s | 884 KB / 2.6 s |
| large (4 KB / 48 KB; 34 KB used) | **74.8 s, 7.1 GB** | `prepare` still running after 2+ h (single-threaded R1CS lowering of 688k opcodes) | 14.6 KB / 0.64 s | n/a |

One-time `prepare` (maintainer cost per circuit release, not per user):
- small: 157 s, 3.2 GB → 9.7 MB `.pkp`, 14.7 MB `.pkv`.
- mid: 19 min wall, 4.4 GB → 15.8 MB `.pkp`, 23.2 MB `.pkv`.
- large: over 2 h, not finished; it's superlinear in the lowering of SHA-256 compressions
  (`add_sha256_compression` / `canonicalize_terms`).

Where ProveKit's small-tier prove time goes (blake3): read `.pkp` 2.0 s, **R1CS witness solve
7.3 s (single-threaded)**, WHIR commits about 3 s, sumcheck/opening about 3 s. The proving math
itself is about 6 s, close to bb's 6.8 s total. The serial witness solver and key loading are
the overhead.

**Browser (headless Chromium, 18 threads, COOP/COEP):** our own `provekit-wasm` build from
`main` (5.1 MB wasm) proved the small tier:

| step | time |
|---|---|
| load `.pkp` | 4.0 s |
| prove | **14.2 s** |
| verify | 0.8 s |
| proof size | 1.55 MB (JSON) |

That excludes noir_js witness generation (about 7 s under this load). bb.js small-tier browser
proving including witness generation measured about 19 s earlier in this project, so they're
comparable, not faster. Both cap at 4 GB wasm memory, so the large tier stays CLI/native-only
either way.

## Verification story

- ProveKit proofs aren't UltraHonk. The site would need the ProveKit wasm verifier (about 5 MB)
  plus a **14.7–23 MB `.pkv` per tier**, versus a 3.7 KB bb VK. Verify would take 0.8–2.6 s
  versus 0.05–0.6 s.
- Links would also carry ~0.8–1.6 MB proofs instead of 14.6 KB. They're dwarfed by public inputs
  today, but still a cost.
- Existing v1/v2 links would need bb kept anyway, i.e. **dual-support**. There's no way to keep a
  single proof system short of wrapping WHIR in Groth16 (their gnark recursive verifier), which
  adds a server-side step and a trusted setup.

## If we revisit (conditions + concrete integration)

Revisit when **all** of these hold:
1. `v1` (audited) supports MultiScalarMul, **or** we switch the nullifier from Pedersen (MSM) to
   Poseidon. That's a circuit change and also cheap in bb.
2. ProveKit's witness solver is parallel, or large-tier `prepare` completes in reasonable time.
3. We target phones, where `pk_configure_memory` (file-backed mmap) could let the 48 KB tier
   prove within mobile RAM. That is the only capability bb lacks in our setting.

Integration would then be:
- **Circuit:** Poseidon nullifier; compile with ProveKit's pinned Noir.
- **Build:** `provekit-cli prepare` per tier in CI; commit or pin `.pkp`/`.pkv` by sha256 like
  today's VKs.
- **CLI:** optional `--backend provekit` using the FFI or CLI.
- **Site:** lazy-load `provekit-wasm` plus `.pkv` for `circuitVersion: 3` proofs; keep bb for v1/v2.
- **Upload format:** add `backend` field.

## Commands used (scratch; nothing global changed)

- Clone and build: `git clone worldfnd/provekit` (main 2026-09-10, v1 `4ee4063`);
  `cargo build --release --bin provekit-cli` (16–19 min each).
- Toolchains: nargo beta.20/beta.26/rc.3 release binaries in scratch; bb 5.0.0 release binary.
- ProveKit: `provekit-cli prepare . --hash {skyscraper,blake3} --pkp … --pkv …`; `prove --prover
  … --input Prover.toml --out …`; `verify --verifier … --proof …`, each under `/usr/bin/time -l`.
- bb: `bb write_vk -b …`; `bb prove -b … -w … -k vk -o …`; `bb verify -k … -p … -i …`.
- WASM: `cargo build --release --target wasm32-unknown-unknown -p provekit-wasm -Z
  build-std=panic_abort,std`; `wasm-bindgen 0.2.113 --target web`. Headless Chromium through
  Playwright against a COOP/COEP static server. The worker's `import('../../..')` must resolve to
  `provekit_wasm.js`.
