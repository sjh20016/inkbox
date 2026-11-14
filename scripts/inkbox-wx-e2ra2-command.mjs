import assert from 'node:assert/strict';
import { setup, fixture, pointer, savedState } from './inkbox-g7-cancel.mjs';
import { CommandBridge } from '../src/inkbox/presentation/readView/commandBridge.js';
import { Render3DAdapter } from '../src/inkbox/render3d/Render3DAdapter.js';
import { Life } from '../src/inkbox/sim/life.js';
import { World } from '../src/inkbox/world/World.js';
import { TERRAIN } from '../src/inkbox/core/config.js';
import { recomputeAll } from '../src/inkbox/world/terrain.js';
import { worldGeneration, renderFrame } from '../src/inkbox/presentation/readView/index.js';
import { manageCommittedWorlds, beginCompleteStep, publishCompleteStep, assertLegacyReadAllowed,
  disposeCommittedWorlds } from '../src/inkbox/presentation/readView/committedStore.js';

const world=fixture();manageCommittedWorlds(world);
const {sandbox:sb,canvas}=setup('raise',world);
sb.committedAuthorityAvailable=()=>{try{assertLegacyReadAllowed(sb.world);return true;}catch{return false;}};
const commands=[],dispatch=sb.commandBridge.dispatch.bind(sb.commandBridge);
sb.commandBridge.dispatch=(command,execute)=>{commands.push(JSON.parse(JSON.stringify(command)));return dispatch(command,execute);};
const initial=renderFrame(world),before=savedState(world);
pointer(canvas,'pointerdown',20,20);pointer(canvas,'pointermove',23,20);
assert.equal(renderFrame(world),initial);assert.equal(savedState(world),before,'pending gesture does not mutate authority');
pointer(canvas,'pointerup',24,20);
assert.equal(commands.length,1,'one descriptor for the whole actual G7 gesture');
assert.equal(commands[0].schemaVersion,1);assert.equal(commands[0].type,'terrain-stroke');
assert.equal(commands[0].payload.points.at(-1).x,24,'receipt includes release sample');
assert(sb.lastCommandReceipt.ok);assert.equal(sb.lastCommandReceipt.seq,1);
assert.equal(renderFrame(world).commitSequence,initial.commitSequence+1);
assert.notEqual(savedState(world),before);assert.equal(sb.history.stack.length,1);
assert.equal(initial.geometry.height[world.idx(20,20)],JSON.parse(before).height[world.idx(20,20)]);
const completed=renderFrame(world),after=savedState(world);
const idle=Object.create(Render3DAdapter.prototype);idle.sandbox=sb;
assert.equal(idle.commitPowerStroke(null),false);assert.equal(idle.commitDrainStroke(null),false);
assert.equal(commands.length,1,'unconditional Three pointerup checks cannot issue empty commands');
assert.equal(renderFrame(world),completed);
for(const command of [
  {...commands[0],seq:1},
  {...commands[0],seq:2,issuedAtCommittedDay:-1},
  {...commands[0],seq:2,schemaVersion:2},
  {...commands[0],seq:2,worldGeneration:worldGeneration(world)+999},
  {...commands[0],seq:2,payload:new Map()},
]){let ran=false;assert.equal(dispatch(command,()=>{ran=true;}).ok,false);assert.equal(ran,false);}
assert.equal(savedState(world),after);assert.equal(renderFrame(world),completed);
beginCompleteStep(world);world.day+=3;
pointer(canvas,'pointerdown',25,20);pointer(canvas,'pointerup',25,20);
assert.equal(renderFrame(world),completed);assert.equal(sb.history.stack.length,1);
assert.equal(dispatch({...commands[0],seq:2},()=>{throw Error('ran busy command');}).reason,'world-unavailable');
publishCompleteStep(world);
const fresh=sb.commandBridge.create('power',{toolId:'heal'});
assert.equal(fresh.seq,2,'refusals do not consume order');
assert.equal(dispatch(fresh,()=>true).ok,true);
const last=renderFrame(world),bridge=new CommandBridge(()=>world),fault=bridge.create('power',{});
assert.throws(()=>bridge.dispatch(fault,()=>{world.height[0]=.91;throw Error('real operation failed');}),/operation failed/);
assert.equal(renderFrame(world),last);assert.throws(()=>assertLegacyReadAllowed(world),/prohibited/);
assert.equal(bridge.dispatch(bridge.create('undo'),()=>true).reason,'world-unavailable');
disposeCommittedWorlds(world);
assert.equal(bridge.dispatch(fault,()=>true).ok,false);
// Actual registered click powers, using the production Canvas handlers and
// native tool.apply/History, including same-day death and retained old frames.
{
  const w=new World(64,48,1023001);w.height.fill(.55);w.type.fill(TERRAIN.GRASS);w.veg.fill(.2);recomputeAll(w);
  const life=new Life(w,()=>.5);life.spawn(20,20,'human',2);
  assert.equal(w.entities.length,2);manageCommittedWorlds(w);
  const {sandbox:k,canvas:c}=setup('lightning',w),old=renderFrame(w),day=w.day;
  const e=w.entities[0],x=Math.floor(e.x),y=Math.floor(e.y);
  pointer(c,'pointerdown',x,y);assert(k.lastCommandReceipt.ok);
  assert.equal(w.day,day);assert(w.entities.some(e=>e.hp<=0),'native lightning damages real people');
  assert(renderFrame(w).entities.some(e=>e.hp<=0));assert(old.entities.every(e=>e.hp>0));
  k.toolId='erase';pointer(c,'pointerdown',x,y);
  assert(k.lastCommandReceipt.ok);assert.equal(k.lastCommandReceipt.seq,2);assert.equal(w.day,day);
  assert.equal(renderFrame(w).commitSequence,old.commitSequence+2);
  assert.deepEqual(renderFrame(w).entities.map(e=>e.hp),w.entities.map(e=>e.hp));
  disposeCommittedWorlds(w);
}
console.log('E2R-a.2: real whole G7 gesture descriptor/receipt, ordered refusals, busy isolation and failed command retain last complete frame');
