import { experienceEffects } from './experiences.js';
import { opportunityCounter, encounterDecision, decisionMoment } from './opportunities.js';
import { legendOwnsMovement } from './legend.js';
import { worldStream } from '../sim/worldStreams.js';
import { activeJourneyForEntity } from '../world/transitState.js';
import { siteHasContent } from '../sim/sites.js';
import { opportunityLandRoute, routeCorners } from './opportunityGeography.js';
import { activeBlood } from './bloodPhysique.js';
import { transitGeographyVersion } from '../world/transitGeography.js';
const alive = e => e && e.hp > 0 && !e._ascended;
const routePlans = new WeakMap();
const available = (world, site) => site && siteHasContent(site, world);
function eligibleResource(world,e,site) {
 const ledger=e.wanxiang?.bodyLedger;
 const dragon=e.wanxiang?.bloodlines?.find(b=>b.id==='true_dragon');
 return site.inheritanceManual && !site.inheritanceExhausted && !site.inheritanceClaimedBy
     && (e.techniques||[]).length<3 && !(e.techniques||[]).some(t=>t.name===site.inheritanceManual)
   || site.dragonBoneCharges>0 && e.hp>e.maxHp*.5 && (!dragon ? (e.wanxiang?.bloodlines||[]).length<3 && !(e.wanxiang?.bloodlines||[]).some(b=>!b.latent)
      : !(dragon.stable&&dragon.inheritable) && world.day-(dragon.source?.day??world.day)>=180)
   || site.phoenixFeatherCharges>0 && activeBlood(e,'heaven_phoenix')
      && !(ledger?.featherSources||[]).includes(String(site.id)) && (ledger?.featherSources||[]).length<3
   || site.godFragmentCharges>0 && activeBlood(e,'god_king') && !ledger?.godFragmentSource
   || site.artifactId>0 && world.artifacts?.some(a=>a.id===site.artifactId&&!a.ownerId);
}
export function encounterFor(world, id) {
  return world.wanxiang?.encounters?.find(s => s.stage === 'open' && s.participants.some(p => p.actorId === id && p.stage === 'travel'));
}
/** The only terminal transition. An unclaimed cave becomes available after a cooldown. */
export function finishEncounter(world, encounter, reason) {
  if (encounter.stage !== 'open') return false;
  const site = world.sites.find(s => s.id === encounter.siteId);
  encounter.stage = available(world,site) ? 'ended' : site ? 'claimed' : 'closed';
  encounter.endedDay = world.day;
  encounter.reason = reason;
  if(reason==='timeout')opportunityCounter(world,'timeout');
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
  if (!site || !available(world,site)) return finishEncounter(world, encounter, 'resource-ended');
  if (world.day >= encounter.untilDay) return finishEncounter(world, encounter, 'timeout');
  if (!encounter.participants.some(p => p.stage === 'travel')) return finishEncounter(world, encounter, 'participants-ended');
  return false;
}
function baselineScore(world,e,site) {
 const bold=(e.wanxiang?.personality||[]).some(t=>/brave|bold/.test(t.id))?.15:0;
 return e.hp/e.maxHp+Math.min(e.level,20)/40+experienceEffects(e,world.day).risk+bold-Math.hypot(e.x-site.x,e.y-site.y)/24;
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
    if (site.kind !== 'cave' || !available(world,site) || site.encounterMode || world.day < (site.encounterRetryDay || 0)) continue;
    opportunityCounter(world,'stocked');
    const candidates = world.entities.filter(e => alive(e) && (wx.wxCEnabled===false||['human','cultivator'].includes(e.sp)) && e.level >= 3 && e.hp / e.maxHp > .55
      && !activeJourneyForEntity(world, e.id) && !encounterFor(world, e.id) && !legendOwnsMovement(world, e.id)
      && !(world.wanling?.jobs || []).some(j => j.actorId === e.id && j.stage !== 'done')
      && eligibleResource(world,e,site)
      && Math.hypot(e.x - site.x, e.y - site.y) < 24
       )
      .filter(e=>{opportunityCounter(world,'eligible');return true;})
      .filter(e=>{const route=opportunityLandRoute(world,e,site);return route&&route.distance<=96&&routeCorners(route).length<=128;})
      .filter(e=>{opportunityCounter(world,'reachable');return true;})
      .filter(e=>{if(wx.wxCEnabled===false)return experienceEffects(e,world.day).risk>-.2||e.hp/e.maxHp>=.85;const d=encounterDecision(world,e,site);if(d.willing)opportunityCounter(world,'willing');else if(d.reasons.length&&e.wanxiang&&!e.wanxiang.history.some(h=>h.type==='谨慎退避'&&h.siteId===site.id&&world.day-h.day<360))decisionMoment(world,e,'谨慎退避',{siteId:site.id,reasons:d.reasons,result:'暂缓赴事，伤愈后可重试'});return world.wanxiang.wxCEnabled===false||d.willing;})
      .sort((a,b) => (wx.wxCEnabled===false?baselineScore(world,b,site)-baselineScore(world,a,site):encounterDecision(world,b,site).score - encounterDecision(world,a,site).score) || a.id - b.id).slice(0,3);
    if (!candidates.length) continue;
    site.encounterMode = true;
    opportunityCounter(world,'started',candidates.length);
    for(const e of candidates){const d=encounterDecision(world,e,site);if(d.reasons.length)decisionMoment(world,e,'赴事抉择',{siteId:site.id,reasons:d.reasons,result:'赴事'});}
    wx.nextEncounterId = (wx.nextEncounterId || 0) + 1;
    wx.encounters.push({id:`cave:${site.id}:${wx.nextEncounterId}`, siteId:site.id, stage:'open', startDay:world.day, untilDay:world.day+720,
      participants:candidates.map(e => ({actorId:e.id, stage:'travel', corners:routeCorners(opportunityLandRoute(world,e,site)), corner:0}))});
  }
}
export function stepEncounterTravel(world, life, e, dtDays, resolve) {
  const s = encounterFor(world,e.id);
  if (!s || world.wanxiang?.enabled !== true) return false;
  const p = s.participants.find(p => p.actorId === e.id), site = world.sites.find(x => x.id === s.siteId);
  if (!alive(e) || !available(world,site) || world.day >= s.untilDay || activeJourneyForEntity(world,e.id) || e.hp/e.maxHp < .35) {
    opportunityCounter(world,'withdrawn'); p.stage = 'withdrawn'; e.tx=e.x; e.ty=e.y; reconcile(world,s); return false;
  }
  if (Math.hypot(e.x-site.x,e.y-site.y) <= 1.5) {
    if(!p.reached){opportunityCounter(world,'arrived');p.reached=true;}
    p.stage='arrived'; site.visits=(site.visits||0)+1;
    const result=resolve?.(world,e,site,worldStream(world,'wanxiang-encounters',0x77584533));
    if(result&&!result.studying)opportunityCounter(world,result.ok?'success':'failure');
    if (result?.studying) {p.stage='travel';p.settled=false;}
    reconcile(world,s);
    return true;
  }
  const version=transitGeographyVersion(world);
  const prior=routePlans.get(p);
  if (!p.corners || !prior || prior.version!==version || world.day-prior.day>=90) {
    const route=opportunityLandRoute(world,e,site);
    if (!route || route.distance>96 || routeCorners(route).length>128) {
      opportunityCounter(world,'withdrawn');p.stage='withdrawn';e.tx=e.x;e.ty=e.y;reconcile(world,s);return false;
    }
    p.corners=routeCorners(route);p.corner=0;routePlans.set(p,{version,day:world.day});
  }
  while (p.corner < p.corners.length-1 && Math.hypot(e.x-p.corners[p.corner].x,e.y-p.corners[p.corner].y)<0.7) p.corner++;
  const waypoint=p.corners[p.corner]||site;
  e.tx=waypoint.x; e.ty=waypoint.y;
  life.moveTowards(e,Math.min(30,Math.max(0,dtDays)),{speed:1,diet:0});
  return true;
}
