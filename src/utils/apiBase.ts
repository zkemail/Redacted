/**
 * Base URL of the proof API (server/index.js: generate-uuid, get-proof-upload-url, get-data).
 *
 * REASON: in production the same Express server that serves this site also serves /api, so we
 * always call it same-origin. Production builds used to take VITE_GCS_API_URL, and it pointed at
 * a separate Render service (whistleblower-pf9j.onrender.com, same code, same GCS bucket) that
 * sleeps when idle. Every verify link then sat on "Loading verification data…" for 20 s to 2 min
 * while that service woke up. The site's own server is always awake when a page is being served.
 *
 * In dev (vite on :5173, server on :3001) VITE_GCS_API_URL still overrides the local default.
 */
export const API_BASE: string = import.meta.env.DEV
  ? import.meta.env.VITE_GCS_API_URL || "http://localhost:3001/api"
  : "/api";
