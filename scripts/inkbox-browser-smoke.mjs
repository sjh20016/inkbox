#!/usr/bin/env node
// CI glue only: keep the HTTP server alive while browser suites run in sequence.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launch, sleep, findBrowser } from './cdp.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'reports', 'ci');
const port = Number(process.env.INKBOX_BROWSER_PORT || 4180);
const url = `http://127.0.0.1:${port}/inkbox.html`;
fs.mkdirSync(output, { recursive: true });
const report = { generatedAt: new Date().toISOString(), sourceCommit: process.env.GITHUB_SHA || null, runId: process.env.GITHUB_RUN_ID || null, node: process.version, platform: process.platform, url, preflight: [], suites: [] };
const stdout = fs.openSync(path.join(output, 'server-stdout.log'), 'w');
const stderr = fs.openSync(path.join(output, 'server-stderr.log'), 'w');
const server = spawn(process.execPath, ['scripts/inkbox-server.mjs', `--port=${port}`], {
  cwd: root, stdio: ['ignore', stdout, stderr], windowsHide: true,
});
fs.closeSync(stdout); fs.closeSync(stderr);
let serverError;
server.on('error', error => { serverError = error; });

async function runSuite(name, script, args, env) {
  console.log(`Browser Smoke: ${name}`);
  const log = fs.createWriteStream(path.join(output, `${name}-browser.log`));
  const child = spawn(process.execPath, [script, ...args], { cwd: root, env: { ...process.env, ...env }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  for (const stream of [child.stdout, child.stderr]) stream.on('data', data => { log.write(data); process.stdout.write(data); });
  const start = performance.now();
  const exitCode = await new Promise((resolve, reject) => { child.on('error', reject); child.on('close', code => resolve(code)); });
  await new Promise(resolve => log.end(resolve));
  report.suites.push({ name, script, args, exitCode, durationMs: performance.now() - start });
  return exitCode;
}

async function diagnose(name) {
  const diagnostic = { serverExitCode: server.exitCode, url };
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    diagnostic.httpStatus = response.status;
    const browser = findBrowser(['C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe', process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Microsoft', 'Edge', 'Application', 'msedge.exe')].filter(Boolean));
    if (!browser) throw new Error('Startup diagnostics require Microsoft Edge');
    const session = await launch({ url, browser, gpu: true });
    try {
      await sleep(1500);
      diagnostic.page = await session.js(`return {url:location.href,title:document.title,readyState:document.readyState,hasInkbox:!!window.inkbox,body:document.body?.innerText.slice(0,1800),resources:performance.getEntriesByType('resource').map(r=>({name:r.name,duration:r.duration}))};`);
      diagnostic.errors = session.errors();
      diagnostic.navigation = session.cdp.events.filter(event => /frameNavigated|frameStoppedLoading|exceptionThrown/.test(event.method));
      await session.screenshot(path.join(output, `${name}-startup.png`));
    } finally { await session.close(); }
  } catch (error) { diagnostic.error = String(error); }
  fs.writeFileSync(path.join(output, `${name}-startup.json`), JSON.stringify(diagnostic, null, 2) + '\n');
}

try {
  let ready = false;
  for (let i = 0; i < 60; i++) {
    if (serverError || server.exitCode !== null) throw serverError || new Error(`HTTP server exited ${server.exitCode}`);
    try { ready = (await fetch(url, { signal: AbortSignal.timeout(1500) })).status === 200; } catch { /* still starting */ }
    if (ready) break;
    await sleep(500);
  }
  if (!ready) throw new Error('Browser Smoke HTTP server did not become ready');
  for (const resource of ['/inkbox.html', '/src/inkbox/main.js', '/vendor/three/build/three.module.js']) {
    const response = await fetch(new URL(resource, url), { signal: AbortSignal.timeout(5000) });
    report.preflight.push({ resource, status: response.status, contentType: response.headers.get('content-type') });
    if (!response.ok) throw new Error(`HTTP preflight ${resource}: ${response.status}`);
  }
  const env = { INKBOX_URL: url, INKBOX_REPORT_DIR: path.join(output, 'render3d-m2a') };
  if (await runSuite('canvas', 'scripts/inkbox-playtest.mjs', ['--shots=reports/ci/canvas', `--url=${url}`], env) !== 0) await diagnose('canvas');
  if (await runSuite('m2a', 'scripts/inkbox-render3d-m2a-browser.mjs', [], env) !== 0) await diagnose('m2a');
  for (const name of ['m2b', 'm2c', 'm2c2a']) {
    const suiteEnv = { ...env, INKBOX_REPORT_DIR: path.join(output, `render3d-${name}`),
      INKBOX_RELEASE_DIR: path.join(output, `render3d-${name}`, 'representative') };
    if (await runSuite(name, `scripts/inkbox-render3d-${name}-browser.mjs`, [], suiteEnv) !== 0) await diagnose(name);
  }
  report.status = report.suites.length === 5 && report.suites.every(suite => suite.exitCode === 0) ? 'passed' : 'failed';
} catch (error) {
  report.status = 'failed'; report.error = String(error); console.error(error);
} finally {
  server.kill();
  fs.writeFileSync(path.join(output, 'browser-results.json'), JSON.stringify(report, null, 2) + '\n');
}
if (report.status !== 'passed') process.exitCode = 1;
