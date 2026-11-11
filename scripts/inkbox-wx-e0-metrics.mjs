import assert from 'node:assert/strict';
import {nativeApi,digest,advanceDays} from './inkbox-wx-e0-replay.mjs';

const api=await nativeApi(),initial=api.fresh(73101),saved=api.capture(initial),input=digest(saved);
assert.deepEqual(api.metrics.workMetricsSnapshot(initial.world),{});
assert.equal(api.metrics.workMetricsEnabled(initial.world),false);
assert.equal(api.metrics.startWorkMetric(initial.world),null);
const beforeKeys=Reflect.ownKeys(initial.world);
api.metrics.enableWorkMetrics(initial.world);assert.equal(api.metrics.workMetricsEnabled(initial.world),true);
assert.deepEqual(Reflect.ownKeys(initial.world),beforeKeys,'metrics do not attach a World property');
api.metrics.enableWorkMetrics(initial.world,false);assert.deepEqual(api.metrics.workMetricsSnapshot(initial.world),{});
const hashes=[];let measured;
for(const enabled of [false,true,true,false]){
  const c=api.restore(saved,{measure:enabled});
  const effectCounts=enabled?api.effects.measureEffects(true):null;
  advanceDays(api,c,30,3);hashes.push(digest(api.capture(c)));
  if(enabled){
    measured=api.metrics.workMetricsSnapshot(c.world);
    assert.equal(measured.life.calls,10);
    assert.equal(measured['life.entity-loop'].calls,10);assert.equal(measured['life.post-entity'].calls,10);
    assert.equal(measured['life.dtDays'].count,10);assert.equal(measured['life.dtDays'].sum,30);
    assert.equal(measured['life.dtDays'].buckets['<=3'],10);
    assert(measured['life.stepEntity'].calls>0);
    assert((measured['skills.calls']||0)+(measured['skills.rejected']||0)===measured['skills.profile-attempts']);
    assert.equal(measured['skills.manaCapacity']||0,measured['skills.calls']||0,'one capacity evaluation per accepted resource maintenance');
    assert(effectCounts.calls>0&&effectCounts.staticMs>=0&&effectCounts.dynamicMs>=0);
    api.effects.measureEffects(false);
    const snapshotBefore=JSON.stringify(api.capture(c));
    for(let i=1;i<200;i++)api.metrics.recordWorkDt(c.world,i/1000);
    assert.equal(Object.keys(api.metrics.workMetricsSnapshot(c.world)['life.dtDays'].buckets).length,8,'fractional dt does not grow metric keys');
    const copy=api.metrics.workMetricsSnapshot(c.world);copy['life.dtDays'].buckets['<=3']=-1;
    assert.equal(api.metrics.workMetricsSnapshot(c.world)['life.dtDays'].buckets['<=3'],10,'snapshots own their data');
    assert.equal(JSON.stringify(api.capture(c)),snapshotBefore,'diagnostic sampling never becomes a saved fact');
  }else assert.deepEqual(api.metrics.workMetricsSnapshot(c.world),{});
}
assert.equal(new Set(hashes).size,1,'30-day metrics on/off preserves complete serialized world and all registered RNG');
assert.equal(digest(saved),input,'native input is immutable across independent restores');
console.log(`WX-E0 metrics: default-off, bounded dt buckets, inclusive/exclusive phases, 30-day full world/RNG equality; ${measured['skills.calls']||0} measured skill calls`);
