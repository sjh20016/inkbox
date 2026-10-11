// Presentation only. The host owns actual wounds, lifespan stages, soul, cultivation, and technique facts.
const AGES=["youth","adult","middle","elder"];
const TECHNIQUES=["none","fire","frost","wood","yin"];
const clamp=(n,max)=>Number.isFinite(n)?Math.max(0,Math.min(max,Math.round(n))):0;
export function normalizePortraitState(input={}){
  const raw=input&&typeof input==="object"&&!Array.isArray(input)?input:{};
  const age=AGES.includes(raw.ageStage)?raw.ageStage:"adult";
  const technique=TECHNIQUES.includes(raw.technique)?raw.technique:"none";
  return Object.freeze({
    ageStage:age,
    injury:clamp(raw.injury,3),
    scar:raw.scar===true,
    ghost:raw.ghost===true,
    corruption:clamp(raw.corruption,3),
    technique,
    expression:["neutral","calm","smile","tired"].includes(raw.expression)?raw.expression:"neutral",
    // These are visual states only; avoid inferring them from transient hit FX.
  });
}
/** Return a bounded list of visual changes, independent of World or persistent state. */
export function resolvePortraitEffects(state={}){
  const s=normalizePortraitState(state);
  const effects=[];
  if(s.ageStage==="middle"||s.ageStage==="elder")effects.push("age-lines");
  if(s.injury>0)effects.push(s.injury===1?"bruise-small":s.injury===2?"bruise-medium":"bandage");
  if(s.scar)effects.push("scar");
  if(s.technique!=="none")effects.push("technique-"+s.technique);
  if(s.corruption>0)effects.push("corruption-"+s.corruption);
  if(s.ghost)effects.push("ghost");
  return Object.freeze(effects);
}
export const PORTRAIT_STATE_CONTRACT=Object.freeze({
  ageStages:AGES,techniques:TECHNIQUES,
  priority:"base > age > injury/scars > technique > corruption > ghost > frame"
});
