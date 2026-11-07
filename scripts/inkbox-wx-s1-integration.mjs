import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSandboxWorld } from '../src/inkbox/ui/worldCreation.js';
import { WORLD_PRESETS } from '../src/inkbox/core/config.js';
import { Life } from '../src/inkbox/sim/life.js';
import { rngStream } from '../src/inkbox/core/noise.js';
import { advanceWorld, createAdvanceState } from '../src/inkbox/sim/advance.js';
import { captureRuntimeState, restoreRuntimeState } from '../src/inkbox/sim/runtimeState.js';
import { serializeWorld, deserializeWorld } from '../src/inkbox/io/save.js';
import { enableWanxiang } from '../src/inkbox/wanxiang/runtime.js';
import { emitCommittedFact } from '../src/inkbox/wanxiang/experiences.js';
import { createCharacterController } from '../src/inkbox/g1/characterRuntime.js';
import { createStory, evidence, personRef } from '../src/inkbox/wanxiang/storyFacts.js';
import { selectStories } from '../src/inkbox/wanxiang/storySelection.js';
import { readPersonStories, readObjectStories, readWorldStories, resolveStoryRef } from '../src/inkbox/wanxiang/storyReading.js';

const world=createSandboxWorld(WORLD_PRESETS.small,73101,{terrainPreset:'standard'});
const life=new Life(world,rngStream(world.seed^0xa5a5a5a5));life.processPendingSpawns();
enableWanxiang(world,{fresh:true});world.day=100;
const state=createAdvanceState(),playerRng=rngStream(world.seed^0x504c4159);
const saved = (w=world,l=life,s=state,p=playerRng) => serializeWorld(w,{}, {runtime:captureRuntimeState({world:w,life:l,advanceState:s,playerRng:p})});
const e=world.entities.find(e=>e.hp>0&&e.x>=world.w*.3&&e.x<world.w*.7&&e.y>=world.h*.3&&e.y<world.h*.7);
assert(e,'formal genesis has an accessible actor');
// Controlled committed fact for controller/roundtrip checks; natural stories
// are extracted independently from the untouched natural checkpoint files.
const ref=personRef('mortal',e),key=`mortal:${e.id}`;
assert(emitCommittedFact(world,e,{id:'s1-controlled-arrival',type:'site-failure',arrived:true,siteId:98765}));
const controller=createCharacterController({getWorld:()=>world});assert(controller.select(key).ok);
const before=JSON.stringify(saved()),profile=JSON.stringify(e.wanxiang);
const first=controller.handleMingpu({type:'stories',targetKey:key});assert(first.ok);assert(first.stories.cards.length);
assert.equal(first.stories.cards[0].status,'interrupted','missing original site does not become a replacement');
for(let i=0;i<100;i++) {
  assert.deepEqual(controller.handleMingpu({type:'stories',targetKey:key}).stories,first.stories);
  readPersonStories(world,ref);readWorldStories(world);readObjectStories(world,{kind:'site',plane:'mortal',id:98765});
}
assert.equal(JSON.stringify(saved()),before,'queries and controller keep all saved facts and every runtime RNG bit identical');
assert.equal(JSON.stringify(e.wanxiang),profile,'queries do not initialize or modify Profile');
assert.equal(controller.handleMingpu({type:'story-navigate',targetKey:key,ref:{kind:'person',plane:'mortal',id:e.id,incarnation:1}}).ok,false,'unissued link rejected');
assert.equal(resolveStoryRef(world,{kind:'person',plane:'mortal',id:e.id}).available,false,'historical ID without incarnation cannot authorize navigation');
assert.equal(resolveStoryRef(world,{...ref,incarnation:999}).available,false,'new incarnation cannot impersonate an old source');
world.wanxiang.enabled=false;assert.deepEqual(readPersonStories(world,ref),first.stories,'disabled Alpha preserves existing read-only history');world.wanxiang.enabled=true;
const snapshot=saved(),restored=deserializeWorld(snapshot);delete restored.upper;delete restored.nether;
assert.deepEqual(readPersonStories(restored,ref),first.stories,'v11 restores stable story keys/content without a new saved block');
const old=structuredClone(snapshot);delete old.wanxiang;const legacy=deserializeWorld(old);
assert.doesNotThrow(()=>readWorldStories(legacy),'old no-Profile saves degrade safely');

