import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const source = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'cdp.mjs'), 'utf8')
  .replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '');
const token = '12345678-1234-1234-1234-123456789abc';
const browserPath = `/devtools/browser/${token}`;
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-'));
const file = path.join(profile, 'DevToolsActivePort');
const fakeProcess = { platform: 'linux', env: process.env, exitCode: undefined };
let child;
let requests = [];
let browserWs = `ws://127.0.0.1:43210${browserPath}`;
const context = {
  fs: { ...fs, mkdtempSync: () => profile }, path, os, process: fakeProcess, URL, AbortSignal, Date, Buffer,
  setTimeout, clearTimeout,
  console: { log() {}, error() {} },
  spawn(_exe, args) {
    assert(args.includes('--remote-debugging-port=0'));
    assert(args.includes(`--user-data-dir=${profile}`));
    child = { pid: 12345, exitCode: null, signalCode: null, spawnfile: '/fake/edge',
      on() {}, kill() { this.exitCode = 0; } };
    return child;
  },
  async fetch(url, options) {
    requests.push([url, options?.method]);
    if (url.endsWith('/json/version')) return { ok: true, json: async () => ({ Browser: 'Mock Edge', webSocketDebuggerUrl: browserWs }) };
    return { ok: true, json: async () => ({ webSocketDebuggerUrl: 'ws://127.0.0.1:43210/devtools/page/abc' }) };
  },
  WebSocket: class {
    readyState = 1;
    addEventListener(event, handler) { if (event === 'open') queueMicrotask(handler); }
    send(message) { const request = JSON.parse(message); queueMicrotask(() => this.onMessage?.({ data: JSON.stringify({ id: request.id, result: {} }) })); }
    close() {}
  },
};
// Cdp uses message events; keep the mock as small as the protocol needs.
context.WebSocket.prototype.addEventListener = function (event, handler) {
  if (event === 'open') queueMicrotask(handler);
  if (event === 'message') this.onMessage = handler;
};
vm.runInNewContext(source + '\nglobalThis.test = { readOwnedEndpoint, waitForOwnedEndpoint, verifyOwnedBrowserEndpoint, launch };', context);
const api = context.test;
try {
  assert.equal(api.readOwnedEndpoint(profile), null, 'missing file is pending');
  fs.writeFileSync(file, '43210\n');
  assert.equal(api.readOwnedEndpoint(profile), null, 'first-line partial write is pending');
  fs.writeFileSync(file, '43210\n/devtools/browser/12345678-1234');
  assert.equal(api.readOwnedEndpoint(profile), null, 'partial token is pending');
  fs.writeFileSync(file, `70000\n${browserPath}`);
  assert.throws(() => api.readOwnedEndpoint(profile), /Invalid owned/);
  fs.writeFileSync(file, `43210\n/devtools/browser/not-a-token`);
  assert.throws(() => api.readOwnedEndpoint(profile), /Invalid owned/);
  fs.writeFileSync(file, `43210\n${browserPath}`);
  assert.equal(api.readOwnedEndpoint(profile).port, 43210);
  assert.throws(() => api.verifyOwnedBrowserEndpoint(`ws://127.0.0.1:9300${browserPath}`, api.readOwnedEndpoint(profile)), /does not match/);
  assert.throws(() => api.verifyOwnedBrowserEndpoint('ws://127.0.0.1:43210/devtools/browser/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', api.readOwnedEndpoint(profile)), /does not match/);

  // An unrelated listener at the formerly random port cannot be queried.
  browserWs = `ws://127.0.0.1:9300${browserPath}`;
  await assert.rejects(api.launch({ browser: '/fake/edge', port: 9300 }), /does not match/);
  assert.deepEqual(requests.map(([url]) => url), ['http://127.0.0.1:43210/json/version']);
  assert.equal(fs.existsSync(profile), false, 'failed launch removes only its owned profile');
  fs.mkdirSync(profile);
  fs.writeFileSync(file, `43210\n${browserPath}`);
  requests = [];
  browserWs = `ws://127.0.0.1:43210${browserPath}`;
  const session = await api.launch({ browser: '/fake/edge', port: 9300 });
  assert.equal(session.meta.debugPort, 43210);
  assert.equal(requests.length, 2);
  assert.equal((await session.close()).complete, true);
  assert.equal(fs.existsSync(profile), false);
  await assert.rejects(api.waitForOwnedEndpoint(profile, { exitCode: 1, signalCode: null }, 100, { current: null }),
    /exited before/);
  await assert.rejects(api.waitForOwnedEndpoint(profile, { exitCode: null, signalCode: null }, 1, { current: null }),
    /Timed out/);
} finally {
  fs.rmSync(profile, { recursive: true, force: true });
}
console.log('PASS owned endpoint parsing, partial/invalid file, conflicting port, browser token mismatch, correct profile launch and cleanup, early exit and timeout');
