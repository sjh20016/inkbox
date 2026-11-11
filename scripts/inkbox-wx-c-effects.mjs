import assert from 'node:assert/strict';
import {emptyProfile} from '../src/inkbox/wanxiang/profile.js';
import {readEffects} from '../src/inkbox/wanxiang/effects.js';
import {chooseSkillAction,combatState,equipSkills} from '../src/inkbox/wanxiang/skills.js';
const actor=id=>({id,hp:100,maxHp:100,level:10,x:0,y:0,plane:0,techniques:[],wanxiang:emptyProfile()});
const a=actor(1),b=actor(2);a.wanxiang.hexagram={id:'hex_34'};
equipSkills(a,['strike']);let hit=chooseSkillAction(a,b,1,{power:10});a.hp=50;combatState(a).mana=30;let normal=chooseSkillAction(a,b,3,{power:10});assert.ok(Math.abs(hit.damage/normal.damage-1.04)<1e-10);
a.wanxiang.hexagram.id='hex_43';b.hp=29;combatState(a).mana=30;hit=chooseSkillAction(a,b,5,{power:10});b.hp=30;combatState(a).mana=30;normal=chooseSkillAction(a,b,7,{power:10});assert.ok(Math.abs(hit.damage/normal.damage-1.04)<1e-10);
a.wanxiang.hexagram.id='hex_60';equipSkills(a,['spell']);combatState(a).mana=30;chooseSkillAction(a,b,10);assert.equal(combatState(a).mana,20.4);assert.equal(readEffects(a,{day:10}).spell_cost,1);
assert.equal(readEffects(a,{day:10,skillId:'spell'}).spell_cost,.96);a.wanxiang.hexagram.dormant=true;assert.equal(readEffects(a,{day:10,skillId:'spell'}).spell_cost,1);delete a.wanxiang.hexagram.dormant;
a.wanxiang.hexagram={id:'hex_34',untilDay:11};assert.equal(readEffects(a,{day:11}).physical_power,1);a.hp=100;assert.equal(readEffects(a,{day:10}).physical_power,1.04);a.hp=80;assert.equal(readEffects(a,{day:10}).physical_power,1);
const restored=JSON.parse(JSON.stringify(a));restored.hp=100;assert.equal(readEffects(restored,{day:10}).physical_power,1.04);
console.log('WX-C effects: 34/43 actual physical actions, 60 paid equipped spell, same-day health/target/dormancy/expiry and restore passed');
import {WX_C_CONSUMERS} from '../src/inkbox/wanxiang/consumerManifest.js';
const cases={
 hex_34:{axis:'physical_power',skill:'strike',positive:(a,b)=>{a.hp=100;},negative:(a,b)=>{a.hp=80;}},
 hex_43:{axis:'physical_power',skill:'strike',positive:(a,b)=>{b.hp=29;},negative:(a,b)=>{b.hp=30;}},
 hex_60:{axis:'spell_cost',skill:'spell',positive:(a,b)=>{},negative:(a,b)=>{a.wanxiang.hexagram.dormant=true;}}
};
assert.equal(WX_C_CONSUMERS.length,Object.keys(cases).length);
for(const row of WX_C_CONSUMERS){
 const c=cases[row.entryId];assert.ok(c,`Missing executable scenario for ${row.entryId}`);assert.equal(row.axis,c.axis);assert.equal(row.callsite,'wanxiang/skills.js#chooseSkillAction');assert.equal(row.testId,`wx-c-effects:${Number(row.entryId.slice(4))}`);assert.equal(row.status,'B');assert.ok(row.limitations);
 const execute=setup=>{const a=actor(11),b=actor(12);a.wanxiang.hexagram={id:row.entryId};assert.equal(equipSkills(a,[c.skill]),true);setup(a,b);combatState(a).mana=30;const action=chooseSkillAction(a,b,1,{power:10});assert.equal(action.skill,c.skill);return {action,spent:30-combatState(a).mana};};
 const yes=execute(c.positive),no=execute(c.negative);
 if(row.axis==='physical_power')assert.ok(Math.abs(yes.action.damage/no.action.damage-1.04)<1e-10,`${row.entryId} physical damage consumer`);
 else if(row.axis==='spell_cost'){assert.ok(Math.abs(yes.spent-9.6)<1e-10);assert.equal(no.spent,10);}
 else assert.fail(`Unverified consumer axis ${row.axis}`);
}
console.log('WX-C consumer manifest dispatched all declared entryId/axis rows through actual equipped skill actions');
// 节 applies to every actually equipped mana-consuming skill, including healing.
for(const [skill,cost,hp] of [['strike',5,100],['renew',8,20],['spell',10,100]]){
 const execute=dormant=>{const a=actor(21),b=actor(22);a.hp=hp;a.wanxiang.hexagram={id:'hex_60',dormant};assert.equal(equipSkills(a,[skill]),true);combatState(a).mana=30;const action=chooseSkillAction(a,b,1);assert.equal(action.skill,skill);return 30-combatState(a).mana;};
 assert.ok(Math.abs(execute(false)-cost*.96)<1e-10,`hex60 ${skill} actual discounted mana`);
 assert.ok(Math.abs(execute(true)-cost)<1e-10,`hex60 ${skill} dormant full mana`);
}
console.log('WX-C hex60: spell, physical strike and healing renew all pay 96% equipped skill mana; dormant pays full cost');
