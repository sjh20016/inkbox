#!/usr/bin/env node
import { mulberry32 } from '../src/inkbox/core/noise.js';
import { NEVER_DECAY_DAY, SPECIES, TIME, WORLD_PRESETS } from '../src/inkbox/core/config.js';
import { History } from '../src/inkbox/sim/powers.js';
import { Life } from '../src/inkbox/sim/life.js';
import { generateWorld } from '../src/inkbox/world/worldgen.js';
import { recomputeRect, OVER } from '../src/inkbox/world/terrain.js';
import { deserializeWorld, serializeWorld } from '../src/inkbox/io/save.js';
import { TOOL_BY_ID } from '../src/inkbox/ui/tools.js';
import { spawnNetherGhost, stepNether } from '../src/inkbox/sim/netherLife.js';
import {
  createInterventionOutcome, measureChangedCells,
} from '../src/inkbox/sim/interventionFeedback.js';

let checks = 0;
function check(label, condition, detail = '') {
  if (!condition) throw new Error(`FAIL ${label}${detail ? ` · ${detail}` : ''}`);
  checks += 1;
  console.log(`  ✓ ${label}${detail ? ` · ${detail}` : ''}`);
}

const world = generateWorld({ preset: WORLD_PRESETS.small, seed: 6202401, scatter: false });
const rng = mulberry32(77123);
const life = new Life(world, rng);
const applyBrush = (tool, x, y, radius = 1) => {
  const history = new History();
  history.begin();
  const rawResult = tool.apply({
    world, x: x + 0.5, y: y + 0.5, radius,
    amount: tool.amount, history, rng,
  });
  return { rawResult, metrics: measureChangedCells(world, history.current) };
};

// ① 山形干预：直接改变高程，超过上限时解释为什么没有效果。
const raiseX = Math.floor(world.w / 2);
const raiseY = Math.floor(world.h / 2);
const raiseIndex = world.idx(raiseX, raiseY);
world.height[raiseIndex] = 0.42;
recomputeRect(world, raiseX, raiseY, raiseX, raiseY);
const raiseBefore = world.height[raiseIndex];
const raiseRun = applyBrush(TOOL_BY_ID.raise, raiseX, raiseY);
const raiseOutcome = createInterventionOutcome({
  toolId: 'raise', action: TOOL_BY_ID.raise.name, x: raiseX, y: raiseY, ...raiseRun,
});
check('抬山可执行并反馈实际高程变化',
  raiseRun.rawResult > 0 && world.height[raiseIndex] > raiseBefore
    && raiseOutcome.status === 'success' && raiseOutcome.message.includes('影响'),
  raiseOutcome.message);

const cappedX = 2;
const cappedY = 2;
const cappedIndex = world.idx(cappedX, cappedY);
world.height[cappedIndex] = 1;
recomputeRect(world, cappedX, cappedY, cappedX, cappedY);
const cappedRun = applyBrush(TOOL_BY_ID.raise, cappedX, cappedY);
const cappedOutcome = createInterventionOutcome({
  toolId: 'raise', action: TOOL_BY_ID.raise.name, x: cappedX, y: cappedY, ...cappedRun,
});
check('抬山无效时给出高程上限原因',
  cappedOutcome.status === 'failed' && cappedOutcome.failureReason.includes('高程上限'),
  cappedOutcome.failureReason);

// ② 水土干预：验证灭火与润养都能被观察到，空目标明确拒绝。
let rainIndex = -1;
for (let i = 0; i < world.size; i += 1) {
  if (world.water[i] < 0.004) { rainIndex = i; break; }
}
check('回归世界有可施雨的地块', rainIndex >= 0);
const rainX = rainIndex % world.w;
const rainY = Math.floor(rainIndex / world.w);
world.veg[rainIndex] = 0.2;
world.fire[rainIndex] = 0.8;
world.over[rainIndex] = OVER.NONE;
const fireBefore = world.fire[rainIndex];
const rainRun = applyBrush(TOOL_BY_ID.rain, rainX, rainY);
const rainOutcome = createInterventionOutcome({
  toolId: 'rain', action: TOOL_BY_ID.rain.name, x: rainX, y: rainY, ...rainRun,
});
check('甘霖反馈灭火、植被和后续生态影响',
  rainRun.metrics.fireReduced > 0 && world.fire[rainIndex] < fireBefore
    && rainOutcome.status === 'success' && rainOutcome.lastingImpact.includes('生态'),
  rainOutcome.message);

