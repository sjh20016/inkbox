// D8-F 视觉 / 交互探针（一次性 · RESEARCH）——用无头浏览器确认「窗内点得开」。
//
// 不进 build 清单、不进测试链（`inkbox-package.mjs` 的 FILES 是显式清单，本文件不在其中）。
// 用法：先起服务器（默认 4180），再
//   node scripts/_d8f-inspectshot.mjs
//
// ⚠️ 依赖同目录的 `scripts/cdp.mjs`（零依赖 CDP 胶水层）。
//
// 它验证的是 D8-F 的**核心交互**（全部走**真实指针事件**，不是直接调方法）：
//   「划完以后 → 点击窗内实体查看」，而且**不切换工具**（切工具会关掉 selection）。
//   ① 推一段世界，锚到上界一个有人的格，开一扇**上界**视界窗；
//   ② 窗内**单击**那个人 → 弹检视卡且含其姓名 / 境界 / 来路；
//   ③ 窗内**空白处**单击 → 弹「窗内无可检视之物」（不许静默），且**窗还开着**；
//   ④ 窗内**拖动** → 重画视界（selection 换新），证明两支手势分得开；
//   ⑤ 窗**外**单击 → 收起视界（保留既有出口，没被 D8-F 抢走）。
//   ⑥ 截图 + 打印控制台报错。

import fs from 'node:fs';
import path from 'node:path';
import { launch, sleep } from './cdp.mjs';

const URL = process.env.INKBOX_URL || 'http://127.0.0.1:4180/inkbox.html';
const OUT_FULL = path.resolve('reports/inkbox/d8f-inspect-full.png');

