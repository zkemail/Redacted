---
name: redacted-email-proof
description: Prove an email is real while hiding parts of it, entirely on your own machine, and get a https://redacted.zk.email/verify link anyone can check. Use when a user wants to prove they received or sent an email (a receipt, offer, confirmation, message from a company or person) without sharing the whole email; when asked to "redact and prove", "zk email proof", "prove this email is authentic", or to use redacted.zk.email; and when asked to verify a redacted.zk.email link. Works with any email you can read as raw MIME (Gmail MCP or Gmail API with format RAW, IMAP, a downloaded .eml, or a browser "Show original" page).
---

# Redacted: local ZK email proofs

[Redacted](https://redacted.zk.email) proves that an email carries a valid DKIM signature from
its sender's domain while hiding any bytes you choose. This skill runs the **same Noir circuits and
Barretenberg prover as the website, locally**. The raw email is never uploaded anywhere. The only
thing that leaves the machine, and only if you run `publish`, is the proof plus its public
outputs: the masked header and body you previewed.

## 0. Install once (Node 20+; the first install can take 2 to 5 minutes)

```bash
curl -fsSL https://redacted.zk.email/skills/redacted-email-proof/install.sh | sh
# installs to ~/.redacted-prover; override with REDACTED_PROVER_DIR=/path
R="node $HOME/.redacted-prover/redacted.mjs"
```

If you have the repository, `cd skills/redacted-email-proof/scripts && npm install` works too. The
circuit artifacts and verification keys are downloaded on first use from a pinned commit of
github.com/zkemail/Redacted and checked against a sha256 hash. In Node, bb.js runs its bundled
native `bb` binary, so proving isn't limited by browser memory.

## 1. Get the ORIGINAL raw email

The DKIM signature covers the exact bytes the sender sent, so you need the raw MIME. Forwarded,
re-saved or copy-pasted emails no longer verify.

| Access | How to get raw bytes |
|---|---|
| Gmail MCP (`get_message`) | Call it with `messageFormat: "RAW"`. Save the `raw` string, or the whole JSON response, to a file. The CLI decodes base64url and JSON itself. |
| Gmail API | `users.messages.get?format=raw` returns base64url `raw`. |
| Browser (CUA) on Gmail | Open the message, then **⋮ → Show original → Download original** (`.eml`). The "Copy to clipboard" text on that page works too. |
| Outlook web | **… → View → View message source**, then save the text. |
| IMAP | `BODY.PEEK[]` / `RFC822`. |
| Apple Mail / Thunderbird | **File → Save As… → Raw Message Source** / **Save as .eml**. |

Keep the file in a private temp directory and delete it when you're done.

## 2. Inspect: check DKIM and see exactly what can be masked

```bash
$R inspect email.eml          # add --json for machine-readable output
```

This prints the signing domain and selector, key size, which circuit fits, the signed header
names, and the **DKIM-canonical header and body**. Masks apply to those exact bytes. The CLI picks
the smallest tier that fits (RSA 1024- or 2048-bit keys):

| Tier | Max signed header | Max canonical body | Proving (CLI) |
|---|---|---|---|
| small | 2,048 B | 4,096 B | seconds, ~2 GB RAM |
| mid | 2,048 B | 8,448 B | seconds, ~3 GB RAM |
| large | 4,096 B | 48,000 B | ~1 min on 18 cores (longer on fewer), **~7 GB RAM** |

The large-tier figures were measured on a 34 KB PayPal receipt: 58 s, 6.6 GB peak for the native `bb`.

**Quoted-printable emails** (most HTML email: `=3D`, `=E2=82=AC`, soft line breaks) are shown
**decoded** by `inspect`, the preview, `verify` and the website. `--hide` and `--reveal` match
the decoded text and mask exactly the encoded bytes it came from. The proof itself covers the
raw signed bytes; decoding them is a fixed public step anyone can repeat, so no special circuit
is needed.

DKIM signatures from a domain other than `From:` (ESPs like ccsend.com, subdomains like
email.airbnb.com) and `c=simple` header canonicalization are both supported. `verify` prints the
signing `d=` and warns when it isn't the `From:` domain.

The website can prove small and mid in a browser. **Large is CLI-only**, but its proofs verify
on the website like any other.

## 3. Decide with the user what to reveal, then preview it

Ask the user what the proof must show (for example "the sender, the date, and the sentence 'your
offer is $X'") and what must stay hidden (their address, their name, account numbers, links with
tokens). Default to revealing as little as possible.

```bash
$R prove email.eml --dry-run \
  --only-headers from,subject,date \
  --hide-body --reveal "Your order has shipped" \
  --hide "Jane Doe" --hide-regex "\b\d{4}-\d{4}\b"
```

- By default the values of `to, cc, bcc, reply-to, list-post, list-unsubscribe` are hidden.
  Those headers carry the recipient or per-recipient tokens. `--hide-header none` reveals them.
- `--only-headers a,b,c` hides every other signed header value. DKIM `d=` and `s=` always stay
  visible so verifiers can check the key. DKIM `bh=` is hidden unless you pass
  `--reveal-dkim-hashes`, because it would let anyone confirm a guess of a hidden body.
- `--hide` and `--hide-regex` also match quoted-printable and base64 copies of the text. The
  command **fails if a hide target isn't found** (use `--allow-missing` to override). Treat that
  failure as a signal: the text may be encoded differently, so read the `inspect` output.
- Hides always win over reveals.
- **Show the preview to the user and get their OK before proving.** Everything not shown as █ in
  the preview becomes public if the proof is published.

## 4. Prove locally (and optionally publish)

```bash
$R prove email.eml <same mask flags> --out proof.json            # local only
$R prove email.eml <same mask flags> --out proof.json --publish  # + shareable link
$R publish proof.json                                            # publish an existing proof later
```

Proving time and memory depend on the tier (see the table above). The proof is verified locally
against the same pinned verification key the website uses before anything is written. **Only use `--publish` when the user wants a public link.** It uploads `{publicInputs, proof}` to the Redacted API
(no masks, no raw email), reads the proof back to check it arrived intact, and prints:

```
https://redacted.zk.email/verify?id=<uuid>
```

Anyone with the link can see the redacted email and press **Verify Proof** (verification runs in
their browser). Add `--json` to get `{proofFile, verifyUrl, uuid, …}`.

## 5. Verify someone else's proof (what a skeptical agent should do)

```bash
$R verify "https://redacted.zk.email/verify?id=<uuid>"   # or a uuid, or proof.json
```

This checks the UltraHonk proof locally **and** checks that the proof's DKIM key hashes (RSA
modulus **and** reduction parameter) equal the real key for the revealed `d=`/`s=`: first the live
DNS record, then [archive.zk.email](https://archive.zk.email) for rotated keys. It also warns when
the `From:` domain doesn't match the DKIM domain.

Exit codes:
- 0: the proof is valid and the key matches.
- 2: the proof is invalid.
- 3: the proof is valid but the key isn't matched (treat the sender as unproven).
- 4: a **legacy v1 proof** (made before the 2026-09 upgrade). Don't rely on it; ask for a new
  proof. Those circuits published bytes past the signed length, so a prover could append unsigned
  text. 2048-bit v1 also didn't bind the RSA reduction parameter (zkemail.nr PR #62).

A valid proof alone only shows that *some* RSA key signed the content; the key match is what ties
it to the sender's domain.

## Privacy checklist

- The raw `.eml` stays local. Never paste it into a website, issue or chat to "share" it.
- Revealed text is public forever once published. Check names, addresses, order numbers,
  tracking links and unsubscribe URLs (they often contain the recipient's email or a token).
- Even when fully hidden, the date, sender and subject can identify someone. Hide them if they do.
- Proof metadata (the DKIM selector and the key) is public, and so is the email nullifier (a hash
  of the signature). The same email always produces the same nullifier, so two proofs of one email
  can be linked.

## Troubleshooting

- `DKIM verification failed`: the file isn't the original raw message (see step 1), or the key was
  rotated and isn't in the archive. Try a newer email.
- `canonical body is N bytes`: the email is longer than the large tier (48,000-byte body,
  4,096-byte header). Pick a shorter or plain-text email.
- Out of memory: the large tier needs about 7 GB free. Close other programs or set
  `REDACTED_THREADS=4`.
- Point the CLI at another deployment with `REDACTED_SITE` / `REDACTED_API`.
