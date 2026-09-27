#!/usr/bin/env node
/**
 * redacted.mjs — generate, publish and verify redacted.zk.email proofs from the command line.
 *
 * The raw .eml is only ever read on this machine. Proving happens locally with the same Noir
 * circuits and Barretenberg (UltraHonk) backend the website uses. `publish` uploads only the
 * proof bytes and its public outputs (the masked header/body you previewed), never the email.
 *
 *   node redacted.mjs inspect <email.eml>
 *   node redacted.mjs prove   <email.eml> [mask options] [--out proof.json] [--dry-run] [--publish]
 *   node redacted.mjs publish <proof.json>
 *   node redacted.mjs verify  <https://redacted.zk.email/verify?id=...|uuid|proof.json>
 *
 * Run `node redacted.mjs help` for every option.
 */
import { createHash, createPublicKey } from "node:crypto";
import { promises as dns } from "node:dns";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SITE = (process.env.REDACTED_SITE || "https://redacted.zk.email").replace(/\/$/, "");
const API = (process.env.REDACTED_API || `${SITE}/api`).replace(/\/$/, "");

// NOTE: circuits are pinned by commit AND sha256. The verify page on redacted.zk.email verifies
// against these exact artifacts, so a proof made with any other build would show as invalid there.
// When src/circuit/target/*.json changes in zkemail/Redacted, bump CIRCUIT_REF and the hashes together.
const CIRCUIT_REF = "0f31b43a81f266d304c111cdf68028b484e5ad8c";
const CIRCUIT_BASE =
  process.env.REDACTED_CIRCUIT_BASE ||
  `https://raw.githubusercontent.com/zkemail/Redacted/${CIRCUIT_REF}/src/circuit/target`;
const CIRCUITS = [
  { name: "email_mask_1024_small", keyBits: 1024, maxHeaderLength: 2048, maxBodyLength: 4096, sha256: "5fcb608d0a317af710fab8248a592ed0d8ec1369879d66906541af95d24e8d2a" },
  { name: "email_mask_1024_mid", keyBits: 1024, maxHeaderLength: 2048, maxBodyLength: 8448, sha256: "a70c3864adca8394766cc46cecdcbb77a31bd6e6672787e86d06e9567e8d18db" },
  { name: "email_mask_2048_small", keyBits: 2048, maxHeaderLength: 2048, maxBodyLength: 4096, sha256: "5a8f56aea6efd27d8d884d2284e8907f9d9cbc0a0f6c5be825e3e1da56c51c99" },
  { name: "email_mask_2048_mid", keyBits: 2048, maxHeaderLength: 2048, maxBodyLength: 8448, sha256: "5be92a1a132ddf3800caa22d52aac8eec9f2438270fd94e3e608f21518c36f5b" },
];
const BLOCK = "█";
// REASON: besides the recipient (to/cc/bcc), list-post / list-unsubscribe / reply-to routinely carry
// per-recipient tokens (e.g. GitHub's reply+<token>@reply.github.com) that deanonymize the prover.
const DEFAULT_HIDDEN_HEADERS = ["to", "cc", "bcc", "reply-to", "list-post", "list-unsubscribe"];

