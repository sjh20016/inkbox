import { MANUALS,FORBIDDEN_TECHNIQUES,NETHER_TECHNIQUES } from '../core/lore.js';
const manualIds=new Set([...MANUALS,...FORBIDDEN_TECHNIQUES,...NETHER_TECHNIQUES].map(t=>'manual:'+Array.from(t.name).map(c=>c.codePointAt(0).toString(16)).join('-')));
import {getCatalogEntry} from './catalog.js';
export const PROFILE_VERSION = 1;
export const ARRAY_LIMITS = Object.freeze({bloodlines:3, personality:3,hobbies:4,traits:6,states:32,bonds:32});
export const clone = value => structuredClone(value);
export function emptyProfile() {
 return {version:1,revision:0,root:null,physique:null,bloodlines:[],hexagram:null,attributes:{bone:50,comprehension:50,perception:50},permanent:{bone:0,comprehension:0,perception:0},personality:[],hobbies:[],traits:[],states:[],bonds:[],cultivation:{primary:null,auxiliary:[],skills:[]},daoSeed:null,dna:null,history:[],commands:[]};
}
export function readProfile(entity) { return clone(entity?.wanxiang || emptyProfile()); }
export function initializeProfile(entity) { if (!entity.wanxiang) entity.wanxiang=emptyProfile(); return entity.wanxiang; }
export function effectiveAttribute(entity,name) { const p=entity?.wanxiang || emptyProfile(); return Math.max(0,Math.min(100,p.attributes[name]+p.permanent[name])); }
export function validateProfile(p) {
 if (!p || p.version!==1 || !Number.isSafeInteger(p.revision) || p.revision<0) throw Error('invalid-profile-version');
 const allowed=[...Object.keys(emptyProfile()),"experienceLedger","pageLoan","costs"]; if(Object.keys(p).some(k=>!allowed.includes(k))) throw Error('unknown-profile-field');
 for (const field of ['attributes','permanent']) for (const key of ['bone','comprehension','perception']) if(!Number.isFinite(p[field]?.[key]) || Math.abs(p[field][key])>100 || (field==='attributes' && p[field][key]<0)) throw Error('invalid-attribute');
 for(const [field,limit] of Object.entries(ARRAY_LIMITS)) { const a=p[field]; if(!Array.isArray(a)||a.length>limit||a.some(x=>!x||typeof x.id!=='string'||x.id.length>100)||new Set(a.map(x=>x.id)).size!==a.length) throw Error('invalid-'+field); }
 if(p.traits.filter(x=>x.special).length>2 || p.bloodlines.filter(x=>!x.latent).length>1 || p.bloodlines.filter(x=>x.latent).length>2) throw Error('invalid-capacity');
 for(const b of p.bloodlines) if(!Number.isInteger(b.grade)||b.grade<1||b.grade>9||!Number.isFinite(b.purity)||b.purity<0||b.purity>100) throw Error('invalid-bloodline');
 if(p.root) { const r=p.root;if(['natural','heavenly'].some(k=>r[k]!=null&&typeof r[k]!=='boolean')||!Array.isArray(r.elements)||!r.elements.length||r.elements.length>5||new Set(r.elements.map(e=>({金:'metal',木:'wood',水:'water',火:'fire',土:'earth'})[e]||e)).size!==r.elements.length||r.elements.some(e=>!['metal','wood','water','fire','earth','金','木','水','火','土'].includes(e))||!Number.isFinite(r.purity)||r.purity<0||r.purity>100|| (r.heavenly && (r.elements.length!==1||r.purity<95||!r.natural))) throw Error('invalid-root'); }
 for(const f of ['physique','hexagram','daoSeed']) if(p[f]!==null && (!p[f]||typeof p[f].id!=='string')) throw Error('invalid-'+f);
 for(const f of ['history','commands']) if(!Array.isArray(p[f])||p[f].length>128) throw Error('invalid-'+f);
 if(!p.cultivation||!Array.isArray(p.cultivation.auxiliary)||p.cultivation.auxiliary.length>2||!Array.isArray(p.cultivation.skills)||p.cultivation.skills.length>5) throw Error('invalid-cultivation');
 if(p.cultivation.primary!=null&&!manualIds.has(p.cultivation.primary)||p.cultivation.auxiliary.some(id=>!manualIds.has(id))||new Set(p.cultivation.auxiliary).size!==p.cultivation.auxiliary.length)throw Error('invalid-practice-id');
 if(p.experienceLedger){const l=p.experienceLedger;if(l.lastSequence!=null&&(!Number.isSafeInteger(l.lastSequence)||l.lastSequence<0))throw Error('invalid-sequence-watermark');if(!Array.isArray(l.seen)||l.seen.length>128||!Array.isArray(l.records)||l.records.length>24||!l.cooldowns||Object.keys(l.cooldowns).length>32||!l.siteFailures||Object.keys(l.siteFailures).length>32||!Number.isInteger(l.permanentGrants)||l.permanentGrants<0||l.permanentGrants>6)throw Error('invalid-experience-ledger');}
 if(p.cultivation.learning){const l=p.cultivation.learning;if(typeof l!=='object'||Array.isArray(l)||Object.keys(l).length>manualIds.size||Object.entries(l).some(([id,n])=>!manualIds.has(id)||!Number.isFinite(n)||n<0||n>=1))throw Error('invalid-learning');}
 if(p.cultivation.combat){const c=p.cultivation.combat;if(!Number.isFinite(c.mana)||c.mana<0||c.mana>30||!Number.isFinite(c.lastActionDay)||!c.cooldowns||Object.entries(c.cooldowns).some(([k,v])=>!['renew','strike','spell','guard','perceive','yang','thunder'].includes(k)||!Number.isFinite(v)))throw Error('invalid-combat');}
 if(p.cultivation.battle){const b=p.cultivation.battle;if(Object.keys(b).some(k=>!['windowStart','grants','seen','untilDay','bonus','lastDevourDay'].includes(k))||![b.windowStart,b.untilDay,b.bonus,b.lastDevourDay].every(Number.isFinite)||b.windowStart<0||b.untilDay<0||b.lastDevourDay< -1||!Number.isInteger(b.grants)||b.grants<0||b.grants>3||b.bonus<0||b.bonus>.06||!Array.isArray(b.seen)||b.seen.length>3||new Set(b.seen).size!==b.seen.length||b.seen.some(k=>typeof k!=='string'||!/^([0-2]|mortal|upper|nether):[1-9][0-9]*$/.test(k)))throw Error('invalid-battle');}
 if(p.dna){const d=p.dna;if(typeof d!=='object'||Array.isArray(d)||!Array.isArray(d.parents)||d.parents.length>2||d.parents.some(k=>typeof k!=='string'||!/^(mortal|upper|nether):[1-9][0-9]*$/.test(k)))throw Error('invalid-dna');if(d.rootTemplate)validateProfile({...emptyProfile(),root:d.rootTemplate});}
 for(const loan of [p.pageLoan,p.daoSeed?.loan].filter(Boolean))if(typeof loan.id!=='string'||!Number.isSafeInteger(loan.lenderId)||loan.lenderId<=0||!Number.isSafeInteger(loan.borrowerId)||loan.borrowerId<=0||typeof loan.manualName!=='string'||!Number.isFinite(loan.expiresDay)||loan.expiresDay<0)throw Error('invalid-page-loan');
 // Catalog definitions are the sole authority for executable effects.
 if(p.costs && (Object.keys(p.costs).some(k=>k!=='lifespan')||!Number.isFinite(p.costs.lifespan)||p.costs.lifespan<0||p.costs.lifespan>100000))throw Error('invalid-costs');
 const categories={physique:['physique'],hexagram:['hexagram'],daoSeed:['daoSeed'],bloodlines:['bloodline'],personality:['personality'],hobbies:['hobby'],traits:['trait','persistent','special'],states:['state'],bonds:['bond']};
 for(const [field,categoriesAllowed] of Object.entries(categories))for(const row of (Array.isArray(p[field])?p[field]:p[field]?[p[field]]:[])) {
  const def=getCatalogEntry(row.id), gratitude=field==='bonds'&&/^gratitude:(mortal|upper|nether):[1-9][0-9]*$/.test(row.id)&&row.targetKey===row.id.slice(10);
  if(def?.category==='special'&&row.special!==true)throw Error('invalid-special-slot');
  if(row.effects || (!gratitude&&(!def||!categoriesAllowed.includes(def.category))))throw Error('invalid-catalog-entry');
  for(const flag of ['latent','stable','inheritable','dormant','special'])if(row[flag]!=null&&typeof row[flag]!=='boolean')throw Error('invalid-entry-flag');
  for(const key of ['stage','startDay','expiresDay','untilDay','treatments','lastTreatmentDay'])if(row[key]!=null&&(!Number.isFinite(row[key])||row[key]<0))throw Error('invalid-entry-state');
  if(row.stage!=null&&(!Number.isInteger(row.stage)||row.stage>5))throw Error('invalid-entry-stage');
 }
 if(new Set(p.commands).size!==p.commands.length||p.commands.some(x=>typeof x!=='string'||!x.length||x.length>120))throw Error('invalid-command-receipts');
 if(p.cultivation.skills.some(id=>!['renew','strike','spell','guard','perceive','yang','thunder'].includes(id))||new Set(p.cultivation.skills).size!==p.cultivation.skills.length)throw Error('invalid-skills');
 // JSON data only; reject nonfinite numbers, prototype payloads and unbounded nested state.
 const encoded=JSON.stringify(p,(k,v)=>{if(['__proto__','constructor','prototype'].includes(k)||typeof v==='function'||typeof v==='number'&&!Number.isFinite(v))throw Error('invalid-profile-data');return v;});
 if(encoded.length>65536) throw Error('profile-too-large'); return p;
}




// Legacy quality is 0..4. New root channels are authoritative once selected.
export function rootQuality(entity) {const r=entity?.wanxiang?.root;return r?Math.min(4,Math.max(0,5-r.elements.length)+(r.heavenly?1:0)):entity?.root?.quality??0;}
