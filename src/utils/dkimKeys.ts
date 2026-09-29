/**
 * DKIM verification that tries every plausible public key for the signature's selector.
 *
 * REASON: @zk-email/helpers' verifyDKIMSignature resolves the key once: Google DNS-over-HTTPS,
 * and only if that lookup *fails*, the FIRST archive.prove.email record for the selector. Two
 * common cases then fail with "bad signature" although the signing key is known:
 *  - the sender rotated the key but reused the selector (DNS answers with the new key, so the
 *    archive is never consulted), and
 *  - the archive holds several keys for the selector (amazon.com: 8 of 23 selectors have 2-3)
 *    and the one that signed isn't the first.
 * So we collect candidates (Google DoH, Cloudflare DoH, then every archived key for the selector,
 * most recently seen first) and try them in order. The first key that verifies wins; its source
 * is reported so callers can say "key from the archive, no longer in DNS".
 *
 * Accepting an archived key doesn't weaken anything the old code accepted: the archive was
 * already a fallback, and the verifier (CLI `verify`) checks the proof's key hash against DNS and
 * the archive independently.
 *
 * Keep in sync with the copy in skills/redacted-email-proof/scripts/redacted.mjs
 * (tests/dkim-keys.test.ts checks both).
 */
import { DkimVerifier } from "@zk-email/helpers/dist/lib/mailauth/dkim-verifier";
import { writeToStream } from "@zk-email/helpers/dist/lib/mailauth/tools";
import sanitizersModule from "@zk-email/helpers/dist/dkim/sanitizers";
import { DoH, DoHServer } from "@zk-email/helpers/dist/dkim/dns-over-http";
import type { DKIMVerificationResult } from "@zk-email/helpers/dist/dkim";

// NOTE: CJS interop differs by loader: Vite gives the array, Node/tsx the exports object
// ({ default: [...] }). Without this, Node throws "sanitizers is not iterable".
const sanitizers: ((email: string) => string)[] = Array.isArray(sanitizersModule)
  ? sanitizersModule
  : (sanitizersModule as unknown as { default: ((email: string) => string)[] }).default;

export const DKIM_ARCHIVE_API = "https://archive.prove.email/api/key";

export interface KeyCandidate {
  /** "dns:google" | "dns:cloudflare" | "archive" */
  source: string;
  /** the TXT record, "v=DKIM1; k=rsa; p=…" */
  record: string;
  /** archive only: when the archive last saw this key in DNS */
  lastSeenAt?: string;
}

export type DkimKeyResult = DKIMVerificationResult & { keySource: string };

const pOf = (record: string) => /(?:^|;)\s*p\s*=\s*([^;]*)/i.exec(record)?.[1]?.replace(/\s+/g, "") ?? "";

export type KeyCandidates = KeyCandidate[] & { archiveError?: string };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Archived keys for `selector` at `domain`, most recently seen first.
 * NOTE: archive.prove.email allows 10 requests/min per IP and answers 429 with a JSON error
 * object (not an array); the helper's own fallback crashes on that ("data.find is not a
 * function"). Retry once after the server's retryAfterSeconds (capped at 15 s), then give up and
 * say so in the error, rather than reporting a misleading "bad signature".
 */
async function archiveKeys(domain: string, selector: string): Promise<KeyCandidate[]> {
  const url = new URL(DKIM_ARCHIVE_API);
  url.searchParams.set("domain", domain);
  for (let attempt = 0; ; attempt++) {
    const resp = await fetch(url);
    const body = await resp.json().catch(() => null);
    if (Array.isArray(body)) {
      return (body as { selector: string; value: string; lastSeenAt?: string }[])
        .filter((r) => r.selector === selector && typeof r.value === "string")
        .sort((a, b) => String(b.lastSeenAt ?? "").localeCompare(String(a.lastSeenAt ?? "")))
        .map((r) => ({ source: "archive", record: r.value, lastSeenAt: r.lastSeenAt }));
    }
    const wait = Number(body?.details?.retryAfterSeconds);
    if (resp.status === 429 && attempt === 0 && wait > 0 && wait <= 15) {
      await sleep(wait * 1000);
      continue;
    }
    throw new Error(resp.status === 429 ? "archive.prove.email rate limit (10/min per IP); retry in a minute" : `archive.prove.email HTTP ${resp.status}`);
  }
}

/**
 * Candidate keys for `<selector>._domainkey.<domain>`: Google and Cloudflare DoH, plus (with
 * `withArchive`) every archived key for the selector. Deduplicated by p=; revoked (empty p=)
 * records dropped.
 */
export async function dkimKeyCandidates(name: string, withArchive = true): Promise<KeyCandidates> {
  const [selector, , ...rest] = name.split(".");
  const domain = rest.join(".");
  const dns = async (server: string, source: string): Promise<KeyCandidate[]> => {
    try {
      const record = await DoH.resolveDKIMPublicKey(name, server);
      return record ? [{ source, record }] : [];
    } catch {
      return []; // REASON: one resolver being down must not hide keys the other sources have
    }
  };
  let archiveError: string | undefined;
  const archive = async () =>
    withArchive
      ? archiveKeys(domain, selector).catch((e: Error) => {
          archiveError = e.message;
          return [] as KeyCandidate[];
        })
      : [];
  const all = (await Promise.all([dns(DoHServer.Google, "dns:google"), dns(DoHServer.Cloudflare, "dns:cloudflare"), archive()])).flat();
  const seen = new Set<string>();
  const out: KeyCandidates = all.filter((c) => {
    const p = pOf(c.record);
    if (!p || seen.has(p)) return false;
    seen.add(p);
    return true;
  });
  out.archiveError = archiveError;
  return out;
}

