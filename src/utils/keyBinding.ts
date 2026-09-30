/**
 * Verifier-side checks that a valid proof alone does not give:
 *
 *  1. canonicalPublicInputs: one canonical encoding for every public input, used both to verify
 *     and to decode the displayed text.
 *  2. DKIM key binding: the proof's key hashes (public outputs 0 and 1) must be the hashes of a
 *     key that the revealed DKIM-Signature's d=/s= actually publish (DNS, or the key archive).
 *  3. From alignment: the From: address's domain must be the signing domain (or a subdomain).
 *
 * REASON: the circuit accepts ANY RSA key. A valid proof only says "some key signed these bytes".
 * Without (2), anyone could sign a header saying "From: ceo@anybank.com" with a key they made
 * and the verify page showed it as authentic (security review of PR #25, finding 1). Without
 * (3), mail signed by an email service's own domain (d=esp.example) showed an arbitrary From:.
 *
 * Keep in sync with the copies in skills/redacted-email-proof/scripts/redacted.mjs
 * (tests/key-binding.test.ts runs both against the same cases).
 */
import { bnToLimbStrArray } from "@mach-34/noir-bignum-paramgen";
import { hashRSAPublicKey } from "@zk-email/zkemail-nr";
import { dkimKeyCandidates, type KeyCandidates } from "./dkimKeys";

// canonicalPublicInputs lives in proofOutputs.ts (no wasm/network imports); re-exported here.
export { canonicalPublicInputs, BN254_FIELD_MODULUS } from "./proofOutputs";

// A masked byte decodes to U+0000; the CLI renders it as "█".
// (Built with fromCharCode: eslint's no-control-regex rejects a literal \u0000 in a regex.)
const HIDDEN = new RegExp(`[${String.fromCharCode(0)}█]`);

/** Header fields of a (masked) header block, folds undone (CRLF + SP/HTAB is a continuation). */
export function headerFields(headerText: string): { name: string; value: string }[] {
  return headerText
    .replace(/\r?\n(?=[ \t])/g, "")
    .split(/\r?\n/)
    .map((line) => {
      const colon = line.indexOf(":");
      return colon > 0 ? { name: line.slice(0, colon).trim().toLowerCase(), value: line.slice(colon + 1) } : null;
    })
    .filter((f): f is { name: string; value: string } => f !== null);
}

/**
 * d= / s= of every DKIM-Signature field whose tags are fully revealed, in header order.
 *
 * REASON (review finding 6): the CLI read only the first physical line of the first
 * DKIM-Signature. With c=simple the field is folded and d=/s= are often on a later line, and a
 * header can carry several signatures while the circuit may use any of them. Every candidate is
 * tried; a key only matches if the domain publishes the very key the proof was signed with, so
 * trying more candidates can't make a forged proof match.
 */
export function dkimSignatureDomains(headerText: string): { domain: string; selector: string }[] {
  const out: { domain: string; selector: string }[] = [];
  for (const f of headerFields(headerText)) {
    if (f.name !== "dkim-signature") continue;
    const tags = new Map<string, string>();
    for (const part of f.value.split(";")) {
      const eq = part.indexOf("=");
      if (eq < 0) continue;
      // RFC 6376 allows folding whitespace inside tag values; it is not part of the value.
      tags.set(part.slice(0, eq).trim(), part.slice(eq + 1).replace(/\s+/g, ""));
    }
    const domain = tags.get("d")?.toLowerCase();
    const selector = tags.get("s");
    if (!domain || !selector || HIDDEN.test(domain) || HIDDEN.test(selector)) continue;
    if (!out.some((p) => p.domain === domain && p.selector === selector)) out.push({ domain, selector });
  }
  return out;
}

/**
 * The address in the From: field, parsed like RFC 5322 (comments and quoted display names
 * skipped; the last <angle-addr> wins).
 *
 * REASON (review finding 4): the old check took the first "@" in the From line, so
 * `From: "ceo@esp.example" <ceo@bank.example>` counted as aligned with d=esp.example.
 */
