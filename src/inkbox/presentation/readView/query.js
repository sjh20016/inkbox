import { settlementInspectCard } from '../../ui/settlementInspector.js';
import { worldGeneration } from './index.js';
import { assertCommittedLegacyReadAllowed } from './committedRegistry.js';
import { committedEntry } from './committedRegistry.js';
import { buildPopulationCensus } from '../../sim/demography/legacyCensus.js';
import { legacyVillageSocieties } from '../../sim/sectEconomy.js';
import { populationUiReadMode } from '../../sim/demography/populationReadPort.js';

export function capturePopulationCards(world, generation, sequence) {
  const oldFacts = legacyVillageSocieties(world);
  const census = buildPopulationCensus(world, 'publish');
  const fields = ['humans', 'mortals', 'mortalAdults', 'practitioners', 'fertileMortals'];
  const shadow = new Map();
  let differs = false;
  for (const village of world.villages) {
    const row = census.villages.get(village.id)?.society;
    const old = oldFacts.get(village.id);
    if (!row || !old || fields.some(field => row[field] !== old[field])) differs = true;
    if (row) shadow.set(village.id, Object.fromEntries(fields.map(field => [field, row[field]])));
  }
  const makeCards = selected => {
    const cards = new Map();
    for (const village of world.villages) {
      const card = settlementInspectCard(world, village, false, selected);
      cards.set(village.id, Object.freeze({ worldGeneration: generation, plane: 'mortal',
      observedDay: world.day, settlementId: village.id, head: card.head,
      rows: Object.freeze(card.rows.map(row => Object.freeze([...row]))),
      factionId: card.factionId,
      predecessors: Object.freeze(card.predecessors.map(row => Object.freeze({id: row.id, name: row.name}))),
      commitSequence: sequence }));
    }
    return cards;
  };
  return { legacy: makeCards(oldFacts), census: differs ? null : makeCards(shadow), differences: differs };
}

export function getSettlementInspection(world, plane, id, isRuin = false) {
  const entry = committedEntry(world);
  const session = entry?.session;
  if (!isRuin && plane === 'mortal' && populationUiReadMode(world) !== 'legacy' && session) {
    if (session.disposed) throw new Error('Population cards unavailable for a disposed World');
    if (session.root !== world || entry.plane !== 'mortal') return null;
    const snapshot = session.populationCards;
    const cards = populationUiReadMode(world) === 'census' ? snapshot?.census || snapshot?.legacy : snapshot?.legacy;
    return cards?.get(id) ?? null;
  }
  assertCommittedLegacyReadAllowed(world);
  if (!world || plane !== (world.plane || 'mortal')) return null;
  const source = isRuin ? world.settlementRuins : world.villages;
  const settlement = source?.find(item => item?.id === id);
  if (!settlement) return null;
  const card = settlementInspectCard(world, settlement, isRuin);
  return Object.freeze({ worldGeneration: worldGeneration(world), plane,
    observedDay: world.day, settlementId: id, head: card.head,
    rows: Object.freeze(card.rows.map(row => Object.freeze([...row]))),
    factionId: card.factionId,
    predecessors: Object.freeze(card.predecessors.map(item => Object.freeze({ id: item.id, name: item.name }))) });
}