type ResolveKeys = (name: string, withArchive: boolean) => Promise<KeyCandidates>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RawResult = { [key: string]: any };

async function runVerifier(email: string | Uint8Array, domain: string, skipBodyHash: boolean, resolver: (name: string) => Promise<string[]>) {
  const v = new DkimVerifier({ resolver: async (name: string) => resolver(name), skipBodyHash } as never);
  await writeToStream(v, email as never);
  let d = domain;
  if (!d) {
    if (v.headerFrom.length > 1) throw new Error("Multiple From header in email and domain for verification not specified");
    d = v.headerFrom[0].split("@")[1];
  }
  const r = v.results.find((x) => x.signingDomain === d) as RawResult | undefined;
  if (!r) throw new Error(`DKIM signature not found for domain ${d}`);
  return r;
}

const b64ToBytes = (b64: string) => Uint8Array.from(atob(b64.replace(/\s+/g, "")), (c) => c.charCodeAt(0));
/**
 * SPKI PEM -> RSA modulus, via WebCrypto (browser and Node 20+), so no node-forge dependency.
 * mailauth's getPublicKey always hands back "BEGIN PUBLIC KEY" (SPKI), so no PKCS#1 path.
 */
async function modulusOf(pem: string): Promise<bigint> {
  const der = b64ToBytes(pem.replace(/-----[^-]+-----/g, ""));
  const key = await crypto.subtle.importKey("spki", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, true, ["verify"]);
  const n = (await crypto.subtle.exportKey("jwk", key)).n!;
  const b64 = n.replace(/-/g, "+").replace(/_/g, "/");
  const hex = Array.from(b64ToBytes(b64 + "=".repeat((4 - (b64.length % 4)) % 4)), (b) => b.toString(16).padStart(2, "0")).join("");
  return BigInt("0x" + hex);
}

/**
 * Drop-in for verifyDKIMSignature(email, domain, enableSanitization, _, skipBodyHash): same result
 * shape plus `keySource`. Throws the same "DKIM signature verification failed for domain …"
 * message (from the first candidate's attempt) when no key verifies.
 */
export async function verifyDkimWithKeyCandidates(
  email: string | Uint8Array,
  domain = "",
  enableSanitization = true,
  skipBodyHash = false,
  resolveKeys: ResolveKeys = dkimKeyCandidates
): Promise<DkimKeyResult> {
  const emailStr = typeof email === "string" ? email : new TextDecoder("latin1").decode(email);
  let failure: RawResult | undefined;
  let archiveError: string | undefined;
  // Phase 1: DNS keys only. Phase 2: archived keys, fetched only when DNS keys fail for a
  // key-related reason. REASON: the archive allows 10 requests/min per IP; querying it for every
  // email (or for body-hash failures, which no key can fix) would exhaust that quickly.
  for (const withArchive of [false, true]) {
    if (withArchive && failure && /body hash/i.test(failure.status.comment ?? "")) break;
    const cache = new Map<string, Promise<KeyCandidates>>();
    const keys = (name: string) => {
      if (!cache.has(name)) {
        cache.set(
          name,
          resolveKeys(name, withArchive).then((list) => {
            archiveError ??= list.archiveError;
            const kept: KeyCandidates = withArchive ? list.filter((c) => c.source === "archive") : list;
            return kept;
          })
        );
      }
      return cache.get(name)!;
    };
    // Round i serves candidate i for every selector in the message (a message can carry several
    // signatures); stop once i passes the longest candidate list.
    let rounds = 1;
    let served = 0;
    for (let i = 0; i < rounds; i++) {
      const sourceOf = new Map<string, string>();
      const resolver = async (name: string) => {
        const c = await keys(name);
        rounds = Math.max(rounds, c.length);
        if (!c.length) throw Object.assign(new Error(`No DKIM key found for ${name}`), { code: "ENODATA" });
        const pick = c[Math.min(i, c.length - 1)];
        sourceOf.set(name.toLowerCase(), pick.source);
        served++;
        return [pick.record];
      };
      let r = await runVerifier(email, domain, skipBodyHash, resolver);
      let appliedSanitization: string | undefined;
      if (r.status.comment === "bad signature" && enableSanitization) {
        for (const sanitize of sanitizers) {
          const s = await runVerifier(sanitize(emailStr), domain, skipBodyHash, resolver);
          if (s.status.result === "pass") {
            r = s;
            appliedSanitization = sanitize.name;
            break;
          }
        }
      }
      if (r.status.result === "pass") {
        return {
          signature: BigInt(`0x${Array.from(b64ToBytes(r.signature), (b) => b.toString(16).padStart(2, "0")).join("")}`),
          headers: r.status.signedHeaders,
          body: r.body,
          bodyHash: r.bodyHash,
          signingDomain: r.signingDomain,
          publicKey: await modulusOf(r.publicKey.toString()),
          selector: r.selector,
          algo: r.algo,
          format: r.format,
          modulusLength: r.modulusLength,
          appliedSanitization,
          keySource: sourceOf.get(`${r.selector}._domainkey.${r.signingDomain}`.toLowerCase()) ?? "unknown",
        };
      }
      // report the DNS attempt unless an archived key was actually tried
      if (!failure || (withArchive && served > 0)) failure = r;
    }
  }
  const note = archiveError ? ` (${archiveError})` : "";
  throw new Error(`DKIM signature verification failed for domain ${failure!.signingDomain}. Reason: ${failure!.status.comment}${note}`);
}