world.veg[rainIndex] = 1;
world.fire[rainIndex] = 0;
world.over[rainIndex] = OVER.NONE;
const dryRun = applyBrush(TOOL_BY_ID.rain, rainX, rainY);
const dryOutcome = createInterventionOutcome({
  toolId: 'rain', action: TOOL_BY_ID.rain.name, x: rainX, y: rainY, ...dryRun,
});
check('甘霖无可改变地块时说明原因',
  dryOutcome.status === 'failed' && dryOutcome.failureReason.includes('没有需要'),
  dryOutcome.failureReason);

// ③ 生灵干预：用现有生灵投放路径创建凡人，再施行赐灵根。
let spawnIndex = -1;
let spawnOpenCells = 0;
for (let y = 6; y < world.h - 6; y += 1) {
  for (let x = 6; x < world.w - 6; x += 1) {
    const center = world.idx(x, y);
    if (!world.isWalkable(center) || world.struct[center] !== 0) continue;
    let openCells = 0;
    for (let yy = y - 6; yy <= y + 6; yy += 1) {
      for (let xx = x - 6; xx <= x + 6; xx += 1) {
        const i = world.idx(xx, yy);
        if (world.isWalkable(i) && world.struct[i] === 0) openCells += 1;
      }
    }
    if (openCells > spawnOpenCells) {
      spawnIndex = center;
      spawnOpenCells = openCells;
    }
  }
}
check('回归世界有足够空地可稳定投放生灵', spawnIndex >= 0 && spawnOpenCells > 20,
  `${spawnOpenCells} 个邻近空地`);
const spawnX = spawnIndex % world.w;
const spawnY = Math.floor(spawnIndex / world.w);
const spawned = life.spawn(spawnX + 0.5, spawnY + 0.5, SPECIES.HUMAN, 2);
check('现有生灵工具路径创建凡人', spawned > 0, `${spawned} 人`);
const rootRaw = TOOL_BY_ID.root.apply({
  world, x: spawnX + 0.5, y: spawnY + 0.5, radius: 12, rng,
});
const rootOutcome = createInterventionOutcome({
  toolId: 'root', action: TOOL_BY_ID.root.name,
  x: spawnX, y: spawnY, rawResult: rootRaw,
});
check('赐灵根点名受影响人物并说明持续修行结果',
  rootOutcome.status === 'success' && rootOutcome.worldEvent.includes('人物经历'),
  rootOutcome.message);
const rootFailure = TOOL_BY_ID.root.apply({
  world, x: spawnX + 0.5, y: spawnY + 0.5, radius: 12, rng,
});
const rootFailureOutcome = createInterventionOutcome({
  toolId: 'root', action: TOOL_BY_ID.root.name,
  x: spawnX, y: spawnY, rawResult: rootFailure,
});
check('赐灵根找不到目标时说明缺少未觉醒凡人',
  rootFailureOutcome.status === 'failed' && rootFailureOutcome.failureReason.includes('未觉醒的凡人'),
  rootFailureOutcome.failureReason);

