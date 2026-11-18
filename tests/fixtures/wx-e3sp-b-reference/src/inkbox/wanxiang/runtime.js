import { ensureProfile, inheritBirthProfile } from './inheritance.js';
import { worldStream } from '../sim/worldStreams.js';
import { PERSONALITIES } from './catalog.js';

function bornPersonality(world,entity) {
  if (world.wanxiang.wxCEnabled===false || !entity.wanxiang || entity.wanxiang.personality.length) return;
  // A separate saved stream leaves native Life and existing birth DNA draws in
  // their original order. Only a new profile gets a natural personality.
  const rng=worldStream(world,'wanxiang-personality',0x77584336);
  const row=PERSONALITIES[Math.floor(rng()*PERSONALITIES.length)];
  entity.wanxiang.personality=[{id:row.id,source:'生来禀性',startDay:world.day||0}];
}

// Explicit Alpha opt-in; old worlds retain their original formulas and RNG.
export function enableWanxiang(world, {experimental, fresh = false, wxCEnabled} = {}) {
  world.wanxiang ||= {version:1, enabled:true, experimental:false};
  world.wanxiang.enabled = true;
  // WX-C stays inside the existing Alpha opt-in. Explicit false provides a
  // simulation rollback without discarding saved facts or intervention receipts.
  if (wxCEnabled !== undefined) world.wanxiang.wxCEnabled = wxCEnabled === true;
  if (experimental !== undefined || !world.wanxiang.experiments) {
    const enabled = experimental === true;
    world.wanxiang.experimental = enabled;
    world.wanxiang.experiments = {legend:enabled,daoSeeds:enabled};
  }
  const rng = worldStream(world, 'wanxiangBirth', 0x57425832);
  for (const e of world.entities || []) if (['human','cultivator'].includes(e.sp) && e.hp > 0) {
    const hadProfile=!!e.wanxiang;
    ensureProfile(e,{rng,fresh});
    if(fresh||!hadProfile)bornPersonality(world,e);
  }
  for (const plane of [world.upper,world.nether]) if(plane) plane.wanxiang ||= {version:1,enabled:true};
  updateWorldEpoch(world);
  world.touch?.({terrain:false});
  return world.wanxiang;
}
export function initializeBornProfile(world, child, parents) {
  if (!world.wanxiang?.enabled || !['human','cultivator'].includes(child.sp)) return;
  const rng = worldStream(world, 'wanxiangBirth', 0x57425832);
  if (!inheritBirthProfile(world,child,parents,{rng})) ensureProfile(child,{rng,fresh:true});
  bornPersonality(world,child);
}
export function updateWorldEpoch(world) {
  if (!world.wanxiang?.enabled) return;
  // World fortune follows the one simulation clock; inspection never rolls it.
  const epoch = Math.floor(world.day / 7200);
  if (world.wanxiang.epoch !== epoch) {
    world.wanxiang.epoch = epoch;
    world.wanxiang.epochHexagram = 1 + (((world.seed >>> 0) + epoch * 37) % 64);
  }
}
