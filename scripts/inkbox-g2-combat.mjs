import assert from 'node:assert/strict';
import { fixture } from './inkbox-g1-fixtures.mjs';
import { serializeWorld, deserializeWorld } from '../src/inkbox/io/save.js';
import { mulberry32 } from '../src/inkbox/core/noise.js';
import { rollSpiritRoot, expToNext } from '../src/inkbox/core/cultivation.js';
import { MANUALS } from '../src/inkbox/core/lore.js';
import { MERCY, MERCY_SEED_KEY, mercyRngFor } from '../src/inkbox/sim/life.js';
import { advanceWorld } from '../src/inkbox/sim/advance.js';
import { initEntity } from '../src/inkbox/sim/cultivation.js';
import { emitPresentation, configureCombatPresentation, combatPresentationStats, COMBAT_DAY_BUDGET } from '../src/inkbox/sim/presentation.js';
import { emitRuntimeEvent, peekRuntimeEvents, drainRuntimeEvents, runtimeEventStats, RUNTIME_EVENT_CAP, COMBAT_RUNTIME_EVENT_CAP } from '../src/inkbox/core/runtimeEvents.js';

let groups=0;
function check(label,run) { run(); groups++; console.log(`✓ ${label}`); }
function realSpawn(life,x,y) {
  for (let attempt=0;attempt<100;attempt++) if (life.spawn(x,y,'cultivator',1)>0) return true;
  return false;
}
function pair(seed=801) {
  const f=fixture(seed),a=f.entity,w=f.world;
  assert.ok(realSpawn(f.life,a.x,a.y),'real second Life.spawn');
  const b=w.entities.at(-1); assert.notEqual(a,b);
  w.entities=[a,b]; w.pendingSpawns=[];
  for (const e of [a,b]) { e.hp=e.maxHp=2000; e.age=0; e.lifespan=1e9; e.restUntil=0; e.madUntil=0; }
  a.level=4; b.level=4; b.x=a.x+0.5; b.y=a.y; a.tx=a.x; a.ty=a.y; b.tx=b.x; b.ty=b.y;
  drainRuntimeEvents(w);
  return {...f,a,b};
}
function formalRoot(predicate) {
  const rng=mulberry32(18471);
  for (let n=0;n<100000;n++) { const root=rollSpiritRoot(rng); if (predicate(root)) return root; }
  throw new Error('No formal root matched');
}
function attackAndEvent(f) {
  const before=f.b.hp; f.life.attack(f.a,f.b,0.1);
  assert.ok(f.b.hp < before); const events=drainRuntimeEvents(f.world).filter(e => e.type==='combat-hit');
  assert.equal(events.length,1); return events[0];
}
const combatPayload=(id=1) => ({plane:'mortal',day:1,x:5,y:6,subjectId:id,targetId:id+100000,intensity:0.5,data:{style:'blade',fromX:4,fromY:6,tier:'low'}});

