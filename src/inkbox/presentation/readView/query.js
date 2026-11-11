import { settlementInspectCard } from '../../ui/settlementInspector.js';
import { worldGeneration } from './index.js';

export function getSettlementInspection(world, plane, id, isRuin = false) {
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