export function fromAddress(headerText: string): { address: string | null; domain: string | null; hidden: boolean } {
  const froms = headerFields(headerText).filter((f) => f.name === "from");
  // Several From: fields: which one a reader believes is ambiguous, so none is proven.
  if (froms.length !== 1) return { address: null, domain: null, hidden: false };
  const value = froms[0].value;
  let outside = "";
  let angle: string | null = null;
  let current: string | null = null;
  let quoted = false;
  let comment = 0;
  for (let i = 0; i < value.length; i++) {
    const c = value[i];
    if (quoted) {
      if (c === "\\") i++;
      else if (c === '"') quoted = false;
      continue;
    }
    if (comment > 0) {
      if (c === "\\") i++;
      else if (c === "(") comment++;
      else if (c === ")") comment--;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === "(") comment = 1;
    else if (c === "<") current = "";
    else if (c === ">" && current !== null) {
      angle = current;
      current = null;
    } else if (current !== null) current += c;
    else outside += c;
  }
  const address = (angle ?? outside).trim();
  if (HIDDEN.test(address)) return { address: null, domain: null, hidden: true };
  const at = address.lastIndexOf("@");
  const domain = at > 0 ? address.slice(at + 1).toLowerCase() : "";
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain)) return { address: null, domain: null, hidden: false };
  return { address, domain, hidden: false };
}

/** From domain is the signing domain, a subdomain of it, or its parent (relaxed alignment). */
export function domainsAligned(fromDomain: string, signingDomain: string): boolean {
  const f = fromDomain.toLowerCase();
  const d = signingDomain.toLowerCase();
  return f === d || f.endsWith("." + d) || d.endsWith("." + f);
}

// ---------------------------------------------------------------------------------------------
// key binding

/** Minimal DER walk: RSA modulus from a DKIM p= key (SubjectPublicKeyInfo or PKCS#1). */
export function rsaModulusFromDer(der: Uint8Array): bigint | null {
  const tlv = (off: number) => {
    if (off + 2 > der.length) return null;
    const tag = der[off];
    let len = der[off + 1];
    let start = off + 2;
    if (len & 0x80) {
      const n = len & 0x7f;
      if (n === 0 || n > 4) return null;
      len = 0;
      for (let k = 0; k < n; k++) len = len * 256 + der[start++];
    }
    return start + len <= der.length ? { tag, start, end: start + len } : null;
  };
  const top = tlv(0);
  if (!top || top.tag !== 0x30) return null;
  let first = tlv(top.start);
  if (!first) return null;
  if (first.tag === 0x30) {
    // SubjectPublicKeyInfo: SEQ { SEQ algorithm, BIT STRING { RSAPublicKey } }
    const bits = tlv(first.end);
    if (!bits || bits.tag !== 0x03) return null;
    const rsa = tlv(bits.start + 1); // skip the "unused bits" byte
    if (!rsa || rsa.tag !== 0x30) return null;
    first = tlv(rsa.start);
    if (!first) return null;
  }
  if (first.tag !== 0x02) return null;
  let hex = "";
  for (let i = first.start; i < first.end; i++) hex += der[i].toString(16).padStart(2, "0");
  return hex ? BigInt("0x" + hex) : null;
}

/** RSA modulus from a DKIM TXT record ("v=DKIM1; k=rsa; p=…"), or null. */
export function modulusFromDkimRecord(record: string): bigint | null {
  const p = /(?:^|;)\s*p\s*=\s*([^;]*)/i.exec(record)?.[1]?.replace(/\s+/g, "");
  if (!p) return null;
  try {
    return rsaModulusFromDer(Uint8Array.from(atob(p), (c) => c.charCodeAt(0)));
  } catch {
    return null;
  }
}

/**
 * Public outputs 0 and 1 a v2 proof made with this key must carry: [poseidon(modulus limbs),
 * poseidon(redc limbs)]. redc is derived from the modulus here, so a proof built with a forged
 * redc can't match either.
 */
export async function expectedKeyHashes(modulus: bigint, keyBits: number): Promise<[bigint, bigint]> {
  // Same Barrett parameter the prover uses (floor(2^(2k+6)/n), noir-bignum >= v0.9; see lib.ts).
  const redc = (1n << (2n * BigInt(keyBits) + 6n)) / modulus;
  const limbs = (x: bigint, bits?: number) => bnToLimbStrArray(x, bits).map((v: string) => BigInt(v));
  // NOTE: redc is ~keyBits+7 bits, so it gets its natural limb count (same as the prover), not keyBits'.
  const { modulusHash, redcHash } = await hashRSAPublicKey(limbs(modulus, keyBits), limbs(redc));
  return [BigInt(modulusHash), BigInt(redcHash)];
}

