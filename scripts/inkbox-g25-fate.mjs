import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fixture } from './inkbox-g1-fixtures.mjs';
import { deserializeWorld, serializeWorld } from '../src/inkbox/io/save.js';
import { improveOrdinarySpiritRoot, QUALITIES } from '../src/inkbox/core/cultivation.js';
import { cultivationRate, stepEntity as stepCultivation } from '../src/inkbox/sim/cultivation.js';
import { checkHeavenEdict, HEAVEN_EDICTS } from '../src/inkbox/sim/heavenEdicts.js';
import { characterKey, createCharacterController, createSelectionToken, buildCharacterViewModel } from '../src/inkbox/g1/characterRuntime.js';
import { mulberry32 } from '../src/inkbox/core/noise.js';

const report = {suite:'G2.5 洗髓命簿与敕令',checks:[]};
const check = (name,fn) => { fn(); report.checks.push({name,pass:true}); console.log('PASS '+name); };
function ordinaryRoot(quality=0) {
  return {elements:['木','水'],quality,rootName:'木主杂灵根',mutated:null,bonus:quality*.02};
}

check('纯函数逐档提升普通根并重算名称与品质加成，不修改原模型',()=>{
  const root=Object.freeze({...ordinaryRoot(1),elements:Object.freeze(['木','水'])});
  const improved=improveOrdinarySpiritRoot(root);
  assert.deepEqual(improved,{elements:['木','水'],quality:2,rootName:'木主杂灵根',mutated:null,bonus:.04});
  assert.equal(root.quality,1);assert.equal(root.bonus,.02);assert(Object.isFrozen(root.elements));
  assert.equal(improveOrdinarySpiritRoot({...ordinaryRoot(2),quality:3}),null);
  assert.equal(improveOrdinarySpiritRoot({...ordinaryRoot(0),mutated:{name:'雷灵根'}}),null);
});

check('洗髓走正式敕令权限与令牌，可重复至优品并留下成长干预日志且不抽随机',()=>{
  const f=fixture(2501),{world,entity}=f,key=characterKey('mortal',entity.id);
  entity.root=ordinaryRoot(0);
  const controller=createCharacterController({getWorld:()=>world});
  assert(controller.select(key).ok);
  const token=createSelectionToken(world,key);
  assert.equal(checkHeavenEdict(world,token,'root').ok,true);
  assert.equal(HEAVEN_EDICTS.find(edict=>edict.id==='root').title,'洗髓');
  const draws=f.draws(),exp=entity.exp,level=entity.level,fortune=entity.fortune,mind=entity.mind;
  for(let quality=1;quality<=3;quality++){
    const before=entity.root,action=controller.handleAction({type:'edict',targetKey:key,edictId:'root',enabled:false});
    assert.equal(action.ok,true);assert.equal(action.before.quality,quality-1);assert.equal(action.after.quality,quality);
    assert.equal(entity.root.rootName,'木主杂灵根');assert.equal(entity.root.quality,quality);
    assert.equal(entity.root.bonus,quality*.02);assert.equal(entity.root.elements.join(''),before.elements.join(''));
  }
  assert.equal(controller.current().edicts.find(edict=>edict.id==='root').enabled,false);
  assert.match(controller.current().edicts.find(edict=>edict.id==='root').disabledReason,/上限/);
  assert.equal(controller.handleAction({type:'edict',targetKey:key,edictId:'root'}).reason,'root-quality-cap');
  assert.equal(entity.exp,exp);assert.equal(entity.level,level);assert.equal(entity.fortune,fortune);assert.equal(entity.mind,mind);
  assert.equal(f.draws(),draws,'heaven edict must not call the simulation RNG');
  const interventions=entity.log.filter(row=>row.kind==='intervention'&&row.text.includes('洗髓'));
  assert.equal(interventions.length,3);assert(interventions[0].text.includes('劣')&&interventions[0].text.includes('中'));
  assert(interventions[0].text.includes('每日修为')&&interventions[0].text.includes('突破仍由模拟判定'));
  assert(world.chronicle.some(row=>row.kind==='intervention'&&row.text.includes('洗髓')));
});

