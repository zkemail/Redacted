import { execSync } from "child_process";
import { readFileSync, writeFileSync, renameSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface CircuitConfig {
  name: string;
  outputFile: string;
  maxHeaderLength: number;
  maxBodyLength: number;
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

  const nargoVersion = getInstalledVersion("nargo", "--version");
  const bbVersion = getInstalledVersion("bb", "--version");

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

  if (!bbVersion) {
    log("  ⚠️  bb (barretenberg) not found. Version check skipped.", "yellow");
  } else if (bbVersion !== config.versions.barretenberg) {
    log(`  ⚠️  bb version mismatch: found ${bbVersion}, expected ${config.versions.barretenberg}`, "yellow");
  } else {
    log(`  ✅ bb ${bbVersion}`, "green");
  }

  return !hasErrors;
}

function patchMainNr(maxHeaderLength: number, maxBodyLength: number): string {
  const originalContent = readFileSync(MAIN_NR_PATH, "utf-8");

  const patchedContent = originalContent
    .replace(
      /global MAX_EMAIL_HEADER_LENGTH: u32 = \d+;/,
      `global MAX_EMAIL_HEADER_LENGTH: u32 = ${maxHeaderLength};`
    )
    .replace(
      /global MAX_EMAIL_BODY_LENGTH: u32 = \d+;/,
      `global MAX_EMAIL_BODY_LENGTH: u32 = ${maxBodyLength};`
    );

  writeFileSync(MAIN_NR_PATH, patchedContent);

  return originalContent;
}

function restoreMainNr(originalContent: string): void {
  writeFileSync(MAIN_NR_PATH, originalContent);
}

function compileCircuit(): boolean {
  try {
    execSync("nargo compile --force --silence-warnings", {
      cwd: CIRCUIT_DIR,
      stdio: "inherit",
    });
    return true;
  } catch {
    return false;
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

  for (const circuit of config.circuits) {
    log(`  📦 ${circuit.name} (header: ${circuit.maxHeaderLength}, body: ${circuit.maxBodyLength})`, "blue");

    try {
      // Patch main.nr
      patchMainNr(circuit.maxHeaderLength, circuit.maxBodyLength);

      // Compile
      const compileSuccess = compileCircuit();
      if (!compileSuccess) {
        results.push({ name: circuit.name, success: false, error: "Compilation failed" });
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
