// Observe one formal tool execution. Feedback is derived from real differences;
// it never executes a power, draws RNG, or writes simulation/save fields.
import { emitPresentation } from './presentation.js';

const CELL_FIELDS = ['height', 'water', 'veg', 'over', 'fire', 'struct'];
const ENTITY_FIELDS = ['hp', 'level', 'lifespan', 'root', 'techniques', 'forbidden', '_ascended', 'faction'];
const ENTITY_TOOLS = new Set(['lightning', 'meteor', 'plague', 'erase', 'human', 'cultivator', 'beast', 'spirit', 'root', 'tribulation', 'manual', 'forbidden', 'ascend', 'found']);
const SETTLEMENT_TOOLS = new Set(['lightning', 'meteor', 'quake', 'flood', 'plague', 'crisis']);
// Flood, like the water brushes, emits the actual changed-water observation
// from the authoritative water path. A second generic impact would depict
// one intervention twice (and could outlive its real water response).
const WATER_TOOLS = new Set(['water', 'drain', 'flood']);
const lifeSignature = e => JSON.stringify(ENTITY_FIELDS.map(key => e[key] ?? null));
const crisisSignature = events => JSON.stringify((events?.activeCrises || []).map(e => [e.id, e.kind, e.villageId]));
// Rolling ledgers can replace their last row without changing length. Keep the
// last value and identity so a real record is seen even at the capacity edge.
const ledgerStamp = rows => ({ length: rows?.length ?? 0, last: rows?.at(-1) ?? null,
  value: JSON.stringify(rows?.at(-1) ?? null) });
const ledgerChanged = (before, rows) => before.length !== (rows?.length ?? 0)
  || before.last !== (rows?.at(-1) ?? null)
  || before.value !== JSON.stringify(rows?.at(-1) ?? null);

export function observeToolBefore(ctx, tool) {
  if (!ctx?.world || tool?.readonly || tool?.mode === 'select') return null;
  const { world, x, y } = ctx;
  const radius = Math.min(36, Math.max(1, ctx.radius || 1, tool.id === 'lightning' ? 5 : 1) + 3);
  const x0 = Math.max(0, Math.floor(x - radius)), y0 = Math.max(0, Math.floor(y - radius));
  const x1 = Math.min(world.w - 1, Math.ceil(x + radius)), y1 = Math.min(world.h - 1, Math.ceil(y + radius));
  const cells = new Float64Array((x1 - x0 + 1) * (y1 - y0 + 1) * CELL_FIELDS.length);
  let k = 0;
  for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
    const i = cy * world.w + cx;
    for (const field of CELL_FIELDS) cells[k++] = world[field][i];
  }
  return { world, tool: tool.id, x, y, radius: ctx.radius, x0, y0, x1, y1, cells,
    entities: ENTITY_TOOLS.has(tool.id) ? new Map(world.entities.map(e => [e.id, { signature: lifeSignature(e), hp: e.hp }])) : null,
    settlements: SETTLEMENT_TOOLS.has(tool.id) ? new Map(world.villages.map(v => [v.id, `${v.hp}/${v.food}`])) : null,
    leylines: world.leylines.length, sites: world.sites.length, factions: world.factions.length,
    crisis: crisisSignature(ctx.events), targetEntityId: ctx.targetEntityId,
    chronicle: ledgerStamp(world.chronicle), milestones: ledgerStamp(world.milestones),
    eventHistory: ledgerStamp(ctx.events?.history), nextEventId: ctx.events?.nextEventId,
    eventState: world.worldEventState };
}

export function observeToolAfter(ctx, before) {
  if (!before || before.world !== ctx.world) return { changed: false, persistentChanged: false, affectedCells: 0 };
  const world = ctx.world;
  let affectedCells = 0, k = 0, damaged = 0, killed = 0, changedPeople = 0;
  const subjectIds = [];
  for (let cy = before.y0; cy <= before.y1; cy++) for (let cx = before.x0; cx <= before.x1; cx++) {
    const i = cy * world.w + cx;
    let changed = false;
    for (const field of CELL_FIELDS) if (world[field][i] !== before.cells[k++]) changed = true;
    if (changed) affectedCells++;
  }
  for (const e of before.entities ? world.entities : []) {
    const prior = before.entities.get(e.id);
    if (!prior || prior.signature !== lifeSignature(e)) {
      changedPeople++;
      if (subjectIds.length < 24) subjectIds.push(e.id);
    }
    if (prior?.hp > e.hp) damaged++;
    if (prior?.hp > 0 && e.hp <= 0) killed++;
  }
  const changedPlaces = before.settlements ? world.villages.filter(v => before.settlements.get(v.id) !== `${v.hp}/${v.food}`).length : 0;
  const changed = affectedCells > 0 || changedPeople > 0 || changedPlaces > 0 || before.leylines !== world.leylines.length
    || before.sites !== world.sites.length || before.factions !== world.factions.length
    || before.crisis !== crisisSignature(ctx.events);
  const persistentChanged = ledgerChanged(before.chronicle, world.chronicle)
    || ledgerChanged(before.milestones, world.milestones)
    || ledgerChanged(before.eventHistory, ctx.events?.history)
    || before.nextEventId !== ctx.events?.nextEventId
    || before.eventState !== world.worldEventState;
  const result = { changed, persistentChanged, tool: before.tool, affectedCells, changedPeople, changedPlaces, damaged, killed, subjectIds };
  if (!changed) return result;
  // Local water emits its own spatially bounded rise/flow/recede observation.
  // Do not layer a second generic effect over that same actual response.
  if (!WATER_TOOLS.has(before.tool)) {
    const target = before.targetEntityId == null ? null : world.entities.find(e => e.id === before.targetEntityId);
    emitPresentation(world, 'tool-impact', {
      x: target?.x ?? before.x, y: target?.y ?? before.y,
      ...(target ? { subjectId: target.id } : {}),
      data: { power: true, tool: before.tool, radius: before.radius, affectedCells, changedPeople, changedPlaces, damaged, killed, subjectIds },
    });
  }
  return result;
}
