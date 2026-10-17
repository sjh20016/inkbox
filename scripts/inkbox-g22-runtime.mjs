import assert from 'node:assert/strict';
import { fixture } from './inkbox-g1-fixtures.mjs';
import { buildCharacterViewModel, createSelectionToken } from '../src/inkbox/g1/characterRuntime.js';
import { createCombatObservationRuntime, combatPointVisible } from '../src/inkbox/g2/combatObservationRuntime.js';
import { PresentationStage } from '../src/inkbox/render/presentationStage.js';
import { serializeWorld, deserializeWorld } from '../src/inkbox/io/save.js';
import { runtimeEventStats } from '../src/inkbox/core/runtimeEvents.js';
import { MERCY, MERCY_SEED_KEY } from '../src/inkbox/sim/life.js';
import { mulberry32 } from '../src/inkbox/core/noise.js';
import { advanceWorld } from '../src/inkbox/sim/advance.js';
import { accessBounds } from '../src/inkbox/core/mapAccess.js';
import { RegionMask } from '../src/inkbox/ui/RegionMask.js';
import { RegionGeometry } from '../src/inkbox/render3d/region/RegionGeometry.js';
let checks=0;
function check(label,run){run();checks++;console.log('✓ '+label);}
function pair(seed=801){
  const f=fixture(seed),a=f.entity;
  for(let n=0;n<100&&f.world.entities.length===0;n++)f.life.spawn(a.x,a.y,'cultivator',1);
  const before=new Set(f.world.entities);
  for(let n=0;n<100;n++){if(f.life.spawn(a.x,a.y,'cultivator',1)>0)break;}
  const b=f.world.entities.find(e=>!before.has(e));assert(b,'Official Life.spawn creates target');
  for(const e of [a,b]){e.hp=e.maxHp=2000;e.restUntil=0;e.level=4;}
  b.x=a.x+.5;b.y=a.y;delete a.intent;f.world.day=7.25;
  let active=f.world,focus=[],visible=true;
  const stage=new PresentationStage();
  const runtime=createCombatObservationRuntime({getWorld:()=>active,getStage:()=>stage,getCharacter:()=>buildCharacterViewModel(active,'mortal:'+b.id),isVisible:()=>visible,onFocus:p=>focus.push(p)});
  const ingest=()=>{stage.ingestWorlds(active);return runtime.refresh({ingestedWorld:active});};
  return {...f,a,b,stage,runtime,ingest,focus,setWorld:w=>active=w,setVisible:v=>visible=v};
}
check('真实无intent命中：准确event.day，health事实，unknown不冒充持续fighting；冻结纯度与队列唯一消费',()=>{
  const f=pair();f.life.attack(f.a,f.b,.1);const hp=f.b.hp;assert(hp<2000);
  assert.equal(runtimeEventStats(f.world).combatQueued,1);const vm=f.ingest();assert.equal(vm.events[0].day,7.25);assert.equal(vm.focusedCharacter.combatStatus,'wounded');
  const health=buildCharacterViewModel(f.world,'mortal:'+f.b.id).health;assert.equal(health.hp,hp);assert.equal(health.maxHp,2000);assert.equal(health.state,'wounded');
  assert(Object.isFrozen(health));assert(Object.isFrozen(vm.events[0]));assert.throws(()=>vm.events[0].day=99,TypeError);
  const saved=JSON.stringify(serializeWorld(f.world)),draws=f.draws(),log=JSON.stringify(f.b.log),queue=runtimeEventStats(f.world);
  for(let n=0;n<20;n++){f.runtime.refresh();buildCharacterViewModel(f.world,'mortal:'+f.b.id);}
  assert.equal(JSON.stringify(serializeWorld(f.world)),saved);assert.equal(f.draws(),draws);assert.equal(JSON.stringify(f.b.log),log);assert.deepEqual(runtimeEventStats(f.world),queue);
  f.b.hp=f.b.maxHp;const full=f.runtime.refresh();assert.equal(full.focusedCharacter.combatStatus,'unknown');
});
check('宿主只用当前真坐标；expire/ID reuse/death/visibility/读档均拒旧定位',()=>{
  const f=pair();f.life.attack(f.a,f.b,.1);const event=f.ingest().events[0];
  f.b.x+=1;assert(f.runtime.handleAction({type:'locate-combat',eventId:event.id,x:-999,y:-999,plane:'nether'}).ok);assert.equal(f.focus.at(-1).x,f.b.x);assert.equal(f.focus.at(-1).plane,'mortal');
  f.setVisible(false);assert.equal(f.runtime.handleAction({type:'locate-combat',eventId:event.id}).ok,false);f.setVisible(true);
  const index=f.world.entities.indexOf(f.b);f.world.entities[index]={...f.b};assert.equal(f.runtime.handleAction({type:'locate-combat',eventId:event.id}).ok,false);
  assert.deepEqual(f.runtime.refresh().events,[]);assert.deepEqual(f.runtime.refresh().events,[],'An old hit cannot rebind to a reused ID on a later refresh');f.world.entities[index]=f.b;
  f.b.hp=0;assert.equal(f.runtime.handleAction({type:'locate-combat',eventId:event.id}).ok,false);f.b.hp=100;
  f.stage.update(10);assert.equal(f.runtime.handleAction({type:'locate-combat',eventId:event.id}).ok,false);
  f.world.day++;f.life.attack(f.a,f.b,.01);const old=f.ingest().events[0];f.setWorld(deserializeWorld(serializeWorld(f.world)));
  assert.equal(f.runtime.handleAction({type:'locate-combat',eventId:old.id}).ok,false);assert.deepEqual(f.runtime.current().events,[]);assert.deepEqual(f.runtime.refresh().events,[]);
  f.runtime.destroy();assert.equal(f.runtime.current(),null);assert.equal(f.runtime.handleAction({type:'locate-combat',eventId:old.id}).reason,'destroyed');
});
check('FX关闭/expiry/队列拥塞：气血与正式日志不依赖演出，缓存有界',()=>{
  const f=pair();for(let n=0;n<100;n++){f.world.day++;f.life.attack(f.a,f.b,.001);}assert(runtimeEventStats(f.world).combatDropped>0);
  const hp=f.b.hp,log=JSON.stringify(f.b.log);assert(f.ingest().events.length<=24);f.stage.setCombatEnabled(false);assert.equal(f.runtime.refresh().events.length,0);
  assert.equal(buildCharacterViewModel(f.world,'mortal:'+f.b.id).health.hp,hp);assert.equal(JSON.stringify(f.b.log),log);
  f.stage.setCombatEnabled(true);f.world.day++;f.life.attack(f.a,f.b,.01);f.ingest();f.stage.update(10);f.runtime.refresh();assert.equal(f.runtime.current().events.length,0);assert.equal(buildCharacterViewModel(f.world,'mortal:'+f.b.id).health.hp,f.b.hp);
});
check('真实mercy、养伤及恢复；真实死亡正式记录仍保留但不伪造死者hp0',()=>{
  for(const spared of [true,false]){
    let seed=1;while((mulberry32((seed^MERCY_SEED_KEY)>>>0)()<MERCY)!==spared)seed++;
    const f=pair(seed),token=createSelectionToken(f.world,'mortal:'+f.b.id);f.b.hp=1;f.a.level=40;f.life.attack(f.a,f.b,100);
    if(spared){assert(f.b.hp>0);const health=buildCharacterViewModel(f.world,token).health;assert.equal(health.state,'recovering');assert.equal(health.restRemaining,f.b.restUntil-f.world.day);assert(f.b.log.some(row=>row.kind==='duel'));f.world.day=f.b.restUntil;assert.equal(buildCharacterViewModel(f.world,token).health.restRemaining,0);f.b.hp=f.b.maxHp;assert.equal(buildCharacterViewModel(f.world,token).health.state,'healthy');}
    else{assert(f.b.hp<=0);f.life.onDeath(f.b);f.world.entities=f.world.entities.filter(e=>e!==f.b);const dead=buildCharacterViewModel(f.world,token);assert.equal(dead.identity.status,'dead');assert.equal(dead.health.hp,null);assert.equal(dead.health.maxHp,null);assert.equal(dead.health.state,'unknown');assert(dead.overview.some(row=>row.label==='气血'&&row.value==='气血不可考'));assert(f.world.dead.some(row=>row.id===f.b.id));}
  }
});
check('缺失字段不可考；暂停读档的子界旧日期不改根轴养伤期限',()=>{
  const f=pair();delete f.b.maxHp;delete f.b.restUntil;const unknown=buildCharacterViewModel(f.world,'mortal:'+f.b.id);assert.equal(unknown.health.maxHp,null);assert.equal(unknown.health.restRemaining,null);assert.equal(unknown.health.state,'unknown');
  const upper={...f.a,id:999,hp:80,maxHp:100,restUntil:12};f.world.upper.entities.push(upper);f.world.day=100;f.world.upper.day=10;
  const loaded=deserializeWorld(serializeWorld(f.world));assert.equal(loaded.day,100);assert.equal(loaded.upper.day,10);
  const vm=buildCharacterViewModel(loaded,'upper:999');assert.equal(vm.health.restRemaining,0);assert.equal(vm.health.day,100);
  loaded.day=NaN;assert.equal(buildCharacterViewModel(loaded,'upper:999').health.restRemaining,null);
});
check('可见性与可达plane契约：Canvas窗遮蔽、Three单界、越界、关闭子窗',()=>{
  const f=pair();const sb={world:f.world,getRealmViewState:()=>({open:true,targetPlane:'upper',region:{contains:()=>true}})};
  assert.equal(combatPointVisible(sb,'mortal',f.a.x,f.a.y),false);assert.equal(combatPointVisible(sb,'upper',f.a.x,f.a.y),true);assert.equal(combatPointVisible(sb,'nether',f.a.x,f.a.y),false);
  sb.getRealmViewState=()=>({open:false});assert.equal(combatPointVisible(sb,'upper',f.a.x,f.a.y),false);sb.render3d={active:true,renderer:{activePlane:'nether'}};
  assert.equal(combatPointVisible(sb,'nether',f.a.x,f.a.y),true);assert.equal(combatPointVisible(sb,'mortal',f.a.x,f.a.y),false);assert.equal(combatPointVisible(sb,'nether',-1,1),false);
});
check('交战近讯遵守实际绘制的渐进边界，不暴露边界外的小数人物',()=>{
  const f=pair();f.world.mapProgress={stage:0};
  const bounds=accessBounds(f.world),sb={world:f.world,getRealmViewState:()=>({open:false})};
  assert.equal(combatPointVisible(sb,'mortal',bounds.x1,bounds.y1),true);
  assert.equal(combatPointVisible(sb,'mortal',bounds.x1+.9,bounds.y1+.9),false);
  assert.equal(combatPointVisible(sb,'mortal',bounds.x1+1,bounds.y1),false);
  assert.equal(combatPointVisible(sb,'mortal',bounds.x0-.01,bounds.y0),false);
});
check('Three 斜边近讯归属与实体几何一致，Canvas 保留精确多边形裁剪',()=>{
  const f=pair(),region=new RegionMask({path:[[2,2],[18,2],[2,10]],x0:2,y0:2,x1:18,y1:10,area:64});
  const geometry=new RegionGeometry(f.world,region);
  const sb={world:f.world,render3d:{active:true,renderer:{activePlane:'mortal'}},getRealmViewState:()=>({open:true,targetPlane:'upper',region})};
  for(const [x,y] of [[7.1,7.1],[8.9,6.9]]){
    const quadInside=geometry.isInsideCell(x,y),pointInside=region.contains(x,y);
    assert.notEqual(quadInside,pointInside,'Fixture must straddle a real sloping boundary');
    sb.render3d.active=true;
    assert.equal(combatPointVisible(sb,'upper',x,y),quadInside);
    assert.equal(combatPointVisible(sb,'mortal',x,y),!quadInside);
    sb.render3d.active=false;
    assert.equal(combatPointVisible(sb,'upper',x,y),pointInside);
    assert.equal(combatPointVisible(sb,'mortal',x,y),!pointInside);
  }
});
check('隐藏近讯不泄露人物；readiness标记不复制Stage；无关子界替换保留凡间近讯',()=>{
  const f=pair();f.life.attack(f.a,f.b,.1);f.setVisible(false);assert.deepEqual(f.ingest().events,[]);f.setVisible(true);assert.equal(f.runtime.refresh().events.length,1);
  let copied=0;const original=f.stage.snapshotPlane.bind(f.stage);f.stage.snapshotPlane=plane=>{copied++;return original(plane);};
  f.runtime.refresh({ingestedWorld:f.world,readyOnly:true});assert.equal(copied,0);
  const old=f.world.upper;f.world.upper=deserializeWorld(serializeWorld(old));f.runtime.refresh();assert.equal(f.runtime.current().events.length,1,'Mortal entries survive unrelated child replacement');
});
check('正式上界推进确认离世：根日期令牌与缺失气血事实一致',()=>{
  const f=pair(701),e=f.world.upper.entities.find(e=>e.hp>0);assert(e);
  const token=createSelectionToken(f.world,'upper:'+e.id);assert(token);e.hp=0;
  for(let n=0;n<15;n++)advanceWorld(f.world,1,{life:f.life,upperLife:f.upperLife,rng:f.ecoRng,state:f.state});
  const vm=buildCharacterViewModel(f.world,token);assert(vm);assert.equal(vm.identity.status,'dead');assert.equal(vm.health.hp,null);assert.equal(vm.health.maxHp,null);assert.equal(vm.health.state,'unknown');
});
console.log(`G22 runtime: ${checks} groups passed`);
