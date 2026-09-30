// Render3D M1 浏览器探针（RESEARCH · 一次性）——用无头浏览器确认 3D 沙盘「真的能用」。
//
// 不进 build 清单、不进测试链（`inkbox-package.mjs` 的 FILES 是显式清单，本文件不在其中）。
// 用法：先起服务器（默认 4180），再
//   node scripts/_m1-viewshot.mjs
//
// ⚠️ 依赖同目录的 `scripts/cdp.mjs`（零依赖 CDP 胶水层，复用本机 Edge/Chrome）。
//
// 它验证委托书 §十 的验收场景：
//   A 普通世界：地形 / 水 / 植被 / 人物 / 聚落 / 宗门 同时在场景里；
//   C 点击聚落：现有 inspect 面板正确显示聚落名 / 人口 / 势力；
//   D 点击修士群：inspect 面板显示附近最强修士资料；
//   E 雕刻：抬高聚落附近山体 ⇒ 地形更新、实例 Y 跟着变（不沉入地下）、切 Canvas 后是同一份世界；
//   F Canvas 回退：3D → Canvas → 3D 反复 10 次，无重复 canvas、世界没被重置；
//   B 高人口世界：人物在动、draw call 不爆。
//
// ⚠️⚠️ **B 必须跑在最后**：它 `newWorld('large')` 会**换掉整个世界**，
//    跑在前面的话 C/D/E 会在一个没有村落、没有修士的空世界上点击
//    （表现为「点屏幕正中却命中一片荒漠」——已经踩过一次）。
//
// ⚠️⚠️ **造内容一律走真工厂**（`life.foundVillage` / `foundSect` / `life.spawn` /
//    `forgeArtifact`+`toGround` / `world.addSite`）。
//    第一版探针手搓了 `{ id, name, color, accent, capitalX, capitalY, war, relations }`
//    这样的假宗门对象，缺 `villages` / `pop` / `leylines` / `resources` 等字段 ⇒
//    `updateHud` 读 `f.villages.length` 抛 TypeError ⇒ 异常从 `update()` 冒出来，
//    **`render()` 与下一帧的 `requestAnimationFrame` 都不执行** ⇒ 帧循环静默死掉。
//    后果极具欺骗性：metrics 冻结在最后一次成功渲染的数值上，看起来像「渲染器不更新」。
//    这是**探针的数据造假**，不是产品缺陷——`_m1diag.mjs` 已证明四层本身正常。
//
// ⚠️ 这是**验渲染器**，不是验生态。

import fs from 'node:fs';
import path from 'node:path';
import { launch, sleep } from './cdp.mjs';

const BASE = process.env.INKBOX_URL || 'http://127.0.0.1:4180/inkbox.html';
// ⚠️ 必须带 `?renderer=3d`：默认 Canvas 主线**不加载** Three.js 模块（M0 的纪律）。
const URL = `${BASE}${BASE.includes('?') ? '&' : '?'}renderer=3d`;
const OUT_DIR = path.resolve('reports/inkbox');
fs.mkdirSync(OUT_DIR, { recursive: true });

const results = [];
function record(label, value) { results.push({ label, value }); console.log(`  · ${label}: ${JSON.stringify(value)}`); }
let failed = 0;
function assert(label, condition, detail = '') {
  if (condition) { console.log(`  ✓ ${label}${detail ? ' — ' + detail : ''}`); return true; }
  failed += 1; console.log(`  ✗ ${label}${detail ? ' — ' + detail : ''}`); return false;
}

// ⚠️ `cdp.mjs` 的 `js()` 把表达式包进**非 async** 的箭头函数（`(() => { ... })()`），
//    所以页面脚本里**不能出现 `await`**（会抛 SyntaxError）。
//    解法：让表达式**返回一个 Promise**——`Runtime.evaluate` 带 `awaitPromise: true`，
//    会自动把它拆包。模块句柄也顺势缓存到 `window.__m1mods`，只 import 一次。
// ⚠️ 用**绝对**说明符（`/src/...`）：与 app 走同一个 URL ⇒ **同一个模块实例**，
//    拿到的 `foundSect` / `sculpt` 与页面里跑的是同一份代码。
const MODS = `window.__m1mods || (window.__m1mods = Promise.all([
  import('/src/inkbox/sim/sects.js'),
  import('/src/inkbox/sim/artifacts.js'),
  import('/src/inkbox/core/noise.js'),
  import('/src/inkbox/render3d/terrain/sculpt.js'),
]).then(([sects, artifacts, noise, terrain]) => ({ sects, artifacts, noise, terrain })));`;