// ④ 持续灾祸：开始、活动读数、结局、存档/加载和稳定 ID 全部闭环。
const village = {
  id: world.nextVillageId++, name: '回归村', x: raiseX + 0.5, y: raiseY + 0.5,
  hp: 100, food: 100, population: 40,
};
world.villages.push(village);
const crisisId = life.events.nextEventId;
const crisisRaw = TOOL_BY_ID.crisis.apply({
  world, events: life.events, x: village.x, y: village.y,
});
const activeEvent = life.events.activeCrises.find((entry) => entry.id === crisisId);
const crisisOutcome = createInterventionOutcome({
  toolId: 'crisis', action: TOOL_BY_ID.crisis.name,
  x: village.x, y: village.y, rawResult: crisisRaw,
  event: activeEvent && { ...activeEvent, villageName: village.name },
});
check('降灾反馈聚落、稳定事件 ID、持续损耗和预计结算',
  activeEvent?.status === 'active' && crisisOutcome.status === 'success'
    && crisisOutcome.message.includes(`#${crisisId}`)
    && crisisOutcome.lastingImpact.includes('粮食'),
  crisisOutcome.message);

const activeSnapshot = JSON.stringify(world.worldEventState);
const loaded = deserializeWorld(serializeWorld(world));
const loadedLife = new Life(loaded, mulberry32(77123));
const loadedEvent = loadedLife.events.activeCrises.find((entry) => entry.id === crisisId);
check('活动事件和倒计时存档后以同一 ID 恢复且只运行一份',
  JSON.stringify(loaded.worldEventState) === activeSnapshot
    && loadedEvent?.status === 'active'
    && loadedLife.events.activeCrises.filter((entry) => entry.id === crisisId).length === 1,
  `事件 #${loadedEvent?.id} · active=${loadedLife.events.activeCrises.length}`);

loaded.day = loadedEvent.startedDay + loadedEvent.durationDays;
loadedLife.events.step(1);
const resolved = loadedLife.events.history.find((entry) => entry.id === crisisId);
check('灾祸结束时记录 resolved 结局并写入编年与大事记',
  resolved?.status === 'resolved' && resolved.outcome.includes('熬过了')
    && loaded.chronicle.some((entry) => entry.text.includes(`事件 #${crisisId}`) && entry.text.includes('熬过了'))
    && loaded.milestones.some((entry) => entry.text.includes(`事件 #${crisisId}`) && entry.text.includes('熬过了')),
  resolved?.outcome);

const resolvedReload = deserializeWorld(serializeWorld(loaded));
const resolvedLife = new Life(resolvedReload, mulberry32(77123));
resolvedLife.events.step(1);
check('已结束事件读档后仍留在历史且不会重复结算',
  resolvedLife.events.activeCrises.length === 0
    && resolvedLife.events.history.filter((entry) => entry.id === crisisId).length === 1
    && resolvedLife.events.history.find((entry) => entry.id === crisisId)?.status === 'resolved',
  `事件 #${crisisId} · history=${resolvedLife.events.history.length}`);

const expiredId = resolvedLife.events.nextEventId++;
resolvedLife.events.activeCrises.push({
  id: expiredId, key: 'drought', name: '旧历灾年', note: '期限记录缺失',
  villageName: village.name, villageId: village.id,
  x: village.x, y: village.y, startedDay: resolvedReload.day,
  durationDays: 0, endedDay: null, status: 'active', outcome: null,
  resolved: false, byPlayer: true,
});
resolvedLife.events.syncState();
resolvedLife.events.step(1);
check('零时长遗留灾祸以 expired 结局入历史，不造成静默损耗',
  resolvedLife.events.history.some((entry) => entry.id === expiredId
    && entry.status === 'expired' && entry.outcome.includes('期限已失效'))
    && !resolvedLife.events.activeCrises.some((entry) => entry.id === expiredId),
  `事件 #${expiredId}`);

