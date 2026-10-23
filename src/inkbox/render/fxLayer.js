// Inkbox FX 表现层 · D7-D
//
// 职责单一：**读** `core/runtimeEvents.js` 的 transient 事件，把它们变成
// 一段段短命的 render effect，画在地图上。它**不产生**事件（那是模拟侧的事），
// 也**不写**任何世界状态。
//
// ── 三条铁律（与整个 D7 表现层一致）──────────────────────────
//   1. **纯表现**：删掉整个文件，游戏模拟结果逐字不变。不写世界、不进存档。
//   2. **不抽模拟 RNG**：需要随机折线 / 抖动时，走本文件内的 `visualHash`
//      （确定性视觉哈希，由 `type + day + x + y + subjectId` 派生）。
//      这样同一件事每次画出来一样，浏览器截图也稳定。
//   3. **真实时间**：`updateFx(fx, dt)` 的 dt 是秒。**暂停世界时特效照常播完**，
//      因为它是显示动画，不是模拟时间；拉到「飞」速也不会缩成一帧。
//
// ⚠️ **plane-aware（D8-C）**：FX 项自带 `plane`（来自事件），`drawFx(..., plane)`
//    只画**指定位面**那一份——一个系统按位面过滤，**不是三份 FX 类**。
//    没有坐标的事件（x/y 缺失）跳过不画。
//    （D7 时这里只演凡间；D8-C 起上界 / 幽冥的事件也会入队，由 `presentationStage.js`
//     统一收齐、再分发给主画布与视界窗。）

/** Total visual budget. Major events evict combat first; combat cannot evict major events. */
export const FX_CAP = 64;
export const COMBAT_FX_CAP = 32;
export const COMBAT_FX_PLANE_CAP = 16;
export const BREAKTHROUGH_FX_CAP = 16;
const COMBAT_TTL = Object.freeze({ blade: 0.65, fire: 0.8, thunder: 0.9 });

/** 各事件类型的默认时长（秒）。 */
const FX_TTL = Object.freeze({
  lightning: 0.7,
  meteor: 1.1,
  ascension: 1.2,
  rift: 0.9,
  possession: 0.9,
  war: 1.1,
  impact: 0.6,
  riftcross: 0.7,
  death: 0.9,
  sectfall: 1.0,
  breakthrough: 1.4,
  power: 3.0,
});

/** runtime event type → fx kind（只有列出的类型会被演出）。 */
const EVENT_TO_FX = Object.freeze({
  'combat-hit': 'combat',
  tribulation: 'lightning',
  breakthrough: 'breakthrough',
  ascension: 'ascension',
  'rift-open': 'rift',
  'rift-cross': 'riftcross',
  possession: 'possession',
  'war-start': 'war',
  'major-death': 'death',
  'sect-fall': 'sectfall',
  'tool-impact': 'impact',   // 具体是不是陨石由 payload.data.tool 决定（见 ingest）
});

export function createFxState() {
  return { items: [], combatReceived: 0, combatAccepted: 0, combatMerged: 0, combatDropped: 0, combatEvicted: 0 };
}

