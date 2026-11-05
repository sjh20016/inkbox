import { legendOwnsMovement } from './legend.js';
import { worldStream } from '../sim/worldStreams.js';
import { activeJourneyForEntity } from '../world/transitState.js';
import { experienceEffects } from './experiences.js';
const alive = e => e && e.hp > 0 && !e._ascended;
const available = site => site && (!site.inheritanceExhausted || site.dragonBoneCharges > 0);
export function encounterFor(world, id) {
  return world.wanxiang?.encounters?.find(s => s.stage === 'open' && s.participants.some(p => p.actorId === id && p.stage === 'travel'));
}
/** The only terminal transition. An unclaimed cave becomes available after a cooldown. */
export function finishEncounter(world, encounter, reason) {
  if (encounter.stage !== 'open') return false;
  const site = world.sites.find(s => s.id === encounter.siteId);
  encounter.stage = available(site) ? 'ended' : site ? 'claimed' : 'closed';
  encounter.endedDay = world.day;
  encounter.reason = reason;
  for (const p of encounter.participants) if (p.stage === 'travel') p.stage = 'ended';
  if (site) {
    site.encounterMode = false;
    site.encounterRetryDay = world.day + 180;
  }
  return true;
}
function reconcile(world, encounter) {
  const site = world.sites.find(s => s.id === encounter.siteId);
  for (const p of encounter.participants) {
    const e = world.entities.find(e => e.id === p.actorId);
    if (p.stage === 'travel' && (!alive(e) || activeJourneyForEntity(world, p.actorId))) p.stage = 'withdrawn';
  }
  if (!site || !available(site)) return finishEncounter(world, encounter, 'resource-ended');
  if (world.day >= encounter.untilDay) return finishEncounter(world, encounter, 'timeout');
  if (!encounter.participants.some(p => p.stage === 'travel')) return finishEncounter(world, encounter, 'participants-ended');
  return false;
}
// A bounded flood uses the same land walkability as Life. No sea/air permission is invented.
function reachableCells(world, site) {
  if (!world.isWalkable || !world.idx) return null;
  const sx = Math.floor(site.x), sy = Math.floor(site.y), queue = [[sx, sy]], seen = new Set();
  for (let i = 0; i < queue.length; i++) {
    const [x, y] = queue[i];
    if (x < 0 || y < 0 || x >= world.w || y >= world.h || Math.hypot(x - sx, y - sy) > 24) continue;
    const cell = world.idx(x, y);
    if (seen.has(cell) || !world.isWalkable(cell)) continue;
    seen.add(cell);
    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const next = world.idx(x + dx, y + dy);
      if (!seen.has(next)) queue.push([x + dx, y + dy]);
    }
  }
  return seen;
}
function score(world, e, site) {
  const health = e.hp / e.maxHp;
  const experience = experienceEffects(e, world.day);
  const traits = e.wanxiang?.personality || [];
  const bold = traits.some(t => /brave|bold/.test(t.id)) ? .15 : 0;
  return health + Math.min(e.level, 20) / 40 + experience.risk + bold - Math.hypot(e.x - site.x, e.y - site.y) / 24;
}
export function stepEncounters(world) {
  if (world.wanxiang?.enabled !== true) return;
  const wx = world.wanxiang;
  wx.encounters ||= [];
  // Repair old saves with an orphaned encounterMode as well as normal terminal transitions.
  for (const s of wx.encounters) if (s.stage === 'open') reconcile(world, s);
  for (const site of world.sites) if (site.encounterMode && !wx.encounters.some(s => s.siteId === site.id && s.stage === 'open')) site.encounterMode = false;
  if (world.day - (wx.lastEncounterDay ?? -1e6) < 30) return;
  wx.lastEncounterDay = world.day;
  wx.encounters = wx.encounters.filter(s => s.stage === 'open' || world.day - s.endedDay < 720).slice(-24);
  for (const site of world.sites) {
    if (wx.encounters.filter(s => s.stage === 'open').length >= 3) break;
    if (site.kind !== 'cave' || !site.inheritanceManual || !available(site) || site.encounterMode || world.day < (site.encounterRetryDay || 0)) continue;
    const reachable = reachableCells(world, site);
    const candidates = world.entities.filter(e => alive(e) && e.level >= 3 && e.hp / e.maxHp > .55
      && !activeJourneyForEntity(world, e.id) && !encounterFor(world, e.id) && !legendOwnsMovement(world, e.id)
      && !(world.wanling?.jobs || []).some(j => j.actorId === e.id && j.stage !== 'done')
      && ((site.dragonBoneCharges > 0 && (!e.wanxiang?.bloodlines?.length || e.wanxiang.bloodlines.some(b => b.id === 'true_dragon' && !b.stable)))
        || ((e.techniques || []).length < 3 && !(e.techniques || []).some(t => t.name === site.inheritanceManual)))
      && Math.hypot(e.x - site.x, e.y - site.y) < 24
      && (!reachable || reachable.has(world.idx(Math.floor(e.x), Math.floor(e.y))))
      && (experienceEffects(e, world.day).risk > -.2 || e.hp / e.maxHp >= .85))
      .sort((a,b) => score(world,b,site) - score(world,a,site) || a.id - b.id).slice(0,3);
    if (!candidates.length) continue;
    site.encounterMode = true;
    wx.nextEncounterId = (wx.nextEncounterId || 0) + 1;
    wx.encounters.push({id:`cave:${site.id}:${wx.nextEncounterId}`, siteId:site.id, stage:'open', startDay:world.day, untilDay:world.day+720,
      participants:candidates.map(e => ({actorId:e.id, stage:'travel'}))});
  }
}
export function stepEncounterTravel(world, life, e, dtDays, resolve) {
  const s = encounterFor(world,e.id);
  if (!s || world.wanxiang?.enabled !== true) return false;
  const p = s.participants.find(p => p.actorId === e.id), site = world.sites.find(x => x.id === s.siteId);
  if (!alive(e) || !available(site) || world.day >= s.untilDay || activeJourneyForEntity(world,e.id) || e.hp/e.maxHp < .35) {
    p.stage = 'withdrawn'; e.tx=e.x; e.ty=e.y; reconcile(world,s); return false;
  }
  if (Math.hypot(e.x-site.x,e.y-site.y) <= 1.5) {
    p.stage='arrived'; site.visits=(site.visits||0)+1;
    const result=resolve?.(world,e,site,worldStream(world,'wanxiang-encounters',0x77584533));
    if (result?.studying) {p.stage='travel';p.settled=false;}
    reconcile(world,s);
    return true;
  }
  e.tx=site.x; e.ty=site.y;
  life.moveTowards(e,Math.min(30,Math.max(0,dtDays)),{speed:1,diet:0});
  return true;
}
