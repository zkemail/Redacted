import { Buffer } from "buffer";
import process from "process";

if (typeof globalThis !== "undefined") {
  if (!globalThis.Buffer) {
    globalThis.Buffer = Buffer;
  }
  if (!globalThis.process) {
    globalThis.process = process;
  }
}

