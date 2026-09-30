// Preloaded with `node --import` to run server/index.js without Google Cloud: resolves
// "@google-cloud/storage" to an in-memory fake (gcs-storage-stub.mjs). Seed objects with
// GCS_STUB_OBJECTS (JSON { "<object name>": "<contents>" }).
import { register } from "node:module";
register(
  "data:text/javascript," +
    encodeURIComponent(`
      export async function resolve(specifier, context, next) {
        if (specifier === "@google-cloud/storage") return { url: ${JSON.stringify(new URL("./gcs-storage-stub.mjs", import.meta.url).href)}, shortCircuit: true };
        return next(specifier, context);
      }`),
);
