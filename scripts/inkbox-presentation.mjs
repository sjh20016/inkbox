#!/usr/bin/env node
// Inkbox 表现层（presentation）回归 · D7-C 起
//
// 这里只测**表现层**：相机补间、落点墨环，以及后面 D7-D/E 的 FX / 记挂。
// 它与 smoke / three-realms 的分工：
//   · smoke / three-realms 管**模拟**（谁动了、账平不平）；
//   · 本脚本管**表现**——「玩家看得见的那一层」是否按契约工作，且**绝不反向改模拟**。
//
// 铁律：表现层不写世界、不抽 RNG、不进存档。本脚本的「不变量」组专门钉这一条。
//
// 用法：node scripts/inkbox-presentation.mjs
// 退出码：0 = 全绿；1 = 有断言失败。

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Camera, DEFAULT_FOCUS_DURATION } from '../src/inkbox/render/camera.js';
import {
  FOCUS_PULSE_CAP,
  FOCUS_PULSE_DURATION,
  drawFocusPulses,
  drawWarLines,
  spawnFocusPulse,
  updateFocusPulses,
} from '../src/inkbox/render/overlayLayer.js';
import {
  RELATION_GRAPH_MAX, buildRelationGraph, pickNeighbors, relationGraphSvg,
} from '../src/inkbox/render/relationGraph.js';
import { LIMITS, WORLD_PRESETS } from '../src/inkbox/core/config.js';
import { createFxState, drawFx, ingestRuntimeEvents, updateFx, FX_CAP } from '../src/inkbox/render/fxLayer.js';
import { PresentationStage, STAGE_PLANES } from '../src/inkbox/render/presentationStage.js';
import { drainRuntimeEvents, peekRuntimeEvents } from '../src/inkbox/core/runtimeEvents.js';
import {
  emitPresentation, emitRiftCross, RIFT_CROSS_KINDS, RIFT_CROSS_PHASES,
} from '../src/inkbox/sim/presentation.js';
import { generateWorld } from '../src/inkbox/world/worldgen.js';
import { generateUpperWorld } from '../src/inkbox/world/worldgenUpper.js';
import { openRifts } from '../src/inkbox/sim/rifts.js';
import { serializeWorld, deserializeWorld } from '../src/inkbox/io/save.js';
import {
  WATCH_CAP, addWatch, removeWatch, toggleWatch, watchKeyOf, isWatched,
  resolveWatch, watchRows, watchHasNews, ensureWatch, markAllWatchRead,
} from '../src/inkbox/sim/watch.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// 一个最小「世界」桩：投影 / idx / 高度层。多个组共用。
const fakeWorld50 = { w: 50, h: 50, height: new Float32Array(50 * 50), idx: (x, y) => y * 50 + x };
let checks = 0;
let failed = 0;
function check(label, condition) {
  checks += 1;
  try {
    assert.ok(condition, label);
    console.log(`  ✓ ${label}`);
  } catch (error) {
    failed += 1;
    console.log(`  ✗ ${label}`);
  }
}

function makeCamera() {
  const cam = new Camera();
  cam.setViewport(800, 600);
  cam.bind({ w: 200, h: 120, reliefScale: 10 });
  cam.fit({ w: 200, h: 120 });
  return cam;
}

/**
 * 去掉注释再扫源码。
 * ⚠️ 承重：本项目**文档注释与代码混排**，注释里常出现「不读 world.day」「mulberry32」
 * 这类**被禁止的字面量**（正是在解释「为什么不能这么写」）。直接 grep 全文会把
 * 「注释里提到了它」误判成「代码里用了它」——这正是仓库里已记录的假红故障类。
 *
 * ⚠️⚠️ **必须是逐字符状态机，不能拿一条朴素正则去删块注释**：本仓注释里会出现
 * 「本模块不 import sim 下所有模块」这种**含块注释起始二字符序列的行注释**；
 * 朴素正则会把它误认成块注释开头，一路吞到下一个块注释结束序列 —— **把中间的代码
 * 也删掉**，于是「文件里有没有某个 import」这类断言**静默地**基于残缺源码判断
 * （假红 / 假绿都可能）。
 * 本函数**保留行号**（注释换成等长空白），报出的行号能直接跳。
 */