const HELP = `redacted.mjs — local ZK email proofs for ${SITE}

Commands
  inspect <eml>            DKIM-check the email, show which circuit fits, list signed headers,
                           and print the DKIM-canonical body (what masks apply to).
  prove <eml> [options]    Build masks, preview the redacted email, prove + verify locally.
  publish <proof.json>     Upload ONLY the proof + its public outputs; prints a shareable
                           ${SITE}/verify?id=... link.
  verify <url|id|file>     Verify a proof locally and check that its DKIM key is the real key
                           published in DNS for the revealed d=/s= (or in archive.zk.email).

<eml> may be a raw .eml file, a file holding base64/base64url raw MIME (e.g. Gmail API
format=RAW / Gmail MCP get_message messageFormat=RAW), or that MCP's JSON response with a "raw" field.

Mask options for prove (hidden bytes become 0x00 in the proof and show as ${BLOCK}):
  --hide-header <names>    Comma list of signed headers whose values to hide.
                           Default: "${DEFAULT_HIDDEN_HEADERS.join(",")}" — recipients plus headers
                           that usually carry per-recipient tokens.
                           Pass "none" to reveal them.
  --only-headers <names>   Hide the values of every signed header except these
                           (e.g. "from,subject,date"). DKIM-Signature d=/s= always stay visible.
  --hide <text>            Hide every occurrence of this text in header values and body.
                           Repeatable. Also matches quoted-printable and base64 encoded copies.
  --hide-regex <regex>     Like --hide but a JavaScript regex (flags "g" + "i"). Repeatable.
  --hide-body              Hide the whole body.
  --reveal <text>          With --hide-body: re-reveal occurrences of this text. Repeatable.
                           Hides always win over reveals.
  --reveal-regex <regex>   Regex form of --reveal.
  --reveal-dkim-hashes     Keep DKIM-Signature bh= and b= visible (hidden by default because bh=
                           lets anyone confirm a guess of a fully hidden body).
  --allow-missing          Don't fail when a --hide target is not found.
  --domain <domain>        DKIM domain to verify (default: taken from the email).
  --dry-run                Only print the redacted preview; don't prove.
  --out <file>             Where to write the proof (default: ./redacted-proof.json).
  --publish                After proving, upload the proof and print the verify link.
  --json                   Machine-readable output on stdout.

Environment: REDACTED_SITE, REDACTED_API, REDACTED_CIRCUIT_BASE, REDACTED_THREADS.
`;

// ---------------------------------------------------------------------------------------------
// small utils

const log = (...a) => console.error(...a);
const die = (msg) => {
  log(`\nerror: ${msg}`);
  process.exit(1);
};
const lat1 = (buf) => Buffer.from(buf).toString("latin1");
const needleLatin1 = (s) => Buffer.from(s, "utf8").toString("latin1");
const splitList = (s) =>
  String(s || "")
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);

async function lib() {
  try {
    const [bb, noir, zk, bignum] = await Promise.all([
      import("@aztec/bb.js"),
      import("@noir-lang/noir_js"),
      import("@zk-email/zkemail-nr"),
      import("@mach-34/noir-bignum-paramgen"),
    ]);
    return { bb, noir, zk, bignum: bignum.default ?? bignum };
  } catch (e) {
    die(
      `dependencies missing (${e.message}).\nRun \`npm install\` in ${HERE} first ` +
        `(or use install.sh from ${SITE}/skills/redacted-email-proof/install.sh).`,
    );
  }
}