/** Isolated counters for budgeting and diagnostics; not simulation state. */
export function fxStats(fx) {
  const items = fx?.items || [], byPlane = {}, combatByPlane = {};
  for (const plane of ['mortal', 'upper', 'nether']) {
    byPlane[plane] = items.filter(item => item.plane === plane).length;
    combatByPlane[plane] = items.filter(item => item.plane === plane && item.kind === 'combat').length;
  }
  return Object.freeze({ active: items.length, combatActive: items.filter(item => item.kind === 'combat').length,
    byPlane: Object.freeze(byPlane), combatByPlane: Object.freeze(combatByPlane),
    capacity: FX_CAP, combatCapacity: COMBAT_FX_CAP, combatPlaneCapacity: COMBAT_FX_PLANE_CAP,
    combatReceived: fx?.combatReceived || 0, combatAccepted: fx?.combatAccepted || 0,
    combatMerged: fx?.combatMerged || 0, combatDropped: fx?.combatDropped || 0, combatEvicted: fx?.combatEvicted || 0 });
}
function validCombat(event) {
  const ignition = event.data?.ignition;
  const validIgnition = ignition === undefined || (ignition && Object.keys(ignition).length === 7
    && Number.isSafeInteger(ignition.cells) && ignition.cells > 0
    && Number.isSafeInteger(ignition.x) && ignition.x >= 0
    && Number.isSafeInteger(ignition.y) && ignition.y >= 0
    && ignition.plane === event.plane && ignition.day === event.day
    && ignition.actorId === event.subjectId && ignition.targetId === event.targetId);
  return ['mortal', 'upper', 'nether'].includes(event.plane) && Number.isFinite(event.day)
    && Number.isSafeInteger(event.subjectId) && event.subjectId > 0
    && Number.isSafeInteger(event.targetId) && event.targetId > 0 && event.subjectId !== event.targetId
    && Number.isFinite(event.intensity) && Number.isFinite(event.data?.fromX) && Number.isFinite(event.data?.fromY)
    && Object.hasOwn(COMBAT_TTL, event.data?.style) && ['low', 'mid', 'high'].includes(event.data?.tier)
    && validIgnition;
}
function admitFx(fx, item) {
  const combat = item.kind === 'combat';
  if (item.kind === 'breakthrough') {
    const active = fx.items.filter(existing => existing.kind === 'breakthrough');
    if (active.length >= BREAKTHROUGH_FX_CAP) {
      const replace = item.data.major ? fx.items.findIndex(existing => existing.kind === 'breakthrough' && !existing.data.major) : -1;
      if (replace < 0) return;
      fx.items.splice(replace, 1);
    }
    if (fx.items.length >= FX_CAP) {
      const replace = fx.items.findIndex(existing => existing.kind === 'combat' || existing.kind === 'breakthrough' && !existing.data.major);
      if (replace < 0) return;
      if (fx.items[replace].kind === 'combat') fx.combatEvicted = (fx.combatEvicted || 0) + 1;
      fx.items.splice(replace, 1);
    }
    fx.items.push(item);
    return;
  }
  if (combat) {
    fx.combatReceived = (fx.combatReceived || 0) + 1;
    const match = fx.items.find(existing => existing.kind === 'combat' && existing.plane === item.plane
      && existing.subjectId === item.subjectId && existing.targetId === item.targetId && existing.data.style === item.data.style);
    if (match) {
      // Refresh one existing short-lived feedback instead of stacking marks for the same pair.
      Object.assign(match, item); fx.combatMerged = (fx.combatMerged || 0) + 1; return;
    }
    const count = fx.items.filter(existing => existing.kind === 'combat');
    if (count.length >= COMBAT_FX_CAP || count.filter(existing => existing.plane === item.plane).length >= COMBAT_FX_PLANE_CAP || fx.items.length >= FX_CAP) {
      fx.combatDropped = (fx.combatDropped || 0) + 1; return;
    }
  } else if (fx.items.length >= FX_CAP) {
    const combatIndex = fx.items.findIndex(existing => existing.kind === 'combat');
    if (combatIndex >= 0) { fx.items.splice(combatIndex, 1); fx.combatEvicted = (fx.combatEvicted || 0) + 1; }
    else fx.items.shift(); // Preserve the existing oldest-first major-event behavior.
  }
  fx.items.push(item);
  if (combat) fx.combatAccepted = (fx.combatAccepted || 0) + 1;
}
/**
 * 确定性视觉哈希：FNV-1a 之后再过一次 murmur3 finalizer，返回 [0,1)。
 * ⚠️ 直接用 FNV-1a 的高位当均匀数会有偏置（见项目故障类「哈希当均匀分布用」），
 *    所以**必须**过 finalizer。这里只用于抖动，不影响任何模拟。
 */
function visualHash(...parts) {
  let h = 2166136261;
  const text = parts.join('|');
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 2246822507);
  h ^= h >>> 13;
  h = Math.imul(h, 3266489909);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/**
 * 把一批 runtime events 转成 fx 项，追加进 `fx.items`。
 * @param {object} fx `createFxState()` 的产物
 * @param {Array} events `drainRuntimeEvents()` 的产物（或任何同形状数组）
 * @param {object} [world] 仅用于兜底取位面；事件自带的 plane 优先
 */