function stripComments(src) {
  let out = '';
  let i = 0;
  let mode = 0;   // 0=代码 1=行注释 2=块注释
  let quote = '';
  while (i < src.length) {
    const c = src[i];
    const c2 = src[i + 1];
    if (mode === 0 && !quote && c === '/' && c2 === '/') { mode = 1; out += '  '; i += 2; continue; }
    if (mode === 0 && !quote && c === '/' && c2 === '*') { mode = 2; out += '  '; i += 2; continue; }
    if (mode === 1) { out += c === '\n' ? '\n' : ' '; if (c === '\n') mode = 0; i += 1; continue; }
    if (mode === 2) {
      if (c === '*' && c2 === '/') { mode = 0; out += '  '; i += 2; continue; }
      out += c === '\n' ? '\n' : ' ';
      i += 1;
      continue;
    }
    if (!quote && (c === "'" || c === '"' || c === '`')) { quote = c; out += c; i += 1; continue; }
    if (quote) {
      if (c === '\\') { out += c + (c2 || ''); i += 2; continue; }
      if (c === quote) quote = '';
      out += c;
      i += 1;
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
}

/**
 * 取某个函数的**函数体**（已去注释的源码上），做「函数边界」类判据。
 * 与 `three-realms.mjs` 的 `fnBodyOf` 同款：从 `function <name>(` 起找到签名后
 * 第一个 `{`，再**括号配平**到配对的 `}`。找不到返回空串。
 */
function fnBodyOfCode(src, name) {
  const i = src.indexOf(`function ${name}(`);
  if (i < 0) return '';
  // ⚠️ 必须先**配平参数表括号**再找函数体的 `{`：参数默认值里可能出现 `{}`
  //    （例如 `emitRiftCross(world, spec = {})`），直接取「第一个 `{`」会拿到它，
  //    于是函数体只剩 `{}`——一条静默的假红。
  const p = src.indexOf('(', i);
  if (p < 0) return '';
  let pd = 0;
  let q = p;
  for (; q < src.length; q += 1) {
    if (src[q] === '(') pd += 1;
    else if (src[q] === ')') { pd -= 1; if (pd === 0) { q += 1; break; } }
  }
  const j = src.indexOf('{', q);
  if (j < 0) return '';
  let depth = 0;
  for (let k = j; k < src.length; k += 1) {
    if (src[k] === '{') depth += 1;
    else if (src[k] === '}') { depth -= 1; if (depth === 0) return src.slice(j, k + 1); }
  }
  return src.slice(j);
}

console.log('══════════════════════════════════════════════════════════════');
console.log('inkbox 表现层回归（presentation）');
console.log('══════════════════════════════════════════════════════════════');

// ── 1. 相机补间：基本契约 ────────────────────────────────────────
console.log('\n[1] 相机补间 · 基本契约');
{
  const cam = makeCamera();
  const before = [cam.x, cam.y, cam.zoom];
  check('没有补间时 update 返回 false 且不动相机',
    cam.update(0.5) === false && cam.x === before[0] && cam.y === before[1] && cam.zoom === before[2]);
  check('默认补间时长落在 0.6~0.9 秒（找人物档）',
    DEFAULT_FOCUS_DURATION >= 0.6 && DEFAULT_FOCUS_DURATION <= 0.9);

  cam.focusOn(50, 40, { zoom: 8, duration: 0.75 });
  check('focusOn 建立补间（记录起点/终点/时长/zoom）',
    cam.transition !== null
    && cam.transition.toX === 50 && cam.transition.toY === 40
    && cam.transition.toZoom === 8 && cam.transition.duration === 0.75
    && cam.transition.fromZoom === before[2]);

  const mid = cam.update(0.25);
  check('补间进行中返回 true 且已离开起点',
    mid === true && cam.transition !== null && (cam.x !== before[0] || cam.y !== before[1]));

  cam.update(0.25);
  cam.update(0.25);
  cam.update(0.25);
  check('补间在固定时长内准确结束（x/y/zoom 精确等于目标）',
    cam.transition === null && cam.x === 50 && cam.y === 40 && cam.zoom === 8);
}

// ── 2. 相机补间：缓动与落点 ──────────────────────────────────────
console.log('\n[2] 相机补间 · 缓动与落点');
{
  const cam = makeCamera();
  const startX = cam.x;              // fit 后 = 世界中心 100
  cam.focusOn(20, 60, { duration: 1 });
  cam.update(0.5);
  const progress = (startX - cam.x) / (startX - 20);
  check('ease-out：时间过半时位移已过半（起步快、收尾慢）', progress > 0.5 && progress < 1);

  const cam2 = makeCamera();
  const expected = cam2.clampPoint(-9999, -9999, 7);
  cam2.focusOn(-9999, -9999, { zoom: 7, duration: 0.5 });
  cam2.update(1);
  check('focusOn 到图外目标：终点是钳制后的位置（不会把镜头甩到图外）',
    cam2.transition === null && cam2.x === expected.x && cam2.y === expected.y && cam2.zoom === 7);

  const cam3 = makeCamera();
  const r = cam3.focusOn(60, 30, { zoom: 9, duration: 0 });
  check('duration ≤ 0 ⇒ 立即到位且不建补间',
    r === null && cam3.transition === null && cam3.x === 60 && cam3.y === 30 && cam3.zoom === 9);
}

// ── 3. 玩家输入立即接管 ──────────────────────────────────────────
console.log('\n[3] 玩家输入立即接管（取消补间）');
{
  const cam = makeCamera();
  cam.focusOn(30, 30, { duration: 1 });
  cam.update(0.1);
  const px = cam.x;
  cam.panBy(40, 0);
  check('中途 pan 立即取消补间并生效', cam.transition === null && cam.x !== px);

  const cam2 = makeCamera();
  cam2.focusOn(30, 30, { duration: 1 });
  cam2.update(0.1);
  const zBefore = cam2.zoom;
  cam2.zoomAt(400, 300, 1.2);
  check('中途 zoomAt 立即取消补间并缩放', cam2.transition === null && cam2.zoom !== zBefore);

  const cam3 = makeCamera();
  cam3.focusOn(30, 30, { duration: 1 });
  cam3.fit({ w: 200, h: 120 });
  check('按 H（fit）立即取消补间', cam3.transition === null);

  const cam4 = makeCamera();
  cam4.panBy(1e6, 1e6);
  cam4.clamp();
  const bound = cam4.clampPoint(-1e9, -1e9, cam4.zoom);
  check('clamp 仍有效：越界后落回上界（与 clampPoint 一致）',
    Math.abs(cam4.x - bound.x) < 1e-9 && Math.abs(cam4.y - bound.y) < 1e-9);

  // ⚠️ 外部直接写 camera.x/y（旧 API / 测试 / 别的模块）也算「接管」：
  // 补间必须让位，否则下一帧 update 会把这次写覆盖回去——且不报错。
  const cam5 = makeCamera();
  cam5.focusOn(30, 30, { duration: 1 });
  cam5.update(0.1);
  cam5.x = 77;
  cam5.y = 88;
  cam5.update(0.1);
  check('外部直接写 camera.x/y ⇒ 补间让位（不被下一帧覆盖）',
    cam5.transition === null && cam5.x === 77 && cam5.y === 88);
}

// ── 4. 镜头走真实时间，不走游戏日 ────────────────────────────────
console.log('\n[4] 镜头走真实时间（与游戏倍速无关）');
{
  const cam = makeCamera();
  cam.focusOn(20, 20, { duration: 0.6 });
  cam.update(0.3);
  cam.update(0.3);
  check('0.6 秒真实 dt 走完补间（与任何游戏日无关）', cam.transition === null && cam.x === 20);

  const camSrc = fs.readFileSync(path.join(ROOT, 'src/inkbox/render/camera.js'), 'utf8');
  const camCode = stripComments(camSrc);
  check('camera.js 代码里不读世界时间（去注释后不出现 world.day）', !/world\s*\.\s*day/.test(camCode));
  check('camera.js 不 import rng 生成器（表现层不抽签）', !/mulberry32/.test(camCode));
}

// ── 5. 落点墨环（overlay） ───────────────────────────────────────
console.log('\n[5] 落点墨环 · 寿命 / 上限 / 绘制');
{
  let pulses = [];
  const p = spawnFocusPulse(pulses, 10, 10);
  check('spawnFocusPulse 建一个墨环并带默认时长 1.2 秒',
    pulses.length === 1 && p.ttl === FOCUS_PULSE_DURATION && Math.abs(FOCUS_PULSE_DURATION - 1.2) < 1e-9);

  updateFocusPulses(pulses, 0.5);
  check('updateFocusPulses 递减寿命但不移除未过期的', pulses.length === 1 && Math.abs(pulses[0].life - 0.7) < 1e-9);

  updateFocusPulses(pulses, 1.0);
  check('过期的墨环被移除', pulses.length === 0);

  for (let i = 0; i < FOCUS_PULSE_CAP + 5; i += 1) spawnFocusPulse(pulses, i, i);
  check('墨环列表封顶（超出丢最老的）', pulses.length === FOCUS_PULSE_CAP);

  // 绘制：用桩 ctx 数 ellipse 调用次数
  let ellipseCount = 0;
  const stubCtx = {
    save() {}, restore() {}, beginPath() {}, stroke() {},
    ellipse() { ellipseCount += 1; },
    strokeStyle: '', lineWidth: 0, lineCap: '',
  };
  const fakeWorld = fakeWorld50;
  const cam = makeCamera();
  cam.bind(fakeWorld);
  const drawList = [];
  spawnFocusPulse(drawList, 10, 10);
  spawnFocusPulse(drawList, 20, 20);
  drawFocusPulses(stubCtx, cam, fakeWorld, drawList);
  check('drawFocusPulses 对每个墨环画内外两圈（2 次 ellipse/环）', ellipseCount === drawList.length * 2);
  check('drawFocusPulses 容忍空列表 / 空世界（不抛错）',
    (() => { drawFocusPulses(stubCtx, cam, fakeWorld, []); drawFocusPulses(stubCtx, cam, null, drawList); return true; })());
}

// ── 6. 表现层不变量（不反向依赖模拟） ────────────────────────────
console.log('\n[6] 表现层不变量 · 依赖方向');
{
  const camSrc = fs.readFileSync(path.join(ROOT, 'src/inkbox/render/camera.js'), 'utf8');
  const overlaySrc = fs.readFileSync(path.join(ROOT, 'src/inkbox/render/overlayLayer.js'), 'utf8');
  check('camera.js / overlayLayer.js 不 import sim 或 world 模块（表现不反向依赖模拟）',
    !/from\s+'\.\.\/(sim|world)\//.test(stripComments(camSrc))
    && !/from\s+'\.\.\/(sim|world)\//.test(stripComments(overlaySrc)));
  check('overlayLayer.js 零 import（墨环不依赖任何模块，更不抽签）',
    !/^\s*import\b/m.test(stripComments(overlaySrc)));
  check('LIMITS.minZoom/maxZoom 仍被相机遵守（zoom 钳制常量存在）',
    Number.isFinite(LIMITS.minZoom) && Number.isFinite(LIMITS.maxZoom) && LIMITS.minZoom < LIMITS.maxZoom);
}

// ── 7. FX 层：事件 → 特效 ───────────────────────────────────────
console.log('\n[7] FX 层 · 事件 → 短命特效');
{
  const fx = createFxState();
  check('createFxState 初始为空', Array.isArray(fx.items) && fx.items.length === 0);

  ingestRuntimeEvents(fx, [
    { type: 'tribulation', plane: 'mortal', day: 10, x: 5, y: 6, subjectId: 7 },
    { type: 'tool-impact', plane: 'mortal', day: 10, x: 8, y: 9, data: { tool: 'meteor' } },
    { type: 'tool-impact', plane: 'mortal', day: 10, x: 8, y: 9, data: { tool: 'raise' } },
  ], { plane: 'mortal' });
  check('事件被转成对应特效（tribulation→lightning / meteor→meteor / 其它→impact）',
    fx.items.length === 3
    && fx.items[0].kind === 'lightning'
    && fx.items[1].kind === 'meteor'
    && fx.items[2].kind === 'impact');

  const fx2 = createFxState();
  ingestRuntimeEvents(fx2, [
    { type: 'ascension', plane: 'mortal', day: 1 },
    { type: 'ascension', plane: 'upper', day: 1, x: 3, y: 4 },
    { type: 'unknown-type', plane: 'mortal', day: 1, x: 3, y: 4 },
  ], { plane: 'mortal' });
  // ⚠️ 契约变更（D8-C）：非凡间**不再**被跳过——上界 / 幽冥的事件也要入队（由舞台
  //    分发给视界窗）。所以这里只剩「无坐标」与「未登记类型」两类被跳过。
  check('无坐标 / 未登记类型的事件被跳过；非凡间不再跳过（D8-C 起入队）',
    fx2.items.length === 1 && fx2.items[0].plane === 'upper');
  check('FX 项自带 plane（供 drawPlane 按位面过滤）',
    fx2.items[0].kind === 'ascension' && fx2.items[0].x === 3 && fx2.items[0].y === 4);

  const fx3 = createFxState();
  ingestRuntimeEvents(fx3, [{ type: 'tribulation', plane: 'mortal', day: 1, x: 1, y: 1 }], { plane: 'mortal' });
  updateFx(fx3, 0.3);
  check('updateFx 推进寿命但不移除未过期的', fx3.items.length === 1 && Math.abs(fx3.items[0].age - 0.3) < 1e-9);
  updateFx(fx3, 1.0);
  check('过期的 FX 被移除', fx3.items.length === 0);

  const fx4 = createFxState();
  const many = [];
  for (let i = 0; i < FX_CAP + 20; i += 1) many.push({ type: 'tribulation', plane: 'mortal', day: i, x: i, y: i });
  ingestRuntimeEvents(fx4, many, { plane: 'mortal' });
  check('FX 列表封顶（超出丢最老的）', fx4.items.length === FX_CAP);

  const a = createFxState();
  const b = createFxState();
  const ev = { type: 'tribulation', plane: 'mortal', day: 42, x: 3, y: 4, subjectId: 9 };
  ingestRuntimeEvents(a, [ev], { plane: 'mortal' });
  ingestRuntimeEvents(b, [ev], { plane: 'mortal' });
  check('视觉抖动是确定性的（同事件同 seed，浏览器截图稳定）', a.items[0].seed === b.items[0].seed);

  let ops = 0;
  const stub = {
    save() {}, restore() {}, beginPath() {}, moveTo() {}, lineTo() {}, arc() {},
    stroke() { ops += 1; }, ellipse() { ops += 1; },
    strokeStyle: '', lineWidth: 0, lineCap: '', lineJoin: '',
  };
  const cam = makeCamera();
  cam.bind(fakeWorld50);
  const fx5 = createFxState();
  ingestRuntimeEvents(fx5, [
    { type: 'tribulation', plane: 'mortal', day: 1, x: 5, y: 5 },
    { type: 'tool-impact', plane: 'mortal', day: 1, x: 6, y: 6, data: { tool: 'meteor' } },
    { type: 'ascension', plane: 'mortal', day: 1, x: 7, y: 7 },
    { type: 'rift-open', plane: 'mortal', day: 1, x: 8, y: 8 },
    { type: 'possession', plane: 'mortal', day: 1, x: 9, y: 9 },
    { type: 'war-start', plane: 'mortal', day: 1, x: 10, y: 10, data: { ax: 2, ay: 2, bx: 12, by: 12 } },
  ], { plane: 'mortal' });
  updateFx(fx5, 0.1);
  drawFx(stub, cam, fakeWorld50, fx5);
  check('六类特效都能画出来（桩 ctx 记录到绘制调用）', ops > 0);
  check('drawFx 容忍空状态 / 空世界（不抛错）',
    (() => { drawFx(stub, cam, fakeWorld50, createFxState()); drawFx(stub, cam, null, fx5); return true; })());

  const fxSrc = fs.readFileSync(path.join(ROOT, 'src/inkbox/render/fxLayer.js'), 'utf8');
  check('fxLayer.js 不 import sim / world（表现不反向依赖模拟）',
    !/from\s+'\.\.\/(sim|world)\//.test(stripComments(fxSrc)));
  check('fxLayer.js 不 import rng 生成器（视觉抖动走确定性哈希）', !/mulberry32/.test(stripComments(fxSrc)));
}

// ── 7b. 多位面舞台 · Presentation Stage（D8-C）────────────────────
console.log('\n[7b] 多位面舞台 · Presentation Stage（D8-C）');
{
  const stageSrc = fs.readFileSync(path.join(ROOT, 'src/inkbox/render/presentationStage.js'), 'utf8');
  const stageCode = stripComments(stageSrc);

  check('舞台登记三个位面（mortal / upper / nether）',
    STAGE_PLANES.length === 3 && STAGE_PLANES.includes('mortal')
    && STAGE_PLANES.includes('upper') && STAGE_PLANES.includes('nether'));
  check('presentationStage.js 不 import sim/*（够不到模拟就改不了世界）',
    !/from\s+'\.\.\/(sim|world)\//.test(stageCode));
  check('presentationStage.js 不 import rng 生成器（不抽签）', !/mulberry32/.test(stageCode));
  check('舞台复用唯一的 fxLayer（不做三份 FX 类）', /from\s+'\.\/fxLayer\.js'/.test(stageCode));

  // 三界最小世界桩：各自一个事件队列（WeakMap 按 world 分队列），外加绘制所需的地形字段。
  const mkWorld = (plane) => ({
    plane, day: 5, w: 50, h: 50,
    height: new Float32Array(50 * 50), idx: (x, y) => y * 50 + x,
  });
  const root = mkWorld('mortal');
  root.upper = mkWorld('upper');
  root.nether = mkWorld('nether');

  // 计数桩 ctx：画一次记一次。
  const mkCountCtx = () => {
    let n = 0;
    const ctx = {
      save() {}, restore() {}, beginPath() {}, moveTo() {}, lineTo() {}, arc() {},
      stroke() { n += 1; }, ellipse() { n += 1; },
      strokeStyle: '', lineWidth: 0, lineCap: '', lineJoin: '',
    };
    return { ctx, count: () => n };
  };
  const cam = makeCamera();
  cam.bind(fakeWorld50);
  const draw = (st, plane) => {
    const { ctx, count } = mkCountCtx();
    st.drawPlane(plane, ctx, cam, fakeWorld50);
    return count();
  };

  emitPresentation(root, 'tribulation', { x: 5, y: 5, subjectId: 1 });
  emitPresentation(root.upper, 'ascension', { x: 6, y: 6, subjectId: 2 });
  emitPresentation(root.nether, 'possession', { x: 7, y: 7, subjectId: 3 });

  const stage = new PresentationStage();
  stage.ingestWorlds(root);
  check('一次 ingestWorlds 收齐三界事件（各归各的 plane，不串）',
    stage.fx.items.length === 3
    && stage.fx.items.filter((i) => i.plane === 'mortal').length === 1
    && stage.fx.items.filter((i) => i.plane === 'upper').length === 1
    && stage.fx.items.filter((i) => i.plane === 'nether').length === 1);
  check('drain 一次以后三界队列全空（transient，不攒着）',
    peekRuntimeEvents(root).length === 0
    && peekRuntimeEvents(root.upper).length === 0
    && peekRuntimeEvents(root.nether).length === 0);
  check('三界同时有事件：每界只画自己那一份（都 > 0）',
    draw(stage, 'mortal') > 0 && draw(stage, 'upper') > 0 && draw(stage, 'nether') > 0);

  // 隔离：只放一条 upper，凡间画布应当**一笔不画**。
  const onlyUpper = new PresentationStage();
  emitPresentation(root.upper, 'ascension', { x: 6, y: 6 });
  onlyUpper.ingestWorlds(root);
  check('上界事件不会被画到凡间画布', draw(onlyUpper, 'mortal') === 0);
  check('上界事件能被画到上界画布', draw(onlyUpper, 'upper') > 0);

  // 隔离：只放一条 nether，上界画布应当**一笔不画**。
  const onlyNether = new PresentationStage();
  emitPresentation(root.nether, 'possession', { x: 7, y: 7 });
  onlyNether.ingestWorlds(root);
  check('幽冥事件不会被画到上界画布', draw(onlyNether, 'upper') === 0);
  check('幽冥事件能被画到幽冥画布', draw(onlyNether, 'nether') > 0);

  // 真实秒：暂停世界时 FX 照播、倍速不改变它的实时时长。
  const s4 = new PresentationStage();
  emitPresentation(root, 'tribulation', { x: 1, y: 1 });
  s4.ingestWorlds(root);
  s4.update(0.3);
  check('update 走真实秒（0.3s → age 0.3，与游戏暂停 / 倍速无关）',
    Math.abs(s4.fx.items[0].age - 0.3) < 1e-9);
  check('舞台三方法都返回 this（可链式）',
    stage.update(0) === stage
    && stage.ingestWorlds(root) === stage
    && stage.drawPlane('mortal', mkCountCtx().ctx, cam, fakeWorld50) === stage);

  // 纯读：收事件 / 更新 FX 不改变世界（关视界时消费上界 / 幽冥事件也不改世界）。
  const w3 = generateWorld({ preset: WORLD_PRESETS.small, seed: 20260927 });
  w3.upper = generateUpperWorld({ preset: WORLD_PRESETS.small, seed: w3.seed });
  emitPresentation(w3, 'tribulation', { x: 3, y: 3 });
  emitPresentation(w3.upper, 'ascension', { x: 4, y: 4 });
  const before = JSON.stringify(serializeWorld(w3));
  const s6 = new PresentationStage();
  s6.ingestWorlds(w3).update(0.2);
  const after = JSON.stringify(serializeWorld(w3));
  check('关视界时上界 / 幽冥事件即使被消费也不得改变世界（收队列是纯读）', before === after);
  check('FX 状态不进存档（序列化产物里没有 fx / stage 键）',
    !('fx' in serializeWorld(w3)) && !('stage' in serializeWorld(w3)));

  // 接线：main.js 用舞台一帧收齐三界，不再自己写三遍 drain。
  const mainCode = stripComments(fs.readFileSync(path.join(ROOT, 'src/inkbox/main.js'), 'utf8'));
  check('main.js 不再自己 drainRuntimeEvents（收队列收进舞台）', !/drainRuntimeEvents\s*\(/.test(mainCode));
  check('main.js 在「暂停」判断之前就收齐三界（暂停照播）',
    mainCode.indexOf('ingestWorlds') >= 0
    && mainCode.indexOf('ingestWorlds') < mainCode.indexOf('const paused'));
  check('main.js 只把凡间那一份画在主画布（上界 / 幽冥交给视界窗）',
    /drawPlane\('mortal'/.test(mainCode) && /drawRealmView\(/.test(mainCode));
}

// ── 8. 事件接线：模拟侧真的发得出事件 ───────────────────────────
console.log('\n[8] 事件接线 · 开缝真的发得出 rift-open');
{
  const w = generateWorld({ preset: WORLD_PRESETS.small, seed: 20260914, scatter: true });
  w.upper = generateUpperWorld({ preset: WORLD_PRESETS.small, seed: w.seed });
  drainRuntimeEvents(w);
  const res = openRifts(w, { x0: 30, y0: 20, x1: 34, y1: 24 });
  const events = drainRuntimeEvents(w);
  check('openRifts 真的发出 rift-open 表现事件（接线成功，不是死代码）',
    res.opened > 0 && events.some((e) => e.type === 'rift-open'));
  check('事件带凡间位面与有限坐标',
    events.every((e) => e.plane === 'mortal' && Number.isFinite(e.x) && Number.isFinite(e.y)));
  check('drain 之后队列为空（transient，不攒着）', peekRuntimeEvents(w).length === 0);

  const before = JSON.stringify({ opened: w.riftLog.opened, rifts: w.rifts.length });
  drainRuntimeEvents(w);
  const after = JSON.stringify({ opened: w.riftLog.opened, rifts: w.rifts.length });
  check('读 / 抽事件不改变世界状态', before === after);
}

// ── 9. 发射口：吞掉坏参数但不连累模拟 ───────────────────────────
console.log('\n[9] 发射口 · emitPresentation 健壮性');
{
  const w = { plane: 'mortal', day: 5 };
  const ok = emitPresentation(w, 'tribulation', { x: 1, y: 2, subjectId: 3 });
  check('emitPresentation 正常发射并返回事件快照', !!ok && ok.type === 'tribulation' && ok.x === 1);
  check('emitPresentation 对坏类型 / 坏 payload / 空世界返回 null（不抛）',
    emitPresentation(w, 'no-such-type', { x: 1, y: 2 }) === null
    && emitPresentation(w, 'tribulation', { x: Number.NaN, y: 2 }) === null
    && emitPresentation(null, 'tribulation', {}) === null);
  drainRuntimeEvents(w);
}

// ── 10. 记挂：观察者状态（增删 / 状态机 / 上限 / 不扰动模拟）──────
console.log('\n[10] 记挂 · 观察者状态');
{
  // 最小世界桩：watch.js 只读 entities / dead / upper / watch / day（纯读，不写模拟）。
  const mkWorld = () => ({ plane: 'mortal', day: 100, entities: [], dead: [], watch: [] });
  const person = (id, name, level = 3) => ({ id, name, level, log: [] });

  const w = mkWorld();
  const zhang = person(5, '张三');
  w.entities.push(zhang);

  check('watchKeyOf 用凡间实体 id 造「这一世」的键（mortal:<id>）', watchKeyOf(zhang) === 'mortal:5');

  const r1 = addWatch(w, zhang, w.day);
  check('记挂一个人成功并进列表', r1.ok === true && w.watch.length === 1 && isWatched(w, zhang));
  check('记挂条目形状（key/name/addedDay/lastKnownPlane/lastKnownId/lastReadDay）',
    w.watch[0].key === 'mortal:5' && w.watch[0].name === '张三'
    && w.watch[0].addedDay === 100 && w.watch[0].lastKnownId === 5
    && w.watch[0].lastKnownPlane === 'mortal' && w.watch[0].lastReadDay === 100);
  check('同一个人不能重复加入', addWatch(w, zhang, w.day).reason === 'duplicate' && w.watch.length === 1);
  check('resolveWatch：在世', resolveWatch(w, w.watch[0]).state === 'alive');

  // 上限：满了拒绝新增，**不静默顶掉别人**
  const w2 = mkWorld();
  for (let i = 0; i < WATCH_CAP; i += 1) {
    const p = person(100 + i, `人${i}`);
    w2.entities.push(p);
    addWatch(w2, p, w2.day);
  }
  const extra = person(999, '溢出者');
  w2.entities.push(extra);
  check('到上限后拒绝新增（不静默顶掉别人）',
    w2.watch.length === WATCH_CAP && addWatch(w2, extra, w2.day).reason === 'full'
    && !isWatched(w2, extra));

  check('removeWatch 取关成功', removeWatch(w2, 'mortal:100') === true && w2.watch.length === WATCH_CAP - 1);
  check('取关一个不存在的键返回 false（不抛错）', removeWatch(w2, 'mortal:不存在') === false);

  const w3 = mkWorld();
  const li = person(7, '李四');
  w3.entities.push(li);
  const t1 = toggleWatch(w3, li, w3.day);
  const t2 = toggleWatch(w3, li, w3.day);
  check('toggleWatch 一开一关（★ → ☆）',
    t1.ok && t1.watched === true && t2.ok && t2.watched === false && w3.watch.length === 0);

  // 人死亡后**不丢**，状态转「故人」
  const w4 = mkWorld();
  const wang = person(9, '王五');
  w4.entities.push(wang);
  addWatch(w4, wang, 100);
  w4.entities.length = 0;                                   // 离世：移出 entities
  w4.dead.push({ id: 9, name: '王五', died: 360, level: 3, soulRoute: null });
  const dw = resolveWatch(w4, w4.watch[0]);
  check('人死了记挂不丢，状态转「故人 · 故于仙历 X 年」',
    w4.watch.length === 1 && dw.state === 'dead' && /故于仙历/.test(dw.label));

  // 人不存在（也没进名录）→ unknown，**不抛错、不按名字猜**
  const w5 = mkWorld();
  w5.watch.push({
    key: 'mortal:404', name: '查无此人', addedDay: 0,
    lastKnownPlane: 'mortal', lastKnownId: 404, lastReadDay: 0,
  });
  let threw = false;
  let rw = null;
  try { rw = resolveWatch(w5, w5.watch[0]); } catch { threw = true; }
  check('人不存在时不抛错，落回「已不可考」', !threw && rw && rw.state === 'unknown');

  // 飞升：可靠跨界引用来自 upper.arrivedLog[].fromKey（同 key 格式），**不靠名字**
  const w6 = mkWorld();
  const zhao = person(11, '赵六');
  w6.entities.push(zhao);
  addWatch(w6, zhao, 100);
  w6.entities.length = 0;
  w6.upper = {
    entities: [{ id: 1_000_011, name: '赵六', level: 20, age: 0 }],
    dead: [],
    arrivedLog: [{ day: 500, id: 1_000_011, fromKey: 'mortal:11', name: '赵六', level: 3 }],
  };
  const aw = resolveWatch(w6, w6.watch[0]);
  check('飞升后按 fromKey 命中「已入上界」（不靠名字猜）',
    aw.state === 'ascended' && aw.upperId === 1_000_011);

  // 红点：未读的重大事件
  const w7 = mkWorld();
  const sun = person(13, '孙七');
  sun.log = [];
  w7.entities.push(sun);
  addWatch(w7, sun, 100);
  check('新记挂、尚无大事 ⇒ 无红点', watchHasNews(w7) === false);
  sun.log.push({ day: 200, kind: 'breakthrough', text: '筑基' });
  check('记挂的人发生重大事件 ⇒ 红点亮', watchHasNews(w7) === true);
  markAllWatchRead(w7, 200);
  check('标为已读 ⇒ 红点灭', watchHasNews(w7) === false);

  // 纯观察者：记挂只写 watch，**不动世界其它字段**
  const w8 = mkWorld();
  const qian = person(15, '钱八');
  w8.entities.push(qian);
  const before8 = JSON.stringify({ day: w8.day, entities: w8.entities, dead: w8.dead });
  addWatch(w8, qian, w8.day);
  toggleWatch(w8, qian, w8.day);
  watchRows(w8);
  watchHasNews(w8);
  ensureWatch(w8);
  check('记挂 / 查询只写 watch，不改实体数量与实体对象（不进三界人口守恒）',
    w8.entities.length === 1 && JSON.stringify({ day: w8.day, entities: w8.entities, dead: w8.dead }) === before8);

  const watchSrc = stripComments(fs.readFileSync(path.join(ROOT, 'src/inkbox/sim/watch.js'), 'utf8'));
  check('watch.js 不 import rng 生成器（记挂不抽签、不改 RNG）', !/mulberry32/.test(watchSrc));
  check('watch.js 不 import 表现层 / DOM（观察者状态不反向依赖）',
    !/render\//.test(watchSrc) && !/document\./.test(watchSrc));
}

// ── 11. 记挂：存档接线（往返 / 老档为空 / 不泄漏到上界幽冥）────────
console.log('\n[11] 记挂 · 存档接线');
{
  const w = generateWorld({ preset: WORLD_PRESETS.small, seed: 20260914, scatter: true });
  w.upper = generateUpperWorld({ preset: WORLD_PRESETS.small, seed: w.seed });
  // watch 是**纯数据**（无 id 引用、元素是快照），所以直接塞一条合法条目即可，
  // 不必先造一个会走完整个序列化列契约的实体——那反而把「记挂存不存得住」
  // 和「实体行契约」两件事搅在一起。这里只测前者。
  ensureWatch(w).push({
    key: 'mortal:5', name: '张三', addedDay: 12,
    lastKnownPlane: 'mortal', lastKnownId: 5, lastReadDay: 12,
  });

  const payload = serializeWorld(w);
  check('serializeWorld 顶层写出 watch（世界级字段）',
    Array.isArray(payload.watch) && payload.watch.length === 1 && payload.watch[0].key === 'mortal:5');
  check('上界块不含 watch（凡间专属，serializeUpperWorld 里 delete）',
    !Object.prototype.hasOwnProperty.call(payload.upper || {}, 'watch'));

  const clone = deserializeWorld(JSON.parse(JSON.stringify(payload)));
  check('读档后记挂列表逐字段还原', JSON.stringify(clone.watch) === JSON.stringify(payload.watch));
  check('读档后上界 / 幽冥的 watch 恒空（未泄漏）',
    clone.upper.watch.length === 0 && clone.nether.watch.length === 0);

  const old = JSON.parse(JSON.stringify(payload));
  delete old.watch;
  const oldWorld = deserializeWorld(old);
  check('老档（无 watch 键）读回来是空数组（诚实缺省）',
    Array.isArray(oldWorld.watch) && oldWorld.watch.length === 0);
}

// ── 12. 人物局部关系图（D7-F）────────────────────────────────────
console.log('\n[12] 关系图 · 裁剪 / 布局 / SVG');
{
  const nb = (id, type, score, state = 'live') => ({ id, name: `人${id}`, type, score, state });

  // 裁剪：类型优先级 > |score|
  const many = [
    nb(1, 'gratitude', 90), nb(2, 'rival', 10), nb(3, 'lover', 5),
    nb(4, 'kin', 40), nb(5, 'peer', 99), nb(6, 'mentor', 3),
    nb(7, 'enmity', 20), nb(8, 'comrade', 80), nb(9, 'former_mentor', 70),
    nb(10, 'disciple', 8), nb(11, 'benefactor', 60), nb(12, 'peer', 1),
  ];
  const picked = pickNeighbors(many, 6);
  check('pickNeighbors 先按类型优先级再按 |score|，取前 max 个',
    picked.length === 6
    && picked.map((n) => n.type).join(',') === 'lover,mentor,disciple,rival,enmity,kin');
  check('RELATION_GRAPH_MAX 是 10（外圈不画太多，避免蜘蛛网）', RELATION_GRAPH_MAX === 10);
  check('pickNeighbors 容忍空 / 非数组', pickNeighbors(null).length === 0 && pickNeighbors([]).length === 0);

  const g = buildRelationGraph({ id: 0, name: '中心' }, [nb(1, 'lover', 5), nb(2, 'rival', -3)], { size: 200 });
  check('buildRelationGraph：节点数 = 邻居数，边数 = 节点数',
    g.nodes.length === 2 && g.edges.length === 2 && g.size === 200);
  check('外圈节点落在以中心为圆心的圆上（半径 = size/2 - 34）',
    g.nodes.every((n) => Math.abs(Math.hypot(n.x - g.cx, n.y - g.cy) - g.r) < 1e-6));
  check('第一个邻居落在正上方（-90°）',
    Math.abs(g.nodes[0].x - g.cx) < 1e-6 && g.nodes[0].y < g.cy);

  const svg = relationGraphSvg({ id: 0, name: '张三' }, [nb(1, 'lover', 5), nb(2, 'enmity', -3, 'dead')], {});
  check('relationGraphSvg 产出合法 SVG（含 svg 根与中心名）',
    /^<svg /.test(svg) && svg.includes('</svg>') && svg.includes('张三'));
  check('每个邻居都带名字 + 关系标签（道侣 / 仇怨）',
    svg.includes('人1·道侣') && svg.includes('人2·仇怨'));
  check('外圈节点带 data-goto / data-state（供点击导航）',
    svg.includes('data-goto="1"') && svg.includes('data-state="dead"'));
  check('已死亡关系画淡线（低透明度 + 淡描边）', svg.includes('stroke-opacity="0.28"'));

  const empty = relationGraphSvg({ id: 0, name: '孤家' }, [], {});
  check('无关系时给一句「尚无已知的人际关系」而不是空白',
    empty.includes('尚无已知的人际关系'));

  const rgSrc = stripComments(fs.readFileSync(path.join(ROOT, 'src/inkbox/render/relationGraph.js'), 'utf8'));
  check('relationGraph.js 零 import（纯几何 + 纯 SVG，不反向依赖模拟）',
    !/^\s*import\b/m.test(rgSrc));
  check('relationGraph.js 不抽 RNG（同输入同输出）', !/mulberry32|Math\.random/.test(rgSrc));
}

// ── 13. 活跃战争线（D7-F）────────────────────────────────────────
console.log('\n[13] 战争线 · 开关 / 过滤 / 结束即消失');
{
  const warWorld = {
    w: 50, h: 50, height: new Float32Array(50 * 50), idx: (x, y) => y * 50 + x,
    factions: [
      { id: 10, capitalX: 10, capitalY: 10 },
      { id: 20, capitalX: 30, capitalY: 30 },
      { id: 30, capitalX: 40, capitalY: 40 },
    ],
    wars: [
      { id: 1, phase: 'mobilizing', sideA: [10], sideB: [20], x: 10, y: 10 },
      { id: 2, phase: 'ended', sideA: [10], sideB: [30], x: 5, y: 5 },
      { id: 3, phase: 'mobilizing', sideA: [999], sideB: [20], x: 5, y: 5 },  // 缺 A 方势力
    ],
  };
  const cam = makeCamera();
  cam.bind(warWorld);
  const ops = { moveTo: 0, lineTo: 0, arc: 0, stroke: 0 };
  const stub = {
    save() {}, restore() {}, beginPath() {}, setLineDash() {},
    moveTo() { ops.moveTo += 1; }, lineTo() { ops.lineTo += 1; },
    arc() { ops.arc += 1; }, stroke() { ops.stroke += 1; },
    fill() {}, strokeStyle: '', fillStyle: '', lineWidth: 0, lineCap: '', lineJoin: '',
  };

  check('默认（不传 activeSectId / showAll）一条都不画',
    drawWarLines(stub, cam, warWorld, {}) === 0);
  check('showAll 只画「未结束」且双方势力都在的战事',
    drawWarLines(stub, cam, warWorld, { showAll: true }) === 1);
  check('activeSectId 只画跟它有关的战事（10 / 20 各 1 条）',
    drawWarLines(stub, cam, warWorld, { activeSectId: 10 }) === 1
    && drawWarLines(stub, cam, warWorld, { activeSectId: 20 }) === 1);
  check('战争结束（phase=ended）立即消失（30 只出现在已结束的战事里 ⇒ 0）',
    drawWarLines(stub, cam, warWorld, { activeSectId: 30 }) === 0);
  check('无关宗门 / 不存在的 id ⇒ 0', drawWarLines(stub, cam, warWorld, { activeSectId: 77 }) === 0);
  check('画了线（桩 ctx 记录到 moveTo / lineTo / arc）', ops.moveTo > 0 && ops.lineTo > 0 && ops.arc > 0);
  check('drawWarLines 容忍空世界 / 空 ctx（不抛错）',
    drawWarLines(stub, cam, null, { showAll: true }) === 0
    && drawWarLines(null, cam, warWorld, { showAll: true }) === 0);

  // 确定性：同 pulse 同读数（截图稳定）
  const a = drawWarLines(stub, cam, warWorld, { showAll: true, pulse: 1.25 });
  const b = drawWarLines(stub, cam, warWorld, { showAll: true, pulse: 1.25 });
  check('同 pulse 下画出的条数一致（呼吸走确定性相位，不抽 RNG）', a === b && a === 1);
}

// ── 14. 跨界动作「在两边发生」· emitRiftCross（D8-E）─────────────
console.log('\n[14] 跨界动作 · emitRiftCross（D8-E）');
{
  // ① 形状：一次跨界发**两条**事件（离开端 + 到达端），各带正确 plane 与锚点。
  const w = { plane: 'mortal', day: 123 };
  const out = emitRiftCross(w, {
    kind: 'person', fromPlane: 'mortal', toPlane: 'nether',
    fromX: 10, fromY: 20, toX: 30, toY: 40,
    fromKey: 'mortal:777', subjectId: 777, targetId: 2000001,
  });
  check('一次跨界发两条事件（离开端 + 到达端）', out.length === 2);
  const evs = peekRuntimeEvents(w);
  check('两条事件都是 rift-cross 类型', evs.length === 2 && evs.every((e) => e.type === 'rift-cross'));
  const depart = evs.find((e) => e.data && e.data.phase === 'depart');
  const arrive = evs.find((e) => e.data && e.data.phase === 'arrive');
  check('离开端画在**源**位面、锚点是离开端坐标',
    !!depart && depart.plane === 'mortal' && depart.x === 10 && depart.y === 20);
  check('到达端画在**目标**位面、锚点是到达端坐标',
    !!arrive && arrive.plane === 'nether' && arrive.x === 30 && arrive.y === 40);
  check('data 带齐统一形状（kind / fromPlane / toPlane / 两端坐标 / fromKey）',
    !!depart && depart.data.kind === 'person'
    && depart.data.fromPlane === 'mortal' && depart.data.toPlane === 'nether'
    && depart.data.fromX === 10 && depart.data.fromY === 20
    && depart.data.toX === 30 && depart.data.toY === 40
    && depart.data.fromKey === 'mortal:777');
  check('主体 / 目标 id 透传到事件顶层（FX 视觉种子用）',
    !!arrive && arrive.subjectId === 777 && arrive.targetId === 2000001);
  check('KINDS / PHASES 是冻结的取值表（形状单一真源）',
    Object.isFrozen(RIFT_CROSS_KINDS) && RIFT_CROSS_KINDS.includes('possession')
    && RIFT_CROSS_PHASES.length === 2 && RIFT_CROSS_PHASES.includes('depart'));

  // ② sides：只发一端（夺舍用 'depart'，因为到达端已有 D7 的 'possession'）。
  const wd = { plane: 'mortal', day: 5 };
  emitRiftCross(wd, {
    kind: 'possession', fromPlane: 'nether', toPlane: 'mortal',
    fromX: 1, fromY: 1, toX: 2, toY: 2, sides: 'depart',
  });
  const dep = peekRuntimeEvents(wd);
  check('sides:"depart" 只发离开端一条（夺舍不叠两套 FX）',
    dep.length === 1 && dep[0].plane === 'nether' && dep[0].data.phase === 'depart');
  const wa = { plane: 'mortal', day: 5 };
  emitRiftCross(wa, {
    kind: 'ghost', fromPlane: 'nether', toPlane: 'mortal',
    fromX: 1, fromY: 1, toX: 2, toY: 2, sides: 'arrive',
  });
  const arv = peekRuntimeEvents(wa);
  check('sides:"arrive" 只发到达端一条', arv.length === 1 && arv[0].plane === 'mortal');

  // ③ 健壮性：非法参数**静默不发射**（返回空数组、不抛）——它埋在各转移函数的
  //    成功路径上，一个表现层参数错误绝不能连累模拟。
  const wk = { plane: 'mortal', day: 1 };
  const bad = [
    emitRiftCross(null, { kind: 'person', fromPlane: 'mortal', toPlane: 'upper', fromX: 0, fromY: 0, toX: 1, toY: 1 }),
    emitRiftCross(wk, { kind: 'nope', fromPlane: 'mortal', toPlane: 'upper', fromX: 0, fromY: 0, toX: 1, toY: 1 }),
    emitRiftCross(wk, { kind: 'person', fromPlane: 'mortal', toPlane: 'mortal', fromX: 0, fromY: 0, toX: 1, toY: 1 }),
    emitRiftCross(wk, { kind: 'person', fromPlane: 'mortal', toPlane: 'upper', fromX: Number.NaN, fromY: 0, toX: 1, toY: 1 }),
    emitRiftCross(wk, { kind: 'person', fromPlane: 'mortal', toPlane: 'void', fromX: 0, fromY: 0, toX: 1, toY: 1 }),
    emitRiftCross(wk, { kind: 'person', fromPlane: 'mortal', toPlane: 'upper', fromX: 0, fromY: 0, toX: 1, toY: 1, sides: 'sideways' }),
  ];
  check('非法参数（坏 kind / 同位面 / NaN 坐标 / 坏 sides / 空世界）⇒ 全部空数组、不抛',
    bad.every((r) => Array.isArray(r) && r.length === 0));
  check('非法发射**不进队列**（不污染别的位面的事件流）', peekRuntimeEvents(wk).length === 0);

  // ④ 发射**不改世界**（表现层铁律；「不抽 RNG」在 ⑥ 用源码结构钉）。
  const pureWorld = { plane: 'mortal', day: 3, marker: 'untouched' };
  const before = JSON.stringify(pureWorld);
  emitRiftCross(pureWorld, {
    kind: 'artifact', fromPlane: 'upper', toPlane: 'mortal',
    fromX: 5, fromY: 5, toX: 6, toY: 6, fromKey: 'upper:artifact:1',
  });
  check('发射不改世界任何字段（逐字节快照不变）', JSON.stringify(pureWorld) === before);

  // ⑤ 有向 FX：离开端「墨影向裂隙收缩」= 线段（moveTo/lineTo）；
  //    到达端「墨点向外散开」= 圆环 + 散点（ellipse/arc）。两端的画法**不同**，
  //    这正是「两边都在发生」在画面上的兑现。
  const mkStub = () => {
    const ops = { moveTo: 0, lineTo: 0, ellipse: 0, arc: 0, stroke: 0 };
    const ctx = {
      save() {}, restore() {}, beginPath() {},
      moveTo() { ops.moveTo += 1; }, lineTo() { ops.lineTo += 1; },
      arc() { ops.arc += 1; }, ellipse() { ops.ellipse += 1; },
      stroke() { ops.stroke += 1; },
      strokeStyle: '', lineWidth: 0, lineCap: '', lineJoin: '',
    };
    return { ctx, ops };
  };
  const cam2 = makeCamera();
  cam2.bind(fakeWorld50);
  const mkFx = (phase) => {
    const fx = createFxState();
    ingestRuntimeEvents(fx, [{
      type: 'rift-cross', plane: 'mortal', day: 1, x: 5, y: 5, subjectId: 7,
      data: { kind: 'ghost', fromPlane: 'nether', toPlane: 'mortal', phase, fromX: 4, fromY: 4, toX: 5, toY: 5, fromKey: 'nether:7' },
    }], { plane: 'mortal' });
    updateFx(fx, 0.15);
    return fx;
  };
  const sd = mkStub(); drawFx(sd.ctx, cam2, fakeWorld50, mkFx('depart'));
  const sa = mkStub(); drawFx(sa.ctx, cam2, fakeWorld50, mkFx('arrive'));
  check('离开端画的是**收缩线段**（moveTo/lineTo > 0）', sd.ops.moveTo > 0 && sd.ops.lineTo > 0);
  check('到达端画的是**向外散点**（ellipse/arc > 0）', sa.ops.ellipse > 0 && sa.ops.arc > 0);
  check('两端画法**不同**（离开端不画散点环、到达端不画收缩段）',
    sd.ops.ellipse === 0 && sd.ops.arc === 0 && sa.ops.moveTo === 0 && sa.ops.lineTo === 0);
  // 无 phase 的旧形状退回通用冲击环（不改变老事件的表现）。
  const so = mkStub();
  const fxOld = createFxState();
  ingestRuntimeEvents(fxOld, [{ type: 'rift-cross', plane: 'mortal', day: 1, x: 5, y: 5 }], { plane: 'mortal' });
  updateFx(fxOld, 0.15);
  drawFx(so.ctx, cam2, fakeWorld50, fxOld);
  check('无 phase 的旧 rift-cross 退回通用冲击环（ellipse，不抛）',
    so.ops.ellipse > 0 && so.ops.moveTo === 0);
  // 确定性：同事件两次画出的调用序列一致（截图稳定）。
  const d1 = mkStub(); drawFx(d1.ctx, cam2, fakeWorld50, mkFx('arrive'));
  const d2 = mkStub(); drawFx(d2.ctx, cam2, fakeWorld50, mkFx('arrive'));
  check('到达端 FX 确定性（同事件同调用次数，零 RNG）',
    d1.ops.ellipse === d2.ops.ellipse && d1.ops.arc === d2.ops.arc);

  // ⑥ 源码结构：六类跨界的成功点**都**接上了 `emitRiftCross`。
  //    什么故障让它变红：新加一条跨界通道却忘了发事件（玩家看不见），
  //    或把发射点从 `rifts.js` / `possession.js` 挪走（那两处是唯一真相）。
  const riftsCode = stripComments(fs.readFileSync(path.join(ROOT, 'src/inkbox/sim/rifts.js'), 'utf8'));
  const possCode = stripComments(fs.readFileSync(path.join(ROOT, 'src/inkbox/sim/possession.js'), 'utf8'));
  const presCode = stripComments(fs.readFileSync(path.join(ROOT, 'src/inkbox/sim/presentation.js'), 'utf8'));
  const riftsSites = (riftsCode.match(/emitRiftCross\s*\(/g) || []).length;
  const possSites = (possCode.match(/emitRiftCross\s*\(/g) || []).length;
  check('`emitRiftCross` 的**形状只定义一次**（在 presentation.js 里 export）',
    /export function emitRiftCross/.test(presCode));
  check('`rifts.js` 的跨界成功点接了 emitRiftCross（≥7 处：7 类转移）',
    riftsSites >= 7, `实测 ${riftsSites} 处`);
  check('`possession.js` 的夺舍 / 附身两处都接了 emitRiftCross（≥2 处）',
    possSites >= 2, `实测 ${possSites} 处`);
  check('发射口不抽 RNG（无 rng() / Math.random）',
    !/\brng\s*\(/.test(presCode) && !/Math\.random/.test(presCode));
  check('`emitRiftCross` 只往队列推事件（函数体里调 emitPresentation）',
    fnBodyOfCode(presCode, 'emitRiftCross').includes('emitPresentation('));
}

console.log('\n══════════════════════════════════════════════════════════════');
console.log(failed === 0
  ? `全部通过 · ${checks} 项断言`
  : `${failed} 项未通过 · 共 ${checks} 项断言`);
console.log('══════════════════════════════════════════════════════════════');
process.exit(failed === 0 ? 0 : 1);
