import { execSync } from "child_process";
import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync, rmSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface CircuitConfig {
  name: string;
  outputFile: string;
  maxHeaderLength: number;
  maxBodyLength: number;
  keyBits: number;
  /** false for tiers too large to prove in a browser (CLI-only) */
  browser?: boolean;
}

interface Config {
  circuits: CircuitConfig[];
  versions: {
    nargo: string;
    barretenberg: string;
  };
}

const ROOT_DIR = join(__dirname, "..");
const CIRCUIT_DIR = join(ROOT_DIR, "src", "circuit");
const MAIN_NR_PATH = join(CIRCUIT_DIR, "src", "main.nr");
const TARGET_DIR = join(CIRCUIT_DIR, "target");
const CONFIG_PATH = join(ROOT_DIR, "src", "circuit-configs.json");
const VK_DIR = join(TARGET_DIR, "vk");
// Override the toolchain with NARGO_BIN / BB_BIN (e.g. a pinned download) instead of PATH.
const NARGO = process.env.NARGO_BIN || "nargo";
const BB = process.env.BB_BIN || "bb";

// ANSI colors for output
const colors = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
};

function log(message: string, color: keyof typeof colors = "reset") {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function getInstalledVersion(command: string, versionFlag: string): string | null {
  try {
    const output = execSync(`${command} ${versionFlag}`, { encoding: "utf-8" });
    // Extract version number from output (e.g., "nargo version = 1.0.0-beta.5" or "bb 0.84.0")
    const match = output.match(/(\d+\.\d+\.\d+(-[\w.]+)?)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

function checkVersions(config: Config): boolean {
  log("\n📋 Checking tool versions...", "cyan");

  const nargoVersion = getInstalledVersion(NARGO, "--version");
  const bbVersion = getInstalledVersion(BB, "--version");

  let hasErrors = false;

  if (!nargoVersion) {
    log("  ❌ nargo not found. Please install Noir.", "red");
    hasErrors = true;
  } else if (nargoVersion !== config.versions.nargo) {
    log(`  ⚠️  nargo version mismatch: found ${nargoVersion}, expected ${config.versions.nargo}`, "yellow");
    hasErrors = true;
  } else {
    log(`  ✅ nargo ${nargoVersion}`, "green");
  }

  // bb is required now: verification keys are generated at build time so the verify page never
  // has to derive them in the browser (that took minutes and cannot work for the large tier).
  if (!bbVersion) {
    log("  ❌ bb (barretenberg) not found. Install it with bbup or set BB_BIN.", "red");
    hasErrors = true;
  } else if (bbVersion !== config.versions.barretenberg) {
    log(`  ⚠️  bb version mismatch: found ${bbVersion}, expected ${config.versions.barretenberg}`, "yellow");
    hasErrors = true;
  } else {
    log(`  ✅ bb ${bbVersion}`, "green");
  }

  return !hasErrors;
}

function patchMainNr(maxHeaderLength: number, maxBodyLength: number, keyBits: number): string {
  const originalContent = readFileSync(MAIN_NR_PATH, "utf-8");

  // Determine the KEY_LIMBS constant to use based on key bits
  const keyLimbsConstant = keyBits === 1024 ? "KEY_LIMBS_1024" : "KEY_LIMBS_2048";

  const patchedContent = originalContent
    .replace(
      /global MAX_EMAIL_HEADER_LENGTH: u32 = \d+;/,
      `global MAX_EMAIL_HEADER_LENGTH: u32 = ${maxHeaderLength};`
    )
    .replace(
      /global MAX_EMAIL_BODY_LENGTH: u32 = \d+;/,
      `global MAX_EMAIL_BODY_LENGTH: u32 = ${maxBodyLength};`
    )
    .replace(
      /global KEY_LIMBS: u32 = KEY_LIMBS_\d+;/,
      `global KEY_LIMBS: u32 = ${keyLimbsConstant};`
    );

  writeFileSync(MAIN_NR_PATH, patchedContent);

  return originalContent;
}

function restoreMainNr(originalContent: string): void {
  writeFileSync(MAIN_NR_PATH, originalContent);
}

function compileCircuit(): boolean {
  try {
    execSync(`${NARGO} compile --force --silence-warnings`, {
      cwd: CIRCUIT_DIR,
      stdio: "inherit",
    });
    return true;
  } catch {
    return false;
  }
}

function writeVk(name: string): boolean {
  const sourcePath = join(TARGET_DIR, "email_mask.json");
  const tmp = join(TARGET_DIR, `vk-tmp-${name}`);
  try {
    execSync(`${BB} write_vk -b "${sourcePath}" -o "${tmp}"`, { stdio: "inherit" });
    mkdirSync(VK_DIR, { recursive: true });
    renameSync(join(tmp, "vk"), join(VK_DIR, `${name}.vk`));
    return true;
  } catch {
    return false;
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

function renameOutput(outputFile: string): boolean {
  const sourcePath = join(TARGET_DIR, "email_mask.json");
  const destPath = join(TARGET_DIR, outputFile);

  if (!existsSync(sourcePath)) {
    log(`    ❌ Compiled output not found: ${sourcePath}`, "red");
    return false;
  }

  renameSync(sourcePath, destPath);
  return true;
}

async function main() {
  log("🔧 Circuit Compilation Automation", "blue");
  log("================================\n", "blue");

  // Load configuration
  const config: Config = JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));

  // Check versions
  const versionsOk = checkVersions(config);
  if (!versionsOk) {
    log("\n⚠️  Version check failed. Continue anyway? (Ctrl+C to abort)", "yellow");
    // Give user a moment to abort if needed
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  // Store original main.nr content
  const originalMainNr = readFileSync(MAIN_NR_PATH, "utf-8");

  const results: { name: string; success: boolean; error?: string }[] = [];

  log("\n🏗️  Compiling circuits...\n", "cyan");

  // `--only a,b` recompiles a subset (the large tier takes minutes and ~9 GB RAM per circuit).
  const onlyArg = process.argv.find((a) => a.startsWith("--only="));
  const only = onlyArg ? new Set(onlyArg.slice(7).split(",")) : null;

  for (const circuit of config.circuits.filter((c) => !only || only.has(c.name))) {
    log(`  📦 ${circuit.name} (key: ${circuit.keyBits}-bit, header: ${circuit.maxHeaderLength}, body: ${circuit.maxBodyLength})`, "blue");

    try {
      // Patch main.nr
      patchMainNr(circuit.maxHeaderLength, circuit.maxBodyLength, circuit.keyBits);

      // Compile
      const compileSuccess = compileCircuit();
      if (!compileSuccess) {
        results.push({ name: circuit.name, success: false, error: "Compilation failed" });
        continue;
      }

      if (!writeVk(circuit.name)) {
        results.push({ name: circuit.name, success: false, error: "bb write_vk failed" });
        continue;
      }

      // Rename output
      const renameSuccess = renameOutput(circuit.outputFile);
      if (!renameSuccess) {
        results.push({ name: circuit.name, success: false, error: "Failed to rename output" });
        continue;
      }

      log(`    ✅ Compiled successfully → ${circuit.outputFile}`, "green");
      results.push({ name: circuit.name, success: true });

    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      log(`    ❌ Error: ${errorMsg}`, "red");
      results.push({ name: circuit.name, success: false, error: errorMsg });
    }
  }

  // Restore original main.nr
  restoreMainNr(originalMainNr);
  log("\n  🔄 Restored original main.nr", "cyan");

  // Summary
  log("\n📊 Summary", "blue");
  log("=========", "blue");

  const successes = results.filter((r) => r.success);
  const failures = results.filter((r) => !r.success);

  log(`  ✅ Successful: ${successes.length}/${results.length}`, successes.length === results.length ? "green" : "yellow");

  if (failures.length > 0) {
    log(`  ❌ Failed: ${failures.length}`, "red");
    for (const failure of failures) {
      log(`     - ${failure.name}: ${failure.error}`, "red");
    }
    process.exit(1);
  }

  log("\n🎉 All circuits compiled successfully!\n", "green");
}

main().catch((err) => {
  log(`\n❌ Fatal error: ${err}`, "red");
  process.exit(1);
});
