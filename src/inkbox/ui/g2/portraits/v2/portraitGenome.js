import {GENETIC_SLOTS,STYLE_SLOTS,VARIANTS,hasVariant} from "./portraitSchema.js";
// Stable FNV-1a hash, not World RNG. Version salt isolates recipe from older G2-W prototype.
export function portraitHash(source){let h=2166136261;for(const c of String(source)){h^=c.codePointAt(0);h=Math.imul(h,16777619);}return h>>>0;}
function keyOf(value){return typeof value==="string"||typeof value==="number"?String(value):"unknown";}
export function chooseVariant(slot,seed){
  const list=VARIANTS[slot];if(!list)throw new TypeError("Unknown appearance slot: "+slot);
  return list[portraitHash("inkbox-portrait-v1:"+keyOf(seed)+":"+slot)%list.length];
}
function materialize(slots,seed,provided){
  const raw=provided&&typeof provided==="object"&&!Array.isArray(provided)?provided:{};
  const out={};
  for(const slot of slots)out[slot]=hasVariant(slot,raw[slot])?raw[slot]:chooseVariant(slot,seed);
  return Object.freeze(out);
}
/** Identity key must include World/plane namespace to avoid cross-world collisions. */
export function createPortraitGenome(identityKey,explicit=null){
  return materialize(GENETIC_SLOTS,"founder:"+keyOf(identityKey),explicit);
}
export function createPortraitStyle(identityKey,explicit=null){
  return materialize(STYLE_SLOTS,"style:"+keyOf(identityKey),explicit);
}
/** Legacy numeric G2-W appearance keys are mapped only for opt-in compatibility; the old renderer stays intact. */
export function fromLegacyAppearance(legacy={}){
  if(!legacy||typeof legacy!=="object")return {};
  const remap={face:"face",eyes:"eyes",hair:"frontHair",skinColor:"skin",hairColor:"hair",robe:"robe",collar:"collar",motif:"motif",accent:"accent"};
  const out={};
  for(const [old,slot] of Object.entries(remap)){
    if(Number.isInteger(legacy[old])&&legacy[old]>=0&&legacy[old]<VARIANTS[slot].length)out[slot]=VARIANTS[slot][legacy[old]];
  }
  return out;
}
/** Parent data is a birth-time snapshot. Do not query live parents while opening character UI.
 * No assumptions about parent sex or relative roles. Mutation is bounded and seeded per child/slot.
 */
export function inheritPortraitGenome({parentA=null,parentB=null,childKey="unknown",mutationRate=0.06}={}){
  const rate=Number.isFinite(mutationRate)?Math.max(0,Math.min(.2,mutationRate)):.06;
  const parents=[parentA,parentB].map(p=>p&&typeof p==="object"?p:null);
  const child={};
  for(const slot of GENETIC_SLOTS){
    const valid=parents.map(p=>p&&hasVariant(slot,p[slot])?p[slot]:null).filter(Boolean);
    const hash=portraitHash("inkbox-inherit-v1:"+keyOf(childKey)+":"+slot);
    if(!valid.length){child[slot]=chooseVariant(slot,"orphan:"+keyOf(childKey));continue;}
    const mutation=portraitHash("inkbox-mutation-v1:"+keyOf(childKey)+":"+slot)/4294967296<rate;
    child[slot]=mutation?chooseVariant(slot,"variation:"+keyOf(childKey)):valid[hash%valid.length];
  }
  return Object.freeze(child);
}
/** Resolve full appearance, using explicit birth genome when present. UI must never infer parents. */
export function resolvePortraitRecipe(input={}){
  const key=input?.appearanceSeed??input?.identityKey??"unknown";
  const legacy=fromLegacyAppearance(input?.appearance);
  const genome=createPortraitGenome(key,{...legacy,...input?.genome});
  const style=createPortraitStyle(key,{...legacy,...input?.style});
  return Object.freeze({version:1,genome,style});
}
