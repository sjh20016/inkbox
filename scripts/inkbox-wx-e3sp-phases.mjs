import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { nativeApi } from './inkbox-wx-e0-replay.mjs';
import { referenceRoot } from './inkbox-wx-e3sp-reference.mjs';
import { advanceWorld, advanceWorldPhases } from '../src/inkbox/sim/advance.js';
import { supportsResumableLife } from '../src/inkbox/sim/life.js';
import { sharedInsightLookup } from '../src/inkbox/sim/entityReadView.js';
import { enableWorkMetrics } from '../src/inkbox/sim/workMetrics.js';
import { configureFrameBreakdown, snapshotFrameBreakdown } from '../src/inkbox/dev/frameBreakdown.js';

const root=path.resolve(fileURLToPath(new URL('..',import.meta.url)));
const candidate=await nativeApi(root),reference=await nativeApi(referenceRoot());
const initial=reference.capture(reference.fresh(73101));
const a=reference.restore(initial),b=candidate.restore(initial),c=candidate.restore(initial);
let yields=0,entities=0;
configureFrameBreakdown({enabled:true,reset:true});
for(let i=0;i<10;i++){
  reference.advance(a,3);candidate.advance(b,3);
  const iterator=advanceWorldPhases(c.world,3,c,{cooperative:true});let r;
  do{r=iterator.next();if(!r.done){yields++;if(r.value.phase==='life.entity')entities++;assert(Object.isFrozen(r.value));assert.equal(snapshotFrameBreakdown().activeSpans,0,'no wall span survives yield');}}while(!r.done);
  assert.deepEqual(candidate.capture(b),reference.capture(a),'phased synchronous world/all runtime vs frozen B '+i);
  assert.deepEqual(candidate.capture(c),reference.capture(a),'cooperative world/all runtime vs frozen B '+i);
}
configureFrameBreakdown({enabled:false,reset:true});
assert(entities>0);assert(yields>entities);
// Large-step segmentation keeps the original absolute monthly/nature order.
reference.advance(a,91);candidate.advance(b,91);
for(const token of advanceWorldPhases(c.world,91,c,{cooperative:true}))assert(token.phase);
assert.deepEqual(candidate.capture(b),reference.capture(a));assert.deepEqual(candidate.capture(c),reference.capture(a));
for(const method of ['step','stepEntity','stepVillages','stepPhases']){
  const x=candidate.restore(initial),before=candidate.capture(x);x.life[method]=function(){};
  assert.equal(supportsResumableLife(x.life),false);
  assert.throws(()=>advanceWorldPhases(x.world,3,x,{cooperative:true}).next(),/audited native/);
  assert.deepEqual(candidate.capture(x),before,'override rejected before day or RNG changes');
}
{
  const x=candidate.restore(initial);let calls=0;const step=x.life.step;
  x.life.step=function(dt){calls++;return step.call(this,dt);};advanceWorld(x.world,3,x);assert.equal(calls,1,'sync dynamic override retained');
}
{
  const x=candidate.restore(initial),foreign=candidate.restore(initial),before=candidate.capture(x);
  assert.throws(()=>advanceWorldPhases(x.world,3,{...x,life:foreign.life},{cooperative:true}).next(),/must own/);
  assert.deepEqual(candidate.capture(x),before);
}
for(const exit of ['return','throw']){
  const x=candidate.restore(initial);enableWorkMetrics(x.world,true,{timing:false});
  const iterator=advanceWorldPhases(x.world,3,x,{cooperative:true});let r;
  do{r=iterator.next();assert(!r.done,'fixture has real entity loop');}while(r.value.phase!=='life.entity');
  const actor=x.world.entities[0];assert(sharedInsightLookup(x.world,actor,[])!==null,'index remains active at entity yield');
  if(exit==='return')iterator.return();else assert.throws(()=>iterator.throw(Error('injected atom fault')),/injected atom/);
  assert.equal(sharedInsightLookup(x.world,actor,[]),null,'index closes on '+exit);
}
{
  const x=candidate.restore(initial),before=candidate.capture(x);enableWorkMetrics(x.world);
  assert.throws(()=>advanceWorldPhases(x.world,3,x,{cooperative:true}).next(),/timing:false/);
  assert.deepEqual(candidate.capture(x),before);
}
console.log(JSON.stringify({pass:true,steps:10,largeStepDays:91,yields,entities,proof:'frozen B vs shared sync vs cooperative complete World/all runtime; overrides, no open spans and iterator exit cleanup'}));
