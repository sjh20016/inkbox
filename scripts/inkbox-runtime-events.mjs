#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mulberry32 } from '../src/inkbox/core/noise.js';
import {
  RUNTIME_EVENT_CAP,
  drainRuntimeEvents,
  emitRuntimeEvent,
  peekRuntimeEvents,
} from '../src/inkbox/core/runtimeEvents.js';
import { WORLD_PRESETS } from '../src/inkbox/core/config.js';
import { deserializeWorld, serializeWorld } from '../src/inkbox/io/save.js';
import { generateWorld } from '../src/inkbox/world/worldgen.js';

let checks = 0;
function check(label, condition) {
  checks += 1;
  assert.ok(condition, label);
  console.log(`  ✓ ${label}`);
}

const world = { plane: 'mortal', day: 12 };
emitRuntimeEvent(world, 'tool-impact', {
  x: 8,
  y: 5,
  subjectId: 17,
  intensity: 0.75,
  timestamp: 12345,
  data: { tool: 'raise', changedTiles: 4 },
});
emitRuntimeEvent(world, 'tribulation', { day: 13, targetId: 'entity:22' });
const peeked = peekRuntimeEvents(world);
check('emit 保持发生顺序并补齐位面 / 游戏日',
  peeked.map((event) => event.type).join(',') === 'tool-impact,tribulation'
  && peeked[0].plane === 'mortal' && peeked[0].day === 12 && peeked[1].day === 13);
check('事件只包含约定字段，不复制调用方的墙钟时间或额外属性',
  !Object.hasOwn(peeked[0], 'timestamp') && peeked[0].x === 8 && peeked[0].subjectId === 17);
assert.throws(() => emitRuntimeEvent(world, 'tool-impact', { data: new (class CanvasLike {})() }), /plain objects/);
check('事件数据拒绝 DOM / Canvas 一类非 plain 对象', peekRuntimeEvents(world).length === 2);
peeked[0].data.tool = 'mutated outside the queue';
check('peek 返回隔离快照，调用方不能改写队列内容',
  peekRuntimeEvents(world)[0].data.tool === 'raise');
check('drain 按顺序交付全部事件', drainRuntimeEvents(world).map((event) => event.type).join(',') === 'tool-impact,tribulation');
check('drain 后队列为空', peekRuntimeEvents(world).length === 0);

const cappedWorld = { plane: 'mortal', day: 0 };
for (let index = 0; index < RUNTIME_EVENT_CAP + 4; index += 1) {
  emitRuntimeEvent(cappedWorld, 'major-death', { data: { index } });
}
const capped = peekRuntimeEvents(cappedWorld);
check('队列不超过 256 项，并在满载时丢弃最老事件',
  capped.length === RUNTIME_EVENT_CAP && capped[0].data.index === 4
  && capped.at(-1).data.index === RUNTIME_EVENT_CAP + 3);

const planeWorlds = ['mortal', 'upper', 'nether'].map((plane) => ({ plane, day: 2 }));
for (const [index, planeWorld] of planeWorlds.entries()) {
  emitRuntimeEvent(planeWorld, 'rift-open', { data: { marker: index } });
}
check('凡间、上界、幽冥各自排队，事件不串位面',
  planeWorlds.every((planeWorld, index) => {
    const events = peekRuntimeEvents(planeWorld);
    return events.length === 1 && events[0].plane === planeWorld.plane && events[0].data.marker === index;
  }));

const stream = mulberry32(9127);
const control = mulberry32(9127);
let rngCalls = 0;
const rngWorld = { plane: 'upper', day: 9, rng: () => { rngCalls += 1; return stream(); } };
emitRuntimeEvent(rngWorld, 'ascension', { targetId: 5 });
peekRuntimeEvents(rngWorld);
drainRuntimeEvents(rngWorld);
check('emit / peek / drain 不调用也不推进世界 RNG', rngCalls === 0 && stream() === control());

const savedWorld = generateWorld({ preset: WORLD_PRESETS.small, seed: 20260927, scatter: false });
const before = JSON.stringify(serializeWorld(savedWorld));
emitRuntimeEvent(savedWorld, 'tool-impact', { x: 3, y: 4, data: { tool: 'irrigate' } });
const saveWithQueuedEvent = serializeWorld(savedWorld);
check('runtime queue 不挂到 World，也不进入存档字段',
  !Object.hasOwn(savedWorld, 'runtimeEvents') && !Object.hasOwn(saveWithQueuedEvent, 'runtimeEvents'));
check('runtime event 不改变任何已序列化的模拟状态', JSON.stringify(saveWithQueuedEvent) === before);
const reloadedWorld = deserializeWorld(JSON.parse(JSON.stringify(saveWithQueuedEvent)));
check('读档后的 runtime queue 为空', peekRuntimeEvents(reloadedWorld).length === 0 && drainRuntimeEvents(reloadedWorld).length === 0);
const stateBeforeDrain = JSON.stringify(serializeWorld(savedWorld));
check('drain 只清 transient queue，不改变存档 / 模拟状态',
  drainRuntimeEvents(savedWorld).length === 1
  && JSON.stringify(serializeWorld(savedWorld)) === stateBeforeDrain);

console.log(`Runtime events OK · ${checks} checks · cap ${RUNTIME_EVENT_CAP}`);