// Accept raw .eml, base64/base64url raw MIME, or a Gmail JSON blob with a "raw" field.
export function readEmail(file) {
  const buf = fs.readFileSync(file);
  const head = buf.subarray(0, 4096).toString("utf8").trimStart();
  if (head.startsWith("{")) {
    const j = JSON.parse(buf.toString("utf8"));
    const raw = j.raw ?? j.message?.raw ?? j.messages?.[0]?.raw;
    if (!raw) die(`${file} is JSON but has no "raw" field. Fetch the message with RAW format.`);
    return decodeB64(raw);
  }
  const firstLine = head.split(/\r?\n/, 1)[0];
  const looksLikeHeader = /^[\x21-\x39\x3b-\x7e]+:/.test(firstLine);
  const text = buf.toString("latin1").trim();
  if (!looksLikeHeader && /^[A-Za-z0-9+/=_\-\s]+$/.test(text)) return decodeB64(text);
  return buf;
}
const decodeB64 = (s) =>
  Buffer.from(String(s).replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/"), "base64");

async function dkimOf(emailBuf, domain) {
  const { zk } = await lib();
  try {
    // (email, domain, enableSanitization, fallbackToZKEmailDNSArchive) — the archive fallback
    // lets old emails prove after the sender rotated its DKIM key.
    return await zk.verifyDKIMSignature(emailBuf, domain, true, true);
  } catch (e) {
    die(
      `DKIM verification failed: ${e.message}\n` +
        `The file must be the ORIGINAL raw message (Gmail: "Show original" → "Download original", ` +
        `or API/MCP format=RAW). Forwarded, re-saved or copy-pasted emails lose their signature.`,
    );
  }
}

function pickCircuit(keyBits, headerLen, bodyLen) {
  const fits = CIRCUITS.filter((c) => c.keyBits === keyBits);
  if (!fits.length) die(`unsupported DKIM key size ${keyBits} bits (supported: 1024, 2048).`);
  if (headerLen > 2048)
    die(`signed header is ${headerLen} bytes; the Redacted circuits support at most 2048.`);
  const c = fits.find((x) => bodyLen <= x.maxBodyLength);
  if (!c)
    die(
      `canonical body is ${bodyLen} bytes; the largest Redacted circuit takes ` +
        `${fits.at(-1).maxBodyLength}. Pick a shorter email (e.g. a plain-text one).`,
    );
  return c;
}

async function loadCircuit(c) {
  const dir = path.join(process.env.REDACTED_CACHE || path.join(HERE, ".circuits"), CIRCUIT_REF.slice(0, 12));
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${c.name}.json`);
  const sha = (b) => createHash("sha256").update(b).digest("hex");
  if (fs.existsSync(file) && sha(fs.readFileSync(file)) === c.sha256) return JSON.parse(fs.readFileSync(file, "utf8"));
  log(`Downloading circuit ${c.name} (one-time, ~${c.maxBodyLength > 4096 ? 9 : 4} MB)…`);
  const res = await fetch(`${CIRCUIT_BASE}/${c.name}.json`);
  if (!res.ok) die(`circuit download failed: HTTP ${res.status} ${CIRCUIT_BASE}/${c.name}.json`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (sha(buf) !== c.sha256) die(`circuit ${c.name} sha256 mismatch — refusing to use it.`);
  fs.writeFileSync(file, buf);
  return JSON.parse(buf.toString("utf8"));
}

// ---------------------------------------------------------------------------------------------
// masking

// Each "view" is a decoded rendering of the canonical bytes plus a map from view index back to
// the raw byte range, so a secret is found (and hidden) even when the body carries it as
// quoted-printable or base64. REASON: masking only the literal would leave e.g. a base64 copy
// of the same text readable in the public proof output.
function rawView(s) {
  return { text: s, map: (i) => [i, i + 1] };
}

function qpView(s) {
  let text = "";
  const starts = [];
  const ends = [];
  for (let i = 0; i < s.length; ) {
    if (s[i] === "=" && s[i + 1] === "\r" && s[i + 2] === "\n") {
      i += 3; // soft line break: belongs to no decoded char
      continue;
    }
    if (s[i] === "=" && /^[0-9A-Fa-f]{2}$/.test(s.slice(i + 1, i + 3))) {
      text += String.fromCharCode(parseInt(s.slice(i + 1, i + 3), 16));
      starts.push(i);
      ends.push(i + 3);
      i += 3;
      continue;
    }
    text += s[i];
    starts.push(i);
    ends.push(i + 1);
    i += 1;
  }
  return {
    text,
    // a match spanning a soft break must also hide the "=\r\n" between its chars
    map: (i) => [starts[i], ends[i]],
    span: (a, b) => [starts[a], ends[b - 1]],
  };
}

function base64Views(s) {
  const views = [];
  const re = /(?:^|\r\n)((?:[A-Za-z0-9+/]{16,}={0,2}\r\n){2,}(?:[A-Za-z0-9+/]*={0,2}(?:\r\n|$))?)/g;
  for (const m of s.matchAll(re)) {
    const blockStart = m.index + m[0].indexOf(m[1]);
    const pos = [];
    for (let i = 0; i < m[1].length; i++) if (/[A-Za-z0-9+/=]/.test(m[1][i])) pos.push(blockStart + i);
    const chars = pos.map((p) => s[p]).join("");
    const usable = chars.length - (chars.length % 4);
    const text = Buffer.from(chars.slice(0, usable), "base64").toString("latin1");
    views.push({
      text,
      // decoded byte i lives in base64 group floor(i/3); hide the whole 4-char group
      map: (i) => {
        const g = Math.floor(i / 3) * 4;
        return [pos[g], pos[Math.min(g + 3, pos.length - 1)] + 1];
      },
    });
  }
  return views;
}

function viewsOf(s) {
  const v = [rawView(s)];
  if (/=\r\n|=[0-9A-F]{2}/.test(s)) v.push(qpView(s));
  v.push(...base64Views(s));
  return v;
}

function applyMatches(mask, s, matcher, value, { region } = {}) {
  let found = 0;
  for (const view of viewsOf(s)) {
    for (const [a, b] of matcher(view.text)) {
      const [lo, hi] = view.span ? view.span(a, b) : [view.map(a)[0], view.map(b - 1)[1]];
      let touched = false;
      for (let k = lo; k < hi; k++) {
        if (region && !region(k)) continue;
        mask[k] = value;
        touched = true;
      }
      if (touched) found++;
    }
  }
  return found;
}

const literalMatcher = (needle) => (text) => {
  const out = [];
  if (!needle) return out;
  for (let i = text.indexOf(needle); i !== -1; i = text.indexOf(needle, i + 1)) out.push([i, i + needle.length]);
  return out;
};
const regexMatcher = (src) => (text) => {
  const re = new RegExp(src, "gi");
  return [...text.matchAll(re)].filter((m) => m[0].length).map((m) => [m.index, m.index + m[0].length]);
};

function headerLines(h) {
  const lines = [];
  let off = 0;
  for (const line of h.split("\r\n")) {
    const colon = line.indexOf(":");
    lines.push({ name: line.slice(0, colon).trim().toLowerCase(), start: off, valueStart: off + colon + 1, end: off + line.length });
    off += line.length + 2;
  }
  return lines.filter((l) => l.name);
}

export function buildMasks(dkim, opts) {
  const h = lat1(dkim.headers);
  const b = lat1(dkim.body);
  const headerMask = new Array(h.length).fill(1);
  const bodyMask = new Array(b.length).fill(opts["hide-body"] ? 0 : 1);
  const lines = headerLines(h);
  const hideRange = (m, lo, hi) => {
    for (let k = lo; k < hi; k++) m[k] = 0;
  };
  const warnings = [];

  const only = opts["only-headers"] ? new Set([...splitList(opts["only-headers"]), "dkim-signature"]) : null;
  const hidden = new Set(opts["hide-header"] === undefined ? DEFAULT_HIDDEN_HEADERS : splitList(opts["hide-header"]).filter((x) => x !== "none"));
  for (const l of lines) {
    if ((only && !only.has(l.name)) || hidden.has(l.name)) hideRange(headerMask, l.valueStart, l.end);
  }

  const dkimLine = lines.find((l) => l.name === "dkim-signature");
  if (dkimLine) {
    // always keep d= and s= readable: they name the key a verifier must check against DNS
    const seg = h.slice(dkimLine.valueStart, dkimLine.end);
    for (const tag of ["d", "s"]) {
      const m = new RegExp(`(?:^|;)\\s*${tag}=([^;]*)`).exec(seg);
      if (m) {
        const lo = dkimLine.valueStart + m.index;
        for (let k = lo; k < lo + m[0].length; k++) headerMask[k] = 1;
      }
    }
    if (!opts["reveal-dkim-hashes"]) {
      for (const tag of ["bh", "b"]) {
        const m = new RegExp(`(?:^|;)\\s*${tag}=([^;]*)`).exec(seg);
        if (m) {
          const lo = dkimLine.valueStart + m.index + m[0].indexOf("=") + 1;
          hideRange(headerMask, lo, dkimLine.valueStart + m.index + m[0].length);
        }
      }
    }
  }

  // reveals first, hides last: hides always win
  for (const t of [].concat(opts.reveal || [])) {
    if (!applyMatches(bodyMask, b, literalMatcher(needleLatin1(t)), 1)) warnings.push(`--reveal "${t}" not found in body`);
  }
  for (const r of [].concat(opts["reveal-regex"] || [])) {
    if (!applyMatches(bodyMask, b, regexMatcher(r), 1)) warnings.push(`--reveal-regex /${r}/ matched nothing in body`);
  }

  // header name bytes are structural; only hide inside values
  const inValue = (k) => lines.some((l) => k >= l.valueStart && k < l.end);
  const missing = [];
  const hides = [
    ...[].concat(opts.hide || []).map((t) => [`"${t}"`, literalMatcher(needleLatin1(t))]),
    ...[].concat(opts["hide-regex"] || []).map((r) => [`/${r}/`, regexMatcher(r)]),
  ];
  for (const [label, matcher] of hides) {
    const n = applyMatches(headerMask, h, matcher, 0, { region: inValue }) + applyMatches(bodyMask, b, matcher, 0);
    if (!n) missing.push(label);
  }
  return { h, b, headerMask, bodyMask, missing, warnings };
}

// Long hidden runs (usually whole hidden lines, newlines included) become one "█×N" marker so the
// preview stays readable in a terminal or an agent's context window.
const compact = (s) => s.replace(new RegExp(`${BLOCK}{12,}`, "g"), (m) => `${BLOCK}×${m.length}`);

function render(s, mask) {
  // Same bytes the proof will publish (hidden → 0x00), keeping line breaks so the preview stays readable.
  const bytes = Buffer.from(s, "latin1").map((v, i) => (mask[i] || v === 0x0d || v === 0x0a ? v : 0));
  return compact(bytes.toString("utf8").replace(/\u0000/g, BLOCK).replace(/\r\n/g, "\n"));
}

// ---------------------------------------------------------------------------------------------
// proof decoding + DKIM key binding

function outputsOf(publicInputs, maxHeaderLength) {
  const byte = (x) => parseInt(String(x).slice(-2), 16);
  const bytes = publicInputs.slice(2).map(byte);
  const trim = (arr) => {
    let end = arr.length;
    while (end > 0 && arr[end - 1] === 0) end--;
    // strip SHA-256 padding (0x80 … length) that the circuit carries along
    for (let i = end - 1; i >= 0 && i >= end - 72; i--) {
      if (arr[i] === 0x80 && arr.slice(i + 1, Math.max(i + 1, end - 8)).every((v) => v === 0)) {
        end = i;
        break;
      }
    }
    return arr.slice(0, end);
  };
  const show = (arr) =>
    Buffer.from(arr.map((v) => (v === 0 ? 0xff : v)))
      .toString("latin1")
      .replace(/\xff/g, "\u0000");
  const header = show(trim(bytes.slice(0, maxHeaderLength)));
  const body = show(trim(bytes.slice(maxHeaderLength)));
  const pretty = (s) => compact(Buffer.from(s, "latin1").toString("utf8").replace(/\u0000/g, BLOCK).replace(/\r\n/g, "\n"));
  return { header, body, headerText: pretty(header), bodyText: pretty(body) };
}

async function pubkeyHash(modulus, keyBits) {
  const { zk, bignum } = await lib();
  const limbs = bignum.bnToLimbStrArray(modulus, keyBits).map((x) => BigInt(x));
  const redc = bignum.bnToRedcLimbStrArray(modulus, keyBits).map((x) => BigInt(x));
  if (keyBits === 2048) return await zk.hashRSAPublicKey(limbs, redc);
  // Mirrors RSAPubkey<KEY_LIMBS_1024>::hash in zkemail.nr v.1.0.1-beta.5 (lib/src/dkim.nr).
  const { buildPoseidon } = await import("circomlibjs");
  const poseidon = await buildPoseidon();
  const s120 = 1n << 120n;
  const pre = new Array(9).fill(0n);
  for (let i = 0; i < 4; i++) {
    pre[i] = limbs[i * 2] * s120 + limbs[i * 2 + 1];
    pre[i + 4] = redc[i * 2] * s120 + redc[i * 2 + 1];
  }
  pre[8] = limbs[8] * s120 + redc[8];
  return poseidon.F.toObject(poseidon(pre));
}

function modulusFromP(p) {
  const der = Buffer.from(p.replace(/\s+/g, ""), "base64");
  for (const type of ["spki", "pkcs1"]) {
    try {
      const jwk = createPublicKey({ key: der, format: "der", type }).export({ format: "jwk" });
      return BigInt("0x" + Buffer.from(jwk.n, "base64url").toString("hex"));
    } catch {
      /* try next encoding */
    }
  }
  return null;
}

async function candidateKeys(domain, selector) {
  const keys = [];
  try {
    const recs = await dns.resolveTxt(`${selector}._domainkey.${domain}`);
    for (const r of recs) {
      const p = /(?:^|;)\s*p=([^;]*)/.exec(r.join(""))?.[1];
      if (p) keys.push({ source: `DNS ${selector}._domainkey.${domain} (live)`, p });
    }
  } catch (e) {
    keys.push({ source: `DNS lookup failed: ${e.code || e.message}`, p: null });
  }
  try {
    const res = await fetch(`https://archive.zk.email/api/key?domain=${encodeURIComponent(domain)}`);
    if (res.ok) {
      for (const k of await res.json()) {
        if (k.selector !== selector) continue;
        const p = /(?:^|;)\s*p=([^;]*)/.exec(k.value || "")?.[1];
        if (p) keys.push({ source: `archive.zk.email ${selector}/${domain} (first seen ${k.firstSeenAt?.slice(0, 10) ?? "?"}, last seen ${k.lastSeenAt?.slice(0, 10) ?? "?"})`, p });
      }
    }
  } catch {
    /* archive is best-effort */
  }
  return keys;
}