export function ingestRuntimeEvents(fx, events, world) {
  if (!fx || !Array.isArray(fx.items) || !Array.isArray(events) || !events.length) return fx;
  for (let i = 0; i < events.length; i += 1) {
    const event = events[i];
    if (!event || typeof event !== 'object') continue;
    const plane = event.plane || world?.plane || 'mortal';
    if (!Number.isFinite(event.x) || !Number.isFinite(event.y)) continue;  // 没坐标不画

    let kind = EVENT_TO_FX[event.type];
    // Formal, successful powers and actual local water responses share one
    // presentation path. Historical tool-impact events retain their old kind.
    if (event.type === 'tool-impact') {
      kind = event.data?.power === true || event.data?.tool === 'water-response'
        ? 'power' : event.data?.tool === 'meteor' ? 'meteor' : 'impact';
    }
    if (!kind) continue;

    if (kind === 'combat' && !validCombat(event)) continue;
    if (kind === 'breakthrough' && (!event.data || !['success','failure'].includes(event.data.outcome)
      || typeof event.data.major !== 'boolean' || !Number.isSafeInteger(event.data.fromLevel)
      || !Number.isSafeInteger(event.data.toLevel))) continue;
    const ttl = kind === 'power' ? ({ lightning: 2.5, meteor: 3.4, quake: 3.2,
      flood: 3.8, 'water-response': 2.8, root: 3.3, forest: 3.4,
      rain: 3.2, leyline: 3.7 }[event.data?.tool] ?? FX_TTL.power)
      : kind === 'combat' ? COMBAT_TTL[event.data.style]
      : kind === 'breakthrough' ? event.data.major ? 2.4 : 1.1 : FX_TTL[kind] ?? 0.8;
    const seed = visualHash(event.type, event.day ?? 0, event.x, event.y, event.subjectId ?? 0);
    const item = {
      plane,
      kind,
      day: Number.isFinite(event.day) ? event.day : null,
      x: event.x,
      y: event.y,
      ttl,
      age: 0,
      seed,
      data: kind === 'combat' ? { style: event.data.style, fromX: event.data.fromX, fromY: event.data.fromY,
        tier: event.data.tier, ...(event.data.ignition ? { ignition: { ...event.data.ignition } } : {}) } : event.data || null,
      intensity: kind === 'combat' ? Math.max(0.2, Math.min(1, event.intensity)) : event.intensity ?? null,
      subjectId: event.subjectId ?? null,
      targetId: event.targetId ?? null,
    };
    admitFx(fx, item);
  }

  return fx;
}

/** 推进所有 FX 的寿命（秒），移除过期的。零 RNG。 */
export function updateFx(fx, dt) {
  if (!fx || !Array.isArray(fx.items) || !fx.items.length) return fx;
  const step = Number.isFinite(dt) && dt > 0 ? dt : 0;
  for (let i = fx.items.length - 1; i >= 0; i -= 1) {
    fx.items[i].age += step;
    if (fx.items[i].age >= fx.items[i].ttl) fx.items.splice(i, 1);
  }
  return fx;
}

function project(camera, world, x, y) {
  const cx = Math.max(0, Math.min(world.w - 1, Math.round(x)));
  const cy = Math.max(0, Math.min(world.h - 1, Math.round(y)));
  return camera.tileScreen(x, y, world.height[world.idx(cx, cy)]);
}

const INK_STROKE = '34,32,28';
const COLD_STROKE = '60,78,96';

/**
 * 画**指定一位面**的 FX（D8-C）。
 * @param {string} [plane='mortal'] 只画 `item.plane === plane` 的那些。
 *   默认 `'mortal'`：主画布那条老调用路径不变；视界窗内传 `'upper'` / `'nether'`。
 */
export function drawFx(ctx, camera, world, fx, plane = 'mortal') {
  if (!fx || !Array.isArray(fx.items) || !fx.items.length || !world || !ctx) return;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (let i = 0; i < fx.items.length; i += 1) {
    const item = fx.items[i];
    if (camera.canAccess && !camera.canAccess(item.x, item.y)) continue;
    if (item.plane !== plane) continue;   // 只画这一界（三界不串）
    const k = item.ttl > 0 ? Math.min(1, item.age / item.ttl) : 1;
    const zoom = camera.zoom;
    switch (item.kind) {
      case 'combat': drawCombat(ctx, camera, world, item, k, zoom); break;
      case 'lightning': drawLightning(ctx, camera, world, item, k, zoom); break;
      case 'breakthrough': drawBreakthrough(ctx, camera, world, item, k, zoom); break;
      case 'meteor': drawMeteor(ctx, camera, world, item, k, zoom); break;
      case 'ascension': drawAscension(ctx, camera, world, item, k, zoom); break;
      case 'rift': drawRiftCrack(ctx, camera, world, item, k, zoom); break;
      case 'possession': drawPossession(ctx, camera, world, item, k, zoom); break;
      case 'war': drawWarLine(ctx, camera, world, item, k, zoom); break;
      case 'sectfall': drawImpactRing(ctx, camera, world, item, k, zoom, 0.55, 0.85); break;
      case 'death': drawImpactRing(ctx, camera, world, item, k, zoom, 0.32, 0.6); break;
      case 'riftcross': drawRiftCross(ctx, camera, world, item, k, zoom); break;
      case 'impact':
      case 'power':
      default: drawImpactRing(ctx, camera, world, item, k, zoom, 0.42, 0.7); break;
    }
  }
  ctx.restore();
}

