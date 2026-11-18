import {emptyProfile,readProfile,validateProfile} from './profile.js';
export function createProfile({rng,fresh=false}={}) { const p=emptyProfile(); if(rng) p.hexagram={id:`hex_${String(Math.floor(rng()*64)+1).padStart(2,'0')}`}; if(fresh&&rng){const elements=['metal','wood','water','fire','earth'];const count=1+Math.floor(rng()*5);p.root={elements:elements.slice(Math.floor(rng()*5)).concat(elements).slice(0,count),purity:50+Math.floor(rng()*51),natural:true,heavenly:false};if(count===1&&p.root.purity>=95&&rng()<.1)p.root.heavenly=true;if(rng()<.03)p.physique={id:['wood','dao_embryo','sword'][Math.floor(rng()*3)],stage:0,inheritable:true};if(rng()<.01)p.bloodlines=[{id:['true_dragon','heaven_phoenix','god_king','asura'][Math.floor(rng()*4)],grade:1,purity:20,latent:false,stable:true,inheritable:true,source:{kind:'innate'}}];}if(p.root)p.dna={parents:[],day:null,bloodSources:[],rootSources:[],physiqueSources:[],rootTemplate:structuredClone(p.root)};return p; }
export function ensureProfile(entity,options={}) {return entity.wanxiang ||= createProfile(options);}
export function migrateProfile(entity,oldKey,newKey) {
 if(!entity.wanxiang)return;
 const p=readProfile(entity);
 const plane=newKey.split(':')[0];
 for(const bond of p.bonds){
  if(bond.dormantReason==='前世因缘')continue;
  if(bond.targetKey && !bond.targetKey.startsWith(plane+':')){
   bond.dormant=true;
   bond.dormantReason='跨界分隔';
  } else if(bond.dormantReason==='跨界分隔'){
   delete bond.dormant;
   delete bond.dormantReason;
  }
 }
 delete p.pageLoan;
 if(p.daoSeed?.loan)p.daoSeed=null;
 if(p.experienceLedger){p.experienceLedger.siteFailures={};delete p.experienceLedger.lastSequence;}
 p.revision++;
 p.history.push({kind:'migration',from:oldKey,to:newKey});
 p.history=p.history.slice(-128);
 entity.wanxiang=p;
}
// Called only AFTER the native Life birth has committed. Never creates people.
export function inheritBirthProfile(world,child,parents,{rng}={}) {
 if(!world.wanxiang?.enabled || child.wanxiang || !world.entities.includes(child) || child.age!==0 || child.birthOrigin?.kind!=='village' || parents?.length!==2 || parents[0]===parents[1] || !parents.every(p=>world.entities.includes(p)&&p.hp>0&&p.village===child.village) || typeof rng!=='function') return false;
 const p=createProfile({rng,fresh:true});const pp=parents.map(readProfile);
 p.dna={parents:parents.map(e=>`${world.plane||'mortal'}:${e.id}`),day:world.day,bloodSources:[],rootSources:[],physiqueSources:[]};
 // A birth lineage is inherited independently of an innate roll of the same lineage.
 const pool=[];
 pp.forEach((parent,i)=>{for(const b of parent.bloodlines)if(b.inheritable && b.stable)pool.push({...b,parent:i});});
 for(const b of pool){if(p.bloodlines.some(x=>x.id===b.id&&x.source?.kind==='innate'))p.bloodlines=p.bloodlines.filter(x=>x.id!==b.id);if(!p.bloodlines.some(x=>x.id===b.id)&&p.bloodlines.filter(x=>x.latent).length<2&&rng()<0.5) {const grade=Math.max(1,Math.min(9,b.grade-(rng()<0.8?1:0)+(rng()<0.01?1:0)));p.bloodlines.push({id:b.id,grade,inheritable:true,stable:true,latent:true,purity:Math.max(1,b.purity*0.5),stage:0,source:{kind:'birth',parent:p.dna.parents[b.parent]}});p.dna.bloodSources.push({id:b.id,parent:p.dna.parents[b.parent]});}}
 // At most two latent branches; a third accepted branch becomes the one dominant lineage.
 // Dominant innate lineage, when present, remains dominant; inherited branches remain latent.
 const roots=pp.map(x=>x.dna?.rootTemplate||x.root).filter(Boolean);
 if(roots.length) {const elements=[...new Set(roots.flatMap(x=>x.elements))];p.root={elements:elements.filter(()=>rng()<0.7).slice(0,5),purity:50,natural:true,heavenly:false};if(!p.root.elements.length)p.root.elements=[elements[0]];p.dna.rootSources=p.dna.parents;}
 for(let i=0;i<2;i++)if(pp[i].physique?.inheritable&&rng()<0.15){p.physique={id:pp[i].physique.id,stage:0,inheritable:true,source:{kind:'birth',parent:p.dna.parents[i]}};p.dna.physiqueSources=[p.dna.parents[i]];break;}
 p.dna.rootTemplate=structuredClone(p.root);validateProfile(p);child.wanxiang=p;return true;
}
