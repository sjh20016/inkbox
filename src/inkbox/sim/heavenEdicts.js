import { characterReason } from '../g1/characterMessages.js';
import { expToNext, ceilingFor, QUALITIES, MUTATED_ROOTS, improveOrdinarySpiritRoot } from '../core/cultivation.js';
import { cultivationRate } from './cultivation.js';
import { resolveCharacter } from '../g1/characterIdentity.js';
export const HEAVEN_EDICTS = Object.freeze([
  Object.freeze({id:'cultivation',title:'灌顶',description:'增加下一层需求25%的修为，突破由模拟判定'}),
  Object.freeze({id:'fortune',title:'拨运',description:'气运增加8，上限100'}),
  Object.freeze({id:'mind',title:'定心',description:'心境增加8，上限100'}),
  Object.freeze({id:'root',title:'洗髓',description:'普通灵根提升一品，最高至优；可再次施行'}),
]);
function evaluateHeavenEdict(world,token,edictId) {
  if (!HEAVEN_EDICTS.some(e => e.id === edictId)) return {ok:false,reason:'invalid-edict'};
  if (!token) return {ok:false,reason:'invalid-selection'};
  const r = resolveCharacter(world,token.key,{token});
  if (!r.ok) return r;
  if (r.plane !== 'mortal' || r.status !== 'alive') return {ok:false,reason:'not-living-mortal'};
  if (!r.accessible) return {ok:false,reason:'locked-area'};
  if (r.entity.sp !== 'cultivator' || !(r.entity.level > 0)) return {ok:false,reason:'not-cultivator'};
  if (edictId === 'root') {
    const root = r.entity.root;
    if (!root) return {ok:false,reason:'root-missing'};
    if (root.mutated || MUTATED_ROOTS.some(candidate => candidate.name === root.rootName)) return {ok:false,reason:'mutated-root'};
    if (!Number.isInteger(root.quality) || root.quality < 0 || root.quality > 4
      || !Array.isArray(root.elements) || !root.elements.length) return {ok:false,reason:'missing-value'};
    if (root.quality >= 3) return {ok:false,reason:'root-quality-cap'};
    const upgraded = improveOrdinarySpiritRoot(root);
    if (!upgraded) return {ok:false,reason:'missing-value'};
    if (typeof world.record !== 'function') return {ok:false,reason:'missing-history'};
    return {ok:true,entity:r.entity,rootBefore:root,rootAfter:upgraded};
  }
  if (edictId === 'cultivation' && r.entity.level >= ceilingFor('mortal')) return {ok:false,reason:'realm-cap'};
  const field = edictId === 'cultivation' ? 'exp' : edictId;
  const before = r.entity[field], cap = field === 'exp' ? expToNext(r.entity.level) : 100;
  if (!Number.isFinite(before) || before < 0 || !Number.isFinite(cap)) return {ok:false,reason:'missing-value'};
  if (before >= cap) return {ok:false,reason:'at-cap'};
  if (typeof world.record !== 'function') return {ok:false,reason:'missing-history'};
  return {ok:true,entity:r.entity,field,before,after:Math.min(cap,before + (field === 'exp' ? cap * 0.25 : 8))};
}
export function checkHeavenEdict(world,token,edictId) {
  const result = evaluateHeavenEdict(world,token,edictId);
  return result.ok ? result : {...result,message:characterReason(result.reason)};
}
export function executeHeavenEdict(world,token,edictId) {
  const c = checkHeavenEdict(world,token,edictId);
  if (!c.ok) return {ok:false,reason:c.reason,message:characterReason(c.reason)};
  if (edictId === 'root') {
    const {entity,rootBefore,rootAfter} = c;
    const beforeRate = cultivationRate(world,entity);
    entity.root = rootAfter;
    const afterRate = cultivationRate(world,entity);
    const qualityBefore = QUALITIES[rootBefore.quality] || '不可考';
    const qualityAfter = QUALITIES[rootAfter.quality] || '不可考';
    const rateText = rate => Number.isFinite(rate) ? rate.toFixed(3) : '不可考';
    world.record(`天道敕令 · 洗髓：【${entity.name || '无名'}】${rootBefore.rootName}（${qualityBefore}，每日修为 ${rateText(beforeRate)}）→ ${rootAfter.rootName}（${qualityAfter}，每日修为 ${rateText(afterRate)}）；可持续修炼，突破仍由模拟判定`, 'intervention', entity);
    return {ok:true,edictId,field:'root',before:rootBefore,after:rootAfter,message:'洗髓已施行'};
  }
  const {entity,field,before,after} = c;
  entity[field] = after;
  const title = HEAVEN_EDICTS.find(e => e.id === edictId).title;
  const fieldName = {exp:'修为',fortune:'气运',mind:'道心'}[field];
  world.record(`天道敕令 · ${title}：【${entity.name || '无名'}】${fieldName} ${before} → ${after}`, 'intervention', entity);
  return {ok:true,edictId,field,before,after,message:`${title}已施行`};
}
