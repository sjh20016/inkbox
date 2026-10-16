// Owned, headed CDP session. Reuses the repository Session and cleanup contract.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { findBrowser, Session, sleep } from './cdp.mjs';

export class Connection {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.pending = new Map(); this.events = [];
    ws.addEventListener('message', event => {
      const message = JSON.parse(event.data);
      const item = this.pending.get(message.id);
      if (!item) { this.events.push(message); return; }
      clearTimeout(item.timer); this.pending.delete(message.id);
      message.error ? item.reject(new Error(JSON.stringify(message.error))) : item.resolve(message.result);
    });
    ws.addEventListener('close', () => this.rejectPending(new Error('CDP closed')));
    ws.addEventListener('error', () => this.rejectPending(new Error('CDP connection error')));
  }
  send(method, params = {}, timeoutMs = 30000) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  rejectPending(error) {
    for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(error); }
    this.pending.clear();
  }
}

async function connect(url) {
  const ws = new WebSocket(url);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  return new Connection(ws);
}

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

export async function launchLabBrowser({ executable = findBrowser(), headless = false } = {}) {
  if (!executable) throw new Error('BROWSER_MISSING: installed Edge/Chrome unavailable');
  const debugPort = await freePort();
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkbox-g4-p0a-'));
  const args = [
    ...(headless ? ['--headless=new'] : []), '--no-first-run', '--no-default-browser-check',
    '--disable-extensions', '--disable-background-networking',
    `--remote-debugging-address=127.0.0.1`, `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${userDataDir}`, '--window-size=1366,768', 'about:blank',
  ];
  const child = spawn(executable, args, { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
  let stderr = '', spawnError = null;
  child.stderr.on('data', data => { stderr = (stderr + data).slice(-24000); });
  child.once('error', error => { spawnError = error; });
  let browserConnection, pageConnection;
  try {
    const base = `http://127.0.0.1:${debugPort}`;
    let version;
    for (let i = 0; i < 75; i++) {
      if (spawnError) throw spawnError;
      try { const r = await fetch(`${base}/json/version`); if (r.ok) { version = await r.json(); break; } } catch {}
      await sleep(200);
    }
    if (!version) throw new Error('BROWSER_START_BLOCKED: CDP port did not become ready');
    browserConnection = await connect(version.webSocketDebuggerUrl);
    const target = await (await fetch(`${base}/json/new?about:blank`, { method: 'PUT' })).json();
    if (!target.webSocketDebuggerUrl) throw new Error('CDP target creation failed');
    pageConnection = await connect(target.webSocketDebuggerUrl);
    const session = new Session(pageConnection, child, userDataDir, {
      browser: version.Browser, debugPort, width: 1366, height: 768, headless,
    });
    await pageConnection.send('Page.enable');
    await pageConnection.send('Runtime.enable');
    await pageConnection.send('Log.enable');
    await pageConnection.send('Network.enable');
    await pageConnection.send('Emulation.setDeviceMetricsOverride', {
      width: 1366, height: 768, deviceScaleFactor: 1, mobile: false,
    });
    let systemInfo, systemInfoError = null;
    try { systemInfo = await browserConnection.send('SystemInfo.getInfo'); }
    catch (error) { systemInfoError = error.message; }
    const browserVersion = await browserConnection.send('Browser.getVersion');
    const environment = {
      os: { platform: os.platform(), release: os.release(), arch: os.arch() },
      cpu: { model: os.cpus()[0]?.model ?? null, logicalCount: os.cpus().length },
      browser: browserVersion, headless, gpuDisabledByHarness: false,
      viewport: { width: 1366, height: 768, dpr: 1 },
      gpu: systemInfo?.gpu ?? null, systemInfoError,
      refreshRateHz: null, refreshRateReason: 'No reliable display-mode API used; RAF cadence is not a refresh-rate measurement.',
    };
    browserConnection.ws.close();
    return { session, environment, stderr: () => stderr };
  } catch (error) {
    if (browserConnection?.ws.readyState === 1) {
      try { await browserConnection.send('Browser.close', {}, 2000); } catch {}
      browserConnection.ws.close();
    }
    const session = new Session(pageConnection ?? { ws: { readyState: 3, close() {} }, rejectPending() {} }, child, userDataDir, {});
    await session.close();
    error.browserStderr = stderr.replaceAll(userDataDir, '<temporary-profile>');
    throw error;
  }
}

export function classifyHardware(environment, webgl) {
  const renderer = webgl?.renderer ?? '';
  const featureStatus = environment.gpu?.featureStatus ?? {};
  const gpuFeature = featureStatus.webgl2 ?? featureStatus.webgl;
  const software = /swiftshader|llvmpipe|softpipe|software|basic render|warp/i.test(renderer);
  const hardware = !!webgl?.available && !software && /enabled/.test(gpuFeature ?? '') &&
    !/software|disabled|unavailable/i.test(gpuFeature ?? '') && /ANGLE|NVIDIA|AMD|Intel|Apple/i.test(renderer);
  return {
    pass: hardware, software, webglFeatureStatus: gpuFeature ?? null,
    criterion: 'Product WebGL2 unmasked renderer names hardware; SystemInfo WebGL feature enabled without software/disabled/unavailable; GPU not disabled by harness.',
    reason: hardware ? null : 'GPU acceleration cannot be confirmed from product WebGL and browser SystemInfo.',
  };
}