// Entity coordinates are already world XY, unlike the tile-centered major effects.
function projectEntity(camera, world, x, y) {
  const cx = Math.max(0, Math.min(world.w - 1, Math.floor(x))), cy = Math.max(0, Math.min(world.h - 1, Math.floor(y)));
  return camera.tileScreen(x, y, world.height[world.idx(cx, cy)]);
}
function drawBreakthrough(ctx, camera, world, item, k, zoom) {
  const major = item.data.major, success = item.data.outcome === 'success';
  const reach = major ? 1.3 : 0.55;
  if (item.x < reach || item.y < reach || item.x + reach >= world.w || item.y + reach >= world.h) return;
  // The whole mark must be visible to the active realm/access mask.
  if (camera.canAccess) for (const [dx, dy] of [[-reach,0],[reach,0],[0,-reach],[0,reach],[-reach,-reach],[reach,-reach],[-reach,reach],[reach,reach]]) {
    if (!camera.canAccess(item.x + dx, item.y + dy)) return;
  }
  const [tx, ty] = projectEntity(camera, world, item.x, item.y);
  if (![tx, ty].every(Number.isFinite)) return;
  const radius = major ? Math.max(10, Math.min(28, zoom * 3.5)) : Math.max(3, Math.min(9, zoom * 1.1));
  const width = camera.viewW ?? ctx.canvas?.width, height = camera.viewH ?? ctx.canvas?.height;
  if (Number.isFinite(width) && Number.isFinite(height)
    && (tx + radius < 0 || tx - radius > width || ty + radius < 0 || ty - radius > height)) return;
  const fade = Math.max(0, 1 - k);
  const stroke = success ? major ? '191,163,94' : '105,147,145' : '109,47,43';
  const base = success ? radius * (0.4 + k * 0.55) : radius * (1 - k * 0.65);
  ctx.strokeStyle = `rgba(${stroke},${(fade * (major ? .88 : .7)).toFixed(3)})`;
  ctx.lineWidth = major ? Math.max(1.4, Math.min(2.8, zoom * .34)) : 1.1;
  const rings = major ? 3 : 1;
  for (let i = 0; i < rings; i++) {
    const r = Math.max(2, base * (1 - i * .22));
    ctx.beginPath(); ctx.ellipse(tx, ty, r, r * .68, item.seed * .35, 0, Math.PI * 2); ctx.stroke();
  }
  // Short qi gathering and broken ink follow the same settled outcome as the seal.
  const surge = Math.sin(Math.PI * Math.min(1, k * 1.2));
  const strokeHeight = radius * (major ? 1.15 : .8) * surge;
  ctx.lineWidth = major ? Math.max(1.2, zoom * .3) : 1;
  for (let i = 0; i < (major ? 7 : 3); i++) {
    const a = i * Math.PI * 2 / (major ? 7 : 3) + item.seed;
    const ox = Math.cos(a) * radius * (major ? .28 : .22);
    const oy = Math.sin(a) * radius * .2;
    ctx.beginPath();
    ctx.moveTo(tx + ox, ty + oy);
    ctx.lineTo(tx + ox + (success ? 0 : ox * .55), ty + oy - (success ? strokeHeight * (.6 + i % 3 * .2) : strokeHeight * .38));
    ctx.stroke();
  }
  if (!major) return;
  // A finite array of short ink strokes makes a major success/failure legible at default zoom.
  ctx.strokeStyle = `rgba(${success ? '214,194,134' : '71,37,36'},${(fade * .72).toFixed(3)})`;
  ctx.lineWidth = Math.max(1, Math.min(2, zoom * .25));
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4 + item.seed * .5;
    const inner = success ? radius * .58 : radius * .3;
    const outer = success ? radius * (1 + visualHash(item.seed, i, 'breakthrough') * .2) : radius * .78;
    ctx.beginPath();
    ctx.moveTo(tx + Math.cos(a) * inner, ty + Math.sin(a) * inner * .68);
    ctx.lineTo(tx + Math.cos(a) * outer, ty + Math.sin(a) * outer * .68);
    ctx.stroke();
  }
}
function drawCombat(ctx, camera, world, item, k, zoom) {
  const d = item.data;
  if (camera.canAccess && !camera.canAccess(d.fromX, d.fromY)) return;
  if (![item.x, item.y, d.fromX, d.fromY].every(Number.isFinite)
    || item.x < 0 || item.y < 0 || item.x >= world.w || item.y >= world.h
    || d.fromX < 0 || d.fromY < 0 || d.fromX >= world.w || d.fromY >= world.h) return;
  const [sx, sy] = projectEntity(camera, world, d.fromX, d.fromY), [tx, ty] = projectEntity(camera, world, item.x, item.y);
  if (![sx, sy, tx, ty].every(Number.isFinite)) return;
  const width = camera.viewW ?? ctx.canvas?.width, height = camera.viewH ?? ctx.canvas?.height;
  const margin = 12;
  if (Number.isFinite(width) && Number.isFinite(height)
    && (Math.max(sx, tx) < -margin || Math.min(sx, tx) > width + margin || Math.max(sy, ty) < -margin || Math.min(sy, ty) > height + margin)) return;
  const scale = Math.max(0.5, Math.min(6, zoom || 1));
  const tier = d.tier === 'high' ? 1.2 : d.tier === 'mid' ? 1 : 0.8;
  const alpha = Math.min(1,k * 10) * Math.pow(1-k,.68) * item.intensity * 1.05;
  const dx = tx - sx, dy = ty - sy, length = Math.hypot(dx, dy) || 1;
  const nx = -dy / length, ny = dx / length;
  ctx.strokeStyle = `rgba(${d.style === 'fire' ? '156,65,48' : d.style === 'thunder' ? COLD_STROKE : INK_STROKE},${alpha.toFixed(3)})`;
  ctx.lineWidth = Math.max(1, Math.min(3.4, scale * 0.32)) * tier;
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  if (d.style === 'thunder') {
    for (let i = 1; i < 4; i++) {
      const f = i / 4, jitter = (visualHash(item.seed, i, 'combat') - 0.5) * (2 + scale * 0.4) * tier;
      ctx.lineTo(sx + dx * f + nx * jitter, sy + dy * f + ny * jitter);
    }
  } else if (d.style === 'fire') {
    const ember = Math.min(4, scale * 0.5) * tier;
    ctx.lineTo(tx - dx * 0.25 + nx * ember, ty - dy * 0.25 + ny * ember);
  }
  ctx.lineTo(tx, ty);
  ctx.stroke();
  // A tiny contact mark, never a column, screen flash or expanding particle burst.
  if (d.style !== 'thunder') {
    const mark = Math.min(6, 1.8 + scale * 0.5) * tier * (1 - k * 0.5);
    const fleck = Math.min(5, (1.2 + scale * .42) * tier) * (1 - k * .55);
    ctx.beginPath(); ctx.moveTo(tx - nx * mark, ty - ny * mark); ctx.lineTo(tx + nx * mark, ty + ny * mark);
    ctx.moveTo(tx-fleck,ty-fleck*.55);ctx.lineTo(tx+fleck,ty+fleck*.55);ctx.stroke();
  }
  // A confirmed ignition earns one restrained orange ember at its real tile.
  // It is presentation-only and remains inside the same access-filtered renderer.
  const ignition = d.ignition;
  if (ignition && (!camera.canAccess || camera.canAccess(ignition.x, ignition.y))) {
    const [ix, iy] = projectEntity(camera, world, ignition.x + 0.5, ignition.y + 0.5);
    const ember = Math.max(1.2, Math.min(2.6, scale * 0.42));
    ctx.strokeStyle = `rgba(235,104,34,${(alpha * 0.95).toFixed(3)})`;
    ctx.lineWidth = Math.max(1, scale * 0.22);
    ctx.beginPath(); ctx.arc(ix, iy, ember, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = `rgba(248,178,76,${(alpha * 0.85).toFixed(3)})`;
    ctx.beginPath(); ctx.moveTo(ix - ember * 0.45, iy); ctx.lineTo(ix + ember * 0.35, iy - ember * 0.8); ctx.stroke();
  }
}
// ── 雷霆 / 渡劫 ─────────────────────────────────────────────
// 落点上方到目标之间一条快速折线：前 35% 强亮，之后淡出。不做屏幕闪白。
function drawLightning(ctx, camera, world, item, k, zoom) {
  const [tx, ty] = project(camera, world, item.x + 0.5, item.y + 0.5);
  const height = Math.max(40, 120 * zoom * 0.35);
  const bright = k < 0.35 ? 1 : 1 - (k - 0.35) / 0.65;
  const alpha = Math.max(0, bright) * 0.9;
  const segs = 6;
  ctx.strokeStyle = `rgba(${INK_STROKE},${alpha.toFixed(3)})`;
  ctx.lineWidth = Math.max(1, 1.1 * zoom * 0.4);
  ctx.beginPath();
  let px = tx + (item.seed - 0.5) * 10;
  let py = ty - height;
  ctx.moveTo(px, py);
  for (let s = 1; s <= segs; s += 1) {
    const f = s / segs;
    const jitter = (visualHash(item.seed, s, 'bolt') - 0.5) * 14 * zoom * 0.4;
    px = tx + jitter * (1 - f);
    py = ty - height * (1 - f);
    ctx.lineTo(px, py);
  }
  ctx.stroke();
  // 地面一圈极轻的扩散线
  const r = Math.max(3, (6 + k * 10) * zoom);
  ctx.strokeStyle = `rgba(${INK_STROKE},${(alpha * 0.4).toFixed(3)})`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(tx, ty, r, r * 0.72, 0, 0, Math.PI * 2);
  ctx.stroke();
}

// ── 陨石 ───────────────────────────────────────────────────
// 高速落点轨迹（前 45%）+ 冲击圆与放射状墨裂纹。
function drawMeteor(ctx, camera, world, item, k, zoom) {
  const [tx, ty] = project(camera, world, item.x + 0.5, item.y + 0.5);
  const ang = Math.PI * (0.75 + item.seed * 0.2);   // 从左上来
  const approach = Math.max(0, 1 - k / 0.45);
  if (approach > 0) {
    const len = 90 * zoom * 0.4 * approach;
    ctx.strokeStyle = `rgba(${INK_STROKE},${(0.7 * approach).toFixed(3)})`;
    ctx.lineWidth = Math.max(1.2, 1.6 * zoom * 0.4);
    ctx.beginPath();
    ctx.moveTo(tx + Math.cos(ang) * len, ty + Math.sin(ang) * len);
    ctx.lineTo(tx, ty);
    ctx.stroke();
  }
  const impact = Math.max(0, (k - 0.4) / 0.6);
  if (impact <= 0) return;
  const r = Math.max(4, (4 + impact * 22) * zoom);
  const alpha = Math.max(0, 1 - impact) * 0.85;
  ctx.strokeStyle = `rgba(${INK_STROKE},${alpha.toFixed(3)})`;
  ctx.lineWidth = Math.max(1, 2 * (1 - impact) + 0.6);
  ctx.beginPath();
  ctx.ellipse(tx, ty, r, r * 0.72, 0, 0, Math.PI * 2);
  ctx.stroke();
  // 放射状墨裂纹
  ctx.lineWidth = Math.max(0.8, 1.2 * (1 - impact));
  for (let b = 0; b < 5; b += 1) {
    const a = (b / 5) * Math.PI * 2 + item.seed * 6.28;
    const len = r * (0.9 + visualHash(item.seed, b, 'crack') * 0.6);
    ctx.strokeStyle = `rgba(${INK_STROKE},${(alpha * 0.7).toFixed(3)})`;
    ctx.beginPath();
    ctx.moveTo(tx + Math.cos(a) * r * 0.4, ty + Math.sin(a) * r * 0.3);
    ctx.lineTo(tx + Math.cos(a) * len, ty + Math.sin(a) * len * 0.72);
    ctx.stroke();
  }
}

// ── 飞升 ───────────────────────────────────────────────────
// 人物位置向上的淡墨粒子 / 青白墨点，逐渐拉散。不做西式光柱。
function drawAscension(ctx, camera, world, item, k, zoom) {
  const [tx, ty] = project(camera, world, item.x + 0.5, item.y + 0.5);
  const alpha = Math.max(0, 1 - k) * 0.8;
  ctx.strokeStyle = `rgba(${INK_STROKE},${alpha.toFixed(3)})`;
  ctx.lineWidth = Math.max(1, 1.2 * zoom * 0.35);
  const n = 5;
  for (let i = 0; i < n; i += 1) {
    const h = visualHash(item.seed, i, 'rise');
    const spread = (h - 0.5) * 16 * zoom * 0.4;
    const rise = k * (40 + h * 60) * zoom * 0.35;
    const len = Math.max(2, (1 - k) * 10 * zoom * 0.4);
    ctx.beginPath();
    ctx.moveTo(tx + spread * (0.4 + k), ty - rise);
    ctx.lineTo(tx + spread * (0.4 + k), ty - rise - len);
    ctx.stroke();
  }
  // 一点青白
  ctx.strokeStyle = `rgba(120,150,160,${(alpha * 0.6).toFixed(3)})`;
  ctx.beginPath();
  ctx.arc(tx, ty - k * 50 * zoom * 0.35, Math.max(1.5, 3 * zoom * 0.3), 0, Math.PI * 2);
  ctx.stroke();
}

// ── 裂隙开启 ───────────────────────────────────────────────
// 一条短暂开裂的墨线（真正的裂隙实体有自己的世界表现，这里只是「刚开出来的那一下」）。
function drawRiftCrack(ctx, camera, world, item, k, zoom) {
  const [tx, ty] = project(camera, world, item.x + 0.5, item.y + 0.5);
  const alpha = Math.max(0, 1 - k) * 0.9;
  const span = (6 + k * 14) * zoom;
  const ang = item.seed * Math.PI * 2;
  ctx.strokeStyle = `rgba(${INK_STROKE},${alpha.toFixed(3)})`;
  ctx.lineWidth = Math.max(1, 1.4 * zoom * 0.4);
  ctx.beginPath();
  ctx.moveTo(tx - Math.cos(ang) * span, ty - Math.sin(ang) * span * 0.6);
  ctx.lineTo(tx + Math.cos(ang) * span, ty + Math.sin(ang) * span * 0.6);
  ctx.stroke();
}

// ── 夺舍 / 附身 ────────────────────────────────────────────
// 人物周围一圈冷墨向内收拢，再短暂出现双重轮廓。不做夸张鬼脸。
function drawPossession(ctx, camera, world, item, k, zoom) {
  const [tx, ty] = project(camera, world, item.x + 0.5, item.y + 0.5);
  const alpha = Math.max(0, 1 - k) * 0.85;
  const r = Math.max(3, (12 * (1 - k) + 3) * zoom);
  ctx.strokeStyle = `rgba(${COLD_STROKE},${alpha.toFixed(3)})`;
  ctx.lineWidth = Math.max(1, 1.4 * (1 - k) + 0.6);
  ctx.beginPath();
  ctx.ellipse(tx, ty, r, r * 0.8, 0, 0, Math.PI * 2);
  ctx.stroke();
  // 双重轮廓：一个错开的淡圈
  ctx.strokeStyle = `rgba(${COLD_STROKE},${(alpha * 0.5).toFixed(3)})`;
  ctx.beginPath();
  ctx.ellipse(tx + 1.6, ty + 1.2, r * 0.9, r * 0.72, 0, 0, Math.PI * 2);
  ctx.stroke();
}

// ── 战争开始 ───────────────────────────────────────────────
// 两宗据点之间一条短暂裂纹 / 墨线。不常驻（常驻留给 F 包）。
function drawWarLine(ctx, camera, world, item, k, zoom) {
  const d = item.data || {};
  if (!Number.isFinite(d.ax) || !Number.isFinite(d.bx)) return;
  const [ax, ay] = project(camera, world, d.ax + 0.5, d.ay + 0.5);
  const [bx, by] = project(camera, world, d.bx + 0.5, d.by + 0.5);
  const alpha = Math.max(0, 1 - k) * 0.8;
  ctx.strokeStyle = `rgba(${INK_STROKE},${alpha.toFixed(3)})`;
  ctx.lineWidth = Math.max(1, 1.6 * (1 - k) + 0.6);
  const segs = 6;
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  for (let s = 1; s < segs; s += 1) {
    const f = s / segs;
    const jitter = (visualHash(item.seed, s, 'war') - 0.5) * 10 * zoom * 0.3;
    const nx = -(by - ay);
    const ny = bx - ax;
    const len = Math.hypot(nx, ny) || 1;
    ctx.lineTo(ax + (bx - ax) * f + (nx / len) * jitter, ay + (by - ay) * f + (ny / len) * jitter);
  }
  ctx.lineTo(bx, by);
  ctx.stroke();
}

// ── 跨界（D8-E）────────────────────────────────────────────
// 一条 `rift-cross` 事件**只画一端**：`data.phase` 说这是离开端还是到达端，
// `data.kind` 说跨的是什么。两端各由源 / 目标位面的**两条独立事件**驱动——
// 于是「凡间一个人从裂缝边消失」与「幽冥窗口同坐标处出现一团鬼影」各画在
// 自己那一界的画面上（`drawFx` 已按 `item.plane` 过滤，见本文件头）。
//
//   离开端（depart）：墨影向裂隙**收缩**——线由外向内收、半径随 `k` 变小。
//   到达端（arrive）：裂隙附近墨点向外**散开**——环由内向外扩、外圈散点。
//   主体着色：鬼 / 夺舍走冷墨（`COLD_STROKE`），人 / 物走墨色（`INK_STROKE`）。
//
// ⚠️ **纯描边**（不 `fill`）：与整个 fxLayer 的墨线美学一致，也让测试桩不必
//    实现 `fill` / `fillStyle`。抖动仍走确定性 `visualHash`（零 RNG）。
// ⚠️ **没有 `phase` 的旧形状**（D8-E 之前发过的 `rift-cross`）退回原来的
//    通用冲击环——不改变老事件的表现。
function drawRiftCross(ctx, camera, world, item, k, zoom) {
  const d = item.data || {};
  if (d.phase !== 'depart' && d.phase !== 'arrive') {
    drawImpactRing(ctx, camera, world, item, k, zoom, 0.3, 0.5);
    return;
  }
  const kind = d.kind || 'artifact';
  const cold = kind === 'ghost' || kind === 'possession';
  const stroke = cold ? COLD_STROKE : INK_STROKE;
  const [tx, ty] = project(camera, world, item.x + 0.5, item.y + 0.5);
  const fade = Math.max(0, 1 - k);

  if (d.phase === 'depart') {
    // 墨影向裂隙收缩：半径由大收小，笔画越来越短、越来越淡。
    const r = Math.max(2, (14 - k * 10) * zoom);
    ctx.strokeStyle = `rgba(${stroke},${(fade * 0.85).toFixed(3)})`;
    ctx.lineWidth = Math.max(0.9, 1.5 * (1 - k) + 0.4);
    const n = 6;
    for (let i = 0; i < n; i += 1) {
      const a = (i / n) * Math.PI * 2 + item.seed * 6.28;
      const inner = Math.max(1, r * (0.2 + k * 0.6));
      ctx.beginPath();
      ctx.moveTo(tx + Math.cos(a) * r, ty + Math.sin(a) * r * 0.72);
      ctx.lineTo(tx + Math.cos(a) * inner, ty + Math.sin(a) * inner * 0.72);
      ctx.stroke();
    }
    return;
  }

  // 到达端：裂隙附近墨点向外散开。
  const r = Math.max(3, (4 + k * 22) * zoom);
  ctx.strokeStyle = `rgba(${stroke},${(fade * 0.7).toFixed(3)})`;
  ctx.lineWidth = Math.max(0.9, 1.3 * (1 - k) + 0.4);
  ctx.beginPath();
  ctx.ellipse(tx, ty, r, r * 0.72, 0, 0, Math.PI * 2);
  ctx.stroke();

  const dots = kind === 'ghost' ? 5 : kind === 'person' ? 4 : 3;
  const dotR = Math.max(0.8, 1.6 * zoom * 0.35) * (0.6 + fade * 0.6);
  ctx.strokeStyle = `rgba(${stroke},${(fade * 0.55).toFixed(3)})`;
  ctx.lineWidth = Math.max(0.8, 1.1 * (1 - k) + 0.3);
  for (let i = 0; i < dots; i += 1) {
    const a = (i / dots) * Math.PI * 2 + item.seed * 6.28;
    const rr = r * (0.7 + visualHash(item.seed, i, 'scatter') * 0.5);
    ctx.beginPath();
    ctx.arc(tx + Math.cos(a) * rr, ty + Math.sin(a) * rr * 0.72, dotR, 0, Math.PI * 2);
    ctx.stroke();
  }

  // 主体再点一下：人 = 短暂残影（错开的一小圈）；物 = 一个小光点（小圈）。
  if (kind === 'person') {
    ctx.strokeStyle = `rgba(${stroke},${(fade * 0.5).toFixed(3)})`;
    ctx.beginPath();
    ctx.ellipse(tx + 1.4, ty - 1.0,
      Math.max(1, 2.4 * zoom * 0.4), Math.max(1.4, 3.6 * zoom * 0.4), 0, 0, Math.PI * 2);
    ctx.stroke();
  } else if (kind === 'artifact' || kind === 'herb') {
    ctx.strokeStyle = `rgba(150,124,74,${(fade * 0.75).toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(tx, ty, Math.max(1, 1.9 * zoom * 0.35), 0, Math.PI * 2);
    ctx.stroke();
  }
}

// ── 通用地面冲击环（玩家落笔 / 战殁 / 跨界 / 灭门）──────────
function drawImpactRing(ctx, camera, world, item, k, zoom, baseR, alphaMax) {
  const [tx, ty] = project(camera, world, item.x + 0.5, item.y + 0.5);
  const r = Math.max(3, (baseR * 8 + k * baseR * 18) * zoom);
  const alpha = Math.max(0, 1 - k) * alphaMax;
  ctx.strokeStyle = `rgba(${INK_STROKE},${alpha.toFixed(3)})`;
  ctx.lineWidth = Math.max(0.9, 1.4 * (1 - k) + 0.4);
  ctx.beginPath();
  ctx.ellipse(tx, ty, r, r * 0.72, 0, 0, Math.PI * 2);
  ctx.stroke();
}