check('无根、变异根、优品与天品给出明确禁用原因并保留原状',()=>{
  const f=fixture(2502),{world,entity}=f,key=characterKey('mortal',entity.id);
  const controller=createCharacterController({getWorld:()=>world});controller.select(key);
  delete entity.root;controller.refresh();
  assert.equal(controller.current().edicts.find(edict=>edict.id==='root').disabledReason,'此人尚无可考灵根，无法洗髓');
  assert.equal(controller.handleAction({type:'edict',targetKey:key,edictId:'root'}).reason,'root-missing');
  for(const root of [
    {elements:['金'],quality:3,rootName:'雷灵根',mutated:{name:'雷灵根',rarity:'rare',element:'金',bonus:.06},bonus:.06},
    {elements:['金'],quality:4,rootName:'金灵根',mutated:null,bonus:.08},
  ]){
    entity.root=root;const before=JSON.stringify(root);controller.refresh();
    const entry=controller.current().edicts.find(edict=>edict.id==='root');
    assert.equal(entry.enabled,false);assert(entry.disabledReason.length>0);
    const result=controller.handleAction({type:'edict',targetKey:key,edictId:'root'});
    assert.equal(result.ok,false);assert.equal(JSON.stringify(entity.root),before);
    assert.equal(result.reason,root.mutated?'mutated-root':'root-quality-cap');
  }
  entity.root={elements:['金'],quality:3,rootName:'九天雷灵根',bonus:.14};controller.refresh();
  assert.equal(controller.handleAction({type:'edict',targetKey:key,edictId:'root'}).reason,'mutated-root',
    'known mutated name remains protected when legacy data lacks its mutation descriptor');
});

check('真实stepCultivation在同条件下累积更多修为',()=>{
  const low=fixture(2503),high=fixture(2503);
  low.entity.root=ordinaryRoot(0);high.entity.root=improveOrdinarySpiritRoot(ordinaryRoot(0));
  low.entity.exp=high.entity.exp=0;low.entity.level=high.entity.level=4;
  low.entity.lastAwakenTry=high.entity.lastAwakenTry=low.world.day;
  low.entity.lastKarmaDay=high.entity.lastKarmaDay=low.world.day;
  const baseRate=cultivationRate(low.world,low.entity),improvedRate=cultivationRate(high.world,high.entity);
  assert(improvedRate>baseRate);
  stepCultivation(low.world,low.entity,30,mulberry32(25031));
  stepCultivation(high.world,high.entity,30,mulberry32(25031));
  assert(high.entity.exp>low.entity.exp,`${high.entity.exp} > ${low.entity.exp}`);
});

check('品质进入命簿VM且既有row20保存往返保留改良根，旧档缺root安全默认为null',()=>{
  const f=fixture(2504),{world,entity}=f,key=characterKey('mortal',entity.id);
  entity.root={elements:['水'],quality:3,rootName:'水灵根',mutated:null,bonus:.06};
  const vm=buildCharacterViewModel(world,key),rootRow=vm.overview.find(row=>row.label==='灵根');
  assert.equal(rootRow.value,'水灵根 · 优');
  const payload=serializeWorld(world),loaded=deserializeWorld(payload),restored=loaded.entities.find(item=>item.id===entity.id);
  assert.deepEqual(restored.root,entity.root);
  const oldPayload=serializeWorld(world),oldRow=oldPayload.entities.find(row=>row[0]===entity.id);delete oldRow[20];
  assert.equal(deserializeWorld(oldPayload).entities.find(item=>item.id===entity.id).root,null);
  assert.equal(QUALITIES[restored.root.quality],'优');
});

report.pass=true;
const output=path.resolve('reports/g25');fs.mkdirSync(output,{recursive:true});
fs.writeFileSync(path.join(output,'g25-fate.json'),JSON.stringify(report,null,2));
console.log(`G2.5 洗髓检查：${report.checks.length} 项通过`);
