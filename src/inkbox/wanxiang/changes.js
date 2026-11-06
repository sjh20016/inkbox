import {techniqueId} from './manualIds.js';
import {getCatalogEntry} from './catalog.js';
import {resolveCharacter} from '../g1/characterIdentity.js';
import {readProfile,validateProfile,clone,ARRAY_LIMITS} from './profile.js';
const permissions={decree:['physique','bloodlines','states'],player:['root','physique','hexagram','attributes','personality','hobbies','cultivation'],natural:['physique','bloodlines','permanent','traits','states','bonds','daoSeed'],birth:[]};
const previews=new WeakMap();
const draftProofs=new WeakMap(), usedDrafts=new WeakSet();
export function createChangeDraft(world,key,token) {
 const r=resolveCharacter(world,key,{token});
 if(!r.ok||r.status!=='alive'||!r.accessible)return null;
 const proof=Object.freeze({});
 draftProofs.set(proof,{world,key,entity:r.entity,profile:readProfile(r.entity),token});return proof;
}
function decreeOperations(command,before) {
 return command.operations.map(op=>{
  if(op.op!=='decree')throw Error('explicit-decree-required');
  if(op.action==='open_meridians') {
   if(!['yin_block','yang_block'].includes(before.physique?.id))throw Error('not-sealed-meridians');
   return {op:'set',field:'physique',value:{...before.physique,stage:1}};
  }
  if(op.action==='set_physique_stage') {
   if(!before.physique||!Number.isInteger(op.stage)||op.stage<0||op.stage>5)throw Error('invalid-stage');
   return {op:'set',field:'physique',value:{...before.physique,stage:op.stage}};
  }
  if(op.action==='remove_state')return {op:'remove',field:'states',id:op.id};
  if(op.action==='grant_bloodline')return {op:'add',field:'bloodlines',value:{id:op.id,grade:op.grade??1,purity:op.purity??50,latent:op.latent===true,stable:false,inheritable:false,source:'天道敕赐'}};
  if(op.action==='set_bloodline_visibility') {
   const row=before.bloodlines.find(b=>b.id===op.id);if(!row)throw Error('missing-bloodline');
   return {op:'add',field:'bloodlines',value:{...row,latent:op.latent===true}};
  }
  throw Error('unknown-decree');
 });
}
export function previewChangeSet(world,command,{token,draftProof}={}) {
 try {
  if(!command||typeof command.id!=='string'||!command.id.length||command.id.length>120||!permissions[command.mode]||!Array.isArray(command.operations)||!command.operations.length||command.operations.length>32) throw Error('invalid-command');
  const r=resolveCharacter(world,command.key,{token}); if(!r.ok) return r;
  if(r.status!=='alive'||!r.accessible) throw Error('target-unavailable');
  if(command.mode==='natural'||command.mode==='birth')throw Error('permission-denied');
  const before=readProfile(r.entity);
  const proof=draftProofs.get(draftProof);
  if(draftProof&&(!proof||usedDrafts.has(draftProof)||proof.world!==world||proof.entity!==r.entity||proof.key!==command.key))throw Error('stale-draft');
  const operations=command.mode==='decree'?decreeOperations(command,before):command.operations;
  if(proof)for(const op of operations) {
   const select=p=>op.field==='cultivation'?{primary:p.cultivation.primary,skills:p.cultivation.skills,auxiliary:p.cultivation.auxiliary}:p[op.field];
   if(JSON.stringify(select(proof.profile))!==JSON.stringify(select(before)))throw Error('field-conflict:'+op.field);
  }
  if(before.commands.includes(command.id)) return {ok:true,duplicate:true,profile:before,revision:before.revision};
  if(!proof&&command.expectedRevision!==before.revision) throw Error('revision-conflict');
  const p=clone(before);
  for(const raw of operations) {
   const op=clone(raw);
   if(command.mode==='player') {
    if(op.op!=='set')throw Error('fate-set-only');
    const keys={root:['elements','purity','natural','heavenly'],physique:['id'],hexagram:['id'],attributes:['bone','comprehension','perception']};
    if(keys[op.field]&&op.value&&Object.keys(op.value).some(k=>!keys[op.field].includes(k)))throw Error('runtime-state-not-editable');
    if(['personality','hobbies'].includes(op.field)&&(!Array.isArray(op.value)||op.value.some(v=>Object.keys(v).some(k=>k!=='id'))))throw Error('runtime-state-not-editable');
    if(op.field==='physique'&&op.value)op.value=before.physique?.id===op.value.id?clone(before.physique):{id:op.value.id,stage:0,source:'玩家改命'};
   }
   if(command.mode==='player'&&op.field==='root'&&op.value?.heavenly)throw Error('heavenly-root-natural-only');
   if(command.mode==='player'&&op.field==='traits'){const values=Array.isArray(op.value)?op.value:[op.value];if(values.some(v=>getCatalogEntry(v?.id)?.category==='special'))throw Error('bound-source-required');}
   if(op.value?.loan||op.value?.pageLoan||op.value?.combat)throw Error('runtime-state-not-editable');
   if(op.field==='daoSeed'&&op.value&&Object.keys(op.value).some(k=>!['id','stage','source'].includes(k)))throw Error('runtime-state-not-editable');
   if(!permissions[command.mode].includes(op.field)) throw Error('permission-denied');
   if(op.op==='set'&&op.field==='cultivation') {
    const v=op.value;if(!v||Object.keys(v).some(k=>!['primary','skills','auxiliary'].includes(k)))throw Error('runtime-state-not-editable');
    const known=(r.entity.techniques||[]).slice(0,3).map(techniqueId);
    if(v.primary!=null&&!known.includes(v.primary))throw Error('unknown-primary-manual');
    if(v.skills?.some(id=>['yang','thunder'].includes(id)&&!(r.entity.techniques||[]).some(t=>t.kind===(id==='yang'?'dual':'thunder'))))throw Error('unlearned-skill');
    p.cultivation={...p.cultivation,primary:v.primary??p.cultivation.primary,skills:clone(v.skills??p.cultivation.skills),auxiliary:known.filter(id=>id!==(v.primary??p.cultivation.primary)).slice(0,2)};
   }else if(op.op==='set') p[op.field]=clone(op.value);
   else if(op.op==='add' && ARRAY_LIMITS[op.field]) {const i=p[op.field].findIndex(x=>x.id===op.value?.id);if(i>=0)p[op.field][i]=clone(op.value);else p[op.field].push(clone(op.value));}
   else if(op.op==='remove'&&ARRAY_LIMITS[op.field]) p[op.field]=p[op.field].filter(x=>x.id!==op.id);
   else throw Error('invalid-operation');
  }
  p.revision++;
  const diff=operations.map(x=>({field:x.field,before:clone(before[x.field]),after:clone(p[x.field])}));
  p.history.push({day:world.day,commandId:command.id,mode:command.mode,key:command.key,inheritanceAffected:command.mode==='decree'&&operations.some(x=>x.field==='bloodlines'),inFlightAffected:!!r.entity.transit||(world.wanxiang?.encounters||[]).some(e=>e.stage==='open'&&e.participants.some(p=>p.actorId===r.entity.id&&p.stage==='travel')),source:command.mode==='decree'?'天道敕改':'玩家改命',actions:command.mode==='decree'?command.operations.map(o=>o.action):[],diff});p.history=p.history.slice(-128);
  // Older copies still carry their original expectedRevision, so they cannot commit
  // after eviction. The recent window supplies a positive receipt for retries.
  p.commands.push(command.id);
  p.commands=p.commands.slice(-128);
  while (p.history.length > 1 && JSON.stringify(p.history).length > 24576) p.history.shift();
  validateProfile(p);
  const result={ok:true,profile:p,diff,revision:p.revision};previews.set(result,{world,entity:r.entity,revision:before.revision,key:command.key,token,draftProof});return result;
 }catch(e){return {ok:false,reason:e.message};}
}
export function commitChangeSet(world,command,options={}) {
 // Even a revision-0 command must identify its originating world and body.
 // Unbound previews remain read-only; a plain serializable command is not authority.
 const result=previewChangeSet(world,command,options);if(!result.ok)return result;
 if(!options.token&&!draftProofs.has(options.draftProof))return {ok:false,reason:'identity-binding-required'};
 if(result.duplicate)return result;
 const proof=previews.get(result); const r=resolveCharacter(world,proof.key,{token:proof.token});
 if(!r.ok||r.entity!==proof.entity||readProfile(r.entity).revision!==proof.revision)return {ok:false,reason:'identity-conflict'};
 r.entity.wanxiang=clone(result.profile);if(proof.draftProof)usedDrafts.add(proof.draftProof);world.touch?.({terrain:false});return result;
}
