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
| **ZK Circuits** | [Noir](https://noir-lang.org/) (v1.0.0-beta.5) |
| **Proving Backend** | [Barretenberg](https://github.com/AztecProtocol/barretenberg) UltraHonk |
| **Email Verification** | [@zk-email/zkemail-nr](https://github.com/zkemail/zkemail.nr) |
| **Frontend** | React 19 + TypeScript + Vite |
| **Styling** | Tailwind CSS |

### Circuit Variants

The app automatically selects the optimal circuit based on your email:

| Circuit | RSA Key Size | Max Body Size |
|---------|--------------|---------------|
| `email_mask_1024_small` | 1024-bit | 4 KB |
| `email_mask_1024_mid` | 1024-bit | 8.4 KB |
| `email_mask_2048_small` | 2048-bit | 4 KB |
| `email_mask_2048_mid` | 2048-bit | 8.4 KB |

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

Redacted is built on the [ZK Email](https://prove.email/) ecosystem—battle-tested infrastructure for privacy-preserving email verification trusted by leading organizations in the space.

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.

## License

MIT
