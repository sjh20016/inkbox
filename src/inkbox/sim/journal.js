// Player observation metadata only. No random draws, world events or simulation writes.
import { TIME } from '../core/config.js';
import { realmFor, REALMS } from '../core/cultivation.js';
import { characterKey, parseCharacterKey, resolveCharacter, planeWorld } from '../g1/characterIdentity.js';
import { resolveObservedSettlement } from './observeEcho.js';

export const RECEIPT_LIMIT = 32;
export const ACTIVE_VOW_LIMIT = 2;
export const ARCHIVE_VOW_LIMIT = 12;
const MAX = Number.MAX_SAFE_INTEGER - 100;
const copy = value => JSON.parse(JSON.stringify(value));
const text = value => String(value ?? '').slice(0, 320);
const finite = value => Number.isFinite(value) ? Math.max(-MAX, Math.min(MAX, value)) : 0;
const empty = () => ({ v: 1, nextReceiptId: 1, receipts: [], discardedReceipts: 0,
  vows: { nextId: 1, active: [], archive: [] } });
const state = world => world.journal || (world.journal = empty());
const validId = value => Number.isSafeInteger(value) && value > 0 && value <= MAX;
const validDay = value => Number.isFinite(value) && value >= 0 && value <= MAX;
const fail = () => { throw new Error('手札数据损坏'); };
const statuses = ['active', 'fulfilled', 'failed', 'lost', 'unresolved', 'abandoned'];

// Bound every persisted value, including unexpected extension fields. Reject rather
// than silently trim imported records: a partial identity could misidentify a life.
function bounded(value, depth = 0) {
  if (depth > 8) fail();
  if (value === null || typeof value === 'boolean') return;
  if (typeof value === 'number') { if (!Number.isFinite(value) || Math.abs(value) > MAX) fail(); return; }
  if (typeof value === 'string') { if (value.length > 512) fail(); return; }
  if (Array.isArray(value)) { if (value.length > 32) fail(); for (const v of value) bounded(v, depth + 1); return; }
  if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) fail();
  if (Object.keys(value).length > 32) fail();
  for (const [key, v] of Object.entries(value)) { if (key.length > 48 || ['__proto__','constructor','prototype'].includes(key)) fail(); bounded(v, depth + 1); }
}
function checkRef(ref, person = true) {
  if (!ref || !validId(ref.id)) fail();
  if (person && (!parseCharacterKey(ref.key) || ref.key !== characterKey(ref.plane, ref.id))) fail();
  if (!person && ref.plane !== 'mortal') fail();
}
function checkReceipt(r) {
  if (!r || !validId(r.id) || !['burn','root','crisis'].includes(r.kind) || r.toolId !== r.kind
    || !validDay(r.day) || !Array.isArray(r.direct) || !r.direct.every(x => typeof x === 'string')
    || !Number.isFinite(r.x) || !Number.isFinite(r.y) || !Number.isFinite(r.radius) || r.radius < 0) fail();
  if (r.kind === 'burn') {
    if (r.undo !== undefined && (!r.undo || r.undo.status !== 'undone' || !validDay(r.undo.day))) fail();
    if (!validId(r.changedCells) || !Array.isArray(r.samples) || r.samples.length > 16 || !r.bounds) fail();
    for (const key of ['x0','y0','x1','y1']) if (!Number.isFinite(r.bounds[key])) fail();
    for (const s of r.samples) {
      if (!Number.isSafeInteger(s.index) || s.index < 0 || !Number.isFinite(s.x) || !Number.isFinite(s.y) || !s.before || !s.after) fail();
      for (const key of CELL_KEYS) if (!Number.isFinite(s.before[key]) || !Number.isFinite(s.after[key])) fail();
      for (const c of [s.before,s.after]) if (!c.n || typeof c.n.flood !== 'boolean'
        || ![c.n.fireDueDay,c.n.overlayDueDay].every(d => d === null || validDay(d))) fail();
    }
  } else if (r.kind === 'root') {
    if (!validId(r.changedPeople) || !Array.isArray(r.people) || !r.people.length || r.people.length > 24) fail();
    for (const p of r.people) { checkRef(p.ref); if (!Number.isFinite(p.beforeLevel) || !Number.isFinite(p.afterLevel)
      || typeof p.ref.name !== 'string' || typeof p.beforeRoot !== 'string' || typeof p.afterRoot !== 'string') fail(); }
  } else if (!validId(r.eventId) || !validId(r.villageId) || !validDay(r.startedDay) || !Number.isFinite(r.durationDays) || r.durationDays < 0) fail();
}
function checkVow(v, active) {
  if (!v || !validId(v.id) || !['settlement','breakthrough'].includes(v.kind)
    || !statuses.includes(v.status) || (v.status === 'active') !== active
    || !validDay(v.createdDay) || !validDay(v.dueDay) || v.dueDay < v.createdDay
    || typeof v.name !== 'string' || typeof v.note !== 'string' || typeof v.result !== 'string'
    || (active ? v.endedDay !== null : !validDay(v.endedDay))) fail();
  checkRef(v.ref, v.kind === 'breakthrough');
  if (v.dueDay - v.createdDay > TIME.daysPerYear * (v.kind === 'settlement' ? 10 : 50)) fail();
  if (v.kind === 'breakthrough' && (!Number.isFinite(v.startRealm) || !Array.isArray(v.startLog) || !v.startLog.every(x => typeof x === 'string'))) fail();
}
export function normalizeJournal(data) {
  if (data === undefined) return empty();
  bounded(data);
  if (!data || data.v !== 1 || !validId(data.nextReceiptId) || !Array.isArray(data.receipts)
    || !Number.isSafeInteger(data.discardedReceipts) || data.discardedReceipts < 0
    || !data.vows || !validId(data.vows.nextId) || !Array.isArray(data.vows.active)
    || !Array.isArray(data.vows.archive) || data.vows.active.length > 2 || data.vows.archive.length > 12) fail();
  const receiptIds = new Set(), vowIds = new Set();
  for (const r of data.receipts) { checkReceipt(r); if (receiptIds.has(r.id) || r.id >= data.nextReceiptId) fail(); receiptIds.add(r.id); }
  for (const [rows, active] of [[data.vows.active, true], [data.vows.archive, false]]) for (const v of rows) {
    checkVow(v, active); if (vowIds.has(v.id) || v.id >= data.vows.nextId) fail(); vowIds.add(v.id);
  }
  return copy(data);
}
export function readJournal(world) { return copy(world?.journal || empty()); }

