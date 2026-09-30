// D8-E 视觉探针（一次性 · RESEARCH）——用无头浏览器确认「跨界动作在两边发生」。
//
// 不进 build 清单、不进测试链（`inkbox-package.mjs` 的 FILES 是显式清单，本文件不在其中）。
// 用法：先起服务器（默认 4180），再
//   node scripts/_d8e-crossshot.mjs
//
// ⚠️ 依赖同目录的 `scripts/cdp.mjs`（零依赖 CDP 胶水层，来自技能
//    `cdp-headless-browser-e2e`，按该技能指引内联到本仓）。
//
// 它验证的是 D8-E 的**头条承诺**：
//   「凡间一个人从裂缝边消失，而幽冥窗口同坐标处出现一团鬼影。」
// 做法：
//   ① 推一段世界，锚在一个可站格，开一扇**幽冥**视界窗（选区以锚点为中心）；
//   ② 在页面里**动态 `import('/src/inkbox/sim/presentation.js')`** —— 与 app 自身
//      `main.js` 的 `./sim/presentation.js` 解析到**同一个 URL**，于是是**同一个模块
//      实例**（同一份 `runtimeEvents.js` WeakMap 队列），发的事件会被 `PresentationStage`
//      正常收走。**不需要给 main.js 加任何测试钩子。**
//   ③ 每 220ms 发一次 `person: mortal → nether`（`sides:'both'`）：
//        · 离开端 → 凡间主画布、锚点**左侧**（窗外的空地）——「墨影向裂隙收缩」
//        · 到达端 → 幽冥位面、锚点处（**窗内**）——「墨点向外散开」
//      `riftcross` 的 TTL 只有 0.7 秒，所以要反复发，截图那一刻才一定有活的 FX。
//   ④ 截图 + 裁窗（放大 4×）+ 打印控制台报错。

import fs from 'node:fs';
import path from 'node:path';
import { launch, sleep } from './cdp.mjs';

const URL = process.env.INKBOX_URL || 'http://127.0.0.1:4180/inkbox.html';
const OUT_FULL = path.resolve('reports/inkbox/d8e-cross-full.png');
const OUT_CROP = path.resolve('reports/inkbox/d8e-cross-window.png');

const session = await launch({ url: URL, width: 1500, height: 940 });
try {
  await session.waitFor('return !!window.inkbox && !!window.inkbox.world', { timeoutMs: 40000 });

  const setup = await session.js(`
    const k = window.inkbox;
    k.advanceDays(1200);
    const w = k.world;
    let bx = Math.floor(w.w / 2); let by = Math.floor(w.h / 2);
    outer: for (let r = Math.floor(w.h * 0.3); r < Math.floor(w.h * 0.7); r += 1) {
      for (let x = 5; x < w.w - 5; x += 1) {
        if (w.isWalkable(r * w.w + x)) { bx = x; by = r; break outer; }
      }
    }
    k.camera.focusOn(bx, by, { zoom: 2.4, duration: 0 });
    const half = 24;
    k.selection = {
      path: [[bx - half, by - half], [bx + half, by - half], [bx + half, by + half], [bx - half, by + half]],
      x0: bx - half, y0: by - half, x1: bx + half, y1: by + half, area: (half * 2) ** 2,
    };
    k.toolId = 'viewNether';
    return { anchor: [bx, by], plane: k.viewPlane().plane, day: w.day };
  `);
  console.log('setup:', JSON.stringify(setup));

  const bx = setup.anchor[0]; const by = setup.anchor[1];

  // 装一个反复发射器：离开端在窗外（锚点左 40 格），到达端在窗内（锚点处）。
  const installed = await session.js(`
    const k = window.inkbox;
    const bx = ${bx}; const by = ${by};
    window.__d8eN = 0;
    window.__d8e = setInterval(() => {
      import('/src/inkbox/sim/presentation.js').then((m) => {
        window.__d8eN += m.emitRiftCross(k.world, {
          kind: 'person', fromPlane: 'mortal', toPlane: 'nether',
          fromX: bx - 40, fromY: by, toX: bx, toY: by,
          fromKey: 'mortal:9001', subjectId: 9001,
        }).length;
      }).catch(() => {});
    }, 220);
    return 'installed';
  `);
  console.log('emitter:', installed);

  await sleep(1400);
  await session.screenshot(OUT_FULL);
  console.log('shot full ->', OUT_FULL);

  const emitted = await session.js('return window.__d8eN;');
  console.log('events emitted so far:', emitted);

  // 从画布裁出「窗」那一块（放大 4×）——全页截图会把 FX 缩没。
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
    const SCALE = 4;
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

  await session.js('clearInterval(window.__d8e); return true;');
  const errs = session.errors();
  console.log('console errors:', errs.length ? JSON.stringify(errs, null, 2) : 'none');
} finally {
  await session.close();
}
