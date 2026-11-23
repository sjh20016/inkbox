import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { nativeApi } from './inkbox-wx-e0-replay.mjs';
import { loadCheckpoint } from './inkbox-mlod0b-inputs.mjs';
import { emitRuntimeEvent, peekRuntimeEvents } from '../src/inkbox/core/runtimeEvents.js';
import { getCommittedFrame, getCommittedQuery, manageCommittedWorlds, beginCompleteStep, publishCompleteStep, disposeCommittedWorlds } from '../src/inkbox/presentation/readView/committedStore.js';
import { getSettlementInspection } from '../src/inkbox/presentation/readView/query.js';
import { setPopulationUiReadMode } from '../src/inkbox/sim/demography/populationReadPort.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const normalize = value => {
  if (Array.isArray(value)) return value.map(normalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'worldGeneration' && key !== 'sessionId').map(([key, item]) => [key, normalize(item)]));
};
const hash = value => createHash('sha256').update(JSON.stringify(normalize(value))).digest('hex');
const evidence = { test: 'MLOD-0B transient runtime event witness', node: process.version,
  input: '100-year supplied natural checkpoint', dt: 3, boundaries: 6, arms: ['legacy/off', 'audit', 'census'], pass: false, trials: [] };
const api = await nativeApi(root);
const { saved, sha256 } = loadCheckpoint(100);
evidence.inputSha256 = sha256;
const villageId = saved.villages?.[0]?.id;
assert.ok(villageId, 'natural checkpoint has a settlement card target');
const arms = evidence.arms.map(mode => {
  const context = api.restore(saved);
  setPopulationUiReadMode(context.world, mode === 'legacy/off' ? 'legacy' : mode);
  const committed = manageCommittedWorlds(context.world);
  return { mode, context, committed };
});

try {
  // These valid but non-authoritative presentation events make the witness non-empty
  // even when this short natural-save window produces no gameplay event organically.
  for (const { context } of arms) {
    const w = context.world, id = w.entities.find(e => e.hp > 0)?.id;
    assert.ok(Number.isSafeInteger(id));
    emitRuntimeEvent(w, 'major-death', { day: w.day, plane: 'mortal', subjectId: id, x: 1, y: 1 });
    emitRuntimeEvent(w, 'rift-open', { day: w.day, plane: 'mortal', x: 2, y: 1, intensity: 0.5 });
  }
  const baselineEvents = peekRuntimeEvents(arms[0].context.world);
  assert.equal(baselineEvents.length, 2, 'non-empty ordered transient seed events');
  for (const { context } of arms.slice(1)) assert.deepEqual(peekRuntimeEvents(context.world), baselineEvents);

  for (let boundary = 0; boundary <= evidence.boundaries; boundary++) {
    if (boundary > 0) {
      for (const { context } of arms) {
        beginCompleteStep(context.world);
        api.advance(context, evidence.dt);
        publishCompleteStep(context.world);
      }
    }
    const rows = arms.map(({ mode, context }) => {
      const world = context.world;
      const events = peekRuntimeEvents(world);
      // Full serialization deliberately excludes this queue; read/peek must not drain it.
      const savedWorld = api.capture(context);
      const frame = getCommittedFrame(world, 'mortal');
      const query = getCommittedQuery(world, 'mortal');
      const card = getSettlementInspection(world, 'mortal', villageId);
      assert.ok(frame && query && card, 'committed frame, DTO query and settlement card published');
      assert.equal(frame.committedDay, world.day);
      assert.equal(query.committedDay, world.day);
      assert.equal(card.observedDay, world.day);
      assert.deepEqual(peekRuntimeEvents(world), events, 'readonly committed readers and event peeks preserve queue');
      const planes = ['mortal', 'upper', 'nether'].map(plane => {
        const p = plane === 'mortal' ? world : world[plane];
        return p ? { plane, day: p.day, entityCount: (p.entities || []).length,
          entityIdsSha256: hash((p.entities || []).map(e => e.id).sort((a,b) => String(a).localeCompare(String(b)))) } : { plane, absent: true };
      });
      return { mode, day: world.day, commitSequence: frame.commitSequence, eventCount: events.length,
        eventOrder: events.map(e => e.type), eventSha256: hash(events), saveSha256: hash(savedWorld),
        frameSha256: hash(frame), querySha256: hash(query),
        cardSha256: hash({ head: card.head, rows: card.rows, factionId: card.factionId, predecessors: card.predecessors }), planes };
    });
    const comparable = row => ({ day: row.day, eventCount: row.eventCount, eventOrder: row.eventOrder,
      eventSha256: row.eventSha256, saveSha256: row.saveSha256, frameSha256: row.frameSha256,
      querySha256: row.querySha256, cardSha256: row.cardSha256, planes: row.planes });
    assert.deepEqual(comparable(rows[1]), comparable(rows[0]), `audit/off differ at committed boundary ${boundary}`);
    assert.deepEqual(comparable(rows[2]), comparable(rows[0]), `census/off differ at committed boundary ${boundary}`);
    evidence.trials.push({ boundary, baseline: rows[0], parity: { audit: true, census: true } });
  }
  evidence.sampleCount = evidence.trials.reduce((n, t) => n + t.baseline.eventCount, 0);
  evidence.nonEmptyEventBoundaries = evidence.trials.filter(t => t.baseline.eventCount > 0).length;
  assert.ok(evidence.sampleCount > 0 && evidence.nonEmptyEventBoundaries > 0);
  evidence.pass = true;
} finally {
  for (const { context } of arms) disposeCommittedWorlds(context.world);
  const out = path.join(root, 'reports/mlod0b/nonserialized-events.json');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(evidence, null, 2) + '\n');
}
console.log(`MLOD-0B transient witness: ${evidence.trials.length} committed boundaries, ${evidence.sampleCount} ordered event samples; legacy/audit/census matched.`);
