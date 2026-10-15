#!/usr/bin/env node
// 水墨沙盒 · 独立静态服务器
//
// 刻意不依赖旧《坐天观井》的 preflight：水墨沙盒是一个独立入口，
// 不应该因为旧版本的构建哈希而启动不了。

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// 同时支持 `--port=4180` 与 `--port 4180` 两种写法。
// 早先只认等号形式，`--port 4180` 会把端口解析成 'true' → Number('true') → NaN，
// 服务直接以 ERR_SOCKET_BAD_PORT 崩掉。
function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const body = token.slice(2);
    const eq = body.indexOf('=');
    if (eq >= 0) {
      out[body.slice(0, eq)] = body.slice(eq + 1);
      continue;
    }
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith('--')) {
      out[body] = next;
      i += 1;
    } else {
      out[body] = 'true';
    }
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const rawPort = Number(args.port ?? process.env.PORT ?? 4180);
const port = Number.isInteger(rawPort) && rawPort >= 0 && rawPort < 65536 ? rawPort : 4180;
const entry = args.entry || 'inkbox.html';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
};

const server = http.createServer((request, response) => {
  const urlPath = decodeURIComponent(String(request.url || '/').split('?')[0]);
  const relative = urlPath === '/' ? entry : urlPath.replace(/^\/+/, '');
  const target = path.resolve(ROOT, relative);
  if (!target.startsWith(ROOT + path.sep)) {
    response.writeHead(403).end('Forbidden');
    return;
  }
  fs.readFile(target, (error, content) => {
    if (error) {
      response.writeHead(error.code === 'ENOENT' ? 404 : 500)
        .end(error.code === 'ENOENT' ? `Not found: ${relative}` : 'Server error');
      return;
    }
    response.writeHead(200, {
      'Content-Type': TYPES[path.extname(target).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    response.end(content);
  });
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`端口 ${port} 已被占用——换一个：npm run inkbox:dev -- --port 4181`);
  } else {
    console.error(error.message);
  }
  process.exit(1);
});

server.listen(port, '127.0.0.1', () => {
  console.log(`水墨沙盒：http://127.0.0.1:${port}/${entry}`);
});
