import { spawnNetherGhost, ghostTierOf, GHOST_TIER_NAMES } from '../src/inkbox/sim/netherLife.js';
import assert from 'node:assert/strict';
import { fixture } from './inkbox-g1-fixtures.mjs';
import { serializeWorld, deserializeWorld } from '../src/inkbox/io/save.js';
import { expToNext } from '../src/inkbox/core/cultivation.js';
import { cultivationRate, ascend } from '../src/inkbox/sim/cultivation.js';
import { rememberDead } from '../src/inkbox/sim/necrology.js';
import { WATCH_CAP } from '../src/inkbox/sim/watch.js';
import { executeHeavenEdict } from '../src/inkbox/sim/heavenEdicts.js';
import { createCharacterController, characterKey, parseCharacterKey, createSelectionToken, resolveCharacter, buildCharacterViewModel, summarizeCharacterObservation } from '../src/inkbox/g1/characterRuntime.js';
let checks = 0;
function check(label,fn) { fn(); checks++; console.log(`✓ ${label}`); }
const f = fixture(), w = f.world, e = f.entity, key = characterKey('mortal',e.id);
let active = w, rendered = null, destroyed = 0;
const c = createCharacterController({getWorld:() => active,presenter:{render(vm){rendered = vm;},destroy(){destroyed++;}}});
const action = (type,extra = {}) => c.handleAction({type,targetKey:key,...extra});
check('严格合法ID和key，拒绝强制类型转换/零/负数/小数/溢出/首零/额外文本',() => {
  assert.equal(characterKey('mortal',1),'mortal:1');
  for (const bad of [0,-1,1.2,NaN,Infinity,'1',Number.MAX_SAFE_INTEGER+1]) assert.equal(characterKey('upper',bad),null);
  for (const bad of ['mortal:0','mortal:01','mortal:-1','mortal:1.1','mortal:1x','mortal:9007199254740992','foo:1',' mortal:1']) assert.equal(parseCharacterKey(bad),null);
});
check('headless presenter收到真实深冻结VM；需求与每日速率来自正式函数',() => {
  assert.ok(c.select({plane:'mortal',entityId:e.id}).ok);
  assert.equal(rendered.cultivation.required,expToNext(e.level));
  assert.equal(rendered.cultivation.rate,cultivationRate(w,e));
  assert.ok(Object.isFrozen(rendered.edicts[0]));
  assert.throws(() => { rendered.identity.name = '伪造'; },TypeError);
  assert.equal(rendered.identity.name,e.name);
});
check('重复读取、refresh、focus/export/relations、摘要不写World、不抽RNG',() => {
  const before = JSON.stringify(serializeWorld(w)), draws = f.draws();
  for (let n=0;n<5;n++) { c.refresh(); buildCharacterViewModel(w,key); summarizeCharacterObservation(w,key); assert.ok(action('focus').ok); assert.ok(action('export').effect.text.length); assert.ok(action('show-relations').ok); }
  assert.equal(JSON.stringify(serializeWorld(w)),before); assert.equal(f.draws(),draws);
});
check('失败敕令零World/RNG/history写入，UI enabled不参与授权',() => {
  const before = JSON.stringify(serializeWorld(w)), draws = f.draws();
  assert.equal(action('edict',{edictId:'fake',enabled:true}).ok,false);
  assert.equal(c.handleAction({type:'edict',targetKey:'mortal:999',edictId:'mind'}).ok,false);
  assert.equal(executeHeavenEdict(w,{world:w,key,entity:e},'mind').ok,false);
  assert.equal(JSON.stringify(serializeWorld(w)),before); assert.equal(f.draws(),draws);
});
check('灌顶25%真实需求、上限clamp、不突破；拨运定心+8 cap100；正式个人/世界history',() => {
  const level = e.level, req = expToNext(level), beforeLog = w.chronicle.length;
  const result = action('edict',{edictId:'cultivation'});
  assert.equal(result.before,0); assert.equal(result.after,req * 0.25); assert.equal(e.exp,result.after);
  e.exp = req - 1; assert.equal(action('edict',{edictId:'cultivation'}).after,req); assert.equal(e.level,level);
  const capped = JSON.stringify(serializeWorld(w)); assert.equal(action('edict',{edictId:'cultivation'}).reason,'at-cap'); assert.equal(JSON.stringify(serializeWorld(w)),capped);
  e.fortune = 98; e.mind = 95;
  assert.equal(action('edict',{edictId:'fortune'}).after,100); assert.equal(action('edict',{edictId:'mind'}).after,100);
  assert.ok(w.chronicle.length > beforeLog); assert.ok(e.log.some(row => row.kind === 'intervention' && row.text.includes('→')));
});
check('记挂直接使用现有cap12；存载保持敕令与观察状态；旧token世界替换后失效且可重选',() => {
  assert.ok(action('watch').ok); assert.equal(w.watch[0].key,key);
  const saved = serializeWorld(w), loaded = deserializeWorld(saved);
  const oldToken = createSelectionToken(w,key); active = loaded;
  assert.equal(action('edict',{edictId:'mind'}).reason,'world-changed'); assert.equal(c.current(),null);
  assert.equal(executeHeavenEdict(loaded,oldToken,'mind').ok,false);
  assert.ok(c.select(key).ok); assert.equal(c.current().watched,true);
  const re = loaded.entities.find(p => p.id === e.id); assert.equal(re.exp,e.exp); assert.equal(re.mind,100); assert.ok(re.log.some(row => row.kind === 'intervention'));
  active = w; c.select(key); action('watch');
  w.watch = Array.from({length:WATCH_CAP},(_,i) => ({key:`mortal:${100000+i}`,lastKnownId:100000+i}));
  assert.equal(action('watch').reason,'full'); assert.equal(w.watch.length,WATCH_CAP); w.watch = [];
});
check('锁区无法选择/敕令/focus；UI forged enabled不能越权',() => {
  const original = {x:e.x,y:e.y}; e.x=0; e.y=0; w.mapProgress.stage=0;
  const before = JSON.stringify(serializeWorld(w));
  assert.equal(action('edict',{edictId:'mind',enabled:true}).reason,'locked-area'); assert.equal(action('focus').ok,false);
  assert.equal(createCharacterController({getWorld:() => w}).select(key).ok,false);
  assert.equal(JSON.stringify(serializeWorld(w)),before); Object.assign(e,original); w.mapProgress.stage=3;
});
check('上界/幽冥可读，按位面分离同ID，禁止跨位面敕令',() => {
  for (const plane of ['upper','nether']) {
    const other = {...e,id:e.id,x:32,y:20}; w[plane].entities.push(other);
    const pick = c.select({plane,entityId:other.id}); assert.ok(pick.ok); assert.equal(pick.viewModel.identity.plane,plane);
    assert.equal(c.handleAction({type:'edict',targetKey:`${plane}:${e.id}`,edictId:'mind'}).reason,'not-living-mortal');
    assert.equal(c.handleAction({type:'focus',targetKey:`${plane}:${e.id}`}).effect.plane,plane);
  }
  c.select(key);
});
check('同ID替换实体令牌失效；世界内容相同也不能复用选择',() => {
  const at=w.entities.indexOf(e); w.entities[at] = {...e};
  assert.equal(action('edict',{edictId:'mind'}).reason,'identity-reused'); assert.equal(c.current(),null);
  w.entities[at]=e; c.select(key);
});
check('死亡可靠dead记录可读，死亡后禁止敕令，不按同名猜，不继承转世',() => {
  rememberDead(w,e); w.entities.splice(w.entities.indexOf(e),1);
  assert.equal(c.refresh().identity.status,'dead'); assert.equal(action('edict',{edictId:'mind'}).ok,false);
  assert.ok(c.select(key).ok); assert.equal(c.refresh().identity.status,'dead'); assert.ok(action('export').ok);
  w.entities.push({...e,id:e.id+100000,pastLife:{id:e.id}}); assert.equal(c.refresh().identity.status,'dead');
});
check('飞升/跌幽冥只认明确fromKey/ghostOf.ref route null；换位面实体引用也防ID复用',() => {
  const f2=fixture(732), w2=f2.world, e2=f2.entity, k2=characterKey('mortal',e2.id), t=createSelectionToken(w2,k2);
  w2.entities.splice(w2.entities.indexOf(e2),1);
  const up={...e2,id:99991}; w2.upper.entities.push(up); const proof={id:up.id,fromKey:k2,day:w2.day,name:e2.name}; w2.upper.arrivedLog.push(proof);
  assert.equal(resolveCharacter(w2,k2,{token:t}).status,'ascended');
  w2.upper.entities[w2.upper.entities.indexOf(up)]={...up}; assert.equal(resolveCharacter(w2,k2,{token:t}).reason,'identity-reused');
  const f3=fixture(733), w3=f3.world, e3=f3.entity,k3=characterKey('mortal',e3.id),t3=createSelectionToken(w3,k3);
  w3.entities.splice(w3.entities.indexOf(e3),1);
  const ghost={...e3,id:77777,ghostOf:{ref:k3,route:'linger',deathDay:w3.day}}; w3.nether.entities.push(ghost);
  assert.equal(resolveCharacter(w3,k3,{token:t3}).status,'unknown'); ghost.ghostOf.route=null;
  assert.equal(resolveCharacter(w3,k3,{token:t3}).status,'nether');
});
check('缺失事实显示不可考；reset/close/destroy稳定生命周期',() => {
  c.close(); assert.equal(c.current(),null); active=w; const x=w.entities.at(-1); delete x.exp; delete x.mind;
  c.select(characterKey('mortal',x.id)); assert.equal(c.current().cultivation.exp,null); assert.equal(c.current().cultivation.rate,null);
  c.reset(); c.destroy(); assert.equal(destroyed,1); assert.equal(c.select(key).reason,'destroyed');
});
check('凡人/满阶/缺失数值失败为中文且零写入；正式Map关系与三界锁区',() => {
  const fx=fixture(735),wx=fx.world,ex=fx.entity,kx=characterKey('mortal',ex.id),cx=createCharacterController({getWorld:() => wx});
  cx.select(kx); ex.level=60; ex.exp=0;
  const before=JSON.stringify(serializeWorld(wx));
  const cap=cx.handleAction({type:'edict',targetKey:kx,edictId:'cultivation'});
  assert.equal(cap.reason,'realm-cap'); assert.match(cap.message,/上限/); assert.equal(JSON.stringify(serializeWorld(wx)),before);
  ex.sp='human'; ex.level=0; assert.equal(cx.refresh().header.realm,'凡人');
  assert.equal(cx.handleAction({type:'edict',targetKey:kx,edictId:'mind'}).reason,'not-cultivator');
  ex.sp='cultivator'; ex.level=4; delete ex.mind;
  assert.equal(cx.handleAction({type:'edict',targetKey:kx,edictId:'mind'}).reason,'missing-value'); ex.mind=60;
  const friend={...ex,id:90001,name:'可靠关系对象'}; wx.entities.push(friend); ex.relations=new Map([[friend.id,{type:'lover',score:90}]]);
  assert.ok(cx.refresh().relations.some(row => row.label==='道侣' && row.value==='可靠关系对象'));
  wx.upper.entities.push({...ex,id:90002,x:0,y:0}); wx.mapProgress.stage=0;
  assert.equal(cx.select('upper:90002').ok,false);
});
check('旧档无watch/mapProgress可重建人物快照与观察入口',() => {
  const fx=fixture(736),raw=serializeWorld(fx.world); raw.v=11; delete raw.watch; delete raw.mapProgress;
  const old=deserializeWorld(raw),cx=createCharacterController({getWorld:() => old}),kx=characterKey('mortal',fx.entity.id);
  assert.ok(cx.select(kx).ok); assert.equal(cx.current().watched,false); assert.ok(cx.handleAction({type:'watch',targetKey:kx}).ok);
});
check('跨界后死亡有可靠生命周期摘要，证明保留窗口并非完整历史',() => {
  const fx=fixture(737),wx=fx.world,ex=fx.entity,kx=characterKey('mortal',ex.id),tx=createSelectionToken(wx,kx);
  wx.entities.splice(wx.entities.indexOf(ex),1); wx.day=10;
  const up={...ex,id:90003}; wx.upper.entities.push(up); wx.upper.arrivedLog.push({id:up.id,fromKey:kx,day:10,name:ex.name});
  assert.equal(buildCharacterViewModel(wx,tx).identity.status,'ascended');
  wx.upper.day=20; rememberDead(wx.upper,up); wx.upper.entities.splice(wx.upper.entities.indexOf(up),1); wx.day=20;
  const vm=buildCharacterViewModel(wx,tx); assert.equal(vm.identity.status,'dead');
  const summary=summarizeCharacterObservation(wx,tx,0); assert.equal(summary.coverage.complete,false);
  assert.ok(summary.events.some(row => row.kind==='ascend' && row.day===10)); assert.ok(summary.events.some(row => row.kind==='death' && row.day===20));
  const deadFixture=fixture(738),dw=deadFixture.world,de=deadFixture.entity,dk=characterKey('mortal',de.id); dw.day=40; rememberDead(dw,de); dw.entities.splice(dw.entities.indexOf(de),1);
  assert.ok(summarizeCharacterObservation(dw,dk,0).events.some(row => row.kind==='death' && row.day===40));
});
check('选择前已存在同ID旧档证据不会绑定新一世；位面替换使跨界引用失效',() => {
  const fx=fixture(739),wx=fx.world,ex=fx.entity,kx=characterKey('mortal',ex.id);
  const oldArrival={id:99998,fromKey:kx,day:wx.day,name:ex.name}; wx.upper.arrivedLog.push(oldArrival);
  wx.dead.push({id:ex.id,name:ex.name,died:wx.day,fate:'dead'});
  const token=createSelectionToken(wx,kx); wx.entities.splice(wx.entities.indexOf(ex),1);
  assert.equal(resolveCharacter(wx,kx,{token}).status,'unknown');
  const migrant={...ex,id:99999}; wx.upper.entities.push(migrant); wx.upper.arrivedLog.push({id:migrant.id,fromKey:kx,day:wx.day,name:ex.name});
  assert.equal(resolveCharacter(wx,kx,{token}).status,'ascended');
  wx.upper={...wx.upper}; assert.equal(resolveCharacter(wx,kx,{token}).reason,'identity-reused');
});
check('正式level50点化blessed飞升按fate解析，不猜上界、不虚构死亡摘要',() => {
  const fx=fixture(740),wx=fx.world,ex=fx.entity,kx=characterKey('mortal',ex.id),cx=createCharacterController({getWorld:() => wx});
  cx.select(kx); ex.level=50; wx.day=42;
  assert.equal(ascend(wx,ex,fx.rng),'ascended');
  wx.entities.splice(wx.entities.indexOf(ex),1);
  assert.ok(wx.dead.some(row => row.id===ex.id && row.fate==='ascended'));
  assert.equal(wx.upper.arrivedLog.some(row => row.fromKey===kx),false);
  const vm=cx.refresh(); assert.equal(vm.identity.status,'ascended'); assert.equal(vm.identity.currentPlane,'unknown');
  assert.equal(vm.identity.canFocus,false); assert.match(vm.header.stateText,/去向不可定位/);
  assert.equal(cx.handleAction({type:'edict',targetKey:kx,edictId:'mind'}).ok,false);
  assert.ok(cx.handleAction({type:'export',targetKey:kx}).effect.text.length > 0);
  const summary=summarizeCharacterObservation(wx,kx,0);
  assert.ok(summary.events.some(row => row.kind==='ascend' && row.day===42));
  assert.equal(summary.events.some(row => row.kind==='death'),false);
  cx.close(); assert.ok(cx.select(kx).ok); assert.equal(cx.refresh().identity.status,'ascended');
  const loaded=deserializeWorld(serializeWorld(wx)); assert.equal(buildCharacterViewModel(loaded,kx).identity.status,'ascended');
});
check('凡人跨界死亡绑定证明对象；已选上界逝者也拒绝同ID记录对象替换',() => {
  const fx=fixture(741),wx=fx.world,ex=fx.entity,kx=characterKey('mortal',ex.id),cx=createCharacterController({getWorld:() => wx});
  cx.select(kx); wx.entities.splice(wx.entities.indexOf(ex),1); wx.day=10;
  const up={...ex,id:99003}; wx.upper.entities.push(up); wx.upper.arrivedLog.push({id:up.id,fromKey:kx,day:10,name:ex.name});
  assert.equal(cx.refresh().identity.status,'ascended');
  wx.upper.day=20; rememberDead(wx.upper,up); wx.upper.entities.splice(wx.upper.entities.indexOf(up),1); wx.day=20;
  assert.equal(cx.refresh().identity.status,'dead');
  const old=wx.upper.dead.find(row => row.id===up.id),at=wx.upper.dead.indexOf(old);
  wx.upper.dead[at]={...old,name:'同ID替换证明'};
  const result=cx.handleAction({type:'export',targetKey:kx}); assert.equal(result.reason,'identity-reused'); assert.equal(cx.current(),null);
  wx.upper.dead[at]=old;
  assert.ok(cx.select(characterKey('upper',up.id)).ok); assert.equal(cx.refresh().identity.status,'dead');
  wx.upper.dead[at]={...old,name:'上界直接选择后替换'};
  const upperResult=cx.handleAction({type:'export',targetKey:characterKey('upper',up.id)});
  assert.equal(upperResult.reason,'identity-reused'); assert.equal(cx.current(),null);
  wx.upper.dead[at]=old;
  assert.ok(cx.select(kx).ok); assert.equal(cx.refresh().identity.status,'dead');
  wx.upper.dead[at]={...old,name:'跨界死后重选再替换'};
  assert.equal(cx.handleAction({type:'export',targetKey:kx}).reason,'identity-reused');
});
check('正式普通鬼魂/鬼修spawn据真实soulKind显示阶位；事实导出无假炼气',() => {
  const fx=fixture(742),wx=fx.world,cx=createCharacterController({getWorld:() => wx});
  const ghost=spawnNetherGhost(wx.nether,{kind:'ghost'});
  const ghostKey=characterKey('nether',ghost.id);
  assert.equal(ghost.sp,'ghost'); assert.equal(ghost.level,0); assert.equal(ghostTierOf(ghost.level),-1);
  assert.ok(cx.select(ghostKey).ok); assert.equal(cx.current().header.realm,'普通鬼魂');
  wx.nether.record('真实幽冥记事','ghost',ghost);
  const text=cx.handleAction({type:'export',targetKey:ghostKey}).effect.text;
  assert.match(text,/普通鬼魂/); assert.match(text,/真实幽冥记事/); assert.doesNotMatch(text,/炼气|Lv1|散修/);
  const cultivator=spawnNetherGhost(wx.nether,{kind:'ghostCultivator'}); cultivator.level=11;
  const cultivatorKey=characterKey('nether',cultivator.id); assert.ok(cx.select(cultivatorKey).ok);
  assert.equal(cx.current().header.realm,`鬼修 · ${GHOST_TIER_NAMES[ghostTierOf(11)]}`);
  const ghostCultText=cx.handleAction({type:'export',targetKey:cultivatorKey}).effect.text;
  assert.match(ghostCultText,/鬼修 · 怨灵/); assert.doesNotMatch(ghostCultText,/炼气|Lv1|散修/);
  wx.nether.day=30; rememberDead(wx.nether,cultivator); wx.nether.entities.splice(wx.nether.entities.indexOf(cultivator),1); wx.day=30;
  assert.equal(cx.refresh().header.realm,'鬼魂 · 类别不可考');
  assert.doesNotMatch(cx.handleAction({type:'export',targetKey:cultivatorKey}).effect.text,/炼气|Lv1|散修|鬼修 · 怨灵/);
});
check('凡人跨界nether由正式ghost来历显示鬼魂；正式spawn human0事实导出不假造炼气',() => {
  const fx=fixture(743),wx=fx.world,ex=fx.entity,kx=characterKey('mortal',ex.id),cx=createCharacterController({getWorld:() => wx});
  cx.select(kx); wx.entities.splice(wx.entities.indexOf(ex),1);
  const ghost=spawnNetherGhost(wx.nether,{kind:'ghost',ghostOf:{ref:kx,route:null,deathDay:wx.day,name:ex.name}});
  assert.equal(cx.refresh().identity.status,'nether'); assert.equal(cx.current().header.realm,'普通鬼魂');
  assert.doesNotMatch(cx.handleAction({type:'export',targetKey:kx}).effect.text,/炼气|Lv1|散修/);
  fx.life.spawn(ex.x,ex.y,'human',1); const human=wx.entities.filter(row => row.sp==='human').at(-1);
  assert.ok(human); assert.equal(human.level,0); const humanKey=characterKey('mortal',human.id);
  assert.ok(cx.select(humanKey).ok); assert.equal(cx.current().header.realm,'凡人'); wx.record('真实凡人生平','birth',human);
  const text=cx.handleAction({type:'export',targetKey:humanKey}).effect.text;
  assert.match(text,/凡人/); assert.match(text,/真实凡人生平/); assert.doesNotMatch(text,/炼气|Lv1|散修/);
  const saved=JSON.stringify(serializeWorld(wx)),draws=fx.draws();
  cx.handleAction({type:'export',targetKey:humanKey}); assert.equal(JSON.stringify(serializeWorld(wx)),saved); assert.equal(fx.draws(),draws);
});
console.log(`G1 runtime: ${checks} groups passed`);
