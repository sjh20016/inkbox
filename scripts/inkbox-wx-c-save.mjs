import assert from 'node:assert/strict';
import {createSandboxWorld} from '../src/inkbox/ui/worldCreation.js';
import {WORLD_PRESETS} from '../src/inkbox/core/config.js';
import {Life} from '../src/inkbox/sim/life.js';
import {rngStream} from '../src/inkbox/core/noise.js';
import {enableWanxiang} from '../src/inkbox/wanxiang/runtime.js';
import {stepOpportunitySupply} from '../src/inkbox/sim/sites.js';
import {serializeWorld,deserializeWorld} from '../src/inkbox/io/save.js';
import {serializeWanxiang,restoreWanxiang} from '../src/inkbox/wanxiang/saveState.js';
import {captureRuntimeState,restoreRuntimeState} from '../src/inkbox/sim/runtimeState.js';
import {createAdvanceState} from '../src/inkbox/sim/advance.js';
import {worldStream} from '../src/inkbox/sim/worldStreams.js';
import {captureWorldStreams} from '../src/inkbox/sim/worldStreams.js';

// Controlled optional-block compatibility test; not a natural-world sample.
const w=createSandboxWorld(WORLD_PRESETS.small,20260914,{terrainPreset:'standard'});
const life=new Life(w,rngStream(w.seed^0xa5a5a5a5));life.processPendingSpawns();enableWanxiang(w,{fresh:true});
const state=createAdvanceState(),playerRng=rngStream(w.seed^0x504c4159);
w.day=360;stepOpportunitySupply(w);
const next=worldStream(w,'wanxiang-opportunities',0x77584335);next();
const runtime=captureRuntimeState({world:w,life,advanceState:state,playerRng});
const saved=serializeWorld(w,{}, {runtime});
assert.equal(saved.v,11,'WX-C keeps the existing v11 format');
const copy=deserializeWorld(saved);
delete copy.upper;delete copy.nether;
const resumedLife=new Life(copy,rngStream(copy.seed^0xa5a5a5a5));
restoreRuntimeState(saved.runtime,{world:copy,life:resumedLife,advanceState:createAdvanceState(),playerRng:rngStream(copy.seed^0x504c4159)});
assert.equal(worldStream(copy,'wanxiang-opportunities',0x77584335)(),next(),'new supply random stream restores exactly');
assert.deepEqual(copy.wanxiang.opportunities,w.wanxiang.opportunities);
const profiles=serializeWanxiang(copy).profiles;
enableWanxiang(copy,{wxCEnabled:false});const before=JSON.stringify(copy.wanxiang.opportunities);
copy.day+=360;stepOpportunitySupply(copy);
assert.equal(JSON.stringify(copy.wanxiang.opportunities),before,'disabled supply does not mutate saved counters');
assert.deepEqual(serializeWanxiang(copy).profiles,profiles,'rollback retains profiles and receipts');
assert.equal(deserializeWorld(serializeWorld(copy)).wanxiang.wxCEnabled,false);

const old=serializeWanxiang(w);delete old.world.opportunities;delete old.world.wxCEnabled;
restoreWanxiang(copy,old);
assert.equal(copy.wanxiang.opportunities,undefined,'WX-B optional block remains accepted without migration');
const bad=structuredClone(old);bad.world.opportunities={version:1,lastSupplyDay:0,counters:{generated:-1}};
const unchanged=JSON.stringify(copy.wanxiang);
assert.throws(()=>restoreWanxiang(copy,bad),/invalid-opportunities/);
assert.equal(JSON.stringify(copy.wanxiang),unchanged,'bad optional block rejected atomically');
bad.world.opportunities.counters.generated=1.5;
assert.throws(()=>restoreWanxiang(copy,bad),/invalid-opportunities/);
bad.world.opportunities.counters={unbounded:1};
assert.throws(()=>restoreWanxiang(copy,bad),/invalid-opportunities/);
console.log('WX-C v11 optional block, old B compatibility, supply RNG resume, rollback and atomic corrupt-block rejection passed');

// Natural initialization uses a new saved stream, preserving original DNA draws.
function genesis(wxCEnabled){const world=createSandboxWorld(WORLD_PRESETS.small,73101,{terrainPreset:'standard'});const c=new Life(world,rngStream(world.seed^0xa5a5a5a5));c.processPendingSpawns();enableWanxiang(world,{fresh:true,wxCEnabled});return world;}
const natural=genesis(true),legacy=genesis(false);
const humans=world=>world.entities.filter(e=>e.wanxiang);
assert(humans(natural).every(e=>e.wanxiang.personality.length===1));
assert(new Set(humans(natural).map(e=>e.wanxiang.personality[0].id)).size>=2,'formal genesis contains actual personality diversity');
const withoutPersonality=world=>humans(world).map(e=>({...e.wanxiang,personality:[]}));
assert.deepEqual(withoutPersonality(natural),withoutPersonality(legacy),'new personality does not shift birth DNA RNG draws');
assert.deepEqual(captureWorldStreams(natural).wanxiangBirth,captureWorldStreams(legacy).wanxiangBirth);
humans(natural)[0].wanxiang.personality=[];enableWanxiang(natural);
assert.equal(humans(natural)[0].wanxiang.personality.length,0,'reopening Alpha does not overwrite deliberate fate edits');
assert.deepEqual(humans(deserializeWorld(serializeWorld(natural))).map(e=>e.wanxiang.personality),humans(natural).map(e=>e.wanxiang.personality));
console.log('WX-C formal natural personalities, independent RNG, manual removal and v11 restoration passed');
