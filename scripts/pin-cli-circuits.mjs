#!/usr/bin/env node
// Writes the circuit pins (commit + sha256 of every artifact and VK) into the agent CLI.
//
//   node scripts/pin-cli-circuits.mjs <commit-sha>
//
// Run it after `yarn compile:circuits`, once the new artifacts are committed and pushed. The
// CLI downloads artifacts from raw.githubusercontent.com at <commit-sha>, and refuses any file
// whose sha256 differs from these pins. The pins are its trust root, so they must come from the
// same build that produced the VKs the website bundles.
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ref = process.argv[2];
if (!/^[0-9a-f]{40}$/.test(ref || "")) {
  console.error("usage: node scripts/pin-cli-circuits.mjs <40-char commit sha>");
  process.exit(1);
}
const target = path.join(root, "src/circuit/target");
const sha = (f) => createHash("sha256").update(fs.readFileSync(f)).digest("hex");
const { circuits } = JSON.parse(fs.readFileSync(path.join(root, "src/circuit-configs.json"), "utf8"));

const rows = circuits.map((c) => {
  const file = path.join(target, c.outputFile);
  const vk = path.join(target, "vk", `${c.name}.vk`);
  for (const f of [file, vk]) if (!fs.existsSync(f)) throw new Error(`missing ${f}; run yarn compile:circuits`);
  return (
    `    { name: "${c.name}", keyBits: ${c.keyBits}, maxHeaderLength: ${c.maxHeaderLength}, ` +
    `maxBodyLength: ${c.maxBodyLength}, file: "${c.outputFile}",\n` +
    `      sha256: "${sha(file)}",\n      vkSha256: "${sha(vk)}" },`
  );
});

const cli = path.join(root, "skills/redacted-email-proof/scripts/redacted.mjs");
let src = fs.readFileSync(cli, "utf8");
src = src.replace(/const CIRCUIT_REF = "[^"]*";/, `const CIRCUIT_REF = "${ref}";`);
src = src.replace(
  /(\n  prefix: 3, [^\n]*\n  circuits: )(?:__V2_CIRCUITS__|\[[\s\S]*?\n  \]),/,
  `$1[\n${rows.join("\n")}\n  ],`,
);
fs.writeFileSync(cli, src);
console.log(`pinned ${rows.length} circuits at ${ref} in ${path.relative(root, cli)}`);
