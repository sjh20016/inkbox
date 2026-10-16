#!/usr/bin/env node
// Required minimum adapter-response check. Does not start a browser or measure performance.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createLabServer } from './inkbox-g4-p0a-server.mjs';
import { sha256 } from './inkbox-g4-p0a-stats.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const server = await createLabServer({ root });
const checks = [];
try {
  for (const route of ['/src/inkbox/main.js', '/__g4__/hydrology-entry.mjs', '/__g4__/variants-r2.mjs']) {
    const response = await fetch(server.origin + route), source = await response.text();
    assert.equal(response.status, 200);
    assert(!/(?:from\s*|import\s*)['"]node:/.test(source));
    execFileSync(process.execPath, ['--input-type=module', '--check'], { input: source, windowsHide: true });
    checks.push({ route, status: 'PASS', sha256: sha256(source), nodeImport: false });
  }
  const rewritten = await (await fetch(server.origin + '/src/inkbox/main.js')).text();
  server.setNative(true);
  const native = Buffer.from(await (await fetch(server.origin + '/src/inkbox/main.js')).arrayBuffer());
  assert(native.equals(fs.readFileSync(path.join(root, 'src/inkbox/main.js'))));
  const { before, after } = server.provenance.mainImportDiff;
  assert.equal(rewritten.replace(after, before), native.toString('utf8'));
  assert.equal(server.provenance.variantsBodySourceSHA256, server.provenance.variantsBodyBrowserSHA256);
  assert.equal((await fetch(server.origin + '/__g4__/unknown.mjs')).status, 404);
  assert.equal((await fetch(server.origin + '/src/inkbox/main.js', { method: 'POST' })).status, 405);
  console.log(JSON.stringify({ status: 'PASS', scope: 'localhost responses + ESM syntax + exact import/body/native checks only',
    liveBrowserS0: 'NOT_ASSERTED', checks, mainImportDiff: server.provenance.mainImportDiff }));
} finally { await server.close(); }
