import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createSandboxWorld } from '../src/inkbox/ui/worldCreation.js';
import { generateUpperWorld } from '../src/inkbox/world/worldgenUpper.js';
import { generateNetherWorld } from '../src/inkbox/world/worldgenNether.js';
import { WORLD_PRESETS } from '../src/inkbox/core/config.js';
import { rngStream } from '../src/inkbox/core/noise.js';
import { Life } from '../src/inkbox/sim/life.js';
import { UpperLife } from '../src/inkbox/sim/upperLife.js';
import { spawnNetherGhost } from '../src/inkbox/sim/netherLife.js';
import { advanceWorld, createAdvanceState } from '../src/inkbox/sim/advance.js';
import { captureRuntimeState, restoreRuntimeState } from '../src/inkbox/sim/runtimeState.js';
import { serializeWorld, deserializeWorld } from '../src/inkbox/io/save.js';
import { enableWanxiang } from '../src/inkbox/wanxiang/runtime.js';
import { enableWorkMetrics, workMetricsSnapshot } from '../src/inkbox/sim/workMetrics.js';
import { restoreWanling, snapshotWanling, wanlingState } from '../src/inkbox/world/wanlingState.js';

// Controlled integration: native generated three-plane content plus one native
// ghost spawn. This is an identity/clock/save check, not a natural-world sample.
const seed=20260914,preset=WORLD_PRESETS.small;
const world=createSandboxWorld(preset,seed,{terrainPreset:'standard'});
world.upper=generateUpperWorld({preset,seed});world.nether=generateNetherWorld({preset,seed});
spawnNetherGhost(world.nether,{name:'WX-D 集成鬼修',level:3});
function controller(w){return {world:w,life:new Life(w,rngStream(w.seed^0xa5a5a5a5)),upperLife:new UpperLife(w.upper),state:createAdvanceState(),playerRng:rngStream(w.seed^0x504c4159)};}
const c=controller(world);c.life.processPendingSpawns();enableWanxiang(world,{fresh:true});
enableWanxiang(world.upper,{fresh:true});enableWanxiang(world.nether,{fresh:true});
assert(world.entities.length>0&&world.upper.entities.length>0&&world.nether.entities.length>0,'three planes contain actual actors');
const checkpoint=c=>serializeWorld(c.world,{}, {runtime:captureRuntimeState({world:c.world,life:c.life,upperLife:c.upperLife,advanceState:c.state,playerRng:c.playerRng})});
const restore=saved=>{const data=structuredClone(saved),w=deserializeWorld(data),n=controller(w);restoreRuntimeState(data.runtime,{world:w,life:n.life,upperLife:n.upperLife,advanceState:n.state,playerRng:n.playerRng});return n;};
for(let day=0;day<180;day+=3)advanceWorld(world,3,c);
assert.equal(world.upper.day,world.day);assert.equal(world.nether.day,world.day);
assert.equal(world.upper.wanxiang.opportunities,undefined,'mortal supply not applied to upper world');
assert.equal(world.nether.wanxiang.opportunities,undefined,'mortal supply not applied to nether world');
const saved=checkpoint(c),a=restore(saved),b=restore(saved);enableWorkMetrics(a.world);
for(let day=0;day<90;day+=3){advanceWorld(a.world,3,a);advanceWorld(b.world,3,b);}
const digest=c=>createHash('sha256').update(JSON.stringify(checkpoint(c))).digest('hex');
assert.equal(digest(a),digest(b),'saved runtime resumes identically; optional measurement does not alter worlds/RNG');
assert(workMetricsSnapshot(a.world).life.calls>0);
assert.equal(checkpoint(a).v,11);

const badRoute=structuredClone(saved);
badRoute.wanxiang.world.encounters=[{id:'route-check',siteId:1,stage:'open',startDay:0,untilDay:1000,
  participants:[{actorId:1,stage:'travel',corners:[{x:world.w,y:2}],corner:0}]}];
assert.throws(()=>deserializeWorld(badRoute),/invalid-encounter-route/,'off-map route rejected instead of wrapping');
badRoute.wanxiang.world.encounters[0].participants[0].corners=[{x:2,y:2}];
badRoute.wanxiang.world.encounters[0].participants[0].corner=2;
assert.throws(()=>deserializeWorld(badRoute),/invalid-encounter-route/,'invalid route cursor rejected');

const social={actorId:1,path:'social',targetKind:'entity',targetId:2,x:2,y:2,stage:'travel',startedDay:0,nextDay:360,
  summary:'真实关系任务',intent:'heal',targetIncarnation:1,relation:'gratitude',corners:[{x:2,y:2}]};
wanlingState(a.world).jobs=[social];
const jobs=snapshotWanling(a.world);restoreWanling(a.world,jobs);
for(const patch of [{intent:'grant-reward'},{targetIncarnation:0},{relation:'past-life'},{corners:[{x:-1,y:2}]}]){
  const bad=structuredClone(jobs);Object.assign(bad.jobs[0],patch);
  const before=snapshotWanling(a.world);assert.throws(()=>restoreWanling(a.world,bad),/万灵存档/);assert.deepEqual(snapshotWanling(a.world),before,'corrupt social job rejected atomically');
}
const old=structuredClone(saved);delete old.wanxiang.world.opportunities;delete old.wanxiang.world.wxCEnabled;
assert.doesNotThrow(()=>deserializeWorld(old),'B optional state remains accepted');
console.log('WX-D native three-plane 180d + v11 resumed 90d, RNG/metrics equivalence, old saves and corrupt route/social-block rejection passed');
