import { defineConfig, type Plugin } from "vite";
import fs from "node:fs";
import path from "node:path";
import react from "@vitejs/plugin-react";
import { nodePolyfills } from "vite-plugin-node-polyfills";
import tailwindcss from "@tailwindcss/vite";

// Publishes the agent skill in ./skills at https://<site>/skills/... (SKILL.md, install.sh,
// redacted.mjs, package.json). NOTE: ./skills stays the single source of truth — it is also the
// path `npx skills add zkemail/Redacted` and GitHub links use — so we serve/copy it instead of
// duplicating the files under ./public. node_modules and circuit caches are never published.
const SKILL_MIME: Record<string, string> = {
  ".md": "text/markdown; charset=utf-8",
  ".sh": "text/x-shellscript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};
function publishSkills(): Plugin {
  const root = path.resolve(__dirname, "skills");
  const skip = (name: string) => name === "node_modules" || name.startsWith(".");
  const walk = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      skip(e.name) ? [] : e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)],
    );
  return {
    name: "publish-agent-skills",
    configureServer(server) {
      server.middlewares.use("/skills", (req, res, next) => {
        const rel = decodeURIComponent((req.url || "/").split("?")[0]);
        const file = path.join(root, rel);
        if (!file.startsWith(root + path.sep) || rel.split("/").some(skip) || !fs.existsSync(file) || !fs.statSync(file).isFile())
          return next();
        res.setHeader("Content-Type", SKILL_MIME[path.extname(file)] || "text/plain; charset=utf-8");
        fs.createReadStream(file).pipe(res);
      });
    },
    generateBundle() {
      for (const file of walk(root)) {
        this.emitFile({
          type: "asset",
          fileName: path.join("skills", path.relative(root, file)).split(path.sep).join("/"),
          source: fs.readFileSync(file),
        });
      }
    },
  };
}

export default defineConfig({
  plugins: [
    publishSkills(),
    react(),
    tailwindcss(),
    nodePolyfills({
      globals: {
        Buffer: true,
        global: true,
        process: true,
      },
    }),
  ],
  server: {
    headers: {
      // Required for SharedArrayBuffer support (bb.js multi-threading)
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
  optimizeDeps: {
    exclude: ["@aztec/bb.js"],
  },
  resolve: {
    alias: {
      pino: "pino/browser.js",
    },
  },
});