check('严格combat-hit schema：正safe整数distinct IDs、枚举/坐标/intensity/纯值与隔离快照',() => {
  const w={plane:'mortal',day:1}; const event=emitRuntimeEvent(w,'combat-hit',combatPayload());
  assert.equal(event.type,'combat-hit'); event.data.style='fire'; assert.equal(peekRuntimeEvents(w)[0].data.style,'blade');
  const invalids=[{subjectId:'1'},{subjectId:0},{targetId:1},{targetId:2.2},{subjectId:Number.MAX_SAFE_INTEGER+1},{x:NaN},{intensity:1.1},{intensity:Infinity},
    {data:{style:'fake',fromX:1,fromY:2,tier:'low'}},{data:{style:'blade',fromX:1,fromY:2,tier:'fake'}},{data:{style:'blade',fromX:1,fromY:2,tier:'low',entity:{id:1}}}];
  for (const patch of invalids) assert.throws(() => emitRuntimeEvent(w,'combat-hit',{...combatPayload(),...patch}));
  assert.equal(peekRuntimeEvents(w).length,1);
  assert.equal(emitPresentation(w,'combat-hit',{...combatPayload(),x:Infinity}),null);
  const getter={style:'blade',fromX:1,fromY:2,tier:'low'}; Object.defineProperty(getter,'style',{enumerable:true,get(){throw new Error('getter');}});
  assert.equal(emitPresentation(w,'combat-hit',{...combatPayload(),data:getter}),null);
});
check('真实Life.spawn/attack只在实际扣血后发，越距/零hit/已死亡均不伪造命中',() => {
  const f=pair(),w=f.world;
  f.b.x=f.a.x+5; const hp=f.b.hp,draws=f.draws(); f.life.attack(f.a,f.b,0.1);
  assert.equal(f.b.hp,hp); assert.equal(f.draws(),draws); assert.equal(peekRuntimeEvents(w).length,0);
  f.b.x=f.a.x+0.5; f.life.attack(f.a,f.b,0); assert.equal(f.b.hp,hp); assert.equal(peekRuntimeEvents(w).length,0);
  const event=attackAndEvent(f); assert.equal(event.subjectId,f.a.id); assert.equal(event.targetId,f.b.id); assert.equal(event.plane,'mortal');
  assert.equal(event.x,f.b.x); assert.equal(event.data.fromX,f.a.x); assert.equal(event.data.fromY,f.a.y);
  assert.ok(event.intensity>=0.2 && event.intensity<=1); assert.deepEqual(Object.keys(event.data).sort(),['fromX','fromY','style','tier']);
  f.b.hp=0; f.world.day+=1; f.life.attack(f.a,f.b,0.1); assert.equal(peekRuntimeEvents(w).length,0);
  const stats=combatPresentationStats(w); assert.equal(stats.attempts,4); assert.equal(stats.hits,1); assert.equal(stats.emitted,1); assert.ok(Object.isFrozen(stats));
});
check('元素是正式灵根/功法提示：火、雷、普通金不冒充雷；真实境界固定tier/intensity',() => {
  const roots={fire:formalRoot(r => r.elements.includes('火') && !['雷灵根','九天雷灵根'].includes(r.rootName)),
    thunder:formalRoot(r => ['雷灵根','九天雷灵根'].includes(r.rootName)),
    blade:formalRoot(r => r.elements.length===1 && r.elements[0]==='金' && !['雷灵根','九天雷灵根'].includes(r.rootName))};
  for (const [style,root] of Object.entries(roots)) {
    const f=pair(802); f.a.root=root; f.a.techniques=[]; f.a.level=style==='fire' ? 10 : style==='thunder' ? 30 : 4;
    const event=attackAndEvent(f); assert.equal(event.data.style,style); assert.equal(event.data.tier,style==='fire' ? 'mid' : style==='thunder' ? 'high' : 'low');
  }
  const f=pair(803); f.a.root=roots.blade; f.a.techniques=[MANUALS.find(m => m.kind==='thunder')]; assert.equal(attackAndEvent(f).data.style,'thunder');
});
check('Mercy提前return仍只发真实一次命中，hook异常/根getter/非法构造不阻断攻击',() => {
  let seed=804; while (mulberry32((seed ^ MERCY_SEED_KEY) >>> 0)() >= MERCY) seed++;
  const mercy=pair(seed); mercy.b.hp=1; mercy.life.attack(mercy.a,mercy.b,10);
  assert.ok(mercy.b.hp>0); assert.ok(mercy.b.restUntil > mercy.world.day); assert.equal(mercy.a.kills,0);
  assert.equal(drainRuntimeEvents(mercy.world).filter(e => e.type==='combat-hit').length,1);
  const f=pair(805),root=f.a.root; Object.defineProperty(f.a,'root',{configurable:true,get(){throw new Error('bad root getter');}});
  const hp=f.b.hp; assert.doesNotThrow(() => f.life.attack(f.a,f.b,0.1)); assert.ok(f.b.hp<hp); assert.equal(peekRuntimeEvents(f.world).length,0);
  Object.defineProperty(f.a,'root',{configurable:true,writable:true,value:root});
  assert.equal(combatPresentationStats(f.world).invalid,1);
  f.world.day+=1; configureCombatPresentation(f.world,{emitter(){throw new Error('bad emitter');}});
  assert.doesNotThrow(() => f.life.attack(f.a,f.b,0.1)); assert.equal(combatPresentationStats(f.world).invalid,2);
  f.world.day+=1; configureCombatPresentation(f.world,{emitter:(w,type,payload) => emitPresentation(w,type,{...payload,intensity:NaN})});
  assert.doesNotThrow(() => f.life.attack(f.a,f.b,0.1)); assert.equal(peekRuntimeEvents(f.world).length,0);
  f.world.day+=1; configureCombatPresentation(f.world,{emitter:null}); assert.equal(attackAndEvent(f).type,'combat-hit');
});
check('单world单日桶定向pair去重、budget24且存储有界；换桶释放，不混world',() => {
  const f=pair(806); f.life.attack(f.a,f.b,0.01); f.life.attack(f.a,f.b,0.01);
  assert.equal(combatPresentationStats(f.world).pairSkipped,1); assert.equal(combatPresentationStats(f.world).hits,2);
  f.life.attack(f.b,f.a,0.01); assert.equal(combatPresentationStats(f.world).emitted,2);
  for (let n=0;n<COMBAT_DAY_BUDGET+10;n++) {
    assert.ok(realSpawn(f.life,f.a.x,f.a.y));
    const target=f.world.entities.at(-1); target.hp=target.maxHp=2000; target.x=f.a.x+0.2; target.y=f.a.y;
    f.life.attack(f.a,target,0.01);
  }
  const stats=combatPresentationStats(f.world); assert.equal(stats.emitted,COMBAT_DAY_BUDGET); assert.equal(stats.bucketPairs,COMBAT_DAY_BUDGET); assert.ok(stats.budgetSkipped>0);
  f.world.day+=1; f.life.attack(f.a,f.b,0.01); assert.equal(combatPresentationStats(f.world).bucketPairs,1); assert.equal(combatPresentationStats(f.world).bucketEmitted,1);
  const other=pair(807); attackAndEvent(other); assert.equal(combatPresentationStats(other.world).emitted,1);
});
check('战斗cap64/总cap256：洪泛不能挤大事件，大事件满队列先驱逐战斗',() => {
  const w={plane:'mortal',day:1};
  for (let n=0;n<COMBAT_RUNTIME_EVENT_CAP;n++) assert.ok(emitRuntimeEvent(w,'combat-hit',combatPayload(n+1)));
  assert.equal(emitRuntimeEvent(w,'combat-hit',combatPayload(500)),null); assert.equal(runtimeEventStats(w).combatDropped,1);
  for (let n=COMBAT_RUNTIME_EVENT_CAP;n<RUNTIME_EVENT_CAP;n++) emitRuntimeEvent(w,'tool-impact',{data:{n}});
  emitRuntimeEvent(w,'ascension',{subjectId:10,data:{proof:'major must survive'}});
  assert.equal(runtimeEventStats(w).queued,256); assert.equal(runtimeEventStats(w).combatQueued,63); assert.equal(runtimeEventStats(w).combatEvicted,1);
  const before=peekRuntimeEvents(w).filter(e => e.type!=='combat-hit');
  for (let n=0;n<1000;n++) assert.equal(emitRuntimeEvent(w,'combat-hit',combatPayload(n+1000)),null);
  assert.deepEqual(peekRuntimeEvents(w).filter(e => e.type!=='combat-hit'),before);
  assert.ok(peekRuntimeEvents(w).some(e => e.type==='ascension' && e.data.proof==='major must survive'));
  const majors={plane:'mortal',day:1}; for (let n=0;n<256;n++) emitRuntimeEvent(majors,'tribulation',{subjectId:n+1});
  const saturated=pair(811);
  for (let n=0;n<256;n++) emitRuntimeEvent(saturated.world,'tribulation',{subjectId:n+1});
  const hp=saturated.b.hp; saturated.life.attack(saturated.a,saturated.b,0.1);
  assert.ok(saturated.b.hp<hp); const sourceStats=combatPresentationStats(saturated.world);
  assert.equal(sourceStats.hits,1); assert.equal(sourceStats.sampled,1); assert.equal(sourceStats.emitted,0); assert.equal(sourceStats.queueDropped,1);
  saturated.life.attack(saturated.a,saturated.b,0.1); assert.equal(combatPresentationStats(saturated.world).pairSkipped,1);
  const retained=peekRuntimeEvents(majors); assert.equal(emitRuntimeEvent(majors,'combat-hit',combatPayload()),null); assert.deepEqual(peekRuntimeEvents(majors),retained);
});
check('源关闭/展示关闭/故障发射与正常攻击：正式World、主RNG、MercyRNG严格等价',() => {
  const variants=[{enabled:true},{enabled:false},{sourceEnabled:false},{emitter(){throw new Error('fault');}}];
  const results=variants.map(options => {
    const f=pair(808); configureCombatPresentation(f.world,options);
    for (let n=0;n<20;n++) { f.world.day+=1; f.life.attack(f.a,f.b,n===10 ? 100 : 0.1); }
    return {raw:serializeWorld(f.world),draws:f.draws(),next:f.rng(),mercy:mercyRngFor(f.world)(),stats:combatPresentationStats(f.world),events:peekRuntimeEvents(f.world)};
  });
  for (const result of results.slice(1)) { assert.deepEqual(result.raw,results[0].raw); assert.equal(result.draws,results[0].draws); assert.equal(result.next,results[0].next); assert.equal(result.mercy,results[0].mercy); }
  assert.ok(results[0].stats.emitted>0); assert.equal(results[1].stats.emitted,0); assert.ok(results[1].stats.disabled>0);
  assert.equal(results[2].stats.emitted,0); assert.ok(results[2].stats.sourceOff>0); assert.ok(results[3].stats.invalid>0);
});
check('advanceWorld正式入魔AI确实产生combat源；source on/off完整模拟与RNG严格等价',() => {
  function run(enabled) {
    const f=pair(809); configureCombatPresentation(f.world,{sourceEnabled:enabled});
    f.a.madUntil=f.b.madUntil=120; f.a.level=f.b.level=30; f.a.exp=f.b.exp=0;
    for (let n=0;n<30;n++) advanceWorld(f.world,0.5,{life:f.life,upperLife:f.upperLife,rng:f.ecoRng,state:f.state});
    return {raw:serializeWorld(f.world),draws:f.draws(),next:f.rng(),ecoDraws:f.ecoDraws(),ecoNext:f.ecoRng(),stats:combatPresentationStats(f.world),events:peekRuntimeEvents(f.world)};
  }
  const on=run(true),off=run(false); assert.ok(on.stats.attempts>0); assert.ok(on.stats.hits>0); assert.ok(on.stats.emitted>0);
  assert.ok(on.events.some(e => e.type==='combat-hit')); assert.equal(off.stats.emitted,0);
  for (const field of ['raw','draws','next','ecoDraws','ecoNext']) assert.deepEqual(on[field],off[field]);
});
check('真实UpperLife瓶颈突破产上界tribulation，无上界/幽冥fake combat；存档不保留transient',() => {
  const f=pair(810),upper=f.world.upper;
  const e=initEntity({name:'正式上界瓶颈探针',sp:'cultivator',x:32,y:20},mulberry32(11),{cultivator:true});
  upper.entities=[]; upper.addEntity(e); e.level=60; e.exp=expToNext(60)+1; e.age=0; e.lifespan=1e9;
  e.lastKarmaDay=e.lastTrialDay=upper.day; f.upperLife.rng=() => 0;
  advanceWorld(f.world,10,{upperLife:f.upperLife,state:f.state});
  assert.equal(e.level,61); const events=peekRuntimeEvents(upper);
  assert.ok(events.some(event => event.type==='tribulation' && event.plane==='upper' && event.subjectId===e.id));
  assert.equal(events.some(event => event.type==='combat-hit'),false); assert.equal(peekRuntimeEvents(f.world.nether).some(event => event.type==='combat-hit'),false);
  const before=serializeWorld(f.world); configureCombatPresentation(f.world,{enabled:false}); emitRuntimeEvent(f.world,'combat-hit',combatPayload());
  assert.deepEqual(serializeWorld(f.world),before); const loaded=deserializeWorld(before);
  assert.equal(peekRuntimeEvents(loaded).length,0); assert.equal(combatPresentationStats(loaded).attempts,0); assert.equal(runtimeEventStats(loaded).combatQueued,0);
});
console.log(`G2 combat source: ${groups} groups passed`);
