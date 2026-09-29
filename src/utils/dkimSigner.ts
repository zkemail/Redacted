/**
 * DKIM verification with a signer-domain fallback.
 *
 * REASON: @zk-email's verifyDKIMSignature(email) looks for a signature whose d= is the From:
 * domain. Many emails are signed only by another domain: an ESP like ccsend.com or
 * schoolmessenger.com, or a subdomain like email.airbnb.com. Those failed with "DKIM signature
 * not found for domain …" even though a valid signature exists (17 of 132 test emails, 10 of which
 * then verify). The verify page shows d= and the CLI warns when From: and d= aren't aligned, so
 * accepting the signer's domain doesn't hide anything from the verifier.
 */

/** Unique d= domains of the DKIM-Signature headers in a raw RFC 5322 message, in order. */
export function signatureDomains(raw: string | Uint8Array): string[] {
  const text = typeof raw === "string" ? raw : new TextDecoder("latin1").decode(raw);
  const headerEnd = text.search(/\r?\n\r?\n/);
  const headers = (headerEnd >= 0 ? text.slice(0, headerEnd) : text).replace(/\r?\n[ \t]+/g, " ");
  const out: string[] = [];
  for (const line of headers.split(/\r?\n/)) {
    if (!/^dkim-signature\s*:/i.test(line)) continue;
    const d = /(?:^|[;:\s])d\s*=\s*([^;\s]+)/i.exec(line.slice(line.indexOf(":") + 1))?.[1]?.toLowerCase();
    if (d && !out.includes(d)) out.push(d);
  }
  return out;
}

/**
 * Verify with the From: domain first (or `domain` if given); if that fails, try each signature's
 * d= domain. Rethrows the first error if nothing verifies.
 */
export async function verifyWithSignerFallback<T>(
  raw: string | Uint8Array,
  verify: (raw: string | Uint8Array, domain?: string) => Promise<T>,
  domain?: string
): Promise<T> {
  if (domain) return verify(raw, domain);
  let firstError: unknown;
  try {
    return await verify(raw, undefined);
  } catch (e) {
    firstError = e;
  }
  for (const d of signatureDomains(raw)) {
    try {
      return await verify(raw, d);
    } catch {
      // try the next signature
    }
  }
  throw firstError;
}
