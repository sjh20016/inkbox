import { buildPopulationCensus } from './legacyCensus.js';
import { committedEntry, assertCommittedLegacyReadAllowed } from '../../presentation/readView/committedRegistry.js';
import { capturePopulationCards } from '../../presentation/readView/query.js';

const uiModes = new WeakMap();
const MODES = new Set(['legacy', 'audit', 'census']);
const FIELDS = ['humans', 'mortals', 'mortalAdults', 'practitioners', 'fertileMortals'];

export function setPopulationUiReadMode(world, mode) {
  if (!MODES.has(mode)) throw new RangeError('Unknown population read mode');
  if (!world || typeof world !== 'object') throw new TypeError('World required');
  assertCommittedLegacyReadAllowed(world);
  const session = committedEntry(world)?.session;
  const entry = committedEntry(world);
  if (session && (session.root !== world || entry.plane !== 'mortal')) {
    throw new Error('Population UI mode is available only on the managed mortal World');
  }
  if (mode === 'legacy') {
    uiModes.delete(world);
    if (session) session.populationCards = null;
  } else {
    if (session && !session.populationCards) {
      session.populationCards = capturePopulationCards(world, session.worldGeneration, session.sequence);
    }
    uiModes.set(world, mode);
  }
}

export function populationUiReadMode(world) {
  return uiModes.get(world) || 'legacy';
}

export function readVillageSocieties(world, legacyRead, mode = 'legacy') {
  if (!MODES.has(mode)) throw new RangeError('Unknown population read mode');
  if (mode === 'legacy') return { societies: legacyRead(world), mode, differences: [] };
  assertCommittedLegacyReadAllowed(world);

  // A fresh census for each request is necessary until every population writer
  // sends an invalidation. Day, count, and entity-array identity are insufficient.
  const session = committedEntry(world)?.session;
  const sequence = session?.sequence;
  const census = buildPopulationCensus(world, 'committed-query');
  const legacy = legacyRead(world);
  const differences = [];
  const societies = new Map();
  for (const village of world.villages) {
    const oldFacts = legacy.get(village.id);
    const newFacts = census.villages.get(village.id)?.society;
    if (!oldFacts || !newFacts) {
      differences.push({ villageId: village.id, field: 'missing', legacy: oldFacts, census: newFacts });
      continue;
    }
    for (const field of FIELDS) if (oldFacts[field] !== newFacts[field]) {
      differences.push({ villageId: village.id, field, legacy: oldFacts[field], census: newFacts[field] });
    }
    societies.set(village.id, Object.fromEntries(FIELDS.map(field => [field, newFacts[field]])));
  }
  if (session && (session.inProgress || session.fault || session.sequence !== sequence)) {
    throw new Error('Population read crossed a committed generation');
  }
  // The caller always receives the old result when the independent reader
  // disagrees, including in the experimental census mode.
  return { societies: mode === 'census' && !differences.length ? societies : legacy,
    mode: differences.length ? 'fallback' : mode, differences, census };
}
