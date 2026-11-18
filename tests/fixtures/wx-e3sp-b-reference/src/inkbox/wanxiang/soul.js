import {emptyProfile,readProfile,validateProfile} from './profile.js';

// Soul continuity is deliberately narrower than a character/body copy.
export function soulSnapshot(world,entity) {
 if(!entity?.wanxiang)return null;
 const p=entity.wanxiang;
 const snapshot={version:1,origin:`${world.plane||'mortal'}:${entity.id}`,
  daoSeed:p.daoSeed?.loan?null:structuredClone(p.daoSeed),
  seedLedger:structuredClone(p.seedLedger||{borrowUntil:0,spent:[]}),
  bonds:structuredClone(p.bonds),history:structuredClone(p.history.slice(-16))};
 while(JSON.stringify(snapshot.history).length>12000)snapshot.history.shift();
 return validateSoulSnapshot(snapshot);
}
export function validateSoulSnapshot(s) {
 if(!s||s.version!==1||! /^(mortal|upper|nether):[1-9][0-9]*$/.test(s.origin)||Object.keys(s).some(k=>!['version','origin','daoSeed','seedLedger','bonds','history'].includes(k)))throw Error('invalid-wanxiang-soul');
 validateProfile({...emptyProfile(),daoSeed:s.daoSeed,seedLedger:s.seedLedger,bonds:s.bonds,history:s.history});
 if(s.daoSeed?.loan||s.history.length>16)throw Error('invalid-wanxiang-soul');
 return s;
}
export function attachSoulProfile(world,entity,snapshot,kind) {
 if(!snapshot)return false;
 const s=validateSoulSnapshot(snapshot),p=readProfile(entity);
 p.daoSeed=structuredClone(s.daoSeed);
 p.seedLedger=structuredClone(s.seedLedger);
 // Past-life bonds remain evidence, never active aid scoring for a new body.
 p.bonds=s.bonds.map(b=>({...structuredClone(b),dormant:true,dormantReason:'前世因缘'}));
 p.history=[...s.history.map(row=>({...structuredClone(row),pastLife:true})),
  {kind:'soul-continuity',source:kind,from:s.origin,to:`${world.plane||'mortal'}:${entity.id}`,day:world.day}];
 p.revision++;
 entity.wanxiang=validateProfile(p);
 return true;
}
