import "./polyfills";
import { UltraHonkBackend, type ProofData } from "@aztec/bb.js";
import { Noir } from "@noir-lang/noir_js";
import initNoirC from "@noir-lang/noirc_abi";
import initACVM from "@noir-lang/acvm_js";
import acvm from "@noir-lang/acvm_js/web/acvm_js_bg.wasm?url";
import noirc from "@noir-lang/noirc_abi/web/noirc_abi_wasm_bg.wasm?url";
// import circuit from "./circuit/target/circuit.json";
import { generateEmailVerifierInputs } from "@zk-email/zkemail-nr";
import circuitEmailMask from "./circuit/target/email_mask.json";

// Initialize WASM modules
await Promise.all([initACVM(fetch(acvm)), initNoirC(fetch(noirc))]);

export const handleGenerateProof = async (
  email: string,
  headerMask: number[],
  bodyMask: number[]
) => {
  try {
    const noir = new Noir(circuitEmailMask);
    const backend = new UltraHonkBackend(circuitEmailMask.bytecode);

    const inputParams = {
      maxHeadersLength: 512,
      maxBodyLength: 1024,
    };

    // Slice arrays to match max lengths
    const trimmedHeaderMask = headerMask.slice(0, 512);
    const trimmedBodyMask = bodyMask.slice(0, 1024);

    console.log("trimmedHeaderMask", email, trimmedHeaderMask, trimmedBodyMask);

    const inputs = await generateEmailVerifierInputs(email, {
      headerMask: trimmedHeaderMask,
      bodyMask: trimmedBodyMask,
      ...inputParams,
    });
    // generate witness
    const { witness } = await noir.execute(inputs);

    console.time("generateProof");
    const proof = await backend.generateProof(witness);
    console.timeEnd("generateProof");

    return proof;
  } catch (e) {
    console.error(e);
  }
};

export const handleVerifyProof = async (proof: ProofData) => {
  try {
    const backend = new UltraHonkBackend(circuitEmailMask.bytecode);

    console.time("verifyProof");
    const isValid = await backend.verifyProof(proof);
    console.timeEnd("verifyProof");

    return isValid;
  } catch (e) {
    console.error(e);
    return false;
  }
};
