# Redacted

**Reveal the truth anonymously. Protect your identity.**

[redacted.zk.email](https://redacted.zk.email)

Redacted is a privacy-first web application that lets you prove the authenticity of an email while selectively masking sensitive information—all powered by zero-knowledge cryptography.

## The Problem

You have an email that proves something important—misconduct, a broken promise, sensitive information. But sharing it means exposing:
- Your email address
- The sender's identity
- Private details you'd rather keep hidden

Traditional redaction offers no cryptographic proof. Anyone can edit a screenshot or fake an email. How do you prove authenticity while protecting privacy?

## The Solution

Redacted uses **zero-knowledge proofs** combined with **DKIM email signatures** to solve this paradox:

1. **Upload** any `.eml` email file
2. **Mask** the parts you want to keep private (drag to select)
3. **Generate** a cryptographic proof that the email is authentic
4. **Share** a verification link anyone can check

The proof mathematically guarantees the email was real and unaltered—without revealing what you've masked.

## For AI agents: prove emails locally from a terminal

An agent that can read someone's email (a Gmail MCP with `messageFormat: "RAW"`, the Gmail API, IMAP, or a browser's "Show original") can produce a Redacted proof without a browser and without uploading the email. The skill lives in [`skills/redacted-email-proof`](skills/redacted-email-proof/SKILL.md) and is also served by the site:

```bash
curl -fsSL https://redacted.zk.email/skills/redacted-email-proof/install.sh | sh
R="node ~/.redacted-prover/redacted.mjs"
$R inspect email.eml                                   # DKIM check + the canonical bytes masks apply to
$R prove email.eml --only-headers from,subject,date \
   --hide-body --reveal "Your order has shipped" --dry-run   # preview exactly what becomes public
$R prove email.eml <same flags> --publish              # prove locally, upload proof only → verify link
$R verify "https://redacted.zk.email/verify?id=…"       # proof check + DKIM key matches sender DNS
```

- It uses the same circuits as the site: pinned by commit, and each artifact and verification key is checked against its sha256 before use.
- It proves emails with bodies up to **49,152 bytes**. The "large" tier is CLI-only; bodies over 8,448 bytes need about 7 GB of RAM and about a minute on a recent laptop.
- `publish` sends only `{publicInputs, proof}`. The raw email and the mask arrays are never sent.
- `verify` also checks that the proof's DKIM public-key hash matches the key published in DNS (or in [archive.zk.email](https://archive.zk.email)) for the revealed `d=`/`s=`. The web verify page doesn't do that check yet.
- Agents that fetch the site find the skill through `/llms.txt`, a `<link rel="alternate">` to `SKILL.md`, and a static block in `index.html`. Humans see it in the "For AI agents" section on the home page.
- Install as a Claude Code / agent skill: `npx skills add zkemail/Redacted`, or copy `skills/redacted-email-proof` into your agent's skills directory.

