/**
 * Security review finding 5: a published proof can't be replaced by anyone who knows its uuid
 * (the uuid is in every verify link), and uuids must look like the ones /api/generate-uuid issues.
 * Runs server/index.js against an in-memory Cloud Storage fake (tests/fixtures/gcs-stub.mjs).
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const PORT = 38000 + Math.floor(Math.random() * 1000);
const API = `http://127.0.0.1:${PORT}/api`;
const PUBLISHED = "3f2b8c1e-6a4d-4e59-9b0f-2c7d1a5e8f90";
let server: ChildProcess;

before(async () => {
  server = spawn("node", ["--import", join(ROOT, "tests/fixtures/gcs-stub.mjs"), join(ROOT, "server/index.js")], {
    cwd: ROOT,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      PORT: String(PORT),
      GCS_CREDENTIALS: "{}",
      GCS_BUCKET_NAME: "stub-bucket",
      GCS_STUB_OBJECTS: JSON.stringify({ [`eml/${PUBLISHED}/proof.json`]: JSON.stringify({ publicInputs: ["0x01"], proof: [1] }) }),
    },
  });
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(`http://127.0.0.1:${PORT}/health`)).ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("server did not start");
});
after(() => server.kill());

const uploadUrl = (uuid: unknown) =>
  fetch(`${API}/get-proof-upload-url`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ uuid, headerMask: [], bodyMask: [] }),
  });

test("a new uuid gets an upload URL", async () => {
  const { uuid } = await (await fetch(`${API}/generate-uuid`, { method: "POST" })).json();
  const res = await uploadUrl(uuid);
  assert.equal(res.status, 200);
  assert.ok((await res.json()).uploadUrl);
});

test("an already-published proof can't get a new upload URL (no overwrite)", async () => {
  const res = await uploadUrl(PUBLISHED);
  assert.equal(res.status, 409);
  // and the published proof is unchanged
  const data = await (await fetch(`${API}/get-data/${PUBLISHED}`)).json();
  assert.deepEqual(data.proof.publicInputs, ["0x01"]);
});

test("uuids that aren't generate-uuid's format are rejected", async () => {
  for (const bad of ["../../index.html", "x", PUBLISHED.toUpperCase(), 42]) {
    assert.equal((await uploadUrl(bad)).status, 400, `accepted ${JSON.stringify(bad)}`);
  }
  assert.equal((await fetch(`${API}/get-data/not-a-uuid`)).status, 400);
});
