import assert from 'node:assert/strict';
import { renderFrame, getEntityInspection, getWorldStatus, invalidateReadView, worldGeneration } from '../src/inkbox/presentation/readView/index.js';
import { CommandBridge } from '../src/inkbox/presentation/readView/commandBridge.js';

const world = { day: 4, seed: 7, plane: 'mortal', entities: [
  { id: 3, x: 1.125, y: 2.25, tx: 3, ty: 4, sp: 'human', hp: 5, maxHp: 10,
    dao: { path: { key: 'alchemy' } } },
] };
const first = renderFrame(world);
assert.equal(first.entities[0].x, 1.125);
assert.equal(first.entities[0].daoPath, 'alchemy');
assert.equal(first.entities[0].hpRatio, 0.5);
assert.equal(renderFrame(world), first);
world.entities[0].x = 9;
assert.equal(first.entities[0].x, 1.125);
invalidateReadView(world);
assert.equal(renderFrame(world).entities[0].x, 9);
assert.equal(getWorldStatus(world).entityCount, 1);
const inspected = getEntityInspection(world, 'mortal', 3);
assert.equal(inspected.x, 9);
world.entities[0].x = 10;
assert.equal(inspected.x, 9);
const bridge = new CommandBridge(() => world);
assert.equal(bridge.dispatch({ worldGeneration: worldGeneration(world) + 1 }, () => { throw Error('ran'); }).reason, 'stale-world');
assert.equal(bridge.dispatch({ worldGeneration: worldGeneration(world) }, () => { world.entities[0].x = 11; return 'done'; }).value, 'done');
assert.equal(renderFrame(world).entities[0].x, 11);
assert.notEqual(worldGeneration({ entities: [], day: 4 }), worldGeneration(world));
console.log('WX-E2R-a contract checks passed');
