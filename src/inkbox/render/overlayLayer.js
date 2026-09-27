// Inkbox 表现叠层（overlay）· D7-C 起
//
// 这里是**非实体**的短命表现的家：不画地图上的东西（那是 `unitsLayer`），
// 只画「此刻给玩家的一点点反馈」。目前有两种：
//   · **落点墨环**（D7-C）——镜头滑到某人 / 某宗门之后，目标位置浮出一个约
//     1.2 秒的收缩墨环，让玩家知道「就是这里」；
//   · **活跃战争线**（D7-F）——「现在地图哪儿正在打？」一条不断轻微断裂、呼吸的
//     墨线，从一家宗门都城连到另一家。战争结束（`phase === 'ended'`）即消失。
//
// ⚠️ 三条纪律（与 `render/fxLayer.js` 一致）：
//   1. **纯表现**：不写世界、不抽 RNG、不进存档。删掉整个文件，模拟结果逐字不变。
//   2. **真实时间**：`updateFocusPulses(list, dt)` 的 dt 是秒，与 `world.day` 无关，
//      暂停世界时墨环照样播完。
//   3. **有上限**：列表封顶，超了丢最老的（它们只是视觉反馈，不是历史）。

/** 墨环默认时长（秒）。约 1.2 秒，与 D7 规划里写的数值一致。 */
export const FOCUS_PULSE_DURATION = 1.2;
/** 同时活跃的墨环上限。落点反馈很轻，不需要很多；封顶是为了防「狂点」时列表无界增长。 */
export const FOCUS_PULSE_CAP = 8;

/**
 * 生成一个落点墨环。
 * @param {Array} list 存放墨环的数组（由调用方持有，通常挂在 Sandbox 实例上）
 * @param {number} x 世界格 x
 * @param {number} y 世界格 y
 * @param {object} [options] `duration`（秒）/ `radius`（世界格，初始半径）
 * @returns {object|null} 新建的墨环
 */
export function spawnFocusPulse(list, x, y, options = {}) {
  if (!Array.isArray(list)) return null;
  const ttl = Number.isFinite(options.duration) && options.duration > 0
    ? options.duration
    : FOCUS_PULSE_DURATION;
  const radius = Number.isFinite(options.radius) && options.radius > 0 ? options.radius : 13;
  const pulse = { x, y, ttl, life: ttl, radius };
  list.push(pulse);
  if (list.length > FOCUS_PULSE_CAP) list.splice(0, list.length - FOCUS_PULSE_CAP);
  return pulse;
}

/**
 * 推进所有墨环的寿命，移除过期的。**不消费任何 RNG**。
 * @returns {Array} 原数组（就地修改）
 */
export function updateFocusPulses(list, dt) {
  if (!Array.isArray(list) || !list.length) return list;
  const step = Number.isFinite(dt) && dt > 0 ? dt : 0;
  for (let i = list.length - 1; i >= 0; i -= 1) {
    list[i].life -= step;
    if (list[i].life <= 0) list.splice(i, 1);
  }
  return list;
}

/**
 * 画所有墨环。收缩 + 后段淡出；立体视图下按落笔高度贴到地面上（椭圆略压扁）。
 */
