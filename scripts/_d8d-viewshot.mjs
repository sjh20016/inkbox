// D8-D 视觉探针（一次性 · RESEARCH）——用无头浏览器确认视界窗真的画出了「另一界的内容」。
//
// 不进 build 清单、不进测试链（`inkbox-package.mjs` 的 FILES 是显式清单，本文件不在其中）。
// 用法：先起服务器（默认 4180），再
//   node scripts/_d8d-viewshot.mjs
//
// ⚠️ 依赖同目录的 `scripts/cdp.mjs`——那是零依赖 CDP 胶水层（`WebSocket` + `fetch`，
//    复用本机已装的 Edge/Chrome），来自技能 `cdp-headless-browser-e2e`，按该技能的
//    指引**内联**到本仓，好让本探针可复跑（不然它得 import 一个机器相关的绝对路径）。
//
// 它做四件事：
//   ① 把世界推一段，让幽冥有鬼 / 有物品；
//   ② 锚在**冥河水面**（`nether.water > 0`，鬼与物品都生在河边窄带）把镜头对上去；
//   ③ 开一扇视界窗，**分别**拍上界 / 幽冥两张（同坐标、同选区）——两张不同 = 窗真的在看另一界；
//   ④ 打印控制台报错。
// ⚠️ 为「保证窗里至少有东西可看」，若幽冥一件法宝都没有，探针会**临时塞几件**到
//    `nether.artifacts`（纯探针，不进游戏、不落盘）。这是**验渲染器**，不是验生态。

import fs from 'node:fs';
import path from 'node:path';
import { launch, sleep } from './cdp.mjs';

const URL = process.env.INKBOX_URL || 'http://127.0.0.1:4180/inkbox.html';
const OUT_NETHER = path.resolve('reports/inkbox/d8d-nether-view.png');
const OUT_UPPER = path.resolve('reports/inkbox/d8d-upper-view.png');
const OUT_CLOSE = path.resolve('reports/inkbox/d8d-nether-close.png');
const OUT_CROP = path.resolve('reports/inkbox/d8d-nether-window.png');

const session = await launch({ url: URL, width: 1500, height: 940 });
try {
  await session.waitFor('return !!window.inkbox && !!window.inkbox.world', { timeoutMs: 40000 });

  const adv = await session.js(`
    const k = window.inkbox;
    k.advanceDays(2400);
    const n = k.nether;
    return { day: k.world.day, ent: n.entities.length, art: n.artifacts.length, rifts: k.world.rifts.length };
  `);
  console.log('advanced:', JSON.stringify(adv));

  // 锚点：中段（h*0.3~h*0.7）里阴气最浓的一格 —— 即冥河岸边
  const setup = await session.js(`
    const k = window.inkbox;
    const n = k.nether;
    let best = -1; let bx = Math.floor(n.w / 2); let by = Math.floor(n.h / 2);
    const y0 = Math.floor(n.h * 0.3); const y1 = Math.floor(n.h * 0.7);
    for (let r = y0; r <= y1; r += 1) {
      for (let x = 2; x < n.w - 2; x += 1) {
        const i = r * n.w + x;
        if (n.veg[i] > best) { best = n.veg[i]; bx = x; by = r; }
      }
    }
    // 把几件法宝摆在锚点周围（±5 格内）——近景才看得见记号
    const placed = [];
    for (let j = 0; j < 8; j += 1) {
      const dx = (j % 4) * 3 - 4;
      const dy = Math.floor(j / 4) * 6 - 3;
      const a = { id: 9000 + j, tier: 1 + (j % 5), x: bx + dx + 0.5, y: by + dy + 0.5 };
      n.artifacts.push(a);
      placed.push([a.x, a.y, a.tier]);
    }
    k.camera.focusOn(bx, by, { zoom: 2.0, duration: 0 });
    const half = 34;
    k.selection = {
      path: [[bx - half, by - half], [bx + half, by - half], [bx + half, by + half], [bx - half, by + half]],
      x0: bx - half, y0: by - half, x1: bx + half, y1: by + half, area: (half * 2) ** 2,
    };
    return { anchor: [bx, by], veg: Number(best.toFixed(3)), placed };
  `);
  console.log('setup:', JSON.stringify(setup));

  // ① 幽冥窗（远景）
  await session.js(`window.inkbox.toolId = 'viewNether'; return window.inkbox.viewPlane().plane;`);
  await sleep(900);
  await session.screenshot(OUT_NETHER);
  console.log('shot nether (far) ->', OUT_NETHER);

  // ② 上界窗（同坐标同选区，用于对照）
  await session.js(`window.inkbox.toolId = 'viewUpper'; return window.inkbox.viewPlane().plane;`);
  await sleep(900);
  await session.screenshot(OUT_UPPER);
  console.log('shot upper  (far) ->', OUT_UPPER);

  // ③ 幽冥窗（近景：放大到 9×，法宝记号 / 阴气雾墨应当清晰可辨）
  await session.js(`
    const k = window.inkbox;
    k.toolId = 'viewNether';
    const half = 7;
    const cx = k.selection.x0 + 34; const cy = k.selection.y0 + 34;
    k.selection = {
      path: [[cx - half, cy - half], [cx + half, cy - half], [cx + half, cy + half], [cx - half, cy + half]],
      x0: cx - half, y0: cy - half, x1: cx + half, y1: cy + half, area: (half * 2) ** 2,
    };
    k.camera.focusOn(cx, cy, { zoom: 9, duration: 0 });
    return [cx, cy, k.camera.zoom];
  `);
  await sleep(900);
  await session.screenshot(OUT_CLOSE);
  console.log('shot nether (close) ->', OUT_CLOSE);

  // ④ 直接从画布裁出「窗」那一块（放大后记号才看得清）——全页截图会把它缩没
  const dataUrl = await session.js(`
    const k = window.inkbox;
    const cam = k.camera;
    const s = k.selection;
    const cv = k.canvas;
    if (!cv) return 'NO_CANVAS';
    const dpr = k.dpr || 1;
    const sx = cam.toScreenX(s.x0) * dpr;
    const sy = cam.toScreenY(s.y0) * dpr;
    const sw = (cam.toScreenX(s.x1 + 1) - cam.toScreenX(s.x0)) * dpr;
    const sh = (cam.toScreenY(s.y1 + 1) - cam.toScreenY(s.y0)) * dpr;
    const out = document.createElement('canvas');
    const SCALE = 5;
    out.width = Math.max(1, Math.round(sw)) * SCALE;
    out.height = Math.max(1, Math.round(sh)) * SCALE;
    const g = out.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.drawImage(cv, sx, sy, sw, sh, 0, 0, out.width, out.height);
    return out.toDataURL('image/png');
  `);
  if (typeof dataUrl === 'string' && dataUrl.startsWith('data:image/png;base64,')) {
    const buf = Buffer.from(dataUrl.slice('data:image/png;base64,'.length), 'base64');
    fs.writeFileSync(OUT_CROP, buf);
    console.log('crop ->', OUT_CROP, `${buf.length} bytes`);
  } else {
    console.log('crop failed:', dataUrl);
  }

  const errs = session.errors();
  console.log('console errors:', errs.length ? JSON.stringify(errs, null, 2) : 'none');
} finally {
  await session.close();
}
