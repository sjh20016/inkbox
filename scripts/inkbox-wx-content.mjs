import {readEffects} from '../src/inkbox/wanxiang/effects.js';
import {emptyProfile} from '../src/inkbox/wanxiang/profile.js';
import {deriveConditions} from '../src/inkbox/wanxiang/conditions.js';
import assert from 'node:assert/strict';
import { CATALOG, SOURCE_DESIGN, PHYSIQUES, BLOODLINES, BLOOD_GRADES, HEXAGRAMS, EXPERIENCE_TRAITS, DAO_SEEDS, ROOT_TIERS, ROOT_ELEMENTS, getCatalogEntry } from '../src/inkbox/wanxiang/catalog.js';

assert.equal(PHYSIQUES.length,18);
assert.equal(BLOODLINES.length,4);
assert.equal(BLOOD_GRADES.length,9);
assert.equal(HEXAGRAMS.length,64);
assert.equal(EXPERIENCE_TRAITS.length,18);
assert.equal(DAO_SEEDS.length,9);
assert.equal(ROOT_TIERS.length,6);
assert.equal(ROOT_ELEMENTS.length,5);
assert.deepEqual(PHYSIQUES.map(e=>e.id),SOURCE_DESIGN.physiques.map(e=>e.id));
assert.deepEqual(HEXAGRAMS.map(e=>e.effect),SOURCE_DESIGN.hexagrams.map(e=>e.effect));
assert.deepEqual(HEXAGRAMS.map(e=>e.kingWenNumber),Array.from({length:64},(_,i)=>i+1));
assert.equal(new Set(HEXAGRAMS.map(e=>e.symbol)).size,64);
const all=Object.values(CATALOG).flat();
assert.equal(new Set(all.map(e=>e.id)).size,all.length);
for (const entry of all) {
  assert.equal(getCatalogEntry(entry.id),entry);
  assert.ok(Object.isFrozen(entry));
  assert.ok(entry.name);
  if(entry.implementation) {
    assert.ok(['B','C'].includes(entry.implementation));
    assert.equal(entry.implemented,false);
    if(entry.implementation==='B') assert.ok(entry.consumerRefs.includes('wanxiang/effects.js#readEffects')); else assert.deepEqual(entry.consumerRefs,[]);
    assert.ok(entry.source);
  }
}
assert.equal(getCatalogEntry('does-not-exist'),null);
assert.equal(ROOT_TIERS[5].requiresHeavenly,true);
assert.equal(ROOT_TIERS[5].minPurity,95);
assert.deepEqual(getCatalogEntry('sword_heart').effects,{});
assert.equal(getCatalogEntry('sword_heart').conditionalEffects[0].condition,'sword_path');
assert.equal(getCatalogEntry('seal_vow').oneTimeCost.lifespanDays,720);
assert.equal(DAO_SEEDS.find(e=>e.alias==='终轮').name,'酆都轮终元君');
assert.equal(DAO_SEEDS.find(e=>e.alias==='影鉴').name,'业镜照影大帝');
console.log('Wanxiang content: source IDs/effects, cardinality, conditions, provenance, immutable lookups passed');

const actor={hp:20,maxHp:100,mind:80,pollution:50,x:2,y:2,wanxiang:emptyProfile(),techniques:[]};
for(const row of HEXAGRAMS.filter(r=>r.implementation==='B')) {
 actor.wanxiang.hexagram={id:row.id};
 const contexts=[{}, {world:{villageById:()=>({x:2,y:2})}}];
 if(row.effect.condition==='at_home_village'||row.effect.condition==='away_from_home')actor.birthOrigin={villageId:1};
 const axis=({maxHp:'hp',detect_radius:'detectRadius',healing_received:'healingReceived'})[row.effect.axis]||row.effect.axis;
 const base=axis==='escape'||axis==='detectRadius'||axis==='breakthrough'?0:1;
 for(const context of contexts){const active=deriveConditions(actor,context)[row.effect.condition]===true;assert.equal(readEffects(actor,context)[axis],Math.max(axis==='detectRadius'?-10:axis==='escape'||axis==='breakthrough'?-.5:.1,Math.min(axis==='detectRadius'?10:axis==='escape'||axis==='breakthrough'?.5:3,base+(active?row.effect.value:0))),row.id);}
}
actor.wanxiang.hexagram={id:'hex_23'}; assert.equal(readEffects(actor).escape,.08);actor.hp=80;assert.equal(readEffects(actor).escape,0);
assert.equal(deriveConditions(actor).pollution_above_40,true);actor.pollution=0;assert.equal(deriveConditions(actor).pollution_above_40,false);
assert.equal(deriveConditions(actor,{no_unprovoked_kill_10y:true}).no_unprovoked_kill_10y,undefined);
console.log('Wanxiang conditions: real HP, pollution, home provenance and unsupported history cannot be forged');