// 在页面里找一块可行走的地（真工厂大多不检查地形，spawn 会因找不到落点而静默返回 0）。
const WALKABLE = `function walkableNear(x, y, r) {
  for (let dy = -r; dy <= r; dy += 1) for (let dx = -r; dx <= r; dx += 1) {
    const nx = Math.round(x) + dx, ny = Math.round(y) + dy;
    if (nx > 3 && ny > 3 && nx < w.w - 3 && ny < w.h - 3 && w.isWalkable(ny * w.w + nx)) return [nx, ny];
  }
  return null;
}`;

const session = await launch({ url: URL, width: 1500, height: 940 });
try {
  // ⚠️ `waitFor` 超时只返回 false（不抛）——必须自己检查，否则后面会以一句
  //    「Cannot read properties of undefined」的莫名报错开场。
  const ready = await session.waitFor(
    'return !!window.inkbox && !!window.inkbox.render3d && !!window.inkbox.render3d.renderer',
    { timeoutMs: 60000 },
  );
  if (!ready) {
    const why = await session.js('return { hasInkbox: typeof window.inkbox, has3d: !!(window.inkbox && window.inkbox.render3d), webgl: (() => { try { const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); } catch (e) { return String(e.message); } })() };');
    throw new Error(`3D 适配器未就绪：${JSON.stringify(why)}；控制台：${session.errors().slice(0, 3).join(' | ')}`);
  }
  console.log('\n═══ 环境 ═══');
  record('environment', await session.js(`
    const k = window.inkbox; const r = k.render3d.renderer;
    const gl = r.gpu.getContext(); const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return { ua: navigator.userAgent.slice(0, 60), gpu: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
      dpr: devicePixelRatio, size: [innerWidth, innerHeight] };
  `));

  // 暂停世界 + 挂一个帧计数器（判「帧循环还活着」）。⚠️ 包装只是加计数，再委托给原函数。
  await session.js(`
    const k = window.inkbox; k.speedIndex = 0; window.__frames = 0;
    if (!window.__m1framed) {
      window.__m1framed = true;
      const original = k.frame.bind(k);
      k.frame = (ts) => { window.__frames += 1; return original(ts); };
    }
    return true;
  `);
  await sleep(500);

  // ── 造一个有内容的世界（真工厂）─────────────────────────────────
  const seeded = await session.js(`
    ${MODS}
    return window.__m1mods.then((M) => {
      const k = window.inkbox; const w = k.world;
      ${WALKABLE}
      const rng = M.noise.mulberry32(0x51ed);
      const gx = Math.floor(w.w / 2), gy = Math.floor(w.h / 2);

      // 1) 宗门（真工厂）：先立宗门，村落才好归属它。
      const cap = walkableNear(gx + 4, gy - 16, 14) || [gx, gy];
      const sect = M.sects.foundSect(w, cap[0], cap[1], null, rng);

      // 2) 两个村落（真工厂）
      const v1Spot = walkableNear(gx - 14, gy - 6, 16) || [gx, gy];
      const v2Spot = walkableNear(gx + 16, gy + 10, 16) || [gx, gy];
      const v1 = k.life.foundVillage(v1Spot[0], v1Spot[1], sect ? sect.id : 0);
      const v2 = k.life.foundVillage(v2Spot[0], v2Spot[1], 0);

      // 3) 屋舍：与 sim 同一形状（life.js 里就是 push { x, y, type }，整数格）
      for (let i = 0; i < 18; i += 1) {
        const hx = v1.x + (i % 5) - 2, hy = v1.y + Math.floor(i / 5) - 2;
        if (w.inside(hx, hy) && w.isBuildable(hy * w.w + hx)) v1.houses.push({ x: hx, y: hy, type: 1 });
      }
      for (let i = 0; i < 6; i += 1) {
        const hx = v2.x + (i % 3) - 1, hy = v2.y + Math.floor(i / 3);
        if (w.inside(hx, hy) && w.isBuildable(hy * w.w + hx)) v2.houses.push({ x: hx, y: hy, type: 1 });
      }

      // 4) 生灵（真工厂 spawn，内部会调 initEntity 补全全部字段）
      const before = w.entities.length;
      if (sect) k.life.spawn(sect.capitalX, sect.capitalY, 'cultivator', 16, sect.id);
      k.life.spawn(v1.x, v1.y, 'human', 44, sect ? sect.id : 0);
      k.life.spawn(v2.x, v2.y, 'human', 18, 0);
      const beastSpot = walkableNear(gx - 20, gy + 14, 14) || [v1.x, v1.y];
      k.life.spawn(beastSpot[0], beastSpot[1], 'beast', 10, 0);
      const spiritSpot = walkableNear(gx + 24, gy - 6, 14) || [v2.x, v2.y];
      k.life.spawn(spiritSpot[0], spiritSpot[1], 'spirit', 8, 0);
      const spawned = w.entities.length - before;

      // 给修士分批境界：一个高境界（好让「附近最强」有得挑），其余依次。
      const culs = w.entities.filter((e) => e.sp === 'cultivator');
      culs.forEach((e, i) => { e.level = i === 0 ? 32 : 4 + i; });

      // 5) 无主法宝（真工厂）：炼器 ⇒ 从主人身上摘下来 ⇒ 落地
      const groundArtifacts = [];
      const smith = culs[0];
      if (smith) {
        if (!Array.isArray(smith.artifacts)) smith.artifacts = [];
        for (let i = 0; i < 6; i += 1) {
          const a = M.artifacts.forgeArtifact(w, smith, rng);
          if (!a) break;
          const idx = smith.artifacts.indexOf(a);
          if (idx >= 0) smith.artifacts.splice(idx, 1);
          M.artifacts.toGround(w, a, v1.x - 6 + i, v1.y + 2);
          groundArtifacts.push(a.id);
        }
      }

      // 6) 地点（真工厂 addSite）
      const siteKinds = ['secret', 'cave', 'formation', 'ruin'];
      for (const kind of siteKinds) w.addSite({ kind, x: v1.x + 6 + kind.length, y: v1.y + 4, name: kind });

      return { gx, gy, v1Id: v1.id, v2Id: v2.id, v1Name: v1.name, v2Name: v2.name, v1: [v1.x, v1.y], v2: [v2.x, v2.y],
        sectId: sect ? sect.id : 0, sectName: sect ? sect.name : '—', sectCapital: sect ? [sect.capitalX, sect.capitalY] : null,
        spawned, cultivators: culs.length, strongest: culs[0] ? { name: culs[0].name, level: culs[0].level } : null,
        groundArtifacts, houses: v1.houses.length + v2.houses.length,
        villages: w.villages.length, factions: w.factions.length, entities: w.entities.length,
        artifacts: w.artifacts.length, sites: w.sites.length };
    });
  `);
  console.log('\n═══ 场景 A · 普通世界 ═══');
  record('seeded', seeded);
  assert('真工厂造出了内容（村落 / 宗门 / 修士 / 法宝 / 地点都在）',
    seeded.villages >= 2 && seeded.factions >= 1 && seeded.cultivators >= 1 && seeded.groundArtifacts.length >= 1 && seeded.sites >= 4,
    JSON.stringify({ v: seeded.villages, f: seeded.factions, c: seeded.cultivators, a: seeded.groundArtifacts.length, s: seeded.sites }));
  assert('修士造出来了（否则「附近最强」无从谈起）', seeded.cultivators > 0, `${seeded.cultivators} 位`);

  await session.js('window.inkbox.render3d.renderer.cameraRig.fit(); return true;');
  await sleep(900);

  const metricsAt = async (label) => {
    const data = await session.js(`
      const k = window.inkbox; const r = k.render3d.renderer; const m = r.debug.metrics; const w = k.world;
      return { frames: window.__frames, drawCalls: m.drawCalls, triangles: m.triangles, fps: +m.fps.toFixed(1), frameMs: +m.frameMs.toFixed(2),
        entityInstances: m.entityInstances, houseInstances: m.houseInstances, markerInstances: m.markerInstances,
        entityCount: w.entities.length, houseCount: w.villages.reduce((n, v) => n + (v.houses ? v.houses.length : 0), 0),
        villageCount: w.villages.length, factionCount: w.factions.length, artifactCount: w.artifacts.length,
        siteCount: w.sites.length, zoom: +r.cameraRig.camera.zoom.toFixed(2),
        layerStats: { entities: r.entities.stats, settlements: r.settlements.stats, markers: r.markers.stats } };
    `);
    record(label, data);
    return data;
  };
  const far = await metricsAt('A/metrics(fit 全图)');
  await session.screenshot(path.join(OUT_DIR, 'm1-sceneA-overview.png'));

  assert('地形 / 水 / 植被仍在场景里', await session.js('const r = window.inkbox.render3d.renderer; return !!(r.terrain && r.water && r.vegetation);'));
  assert('人物实例数 = 世界实体数', far.entityInstances === far.entityCount, `${far.entityInstances} vs ${far.entityCount}`);
  assert('建筑实例数 = 屋舍 + 聚落中心 + 宗门',
    far.houseInstances === far.layerStats.settlements.houses + far.layerStats.settlements.centers + far.layerStats.settlements.sects,
    `${far.houseInstances} vs ${far.layerStats.settlements.houses}+${far.layerStats.settlements.centers}+${far.layerStats.settlements.sects}`);
  assert('全图视角 draw call 仍在几十以内', far.drawCalls < 30, `${far.drawCalls} draws`);

  // 近景：标记应出现
  await session.js('const r = window.inkbox.render3d.renderer; r.cameraRig.camera.zoom = 5; r.cameraRig.camera.updateProjectionMatrix(); return true;');
  await sleep(700);
  const near = await metricsAt('A/metrics(zoom=5 近景)');
  await session.screenshot(path.join(OUT_DIR, 'm1-sceneA-close.png'));
  assert('帧循环存活（metrics 随帧刷新）', near.frames > far.frames, `${far.frames} → ${near.frames} 帧`);
  assert('放大后法宝 / 地点标记出现', near.markerInstances > 0, `${near.markerInstances} markers`);
  // 契约（委托书 §「性能预算」）：「普通全图观察时…总 draw call 应保持在**几十以内**，
  // 而不是几百 / 几千」。近景 LOD 会放出全部标记网格，读数比全图高是**设计使然**。
  assert('近景 draw call 仍在几十以内（不是几百 / 几千）', near.drawCalls < 60, `${near.drawCalls} draws`);
  // 「整个新增实体表现层：尽量 < 15 个额外 draw calls」——契约这句话的主语是
  // **「普通全图观察时」**，所以判据落在全图视角（M0 基线 = 地形/水/植被 3 次）。
  assert('全图视角：新增表现层额外 draw call < 15（相对 M0 的 3 次）', far.drawCalls - 3 < 15,
    `+${far.drawCalls - 3}（全图 ${far.drawCalls} / 近景 ${near.drawCalls}）`);

  // ── 场景 C / D · 点击聚落 / 修士群 ────────────────────────────
  // ⚠️ `inspectAt` 的容差是**邻域**：村落 6 格、生灵 5 格（见 main.js）。
  //    所以点屏幕正中即可——只要相机真的聚焦过去了（`focusOn` 靠渲染帧推进动画，
  //    帧循环一死，相机就停在原地，于是「点正中却命中一片空地」）。
  console.log('\n═══ 场景 C/D · 点击聚落与修士群（复用原 inspect）═══');
  const box = await session.js('const r = document.getElementById("inkCanvas3D").getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height };');
  // ⚠️⚠️ **不能假设「聚焦后点屏幕正中」就命中目标格**，也不能假设「一定能拾取到」。
  //
  //    相机确实精确对准目标格（`focusOn` 是刚性平移，实测屏幕正中 = `controls.target`，
  //    偏差 0 格），但 `pick` 是**地面射线**：目标格若在凹地里、前方隔着一道更高的山脊，
  //    屏幕正中那条射线会先撞上**遮挡物**。实测目标 (114,68)（高程 0.651）从默认方位看
  //    被东南侧的脊（高程 0.896）挡住，正中命中偏出 22 格，**整个屏幕内最近也只能到 7.3 格**。
  //    ⇒ 这是拾取的**正确行为**，不是缺陷；而且与 zoom 无关（zoom 1 与 5 的最近落点都是 7.3 格）
  //      ——因为它是**视角**问题，不是缩放问题。
  //    ⇒ 正确做法：像玩家一样**换一个看得见的方位角**，再用 `pick` 找一个真的能拾取到
  //      目标格的屏幕点，然后点那里。测的仍是完整链路（pointerdown → hit → inspectAt → 面板 DOM）；
  //      `pick` 一旦坏掉，八个方位角都找不到落点 ⇒ 断言照样变红。
  const clickCell = async (wx, wy, tol) => {
    let aim = null; let azimuth = null;
    for (let az = 0; az < 8 && !aim; az += 1) {
      await session.js(`
        const r = window.inkbox.render3d.renderer;
        r.cameraRig.fit();
        if (${az}) r.cameraRig.rotate(${az} * Math.PI / 4);
        r.cameraRig.focusOn(${wx}, ${wy});
        return true;
      `);
      // ⚠️ 等动画真的结束，不要用固定 sleep：`pointerdown` 里有 `cancelFocus()`，
      //    点击会**冻结正在飞行的相机**（刻意的：玩家一按就接管）。
      await session.waitFor('return !window.inkbox.render3d.renderer.cameraRig.focus', { timeoutMs: 12000 });
      await sleep(150);
      aim = await session.js(`
        const r = window.inkbox.render3d.renderer;
        const b = r.canvas.getBoundingClientRect();
        const cx = b.width / 2, cy = b.height / 2;
        let hit = null;
        for (let rad = 0; rad <= 320 && !hit; rad += 15) {
          for (let a = 0; a < 16 && !hit; a += 1) {
            const ang = a * Math.PI / 8;
            const px = cx + Math.cos(ang) * rad, py = cy + Math.sin(ang) * rad;
            if (px < 2 || py < 2 || px > b.width - 2 || py > b.height - 2) continue;
            const h = r.pick(px, py);
            if (h && Math.hypot(h.x - ${wx}, h.y - ${wy}) < ${tol}) hit = { px: Math.round(px), py: Math.round(py), cell: { x: h.x, y: h.y } };
          }
        }
        return hit;
      `);
      if (aim) azimuth = az;
    }
    if (!aim) return { on: false, cell: null, text: '', note: '八个方位角内都拾取不到目标格' };
    await session.click(box.x + aim.px, box.y + aim.py);
    await sleep(400);
    const panel = await session.js(`
      const p = document.getElementById('inkInspect');
      return { on: p.classList.contains('on'), cell: window.inkbox.selected, text: (p.innerText || '').replace(/\\s+/g, ' ').slice(0, 300) };
    `);
    return { ...panel, azimuth, aimedAt: aim.cell };
  };
  const villageClick = await clickCell(seeded.v1[0], seeded.v1[1], 6);
  record('C/inspect', villageClick);
  assert('点击聚落后 inspect 面板打开', villageClick.on === true);
  assert('面板显示聚落名（真工厂生成的村名）', villageClick.text.includes(seeded.v1Name),
    `期望「${seeded.v1Name}」· 实得 ${villageClick.text.slice(0, 90)}`);

  const sectClick = await clickCell(seeded.sectCapital[0], seeded.sectCapital[1], 5);
  record('D/inspect', sectClick);
  assert('点击修士群后面板显示最强修士', seeded.strongest
    ? sectClick.text.includes(seeded.strongest.name)
    : false, seeded.strongest ? `期望「${seeded.strongest.name}（${seeded.strongest.level}）」· 实得 ${sectClick.text.slice(0, 140)}` : '没有修士');

  // ── 场景 E · 雕刻 ─────────────────────────────────────────────
  console.log('\n═══ 场景 E · 雕刻（聚落附近抬山）═══');
  const sculptResult = await session.js(`
    ${MODS}
    const k = window.inkbox; const w = k.world; const r = k.render3d.renderer;
    const v = w.villages.find((x) => x.id === ${seeded.v1Id});
    const cx = v.x, cy = v.y; const i = cy * w.w + cx;
    const sumY = (mesh) => { const a = mesh.instanceMatrix.array; let s = 0; for (let n = 0; n < mesh.count; n += 1) s += a[n * 16 + 13]; return s; };
    const beforeHeight = w.height[i];
    const beforeY = sumY(r.entities.meshes.human);
    const humanBefore = r.entities.meshes.human.count;
    return window.__m1mods.then((M) => {
      for (let n = 0; n < 6; n += 1) {
        const region = M.terrain.sculpt(w, { x: cx, y: cy, radius: 6, mode: 'raise', strength: 0.3 });
        if (region) r.markTerrainDirty(region);
      }
      return { beforeHeight, afterHeight: w.height[i], beforeY, humanBefore, world: k.world === w };
    });
  `);
  await sleep(1200);
  const afterSculpt = await session.js(`
    const r = window.inkbox.render3d.renderer;
    const sumY = (mesh) => { const a = mesh.instanceMatrix.array; let s = 0; for (let n = 0; n < mesh.count; n += 1) s += a[n * 16 + 13]; return s; };
    return { afterY: sumY(r.entities.meshes.human), frames: window.__frames };
  `);
  record('E/sculpt', { beforeHeight: sculptResult.beforeHeight, afterHeight: sculptResult.afterHeight,
    beforeY: sculptResult.beforeY, afterY: afterSculpt.afterY, frames: afterSculpt.frames });
  assert('雕刻真的改了地形高度', sculptResult.afterHeight > sculptResult.beforeHeight + 0.2,
    `${sculptResult.beforeHeight.toFixed(4)} → ${sculptResult.afterHeight.toFixed(4)}`);
  assert('实体实例 Y 跟着地形抬高（没沉入地下）', afterSculpt.afterY > sculptResult.beforeY + 0.5,
    `ΣY ${sculptResult.beforeY.toFixed(2)} → ${afterSculpt.afterY.toFixed(2)}`);
  await session.screenshot(path.join(OUT_DIR, 'm1-sceneE-sculpt.png'));

  // ── 场景 F · 反复切换 ─────────────────────────────────────────
  console.log('\n═══ 场景 F · 3D ↔ Canvas 反复 10 次 ═══');
  const identity = await session.js(`
    const k = window.inkbox; const w = k.world; const i = Math.floor(w.size / 2);
    window.__m1mark = { day: w.day, h: w.height[i], entityCount: w.entities.length, seed: w.seed };
    k.render3d.setActive(false);
    const sameAfterOff = k.world === w;
    k.render3d.setActive(true);
    return { sameAfterOff, sameAfterOn: k.world === w };
  `);
  await sleep(500);
  const toggled = await session.js(`
    const k = window.inkbox; const w = k.world; const i = Math.floor(w.size / 2);
    const canvases0 = document.querySelectorAll('canvas').length;
    for (let n = 0; n < 10; n += 1) k.render3d.setActive(n % 2 === 0);
    k.render3d.setActive(true);
    return { canvases0, canvases1: document.querySelectorAll('canvas').length,
      sameWorld: k.world === w, sceneChildren: k.render3d.renderer.scene.children.length,
      day: w.day, h: w.height[i], entityCount: w.entities.length, mark: window.__m1mark };
  `);
  await sleep(400);
  record('F/toggle', { canvases0: toggled.canvases0, canvases1: toggled.canvases1, sameWorld: toggled.sameWorld, sceneChildren: toggled.sceneChildren });
  assert('切 Canvas 再切回：世界是同一份', identity.sameAfterOff && identity.sameAfterOn
    && toggled.day === toggled.mark.day && toggled.h === toggled.mark.h
    && toggled.entityCount === toggled.mark.entityCount,
    JSON.stringify({ day: [toggled.mark.day, toggled.day], ent: [toggled.mark.entityCount, toggled.entityCount] }));
  assert('反复切换后没有多出 canvas', toggled.canvases0 === toggled.canvases1, `${toggled.canvases0} → ${toggled.canvases1}`);
  assert('场景对象没有越积越多', toggled.sceneChildren < 24, `scene.children = ${toggled.sceneChildren}`);

  // ── 场景 B · 高人口世界（⚠️ 必须最后：它会换掉整个世界）──────────
  console.log('\n═══ 场景 B · 高人口世界（large + 近 3000 实体）═══');
  await session.js(`
    const k = window.inkbox;
    k.newWorld('large', 20260928);
    k.speedIndex = 0;
    return true;
  `);
  const swapped = await session.waitFor('return window.inkbox.render3d.renderer.world === window.inkbox.world', { timeoutMs: 30000 });
  assert('换世界后渲染器跟上了新世界', swapped === true);
  const heavy0 = await session.js(`
    const k = window.inkbox; const w = k.world;
    ${WALKABLE}
    let made = 0;
    for (let i = 0; i < 48 && w.entities.length < 2950; i += 1) {
      const spot = walkableNear(16 + (i % 8) * 46, 16 + Math.floor(i / 8) * 40, 18);
      if (!spot) continue;
      const sp = i % 11 === 0 ? 'beast' : (i % 7 === 0 ? 'spirit' : 'human');
      made += k.life.spawn(spot[0], spot[1], sp, 70, 0);
    }
    return { made, entities: w.entities.length };
  `);
  await sleep(900);
  const heavy1 = await metricsAt('B/metrics(高人口)');
  const beforePositions = await session.js(`
    const r = window.inkbox.render3d.renderer; const arr = r.entities.meshes.human.instanceMatrix.array;
    const out = []; for (let i = 0; i < 20; i += 1) out.push(+arr[i * 16 + 12].toFixed(4));
    return out;
  `);
  await session.js('window.inkbox.advanceDays(30); return true;');
  await sleep(1200);
  const heavy2 = await metricsAt('B/metrics(推进 30 日后)');
  const afterPositions = await session.js(`
    const r = window.inkbox.render3d.renderer; const arr = r.entities.meshes.human.instanceMatrix.array;
    const out = []; for (let i = 0; i < 20; i += 1) out.push(+arr[i * 16 + 12].toFixed(4));
    return out;
  `);
  await session.screenshot(path.join(OUT_DIR, 'm1-sceneB-large.png'));

  record('B/spawn', heavy0);
  assert('高人口世界真的造出来了（近 3000 实体）', heavy1.entityCount > 2000, `${heavy1.entityCount} 实体`);
  assert('3000 实体不产生数千 draw call', heavy1.drawCalls < 40, `${heavy1.drawCalls} draws`);
  assert('实体实例数与世界实体数一致（3000 级）', heavy1.entityInstances === heavy1.entityCount,
    `${heavy1.entityInstances} vs ${heavy1.entityCount}`);
  assert('推进后人物位置确实变化（移动可见）',
    beforePositions.some((v, i) => v !== afterPositions[i]), '前 20 个 human 实例 X 至少一个变了');
  assert('推进后帧循环仍活着', heavy2.frames > heavy1.frames, `${heavy1.frames} → ${heavy2.frames} 帧`);

  const errors = session.errors();
  record('console errors', errors.slice(0, 5));
  assert('运行期没有控制台报错', errors.length === 0, errors.slice(0, 3).join(' | '));
} catch (error) {
  failed += 1;
  console.error('\n探针异常：', error?.stack || error);
} finally {
  await session.close();
}

console.log('\n══════════════════════════════════════════════════════════════');
console.log(failed === 0 ? 'M1 浏览器探针：全部通过' : `M1 浏览器探针：${failed} 项未通过`);
console.log('══════════════════════════════════════════════════════════════');
fs.writeFileSync(path.join(OUT_DIR, 'm1-probe.json'), JSON.stringify({ failed, results }, null, 2));
process.exitCode = failed === 0 ? 0 : 1;
