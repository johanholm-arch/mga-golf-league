// In-memory stand-in for @netlify/blobs, used by the tests and by `npm run dev`.
// Supports exactly what api.mjs uses: get/getWithMetadata/setJSON/delete with etags and conditional writes.
const stores = new Map();
export function reset() { stores.clear(); }
export function dump() { return Object.fromEntries([...stores].map(([k, v]) => [k, Object.fromEntries(v)])); }
export function getStore({ name }) {
  if (!stores.has(name)) stores.set(name, new Map());
  const m = stores.get(name);
  const parse = (v, type) => type === 'json' ? JSON.parse(v.data) : v.data;
  return {
    async get(key, { type } = {}) { const v = m.get(key); return v ? parse(v, type) : null; },
    async getWithMetadata(key, { type } = {}) { const v = m.get(key); return v ? { data: parse(v, type), etag: v.etag, metadata: {} } : null; },
    async setJSON(key, data, opts = {}) {
      const cur = m.get(key);
      if (opts.onlyIfNew && cur) return { modified: false };
      if (opts.onlyIfMatch && (!cur || cur.etag !== opts.onlyIfMatch)) return { modified: false };
      const etag = 'e' + Math.random().toString(36).slice(2);
      m.set(key, { data: JSON.stringify(data), etag }); return { modified: true, etag };
    },
    async delete(key) { m.delete(key); },
    async list() { return { blobs: [...m.keys()].map(key => ({ key })), directories: [] }; },
  };
}