let failed = 0;
const check = (label, cond, detail = '') => {
  if (cond) console.log(`  ✓ ${label}${detail ? ` — ${detail}` : ''}`);
  else { failed += 1; console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`); }
};
// ⚠️ `session.js(expr)` 把 expr 塞进 `(() => { ... })()` —— 必须**自带 `return`**，
//    否则页面返回 undefined（IIFE 表达式的返回值不会被外层自动 return）。
const panelText = `const p = document.getElementById('inkInspect');
  return { on: !!p && p.classList.contains('on'), text: p ? p.innerText.replace(/\\n+/g, ' | ') : '' };`;

const session = await launch({ url: URL, width: 1500, height: 940 });
try {
  await session.waitFor('return !!window.inkbox && !!window.inkbox.world', { timeoutMs: 40000 });

  // ① 推进世界，锚到一个上界有人的格，开一扇上界视界窗。
  const setup = await session.js(`
    const k = window.inkbox;
    k.advanceDays(1200);
    // ⚠️ **暂停世界**：实体每 tick 都在走动，不暂停的话「先点人、再点空白」之间
    //    目标会走开——探针会莫名其妙地红（已踩）。
    k.setSpeed(0);
    const up = k.upper;
    if (!up || !up.entities || !up.entities.length) return { ok: false, why: 'upper 无实体' };
    let t = up.entities[0];
    for (const e of up.entities) if ((e.level || 0) > (t.level || 0)) t = e;
    k.camera.focusOn(t.x, t.y, { zoom: 2.6, duration: 0 });
    const half = 20;
    k.selection = {
      path: [[t.x - half, t.y - half], [t.x + half, t.y - half],
             [t.x + half, t.y + half], [t.x - half, t.y + half]],
      x0: t.x - half, y0: t.y - half, x1: t.x + half, y1: t.y + half, area: (half * 2) ** 2,
    };
    k.toolId = 'viewUpper';
    k.selectPath = null;
    k.dirty = true;
    const [sx, sy] = k.camera.tileScreen(t.x, t.y, 0);
    const r = k.canvas.getBoundingClientRect();
    // 窗内空白处：扫一个**半径 4 内没有任何上界实体**的格（窗内 ±18 格范围）。
    // ⚠️ 上界其实很挤——随手取「偏 12 格」也可能撞上另一个人（探针已踩过）。
    const cx0 = Math.round(t.x); const cy0 = Math.round(t.y);
    let ex0 = null; let ey0 = null;
    outer: for (let dy = -18; dy <= 18; dy += 1) {
      for (let dx = -18; dx <= 18; dx += 1) {
        const cx = cx0 + dx; const cy = cy0 + dy;
        let near = false;
        for (const e of up.entities) {
          if (Math.hypot(e.x - cx, e.y - cy) <= 4) { near = true; break; }
        }
        if (!near) { ex0 = cx; ey0 = cy; break outer; }
      }
    }
    if (ex0 === null) return { ok: false, why: '窗内找不到空位' };
    const [ex, ey] = k.camera.tileScreen(ex0 + 0.5, ey0 + 0.5, 0);
    // 几何自检：两个点击点都必须落在**窗口的屏幕包围盒**内——否则「窗内检视」
    // 测的其实是「窗外点一下」，整条探针就白跑了。
    const [wx0, wy0] = k.camera.tileScreen(t.x - half, t.y - half, 0);
    const [wx1, wy1] = k.camera.tileScreen(t.x + half, t.y + half, 0);
    const inside = (x, y) => x >= wx0 && x <= wx1 && y >= wy0 && y <= wy1;
    return { ok: true, target: t.name, level: t.level, tx: t.x, ty: t.y,
      screen: [Math.round(r.left + sx), Math.round(r.top + sy)],
      empty: [Math.round(r.left + ex), Math.round(r.top + ey)], emptyTile: [ex0, ey0],
      insidePerson: inside(sx, sy), insideEmpty: inside(ex, ey),
      plane: k.viewPlane().plane, day: Math.floor(k.world.day) };
  `);
  console.log('setup:', JSON.stringify(setup));
  if (!setup.ok) throw new Error('setup 失败：' + setup.why);
  await sleep(400);

  const [px, py] = setup.screen;
  const [ex, ey] = setup.empty;

  console.log('\nD8-F 窗内穿透检视（真实指针事件）');
  check('setup：上界视界窗已开（selection 非空、plane=upper）',
    setup.plane === 'upper', `target=${setup.target} lv${setup.level} day=${setup.day}`);
  check('探针几何自检：两个点击点都落在窗口的屏幕包围盒内',
    setup.insidePerson === true && setup.insideEmpty === true,
    `person=${setup.insidePerson} empty=${setup.insideEmpty}`);

  // ② 窗内单击那个人 → 检视卡。
  await session.click(px, py);
  await sleep(320);
  const onPerson = await session.js(panelText);
  check('窗内单击人物 ⇒ 弹出检视卡', onPerson.on === true);
  check('卡片含该人物的姓名 / 境界 / 来路',
    onPerson.text.includes(setup.target) && /境界/.test(onPerson.text) && /来路/.test(onPerson.text),
    onPerson.text);

  // ③ 窗内空白处单击 → 「窗内无可检视之物」，且**窗还开着**。
  await session.click(ex, ey);
  await sleep(320);
  const onEmpty = await session.js(`const p = document.getElementById('inkInspect');
    return { on: !!p && p.classList.contains('on'),
      text: p ? p.innerText.replace(/\\n+/g, ' | ') : '',
      open: !!window.inkbox.selection };`);
  check('窗内空白处单击 ⇒ 说「窗内无可检视之物」（不许静默）',
    /无可检视之物/.test(onEmpty.text), onEmpty.text);
  check('窗内空白处单击**不关窗**（selection 仍在）', onEmpty.open === true);

  // ④ 窗内拖动 → 重画视界。
  await session.mouseMove(px, py);
  await session.mouseDown(px, py);
  for (let i = 1; i <= 5; i += 1) await session.mouseMove(px + i * 18, py + i * 10);
  await session.mouseUp(px + 90, py + 50);
  await sleep(320);
  const afterDrag = await session.js(`
    const k = window.inkbox;
    return { hasSel: !!k.selection, x0: k.selection && k.selection.x0, x1: k.selection && k.selection.x1 };
  `);
  check('窗内拖动 ⇒ 重画视界（selection 换新，不是检视）',
    afterDrag.hasSel === true && afterDrag.x1 > afterDrag.x0,
    `x0=${afterDrag.x0} x1=${afterDrag.x1}`);

  // ⑤ 窗外单击 → 收起视界（既有出口没被抢走）。
  await session.js(`
    const k = window.inkbox;
    k.selection = { path: [[${setup.tx} - 20, ${setup.ty} - 20], [${setup.tx} + 20, ${setup.ty} - 20],
      [${setup.tx} + 20, ${setup.ty} + 20], [${setup.tx} - 20, ${setup.ty} + 20]],
      x0: ${setup.tx} - 20, y0: ${setup.ty} - 20, x1: ${setup.tx} + 20, y1: ${setup.ty} + 20, area: 1600 };
    k.toolId = 'viewUpper'; k.dirty = true; return true;
  `);
  await sleep(200);
  // 窗外：窗右边界之外约 60 格（zoom 2.6 ⇒ ~156px），一定在窗外。
  const outPt = await session.js(`
    const k = window.inkbox;
    const [ox, oy] = k.camera.tileScreen(${setup.tx} + 60, ${setup.ty}, 0);
    const r = k.canvas.getBoundingClientRect();
    return [Math.round(r.left + ox), Math.round(r.top + oy)];
  `);
  await session.click(outPt[0], outPt[1]);
  await sleep(320);
  const afterOutside = await session.js('return { open: !!window.inkbox.selection };');
  check('窗外单击 ⇒ 收起视界（「点一下关窗」这条出口仍在）', afterOutside.open === false);

  // ⑥ 重新点开人物卡并截图（按**名字**重新定位——即便世界在走也不会点空）。
  const reopen = await session.js(`
    const k = window.inkbox;
    const up = k.upper;
    let t = null;
    for (const e of up.entities) if (e.name === ${JSON.stringify(setup.target)}) { t = e; break; }
    if (!t) return { ok: false };
    k.camera.focusOn(t.x, t.y, { zoom: 2.6, duration: 0 });
    const half = 20;
    k.selection = {
      path: [[t.x - half, t.y - half], [t.x + half, t.y - half],
             [t.x + half, t.y + half], [t.x - half, t.y + half]],
      x0: t.x - half, y0: t.y - half, x1: t.x + half, y1: t.y + half, area: (half * 2) ** 2,
    };
    k.toolId = 'viewUpper'; k.selectPath = null; k.dirty = true;
    const [sx, sy] = k.camera.tileScreen(t.x, t.y, 0);
    const r = k.canvas.getBoundingClientRect();
    return { ok: true, screen: [Math.round(r.left + sx), Math.round(r.top + sy)] };
  `);
  if (reopen.ok) {
    await sleep(220);
    await session.click(reopen.screen[0], reopen.screen[1]);
    await sleep(400);
  }
  await session.screenshot(OUT_FULL);
  const finalCard = await session.js(panelText);
  check('截图前人物卡确实开着且含姓名',
    finalCard.on === true && finalCard.text.includes(setup.target), finalCard.text);
  console.log('screenshot:', OUT_FULL);

  const errors = session.errors ? session.errors() : [];
  check('无控制台报错', errors.length === 0, `${errors.length} 条`);
  console.log(failed === 0 ? '\nD8-F 探针：全部通过 ✓' : `\nD8-F 探针：${failed} 项未通过 ✗`);
} finally {
  await session.close();
}
process.exit(failed === 0 ? 0 : 1);
