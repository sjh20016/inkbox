import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {ROOT,BASE,option,source,environment,readCheckpoint,exportReference,nativeApi,advanceDays,digest,writeJson} from './inkbox-wx-e1-common.mjs';
import {readEffects as oldEffects} from '../tests/fixtures/wx-e1-reference/effects.js';
import {deriveConditions as oldConditions} from '../tests/fixtures/wx-e1-reference/conditions.js';
import {experienceEffects as oldExperience} from '../tests/fixtures/wx-e1-reference/experiences.js';
import {readEffects,observeEffects} from '../src/inkbox/wanxiang/effects.js';
import {deriveConditions} from '../src/inkbox/wanxiang/conditions.js';
import {experienceEffects} from '../src/inkbox/wanxiang/experiences.js';
import {initializeProfile} from '../src/inkbox/wanxiang/profile.js';
const out=option('out','reports/local/wx-e1/verify.json'),report={source:source(),environment:environment(),reference:null,axesCompared:0,queries:0,controlled:[],native:[]};
const describe=v=>typeof v==='number'?(Number.isNaN(v)?'NaN':Object.is(v,-0)?'-0':String(v)):String(v);
function compare(a,b,info){
 assert.deepEqual(Object.keys(b).sort(),Object.keys(a).sort(),'exact returned key set');
 for(const k of Object.keys(a)){report.axesCompared++;if(!Object.is(a[k],b[k])){const mismatch={...info,axis:k,old:describe(a[k]),next:describe(b[k])};report.firstMismatch=mismatch;throw Error('First Object.is mismatch '+JSON.stringify(mismatch));}}
 report.queries++;
}
function fixtureCase(label,mutate){
 const e={id:1,sp:'cultivator',plane:'mortal',name:'controlled',hp:20,maxHp:100,level:4,x:0,y:0,dao:{path:{key:'sword'}},techniques:[],relations:new Map([[2,{type:'mentor'}],[3,{type:'mentor'}]]),faction:1,artifacts:[],state:'fight',carried:2};initializeProfile(e);
 const peer=(id,path)=>({id,hp:100,x:1,y:1,faction:1,state:'fight',dao:{path:{key:path}}});
 const world={day:10,plane:'mortal',entities:[e,peer(2,'fire'),peer(3,'sword'),peer(4,'sword')],sites:[],wanxiang:{enabled:true}};
 const context={world,day:10,target:world.entities[1],paidAid:true,targetLevel:5};mutate?.(e,world,context);
 const before=structuredClone({e,world,context});
 for(const [fn,reference,ctx]of [[readEffects,oldEffects,context],[deriveConditions,oldConditions,context]])compare(reference(e,ctx),fn(e,ctx),{label,actor:e.id,plane:world.plane,day:context.day});
 compare(oldExperience(e,context.day,world),experienceEffects(e,context.day,world),{label,kind:'experience'});
 assert.deepEqual({e,world,context},before,'dual read must not mutate controlled facts, including Maps');report.controlled.push(label);
}
try{
 const manifest=JSON.parse(fs.readFileSync(path.join(ROOT,'tests/fixtures/wx-e1-reference/manifest.json')));assert.equal(manifest.head,BASE);
 for(const [name,row]of Object.entries(manifest.modules)){
  const bytes=fs.readFileSync(path.join(ROOT,`tests/fixtures/wx-e1-reference/${name}.js`));
  // Git checkouts may normalize line endings; the anchor uses LF consistently.
  assert.equal(digest(bytes.toString('utf8').replace(/\r\n?/g,'\n')),row.relocatedSha256,'frozen reference source anchor');
 }
 report.reference=manifest;
 fixtureCase('empty profile');
 fixtureCase('no profile',(e)=>{delete e.wanxiang;});
 fixtureCase('expiry, duplicate IDs and dormant',(e)=>{e.wanxiang.traits=[{id:'sword_heart',dormant:true},{id:'risk_fear',expiresDay:10},{id:'tempered_bones',expiresDay:11}];e.wanxiang.states=[{id:'meridian_damage',expiresDay:10},{id:'meridian_damage',expiresDay:11},{id:'breakthrough_echo',expiresDay:null},{id:'dusty_mind',expiresDay:NaN},{id:'risk_resolve',expiresDay:9}];});
 fixtureCase('all experience axes and live vow',(e)=>{e.wanxiang.traits=['tempered_bones','wounded_insight','sword_blight','sword_review','sword_heart','pollution_restraint','alchemy_guard','dusty_mind','risk_fear','risk_resolve','site_wound','breakthrough_echo','meridian_damage'].map(id=>({id}));e.wanxiang.traits.push({id:'seal_vow',anchorX:0,anchorY:0},{id:'demon_sword_resonance',artifactId:'a'});e.artifacts=[{id:'a'}];});
 fixtureCase('multiple mentors preserve world order',(e,w)=>{w.entities.reverse();});
 fixtureCase('unused peer conditions return original full map',(e,w,c)=>{c.needed=new Set(['always']);});
 fixtureCase('three allies, nearby death and moved mentor',(e,w)=>{w.entities[1].hp=0;w.entities[2].x=20;});
 for(const plane of ['mortal','upper','nether','',undefined])fixtureCase('plane key '+plane,(e,w)=>{w.plane=plane;e.wanxiang.bonds=[{id:'shared_insight',targetKey:`${plane||'mortal'}:2`,expiresDay:11},{id:'shared_insight',targetKey:'upper:2',expiresDay:11},{id:'shared_insight',targetKey:'mortal:3',expiresDay:10}];});
 fixtureCase('missing world',(e,w,c)=>{delete c.world;});
 fixtureCase('same-day injury/movement/target',(e,w,c)=>{e.hp=1;e.x=20;c.target=w.entities[3];e.wanxiang.physique={id:'yin_block',stage:1};});
 for(const marker of ['doubleBody','possession','incarnation'])fixtureCase(marker+' live identity',(e)=>{e[marker]=marker==='incarnation'?2:{active:true};});
 for(const day of [-0,0,NaN,undefined])fixtureCase('number boundary '+describe(day),(e,w,c)=>{c.day=day;e.x=-0;e.hp=NaN;e.wanxiang.states=[{id:'site_wound',expiresDay:0}];});
 for(const value of [null,undefined]){
  const e={wanxiang:{traits:[value],states:[]}},old=()=>oldExperience(e,10),next=()=>experienceEffects(e,10);
  assert.throws(old,TypeError);assert.throws(next,TypeError);report.controlled.push('invalid state '+value+' preserves rejection');
 }
 if(process.argv.includes('--native')){
  const ref=exportReference(),api=await nativeApi(),old=await nativeApi(ref.root),days=Number(option('days','90')),dt=Number(option('dt','3'));
  report.nativeReference=ref;
  for(const age of option('ages','100,400').split(',').map(Number)){
   const cp=readCheckpoint(age),input=digest(cp.saved),before=old.restore(cp.saved);advanceDays(old,before,days,dt);const expected=old.capture(before),rows=[];
   for(const measured of [false,true]){
    const c=api.restore(cp.saved,{measure:measured});observeEffects((e,context,tag,result)=>compare(oldEffects(e,context),result,{actor:e.id,plane:context.world?.plane,day:context.day,source:tag}));
    try{advanceDays(api,c,days,dt);}finally{observeEffects();}
    const full=api.capture(c);assert.deepEqual(full,expected,'complete serializeWorld + ALL registered runtime/RNG equal #65');
    rows.push({measured,fullSha256:digest(full),runtimeSha256:digest(full.runtime),runtime:full.runtime,work:api.metrics.workMetricsSnapshot(c.world)});
   }
   // Both source versions restore the same serialized candidate snapshot; this
   // is save-fork equivalence, not a claim terrain round-tripping is lossless.
   const snapshot=JSON.parse(JSON.stringify(expected)),forks=[];for(const impl of [old,api,api]){const c=impl.restore(snapshot);advanceDays(impl,c,30,dt);forks.push(digest(impl.capture(c)));}
   assert.equal(new Set(forks).size,1,'v11 old/new independent saved continuations');assert.equal(digest(cp.saved),input,'original input preserved');
   report.native.push({age,days,dt,checkpoint:{file:cp.file,bytes:cp.bytes,sha256:cp.sha256},rows,saveForks:forks,fullWorldAndAllRegisteredRngEqual:true});writeJson(out,report);console.log(`L0 ${age}y ${days}d dt=${dt}: oracle/full-world/RNG/save forks OK`);
  }
 }
 report.exitCode=0;console.log(`WX-E1 Object.is oracle: ${report.controlled.length} cases, ${report.queries} queries, ${report.axesCompared} axes; zero mismatch`);
}catch(e){report.exitCode=1;report.error=e.stack;throw e;}finally{observeEffects();writeJson(out,report);}
