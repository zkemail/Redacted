/**
 * Synthetic DKIM material for tests: ephemeral RSA keys, signed DKIM-canonical headers, circuit
 * inputs, and a c=simple/simple email signer. No real email and no network.
 */
import { createHash, generateKeyPairSync, sign, type KeyObject } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { bnToLimbStrArray } from "@mach-34/noir-bignum-paramgen";
import { sha256Pad } from "@zk-email/helpers/dist/sha-utils";
import type { CompiledCircuit } from "@noir-lang/noir_js";
import { dkimFieldSequence } from "../../src/utils/dkimFields";

export const ROOT = join(import.meta.dirname, "..", "..");
export const loadCircuit = (name: string) =>
  JSON.parse(readFileSync(join(ROOT, "src/circuit/target", `${name}.json`), "utf8")) as CompiledCircuit;
export const loadVk = (name: string) => new Uint8Array(readFileSync(join(ROOT, "src/circuit/target/vk", `${name}.vk`)));

export interface RsaKey {
  privateKey: KeyObject;
  modulus: bigint;
  /** DKIM TXT record with an SPKI p= (the RFC 6376 form) */
  record: string;
  /** same key as a PKCS#1 p= (some domains publish this) */
  pkcs1Record: string;
}

export function rsaKey(bits = 2048): RsaKey {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: bits });
  const modulus = BigInt("0x" + Buffer.from(publicKey.export({ format: "jwk" }).n!, "base64url").toString("hex"));
  const der = (type: "spki" | "pkcs1") => publicKey.export({ format: "der", type }).toString("base64");
  return { privateKey, modulus, record: `v=DKIM1; k=rsa; p=${der("spki")}`, pkcs1Record: `v=DKIM1; k=rsa; p=${der("pkcs1")}` };
}

export const bodyHash = (body: Buffer) => createHash("sha256").update(body).digest("base64");

/**
 * A signed DKIM-canonical header: `lines` (each ending in CRLF), then the DKIM-Signature field
 * built by `dkim(bh)` with an empty b=. Signed over exactly those bytes, as DKIM does.
 */
export function signedHeader(key: RsaKey, lines: string, dkim: (bh: string) => string, body: Buffer) {
  const header = Buffer.from(lines + dkim(bodyHash(body)));
  const signature = BigInt("0x" + sign("RSA-SHA256", header, key.privateKey).toString("hex"));
  return { header, body, signature };
}

/** Circuit inputs for main.nr (sizes H/B), all bytes revealed unless masks are given. */
export function circuitInputs(
  s: { header: Buffer; body: Buffer; signature: bigint },
  key: RsaKey,
  keyBits: number,
  H: number,
  B: number,
  masks: { header?: boolean[]; body?: boolean[] } = {}
) {
  const seq = dkimFieldSequence(s.header.toString("latin1"));
  const storage = (bytes: Buffer, size: number) => [...sha256Pad(new Uint8Array(bytes), size)[0]].map(String);
  return {
    header: { storage: storage(s.header, H), len: String(s.header.length) },
    body: { storage: storage(s.body, B), len: String(s.body.length) },
    pubkey: {
      modulus: bnToLimbStrArray(key.modulus, keyBits),
      redc: bnToLimbStrArray((1n << (2n * BigInt(keyBits) + 6n)) / key.modulus),
    },
    signature: bnToLimbStrArray(s.signature, keyBits),
    body_hash_index: String(seq.bodyHashIndex),
    dkim_header_sequence: { index: String(seq.index), length: String(seq.length) },
    header_mask: masks.header ?? Array(H).fill(true),
    body_mask: masks.body ?? Array(B).fill(true),
  };
}

type ReturnValue = [string[], string[], string[]];
export const toPublicInputs = (rv: ReturnValue) =>
  [...rv[0], ...rv[1], ...rv[2]].map((x) => "0x" + BigInt(x).toString(16).padStart(64, "0"));

/**
 * A complete .eml signed with DKIM c=simple/simple (RFC 6376 §3.4.1/§3.4.3): header names keep
 * their case and folded lines stay folded. `headers` are raw header lines (folds included).
 */
export function simpleSignedEml(key: RsaKey, domain: string, selector: string, headers: string[], body: string) {
  // simple body: trailing empty lines reduced to one CRLF
  const canonBody = body.replace(/(\r\n)*$/, "") + "\r\n";
  const bh = bodyHash(Buffer.from(canonBody));
  const names = headers.map((h) => h.slice(0, h.indexOf(":")));
  const dkimNoB =
    `DKIM-Signature: v=1; a=rsa-sha256; c=simple/simple; d=${domain};\r\n` +
    `\ts=${selector}; h=${names.join(":")}; bh=${bh}; b=`;
  const signingInput = headers.map((h) => h + "\r\n").join("") + dkimNoB;
  const b = sign("RSA-SHA256", Buffer.from(signingInput), key.privateKey).toString("base64");
  return `${dkimNoB}${b}\r\n` + headers.map((h) => h + "\r\n").join("") + "\r\n" + canonBody;
}