function resume(snapshot) {
  const input=structuredClone(snapshot),w=deserializeWorld(input);delete w.upper;delete w.nether;
  const l=new Life(w,rngStream(w.seed^0xa5a5a5a5)),s=createAdvanceState(),p=rngStream(w.seed^0x504c4159);
  restoreRuntimeState(input.runtime,{world:w,life:l,advanceState:s,playerRng:p});return {world:w,life:l,state:s,playerRng:p};
}
const checkpointBefore=JSON.stringify(snapshot);
const off=resume(snapshot),on=resume(snapshot);
for(let i=0;i<20;i++) {
  advanceWorld(off.world,3,off);advanceWorld(on.world,3,on);
  readPersonStories(on.world,ref);readWorldStories(on.world);
}
assert.deepEqual(saved(off.world,off.life,off.state,off.playerRng),saved(on.world,on.life,on.state,on.playerRng),'observed/unobserved native advance is bitwise identical');
assert.equal(JSON.stringify(snapshot),checkpointBefore,'independent trials never mutate the reusable input checkpoint');
const actor={kind:'person',plane:'mortal',id:1,incarnation:1};
const make=(id,status='watching',day=100,subject={...actor,id})=>createStory('budget',subject,evidence('test',`source-${id}-${day}`,day,'site-failure','正式测试来源'),{status,importance:status==='resolved'?3:2});
const rows=Array.from({length:80},(_,i)=>make(i+1));rows.push(rows[0]);
const selected=selectStories(rows,{day:200});assert.equal(selected.stats.open,24);assert.equal(selected.stats.deduplicated,1);
assert.deepEqual(selected,selectStories([...rows].reverse(),{day:200}),'source order does not change selection');
assert.equal(selectStories(Array.from({length:150},(_,i)=>make(i+1,'resolved'))).cards.length,96);
assert.equal(selectStories([make(1),make(2,'watching',500,actor)]).cards.length,1,'one active hook per body');
assert.equal(selectStories([make(1,'resolved',100),make(1,'resolved',200)]).stats.cooldown,1);
assert.equal(selectStories([make(1)],{day:4001}).cards[0].outcome,'expired_unproven','expired observation cannot invent fulfillment');
assert.equal(createStory('fake',actor,evidence('free-text','fake',1,'healed','某人已经报恩','D')),null,'unstructured prose cannot qualify as fact');
for(const file of ['sim/life.js','sim/advance.js','wanxiang/effects.js']) {
  const source=readFileSync(new URL(`../src/inkbox/${file}`,import.meta.url),'utf8');
  assert.doesNotMatch(source,/storyReading|StoryCandidates|readWorldStories|readPersonStories/,'no story scan in simulation/effects hot paths');
}
world.sites.push({id:98765,kind:'cave',name:'源洞府',x:e.x,y:e.y});
const navigable=controller.handleMingpu({type:'stories',targetKey:key}).stories.cards.flatMap(c=>c.related).find(r=>r.available);
assert(navigable,'current original site can be followed');
e.possessedBy={day:world.day};
assert.equal(controller.handleMingpu({type:'story-navigate',targetKey:key,ref:navigable}).ok,false,'a changed soul invalidates previously issued story navigation');
assert.equal(resolveStoryRef(world,ref).available,false,'same ID/incarnation after possession cannot use the previous body reference');
assert.equal(readPersonStories(world,key).cards.length,0,'current possession identity does not inherit pre-cutover body events');
controller.destroy();console.log('WX-S1 integration: controller/100-read pure, stable v11/legacy, native on/off fact+RNG equivalence, identity/navigation guards, deterministic budgets/cooldown/expiry and hot-path isolation passed');
