import assert from 'node:assert/strict';
import fs from 'node:fs';
import { renderFrame, getEntityInspection, getWorldStatus, invalidateReadView, worldGeneration } from '../src/inkbox/presentation/readView/index.js';
import { CommandBridge } from '../src/inkbox/presentation/readView/commandBridge.js';
import { getSettlementInspection } from '../src/inkbox/presentation/readView/query.js';
import { TerrainReadView } from '../src/inkbox/presentation/readView/terrain.js';
import { activateTerrainChanges, noteTerrainCell } from '../src/inkbox/world/terrainChanges.js';
import { UnitsLayer } from '../src/inkbox/render/unitsLayer.js';
import { traceReads } from './inkbox-wx-e2ra-read-audit.mjs';

const world = { day: 4, seed: 7, plane: 'mortal', entities: [
  { id: 3, x: 1.125, y: 2.25, tx: 3, ty: 4, sp: 'human', hp: 5, maxHp: 10,
    dao: { path: { key: 'alchemy' } } },
] };
const first = renderFrame(world);
assert.equal(first.entities[0].x, 1.125);
assert.equal(first.entities[0].daoPath, 'alchemy');
assert.equal(first.entities[0].hpRatio, 0.5);
assert.equal(first.entities[0].hp, 5, 'Canvas injury bars retain exact original numerator');
assert.equal(first.entities[0].maxHp, 10, 'Canvas injury bars retain exact original denominator');
assert.equal(first.entities[0].entityKey, 'mortal:3');
assert.equal(renderFrame(world), first);
world.entities[0].x = 9;
assert.equal(first.entities[0].x, 1.125);
invalidateReadView(world);
assert.equal(renderFrame(world).entities[0].x, 9);
assert.equal(getWorldStatus(world).entityCount, 1);
assert.equal(getEntityInspection(world, 'upper', 3), null, 'cross-plane ID cannot be relabelled');
world.revision = 1;
world.entities[0].hp = 2;
assert.equal(renderFrame(world).entities[0].hp, 2, 'paused formal touch revision refreshes the frame');
const inspected = getEntityInspection(world, 'mortal', 3);
assert.equal(inspected.x, 9);
world.entities[0].x = 10;
assert.equal(inspected.x, 9);
const bridge = new CommandBridge(() => world);
assert.equal(bridge.dispatch({ worldGeneration: worldGeneration(world) + 1 }, () => { throw Error('ran'); }).reason, 'stale-world');
assert.equal(bridge.dispatch({ worldGeneration: worldGeneration(world) }, () => { world.entities[0].x = 11; return 'done'; }).value, 'done');
assert.equal(renderFrame(world).entities[0].x, 11);
assert.notEqual(worldGeneration({ entities: [], day: 4 }), worldGeneration(world));
world.settlementRuins = [{ id: 8, name: '旧村', x: 0, y: 0, history: [], level: 1 }];
const card = getSettlementInspection(world, 'mortal', 8, true);
assert.equal(card.settlementId, 8);
assert.equal(card.head, '旧村遗址');
assert.equal(getSettlementInspection(world, 'mortal', 999, true), null);
assert.equal('subject' in card, false);
const terrainWorld = { w: 2, h: 2, size: 4, height: new Float32Array([1, 2, 3, 4]),
  water: new Float32Array(4), type: new Uint8Array(4), veg: new Uint8Array(4), fire: new Uint8Array(4) };
activateTerrainChanges(terrainWorld);
const terrain = new TerrainReadView(terrainWorld);
const initial = terrain.initial();
terrainWorld.height[0] = 7;
assert.equal(initial.layers.height[0], 1);
noteTerrainCell(terrainWorld, 'height', 0);
assert.equal(terrain.changes().blocks[0].data[0], 7);
terrain.dispose();
// Compare actual Canvas drawing commands, including an injured person's bar.
// This catches DTO omissions that a position-only schema check cannot detect.
const drawWorld={day:1,plane:'mortal',entities:[{id:7,x:2.125,y:3.25,tx:4,ty:5,sp:'human',hp:2,maxHp:10,level:0,faction:0,face:-1}],height:new Float32Array([0]),idx:()=>0,factionById:()=>null};
const camera={zoom:8,relief:false,toScreenX:x=>x*8,toScreenY:y=>y*8,visibleRect:()=>({x0:0,y0:0,x1:10,y1:10})};
function draw(frame){const calls=[],ctx=new Proxy({}, {get:(t,k)=>(...args)=>calls.push([k,...args]),set:(t,k,v)=>{calls.push([k,v]);return true;}});new UnitsLayer().drawEntities(ctx,camera,drawWorld,1.25,frame);return calls;}
const legacyDraw=draw(null),projectedDraw=draw(renderFrame(drawWorld));
assert.deepEqual(projectedDraw,legacyDraw,'actual Canvas primitive positions/colors/injury bar remain exact');
assert(legacyDraw.some(c=>c[0]==='fillRect'&&c.at(-1)===1.1),'fixture genuinely draws the injury bar');
const trace=traceReads(world,w=>renderFrame(w,'mortal',{refresh:true}));
assert.equal(trace.writes.length,0);assert(trace.reads.some(r=>r.field==='world.entities'));
assert.throws(()=>traceReads(world,w=>{w.day++;}),/authoritative write/,'actual accidental projection write is rejected by opt-in tracer');
assert.equal(renderFrame(world,'upper'),null,'render identity cannot relabel a mortal as upper');
const source = file => fs.readFileSync(new URL(file, import.meta.url), 'utf8');
const units = source('../src/inkbox/render/unitsLayer.js');
const derive = source('../src/inkbox/render3d/entities/deriveEntities.js');
const main = source('../src/inkbox/main.js');
const wired = (u, d, m) => u.includes('const list = frame ? frame.entities : world.entities;')
  && d.includes("const entities = renderFrame(world, world.plane || 'mortal', { refresh: true }).entities;")
  && m.includes("this.units.drawEntities(ctx, this.camera, world, now, renderFrame(world, 'mortal'));");
assert.ok(wired(units, derive, main), 'both production entity consumers use shared RenderFrame');
assert.equal(wired(units, derive.replace('const entities = renderFrame', 'const entities = world.entities; // renderFrame'), main), false,
  'guard rejects a direct Three World entity read');
console.log('WX-E2R-a contract checks passed');