export function personRef(world, plane, id) {
  const key = characterKey(plane, id), source = planeWorld(world, plane);
  const entity = key && source?.entities?.find(e => e.id === id && e.hp > 0 && !e._ascended && ['human','cultivator'].includes(e.sp));
  return entity ? { key, plane, id, name: text(entity.name) } : null;
}
export function resolveJournalPerson(world, ref) {
  if (!ref || ref.key !== characterKey(ref.plane, ref.id)) return { status: 'unknown', plane: ref?.plane, entity: null };
  const result = resolveCharacter(world, ref.key);
  return { ...result, status: result.ok ? result.status : 'unknown', plane: result.currentPlane || ref.plane };
}

function rootDescription(root) {
  if (!root) return '未启灵根';
  if (typeof root === 'string') return text(root);
  const elements = Array.isArray(root.elements) ? root.elements.filter(v => typeof v === 'string').join('、') : '';
  return text((root.rootName || '灵根已启') + (elements ? `（${elements}）` : ''));
}

export function planToolReceipt(ctx, before, impact, event = null) {
  if (!ctx?.world || !before || before.world !== ctx.world || !impact?.changed) return null;
  const world = ctx.world, kind = before.tool;
  const base = { kind, toolId: kind, day: finite(world.day), x: finite(before.x), y: finite(before.y), radius: Math.max(0, finite(before.radius)) };
  if (kind === 'root') {
    let changedPeople = 0; const people = [];
    for (const e of world.entities) {
      const old = before.entities?.get(e.id);
      if (!old || (finite(old.level) === finite(e.level) && JSON.stringify(old.root ?? null) === JSON.stringify(e.root ?? null))) continue;
      const ref = personRef(world, world.plane || 'mortal', e.id);
      if (!ref) continue;
      changedPeople++;
      if (people.length < 24) people.push({ ref, beforeLevel: finite(old.level), afterLevel: finite(e.level),
        beforeRoot: rootDescription(old.root), afterRoot: rootDescription(e.root) });
    }
    return changedPeople ? { ...base, changedPeople, people,
      direct: [`实际改变 ${changedPeople} 人的灵根或修为；保留前 ${people.length} 人明细。`] } : null;
  }
  if (kind === 'crisis') {
    const entry = (ctx.events?.activeCrises || []).find(e => e.id >= before.nextEventId && e.status === 'active' && e.villageId > 0 && e.byPlayer);
    if (!entry || (event && entry.id !== event.id)) return null;
    return { ...base, eventId: entry.id, villageId: entry.villageId, name: text(entry.name), villageName: text(entry.villageName),
      startedDay: finite(entry.startedDay), durationDays: Math.max(0, finite(entry.durationDays)),
      direct: [`${text(entry.villageName)}正式遭逢${text(entry.name)}，事件 #${entry.id}。`] };
  }
  return null;
}
export function commitReceipt(world, plan) {
  if (!plan) return null;
  const data = state(world), receipt = { ...copy(plan), id: data.nextReceiptId };
  bounded(receipt); checkReceipt(receipt);
  if (data.nextReceiptId >= MAX) return null;
  data.nextReceiptId++; data.receipts.push(receipt);
  if (data.receipts.length > 32) { data.discardedReceipts = Math.min(MAX, data.discardedReceipts + data.receipts.length - 32); data.receipts.splice(0, data.receipts.length - 32); }
  return copy(receipt);
}
const CELL_KEYS = ['h','w','o','t','s','v','f'];
function cellSnapshot(cell) {
  return { ...Object.fromEntries(CELL_KEYS.map(k => [k, finite(cell[k])])),
    n: { fireDueDay:Number.isFinite(cell.n?.fire?.dueDay) ? finite(cell.n.fire.dueDay) : null,
      overlayDueDay:Number.isFinite(cell.n?.overlay?.dueDay) ? finite(cell.n.overlay.dueDay) : null,
      flood:!!cell.n?.flood } };
}
// Persist only a successful History.undo against the original gesture identity.
// Older v1 receipts have no undo field and remain valid without migration.
export function markBurnReceiptUndone(world, id) {
  const receipt = world?.journal?.receipts?.find(r => r.id === id && r.kind === 'burn');
  if (!receipt || receipt.undo) return false;
  receipt.undo = { status: 'undone', day: finite(world.day) };
  return true;
}
export function recordBurnReceipt(world, meta, changes, after) {
  if (meta?.toolId !== 'burn') return null;
  let changedCells = 0; const samples = [], bounds = { x0: world.w, y0: world.h, x1: 0, y1: 0 };
  for (const [index, before] of changes) {
    const now = after.get(index);
    if (!now || !CELL_KEYS.some(k => before[k] !== now[k]) && JSON.stringify(before.n ?? null) === JSON.stringify(now.n ?? null)) continue;
    changedCells++;
    const x = index % world.w, y = Math.floor(index / world.w);
    bounds.x0 = Math.min(bounds.x0, x); bounds.y0 = Math.min(bounds.y0, y); bounds.x1 = Math.max(bounds.x1, x); bounds.y1 = Math.max(bounds.y1, y);
    if (samples.length < 16) samples.push({ index, x, y, before: cellSnapshot(before), after: cellSnapshot(now) });
  }
  if (!changedCells) return null;
  return commitReceipt(world, { kind:'burn', toolId:'burn', day: finite(meta.day ?? world.day), x: finite(meta.x), y: finite(meta.y), radius: Math.max(0, finite(meta.radius)),
    changedCells, samples, bounds, direct: [`这次完整笔划实际改变 ${changedCells} 格。`] });
}