const missingVillage = {
  id: resolvedReload.nextVillageId++, name: '失踪村', x: 24.5, y: 24.5,
  hp: 100, food: 100, population: 20,
};
resolvedReload.villages.push(missingVillage);
const failedEvent = resolvedLife.events.triggerCrisis(missingVillage.x, missingVillage.y, {
  crisis: 0.2, duration: 0.1,
});
resolvedReload.villages = resolvedReload.villages.filter((entry) => entry.id !== missingVillage.id);
resolvedLife.events.step(1);
check('灾祸目标消失时记录 failed 结局，不会静默移除',
  resolvedLife.events.history.some((entry) => entry.id === failedEvent.id
    && entry.status === 'failed' && entry.outcome.includes('聚落已不在')),
  `事件 #${failedEvent.id}`);

const cancelled = resolvedLife.events.triggerCrisis(0, 0, { crisis: 0.1, duration: 0.1 });
check('空落点将灾祸明确记为 cancelled',
  cancelled.status === 'cancelled' && !resolvedLife.events.activeCrises.some((entry) => entry.id === cancelled.id)
    && resolvedLife.events.history.some((entry) => entry.id === cancelled.id),
  `事件 #${cancelled.id}`);

resolvedLife.events.triggerCrisis(village.x, village.y, { crisis: 0.1, duration: 0.1 });
resolvedLife.events.triggerCrisis(village.x, village.y, { crisis: 0.2, duration: 0.1 });
const cappedRaw = TOOL_BY_ID.crisis.apply({
  world: resolvedReload, events: resolvedLife.events, x: village.x, y: village.y,
});
const cappedCrisisOutcome = createInterventionOutcome({
  toolId: 'crisis', action: TOOL_BY_ID.crisis.name,
  x: village.x, y: village.y, rawResult: cappedRaw,
});
check('降灾达到并存上限时明确拒绝且不创建第三个事件',
  resolvedLife.events.activeCrises.length === 2 && cappedCrisisOutcome.status === 'failed'
    && cappedCrisisOutcome.failureReason.includes('两场'),
  cappedCrisisOutcome.failureReason);

// 幽冥寿命契约：普通正寿命按期消散；负寿命使用正向 JSON 安全哨兵，长时段与读档都不消散。
const shortLived = spawnNetherGhost(resolvedReload.nether, {
  ghostOf: { ref: 'mortal:decay-test', name: '短命鬼', deathDay: resolvedReload.day },
  decayYears: 1,
});
const immortal = spawnNetherGhost(resolvedReload.nether, {
  ghostOf: { ref: 'mortal:never-decay-test', name: '不散鬼', deathDay: resolvedReload.day },
  decayYears: -1,
});
check('正寿命截止日与负寿命永不消散哨兵分开', !!shortLived && !!immortal
  && shortLived.ghostDecayDay === resolvedReload.day + TIME.daysPerYear
  && immortal.ghostDecayDay === NEVER_DECAY_DAY,
`${shortLived && shortLived.ghostDecayDay} / ${immortal && immortal.ghostDecayDay}`);
resolvedReload.day = shortLived.ghostDecayDay - 1;
stepNether(resolvedReload, 1);
check('正寿命鬼魂不会提前一天消散', resolvedReload.nether.entities.includes(shortLived), shortLived.name);
resolvedReload.day = shortLived.ghostDecayDay;
stepNether(resolvedReload, 1);
check('正寿命鬼魂在到期日消散', !resolvedReload.nether.entities.includes(shortLived), shortLived.name);

const decayReload = deserializeWorld(serializeWorld(resolvedReload));
const immortalReload = decayReload.nether.entities.find((entry) => entry.id === immortal.id);
check('负寿命哨兵存档后精确恢复', immortalReload?.ghostDecayDay === NEVER_DECAY_DAY,
  String(immortalReload?.ghostDecayDay));
decayReload.day = 20_000 * TIME.daysPerYear;
stepNether(decayReload, 20_000 * TIME.daysPerYear);
check('负寿命鬼魂经过两万年推进仍不消散', decayReload.nether.entities.some((entry) => entry.id === immortal.id),
  `day=${decayReload.day} cutoff=${immortalReload?.ghostDecayDay}`);

console.log(`\nInkbox intervention regression OK · ${checks} 项`);
