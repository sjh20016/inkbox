import { ghostTierOf, GHOST_TIER_NAMES } from '../sim/netherLife.js';
import { characterReason } from './characterMessages.js';
import { personLifeFacts, personBirthOriginText } from '../ui/personLifeFacts.js';
import { expToNext, realmLabel, QUALITIES } from '../core/cultivation.js';
import { cultivationRate } from '../sim/cultivation.js';
import { toggleWatch, removeWatch, WATCH_CAP, WATCH_MAJOR_KINDS } from '../sim/watch.js';
import { compileBiography, importantRelations } from '../sim/biography.js';
import { compileDeadBiography } from '../sim/necrology.js';
import { HEAVEN_EDICTS, checkHeavenEdict, executeHeavenEdict } from '../sim/heavenEdicts.js';
import { characterKey, parseCharacterKey, resolveCharacter, createSelectionToken } from './characterIdentity.js';
import { readProfile } from '../wanxiang/profile.js';
import { CATALOG, getCatalogEntry } from '../wanxiang/catalog.js';
import { deriveConditions } from '../wanxiang/conditions.js';
import { readEffects, EFFECT_DEFAULTS } from '../wanxiang/effects.js';
import { createChangeDraft, previewChangeSet, commitChangeSet } from '../wanxiang/changes.js';
import { enableWanxiang } from '../wanxiang/runtime.js';
import { readPersonStories, resolveStoryRef } from '../wanxiang/storyReading.js';
import { storyRefKey, personIdentitySince } from '../wanxiang/storyFacts.js';
export { characterKey, parseCharacterKey, resolveCharacter, createSelectionToken };