export function receiptRevisit(world, receipt) {
  const direct = [...(receipt?.direct || [])], following = [], uncertain = [], targets = [];
  if (!receipt) return { direct, following, uncertain, targets };
  targets.push({ type:'position', plane:'mortal', x:receipt.x, y:receipt.y });
  if (receipt.kind === 'burn') {
    if (receipt.undo?.status === 'undone') {
      direct.push('这次笔划的直接地形修改已成功撤销，不代表原修改仍然有效。');
      following.push({ day:receipt.undo.day, text:'此笔划经正式历史撤销成功；此后的环境变化仍需按世界现状观察。' });
    }
    for (const sample of receipt.samples) {
      if (!world.inside(sample.x,sample.y)) continue;
      const i = world.idx(sample.x,sample.y);
      following.push({ day:world.day, text:`样点 (${sample.x},${sample.y})：植被 ${sample.after.v.toFixed(2)} → ${finite(world.veg[i]).toFixed(2)}，火势 ${sample.after.f.toFixed(2)} → ${finite(world.fire[i]).toFixed(2)}。` });
    }
    uncertain.push(`仅保存 ${receipt.samples.length} 个局部样点，不据此推断全区变化；附近聚落兴衰不能归因于这次焚林。`);
  } else if (receipt.kind === 'crisis') {
    const events = world.worldEventState;
    const event = [...(events?.activeCrises || []), ...(events?.history || [])].find(e => e.id === receipt.eventId && e.villageId === receipt.villageId);
    if (event) following.push({ day:event.endedDay ?? world.day, text:event.status === 'active' ? `事件 #${event.id} 仍在持续。` : text(event.outcome || `事件 #${event.id} 已结算：${event.status}。`) });
    else uncertain.push('正式事件详录未保留，尚无法确认结局。');
    const place = resolveObservedSettlement(world,receipt.villageId).settlement;
    targets.push({ type:'settlement', id:receipt.villageId, ...(place ? { x:place.x,y:place.y,name:place.name } : {}) });
    uncertain.push('只按同一事件身份读取结局，其他后续变化不自动归因于此次降灾。');
  } else if (receipt.kind === 'root') {
    for (const p of receipt.people) {
      direct.push(`${p.ref.name}：${p.beforeLevel > 0 ? realmFor(p.beforeLevel).name : '凡人'} → ${p.afterLevel > 0 ? realmFor(p.afterLevel).name : '凡人'}；${p.beforeRoot} → ${p.afterRoot}。`);
      const resolved = resolveJournalPerson(world,p.ref);
      following.push({ day:resolved.entity?.died ?? world.day, text:`${p.ref.name}：${personStatus(resolved)}。` });
      for (const row of (resolved.entity?.log || []).filter(r => r.day > receipt.day).slice(-4)) following.push({ day:row.day,text:text(row.text) });
      targets.push({ type:'person', ...p.ref });
    }
    uncertain.push('人物经历只按本世身份读取；日志有保留上限，不将其他同名者或转世者视为本人。');
  }
  return { direct, following, uncertain, targets };
}
function personStatus(r) {
  if (r.status === 'dead' || r.status === 'nether') return '本世已终';
  if (r.status === 'alive' || r.status === 'ascended' && r.entity?.hp > 0) return `仍在${r.plane === 'upper' ? '上界' : '本界'}，${realmFor(r.entity.level).name}`;
  return '失考，尚无可靠身份记录';
}
const logKey = r => text(`${r.day}|${r.kind}|${r.text}`);
export function createVow(world, kind, ref) {
  if (!['settlement','breakthrough'].includes(kind)) return { ok:false,message:'尚无这种行愿。' };
  if ((world.journal?.vows.active.length || 0) >= 2) return { ok:false,message:'最多同时记挂两桩行愿。' };
  let target, name, startRealm = null, startLog = [];
  if (kind === 'settlement') {
    if (ref?.plane && ref.plane !== 'mortal') return { ok:false,message:'只能为凡界原聚落立愿。' };
    const current = resolveObservedSettlement(world,ref?.id);
    if (current.kind !== 'living') return { ok:false,message:'只能为仍存在的原聚落立愿。' };
    const s = current.settlement; target = { plane:'mortal',id:s.id,x:s.x,y:s.y }; name = s.name;
  } else {
    const p = ref && personRef(world,ref.plane,ref.id);
    if (!p || ref.key && p.key !== ref.key) return { ok:false,message:'尚无可靠的本世身份。' };
    const e = planeWorld(world,p.plane).entities.find(e => e.id === p.id);
    if (!(e.level >= 1)) return { ok:false,message:'只能等待一位真实修士破境。' };
    target = p; name = p.name; startRealm = realmFor(e.level).min;
    startLog = (e.log || []).slice(-32).map(logKey);
  }
  const data = state(world);
  if (data.vows.nextId >= MAX) return { ok:false,message:'行愿编号已满。' };
  if (data.vows.active.some(v => v.kind === kind && (kind === 'settlement' ? v.ref.id === target.id : v.ref.key === target.key))) return { ok:false,message:'已为此人或此地立愿。' };
  const vow = { id:data.vows.nextId++,kind,ref:target,name:text(name),createdDay:world.day,
    dueDay:world.day + TIME.daysPerYear * (kind === 'settlement' ? 10 : 50),startRealm,startLog,
    status:'active',endedDay:null,result:'',note:kind === 'settlement' ? '愿原聚落再存续十年。' : '愿同一人再破一境，最多等待五十年。' };
  data.vows.active.push(vow); return { ok:true,message:'已立下行愿。',vow:copy(vow) };
}
function finish(data,vow,status,day,note) {
  vow.status = status; vow.endedDay = day; vow.result = note; vow.note = note;
  data.vows.active.splice(data.vows.active.indexOf(vow),1); data.vows.archive.push(vow);
  if (data.vows.archive.length > 12) data.vows.archive.splice(0,data.vows.archive.length-12);
}
export function abandonVow(world,id) {
  const data = world.journal, vow = data?.vows.active.find(v => v.id === Number(id));
  if (!vow) return { ok:false,message:'这桩行愿已不在等待中。' };
  finish(data,vow,'abandoned',world.day,'已主动弃愿。');
  return { ok:true,message:'已弃愿。',vow:copy(vow) };
}
export function settleVows(world) {
  const data = world.journal; if (!data?.vows.active.length) return 0;
  let count = 0;
  for (const v of [...data.vows.active]) {
    const end = (status,day,note) => { finish(data,v,status,day,note); count++; };
    if (v.kind === 'settlement') {
      const r = resolveObservedSettlement(world,v.ref.id), s = r.settlement;
      if (!s) { end('lost',world.day,'原聚落失考，尚无可靠荒废记录。'); continue; }
      if (r.kind === 'ruin' && !Number.isFinite(s.destroyedDay)) { end('lost',world.day,'荒废日期失考，无法确认期限内结局。'); continue; }
      if (r.kind === 'ruin' && s.destroyedDay <= v.dueDay) { end('failed',s.destroyedDay,`期限内正式荒废：${text(s.reason || '原因未详录')}。`); continue; }
      if (world.day >= v.dueDay) {
        if (r.kind === 'ruin' && s.destroyedDay > v.dueDay || r.kind === 'living' && s.pop > 0 && s.hp > 0) end('fulfilled',v.dueDay,'原聚落已存续十年。');
        else end('unresolved',v.dueDay,'期限已至，当前记录不足以确认真实存续。');
      }
    } else {
      const r = resolveJournalPerson(world,v.ref), e = r.entity;
      // A formal per-person breakthrough log proves a realm transition. The
      // baseline excludes earlier same-day entries. Never search by a name.
      const proof = (e?.log || []).find(row => row.kind === 'breakthrough' && row.day >= v.createdDay && row.day <= v.dueDay && !v.startLog.includes(logKey(row))
        && (Number.isFinite(row.level) ? realmFor(row.level).min > v.startRealm
          : REALMS.some(realm => {
            if (realm.min <= v.startRealm || typeof row.text !== 'string') return false;
            const body = row.text.replace(/^【[^】]*】/, '');
            return body.startsWith(`突破至${realm.name}`) || body.includes(`闭关，${realm.name}`) && body.includes('成。');
          })));
      const alive = r.status === 'alive' || r.status === 'ascended' && e?.hp > 0;
      const deadProof = r.status === 'dead' && Number.isFinite(e?.died) && e.died >= v.createdDay && e.died <= v.dueDay && realmFor(e.level || 0).min > v.startRealm;
      if (proof || deadProof || alive && world.day <= v.dueDay && realmFor(e.level).min > v.startRealm) {
        end('fulfilled',proof?.day ?? (deadProof ? e.died : world.day),'已见证同一本世人物达到更高境界。'); continue;
      }
      if (r.status === 'dead' || r.status === 'nether') {
        const deathDay = e?.died ?? e?.ghostOf?.deathDay;
        if (Number.isFinite(deathDay) && deathDay > v.dueDay) end('unresolved',v.dueDay,'五十年期限已至，期限内无可靠破境记录。');
        else end('failed',Number.isFinite(deathDay) ? deathDay : world.day,'本世已终，未见期限内成愿证据。');
      } else if (!alive) end('lost',world.day,'本世身份链失考，不能以转世或同名者续愿。');
      else if (world.day >= v.dueDay) end('unresolved',v.dueDay,'五十年期限已至，尚无可靠破境记录。');
    }
  }
  return count;
}
