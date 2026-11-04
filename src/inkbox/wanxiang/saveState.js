import {validateProfile,clone} from './profile.js';
const WORLD_FIELDS=['factSequence','version','encounterHistory','enabled','experiments','lastEncounterDay','experimental','encounters','legend','legends','epoch','epochHexagram','epochIndex','revision','nextEncounterId','daoSeeds'];
function validateWorld(value) {
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!WORLD_FIELDS.includes(k)))throw Error('invalid-wanxiang-world');
 if(typeof value.enabled!=='boolean')throw Error('invalid-wanxiang-enabled');
 const s=JSON.stringify(value,(k,v)=>{if(['__proto__','constructor','prototype'].includes(k)||typeof v==='number'&&!Number.isFinite(v))throw Error('invalid-wanxiang-data');return v;});
 if(s.length>131072)throw Error('wanxiang-world-too-large');
 if(value.encounters && (!Array.isArray(value.encounters)||value.encounters.length>24||value.encounters.filter(x=>x.stage==="open").length>3))throw Error('invalid-encounters');
 if(value.factSequence!=null&&(!Number.isSafeInteger(value.factSequence)||value.factSequence<0))throw Error('invalid-fact-sequence');
 if(value.version!=null&&value.version!==1)throw Error('invalid-world-version');
 if(value.experiments && (Object.keys(value.experiments).some(k=>!['legend','daoSeeds'].includes(k))||Object.values(value.experiments).some(v=>typeof v!=='boolean')))throw Error('invalid-experiments');
 const id=v=>Number.isSafeInteger(v)&&v>0, finite=v=>Number.isFinite(v)&&v>=0;
 for(const row of value.encounters||[])if(typeof row.id!=='string'||!id(row.siteId)||!['open','claimed','ended','completed','expired','closed'].includes(row.stage)||!finite(row.startDay)||!finite(row.untilDay)||!Array.isArray(row.participants)||row.participants.length>3||row.participants.some(p=>!id(p.actorId)||!['travel','ended','withdrawn','arrived'].includes(p.stage)))throw Error('invalid-encounter');
 if(value.legend){const l=value.legend;if(!id(l.artifactId)||!id(l.siteId)||!id(l.actorId)||!['bound','travel','choice','seal-work','draw-work','sealed','drawn','failed','left','interrupted'].includes(l.stage)||!finite(l.startDay)||!finite(l.progress)||!finite(l.lastDay))throw Error('invalid-legend');}
 return value;
}
function population(world) {return ['mortal','upper','nether'].flatMap(plane=>{const w=plane==='mortal'?world:world[plane];return (w?.entities||[]).map(e=>({key:`${plane}:${e.id}`,entity:e}));});}
export function serializeWanxiang(world) {
 const profiles=population(world).filter(x=>x.entity.wanxiang).map(x=>({key:x.key,profile:clone(validateProfile(x.entity.wanxiang))}));
 if(!world.wanxiang&&!profiles.length)return undefined;
 const planeStates={};for(const name of ['upper','nether'])if(world[name]?.wanxiang)planeStates[name]=clone(validateWorld(world[name].wanxiang));
 return {version:1,world:clone(validateWorld(world.wanxiang||{enabled:false})),profiles,...(Object.keys(planeStates).length?{planeStates}:{})};
}
export function restoreWanxiang(world,block) {
 if(block==null)return;
 if(block.version!==1||!Array.isArray(block.profiles)||block.profiles.length>100000||Object.keys(block).some(k=>!['version','world','profiles','planeStates'].includes(k)))throw Error('invalid-wanxiang-block');
 const state=clone(validateWorld(block.world)),entities=new Map(population(world).map(x=>[x.key,x.entity])),seen=new Set(),pending=[];
 for(const row of block.profiles) {if(!row||!entities.has(row.key)||seen.has(row.key))throw Error('invalid-wanxiang-identity');seen.add(row.key);pending.push([entities.get(row.key),clone(validateProfile(row.profile))]);}
 const planes=block.planeStates;
 if(planes!=null&&(!planes||typeof planes!=='object'||Array.isArray(planes)||Object.keys(planes).some(k=>!['upper','nether'].includes(k)||!world[k])))throw Error('invalid-plane-states');
 const restoredPlanes={};
 for(const name of ['upper','nether'])if(world[name]) {
  const saved=planes?.[name],next=clone(saved?validateWorld(saved):{version:1,enabled:state.enabled});
  const watermark=block.profiles.filter(r=>r.key.startsWith(name+':')).reduce((max,r)=>Math.max(max,r.profile.experienceLedger?.lastSequence||0),0);
  // V1 saves omitted per-plane clocks; resume above the largest persisted receipt.
  if(saved?.factSequence==null)next.factSequence=Math.max(next.factSequence||0,watermark);
  else if(saved.factSequence<watermark)throw Error('invalid-plane-sequence');
  restoredPlanes[name]=next;
 }
 world.wanxiang=state;for(const [name,next]of Object.entries(restoredPlanes))world[name].wanxiang=next;for(const [e,p]of pending)e.wanxiang=p;
}