/** Read-only explanations from current facts. Unknown conditions remain unproven. */
export function explainMingpu(entity, world) {
  const profile = readProfile(entity);
  const conditions = deriveConditions(entity, {world, day:world.day});

  const fields = ['physique','hexagram','bloodlines','traits','states','bonds','daoSeed'];
  const mechanisms = fields.flatMap(field => {
    const values = Array.isArray(profile[field]) ? profile[field] : profile[field] ? [profile[field]] : [];
    return values.map(value => {
      const definition = getCatalogEntry(value.id);
      // These axes have native consumers. Other definition axes await their
      // action context and must not appear active merely because they exist.
      const consumed = new Set(['cultivation','hp','combat','learning','healing','perception','breakthrough','detect_radius','healing_received','escape']);
      const numeric = row => Object.keys(row.effects||{}).some(axis=>consumed.has(axis));
      const rows = [{condition:'always',effects:definition?.effects},...(definition?.conditionalEffects || [])];
      const checks = rows.filter(row=>row.condition!=='always').map(row => ({condition:row.condition,proven:conditions[row.condition] === true,consumer:numeric(row)}));
      const expired = value.expiresDay != null && value.expiresDay <= world.day;
      const wired = rows.some(numeric);
      const active = rows.some(row=>numeric(row)&&conditions[row.condition]===true);
      return {field,id:value.id,name:definition?.name || value.name || value.id,
        status:expired?'已失效':value.latent?'潜隐':value.dormant?'休眠':!wired?'行动时判定':!active?'数值条件未证实':'数值条件已证实',
        checks,description:definition?.effectText || definition?.description || '',
        source:value.source || '来源未保留',stage:value.stage??null,limit:definition?.limit || null,
        inheritable:value.inheritable===true,stable:value.stable===true,
        expiresDay:value.expiresDay??null,remaining:value.expiresDay==null?null:Math.max(0,Math.ceil(value.expiresDay-world.day))};
    });
  });
  const effects = readEffects(entity,{world,day:world.day});
  const effectLabels = {cultivation:'修炼',hp:'气血',combat:'战力',learning:'学习',pollution:'污染',healing:'施疗',healingReceived:'受疗',perception:'感知',travel:'行旅',breakthrough:'突破',action:'行动',retreat:'退避',escape:'脱战',detectRadius:'侦察距离'};
  return {mechanisms,effects:Object.entries(effects).filter(([axis,value])=>value!==EFFECT_DEFAULTS[axis]).map(([axis,value])=>({axis,label:effectLabels[axis]||axis,value})),
    records:(profile.experienceLedger?.records||[]).slice(-24),parents:profile.dna?.parents||[],bloodSources:profile.dna?.bloodSources||[]};
}

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
  if (entity.sp === 'cultivator' && level === 0) return '凡人修为 · 未入门';
  return entity.sp === 'cultivator' && level > 0 ? realmLabel(level) : '不可考';
}
/** Fact-only export for people whose formal biography compiler assumes cultivation. */
export function compileCharacterFacts(viewModel) {
  if (!viewModel) return '';
  const {identity,header,cultivation} = viewModel;
  const lines = [`# ${identity.name} · 人物事实`, '', `- 人物编号：#${identity.id}`,
    `- 当前位面：${planeText(identity.currentPlane)}`, `- 状态：${header.stateText}`,
    `- 境界：${header.realm}`, `- 年龄：${header.ageText}`, ...(header.lifespanText ? [`- 当前寿元：${header.lifespanText}`] : []), `- 所属：${header.affiliation}`,
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
/** Vital signs are current entity facts, never inferred from animations or death records. */
export function characterHealth(resolved, world) {
  const e = resolved.entity || {};
  const current = !resolved.fateRecord && ['alive','ascended','nether'].includes(resolved.status)
    && resolved.sourceWorld?.entities?.includes(e);
  const hp = current ? numeric(e.hp) : null;
  const maxHp = current && Number.isFinite(e.maxHp) && e.maxHp > 0 ? e.maxHp : null;
  const restUntil = current ? numeric(e.restUntil) : null;
  const day = numeric(world?.day);
  const restRemaining = restUntil !== null && day !== null ? Math.max(0, restUntil - day) : null;
  const state = hp === null || maxHp === null ? 'unknown' : restRemaining > 0 ? 'recovering' : hp < maxHp ? 'wounded' : 'healthy';
  const hpText = hp === null || maxHp === null ? '气血不可考' : `${Number(hp.toFixed(2))} / ${Number(maxHp.toFixed(2))}`;
  const restText = restRemaining === null ? '养伤期限不可考' : restRemaining > 0 ? `养伤中 · 尚余 ${restRemaining.toFixed(2)} 日` : '当前无养伤期限';
  return {hp,maxHp,restUntil,restRemaining,day,state,hpText,restText};
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
  const health = characterHealth(r, world);
  const root = e.root;
  const life = personLifeFacts(e);
  const rootLabel = root ? `${root.rootName || '灵根'}${Number.isInteger(root.quality) && QUALITIES[root.quality] ? ` · ${QUALITIES[root.quality]}` : ''}` : e.rootName || '不可考';
  const profile = readProfile(e);
  const keys = new Set([...profile.bonds, ...(profile.experienceLedger?.bondHistory || []), ...profile.history].flatMap(row => [row.targetKey, row.actorKey, row.from, row.to]).filter(key => typeof key === 'string' && /^(mortal|upper|nether):/.test(key)));
  const people = Object.fromEntries([...keys].map(key => { const person = resolveCharacter(world,key); return [key, person.ok ? person.entity?.name || '不可考' : '不可考']; }));
  return freeze({
    schemaVersion:1, permissions, health,
    mingpu:{profile,people,observation:explainMingpu(e,r.sourceWorld||world),catalog:CATALOG,enabled:world.wanxiang?.enabled===true,day:world.day,fortune:e.fortune??null,mind:e.mind??null,legacyRoot:rootLabel,techniques:(e.techniques||[]).map(t=>({id:t.id??t.name,name:t.name,description:t.description})),artifacts:(e.artifacts||[]).map(a=>({id:a.id,name:a.name,grade:a.grade,description:a.description}))},
    identity:{key:r.key,id:r.id,plane:r.plane,incarnation:e.incarnation ?? null,identitySince:personIdentitySince(e),currentPlane:r.currentPlane || r.plane,status:r.status,name:e.name || '不可考',canFocus:r.accessible},
    header:{realm:realmText(e),ageText:life?.ageText || (Number.isFinite(e.age) ? `${Math.floor(e.age / 360)} 岁` : '年龄不可考'),lifespanText:life?.lifespanText || '',affiliation,stateText:e.sp === 'ghost' && r.status === 'alive' ? '鬼魂存续' : r.status === 'ascended' && !r.arrival ? '已飞升 · 去向不可定位' : STATUS[r.status]},
    cultivation:{exp,required,percent:exp !== null && required !== null ? exp / required * 100 : null,rate,rateText:rate === null ? '修炼速度不可考' : `每日修为 ${rate.toFixed(3)}`,stateText:required === null || exp === null ? '修为不可考' : exp >= required ? '等待模拟突破' : '积累修为'},
    overview:[{label:'气血',value:health.hpText},{label:'养伤',value:health.restText},...(life ? [{label:'成年',value:life.adulthood},{label:'出生来历',value:personBirthOriginText(e)},...(life.identity ? [{label:'身份',value:life.identity}] : [])] : []),{label:'灵根',value:rootLabel},{label:'位置',value:r.accessible ? `${planeText(r.currentPlane || r.plane)} (${e.x}, ${e.y})` : '当前不可定位'}],
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
  let storyRefs = new Map();
  let storySource = null;
  let draftSequence = 0;
  const drafts = new Map();
  function publish(next) { vm = next; if (!destroyed) { onChange(vm); if (vm) presenter?.render(vm); } return vm; }
  function refresh() {
    if (destroyed || !token) return null;
    const next = buildCharacterViewModel(getWorld(),token);
    if (!next) token = null;
    return publish(next);
  }
  function close() { drafts.clear(); storyRefs.clear(); storySource = null; token = null; publish(null); return {ok:true,viewModel:null}; }
  function handleMingpu(action) {
    if (destroyed || !token || action?.targetKey !== token.key) return {ok:false,reason:'stale-target'};
    const world=getWorld(), resolved=resolveCharacter(world,token.key,{token});
    if (action.type === 'stories') {
      if (!resolved.ok || !resolved.entity || (resolved.status === 'alive' && !resolved.accessible)) return {ok:false,reason:'target-unavailable'};
      const stories = readPersonStories(world,{kind:'person',plane:resolved.plane,id:resolved.id,incarnation:resolved.entity.incarnation ?? 1,identitySince:personIdentitySince(resolved.entity)});
      storyRefs = new Map(stories.cards.flatMap(card => card.related).filter(ref => ref.available === true).map(ref => [storyRefKey(ref),ref]));
      storySource = [resolved.entity.incarnation ?? 1,personIdentitySince(resolved.entity)];
      return {ok:true,stories};
    }
    if (action.type === 'story-navigate') {
      const ref = storyRefs.get(storyRefKey(action.ref));
      if (!resolved.ok || !ref || !resolved.entity || !storySource
        || storySource[0] !== (resolved.entity.incarnation ?? 1) || storySource[1] !== personIdentitySince(resolved.entity))
        return {ok:false,reason:'此引用不在当前本世拾章的可追溯对象中'};
      const fresh = resolveStoryRef(world,ref);
      if (!fresh.available) return {ok:false,reason:fresh.reason || '对象当前不可追'};
      return {ok:true,effect:{type:'story-navigate',ref}};
    }
    if(!resolved.ok || resolved.status!=='alive' || !resolved.accessible) return {ok:false,reason:'target-unavailable'};
    if(action.type==='enable') { enableWanxiang(world);refresh();return {ok:true,message:'万象塑命 Alpha 已启用'}; }
    if(!world.wanxiang?.enabled) return {ok:false,reason:'alpha-disabled'};
    if(action.type==='begin') {
      drafts.clear();const profile=readProfile(resolved.entity);
      const draft={id:`mingpu-${world.day}-r${profile.revision}-${++draftSequence}`,key:token.key,expectedRevision:profile.revision,profile,day:world.day};
      drafts.set(draft.id,{entity:resolved.entity,world,token,day:world.day,revision:profile.revision,changeProof:createChangeDraft(world,token.key,token)});
      return {ok:true,draft,profile,catalog:CATALOG};
    }
    const draft=action.draft,proof=drafts.get(draft?.id);
    if(!proof || proof.entity!==resolved.entity || proof.world!==world || draft.key!==token.key) return {ok:false,reason:'stale-draft'};

    const command={id:draft.id,key:token.key,expectedRevision:proof.revision,mode:action.authority==='decree'?'decree':'player',source:action.authority==='decree'?'天道敕改':'玩家改命',operations:action.operations?.map(op=>{if(!op.value||!['states','bonds'].includes(op.field)||op.value.durationDays==null)return op;const {durationDays,...value}=op.value;return {...op,value:{...value,expiresDay:world.day+Number(durationDays)}};})};
    if(action.type==='preview') return previewChangeSet(world,command,{token:proof.token,draftProof:proof.changeProof});
    if(action.type==='commit') {const result=commitChangeSet(world,command,{token:proof.token,draftProof:proof.changeProof});if(result.ok){drafts.delete(draft.id);refresh();}return result;}
    return {ok:false,reason:'invalid-action'};
  }
  function select(input) {
    if (destroyed) return {ok:false,reason:'destroyed',message:characterReason('destroyed'),viewModel:null};
    const key = typeof input === 'string' ? input : characterKey(input?.plane,input?.entityId ?? input?.id);
    const next = createSelectionToken(getWorld(),key);
    if (!next) return {ok:false,reason:'invalid-or-inaccessible-target',message:characterReason('invalid-or-inaccessible-target'),viewModel:vm};
    drafts.clear(); storyRefs.clear(); storySource = null; token = next; refresh(); return {ok:true,viewModel:vm,token};
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
  return {select,open:select,current:() => vm,viewModel:() => vm,refresh,handleAction,handleMingpu,close,reset:close,destroy(){if (destroyed) return; drafts.clear();close();destroyed = true;presenter?.destroy();}};
}
