import {SUPPORTED_CONDITIONS} from './conditions.js';
import design from './content/designCatalog.js';
import experienceTraits from './content/experienceTraits.js';
import daoSeeds from './content/daoSeeds.js';

// Content metadata never asserts that a simulation consumer is wired. Runtime
// coverage must be reported separately by the integration layer and its tests.
function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze); Object.freeze(value);
  }
  return value;
}
const consumedAxes=['cultivation','hp','combat','learning','healing','perception','breakthrough','detect_radius','healing_received','escape','physical_power','spell_cost'];
const define = (entry, category) => {
 const rows=[{condition:'always',effects:entry.effects??{}},...(entry.conditionalEffects??[])];
 const numeric=rows.some(r=>SUPPORTED_CONDITIONS.includes(r.condition)&&Object.keys(r.effects).some(k=>consumedAxes.includes(k)));
 return {...entry, category, effects:entry.effects??{}, implementation:numeric?'B':'C',implemented:false,consumerRefs:numeric?['wanxiang/effects.js#readEffects']:[],source:entry.source??'命簿V02_内容目录.json'};
};
export const SOURCE_DESIGN = freeze(design);
export const ROOT_TIERS = freeze(design.rootTiers.map((name,index) => ({id:`root_tier_${index+1}`,name,channels:[5,4,3,2,1,1][index],multiplier:[.85,.92,1,1.12,1.24,1.38][index],requiresHeavenly:index===5,minPurity:index===5?95:0})));
export const ROOT_ELEMENTS = freeze(['金','木','水','火','土']);
export const ROOT_MUTATIONS = freeze(['风','冰','雷']); // examples, not a replacement for the 23 legacy roots
const physiqueEffects = {chaos:{cultivation:-.35},dao_embryo:{learning:.25,hp:-.15},wood:{healing:.12}};
const physiqueConditions = {
 spacetime:[{condition:'legal_journey',effects:{travelDuration:-.12}}],
 lunar:[{condition:'yin_path',effects:{cultivation:.15}}],
 fire_eater:[{condition:'fire_path',effects:{cultivation:.08}}],
 sword:[{condition:'sword_manual',effects:{learning:.30}}],
 wood:[{condition:'alchemy_manual',effects:{learning:.15}}],
 earth:[{condition:'land_journey',effects:{travelDuration:.12}}],
 yin_block:[{condition:'meridians_blocked',effects:{cultivation:-.55}},{condition:'yin_meridians_open',effects:{cultivation:.20}}],
 yang_block:[{condition:'meridians_blocked',effects:{cultivation:-.55}},{condition:'yang_meridians_open',effects:{cultivation:.20}}],
};
export const PHYSIQUES = freeze(design.physiques.map(entry => define({...entry,effects:physiqueEffects[entry.id] ?? {},conditionalEffects:physiqueConditions[entry.id] ?? [],effectText:entry.effect},'physique')));
export const BLOODLINES = freeze(design.bloodlines.map(entry => define({...entry,effectText:entry.effect},'bloodline')));
export const BLOOD_GRADES = freeze(design.bloodGrades.map((name,index) => ({id:`blood_grade_${index+1}`,name,grade:index+1})));
export const HEXAGRAMS = freeze(design.hexagrams.map(entry => {
  const axis = entry.effect.axis === 'maxHp' ? 'hp' : entry.effect.axis;
  const effects = {[axis]:entry.effect.value};
  return define({...entry,effects:entry.effect.condition==='always'?effects:{},conditionalEffects:entry.effect.condition==='always'?[]:[{condition:entry.effect.condition,effects}],consumerAxis:entry.effect.axis},'hexagram');
}));
export const EXPERIENCE_TRAITS = freeze(experienceTraits.map(entry => ({...define(entry,entry.category),...(entry.category==='special'?{editable:false,reason:'必须由真实原剑或锚点经历授予'}:{})})));
export const DAO_SEEDS = freeze(daoSeeds.map(entry => define(entry,'daoSeed')));
const personalityRows = [['sword_enthusiast','剑痴','behavior','偏好剑法'],['timid','胆小','behavior','提早退避'],['romantic','情种','behavior','偏向道侣照护']];
const hobbyRows = [['bad_namer','起名苦手','decoration','纯装饰'],['pillow_first','闭关先找枕头','decoration','纯装饰'],['page_dream','梦里有页声','clue','需要真实触发条件'],['late_shadow','影子迟半拍','clue','需要真实触发条件'],['watched','总觉有人注视','clue','需要真实触发条件']];
const features = (rows,category) => freeze(rows.map(([id,name,kind,effectText]) => define({id:`${category}_${id}`,name,kind,effectText,source:'坐天观井_命簿V02_UI与机制调整方案.md#9'},category)));
export const PERSONALITIES = features(personalityRows,'personality');
export const HOBBIES = features(hobbyRows,'hobby');
export const CATALOG = freeze({rootTiers:ROOT_TIERS,physiques:PHYSIQUES,bloodlines:BLOODLINES,bloodGrades:BLOOD_GRADES,hexagrams:HEXAGRAMS,experienceTraits:EXPERIENCE_TRAITS,daoSeeds:DAO_SEEDS,personalities:PERSONALITIES,hobbies:HOBBIES});
// Numeric bloodline tuning is intentionally separate from the original design:
// only grade coefficients were supplied. Consumers must not invent unconditional
// resurrection, fragment knowledge or battle growth from a catalog selection.
export const BLOOD_GRADE_COEFFICIENTS = freeze([.2,.3,.4,.5,.6,.7,.8,.9,1]);
export const EFFECT_CONTEXT_CONTRACT = freeze({
 legal_journey:'Validated existing movement/route, never permission to bypass geography',
 land_journey:'Existing movement is on a legal land route',
 yin_path:'Actual primary manual has explicit yin affinity',
 fire_path:'Actual primary manual has explicit fire affinity',
 sword_manual:'Learning target is a real acquired sword manual',
 alchemy_manual:'Learning target is a real acquired alchemy manual',
 meridians_blocked:'Selected yin/yang physique instance stage is blocked or loosening',
 yin_meridians_open:'yin_block instance is open and actual primary manual has yin affinity',
 yang_meridians_open:'yang_block instance is open and actual primary manual has yang affinity',
});
// This describes definitions only. No A/B status without runtime evidence.
export const CONTENT_CONSUMER_STATUS = freeze([...PHYSIQUES,...BLOODLINES,...HEXAGRAMS,...DAO_SEEDS].map(entry=>({
 id:entry.id,status:entry.implementation,consumerRefs:entry.consumerRefs,
 reason:entry.implementation==='B'?'Numeric consumer wired; complete design behavior remains partial':'Definition present; integration consumer and condition evidence required',
 supportedDefinitionAxes:[...new Set([...Object.keys(entry.effects),...(entry.conditionalEffects??[]).flatMap(c=>Object.keys(c.effects))])],
 conditions:(entry.conditionalEffects??[]).map(c=>c.condition),
})));
const entries = Object.values(CATALOG).flat();
const byId = new Map(entries.map(entry => [entry.id,entry]));
if (byId.size !== entries.length) throw new Error('Duplicate Wanxiang catalog ID');
export function getCatalogEntry(id) { return byId.get(id) ?? null; }
export function getCatalogEntries(category) { return CATALOG[category] ?? []; }
export default CATALOG;
