import assert from 'node:assert/strict';
import { fixture } from './inkbox-g1-fixtures.mjs';
import { advanceWorld } from '../src/inkbox/sim/advance.js';
import { serializeWorld } from '../src/inkbox/io/save.js';
import { openRifts } from '../src/inkbox/sim/rifts.js';
import { createCharacterController, characterKey, summarizeCharacterObservation } from '../src/inkbox/g1/characterRuntime.js';

function comparable(world) {
  const raw = serializeWorld(world);
  delete raw.watch;
  return raw;
}
function run(years,observe,intervene = false) {
  const f=fixture(734),w=f.world,key=characterKey('mortal',f.entity.id);
  const controller=createCharacterController({getWorld:() => w});
  if (observe || intervene) assert.ok(controller.select(key).ok);
  if (observe) assert.ok(controller.handleAction({type:'watch',targetKey:key}).ok);
  if (intervene) {
    for (const edictId of ['cultivation','fortune','mind']) assert.ok(controller.handleAction({type:'edict',targetKey:key,edictId}).ok);
  }
  // Both realms, all ecology clocks and real rift creation follow the production entry point.
  const x=Math.floor(f.entity.x), y=Math.floor(f.entity.y);
  assert.ok(openRifts(w,{x0:Math.max(0,x-8),y0:Math.max(0,y-8),x1:Math.min(w.w-1,x+8),y1:Math.min(w.h-1,y+8)},'upper').opened > 0);
  assert.ok(openRifts(w,{x0:Math.max(0,x-16),y0:Math.max(0,y-16),x1:Math.min(w.w-1,x+16),y1:Math.min(w.h-1,y+16)},'nether').opened > 0);
  let lastSummary = null;
  for (let day=0;day<years * 360;day+=3) {
    advanceWorld(w,3,{life:f.life,upperLife:f.upperLife,rng:f.ecoRng,state:f.state});
    if (observe) {
      controller.refresh();
      if (day % 30 === 0) {
        lastSummary=summarizeCharacterObservation(w,key,Math.max(0,w.day-30));
        assert.equal(lastSummary.coverage.complete,false);
        assert.ok(lastSummary.events.every(row => row.day > w.day-30));
        if (controller.current()) {
          controller.handleAction({type:'export',targetKey:key});
          controller.handleAction({type:'focus',targetKey:key});
        }
      }
    }
  }
  assert.equal(w.day,years * 360);
  assert.equal(w.deadLog.total-w.deadLog.evicted,w.dead.length);
  assert.ok(w.chronicle.length <= 400);
  assert.ok(w.entities.every(e => !e.log || e.log.length <= 32));
  assert.ok(w.upper && w.nether);
  const result={world:comparable(w),draws:f.draws(),nextRng:f.rng(),ecoDraws:f.ecoDraws(),nextEcoRng:f.ecoRng(),status:controller.current()?.identity.status || 'closed'};
  controller.destroy();
  return result;
}
for (const years of [30,100]) {
  const plain=run(years,false),observed=run(years,true);
  assert.deepEqual(observed.world,plain.world,`${years} years full World equality excluding watch`);
  assert.equal(observed.draws,plain.draws); assert.equal(observed.nextRng,plain.nextRng); assert.equal(observed.ecoDraws,plain.ecoDraws); assert.equal(observed.nextEcoRng,plain.nextEcoRng);
  console.log(`✓ ${years} 年：全三界advanceWorld含生态/裂缝/鬼影，观察与未观察World/RNG严格等价；状态 ${observed.status}`);
}
const first=run(30,true,true),repeat=run(30,true,true),untouched=run(30,true,false);
assert.deepEqual(first,repeat);
assert.notDeepEqual(first.world,untouched.world);
console.log('✓ 主动敕令后30年重复轨迹完全确定，且与未干预轨迹确有差异');
console.log('G1 longrun: 30/100 year observer purity + deterministic intervention passed');