## How It Works

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Upload    │ ──▶ │   Mask      │ ──▶ │   Prove     │ ──▶ │   Share     │
│   .eml      │     │   Content   │     │   (in ZK)   │     │   Link      │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
```

**The Magic**: Your original email never leaves your browser. The zero-knowledge proof is generated entirely client-side using WebAssembly. Only the masked version and cryptographic proof are shared.

### DKIM: The Trust Anchor

Every email from major providers (Gmail, Outlook, etc.) is cryptographically signed using [DKIM](https://en.wikipedia.org/wiki/DomainKeys_Identified_Mail). This signature proves the email was genuinely sent from that domain and hasn't been tampered with.

Redacted's ZK circuits verify this DKIM signature inside the proof—so anyone can confirm the email is authentic without trusting you or any third party.

## Features

- **100% Client-Side Proving** — All ZK proof generation happens in your browser
- **Selective Masking** — Click and drag to redact any text with character-level precision
- **DKIM Verification** — Proofs are anchored to real email cryptographic signatures
- **Shareable Links** — Anyone can verify your proof with a URL
- **No Email Storage** — Your original `.eml` file is never uploaded anywhere
- **Undo/Redo** — Full editing history with keyboard shortcuts

## Technology

| Layer | Tech |
|-------|------|
| **ZK Circuits** | [Noir](https://noir-lang.org/) (v1.0.0-rc.3) |
| **Proving Backend** | [Barretenberg](https://github.com/AztecProtocol/barretenberg) UltraHonk |
| **Email Verification** | [@zk-email/zkemail-nr](https://github.com/zkemail/zkemail.nr) |
| **Frontend** | React 19 + TypeScript + Vite |
| **Styling** | Tailwind CSS |

### Circuit Variants

Circuits are compiled with **Noir 1.0.0-rc.3** against **zkemail.nr v2** (vendored and ported; see
`src/circuit/vendor/VENDORED.md`), and proved and verified with **Barretenberg 5.0.0**. The app
selects the smallest circuit that fits your email:

| Circuit | RSA key | Max signed header | Max body | Where it can be proved |
|---------|---------|-------------------|----------|------------------------|
| `email_mask_{1024,2048}_small` | 1024 / 2048-bit | 2 KB | 4 KB | browser or CLI |
| `email_mask_{1024,2048}_mid` | 1024 / 2048-bit | 2 KB | 8.4 KB | browser or CLI |
| `email_mask_{1024,2048}_large` | 1024 / 2048-bit | 4 KB | 48 KB | CLI only (~7 GB RAM, ~1 min) |

Verification uses precomputed verification keys (`src/circuit/target/vk/`), so it takes seconds in
the browser for every tier.

**Security upgrade (2026-09).** The original circuits (Noir 1.0.0-beta.5, zkemail.nr
v1.0.1-beta.5) had two problems:
1. Their 2048-bit DKIM key hash committed only to the RSA modulus, not the reduction parameter
   (`redc`), so a malicious prover could pick an arbitrary `redc` (Veridise finding, fixed in
   zkemail.nr PR #62).
2. They were compiled with a Noir version affected by the 2026 Brillig/SSA advisories.

v2 circuits output both hashes. The old artifacts are kept in `src/circuit/legacy-v1/` only so
links made before the upgrade still verify, and the verify page labels 2048-bit legacy proofs as
weaker evidence.

Rebuild with `NARGO_BIN=… BB_BIN=… yarn compile:circuits` (nargo 1.0.0-rc.3, bb 5.0.0). Then pin
the CLI with `node scripts/pin-cli-circuits.mjs <commit>`.

## Getting Started

### Prerequisites

- Node.js 20+
- [Bun](https://bun.sh/) (recommended) or npm

### Installation

```bash
# Clone the repository
git clone https://github.com/zkemail/redacted.git
cd redacted

# Install dependencies
bun install

# Start the development server
bun run dev
```

The app will be available at `http://localhost:5173`.

### Running with Backend (for proof storage)

```bash
# Start the Express backend for Google Cloud Storage
cd server
npm install
node index.js
```

### Building for Production

```bash
bun run build
```

### Docker

```bash
docker build -t redacted .
docker run -p 3000:3000 redacted
```

## Project Structure

```
src/
├── App.tsx                 # Main app with proof generation logic
├── pages/
│   ├── Home.tsx            # Landing page
│   └── VerifyPage.tsx      # Proof verification display
├── components/
│   ├── EmailCard.tsx       # Email display with masking UI
│   ├── EmailField.tsx      # Individual field editing
│   ├── ActionBar.tsx       # Generate/verify controls
│   └── MaskedText.tsx      # Renders redacted content
├── lib.ts                  # Core ZK proving logic
├── utils/
│   ├── emlParser.ts        # Email parsing & DKIM extraction
│   └── headerParser.ts     # Masked header parsing
└── circuit/                # Compiled Noir circuits
```

## Security Model

- **What's proven**: The email has a valid DKIM signature from the claimed domain
- **What's hidden**: Any content you mask (replaced with null bytes in the proof)
- **What's public**: The masked email content and verification status
- **Trust assumptions**: DKIM signature validity, soundness of the ZK proving system

## Use Cases

- **Whistleblowing** — Prove you received evidence without exposing sources
- **Journalism** — Verify leaked communications cryptographically
- **Legal Evidence** — Demonstrate email authenticity while protecting privilege
- **HR Complaints** — Document harassment while maintaining privacy
- **Dispute Resolution** — Prove agreements without revealing unrelated details

## Part of ZK Email

Redacted is built on the [ZK Email](https://zk.email/) ecosystem—battle-tested infrastructure for privacy-preserving email verification trusted by leading organizations in the space.

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.

## License

MIT
