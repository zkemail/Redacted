// Preloaded with `node --import` in tests: answers DNS-over-HTTPS TXT queries from
// DOH_STUB_RECORDS (JSON { "<sel>._domainkey.<domain>": "v=DKIM1; k=rsa; p=…" }) and fails every
// other request, so tests never touch the network.
const records = JSON.parse(process.env.DOH_STUB_RECORDS || "{}");
globalThis.fetch = async (input) => {
  const url = new URL(String(input));
  const name = url.searchParams.get("name");
  if (name && name in records) {
    return new Response(JSON.stringify({ Status: 0, Answer: [{ name, type: 16, data: records[name] }] }), { status: 200 });
  }
  if (name) return new Response(JSON.stringify({ Status: 3, Answer: [] }), { status: 200 });
  return new Response("offline test", { status: 404 });
};
