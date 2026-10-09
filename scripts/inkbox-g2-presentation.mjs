import assert from 'node:assert/strict';
import { createFxState, ingestRuntimeEvents, updateFx, drawFx, fxStats, FX_CAP, COMBAT_FX_CAP, COMBAT_FX_PLANE_CAP } from '../src/inkbox/render/fxLayer.js';
import { PresentationStage } from '../src/inkbox/render/presentationStage.js';
import { emitRuntimeEvent, peekRuntimeEvents } from '../src/inkbox/core/runtimeEvents.js';
import { generateWorld } from '../src/inkbox/world/worldgen.js';
import { serializeWorld, deserializeWorld } from '../src/inkbox/io/save.js';
let checks = 0;
const check = (name, fn) => { fn(); checks++; console.log('PASS ' + name); };
const event = (style = 'blade', plane = 'mortal', id = 1) => ({ type:'combat-hit', plane, day:20,
  x:8.75, y:9.25, subjectId:id, targetId:id + 1000, intensity:0.7,
  data:{style, fromX:8.1, fromY:8.6, tier:'low'} });
const major = (type='tribulation', plane='mortal', id=1) => ({type, plane, day:20, x:8, y:9, subjectId:id});
function context() {
  const commands = [];
  const ctx = { save(){}, restore(){}, beginPath(){commands.push(['begin']);},
    moveTo(...v){commands.push(['move',...v]);}, lineTo(...v){commands.push(['line',...v]);},
    stroke(){commands.push(['stroke',this.strokeStyle,this.lineWidth]);}, arc(...v){commands.push(['arc',...v]);}, ellipse(...v){commands.push(['ellipse',...v]);} };
  return { ctx, commands };
}
function camera(offset=0) {
  const projected = [];
  return { zoom:4, viewW:200, viewH:200, projected,
    tileScreen(x,y,h){projected.push([x,y,h]);return [x*4+offset,y*4];}, canAccess(){return true;} };
}
const terrain = {w:32,h:24,height:new Float32Array(32*24),idx:(x,y)=>y*32+x};
terrain.height[terrain.idx(8,9)] = .5; terrain.height[terrain.idx(8,8)] = .25;
check('given-event blade/fire/thunder draw distinct short deterministic Canvas commands at exact entity XY', () => {
  const outputs = [];
  const prevRandom = Math.random; Math.random = () => { throw Error('visuals must not draw RNG'); };
  try {
    const readGuard = new Proxy(terrain, { get(target,key) { if (['entities','day','life','combat','factions'].includes(key)) throw Error('draw must not inspect combat state'); return target[key]; } });
    for (const style of ['blade','fire','thunder']) {
      const fx = createFxState(), given = event(style), cam = camera(), a = context(), b = context();
      ingestRuntimeEvents(fx, [given]); drawFx(a.ctx, cam, readGuard, fx); drawFx(b.ctx, camera(), readGuard, fx);
      assert.ok(a.commands.some(c=>c[0]==='stroke')); assert.deepEqual(a.commands, b.commands);
      assert.deepEqual(cam.projected.slice(0,2), [[8.1,8.6,.25],[8.75,9.25,.5]], 'entity position has no tile-center +.5');
      assert.deepEqual(a.commands.find(c=>c[0]==='move'), ['move',32.4,34.4]);
      assert.ok(a.commands.some(c=>c[0]==='line' && c[1]===35 && c[2]===37));
      assert.ok(!a.commands.some(c=>['arc','ellipse','fillRect'].includes(c[0])), 'combat never becomes a screen flash or broad ring');
      outputs.push(a.commands);
    }
  } finally { Math.random = prevRandom; }
  assert.notDeepEqual(outputs[0], outputs[1]); assert.notDeepEqual(outputs[1], outputs[2]);
  assert.match(outputs[0].find(c=>c[0]==='stroke')[1], /34,32,28/);
  assert.match(outputs[1].find(c=>c[0]==='stroke')[1], /156,65,48/);
  assert.match(outputs[2].find(c=>c[0]==='stroke')[1], /60,78,96/);
});
check('effects expire in .35/.5/.7 real seconds, accepting paused updates and rejecting invalid dt', () => {
  for (const [style, ttl] of [['blade',.35],['fire',.5],['thunder',.7]]) {
    const fx=createFxState(); ingestRuntimeEvents(fx,[event(style)]); assert.equal(fx.items[0].ttl,ttl);
    for (const dt of [0,-1,NaN,Infinity]) updateFx(fx,dt); assert.equal(fx.items[0].age,0);
    updateFx(fx,ttl-.01); assert.equal(fx.items.length,1); updateFx(fx,.011); assert.equal(fx.items.length,0);
  }
});
check('plane/access/viewport and malformed event guards skip invisible combat without reading entities', () => {
  const fx=createFxState(); for(const plane of ['mortal','upper','nether']) ingestRuntimeEvents(fx,[event('blade',plane)]);
  for(const plane of ['mortal','upper','nether']) { const out=context(); drawFx(out.ctx,camera(),terrain,fx,plane); assert.equal(out.commands.filter(c=>c[0]==='stroke').length,2); }
  const outside=context(); drawFx(outside.ctx,camera(500),terrain,fx); assert.equal(outside.commands.length,0);
  const targetHidden=camera(); targetHidden.canAccess=(x)=>x<8.5; const hidden=context(); drawFx(hidden.ctx,targetHidden,terrain,fx); assert.equal(hidden.commands.length,0);
  const sourceHidden=camera(); sourceHidden.canAccess=(x)=>x>8.5; drawFx(hidden.ctx,sourceHidden,terrain,fx); assert.equal(hidden.commands.length,0);
  const bad=createFxState(); ingestRuntimeEvents(bad,[{...event(),data:{style:'fake',fromX:1,fromY:2,tier:'low'}},{...event(),subjectId:0},{...event(),day:NaN}]); assert.equal(bad.items.length,0);
});
check('total64/combat32/plane16 caps and pair/style merge are bounded with readonly stats', () => {
  const fx=createFxState();
  for(const plane of ['mortal','upper','nether']) for(let i=1;i<=30;i++) ingestRuntimeEvents(fx,[event('blade',plane,i)]);
  const stats=fxStats(fx); assert.equal(stats.combatActive,COMBAT_FX_CAP); assert.equal(stats.active,32);
  assert.equal(stats.combatByPlane.mortal,COMBAT_FX_PLANE_CAP); assert.equal(stats.combatByPlane.upper,16); assert.equal(stats.combatByPlane.nether,0);
  assert.equal(stats.combatDropped,58); assert.ok(Object.isFrozen(stats)); assert.ok(Object.isFrozen(stats.byPlane));
  const before=fx.items[0], update=event('blade','mortal',1); update.x=10; update.intensity=1; update.data.tier='mid';
  ingestRuntimeEvents(fx,[update]); assert.equal(fx.items[0],before); assert.equal(before.x,10); assert.equal(fxStats(fx).combatMerged,1); assert.equal(fx.items.length,32);
  const isolated=createFxState(), given=event(); ingestRuntimeEvents(isolated,[given]); given.data.fromX=900; assert.equal(isolated.items[0].data.fromX,8.1);
});
check('combat never evicts major FX; arrivals evict combat before tribulation/ascension/rifts', () => {
  const protectedFx=createFxState();
  for(let i=0;i<FX_CAP;i++) ingestRuntimeEvents(protectedFx,[major(['tribulation','ascension','rift-open'][i%3],'mortal',i)]);
  const keep=protectedFx.items.slice(); for(let i=1;i<=80;i++) ingestRuntimeEvents(protectedFx,[event('blade','mortal',i)]);
  assert.deepEqual(protectedFx.items,keep); assert.equal(fxStats(protectedFx).combatDropped,80);
  const mixed=createFxState();
  for(const plane of ['mortal','upper']) for(let i=1;i<=16;i++) ingestRuntimeEvents(mixed,[event('blade',plane,i)]);
  for(let i=1;i<=32;i++) ingestRuntimeEvents(mixed,[major('ascension','nether',i)]);
  const majors=mixed.items.filter(i=>i.kind!=='combat'); ingestRuntimeEvents(mixed,[major('tribulation','mortal',99)]);
  assert.equal(mixed.items.length,FX_CAP); assert.equal(fxStats(mixed).combatEvicted,1);
  for(const item of majors) assert.ok(mixed.items.includes(item)); assert.equal(fxStats(mixed).combatActive,31);
});
function enqueue(world, given) { const {type,...payload}=given; emitRuntimeEvent(world,type,payload); }
function worlds() { return {plane:'mortal',day:0,upper:{plane:'upper',day:0},nether:{plane:'nether',day:0}}; }
check('Stage is the sole drain consumer and plane snapshots deep-freeze values without second consumption', () => {
  const world=worlds(), stage=new PresentationStage();
  for(const plane of ['mortal','upper','nether']) enqueue(plane==='mortal'?world:world[plane],event('thunder',plane));
  stage.ingestWorlds(world); assert.equal(stage.stats.active,3);
  for(const w of [world,world.upper,world.nether]) assert.equal(peekRuntimeEvents(w).length,0);
  const one=stage.snapshotPlane('upper'); assert.equal(one.items.length,1); assert.ok(Object.isFrozen(one.items[0].data));
  assert.throws(()=>{one.items[0].data.style='fire';},TypeError);
  enqueue(world.upper,event('fire','upper',2)); stage.snapshotPlane('upper'); stage.snapshotPlane('upper');
  assert.equal(peekRuntimeEvents(world.upper).length,1); assert.equal(stage.stats.active,3);
  stage.ingestWorlds(world); assert.equal(stage.snapshotPlane('upper').items.length,2);
  const before=stage.snapshotPlane('mortal'); stage.snapshotPlane('mortal'); assert.deepEqual(before,stage.snapshotPlane('mortal'));
});
check('root load/import/new-world and child replacements clear proper planes; same identity preserves renderer handoff', () => {
  const world=worlds(), stage=new PresentationStage();
  for(const plane of ['mortal','upper','nether']) enqueue(plane==='mortal'?world:world[plane],event('blade',plane));
  stage.ingestWorlds(world); stage.ingestWorlds(world); assert.equal(stage.stats.active,3);
  world.upper={plane:'upper',day:0}; stage.ingestWorlds(world); assert.equal(stage.snapshotPlane('upper').items.length,0); assert.equal(stage.snapshotPlane('mortal').items.length,1); assert.equal(stage.snapshotPlane('nether').items.length,1);
  delete world.nether; stage.ingestWorlds(world); assert.equal(stage.stats.active,1);
  stage.ingestWorlds(worlds()); assert.equal(stage.stats.active,0);
  const real=generateWorld({preset:{w:32,h:24},seed:0}); enqueue(real,event()); stage.ingestWorlds(real); assert.equal(stage.stats.active,1);
  const restored=deserializeWorld(JSON.parse(JSON.stringify(serializeWorld(real)))); stage.ingestWorlds(restored); assert.equal(stage.stats.active,0);
  stage.ingestWorlds(null); assert.equal(stage.stats.active,0);
});
check('presentation switch/clear/dispose do not alter serialized World or random streams and preserve major effects', () => {
  const world=generateWorld({preset:{w:32,h:24},seed:0}), stage=new PresentationStage();
  const saved=JSON.stringify(serializeWorld(world)), prevRandom=Math.random;
  Math.random=()=>{throw Error('presentation must not draw RNG');};
  try {
    enqueue(world,event()); enqueue(world,major()); stage.ingestWorlds(world); assert.equal(stage.combatEnabled,true);
    stage.setCombatEnabled(false); assert.equal(stage.stats.combatActive,0); assert.equal(stage.stats.active,1);
    enqueue(world,event('fire')); enqueue(world,major('ascension')); stage.ingestWorlds(world); assert.equal(stage.stats.combatDisabledSkipped,1); assert.equal(stage.stats.active,2); assert.equal(peekRuntimeEvents(world).length,0);
    stage.setCombatEnabled(true); stage.ingestWorlds(world); assert.equal(stage.stats.combatActive,0,'no replay burst when enabling');
    enqueue(world,event('thunder')); stage.ingestWorlds(world).update(.1); assert.equal(stage.stats.combatActive,1);
    stage.drawPlane('mortal',context().ctx,camera(),world); assert.equal(JSON.stringify(serializeWorld(world)),saved);
    stage.clear('mortal'); assert.equal(stage.stats.active,0);
    enqueue(world,event()); stage.ingestWorlds(world); stage.dispose(); stage.dispose(); assert.equal(stage.stats.disposed,true); assert.equal(stage.stats.active,0);
    enqueue(world,event()); stage.ingestWorlds(world).update(1); assert.equal(peekRuntimeEvents(world).length,1,'disposed stage never drains');
    assert.equal(JSON.stringify(serializeWorld(world)),saved);
  } finally { Math.random=prevRandom; }
});
console.log('G2 Canvas + Stage contracts: '+checks+'/'+checks+' passed');
