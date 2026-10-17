// Experimental per-mortal-world rule identity. Runtime guards never enter saves.
import { stepHydrology } from './hydrology.js';
import { prepareStaticSea, stepHydrologyStaticSea } from './hydrologyStaticSea.js';

export const LEGACY_RULE = 'legacy-v1';
export const STATIC_SEA_RULE = 'static-sea-v2';
const prepared = new WeakMap();
const owns = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

export function parseHydrologyRule(value, { missingIsLegacy = false, missing = false } = {}) {
  if (missing && missingIsLegacy) return LEGACY_RULE;
  if (!missing && (value === LEGACY_RULE || value === STATIC_SEA_RULE)) return value;
  throw new TypeError(`Invalid hydrologyRules: ${String(value)}`);
}

export function hydrologyRuleForWorld(world) {
  if (world.plane && world.plane !== 'mortal') throw new TypeError('hydrologyRules belong to the mortal World');
  const rule = parseHydrologyRule(world.hydrologyRules, {
    missing: !owns(world, 'hydrologyRules'), missingIsLegacy: !prepared.has(world),
  });
  if (prepared.has(world) && prepared.get(world) !== rule) throw new TypeError('hydrologyRules changed on an initialized World');
  if (rule === STATIC_SEA_RULE && !prepared.has(world)) throw new TypeError('Static-sea World requires creation or restore preparation');
  return rule;
}

export function prepareHydrologyWorld(world, rule, context) {
  if (context !== 'create' && context !== 'restore') throw new TypeError('Hydrology preparation requires a creation or restore boundary');
  if (world.plane && world.plane !== 'mortal') throw new TypeError('Only mortal Worlds can own hydrologyRules');
  rule = parseHydrologyRule(rule);
  if (prepared.has(world)) throw new TypeError('Hydrology World is already initialized; runtime migration is unsupported');
  world.hydrologyRules = rule;
  if (rule === STATIC_SEA_RULE) prepareStaticSea(world);
  prepared.set(world, rule);
  return world;
}

// Validate before replacing a live World. Preserve the existing V0 -> V0 clock.
export function bindHydrologyWorld(session, world) {
  const next = hydrologyRuleForWorld(world);
  const previous = session.world ? hydrologyRuleForWorld(session.world) : LEGACY_RULE;
  if (!prepared.has(world)) {
    world.hydrologyRules = next;
    prepared.set(world, next);
  }
  if (session.world !== world && (next === STATIC_SEA_RULE || previous === STATIC_SEA_RULE)) session.hydroAccum = 0;
}

export function stepHydrologyForWorld(world, dtDays) {
  const rule = hydrologyRuleForWorld(world);
  if (!prepared.has(world)) {
    world.hydrologyRules = rule;
    prepared.set(world, rule);
  }
  return rule === STATIC_SEA_RULE ? stepHydrologyStaticSea(world, dtDays) : stepHydrology(world, dtDays, null);
}
