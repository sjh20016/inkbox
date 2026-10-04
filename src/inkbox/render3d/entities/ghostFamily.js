import { hashString } from '../../core/noise.js';

export const GHOST_ASSET_IDS = Object.freeze(['nether.ghost.0','nether.ghost.1','nether.ghost.2']);
export function ordinaryNetherGhost(world, item) {
  return world?.plane === 'nether' && item.identityContainer === 'entities' && item.soulKind === 'ghost';
}
export function ghostAssetFor(seed, id) {
  return GHOST_ASSET_IDS[hashString(`${seed>>>0}|nether|ghost:${String(id)}`)%GHOST_ASSET_IDS.length];
}
