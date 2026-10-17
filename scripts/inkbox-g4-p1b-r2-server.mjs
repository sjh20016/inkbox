#!/usr/bin/env node
// Loopback-only test server for the built package and its non-shipping browser harness.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PACKAGE_ROOT = path.join(ROOT, 'dist', 'zuotian-guan-jing-inkbox-1.0.0');
const EVIDENCE = path.join(ROOT, 'reports', 'analysis', 'g4', 'g4-p1b-r', 'evidence-r2');
const HARNESS = path.join(ROOT, 'scripts', 'inkbox-g4-p1b-r2-harness.html');
if (!fs.existsSync(path.join(PACKAGE_ROOT, 'inkbox.html'))) throw new Error(`Build the package first: ${PACKAGE_ROOT}`);

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.glb': 'model/gltf-binary',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.ico': 'image/x-icon',
};

const server = http.createServer((req, res) => {
  if (req.method === 'POST' && /^\/__g4r2\/(canvas|three)$/.test(req.url || '')) {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', chunk => { body += chunk; if (body.length > 2_000_000) req.destroy(); });
    req.on('end', () => {
      try {
        const parsed = JSON.parse(body);
        fs.mkdirSync(EVIDENCE, { recursive: true });
        const name = req.url.endsWith('/canvas') ? 'canvas-r2.json' : 'three-r2.json';
        fs.writeFileSync(path.join(EVIDENCE, name), `${JSON.stringify(parsed, null, 2)}\n`);
        res.writeHead(201, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
        res.end(JSON.stringify({ saved: name }));
      } catch (error) { res.writeHead(400); res.end(String(error)); }
    });
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); res.end(); return; }
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname); }
  catch { res.writeHead(400); res.end(); return; }
  let file;
  if (pathname === '/__g4r2-harness.html') file = HARNESS;
  else {
    if (pathname === '/') pathname = '/inkbox.html';
    file = path.resolve(PACKAGE_ROOT, `.${pathname}`);
    if (file !== PACKAGE_ROOT && !file.startsWith(`${PACKAGE_ROOT}${path.sep}`)) { res.writeHead(403); res.end(); return; }
  }
  let stat;
  try { stat = fs.statSync(file); } catch { res.writeHead(404); res.end('Not found'); return; }
  if (!stat.isFile()) { res.writeHead(404); res.end('Not found'); return; }
  res.writeHead(200, { 'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'content-length': stat.size, 'cache-control': 'no-store' });
  if (req.method === 'HEAD') { res.end(); return; }
  fs.createReadStream(file).pipe(res);
});

server.listen(0, '127.0.0.1', () => {
  const { port } = server.address();
  console.log(`R2_HARNESS_URL=http://127.0.0.1:${port}/__g4r2-harness.html`);
  console.log(`R2_PRODUCT_URL=http://127.0.0.1:${port}/inkbox.html`);
});
const close = () => server.close(() => process.exit(0));
process.on('SIGINT', close);
process.on('SIGTERM', close);
