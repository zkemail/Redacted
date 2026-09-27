#!/bin/sh
# Installs the Redacted local prover (redacted.mjs + pinned npm deps) into $REDACTED_PROVER_DIR.
# Nothing here touches your email; proving and DKIM checks run locally after install.
set -eu

SITE="${REDACTED_SITE:-https://redacted.zk.email}"
DIR="${REDACTED_PROVER_DIR:-$HOME/.redacted-prover}"
SRC="$SITE/skills/redacted-email-proof"

command -v node >/dev/null 2>&1 || { echo "Node.js 20+ is required (https://nodejs.org)." >&2; exit 1; }
major=$(node -p 'process.versions.node.split(".")[0]')
[ "$major" -ge 20 ] || { echo "Node.js 20+ is required (found $(node -v))." >&2; exit 1; }

mkdir -p "$DIR"
for f in redacted.mjs package.json; do
  curl -fsSL "$SRC/scripts/$f" -o "$DIR/$f"
done
curl -fsSL "$SRC/SKILL.md" -o "$DIR/SKILL.md"

echo "Installing prover dependencies into $DIR (first run takes a few minutes)…" >&2
# NOTE: --no-audit/--no-fund keep the install quiet; @zk-email/helpers pulls snarkjs from a git
# URL, which is the slow step — it is not hung.
(cd "$DIR" && npm install --no-audit --no-fund --loglevel=error)

echo "Done. Try:  node $DIR/redacted.mjs help" >&2
