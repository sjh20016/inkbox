import {getCatalogEntry} from './catalog.js';
import {resolveCharacter} from '../g1/characterIdentity.js';
import {readProfile,validateProfile,clone,ARRAY_LIMITS} from './profile.js';
const permissions={player:['root','physique','bloodlines','hexagram','attributes','permanent','personality','hobbies','traits','states','bonds','cultivation','daoSeed'],natural:['physique','bloodlines','permanent','traits','states','bonds','daoSeed'],birth:[]};
const previews=new WeakMap();
export function previewChangeSet(world,command,{token}={}) {
 try {
  if(!command||typeof command.id!=='string'||!command.id.length||command.id.length>120||!permissions[command.mode]||!Array.isArray(command.operations)||!command.operations.length||command.operations.length>32) throw Error('invalid-command');
  const r=resolveCharacter(world,command.key,{token}); if(!r.ok) return r;
  if(r.status!=='alive'||(command.mode==='player'&&!r.accessible)) throw Error('target-unavailable');
  const before=readProfile(r.entity);
  if(before.commands.includes(command.id)) return {ok:true,duplicate:true,profile:before,revision:before.revision};
  if(command.expectedRevision!==before.revision) throw Error('revision-conflict');
  const p=clone(before);
  for(const op of command.operations) {
   if(command.mode==='player'&&op.field==='root'&&op.value?.heavenly)throw Error('heavenly-root-natural-only');
   if(command.mode==='player'&&op.field==='traits'){const values=Array.isArray(op.value)?op.value:[op.value];if(values.some(v=>getCatalogEntry(v?.id)?.category==='special'))throw Error('bound-source-required');}
   if(op.value?.loan||op.value?.pageLoan||op.value?.combat)throw Error('runtime-state-not-editable');
   if(!permissions[command.mode].includes(op.field)) throw Error('permission-denied');
   if(op.op==='set'&&op.field==='cultivation') {
    const v=op.value;if(!v||Object.keys(v).some(k=>!['primary','skills','auxiliary'].includes(k)))throw Error('runtime-state-not-editable');
    const known=(r.entity.techniques||[]).slice(0,3).map(t=>'manual:'+Array.from(t.name).map(c=>c.codePointAt(0).toString(16)).join('-'));
    if(v.primary!=null&&!known.includes(v.primary))throw Error('unknown-primary-manual');
    if(v.skills?.some(id=>['yang','thunder'].includes(id)&&!(r.entity.techniques||[]).some(t=>t.kind===(id==='yang'?'dual':'thunder'))))throw Error('unlearned-skill');
    p.cultivation={...p.cultivation,primary:v.primary??p.cultivation.primary,skills:clone(v.skills??p.cultivation.skills),auxiliary:known.filter(id=>id!==(v.primary??p.cultivation.primary)).slice(0,2)};
   }else if(op.op==='set') p[op.field]=clone(op.value);
   else if(op.op==='add' && ARRAY_LIMITS[op.field]) {const i=p[op.field].findIndex(x=>x.id===op.value?.id);if(i>=0)p[op.field][i]=clone(op.value);else p[op.field].push(clone(op.value));}
   else if(op.op==='remove'&&ARRAY_LIMITS[op.field]) p[op.field]=p[op.field].filter(x=>x.id!==op.id);
   else throw Error('invalid-operation');
  }
  p.revision++;
  const diff=command.operations.map(x=>({field:x.field,before:clone(before[x.field]),after:clone(p[x.field])}));
  p.history.push({day:world.day,commandId:command.id,mode:command.mode,source:String(command.source||command.mode).slice(0,160),diff});p.history=p.history.slice(-128);
  // Command receipts are never evicted: at the bounded ledger limit reject new edits.
  if(p.commands.length>=128)throw Error('command-ledger-full');p.commands.push(command.id);
  validateProfile(p);
  const result={ok:true,profile:p,diff,revision:p.revision};previews.set(result,{world,entity:r.entity,revision:before.revision,key:command.key,token});return result;
 }catch(e){return {ok:false,reason:e.message};}
}
export function commitChangeSet(world,command,options={}) {
 const result=previewChangeSet(world,command,options);if(!result.ok||result.duplicate)return result;
 const proof=previews.get(result); const r=resolveCharacter(world,proof.key,{token:proof.token});
 if(!r.ok||r.entity!==proof.entity||readProfile(r.entity).revision!==proof.revision)return {ok:false,reason:'identity-conflict'};
 r.entity.wanxiang=clone(result.profile);world.touch?.({terrain:false});return result;
}
