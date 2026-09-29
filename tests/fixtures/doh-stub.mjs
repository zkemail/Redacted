// Preloaded with `node --import` in tests (or imported in-process): answers DNS-over-HTTPS TXT
// queries from DOH_STUB_RECORDS (JSON { "<sel>._domainkey.<domain>": "v=DKIM1; k=rsa; p=…" }) and
// archive.prove.email key queries from ARCHIVE_STUB_RECORDS (JSON { "<domain>": [{ selector,
// value, lastSeenAt }] }), and fails every other request, so tests never touch the network.
const realFetch = globalThis.fetch;
export function installStub(records = {}, archive = {}) {
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.pathname === "/api/key") {
      const rows = archive[url.searchParams.get("domain")];
      return rows ? new Response(JSON.stringify(rows), { status: 200 }) : new Response("[]", { status: 200 });
    }
    const name = url.searchParams.get("name");
    if (name && name in records) {
      return new Response(JSON.stringify({ Status: 0, Answer: [{ name, type: 16, data: records[name] }] }), { status: 200 });
    }
    if (name) return new Response(JSON.stringify({ Status: 3, Answer: [] }), { status: 200 });
    return new Response("offline test", { status: 404 });
  };
}
export const restoreFetch = () => (globalThis.fetch = realFetch);
if (process.env.DOH_STUB_RECORDS || process.env.ARCHIVE_STUB_RECORDS) {
  installStub(JSON.parse(process.env.DOH_STUB_RECORDS || "{}"), JSON.parse(process.env.ARCHIVE_STUB_RECORDS || "{}"));
}