export interface KeyBinding {
  /** a key published by `domain` (selector `selector`) produced the proof's key hashes */
  matched: boolean;
  domain?: string;
  selector?: string;
  /** "dns:google" | "dns:cloudflare" | "archive" */
  keySource?: string;
  /** d=/s= pairs revealed in the header (empty: none revealed, so the signer can't be checked) */
  candidates: { domain: string; selector: string }[];
  from: ReturnType<typeof fromAddress>;
  /** From: domain aligned with the matched signing domain; null when there is no match */
  fromAligned: boolean | null;
  /** archive lookup failed (e.g. its 10 req/min limit); an unmatched result may be a false negative */
  archiveError?: string;
}

type ResolveKeys = (name: string, withArchive: boolean) => Promise<KeyCandidates>;

/**
 * Bind a VERIFIED v2 proof's key hashes to a published DKIM key. DNS answers are tried first for
 * every revealed d=/s=; the archive (10 requests/min per IP) only if none match.
 */
export async function bindDkimKey(
  publicInputs: readonly string[],
  maskedHeader: string,
  keyBits: number,
  resolveKeys: ResolveKeys = dkimKeyCandidates
): Promise<KeyBinding> {
  const want = [BigInt(publicInputs[0]), BigInt(publicInputs[1])];
  const candidates = dkimSignatureDomains(maskedHeader);
  const from = fromAddress(maskedHeader);
  const result: KeyBinding = { matched: false, candidates, from, fromAligned: null };
  const hashCache = new Map<string, Promise<[bigint, bigint]>>();
  for (const withArchive of [false, true]) {
    for (const { domain, selector } of candidates) {
      let keys: KeyCandidates;
      try {
        keys = await resolveKeys(`${selector}._domainkey.${domain}`, withArchive);
      } catch {
        continue;
      }
      if (keys.archiveError) result.archiveError ??= keys.archiveError;
      for (const k of withArchive ? keys.filter((c) => c.source === "archive") : keys) {
        const n = modulusFromDkimRecord(k.record);
        if (!n) continue;
        const id = n.toString(16);
        if (!hashCache.has(id)) hashCache.set(id, expectedKeyHashes(n, keyBits));
        const got = await hashCache.get(id)!.catch(() => null);
        if (got && got[0] === want[0] && got[1] === want[1]) {
          return {
            ...result,
            matched: true,
            domain,
            selector,
            keySource: k.source,
            fromAligned: from.domain ? domainsAligned(from.domain, domain) : false,
          };
        }
      }
    }
  }
  return result;
}

/** Banner for a verified v2 proof, from its DKIM key binding. Used by the verify page; tested in tests/key-binding.test.ts. */
export function keyBindingStatus(b: KeyBinding): { verified: boolean; warning?: boolean; message: string } {
  if (!b.matched) {
    const pairs = b.candidates.map((c) => `${c.selector}._domainkey.${c.domain}`).join(", ");
    return {
      verified: false,
      message: b.candidates.length
        ? `The proof is valid, but it was not made with any DKIM key published at ${pairs} ` +
          `(checked DNS and the DKIM key archive${b.archiveError ? `; the archive failed: ${b.archiveError}` : ""}). ` +
          "Anyone can make a proof like this with their own key, so the sender is NOT proven."
        : "The proof is valid, but the DKIM-Signature's d= and s= are hidden, so the signing domain can't be " +
          "checked. The sender is NOT proven.",
    };
  }
  const via = b.keySource === "archive" ? " (key from the DKIM key archive; no longer in DNS)" : "";
  if (b.fromAligned) {
    return { verified: true, message: `Proof verified. Signed by ${b.domain}${via}; the From: address is on that domain.` };
  }
  return {
    verified: false,
    warning: true,
    message: b.from.hidden
      ? `Proof verified and signed by ${b.domain}${via}, but the From: address is hidden, so it isn't proven to be from ${b.domain}.`
      : b.from.domain
        ? `Proof verified and signed by ${b.domain}${via}, which is not the From: domain ${b.from.domain}. ` +
          `${b.domain} sent this, but the From: address is not proven.`
        : `Proof verified and signed by ${b.domain}${via}, but the From: address can't be read, so it isn't proven.`,
  };
}
