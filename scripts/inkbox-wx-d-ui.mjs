import assert from 'node:assert/strict';
import { mechanismState, factTitle, provenance, worldDay, operationTitle, catalogValue, fieldTitle } from '../src/inkbox/ui/g1/presentation/mingpuFacts.js';
assert.equal(mechanismState({status:'数值条件已证实',checks:[]}),'常驻生效');
assert.equal(mechanismState({status:'数值条件已证实',checks:[{proven:true}]}),'当前条件已满足');
assert.equal(mechanismState({status:'数值条件未证实',checks:[{proven:false}]}),'需等实际行动才能判定');
assert.equal(mechanismState({status:'潜隐'}),'当前休眠');
assert.equal(mechanismState({status:'机制尚未实现'}),'机制尚未实现');
assert.equal(provenance({mode:'decree',source:'玩家'}),'天道敕改');
assert.equal(provenance({mode:'player'}),'常规改命');
assert.equal(provenance({source:'出生遗传'}),'出生遗传');
assert.equal(factTitle('healed'),'真实援助与疗伤');
console.log('WX-C read-only explanation and provenance labels passed; rendered interaction requires browser QA');

const catalog={bloodlines:[{id:'true_dragon',name:'真龙血脉'}],experienceTraits:[{id:'sword_blight',name:'剑煞入脉'}],physiques:[{id:'wood',name:'木灵体'}]};
assert.equal(worldDay(8.119800000000001),'8');
assert.equal(worldDay(undefined),'未载');
assert.equal(operationTitle({op:'decree',action:'remove_state',id:'sword_blight'},catalog),'天道洗去状态：剑煞入脉');
assert.equal(operationTitle({op:'decree',action:'grant_bloodline',id:'true_dragon'},catalog),'天道敕赐血脉：真龙血脉 · 血阶 1 · 纯度 50');
assert.equal(operationTitle({op:'set',field:'physique',value:{id:'wood'}},catalog),'体质：木灵体');
assert.equal(catalogValue({id:'true_dragon',grade:1},catalog),'真龙血脉 · 血阶 1');
assert.equal(fieldTitle('bloodlines'),'血脉');

assert.equal(provenance({kind:'natural-choice'}),'自然因果');
