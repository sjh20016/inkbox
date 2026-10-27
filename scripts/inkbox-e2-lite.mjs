#!/usr/bin/env node
import assert from 'node:assert/strict';
import { World } from '../src/inkbox/world/World.js';
import { Life } from '../src/inkbox/sim/life.js';
import { History } from '../src/inkbox/sim/powers.js';
import { TERRAIN } from '../src/inkbox/core/config.js';
import { rngStream } from '../src/inkbox/core/noise.js';
import { advanceWorld, createAdvanceState } from '../src/inkbox/sim/advance.js';
import { captureRuntimeState } from '../src/inkbox/sim/runtimeState.js';
import { serializeWorld, deserializeWorld, savedRuntimeOf } from '../src/inkbox/io/save.js';
import { readJournal, normalizeJournal, personRef, resolveJournalPerson, planToolReceipt, commitReceipt,
  recordBurnReceipt, receiptRevisit, createVow, abandonVow, settleVows } from '../src/inkbox/sim/journal.js';

let checks = 0;
const test = (name, fn) => { fn(); checks++; console.log(`✓ ${name}`); };
function fixture() {
  const world = new World(64,64,61001);
  world.height.fill(.48); world.type.fill(TERRAIN.GRASS); world.veg.fill(.5); world.temp.fill(.55); world.moist.fill(.2);
  const life = new Life(world,rngStream(61001));
  life.spawn(32,32,'human',1,0); const person = world.entities.at(-1);
  person.level = 9;
  const village = { id:7,name:'松溪',x:32,y:32,pop:12,hp:100,food:100,houses:[],history:[],age:100 };
  world.villages.push(village); world.nextVillageId = 8;
  return { world,life,person,village,advanceState:createAdvanceState(),playerRng:rngStream(22) };
}
const personVow = f => createVow(f.world,'breakthrough',personRef(f.world,'mortal',f.person.id));
function burn(world,meta={toolId:'burn',x:32,y:32,radius:4}) {
  const before = { h:.48,w:0,o:0,t:1,s:0,v:.5,f:0,n:0 };
  return recordBurnReceipt(world,meta,new Map([[5,before],[6,before]]),new Map([[5,{...before,v:0,f:1}],[6,before]]));
}
test('无新块读取、回访与无效动作均不创建metadata', () => {
  const f = fixture(); assert.equal(readJournal(f.world).receipts.length,0);
  assert.equal(burn(f.world,{toolId:'drain'}),null);
  assert.equal(recordBurnReceipt(f.world,{toolId:'burn'},new Map(),new Map()),null);
  assert.equal(planToolReceipt({world:f.world},{world:f.world,tool:'root'},{changed:false}),null);
  assert.equal('journal' in f.world,false); assert.equal('observeEcho' in f.world,false);
});
test('焚林按独立真实差分计格，保存有界样本、回访纯读', () => {
  const {world} = fixture(); const r = burn(world);
  assert.equal(r.changedCells,1); assert.equal(r.samples.length,1);
  const before = JSON.stringify(world.journal); assert.equal(receiptRevisit(world,r).following.length,1);
  assert.equal(JSON.stringify(world.journal),before);
  const many = new Map(Array.from({length:50},(_,i)=>[i,{h:0,w:0,o:0,t:0,s:0,v:1,f:0,n:0}]));
  const now = new Map([...many].map(([i,s])=>[i,{...s,v:0}]));
  const large = recordBurnReceipt(world,{toolId:'burn'},many,now); assert.equal(large.changedCells,50); assert.equal(large.samples.length,16);
});
test('正式焚林 History.undo 成功后按笔录 ID 标记撤销并保存，旧 v1 记录仍兼容', () => {
  const {world} = fixture(), hist = new History(), i = world.idx(30,31);
  hist.begin({toolId:'burn',x:30,y:31,radius:2});
  hist.record(world,i);
  world.veg[i] = .11;
  assert.equal(hist.end('焚林'),true);
  const receipt = readJournal(world).receipts[0];
  assert.equal(receipt.kind,'burn');
  assert.equal(receipt.undo,undefined);
  assert.equal(hist.undo(world),'焚林');
  const updated = readJournal(world).receipts[0];
  assert.deepEqual(updated.undo,{status:'undone',day:world.day});
  assert(receiptRevisit(world,updated).direct.some(x => x.includes('已成功撤销')));
  assert.equal(hist.undo(world),null);
  assert.equal(readJournal(world).receipts[0].undo.status,'undone');
  assert.deepEqual(deserializeWorld(serializeWorld(world)).journal.receipts[0].undo,updated.undo);
  const legacy = serializeWorld(world); delete legacy.journal.receipts[0].undo;
  assert.equal(deserializeWorld(legacy).journal.receipts[0].undo,undefined);
  const damaged = serializeWorld(world); damaged.journal.receipts[0].undo.status='refused';
  assert.throws(() => deserializeWorld(damaged), /手札数据损坏/);
});
test('焚林撤销被后续地形修改拒绝时不得误记已撤销', () => {
  const {world} = fixture(), hist = new History(), i=world.idx(31,32);
  hist.begin({toolId:'burn',x:31,y:32,radius:2});
  hist.record(world,i); world.veg[i]=.25;
  assert.equal(hist.end('焚林'),true);
  world.veg[i]=.33;
  assert.equal(hist.undo(world),null);
  assert.match(hist.lastUndoFailure,/后续变化/);
  assert.equal(readJournal(world).receipts[0].undo,undefined);
  assert.equal(hist.stack.length,1,'refused undo must preserve history stack');
});
test('自然格快照按内容比较，重复焚林不因新对象伪增计格', () => {
  const {world}=fixture(); const cell={h:0,w:0,o:0,t:0,s:0,v:0,f:1,n:{fire:{id:2,dueDay:30},overlay:null,flood:null}};
  assert.equal(recordBurnReceipt(world,{toolId:'burn'},new Map([[5,cell]]),new Map([[5,structuredClone(cell)]])),null);
  const changed=structuredClone(cell); changed.n.fire.dueDay=60;
  const r=recordBurnReceipt(world,{toolId:'burn'},new Map([[5,cell]]),new Map([[5,changed]]));
  assert.equal(r.samples[0].after.n.fireDueDay,60); normalizeJournal(world.journal);
});
test('32笔上限、淘汰计数及拷贝隔离', () => {
  const {world} = fixture(); for(let i=0;i<35;i++) burn(world);
  const j=readJournal(world); assert.equal(j.receipts.length,32); assert.equal(j.discardedReceipts,3);
  j.receipts.length=0; assert.equal(readJournal(world).receipts.length,32); normalizeJournal(world.journal);
});
test('赐根只保存原人真实灵根或修为变化、计划不写世界', () => {
  const f=fixture(), ctx={world:f.world};
  const before={world:f.world,tool:'root',x:32,y:32,radius:2,entities:new Map([[f.person.id,{level:f.person.level,root:f.person.root}]])};
  assert.equal(planToolReceipt(ctx,before,{changed:true}),null);
  f.person.level=10;
  const p=planToolReceipt(ctx,before,{changed:true,subjectIds:[],changedPeople:1});
  assert.equal(p.changedPeople,1); assert.equal(p.people[0].ref.id,f.person.id); assert.equal('journal' in f.world,false);
  const receipt=commitReceipt(f.world,p); assert.equal(receipt.id,1);
  f.person.name='改名'; f.world.entities.push({...f.person,id:999,name:p.people[0].ref.name,level:60});
  assert.equal(resolveJournalPerson(f.world,p.people[0].ref).entity.id,f.person.id);
});
test('未定义0修为/空灵根不伪增人物，非人不能立修士愿', () => {
  const f=fixture(); const beast={id:999,sp:'beast',hp:100,name:'兽',x:30,y:30}; f.world.entities.push(beast);
  const before={world:f.world,tool:'root',entities:new Map([[999,{level:0,root:null}]])};
  assert.equal(planToolReceipt({world:f.world},before,{changed:true}),null);
  assert.equal(personRef(f.world,'mortal',999),null);
  assert.equal(createVow(f.world,'breakthrough',{plane:'mortal',id:999,key:'mortal:999'}).ok,false);
});
test('降灾只接受正式新active事件，空悬/旧事件不留笔', () => {
  const {world}=fixture(); const before={world,tool:'crisis',x:32,y:32,nextEventId:4};
  const ctx={world,events:{activeCrises:[{id:3,status:'active',villageId:7,byPlayer:true}]}};
  assert.equal(planToolReceipt(ctx,before,{changed:true}),null);
  const event={id:4,status:'active',villageId:7,byPlayer:true,name:'兽灾',villageName:'松溪',startedDay:0,durationDays:720};
  ctx.events.activeCrises.push(event); const p=planToolReceipt(ctx,before,{changed:true}); assert.equal(p.eventId,4);
  const r=commitReceipt(world,p); world.worldEventState={activeCrises:[],history:[{...event,status:'resolved',endedDay:720,outcome:'原聚落熬过兽灾。'}]};
  assert.equal(receiptRevisit(world,r).following[0].day,720);
  world.worldEventState.history[0].id=5; assert.equal(receiptRevisit(world,r).following.length,0);
});
test('聚落十年存续、重复检查不重复归档', () => {
  const f=fixture(); const v=createVow(f.world,'settlement',{id:7}).vow;
  f.world.day=v.dueDay; assert.equal(settleVows(f.world),1); assert.equal(settleVows(f.world),0);
  assert.equal(readJournal(f.world).vows.archive[0].status,'fulfilled');
});
test('聚落期限内荒废、失考和到期后荒废采用真实日期', () => {
  for(const [destroyed,expected] of [[10,'failed'],[3601,'fulfilled'],[null,'lost']]) {
    const f=fixture(); createVow(f.world,'settlement',{id:7}); f.world.villages=[];
    if(destroyed!==null) f.world.settlementRuins=[{...f.village,destroyedDay:destroyed,reason:'正式荒废'}];
    f.world.day=3610; settleVows(f.world); assert.equal(readJournal(f.world).vows.archive[0].status,expected);
  }
});
test('聚落仅凡界身份、无荒废日期明确失考', () => {
  const f=fixture(); assert.equal(createVow(f.world,'settlement',{plane:'upper',id:7}).ok,false);
  createVow(f.world,'settlement',{id:7}); assert.equal(readJournal(f.world).vows.active[0].ref.plane,'mortal');
  f.world.villages=[]; f.world.settlementRuins=[{...f.village,reason:'旧史缺日'}]; f.world.day=4000;
  settleVows(f.world); assert.equal(readJournal(f.world).vows.archive[0].status,'lost');
  const bad=readJournal(f.world); bad.vows.archive[0].ref.plane='upper'; assert.throws(()=>normalizeJournal(bad));
});
test('破境必须跨大境界，普通等级增长不成愿', () => {
  const f=fixture(); f.person.level=1; personVow(f); f.person.level=2; f.world.day=30;
  settleVows(f.world); assert.equal(readJournal(f.world).vows.active.length,1);
  f.person.level=10; settleVows(f.world); assert.equal(readJournal(f.world).vows.archive[0].status,'fulfilled');
});
test('同日旧破境记录排除；期限后突破不倒算', () => {
  const f=fixture(); f.person.log=[{day:0,kind:'breakthrough',text:'旧突破'}];
  const v=personVow(f).vow; f.world.day=v.dueDay+10; f.person.level=10;
  f.person.log.push({day:f.world.day,kind:'breakthrough',text:'期限后的突破'});
  settleVows(f.world); assert.equal(readJournal(f.world).vows.archive[0].status,'unresolved');
});
test('期限内低境突破与期限后高境界不能拼作证据', () => {
  const f=fixture(); f.person.level=10; const v=personVow(f).vow;
  f.person.log=[{day:30,kind:'breakthrough',text:'昔日炼气突破'}];
  f.person.level=20; f.world.day=v.dueDay+1;
  f.person.log.push({day:f.world.day,kind:'breakthrough',text:'终于踏入金丹'});
  settleVows(f.world); assert.equal(readJournal(f.world).vows.archive[0].status,'unresolved');
});
test('姓名或地名中的高境界字样不充作突破证据', () => {
  const f=fixture(); f.person.name='金丹'; const v=personVow(f).vow;
  f.person.log=[{day:30,kind:'breakthrough',text:'【金丹】于金丹山闭关，炼气成。出关时山风自开一径。'}];
  f.person.level=20; f.world.day=v.dueDay+1; settleVows(f.world);
  assert.equal(f.world.journal.vows.archive[0].status,'unresolved');
});
test('期限内可靠日志支持跨期限读取；失考与转世不续愿', () => {
  const f=fixture(); const v=personVow(f).vow; f.person.level=10;
  f.person.log.push({day:30,kind:'breakthrough',text:`【${f.person.name}】突破至筑基，周身灵气如潮汐翻涌。`}); f.world.day=v.dueDay+1;
  settleVows(f.world); assert.equal(readJournal(f.world).vows.archive[0].status,'fulfilled');
  const g=fixture(); personVow(g); g.world.entities=[{...g.person,id:999}]; settleVows(g.world);
  assert.equal(readJournal(g.world).vows.archive[0].status,'lost');
});
test('本世死亡与幽魂明确终止；正式跨界身份可以续愿', () => {
  const f=fixture(); personVow(f); f.world.entities=[];
  f.world.dead=[{id:f.person.id,name:f.person.name,died:30,level:9,log:[],fate:'dead'}]; f.world.day=40;
  settleVows(f.world); assert.equal(readJournal(f.world).vows.archive[0].status,'failed');
  const g=fixture(); const ref=personRef(g.world,'mortal',g.person.id); personVow(g); g.world.entities=[];
  g.world.upper={entities:[{...g.person,id:88,level:20}],arrivedLog:[{id:88,fromKey:ref.key,day:20}],dead:[]}; g.world.day=30;
  settleVows(g.world); assert.equal(readJournal(g.world).vows.archive[0].status,'fulfilled');
});
test('活跃2桩、归档12桩、弃愿仅写metadata', () => {
  const f=fixture(); const before=serializeWorld(f.world); const a=personVow(f); createVow(f.world,'settlement',{id:7});
  assert.equal(personVow(f).ok,false); assert.equal(abandonVow(f.world,a.vow.id).ok,true);
  for(let i=0;i<15;i++) { const v=personVow(f); assert.equal(v.ok,true); abandonVow(f.world,v.vow.id); }
  assert.equal(readJournal(f.world).vows.archive.length,12);
  const after=serializeWorld(f.world); delete after.journal; assert.deepEqual(after,before); normalizeJournal(f.world.journal);
});
test('v11保存、旧档兼容、坏新块拒载，G8运行期原样保留', () => {
  const f=fixture(); burn(f.world); personVow(f); const runtime=captureRuntimeState(f);
  const payload=serializeWorld(f.world,{}, {runtime}); const restored=deserializeWorld(payload);
  assert.equal(payload.v,11); assert.deepEqual(readJournal(restored),readJournal(f.world));
  assert.deepEqual(savedRuntimeOf(restored).state,runtime);
  delete payload.journal; assert.equal(readJournal(deserializeWorld(payload)).receipts.length,0);
  const good=readJournal(f.world);
  for(const bad of [null,{}, {...good,v:2},{...good,receipts:Array(33).fill(good.receipts[0])},
    {...good,nextReceiptId:NaN},{...good,vows:{...good.vows,active:Array(3).fill(good.vows.active[0])}},
    {...good,receipts:[{...good.receipts[0],samples:[{}]}]}]) {
    assert.throws(()=>deserializeWorld({...payload,journal:bad}),/手札/);
    assert.deepEqual(readJournal(f.world),good);
  }
});
test('大推进跨到期使用原片段，开启观察与关闭观察世界事实及RNG相同', () => {
  const a=fixture(), b=fixture(); a.world.day=b.world.day=3590;
  a.world.year=b.world.year=9;
  // Create an authentic ten-year vow, then move both worlds to just before due.
  a.world.day=0; const v=createVow(a.world,'settlement',{id:7}).vow; a.world.day=3590;
  // Real Life controllers still run the same authoritative slices in each world.
  for(const f of [a,b]) advanceWorld(f.world,45,{life:f.life,state:f.advanceState,riftActive:false});
  assert.ok(a.world.day>v.dueDay); assert.equal(readJournal(a.world).vows.active.length,0);
  const pa=serializeWorld(a.world),pb=serializeWorld(b.world); delete pa.journal;
  assert.deepEqual(pa,pb); assert.deepEqual(captureRuntimeState(a),captureRuntimeState(b));
});
console.log(`E2-Lite model/save: ${checks} checks passed.`);