export function drawFocusPulses(ctx, camera, world, list) {
  if (!Array.isArray(list) || !list.length || !world || !ctx) return;
  ctx.save();
  ctx.lineCap = 'round';
  for (let i = 0; i < list.length; i += 1) {
    const pulse = list[i];
    const k = pulse.ttl > 0 ? Math.min(1, Math.max(0, 1 - pulse.life / pulse.ttl)) : 1;
    const cx = Math.max(0, Math.min(world.w - 1, Math.round(pulse.x)));
    const cy = Math.max(0, Math.min(world.h - 1, Math.round(pulse.y)));
    const [sx, sy] = camera.tileScreen(pulse.x + 0.5, pulse.y + 0.5, world.height[world.idx(cx, cy)]);
    // 收缩：半径随进度 k 由 `radius` 收到 2 格；透明度后段平方淡出。
    const R = Math.max(3, (pulse.radius * (1 - k) + 2) * camera.zoom);
    const alpha = Math.max(0, 1 - k * k) * 0.8;
    ctx.strokeStyle = `rgba(34,32,28,${alpha.toFixed(3)})`;
    ctx.lineWidth = Math.max(0.8, 1.6 * (1 - k) + 0.5);
    ctx.beginPath();
    ctx.ellipse(sx, sy, R, R * 0.72, 0, 0, Math.PI * 2);
    ctx.stroke();
    // 内圈：更淡的一层，像墨在纸上洇开的第二道边
    const R2 = Math.max(2, R * 0.62);
    ctx.strokeStyle = `rgba(34,32,28,${(alpha * 0.45).toFixed(3)})`;
    ctx.beginPath();
    ctx.ellipse(sx, sy, R2, R2 * 0.72, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

/** 战争线的墨色（赭红）。与落点墨环的墨黑区分开，一眼能认出「这是战事」。 */
export const WAR_LINE_RGB = '150,42,30';

/** 贴地取高：给一个世界坐标，返回该格高度（越界钳制）。**纯读**。 */
function groundHeight(world, x, y) {
  const cx = Math.max(0, Math.min(world.w - 1, Math.round(x)));
  const cy = Math.max(0, Math.min(world.h - 1, Math.round(y)));
  return world.height[world.idx(cx, cy)];
}

/**
 * 画**活跃战争线**（D7-F）：「现在地图哪儿正在打？」
 *
 * ⚠️ 刻意**不默认把所有战争画出来**——几十个势力时会变成蜘蛛网（D7-F 规格）。
 *    只在两种情形画：
 *      · `opts.activeSectId` 给了某个宗门 ⇒ 只画**跟它有关**的那些战事；
 *      · `opts.showAll === true` ⇒ 画全部（玩家主动打开「战争显示」）。
 *    两者都不满足时**一条都不画**（返回 0）。战争结束（`phase === 'ended'`）立即消失。
 *
 * ⚠️ 纯表现：只读 `world.wars` / `world.factions` 的现成字段，**不写世界、不抽 RNG**。
 *    「呼吸」与「断裂」都走确定性三角函数（吃 `opts.pulse` 这个真实时间相位），
 *    同相位同读数 ⇒ 截图稳定。
 *
 * @returns {number} 实际画了几条（便于测试断言 / 调试）
 */
export function drawWarLines(ctx, camera, world, opts = {}) {
  if (!ctx || !camera || !world) return 0;
  const wars = Array.isArray(world.wars) ? world.wars : [];
  const factions = Array.isArray(world.factions) ? world.factions : [];
  if (!wars.length || !factions.length) return 0;

  const only = Number.isFinite(opts.activeSectId) ? opts.activeSectId : null;
  const showAll = opts.showAll === true;
  if (only === null && !showAll) return 0;

  const byId = new Map();
  for (let i = 0; i < factions.length; i += 1) byId.set(factions[i].id, factions[i]);
  const phase = Number.isFinite(opts.pulse) ? opts.pulse : 0;

  let drawn = 0;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (let i = 0; i < wars.length; i += 1) {
    const w = wars[i];
    if (!w || w.phase === 'ended') continue;
    const aId = Array.isArray(w.sideA) ? w.sideA[0] : null;
    const bId = Array.isArray(w.sideB) ? w.sideB[0] : null;
    if (only !== null && aId !== only && bId !== only) continue;
    const fa = byId.get(aId);
    const fb = byId.get(bId);
    if (!fa || !fb) continue;
    const ax = Number.isFinite(fa.capitalX) ? fa.capitalX : w.x;
    const ay = Number.isFinite(fa.capitalY) ? fa.capitalY : w.y;
    const bx = Number.isFinite(fb.capitalX) ? fb.capitalX : w.x;
    const by = Number.isFinite(fb.capitalY) ? fb.capitalY : w.y;

    const [sax, say] = camera.tileScreen(ax + 0.5, ay + 0.5, groundHeight(world, ax, ay));
    const [sbx, sby] = camera.tileScreen(bx + 0.5, by + 0.5, groundHeight(world, bx, by));

    // 呼吸：0..1 的确定性相位（同一 pulse ⇒ 同一读数，截图稳定）
    const breathe = 0.5 + 0.5 * Math.sin(phase * 2.2 + (w.id || 0) * 1.3);
    const segs = 10;
    const dx = sbx - sax;
    const dy = sby - say;
    const nl = Math.hypot(dx, dy) || 1;
    const nx = -dy / nl;
    const ny = dx / nl;

    ctx.strokeStyle = `rgba(${WAR_LINE_RGB},${(0.32 + 0.34 * breathe).toFixed(3)})`;
    ctx.lineWidth = 1.1 + 1.5 * breathe;
    ctx.setLineDash([6, 5]);                     // 断裂线：像被扯开的墨
    ctx.beginPath();
    for (let k = 0; k <= segs; k += 1) {
      const t = k / segs;
      const jitter = Math.sin(t * 12.9 + phase * 3.1 + (w.id || 0) * 1.7) * 2.2;
      const px = sax + dx * t + nx * jitter;
      const py = say + dy * t + ny * jitter;
      if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    // 两端各点一个据点小点（「谁跟谁打」的可读性）
    ctx.fillStyle = `rgba(${WAR_LINE_RGB},0.5)`;
    ctx.beginPath(); ctx.arc(sax, say, 3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(sbx, sby, 3, 0, Math.PI * 2); ctx.fill();
    drawn += 1;
  }
  ctx.restore();
  return drawn;
}

