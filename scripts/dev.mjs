// Local preview: serves public/ and runs the real API function against an in-memory store.
// Usage: npm run dev   (then open http://localhost:8787; setup code is "demo", data resets on restart)
// Add SEED=1 to start with a 10-team sample league already set up (commissioner PIN 1234, join code DEMO).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.SESSION_SECRET ||= 'local-dev-secret-not-for-production';
process.env.SETUP_CODE ||= 'demo';
const PUB = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const { default: handler } = await import('../netlify/functions/api.mjs');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.woff2': 'font/woff2', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };

const port = +(process.env.PORT || 8787);
http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  if (url.pathname.startsWith('/api/')) {
    let body = ''; for await (const c of req) body += c;
    const r = await handler(new Request(url, { method: req.method, headers: req.headers, body: req.method === 'POST' ? body : undefined }), { ip: req.socket.remoteAddress });
    res.writeHead(r.status, Object.fromEntries(r.headers)); res.end(r.status === 304 ? undefined : await r.text()); return;
  }
  let f = path.join(PUB, decodeURIComponent(url.pathname)); if (url.pathname === '/' || !fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(PUB, 'index.html');
  if (!f.startsWith(PUB)) { res.writeHead(403); res.end(); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(fs.readFileSync(f));
}).listen(port, async () => {
  console.log(`League preview on http://localhost:${port}  (setup code: ${process.env.SETUP_CODE})`);
  if (process.env.SEED) await seed();
});

async function seed() {
  const { seedLeague } = await import('./seed.mjs');
  await seedLeague(handler);
  console.log('Seeded: sign in as "Jim Allen" with PIN 1234 (Commissioner). Join code DEMO.');
}
