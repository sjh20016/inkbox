import { ghostTierOf, GHOST_TIER_NAMES } from '../sim/netherLife.js';
import { characterReason } from './characterMessages.js';
import { expToNext, realmLabel } from '../core/cultivation.js';
import { cultivationRate } from '../sim/cultivation.js';
import { toggleWatch, removeWatch, WATCH_CAP, WATCH_MAJOR_KINDS } from '../sim/watch.js';
import { compileBiography, importantRelations } from '../sim/biography.js';
import { compileDeadBiography } from '../sim/necrology.js';
import { HEAVEN_EDICTS, checkHeavenEdict, executeHeavenEdict } from '../sim/heavenEdicts.js';
import { characterKey, parseCharacterKey, resolveCharacter, createSelectionToken } from './characterIdentity.js';
export { characterKey, parseCharacterKey, resolveCharacter, createSelectionToken };

function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
const shown = value => value === null || value === undefined ? '不可考' : String(value);
const numeric = value => Number.isFinite(value) ? value : null;
const PLANE_LABELS = Object.freeze({mortal:'凡间',upper:'上界',nether:'幽冥',unknown:'去向不可考'});
const planeText = plane => PLANE_LABELS[plane] || '去向不可考';
const STATUS = {alive:'在世',dead:'已离世',ascended:'已入上界',nether:'已落幽冥',unknown:'已不可考'};
function realmText(entity) {
  const level = numeric(entity.level);
  if (entity.sp === 'ghost') {
    if (entity.soulKind === 'ghost') return '普通鬼魂';
    if (entity.soulKind === 'ghostCultivator') {
      const tier = ghostTierOf(level);
      return tier >= 0 ? `鬼修 · ${GHOST_TIER_NAMES[tier]}` : '鬼修阶位不可考';
    }
    return '鬼魂 · 类别不可考';
  }
  if (level === null) return '不可考';
  if (entity.sp === 'human' && level === 0) return '凡人';
  return entity.sp === 'cultivator' && level > 0 ? realmLabel(level) : '不可考';
}
/** Fact-only export for people whose formal biography compiler assumes cultivation. */
export function compileCharacterFacts(viewModel) {
  if (!viewModel) return '';
  const {identity,header,cultivation} = viewModel;
  const lines = [`# ${identity.name} · 人物事实`, '', `- 人物编号：#${identity.id}`,
    `- 当前位面：${planeText(identity.currentPlane)}`, `- 状态：${header.stateText}`,
    `- 境界：${header.realm}`, `- 年龄：${header.ageText}`, `- 所属：${header.affiliation}`,
    `- 修为：${shown(cultivation.exp)}`, `- 下一层需求：${shown(cultivation.required)}`,
    `- 修炼速度：${cultivation.rateText}`, '', '## 已知事实'];
  for (const row of [...viewModel.overview,...viewModel.cultivationRows,...viewModel.relations]) lines.push(`- ${row.label}：${row.value}`);
  lines.push('', '## 正式日志保留事件', '', viewModel.historyCoverage.description);
  for (const row of viewModel.history) lines.push(`- 第 ${shown(row.day)} 日：${row.text}`);
  if (!viewModel.history.length) lines.push('暂无保留的人物日志；不推断未记载的生平。');
  return lines.join('\n');
}
/** Permissions share the same fresh resolver and watch cap as command execution. */
export function characterPermissions(world, resolved) {
  const watched = (world.watch || []).some(entry => entry.key === resolved.key);
  const watchReason = watched ? '' : resolved.plane !== 'mortal' || resolved.status !== 'alive' || !resolved.accessible
    ? 'not-accessible-mortal' : (world.watch || []).length >= WATCH_CAP ? 'full' : '';
  const canRead = !!resolved.entity && !(resolved.status === 'alive' && !resolved.accessible);
  return { canWatch: !watchReason, watchReason, watchDisabledReason: watchReason ? characterReason(watchReason) : '',
    canFocus: resolved.accessible === true, canExport: canRead, canShowRelations: canRead };
}
/** Snapshot values only. World and entity references never escape through the presenter. */
export function buildCharacterViewModel(world,keyOrToken) {
  const token = typeof keyOrToken === 'object' ? keyOrToken : null;
  const key = token?.key ?? keyOrToken;
  const r = resolveCharacter(world,key,{token});
  if (!r.ok) return null;
  const e = r.entity || {}, level = numeric(e.level), exp = numeric(e.exp);
  const required = level !== null && e.sp === 'cultivator' && r.status !== 'dead' && !r.fateRecord ? expToNext(level) : null;
  let rate = null;
  if (['alive','ascended'].includes(r.status) && ['mortal','upper'].includes(r.currentPlane || r.plane) && e.sp === 'cultivator' && [e.x,e.y,e.mind,e.pollution].every(Number.isFinite) && r.sourceWorld.qi) rate = numeric(cultivationRate(r.sourceWorld,e));
  const affiliation = r.status === 'dead' || r.fateRecord ? shown(e.sectName) : e.faction ? (r.sourceWorld.factionById?.(e.faction)?.name || '所属宗门不可考') : e.sp === 'cultivator' ? '散修' : '无宗门';
  const history = (Array.isArray(e.log) ? e.log : []).map(row => ({day:numeric(row.day),kind:shown(row.kind),text:shown(row.text)}));
  const edictToken = token || createSelectionToken(world,key);
  const permissions = characterPermissions(world,r);
  return freeze({
    schemaVersion:1, permissions,
    identity:{key:r.key,id:r.id,plane:r.plane,currentPlane:r.currentPlane || r.plane,status:r.status,name:e.name || '不可考',canFocus:r.accessible},
    header:{realm:realmText(e),ageText:Number.isFinite(e.age) ? `${Math.floor(e.age / 360)} 岁` : '年龄不可考',affiliation,stateText:e.sp === 'ghost' && r.status === 'alive' ? '鬼魂存续' : r.status === 'ascended' && !r.arrival ? '已飞升 · 去向不可定位' : STATUS[r.status]},
    cultivation:{exp,required,percent:exp !== null && required !== null ? exp / required * 100 : null,rate,rateText:rate === null ? '修炼速度不可考' : `每日修为 ${rate.toFixed(3)}`,stateText:required === null || exp === null ? '修为不可考' : exp >= required ? '等待模拟突破' : '积累修为'},
    overview:[{label:'灵根',value:e.root?.rootName || e.rootName || '不可考'},{label:'位置',value:r.accessible ? `${planeText(r.currentPlane || r.plane)} (${e.x}, ${e.y})` : '当前不可定位'}],
    cultivationRows:[{label:'气运',value:shown(numeric(e.fortune))},{label:'心境',value:shown(numeric(e.mind))}],
    history,
    historyCoverage:{retained:true,capped:true,cap:32,description:'仅显示正式人物日志保留的事件，不能视为完整一生'},
    relations:[{label:'所属宗门',value:affiliation},...(Array.isArray(e.relations) ? e.relations : importantRelations(r.sourceWorld,e)).map(rel => ({label:shown(rel.type),value:rel.name || '不可考'}))],
    edicts:HEAVEN_EDICTS.map(def => { const c = checkHeavenEdict(world,edictToken,def.id); return {...def,enabled:c.ok,disabledReason:c.ok ? '' : characterReason(c.reason)}; }),
    watched:(world.watch || []).some(w => w.key === key),
  });
}
/** Accurate retained events and cumulative ledgers, with explicit coverage boundaries. */
export function summarizeCharacterObservation(world,keyOrToken,sinceDay = 0) {
  const vm = buildCharacterViewModel(world,keyOrToken);
  const ledger = world?.deadLog || {};
  const token = typeof keyOrToken === 'object' ? keyOrToken : null;
  const resolved = resolveCharacter(world,token?.key ?? keyOrToken,{token});
  const events = (vm?.history || []).filter(row => row.day > sinceDay && WATCH_MAJOR_KINDS.has(row.kind)).map(row => ({...row}));
  function evidence(day,kind,text) {
    if (Number.isFinite(day) && day > sinceDay && !events.some(row => row.day === day && row.kind === kind)) events.push({day,kind,text});
  }
  if (resolved.ok) {
    if (resolved.arrival) evidence(resolved.arrival.day,'ascend','可靠上界来客名录：已入上界');
    if (resolved.status === 'ascended' && resolved.fateRecord) evidence(resolved.fateRecord.died,'ascend','可靠离世名录：已飞升，去向不可定位');
    if (resolved.status === 'dead') evidence(resolved.entity.died,'death',resolved.entity.cause ? `逝者名录：${resolved.entity.cause}` : '可靠逝者名录：已离世');
    if (resolved.status === 'nether') evidence(resolved.entity.ghostOf.deathDay,'possess-cross','可靠幽冥来历：已落幽冥');
  }
  events.sort((a,b) => a.day - b.day);
  return freeze({key:vm?.identity.key || null,sinceDay,throughDay:numeric(world?.day),status:vm?.identity.status || 'unknown',events,coverage:{retained:true,capped:true,cap:32,complete:false},worldTotals:{deathsIncludingAscensions:numeric(ledger.total),ascensions:numeric(ledger.ascended),evictedDeadRecords:numeric(ledger.evicted)}});
}
export function createCharacterController({getWorld,onChange = () => {},presenter} = {}) {
  if (typeof getWorld !== 'function') throw new TypeError('getWorld must be a function');
  let token = null, vm = null, destroyed = false;
  function publish(next) { vm = next; if (!destroyed) { onChange(vm); if (vm) presenter?.render(vm); } return vm; }
  function refresh() {
    if (destroyed || !token) return null;
    const next = buildCharacterViewModel(getWorld(),token);
    if (!next) token = null;
    return publish(next);
  }
  function close() { token = null; publish(null); return {ok:true,viewModel:null}; }
  function select(input) {
    if (destroyed) return {ok:false,reason:'destroyed',message:characterReason('destroyed'),viewModel:null};
    const key = typeof input === 'string' ? input : characterKey(input?.plane,input?.entityId ?? input?.id);
    const next = createSelectionToken(getWorld(),key);
    if (!next) return {ok:false,reason:'invalid-or-inaccessible-target',message:characterReason('invalid-or-inaccessible-target'),viewModel:vm};
    token = next; refresh(); return {ok:true,viewModel:vm,token};
  }
  function handleAction(action) {
    if (destroyed) return {ok:false,reason:'destroyed',message:characterReason('destroyed'),viewModel:null};
    if (!action || !token || action.targetKey !== token.key) return {ok:false,reason:'stale-target',message:characterReason('stale-target'),viewModel:vm};
    const world = getWorld(), r = resolveCharacter(world,token.key,{token});
    if (!r.ok) { refresh(); return {ok:false,reason:r.reason,message:characterReason(r.reason),viewModel:vm}; }
    if (action.type === 'close') return close();
    let result;
    if (action.type === 'edict') result = executeHeavenEdict(world,token,action.edictId);
    else if (action.type === 'watch') {
      if ((world.watch || []).some(w => w.key === token.key)) result = {ok:removeWatch(world,token.key),watched:false};
      else if (!characterPermissions(world,r).canWatch) result = {ok:false,reason:characterPermissions(world,r).watchReason};
      else result = toggleWatch(world,r.entity,world.day);
    } else if (action.type === 'focus') result = r.accessible ? {ok:true,effect:{type:'focus',plane:r.currentPlane || r.plane,x:r.entity.x,y:r.entity.y}} : {ok:false,reason:'cannot-focus'};
    else if (action.type === 'export' || action.type === 'show-relations') {
      if (!r.entity || (r.status === 'alive' && !r.accessible)) result = {ok:false,reason:'unavailable-target'};
      else if (action.type === 'show-relations') result = {ok:true,effect:{type:'show-relations',plane:r.currentPlane || r.plane,relations:buildCharacterViewModel(world,token).relations}};
      else result = {ok:true,effect:{type:'export',filename:`${r.plane}-${r.id}.md`,text:r.entity.sp !== 'cultivator' ? compileCharacterFacts(buildCharacterViewModel(world,token)) : r.status === 'dead' || r.fateRecord ? compileDeadBiography(r.sourceWorld,r.entity) : compileBiography(r.sourceWorld,r.entity)}};
    } else result = {ok:false,reason:'invalid-action'};
    return {...result,message:result.message || (result.reason ? characterReason(result.reason) : ''),viewModel:refresh()};
  }
  return {select,open:select,current:() => vm,viewModel:() => vm,refresh,handleAction,close,reset:close,destroy(){if (destroyed) return; close();destroyed = true;presenter?.destroy();}};
}
