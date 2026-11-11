import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {ROOT,BASE,option,source,environment,readCheckpoint,exportReference,nativeApi,advanceDays,digest,writeJson,assertNativeInvariants} from './inkbox-wx-e1c-common.mjs';
import {readEffects as oldEffects} from '../tests/fixtures/wx-e1c-reference/effects.js';
import {deriveConditions as oldConditions} from '../tests/fixtures/wx-e1c-reference/conditions.js';
import {experienceEffects as oldExperience} from '../tests/fixtures/wx-e1c-reference/experiences.js';
import {readEffects,observeEffects} from '../src/inkbox/wanxiang/effects.js';
import {deriveConditions,observeConditions} from '../src/inkbox/wanxiang/conditions.js';
import {experienceEffects} from '../src/inkbox/wanxiang/experiences.js';
import {initializeProfile} from '../src/inkbox/wanxiang/profile.js';
import {beginEntityReadPass,endEntityReadPass} from '../src/inkbox/sim/entityReadView.js';
import {enableWorkMetrics,workMetricsSnapshot} from '../src/inkbox/sim/workMetrics.js';
import {World} from '../src/inkbox/world/World.js';
const report={source:source(),environment:environment(),reference:BASE,queries:0,axes:0,controlled:[],native:[]};
const out=option('out','reports/local/wx-e1c/verify.json');
function compare(a,b,info){assert.deepEqual(Object.keys(a).sort(),Object.keys(b).sort(),'complete returned axis set');for(const k of Object.keys(a)){report.axes++;if(!Object.is(a[k],b[k])){report.firstMismatch={...info,axis:k,old:String(a[k]),next:String(b[k])};throw Error('Object.is mismatch '+JSON.stringify(report.firstMismatch));}}report.queries++;}
function dual(fn,old,e,context,info){let a,b,ae,be;try{a=old(e,context);}catch(error){ae=error;}try{b=fn(e,context);}catch(error){be=error;}if(ae||be){assert(ae&&be,`${info.label} both implementations reject malformed input`);assert.equal(ae.constructor,be.constructor);return;}compare(a,b,info);}
function make(){const e={id:1,sp:'cultivator',hp:20,maxHp:100,level:4,x:0,y:0,dao:{path:{key:'sword'}},techniques:[],relations:new Map([[3,{type:'mentor'}],[2,{type:'mentor'}]]),faction:1,artifacts:[],state:'fight',carried:2};initializeProfile(e);e.wanxiang.bonds=[{id:'shared_insight',targetKey:'mortal:2',expiresDay:11}];const peer=(id,p)=>({id,hp:100,x:1,y:1,faction:1,state:'fight',dao:{path:{key:p}}});return {e,w:{day:10,plane:'mortal',entities:[e,peer(2,'fire'),peer(3,'sword'),peer(4,'fire')],sites:[],wanxiang:{enabled:true},nextEntityId:5}};}
function cloneFacts(value,seen=new Map()){if(!value||typeof value!=='object')return value;if(seen.has(value))return seen.get(value);const copy=value instanceof Map?new Map():Array.isArray(value)?[]:Object.create(Object.getPrototypeOf(value));seen.set(value,copy);if(value instanceof Map){for(const [k,v]of value)copy.set(cloneFacts(k,seen),cloneFacts(v,seen));}else for(const k of Object.keys(value))copy[k]=cloneFacts(value[k],seen);return copy;}
function check(e,w,label){const c={world:w,day:w.day,target:w.entities[1],paidAid:true};const before=cloneFacts({e,w});dual(readEffects,oldEffects,e,c,{label});dual(deriveConditions,oldConditions,e,c,{label,kind:'conditions'});dual((e,c)=>experienceEffects(e,c.day,c.world),(e,c)=>oldExperience(e,c.day,c.world),e,c,{label,kind:'experience'});assert.deepEqual({e,w},before,'queries preserve all facts including relation Maps');}
function fixture(label,mutate){const {e,w}=make();mutate?.(e,w);check(e,w,label+' outside');beginEntityReadPass(w,true);try{check(e,w,label+' indexed');}finally{endEntityReadPass(w);}report.controlled.push(label);}
const tags=work=>Object.fromEntries(Object.entries(work).filter(([k])=>k.startsWith('effects.source.')));
try{
 const manifest=JSON.parse(fs.readFileSync(path.join(ROOT,'tests/fixtures/wx-e1c-reference/manifest.json')));assert.equal(manifest.head,BASE);
 for(const [name,row]of Object.entries(manifest.modules))assert.equal(digest(fs.readFileSync(path.join(ROOT,`tests/fixtures/wx-e1c-reference/${name}.js`),'utf8').replace(/\r\n?/g,'\n')),row.relocatedSha256,'frozen #66 relocated body hash');
 fixture('live helper and full conditions map');
 fixture('self-target shared helper',(e)=>{e.wanxiang.bonds[0].targetKey='mortal:1';});
 fixture('world order beats relation order',(e,w)=>{w.entities.reverse();});
 fixture('multiple mentors minimum live world index',(e,w)=>{w.entities[1].dao.path.key='fire';w.entities[2].dao.path.key='sword';});
 fixture('first mentor dead selects next',(e,w)=>{w.entities[1].hp=0;});
 fixture('mentor relation removed in place',(e)=>{e.relations.delete(2);});
 fixture('custom relation getter falls back',(e)=>{e.relations={get:id=>id===2?{type:'mentor'}:null};});
 fixture('dead helper live hp',(e,w)=>{w.entities[1].hp=0;});
 fixture('distance exactly eight',(e,w)=>{w.entities[1].x=8;w.entities[1].y=0;});
 fixture('distance beyond eight',(e,w)=>{w.entities[1].x=8+Number.EPSILON*8;w.entities[1].y=0;});
 fixture('expired and dormant bonds',(e)=>{e.wanxiang.bonds[0].expiresDay=10;e.wanxiang.bonds.push({id:'shared_insight',targetKey:'mortal:3',expiresDay:11,dormant:true});});
 fixture('multiple target order',(e)=>{e.wanxiang.bonds.push({id:'shared_insight',targetKey:'mortal:3',expiresDay:12});});
 for(const key of ['mortal:02','mortal:2.0','mortal:+2','upper:2','nether:2','mortal:NaN','mortal:9007199254740992','missing:2',null])fixture('noncanonical target '+key,(e)=>{e.wanxiang.bonds[0].targetKey=key;});
 fixture('duplicate target keys',(e)=>{e.wanxiang.bonds.push({...e.wanxiang.bonds[0]});});
 fixture('duplicate entity IDs',(e,w)=>{w.entities[2].id=2;});
 fixture('duplicate object references',(e,w)=>{w.entities.push(w.entities[1]);});
 fixture('invalid IDs',(e,w)=>{w.entities[1].id='2';});
 fixture('sparse list rejection',(e,w)=>{delete w.entities[1];});
 fixture('NaN coordinates and negative zero',(e,w)=>{e.x=-0;w.entities[1].x=NaN;});
 for(const plane of ['upper','nether','',undefined])fixture('plane '+plane,(e,w)=>{w.plane=plane;e.wanxiang.bonds[0].targetKey=`${plane||'mortal'}:2`;});
 // Mutations outside the audited loop start a new view; unknown callbacks do
 // not enter that loop's trusted interval (tested below on the real Life).
 for(const [label,mutate]of [
  ['same-length object replacement',(w)=>{w.entities[1]={...w.entities[1],x:20};}],
  ['same-length new target ID',(w)=>{w.entities[1]={...w.entities[1],id:9};}],
  ['direct push',(w)=>w.entities.push({id:9,hp:10,x:0,y:0})],
  ['direct splice',(w)=>w.entities.splice(1,1)],
  ['same-length array replacement',(w)=>{w.entities=[...w.entities].reverse();}],
  ['stable compaction',(w)=>{w.entities[1]=w.entities[2];w.entities[2]=w.entities[3];w.entities.length=3;}],
 ]){const {e,w}=make();beginEntityReadPass(w,true);check(e,w,label+' before');endEntityReadPass(w);mutate(w);check(e,w,label+' unowned');beginEntityReadPass(w,true);try{check(e,w,label+' new pass');}finally{endEntityReadPass(w);}report.controlled.push(label);}
 for(const method of ['remove','add']){const {e,w}=make();enableWorkMetrics(w,true,{timing:false});beginEntityReadPass(w,true);experienceEffects(e,10,w);if(method==='remove')World.prototype.removeEntity.call(w,w.entities[1]);else World.prototype.addEntity.call(w,{sp:'human',hp:100,x:0,y:0});check(e,w,'World '+method+' invalidates');assert(workMetricsSnapshot(w)['entityIndex.invalidations']>0);endEntityReadPass(w);report.controlled.push('World '+method+' invalidation');}
 {const {e,w}=make();for(const c of [{},{world:null},{world:{day:10,plane:'mortal',entities:[]}}])dual(readEffects,oldEffects,e,c,{label:'worldless/empty'});report.controlled.push('worldless and empty');}
 const api=await nativeApi();
 {const c=api.fresh(73101),w=c.world;enableWorkMetrics(w,true,{timing:false});let checked=false;
  c.life.stepEntity=function(e){if(!checked){checked=true;w.entities[1]={...w.entities[1],x:e.x,y:e.y};initializeProfile(e);e.wanxiang.bonds=[{id:'shared_insight',targetKey:'mortal:'+w.entities[1].id,expiresDay:100}];compare(oldExperience(e,w.day,w),experienceEffects(e,w.day,w),{label:'unmanaged real loop mutation'});}return false;};
  c.life.step(0.1);assert(checked);assert.equal(workMetricsSnapshot(w)['entityIndex.passes']||0,0,'overridden native methods cannot own an indexed interval');report.controlled.push('unknown same-length loop mutation falls back');}
 if(process.argv.includes('--native')){
  const ref=exportReference(),old=await nativeApi(ref.root);report.nativeReference=ref;
  for(const age of option('ages','100,400').split(',').map(Number))for(const [days,dt]of [[Number(option('days','90')),3],[Number(option('fractional-days','3')),0.1]]){
   const cp=readCheckpoint(age),input=digest(cp.saved),baseline=old.restore(cp.saved,{measure:true});advanceDays(old,baseline,days,dt);const expected=old.capture(baseline),baselineWork=old.metrics.workMetricsSnapshot(baseline.world),rows=[];
   for(const measured of [false,true]){const c=api.restore(cp.saved,{measure:measured});observeEffects((e,context,tag,result)=>compare(oldEffects(e,context),result,{age,dt,day:context.day,actor:e.id,source:tag}));observeConditions((e,context,result)=>compare(oldConditions(e,context),result,{age,dt,day:context.day,actor:e.id,kind:'complete conditions'}));try{advanceDays(api,c,days,dt);}finally{observeEffects();observeConditions();}assertNativeInvariants(api,c);const full=api.capture(c);assert.deepEqual(full,expected,'ENTIRE serializeWorld and ALL G8 runtime/RNG equal fixed #66');const work=api.metrics.workMetricsSnapshot(c.world);if(measured)assert.deepEqual(tags(work),tags(baselineWork),'all formal sourceTag frequencies unchanged');rows.push({measured,fullSha256:digest(full),runtimeSha256:digest(full.runtime),runtime:full.runtime,work});}
   const snapshot=JSON.parse(JSON.stringify(expected)),forks=[];for(const impl of [old,api,api]){const c=impl.restore(snapshot);advanceDays(impl,c,3,dt);forks.push(digest(impl.capture(c)));}assert.equal(new Set(forks).size,1,'two independent candidate v11 restored forks and #66 continuation equal');assert.equal(digest(cp.saved),input,'checkpoint preserved');
   report.native.push({age,days,dt,checkpoint:{file:cp.file,bytes:cp.bytes,sha256:cp.sha256},baseline:{fullSha256:digest(expected),runtimeSha256:digest(expected.runtime),work:baselineWork},rows,saveForks:forks,completeWorldAllRngAndTagsEqual:true});writeJson(out,report);console.log(`E1C L0 ${age}y ${days}d dt=${dt}: full world/all RNG/sourceTags/oracle/forks OK`);
  }
 }
 report.exitCode=0;console.log(`E1C #66 Object.is: ${report.controlled.length} cases; ${report.queries} queries / ${report.axes} axes, zero mismatch`);
}catch(error){report.exitCode=1;report.error=error.stack;throw error;}finally{observeEffects();observeConditions();writeJson(out,report);}
