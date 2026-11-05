import { ensureProfile, inheritBirthProfile } from './inheritance.js';
import { worldStream } from '../sim/worldStreams.js';

// Explicit Alpha opt-in; old worlds retain their original formulas and RNG.
export function enableWanxiang(world, {experimental, fresh = false} = {}) {
  world.wanxiang ||= {version:1, enabled:true, experimental:false};
  world.wanxiang.enabled = true;
  if (experimental !== undefined || !world.wanxiang.experiments) {
    const enabled = experimental === true;
    world.wanxiang.experimental = enabled;
    world.wanxiang.experiments = {legend:enabled,daoSeeds:enabled};
  }
  const rng = worldStream(world, 'wanxiangBirth', 0x57425832);
  for (const e of world.entities || []) if (['human','cultivator'].includes(e.sp) && e.hp > 0) ensureProfile(e,{rng,fresh});
  for (const plane of [world.upper,world.nether]) if(plane) plane.wanxiang ||= {version:1,enabled:true};
  updateWorldEpoch(world);
  world.touch?.({terrain:false});
  return world.wanxiang;
}
export function initializeBornProfile(world, child, parents) {
  if (!world.wanxiang?.enabled || !['human','cultivator'].includes(child.sp)) return;
  const rng = worldStream(world, 'wanxiangBirth', 0x57425832);
  if (!inheritBirthProfile(world,child,parents,{rng})) ensureProfile(child,{rng,fresh:true});
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
