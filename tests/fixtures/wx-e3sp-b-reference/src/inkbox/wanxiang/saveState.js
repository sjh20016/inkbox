import {validateProfile,clone} from './profile.js';
import {validateSoulSnapshot} from './soul.js';
const WORLD_FIELDS=['factSequence','version','encounterHistory','enabled','experiments','lastEncounterDay','experimental','encounters','legend','legends','epoch','epochHexagram','epochIndex','revision','nextEncounterId','daoSeeds','wxCEnabled','opportunities'];
const OPPORTUNITY_COUNTERS=['supplyChecks','generated','stocked','eligible','reachable','willing','started','arrived','success','failure','withdrawn','timeout','claimed','experience','behavior','aid','guard','reciprocity','candidate','invalidGeography','noRoute','budgetBlocked','qualified','region0','region1','region2','region3'];
function validateWorld(value) {
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!WORLD_FIELDS.includes(k)))throw Error('invalid-wanxiang-world');
 if(typeof value.enabled!=='boolean')throw Error('invalid-wanxiang-enabled');
 if(value.wxCEnabled!=null&&typeof value.wxCEnabled!=='boolean')throw Error('invalid-wxc-enabled');
 if(value.opportunities!=null){
  const o=value.opportunities;
  if(!o||typeof o!=='object'||Array.isArray(o)||o.version!==1||Object.keys(o).some(k=>!['version','lastSupplyDay','counters'].includes(k))
    ||!Number.isFinite(o.lastSupplyDay)||o.lastSupplyDay<0||!o.counters||typeof o.counters!=='object'||Array.isArray(o.counters)
    ||Object.entries(o.counters).some(([key,n])=>!OPPORTUNITY_COUNTERS.includes(key)||!Number.isSafeInteger(n)||n<0))throw Error('invalid-opportunities');
 }
 const s=JSON.stringify(value,(k,v)=>{if(['__proto__','constructor','prototype'].includes(k)||typeof v==='number'&&!Number.isFinite(v))throw Error('invalid-wanxiang-data');return v;});
 if(s.length>131072)throw Error('wanxiang-world-too-large');
 if(value.encounters && (!Array.isArray(value.encounters)||value.encounters.length>24||value.encounters.filter(x=>x.stage==="open").length>3))throw Error('invalid-encounters');
 if(value.factSequence!=null&&(!Number.isSafeInteger(value.factSequence)||value.factSequence<0))throw Error('invalid-fact-sequence');
 if(value.version!=null&&value.version!==1)throw Error('invalid-world-version');
 if(value.experiments && (Object.keys(value.experiments).some(k=>!['legend','daoSeeds'].includes(k))||Object.values(value.experiments).some(v=>typeof v!=='boolean')))throw Error('invalid-experiments');
 const id=v=>Number.isSafeInteger(v)&&v>0, finite=v=>Number.isFinite(v)&&v>=0;
 for(const row of value.encounters||[])if(typeof row.id!=='string'||!id(row.siteId)||!['open','claimed','ended','completed','expired','closed'].includes(row.stage)||!finite(row.startDay)||!finite(row.untilDay)||!Array.isArray(row.participants)||row.participants.length>3||row.participants.some(p=>!id(p.actorId)||!['travel','ended','withdrawn','arrived'].includes(p.stage)))throw Error('invalid-encounter');
 for(const row of value.encounters||[])for(const actor of row.participants) {
  if(actor.corners!=null&&(!Array.isArray(actor.corners)||actor.corners.length>128
    ||actor.corners.some(p=>!p||!Number.isInteger(p.x)||!Number.isInteger(p.y)||p.x<0||p.y<0)))throw Error('invalid-encounter-route');
  if(actor.corner!=null&&(!Number.isSafeInteger(actor.corner)||actor.corner<0||!actor.corners||actor.corner>=Math.max(1,actor.corners.length)))throw Error('invalid-encounter-route');
 }
 if(value.legend){const l=value.legend;if(!id(l.artifactId)||!id(l.siteId)||!id(l.actorId)||!['bound','travel','choice','seal-work','draw-work','sealed','drawn','failed','left','interrupted'].includes(l.stage)||!finite(l.startDay)||!finite(l.progress)||!finite(l.lastDay))throw Error('invalid-legend');}
 return value;
}
function population(world) {return ['mortal','upper','nether'].flatMap(plane=>{const w=plane==='mortal'?world:world[plane];return (w?.entities||[]).map(e=>({key:`${plane}:${e.id}`,entity:e}));});}
export function serializeWanxiang(world) {
 for(const soul of world.souls||[])if(soul.wanxiangSoul)validateSoulSnapshot(soul.wanxiangSoul);
 const profiles=population(world).filter(x=>x.entity.wanxiang).map(x=>({key:x.key,profile:clone(validateProfile(x.entity.wanxiang))}));
 if(!world.wanxiang&&!profiles.length)return undefined;
 const planeStates={};for(const name of ['upper','nether'])if(world[name]?.wanxiang)planeStates[name]=clone(validateWorld(world[name].wanxiang));
 return {version:1,world:clone(validateWorld(world.wanxiang||{enabled:false})),profiles,...(Object.keys(planeStates).length?{planeStates}:{})};
}
export function restoreWanxiang(world,block) {
 for(const soul of world.souls||[])if(soul.wanxiangSoul)validateSoulSnapshot(soul.wanxiangSoul);
 if(block==null)return;
 if(block.version!==1||!Array.isArray(block.profiles)||block.profiles.length>100000||Object.keys(block).some(k=>!['version','world','profiles','planeStates'].includes(k)))throw Error('invalid-wanxiang-block');
 const state=clone(validateWorld(block.world)),entities=new Map(population(world).map(x=>[x.key,x.entity])),seen=new Set(),pending=[];
 const validateRoutes=(w,s)=>{for(const scene of s.encounters||[])for(const actor of scene.participants)if(actor.corners?.some(p=>p.x>=w.w||p.y>=w.h))throw Error('invalid-encounter-route');};
 validateRoutes(world,state);
 for(const row of block.profiles) {if(!row||!entities.has(row.key)||seen.has(row.key))throw Error('invalid-wanxiang-identity');seen.add(row.key);pending.push([entities.get(row.key),clone(validateProfile(row.profile))]);}
 const planes=block.planeStates;
 if(planes!=null&&(!planes||typeof planes!=='object'||Array.isArray(planes)||Object.keys(planes).some(k=>!['upper','nether'].includes(k)||!world[k])))throw Error('invalid-plane-states');
 const restoredPlanes={};
 for(const name of ['upper','nether'])if(world[name]) {
  const saved=planes?.[name],next=clone(saved?validateWorld(saved):{version:1,enabled:state.enabled});
  validateRoutes(world[name],next);
  const watermark=block.profiles.filter(r=>r.key.startsWith(name+':')).reduce((max,r)=>Math.max(max,r.profile.experienceLedger?.lastSequence||0),0);
  // V1 saves omitted per-plane clocks; resume above the largest persisted receipt.
  if(saved?.factSequence==null)next.factSequence=Math.max(next.factSequence||0,watermark);
  else if(saved.factSequence<watermark)throw Error('invalid-plane-sequence');
  restoredPlanes[name]=next;
 }
 world.wanxiang=state;for(const [name,next]of Object.entries(restoredPlanes))world[name].wanxiang=next;for(const [e,p]of pending)e.wanxiang=p;
}
