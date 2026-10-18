import assert from 'node:assert/strict';
import { resolveWatch, currentGhostOf, netherGhostOf } from '../src/inkbox/sim/watch.js';
import { environmentPointVisible } from '../src/inkbox/g2/environmentObservationRuntime.js';
import { deriveSettlements } from '../src/inkbox/render3d/settlements/SettlementLayer.js';
import { STRUCT } from '../src/inkbox/core/config.js';

const entry = { key: 'mortal:17', lastKnownId: 17, name: '故人' };
const dead = { id: 17, died: 810, name: '故人' };
const ghost = { id: 8001, sp: 'ghost', hp: 4, x: 2.5, y: 2.5,
  ghostOf: { ref: 'mortal:17', deathDay: 810, route: 'ghost' } };
const world = { w: 10, h: 10, entities: [], dead: [dead], watch: [entry],
  upper: { arrivedLog: [] }, nether: { w: 10, h: 10, entities: [ghost] },
  mapProgress: { stage: 0 }, villages: [], factions: [],
  struct: new Uint8Array(100), idx: (x, y) => y * 10 + x,
  inside: (x, y) => x >= 0 && y >= 0 && x < 10 && y < 10 };
const resolved = resolveWatch(world, entry);
assert.equal(resolved.state, 'dead');
assert.match(resolved.label, /^故人/);
assert.equal(resolved.dead, dead);
assert.equal(resolved.currentGhost, ghost);
assert.equal(netherGhostOf(world, entry.key), null); // fall route remains separate

ghost.ghostOf.ref = 'mortal:18';
assert.equal(currentGhostOf(world, entry.key, dead), null);
ghost.ghostOf.ref = entry.key;
ghost.ghostOf.deathDay++;
assert.equal(currentGhostOf(world, entry.key, dead), null);
ghost.ghostOf.deathDay--;
ghost.ghostOf.route = null;
assert.equal(currentGhostOf(world, entry.key, dead), null);
ghost.ghostOf.route = 'gone';
assert.equal(currentGhostOf(world, entry.key, dead), null);
ghost.ghostOf.route = 'ghost';
world.nether.entities.length = 0;
assert.equal(resolveWatch(world, entry).state, 'dead');
assert.equal(resolveWatch(world, entry).currentGhost, null);
world.nether.entities.push(ghost);

const sb = { world, getRealmViewState: () => ({ open: true, targetPlane: 'nether',
  region: { contains: () => true } }), render3d: { active: false } };
assert.equal(environmentPointVisible(sb, 'nether', 2, 2), false); // stage 0 locks (2,2)
ghost.x = ghost.y = 5.5;
assert.equal(environmentPointVisible(sb, 'nether', 5, 5), true);
sb.getRealmViewState = () => ({ open: false });
assert.equal(environmentPointVisible(sb, 'nether', 5, 5), false);

const village = { id: 1, x: 5, y: 5, level: 2,
  houses: [{ x: 5, y: 5, type: STRUCT.HALL }, { x: 6, y: 5, type: STRUCT.HOUSE }] };
world.villages = [village];
world.struct[world.idx(5, 5)] = STRUCT.HALL;
world.struct[world.idx(6, 5)] = STRUCT.HOUSE;
assert.equal(deriveSettlements(world).buildings.filter(b => b.type === 'house').length, 2);
world.struct[world.idx(5, 5)] = STRUCT.RUIN;
const flooded = deriveSettlements(world);
assert.equal(flooded.historicalCandidates, 2);
assert.equal(flooded.buildings.filter(b => b.type === 'house').length, 1);
assert.equal(flooded.buildings.filter(b => b.type === 'center').length, 0);
console.log('G2.6 watch and live settlement CPU contract passed');
