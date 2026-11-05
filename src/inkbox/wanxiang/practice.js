import { MANUALS, FORBIDDEN_TECHNIQUES, NETHER_TECHNIQUES } from '../core/lore.js';
import { initializeProfile } from './profile.js';
import { readEffects } from './effects.js';
import { emitCommittedFact } from './experiences.js';
import { battleBonus } from './damage.js';

export const techniqueId = t => `manual:${Array.from(typeof t === 'string' ? t : t.name).map(c => c.codePointAt(0).toString(16)).join('-')}`;
// Affinities affect study speed, never grant possession or erase legacy learning.
const AFFINITIES={sword:['metal'],life:['water','wood'],alchemy:['fire','wood'],body:['earth'],thunder:['metal','fire'],formation:['earth'],escape:['wood','water'],dual:['water','fire']};
const ELEMENTS={金:'metal',木:'wood',水:'water',火:'fire',土:'earth'};
export const PRACTICES = Object.freeze([...MANUALS, ...FORBIDDEN_TECHNIQUES, ...NETHER_TECHNIQUES].map(t => Object.freeze({id:techniqueId(t),revision:1,name:t.name,kind:t.kind || 'nether',minLevel:1,elements:Object.freeze(AFFINITIES[t.kind]||[]),manual:t})));
export function resolvePractice(id) { return PRACTICES.find(t => t.id === id || t.name === id) || null; }
export function knownPractices(e) { return (e.techniques || []).slice(0,3).map(t => resolvePractice(t.name) || {id:techniqueId(t),name:t.name,missing:true}); }
export function practiceState(e) {
 const c=initializeProfile(e).cultivation, ids=knownPractices(e).map(t=>t.id);
 if(!ids.includes(c.primary)) c.primary=ids[0] || null;
 c.auxiliary=ids.filter(id=>id!==c.primary).slice(0,2);
 return c;
}
export function setPrimaryPractice(e,id) { if(!knownPractices(e).some(t=>t.id===id)) return false; practiceState(e).primary=id;practiceState(e);return true; }
export function learningEligibility(e,id,{acquired=false,day=0,...context}={}) {
 const t=resolvePractice(id);
 if(!t) return {ok:false,reason:'unknown-manual'};
 if(!acquired) return {ok:false,reason:'not-acquired'};
 if((e.techniques || []).some(x=>x.name===t.name)) return {ok:false,reason:'already-learned'};
 if((e.techniques || []).length>=3) return {ok:false,reason:'capacity'};
 if(e.hp<=0 || (e.level || 0)<t.minLevel) return {ok:false,reason:'realm'};
 const p=e.wanxiang, roots=p?.root?.elements?.map(x=>ELEMENTS[x]||x);
 const affinity=!roots||!t.elements.length||p?.physique?.id==='chaos'||t.elements.some(x=>roots.includes(x)) ? 1 : .75;
 const learning=readEffects(e,{...context,day,first_manual:!(e.techniques||[]).length,manualId:t.id,sword_manual:t.kind==='sword',alchemy_manual:t.kind==='alchemy'}).learning;
 return {ok:true,reason:null,rate:Math.max(.1,Math.min(3,learning*affinity)),affinity};
}
// Only a genuine acquisition/study activity may call this mutation. Progress is bounded by catalog.
export function learnPractice(e,id,context={}) {
 const eligibility=learningEligibility(e,id,context); if(!eligibility.ok) return eligibility;
 const t=resolvePractice(id), studyDays=context.studyDays??1;
 if(!Number.isFinite(studyDays)||studyDays<=0) return {ok:false,reason:'study-time'};
 const c=practiceState(e), progress=c.learning ||= {};
 const amount=Math.min(1,(progress[t.id]||0)+Math.min(1,studyDays)*eligibility.rate);
 if(amount<1) {progress[t.id]=amount;return {...eligibility,ok:false,reason:'studying',progress:amount};}
 delete progress[t.id];
 (e.techniques ||= []).push(t.manual);practiceState(e);
 if(context.world)emitCommittedFact(context.world,e,{id:`learn:${e.incarnation||0}:${t.id}`,type:'manual-learned',manualId:t.id});
 return {...eligibility,progress:1};
}
export function practiceCultivationMultiplier(e,day=0) {
 // Pure observation: never initialize or reconcile persistent state here.
 const known=knownPractices(e), primary=e.wanxiang?.cultivation?.primary;
 const t=known.find(x=>x.id===primary)||known[0];
 return (t&&!t.missing ? 1.03+(known.length-1)*.01 : 1)*(1+battleBonus(e,day));
}
