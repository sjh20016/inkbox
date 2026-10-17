// A1 QA · CDP 链路与真实 GPU 冒烟
//
// 目的（阶段 A 第 1 步）：
// 1. 用仓库自带的 scripts/cdp.mjs launch() 启动本机 Edge（不装 Playwright/Puppeteer）。
// 2. 打开 cultivator-lab.html，等 window.cultivatorLab.ready。
// 3. 记录 browser.meta 与 WebGL 真实渲染器（UNMASKED_RENDERER_WEBGL），
//    明确区分硬件 GPU / 软件光栅（SwiftShader / Basic Render Driver 不许冒充硬件验收）。
// 4. 截图存 reports/a1/baseline/，输出 JSON 证据。
//
// 运行：node scripts/inkbox-a1-smoke.mjs
// 约定：QA 独占端口 4188（可用 A1_QA_PORT 覆盖），跑完关闭服务器与浏览器。
//
// ⚠️ 端口避坑：WHATWG fetch / Chromium 的「bad port」黑名单包含 4190、4191、4192，
// 即使本机服务监听成功，Node fetch 会报 "bad port"，Edge 导航会 ERR_UNSAFE_PORT。
// 因此 A1 QA 使用 4188/4189（4186 属 characters:browser，4217 属 g2:browser）。
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launch, findEdge, sleep } from './cdp.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.A1_QA_PORT || 4188);
const BASE = process.env.A1_QA_URL || `http://127.0.0.1:${PORT}`;
const OUT = path.resolve(process.env.INKBOX_REPORT_DIR || path.join(ROOT, 'reports/a1/baseline'));
const report = {
  startedAt: new Date().toISOString(),
  purpose: 'A1 QA phase-A: CDP link + real GPU smoke on cultivator-lab.html',
  base: BASE,
  browser: null,
  gpu: null,
  lab: null,
  screenshots: [],
  errors: [],
  pass: false,
};
let server;
let browser;

function startServer() {
  if (process.env.A1_QA_URL) return Promise.resolve(null);
  return new Promise(async (resolve, reject) => {
    server = spawn(process.execPath, ['scripts/inkbox-server.mjs', '--port', String(PORT)], {
      cwd: ROOT, stdio: 'ignore', windowsHide: true,
    });
    for (let i = 0; i < 100; i += 1) {
      if (server.exitCode !== null) throw reject(new Error(`inkbox-server exited: ${server.exitCode}`));
      try {
        const r = await fetch(`${BASE}/cultivator-lab.html`);
        if (r.ok) return resolve(server);
      } catch { /* booting */ }
      await sleep(150);
    }
    reject(new Error('inkbox-server did not become ready'));
  });
}

const page = (expr, timeoutMs = 45000) => browser.js(`return (async()=>{${expr}})()`, { timeoutMs });

try {
  await startServer();
  const executable = findEdge();
  if (!executable) throw new Error('未找到本机 Edge');
  browser = await launch({
    url: `${BASE}/cultivator-lab.html`,
    browser: executable,
    width: 1440,
    height: 900,
    gpu: true, // 硬件验收：不许用 --disable-gpu 的软件光栅冒充
  });
  report.browser = { ...browser.meta, executable };
  console.log('browser.meta =', JSON.stringify(report.browser));

  const ready = await browser.waitFor('return !!window.cultivatorLab?.ready', { timeoutMs: 30000 });
  if (!ready) throw new Error(`cultivatorLab 未就绪；errors=${JSON.stringify(browser.errors())}`);
  await page('for(let i=0;i<3;i++)await new Promise(requestAnimationFrame);return true');

  report.gpu = await page(`
    const lab = window.cultivatorLab;
    const gl = lab.renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const info = {
      renderer: gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER),
      vendor: gl.getParameter(ext ? ext.UNMASKED_VENDOR_WEBGL : gl.VENDOR),
      version: gl.getParameter(gl.VERSION),
      shadingLanguage: gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
      webgl2: typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext,
      canvas: { width: lab.renderer.domElement.width, height: lab.renderer.domElement.height },
      drawingBuffer: { width: gl.drawingBufferWidth, height: gl.drawingBufferHeight },
      maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
      gpuVendorAdapter: (navigator.gpu ? 'navigator.gpu present' : 'navigator.gpu absent'),
    };
    info.softwareRasterizer = /basic render|swiftshader|llvmpipe|software|warp|mesa offscreen/i.test(info.renderer);
    return info;
  `);
  console.log('gpu =', JSON.stringify(report.gpu, null, 2));
  if (report.gpu.softwareRasterizer) {
    console.error('WARNING: WebGL 渲染器是软件光栅，不能作为硬件验收证据');
  }

  report.lab = await page(`
    const l = window.cultivatorLab;
    return {
      roles: Object.keys(l.library.roles),
      modules: l.library.modules.size,
      animations: l.library.animations.map(a => a.name),
      resources: performance.getEntriesByType('resource').filter(r => /cultivator.*\\.(glb|json)$/.test(r.name)).map(r => ({ name: r.name, transferSize: r.transferSize })),
      frame: l.metrics?.() || null,
    };
  `);
  console.log('lab =', JSON.stringify(report.lab, null, 2));

  const screenshot = await browser.screenshot(path.join(OUT, 'smoke-cultivator-lab.png'), { timeoutMs: 30000 });
  report.screenshots.push(screenshot);
  report.errors = browser.errors();
  if (report.errors.length) console.error('browser errors:', JSON.stringify(report.errors));
  report.pass = report.errors.length === 0;
  report.finishedAt = new Date().toISOString();
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'cdp-smoke.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(`CDP smoke ${report.pass ? 'PASS' : 'FAIL'} · screenshot: ${screenshot}`);
  if (!report.pass) process.exitCode = 1;
} catch (error) {
  report.errors.push(String(error.stack || error));
  report.finishedAt = new Date().toISOString();
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'cdp-smoke.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.error(error.stack || error);
  process.exitCode = 1;
} finally {
  try { await browser?.close(); } catch (error) { console.error('browser close failed:', error.message); }
  if (server) { server.kill(); await sleep(300); }
}
