// In-memory stand-in for @google-cloud/storage (only what server/index.js uses).
const objects = new Map(Object.entries(JSON.parse(process.env.GCS_STUB_OBJECTS || "{}")));
class File {
  constructor(name) {
    this.name = name;
  }
  async exists() {
    return [objects.has(this.name)];
  }
  async save(data) {
    objects.set(this.name, String(data));
  }
  async download() {
    return [Buffer.from(objects.get(this.name) ?? "")];
  }
  async getSignedUrl({ action }) {
    return [`https://storage.example/${action}/${encodeURIComponent(this.name)}`];
  }
}
export class Storage {
  bucket() {
    return { file: (name) => new File(name) };
  }
}