async function checkKeyBinding(publicInputs, headerText, keyBits) {
  const want = BigInt(publicInputs[0]);
  const dkimLine = headerText.split("\n").find((l) => /^dkim-signature:/i.test(l)) || "";
  const tag = (t) => new RegExp(`(?:^|;|:)\\s*${t}=([^;]*)`).exec(dkimLine)?.[1]?.trim();
  const d = tag("d");
  const s = tag("s");
  const from = headerText.split("\n").find((l) => /^from:/i.test(l)) || "";
  const out = { domain: d, selector: s, matched: null, tried: [], fromAligned: null };
  if (!d || !s || d.includes(BLOCK) || s.includes(BLOCK)) return out;
  const fromDomain = /@([A-Za-z0-9.-]+)/.exec(from)?.[1]?.toLowerCase();
  if (fromDomain) out.fromAligned = fromDomain === d.toLowerCase() || fromDomain.endsWith("." + d.toLowerCase());
  for (const k of await candidateKeys(d, s)) {
    out.tried.push(k.source);
    if (!k.p) continue;
    const n = modulusFromP(k.p);
    if (!n) continue;
    if ((await pubkeyHash(n, keyBits)) === want) {
      out.matched = k.source;
      break;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// commands

async function cmdInspect(file, opts) {
  const dkim = await dkimOf(readEmail(file), opts.domain);
  const c = pickCircuit(dkim.modulusLength, dkim.headers.length, dkim.body.length);
  const lines = headerLines(lat1(dkim.headers));
  const info = {
    dkim: "pass",
    signingDomain: dkim.signingDomain,
    selector: dkim.selector,
    keyBits: dkim.modulusLength,
    sanitization: dkim.appliedSanitization || null,
    headerBytes: dkim.headers.length,
    bodyBytes: dkim.body.length,
    circuit: c.name,
    signedHeaders: lines.map((l) => l.name),
  };
  if (opts.json) {
    console.log(JSON.stringify({ ...info, header: lat1(dkim.headers), body: lat1(dkim.body) }, null, 2));
    return;
  }
  console.log(JSON.stringify(info, null, 2));
  console.log("\n----- signed header (DKIM-canonical) -----\n" + Buffer.from(dkim.headers).toString("utf8").replace(/\r\n/g, "\n"));
  console.log("----- body (DKIM-canonical; masks apply to these bytes) -----\n" + Buffer.from(dkim.body).toString("utf8").replace(/\r\n/g, "\n"));
}

async function cmdProve(file, opts) {
  const emailBuf = readEmail(file);
  const dkim = await dkimOf(emailBuf, opts.domain);
  const c = pickCircuit(dkim.modulusLength, dkim.headers.length, dkim.body.length);
  const m = buildMasks(dkim, opts);

  log(`DKIM ok: d=${dkim.signingDomain} s=${dkim.selector} (${dkim.modulusLength}-bit) → circuit ${c.name}`);
  log(`\n===== what the proof will reveal (${BLOCK} = hidden) =====\n`);
  log(render(m.h, m.headerMask));
  log("\n" + render(m.b, m.bodyMask));
  log("===== end preview =====\n");
  for (const w of m.warnings) log(`warning: ${w}`);
  const hiddenH = m.headerMask.filter((x) => !x).length;
  const hiddenB = m.bodyMask.filter((x) => !x).length;
  log(`hidden: ${hiddenH}/${m.h.length} header bytes, ${hiddenB}/${m.b.length} body bytes`);
  if (m.missing.length) {
    const msg = `these --hide targets were not found in the signed content: ${m.missing.join(", ")}. ` +
      `Run \`inspect\` and copy the text exactly as it appears in the canonical header/body.`;
    if (!opts["allow-missing"]) die(msg);
    log(`warning: ${msg}`);
  }
  if (opts["dry-run"]) return;

  const { bb, noir, zk } = await lib();
  const circuit = await loadCircuit(c);
  const pad = (arr, n) => (arr.length < n ? [...arr, ...new Array(n - arr.length).fill(1)] : arr.slice(0, n));
  const inputs = zk.generateEmailVerifierInputsFromDKIMResult(dkim, {
    headerMask: pad(m.headerMask, c.maxHeaderLength),
    bodyMask: pad(m.bodyMask, c.maxBodyLength),
    maxHeadersLength: c.maxHeaderLength,
    maxBodyLength: c.maxBodyLength,
  });
  const threads = Number(process.env.REDACTED_THREADS) || Math.max(1, os.cpus().length);
  log(`Generating witness…`);
  const t0 = Date.now();
  const { witness } = await new noir.Noir(circuit).execute(inputs);
  log(`Proving with UltraHonk (${threads} threads; typically 1–4 min, ~4 GB RAM)…`);
  const backend = new bb.UltraHonkBackend(circuit.bytecode, { threads });
  const proof = await backend.generateProof(witness);
  log(`Proof generated in ${((Date.now() - t0) / 1000).toFixed(1)} s. Verifying locally…`);
  const ok = await backend.verifyProof(proof);
  await backend.destroy?.();
  if (!ok) die("local verification of the fresh proof failed.");

  const record = {
    format: "redacted-proof/v1",
    site: SITE,
    circuit: c.name,
    circuitRef: CIRCUIT_REF,
    signingDomain: dkim.signingDomain,
    selector: dkim.selector,
    keyBits: dkim.modulusLength,
    createdAt: new Date().toISOString(),
    // exactly what the website stores and verifies; contains no raw email
    publicInputs: proof.publicInputs.map(String),
    proof: Array.from(proof.proof),
  };
  const out = path.resolve(opts.out || "redacted-proof.json");
  fs.writeFileSync(out, JSON.stringify(record));
  log(`Verified locally. Proof written to ${out}`);
  const result = { proofFile: out, circuit: c.name, signingDomain: dkim.signingDomain };
  if (opts.publish) Object.assign(result, await publishRecord(record));
  if (opts.json) console.log(JSON.stringify(result, null, 2));
  else if (result.verifyUrl) console.log(result.verifyUrl);
}

async function publishRecord(record) {
  const body = JSON.stringify({ publicInputs: record.publicInputs, proof: record.proof });
  const post = async (p, json) => {
    const r = await fetch(`${API}${p}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(json) });
    if (!r.ok) die(`${p} failed: HTTP ${r.status} ${await r.text()}`);
    return r.json();
  };
  const { uuid } = await post("/generate-uuid", {});
  // Masks are deliberately NOT sent: the verify page reads everything from the proof outputs,
  // and the mask arrays would only leak the positions/lengths of hidden spans.
  const { uploadUrl } = await post("/get-proof-upload-url", { uuid, headerMask: [], bodyMask: [] });
  const put = await fetch(uploadUrl, { method: "PUT", headers: { "content-type": "application/json" }, body });
  if (!put.ok) die(`proof upload failed: HTTP ${put.status} ${await put.text()}`);
  const back = await fetch(`${API}/get-data/${uuid}`);
  if (!back.ok) die(`uploaded, but read-back failed: HTTP ${back.status}`);
  const got = await back.json();
  if (JSON.stringify(got.proof?.publicInputs) !== JSON.stringify(record.publicInputs))
    die("uploaded proof does not round-trip; not sharing the link.");
  const verifyUrl = `${SITE}/verify?id=${uuid}`;
  log(`Published (${(body.length / 1024).toFixed(0)} KB: proof + public outputs only). Share: ${verifyUrl}`);
  return { uuid, verifyUrl };
}

async function cmdPublish(file, opts) {
  const record = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!Array.isArray(record.publicInputs) || !Array.isArray(record.proof)) die(`${file} is not a redacted proof file.`);
  const r = await publishRecord(record);
  console.log(opts.json ? JSON.stringify(r, null, 2) : r.verifyUrl);
}

async function loadProofRef(ref) {
  if (fs.existsSync(ref)) return JSON.parse(fs.readFileSync(ref, "utf8"));
  const id = /[?&]id=([0-9a-f-]{36})/i.exec(ref)?.[1] || (/^[0-9a-f-]{36}$/i.test(ref) ? ref : null);
  if (!id) die(`not a file, verify URL, or proof id: ${ref}`);
  const r = await fetch(`${API}/get-data/${id}`);
  if (!r.ok) die(`could not fetch proof ${id}: HTTP ${r.status}`);
  return (await r.json()).proof;
}

async function cmdVerify(ref, opts) {
  const { bb } = await lib();
  const rec = await loadProofRef(ref);
  const publicInputs = rec.publicInputs.map(String);
  const proof = { publicInputs, proof: Uint8Array.from(rec.proof) };
  const bodyLen = publicInputs.length - 2 - 2048;
  // rec.circuit is only a hint (try it first); any shape-matching circuit may verify. After
  // that, 2048-bit DKIM keys are by far the most common today, so try those first.
  const shape = CIRCUITS.filter((c) => c.maxBodyLength === bodyLen);
  const named = shape.filter((c) => rec.circuit === c.name);
  const candidates = [...named, ...shape.filter((c) => !named.includes(c)).sort((a, b) => b.keyBits - a.keyBits)];
  if (!candidates.length) die(`unknown proof shape (${publicInputs.length} public inputs).`);
  let circuitUsed = null;
  for (const c of candidates) {
    const circuit = await loadCircuit(c);
    const backend = new bb.UltraHonkBackend(circuit.bytecode, { threads: Math.max(1, os.cpus().length) });
    let ok = false;
    try {
      ok = await backend.verifyProof(proof);
    } catch {
      ok = false;
    }
    await backend.destroy?.();
    if (ok) {
      circuitUsed = c;
      break;
    }
  }
  const outs = outputsOf(publicInputs, 2048);
  const binding = circuitUsed ? await checkKeyBinding(publicInputs, outs.headerText, circuitUsed.keyBits) : null;
  const result = {
    proofValid: Boolean(circuitUsed),
    circuit: circuitUsed?.name ?? null,
    dkimDomain: binding?.domain ?? null,
    dkimSelector: binding?.selector ?? null,
    keyMatches: binding?.matched ?? null,
    keysTried: binding?.tried ?? [],
    fromAlignedWithDkimDomain: binding?.fromAligned ?? null,
    maskedHeader: outs.headerText,
    maskedBody: outs.bodyText,
  };
  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`proof: ${result.proofValid ? "VALID" : "INVALID"}${circuitUsed ? ` (${circuitUsed.name})` : ""}`);
    if (circuitUsed) {
      console.log(
        result.keyMatches
          ? `dkim key: matches ${result.keyMatches} → signed by ${result.dkimDomain}`
          : `dkim key: NOT matched to any published key for d=${result.dkimDomain} s=${result.dkimSelector} ` +
              `(tried: ${result.keysTried.join("; ") || "none"}). Treat the sender as unproven.`,
      );
      if (result.fromAlignedWithDkimDomain === false) console.log(`warning: From: domain is not the DKIM signing domain.`);
    }
    console.log("\n----- masked header -----\n" + outs.headerText + "\n----- masked body -----\n" + outs.bodyText);
  }
  if (!result.proofValid) process.exit(2);
  if (!result.keyMatches) process.exit(3);
}

// ---------------------------------------------------------------------------------------------

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const { values: opts, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      "hide-header": { type: "string" },
      "only-headers": { type: "string" },
      hide: { type: "string", multiple: true },
      "hide-regex": { type: "string", multiple: true },
      "hide-body": { type: "boolean" },
      reveal: { type: "string", multiple: true },
      "reveal-regex": { type: "string", multiple: true },
      "reveal-dkim-hashes": { type: "boolean" },
      "allow-missing": { type: "boolean" },
      domain: { type: "string" },
      "dry-run": { type: "boolean" },
      out: { type: "string" },
      publish: { type: "boolean" },
      json: { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
  });
  const [cmd, arg] = positionals;
  const need = () => arg || die(`\`${cmd}\` needs an argument. See \`node redacted.mjs help\`.`);
  const run = { inspect: cmdInspect, prove: cmdProve, publish: cmdPublish, verify: cmdVerify }[cmd];
  if (!run || opts.help) {
    console.log(HELP);
    process.exit(run || cmd === "help" || opts.help ? 0 : 1);
  }
  run(need(), opts)
    .then(() => process.exit(0))
    .catch((e) => die(e?.stack || String(e)));
}
