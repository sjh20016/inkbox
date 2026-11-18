import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { nativeApi } from './inkbox-wx-e0-replay.mjs';
import { createResumableSimulation } from '../research/wx-e3sp/engine.js';
import { restoreResearchContext, captureResearchSave } from '../research/wx-e3sp/context.js';
import { executeResearchCommand } from '../research/wx-e3sp/commandPort.js';
import { readPersonStories } from '../src/inkbox/wanxiang/storyReading.js';
import { referenceRoot } from './inkbox-wx-e3sp-reference.mjs';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const B = await nativeApi(referenceRoot());
const C = await nativeApi(root);
const runtimeEvents = await B.load('core/runtimeEvents.js');
const engine = await import(pathToFileURL(path.join(root, 'research/wx-e3sp/engine.js')).href);
const out = path.resolve(root, process.argv.find(s => s.startsWith('--out='))?.slice('--out='.length) ?? 'reports/local/wx-e3sp/correctness.json');
const sha = value => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex');
function sourceInventory() {
  const rows = [];
  function visit(base, relative = '') {
    for (const entry of fs.readdirSync(base, { withFileTypes: true })) {
      const absolute = path.join(base, entry.name), rel = path.join(relative, entry.name).replaceAll('\\', '/');
      if (entry.isDirectory()) visit(absolute, rel);
      else if (entry.isFile()) rows.push([rel, sha(fs.readFileSync(absolute))]);
    }
  }
  for (const dir of ['src', 'research']) visit(path.resolve(root, dir), dir);
  rows.sort((a, b) => a[0].localeCompare(b[0]));
  return { fileCount: rows.length, sha256: sha(JSON.stringify(rows)), files: Object.fromEntries(rows) };
}
const sourceStart = sourceInventory(), startedAt = new Date().toISOString();
const report = { pass: false, startedAt, sourceStart, reference: { root: B.root, head: engine.RESEARCH_BASE_SHA }, candidate: { root, base: engine.RESEARCH_BASE_SHA,
  engineSha256: sha(fs.readFileSync(path.resolve(root, 'research/wx-e3sp/engine.js'))) }, cases: [], faults: [], coverage: [] };

function walkNoAuthority(value, seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  assert(!(value instanceof Map) && !(value instanceof Set) && !ArrayBuffer.isView(value), 'public projection contains mutable collection');
  assert(Object.isFrozen(value), 'public projection is not deeply frozen');
  for (const key of Object.keys(value)) walkNoAuthority(value[key], seen);
}
function fullB(c) { return B.capture(c); }
function drainBEvents(c) {
  const rows = [];
  for (const plane of ['mortal', 'upper', 'nether']) {
    const world = plane === 'mortal' ? c.world : c.world[plane];
    if (world) rows.push(...runtimeEvents.drainRuntimeEvents(world).map(event => ({ plane, event })));
  }
  return rows;
}
function getCheckpoint(name) {
  const source = process.argv.find(arg => arg.startsWith('--checkpoint-root='))?.slice('--checkpoint-root='.length);
  const directory = source ? path.resolve(source) : path.resolve(root, '../inkbox-wx-s1/reports/local/wx-s1/natural');
  const file = path.join(directory, name);
  const bytes = fs.readFileSync(file), saved = JSON.parse(bytes);
  assert.equal(saved.v, 11); assert(saved.runtime?.exact, 'exact G8 v11 checkpoint required');
  return { file, sha256: sha(bytes), saved };
}
function assertProjection(sim, day, label, deep = true) {
  const f = sim.getFrame('mortal'), q = sim.getQuery('mortal');
  assert.equal(f.committedDay, day, `${label} committed frame day`);
  assert.equal(q.committedDay, day, `${label} committed query day`);
  assert(Object.isFrozen(f) && Object.isFrozen(q));
  if (deep) { walkNoAuthority(f); walkNoAuthority(q); walkNoAuthority(sim.getEvents()); walkNoAuthority(sim.getReceipts()); }
}
async function saveAtBoundary(sim) {
  const pending = sim.requestSave(); let guard = 0;
  while (sim.getStatus().queueLength > 0 && guard++ < 100) sim.runSlice({ budgetMs: 1000, maxAtoms: 4 });
  assert(guard < 100, 'queued save did not reach safe boundary');
  return pending;
}
async function simulate(label, saved, steps) {
  const serialized = JSON.stringify(saved), b = B.restore(JSON.parse(serialized));
  drainBEvents(b); // C starts with an empty delivery queue after publishing its initial committed snapshot.
  const sync = await createResumableSimulation(serialized, { mode: 'sync' });
  const coop = await createResumableSimulation(serialized, { mode: 'cooperative' });
  // nativeApi.advance calls advanceWorld without deps.riftActive, whose documented default is enabled.
  sync.setRiftActive(true); coop.setRiftActive(true);
  const row = { label, startDay: b.world.day, steps, checkpointSha256: sha(serialized), boundaries: [], milestones: [], yields: 0 };
  const deferredSaves = [];
  report.cases.push(row);
  for (let n = 0; n < steps; n++) {
    const expectedDay = b.world.day + 3;
    for (const sim of [sync, coop]) {
      const heldFrame = sim.getFrame(), heldQuery = sim.getQuery(), heldEvents = sim.getEvents(), heldDay = sim.getStatus().committedDay;
      sim.setTargetDay(expectedDay);
      let deferredSave = null, saveResolved = false;
      if (n === 0) {
        sim.runSlice({ budgetMs: 1000, maxAtoms: 1 });
        deferredSave = sim.requestSave(); deferredSave.then(() => { saveResolved = true; });
        await Promise.resolve(); assert.equal(saveResolved, false, 'save waits while a boundary is in flight');
      }
      let guard = 0;
      while (sim.getStatus().committedDay < expectedDay && sim.getStatus().state !== 'FAULT') {
        const before = sim.getStatus().committedDay;
        sim.runSlice({ budgetMs: 1000, maxAtoms: 1, maxStarts: 1 }); guard++; row.yields++;
        assert(guard < 50000, `${label} ${sim.getStatus().mode} atom pump limit`);
        if (sim.getStatus().committedDay === before) {
          assert.strictEqual(sim.getFrame(), heldFrame, 'frame identity remains committed throughout yield');
          assert.strictEqual(sim.getQuery(), heldQuery, 'query identity remains committed throughout yield');
          assert.strictEqual(sim.getEvents(), heldEvents, 'event queue remains committed throughout yield');
          assert.equal(sim.getStatus().committedDay, heldDay);
          assertProjection(sim, heldDay, 'yield', false);
        }
      }
      assert.equal(sim.getStatus().state, 'IDLE');
      assert.equal(sim.getStatus().committedDay, expectedDay);
      if (deferredSave) {
        while (sim.getStatus().queueLength > 0) sim.runSlice({ budgetMs: 1000, maxAtoms: 1 });
        await Promise.resolve(); assert.equal(saveResolved, true, 'queued save flushes at the next safe boundary');
      }
      if (deferredSave) deferredSaves.push(deferredSave);
    }
    B.advance(b, 3);
    const native = JSON.parse(JSON.stringify(fullB(b)));
    const expectedEvents = drainBEvents(b);
    for (const sim of [sync, coop]) {
      const actualEvents = sim.getEvents().map(({ plane, event }) => ({ plane, event }));
      assert.deepEqual(actualEvents, expectedEvents, `${label} boundary ${n + 1} event content/order`);
      const sequence = sim.getFrame().commitSequence;
      assert.equal(sim.ackEvents(sequence, sim.getFrame().worldGeneration), true, 'ack complete event delivery watermark');
    }
    // Save and story requests are safe-boundary operations and must be pumped explicitly.
    const saves = n === 0 ? deferredSaves : [saveAtBoundary(sync), saveAtBoundary(coop)];
    const [syncSave, coopSave] = await Promise.all(saves);
    assert.deepEqual(JSON.parse(syncSave), native, `${label} sync complete v11 boundary ${n + 1}`);
    assert.deepEqual(JSON.parse(coopSave), native, `${label} cooperative complete v11 boundary ${n + 1}`);
    assert.equal(sha(JSON.parse(syncSave)), sha(native)); assert.equal(sha(JSON.parse(coopSave)), sha(native));
    assertProjection(sync, expectedDay, 'sync complete'); assertProjection(coop, expectedDay, 'coop complete');
    row.boundaries.push({ day: expectedDay, sha256: sha(native), runtimeSha256: sha(native.runtime) });
    if ([10, 30, 90, 360].includes(expectedDay - row.startDay)) row.milestones.push({ days: expectedDay - row.startDay, sha256: sha(native) });
  }
  for (const sim of [sync, coop]) {
    const metrics = sim.getMetrics();
    assert.equal(metrics.normalStepRestores, 0); assert.equal(metrics.normalStepFullSaves, 0);
    assert.equal(sim.getStatus().ledgerEntries, steps);
    sim.dispose();
  }
  row.equal = true;
}

if (process.argv.includes('--snapshot-only')) {
  const prior = JSON.parse(fs.readFileSync(out, 'utf8'));
  prior.reference = { root: B.root, head: engine.RESEARCH_BASE_SHA, manifest: 'scripts/inkbox-wx-e3sp-reference.mjs frozen fixture' };
  prior.candidate.engineSha256 = sha(fs.readFileSync(path.resolve(root, 'research/wx-e3sp/engine.js')));
  const inputs = [
    ['fresh-120', C.capture(C.fresh(73101)), 120],
    ['natural-100y-30', getCheckpoint('20260914-100y-save.json').saved, 30],
    ['natural-400y-30', getCheckpoint('20260914-400y-save.json').saved, 30],
  ];
  for (const [label, saved, steps] of inputs) {
    const reference = B.restore(JSON.parse(JSON.stringify(saved)));
    for (let i = 0; i < steps; i++) B.advance(reference, 3);
    const final = JSON.parse(JSON.stringify(fullB(reference))), expected = prior.cases.find(row => row.label === label);
    assert.equal(sha(final), expected.boundaries.at(-1).sha256, `${label} final snapshot matches saved three-way boundary SHA`);
    const file = path.resolve(root, 'reports/local/wx-e3sp/correctness-' + label + '.world.json');
    fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(final));
    expected.finalWorldFile = file; expected.finalWorldSha256 = sha(final);
    console.log(`${label} final serialized World/runtime ${sha(final)}`);
  }
  fs.writeFileSync(out, JSON.stringify(prior, null, 2)); process.exit(process.exitCode || 0);
}

if (process.argv.includes('--followup-only') || process.argv.includes('--quick')) {
  const quick = process.argv.includes('--quick');
  const follow = { pass: false, scope: quick ? 'portable CI: fresh and controlled fixtures only; no aged natural claim' : 'focused native follow-up', source: { engineSha256: sha(fs.readFileSync(path.resolve(root, 'research/wx-e3sp/engine.js'))) }, checks: [] };
  const natural = C.capture(C.fresh(73101));
  const pump = (sim, day) => {
    sim.setTargetDay(day); let n = 0;
    while (sim.getStatus().committedDay < day - 1e-8 && n++ < 100000) sim.runSlice({ budgetMs: 1000, maxAtoms: 1 });
    assert(n < 100000); assert.equal(sim.getStatus().state, 'IDLE');
  };
  const faultAtNextStep = (sim, day) => {
    sim.setTargetDay(day); let n = 0;
    while (sim.getStatus().state !== 'FAULT' && n++ < 100000) sim.runSlice({ budgetMs: 1000, maxAtoms: 1 });
    assert(n < 100000); assert.equal(sim.getStatus().state, 'FAULT');
  };
  async function nativeSave(sim) { return JSON.parse(await saveAtBoundary(sim)); }
  try {
    {
      follow.stage = 'default-rift-clock';
      const sim = await createResumableSimulation(natural, { mode: 'cooperative' }), ref = B.restore(JSON.parse(JSON.stringify(natural)));
      pump(sim, ref.world.day + 3); B.advance(ref, 3);
      assert.deepEqual(await nativeSave(sim), JSON.parse(JSON.stringify(fullB(ref))), 'default rift clock matches native advance default');
      follow.checks.push({ name: 'default-rift-clock', defaultEnabled: true, worldAndG8: 'equal' }); sim.dispose();
    }
    // Controlled three-realm world, 30 complete fixed-dt boundaries.
    {
      follow.stage = 'controlled-three-realms';
      const [{ generateUpperWorld }, { generateNetherWorld }, { UpperLife }] = await Promise.all(['world/worldgenUpper.js', 'world/worldgenNether.js', 'sim/upperLife.js'].map(C.load));
      const c = C.fresh(73101), bounds = { w: c.world.w, h: c.world.h };
      c.world.upper = generateUpperWorld({ preset: bounds, seed: c.world.seed });
      c.world.nether = generateNetherWorld({ preset: bounds, seed: c.world.seed }); c.upperLife = new UpperLife(c.world.upper);
      const input = C.capture(c), sim = await createResumableSimulation(input, { mode: 'cooperative' });
      const ref = B.restore(JSON.parse(JSON.stringify(input)));
      const controlledSteps = quick ? 10 : 30;
      for (let i = 0; i < controlledSteps; i++) {
        pump(sim, (i + 1) * 3); B.advance(ref, 3);
        assert.deepEqual(await nativeSave(sim), JSON.parse(JSON.stringify(fullB(ref))), `three realms boundary ${i + 1}`);
        sim.ackEvents(sim.getFrame().commitSequence);
      }
      follow.checks.push({ name: 'controlled-three-realms', boundaries: controlledSteps, worldsAndG8: 'equal' }); sim.dispose();
    }
    // Commands in one frozen day, through the actual domain port; receipts and event packets survive recovery.
    {
      follow.stage = 'commands-receipts-events-recovery';
      const sim = await createResumableSimulation(natural, { mode: 'cooperative' }), ref = restoreResearchContext(natural);
      const b = (await C.load('world/mapProgress.js')).accessBounds(ref.world);
      const point = { x: Math.floor((b.x0 + b.x1) / 2), y: Math.floor((b.y0 + b.y1) / 2) };
      const person = ref.world.entities.find(e => e.hp > 0), personPoint = person ? { x: Math.floor(person.x), y: Math.floor(person.y) } : point;
      const cmds = [
        { type: 'terrain-stroke', payload: { toolId: 'raise', radius: 1, points: [point] } },
        { type: 'terrain-stroke', payload: { toolId: 'raise', radius: 1, points: [point] } },
        { type: 'undo', payload: {} },
        { type: 'power', payload: { toolId: 'lightning', radius: 3, point: personPoint } },
        { type: 'power', payload: { toolId: 'erase', radius: 3, point: personPoint } },
      ];
      const domainResults = [];
      for (let i = 0; i < cmds.length; i++) {
        const frame = sim.getFrame(), command = { schemaVersion: 1, seq: i + 1, type: cmds[i].type, payload: cmds[i].payload,
          worldGeneration: frame.worldGeneration, issuedAtCommittedDay: frame.committedDay };
        assert.equal(sim.submit(command).ok, true);
        sim.runSlice({ budgetMs: 1000, maxAtoms: 8, maxStarts: 0 });
        domainResults.push(executeResearchCommand(ref, command));
        const receipt = await sim.waitForReceipt(i + 1);
        assert.deepEqual(receipt.native, domainResults[i]);
        assert.deepEqual(await nativeSave(sim), JSON.parse(captureResearchSave(ref)), `command ${i + 1} domain world`);
      }
      const beforePair = sim.getEvents();
      for (let i = 0; i < 2; i++) {
        const frame = sim.getFrame(), command = { schemaVersion: 1, seq: cmds.length + i + 1, type: 'terrain-stroke',
          payload: { toolId: 'raise', radius: 1, points: [point] }, worldGeneration: frame.worldGeneration, issuedAtCommittedDay: frame.committedDay };
        assert.equal(sim.submit(command).ok, true); domainResults.push(executeResearchCommand(ref, command));
      }
      sim.runSlice({ budgetMs: 1000, maxAtoms: 8, maxStarts: 0 });
      for (let seq = 6; seq <= 7; seq++) {
        const receipt = await sim.waitForReceipt(seq); assert.deepEqual(receipt.native, domainResults[seq - 1]);
      }
      assert.deepEqual(await nativeSave(sim), JSON.parse(captureResearchSave(ref)), 'same-slice double raise matches domain World/RNG');
      assert(sim.getEvents().length >= beforePair.length, 'same-slice event delivery is conserved');
      const packets = sim.getEvents(), packetIds = packets.map(p => p.deliveryId);
      assert.equal(new Set(packetIds).size, packetIds.length, 'event delivery identifiers are unique');
      const wireReceipts = sim.getReceipts();
      sim.injectFault({ entityFraction: .3 }); faultAtNextStep(sim, sim.getStatus().committedDay + 3);
      const recovered = await sim.recover(); assert.equal(recovered.state, 'IDLE');
      assert.deepEqual(sim.getReceipts(), wireReceipts, 'recovery preserves original wire timestamps and receipts');
      assert.deepEqual(await nativeSave(sim), JSON.parse(captureResearchSave(ref)), 'recovery discards the incomplete step and keeps completed command domain state');
      assert.deepEqual(sim.getEvents().slice(0, packets.length).map(({ plane, event }) => ({ plane, event })),
        packets.map(({ plane, event }) => ({ plane, event })), 'unacknowledged event packets survive recovery in order/content; generation ids are ephemeral');
      assert.equal(sim.ackEvents(sim.getFrame().commitSequence), true); assert.equal(sim.getEvents().length, 0);
      follow.checks.push({ name: 'commands-receipts-events-recovery', commands: cmds.length, eventPackets: packets.length, receiptRecovery: 'byte-deep-equal' });
      sim.dispose();
    }
    // Story and save operations cannot observe an in-flight world; returned values and strings are detached.
    {
      follow.stage = 'story-and-save-safe-boundary';
      const sim = await createResumableSimulation(natural, { mode: 'cooperative' });
      const startDay = sim.getStatus().committedDay;
      const storyRef = sim.getQuery().entities[0].storyRef, storyWorld = B.restore(JSON.parse(JSON.stringify(natural)));
      B.advance(storyWorld, 3); const expectedStory = readPersonStories(storyWorld.world, storyRef);
      sim.setTargetDay(startDay + 3); sim.runSlice({ budgetMs: 1000, maxAtoms: 1 });
      let storyDone = false, saveDone = false;
      const story = sim.readStories(storyRef).then(v => { storyDone = true; return v; });
      const save = sim.requestSave().then(v => { saveDone = true; return v; });
      await Promise.resolve(); assert.equal(storyDone, false); assert.equal(saveDone, false);
      pump(sim, startDay + 3); while (sim.getStatus().queueLength) sim.runSlice({ budgetMs: 1000, maxAtoms: 4 });
      const storyValue = await story, saveText = await save;
      assert.deepEqual(storyValue, expectedStory); walkNoAuthority(storyValue);
      const tampered = JSON.parse(saveText); if (tampered.wars) tampered.wars.push({ injected: true });
      if (tampered.chronicle) tampered.chronicle.push({ injected: true });
      pump(sim, startDay + 6);
      const verified = JSON.parse(await saveAtBoundary(sim));
      const ref = B.restore(JSON.parse(JSON.stringify(natural))); B.advance(ref, 3); B.advance(ref, 3);
      assert.deepEqual(verified, JSON.parse(JSON.stringify(fullB(ref))), 'mutating a detached parsed save does not mutate authority');
      follow.checks.push({ name: 'story-and-save-safe-boundary', storyFrozen: true, detachedSave: true }); sim.dispose();
    }
    // Cancel rolls back the active atom; active replacement publishes a fresh generation and invalidates old commands.
    {
      follow.stage = 'cancel-recover-active-replace';
      const sim = await createResumableSimulation(natural, { mode: 'cooperative' }), start = sim.getStatus().committedDay;
      const initial = await saveAtBoundary(sim), oldGeneration = sim.getFrame().worldGeneration;
      sim.setTargetDay(start + 3); sim.runSlice({ budgetMs: 1000, maxAtoms: 1 }); sim.cancel();
      assert.equal(sim.getStatus().state, 'FAULT'); assert.deepEqual(JSON.parse(await saveAtBoundary(sim).catch(() => initial)), JSON.parse(initial));
      await sim.recover(); assert.deepEqual(await nativeSave(sim), JSON.parse(initial));
      sim.setTargetDay(start + 3); sim.runSlice({ budgetMs: 1000, maxAtoms: 1 });
      const replaced = await sim.replace(initial); assert.equal(replaced.state, 'IDLE');
      assert.notEqual(sim.getFrame().worldGeneration, oldGeneration);
      assert.equal(sim.submit({ schemaVersion: 1, seq: 1, type: 'undo', payload: {}, worldGeneration: oldGeneration, issuedAtCommittedDay: start }).reason, 'stale-world');
      follow.checks.push({ name: 'cancel-recover-active-replace', cancelRecovered: true, staleGenerationRejected: true }); sim.dispose();
    }
    {
      follow.stage = 'pause-resume-debt';
      const sim = await createResumableSimulation(natural, { mode: 'cooperative', clock: () => 0 }), start = sim.getStatus().committedDay;
      sim.setTargetDay(start + 30);
      while (sim.getStatus().committedDay < start + 6) sim.runSlice({ budgetMs: 1000, maxAtoms: 1 });
      sim.pause(0);
      const held = sim.getStatus().committedDay, debt = sim.getStatus().lagDays;
      for (let i = 0; i < 3; i++) { sim.pause(0); sim.resume(2, 0); sim.pause(0); }
      sim.runSlice({ budgetMs: 1000, maxAtoms: 2 });
      assert.equal(sim.getStatus().committedDay, held, 'paused world does not advance'); assert.equal(sim.getStatus().lagDays, debt);
      sim.resume(2, 0); pump(sim, start + 30);
      const ref = B.restore(JSON.parse(JSON.stringify(natural))); for (let i = 0; i < 10; i++) B.advance(ref, 3);
      assert.deepEqual(await nativeSave(sim), JSON.parse(JSON.stringify(fullB(ref))));
      follow.checks.push({ name: 'pause-resume-debt', repeated: 3, targetDays: 30, debtPreserved: true }); sim.dispose();
    }
    {
      follow.stage = 'fps-30-60-target-and-command';
      const saved = natural, startDay = B.restore(JSON.parse(JSON.stringify(saved))).world.day;
      const [{ TIME }, { accessBounds }] = await Promise.all(['core/config.js', 'world/mapProgress.js'].map(C.load));
      const results = [];
      for (const fps of [30, 60]) {
        let now = 0; const sim = await createResumableSimulation(saved, { mode: 'cooperative', clock: () => now });
        sim.setSpeed(2, 0); const frameMs = 1000 / fps;
        for (let frame = 1; frame <= fps * 10; frame++) {
          now = frame * frameMs; sim.tick(now); sim.runSlice({ budgetMs: 1000, maxAtoms: Infinity, maxStarts: 1 });
        }
        while (sim.getStatus().lagDays >= 3 - 1e-8) sim.runSlice({ budgetMs: 1000, maxAtoms: Infinity, maxStarts: 1 });
        const committed = sim.getStatus().committedDay, steps = Math.round((committed - startDay) / 3);
        const ref = B.restore(JSON.parse(JSON.stringify(saved))); for (let i = 0; i < steps; i++) B.advance(ref, 3);
        const worldBounds = accessBounds(ref.world), pt = { x: Math.floor((worldBounds.x0 + worldBounds.x1) / 2), y: Math.floor((worldBounds.y0 + worldBounds.y1) / 2) };
        const command = { schemaVersion: 1, seq: 1, type: 'terrain-stroke', payload: { toolId: 'raise', radius: 1, points: [pt] },
          worldGeneration: sim.getFrame().worldGeneration, issuedAtCommittedDay: committed };
        assert.equal(sim.submit(command).ok, true); sim.runSlice({ budgetMs: 1000, maxAtoms: 4, maxStarts: 0 });
        const refContext = restoreResearchContext(JSON.stringify(fullB(ref))); executeResearchCommand(refContext, command);
        assert.deepEqual(await nativeSave(sim), JSON.parse(captureResearchSave(refContext)));
        results.push({ fps, targetDay: sim.getStatus().targetDay, committedDay: committed, steps }); sim.dispose();
      }
      assert.equal(results[0].targetDay, results[1].targetDay); assert.equal(results[0].committedDay, results[1].committedDay);
      follow.checks.push({ name: 'fps-30-60-target-and-command', results, equalWorldAndG8: true });
    }
    follow.pass = true;
  } catch (error) { follow.error = error.stack || String(error); process.exitCode = 1; }
  finally {
    follow.finishedAt = new Date().toISOString(); const file = path.resolve(root, `reports/local/wx-e3sp/${quick ? 'correctness-quick' : 'correctness-followup'}.json`);
    fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(follow, null, 2));
    console.log(JSON.stringify({ pass: follow.pass, checks: follow.checks, error: follow.error, out: file }));
  }
  process.exit(process.exitCode || 0);
}

try {
  const fresh = C.fresh(73101), freshSave = C.capture(fresh);
  await simulate('fresh-120', freshSave, 120);
  for (const age of [100, 400]) {
    const cp = getCheckpoint(`20260914-${age}y-save.json`);
    await simulate(`natural-${age}y-30`, cp.saved, 30);
  }
  // Faults are injected at real yielded entity indices. Last public commit must remain readable.
  const natural = getCheckpoint('20260914-100y-save.json').saved;
  for (const fraction of [.3, .7]) {
    const sim = await createResumableSimulation(natural, { mode: 'cooperative' });
    sim.setRiftActive(true);
    const initial = JSON.parse(await saveAtBoundary(sim));
    const baseDay = sim.getStatus().committedDay, reference = B.restore(initial);
    let spins = 0, frame = sim.getFrame();
    sim.setTargetDay(baseDay + 3);
    while (sim.getStatus().committedDay < baseDay + 3 && sim.getStatus().state !== 'FAULT' && spins++ < 100000)
      sim.runSlice({ budgetMs: 1000, maxAtoms: 1 });
    assert.equal(sim.getStatus().committedDay, baseDay + 3, 'establish first complete boundary before fault injection');
    frame = sim.getFrame(); sim.injectFault({ entityFraction: fraction }); sim.setTargetDay(baseDay + 6);
    while (sim.getStatus().state !== 'FAULT' && spins++ < 100000) {
      const previousDay = sim.getStatus().committedDay;
      sim.runSlice({ budgetMs: 1000, maxAtoms: 1 });
      if (sim.getStatus().committedDay !== previousDay) frame = sim.getFrame();
    }
    assert.equal(sim.getStatus().state, 'FAULT'); assert.strictEqual(sim.getFrame(), frame);
    assert.equal(sim.getStatus().commits, 1, 'one prior complete ledger entry survives a later real entity fault');
    assert.equal(sim.submit({ schemaVersion: 1, type: 'undo', seq: sim.getStatus().nextCommandSeq, worldGeneration: frame.worldGeneration, issuedAtCommittedDay: frame.committedDay }).reason, 'world-unavailable');
    await assert.rejects(sim.requestSave(), /unavailable/i);
    await assert.rejects(sim.readStories({ kind: 'person', plane: 'mortal', id: 1 }), /unavailable/i);
    B.advance(reference, 3);
    const recovered = await sim.recover(); assert.equal(recovered.state, 'IDLE');
    assert.equal(recovered.committedDay, baseDay + 3);
    assert.deepEqual(JSON.parse(await saveAtBoundary(sim)), JSON.parse(JSON.stringify(fullB(reference))), `fraction ${fraction} replays complete ledger only`);
    report.faults.push({ entityFraction: fraction, state: recovered.state, retainedDay: recovered.committedDay, publicFrontRetained: true, checkpointSha256: sha(initial) });
    sim.dispose();
  }
  {
    const sim = await createResumableSimulation(natural, { mode: 'cooperative' }), base = sim.getStatus().committedDay;
    sim.setRiftActive(true);
    const oldFront = sim.getFrame(); sim.injectFault({ commitPhase: 'after-store' }); sim.setTargetDay(base + 3);
    let guard = 0; while (sim.getStatus().state !== 'FAULT' && guard++ < 50000) sim.runSlice({ budgetMs: 1000, maxAtoms: 1 });
    assert.equal(sim.getStatus().state, 'FAULT'); assert.strictEqual(sim.getFrame(), oldFront);
    const restored = await sim.recover(); assert.equal(restored.committedDay, base);
    report.faults.push({ commitPhase: 'after-store', retainedDay: base, publicFrontRetained: true }); sim.dispose();
  }
  {
    const sim = await createResumableSimulation(natural, { mode: 'cooperative' });
    sim.injectFault({ entityFraction: .3 }); sim.setTargetDay(sim.getStatus().committedDay + 3);
    let guard = 0; while (sim.getStatus().state !== 'FAULT' && guard++ < 50000) sim.runSlice({ budgetMs: 1000, maxAtoms: 1 });
    const recovering = sim.recover(); sim.dispose(); await assert.rejects(recovering, /unavailable|stale-control/i);
    assert.equal(sim.getStatus().state, 'DISPOSED'); report.coverage.push('recover-then-dispose is terminal');
  }
  {
    const sim = await createResumableSimulation(natural, { mode: 'cooperative' });
    const replacing = sim.replace(natural); sim.dispose(); await assert.rejects(replacing, /unavailable|stale-control/i);
    assert.equal(sim.getStatus().state, 'DISPOSED'); report.coverage.push('replace-then-dispose is terminal');
  }
  {
    const sim = await createResumableSimulation(natural, { mode: 'cooperative' });
    const first = sim.replace(natural), second = sim.replace(natural);
    const secondResult = second.then(value => ({ value }), error => ({ error }));
    assert.equal((await first).state, 'IDLE');
    const attempted = await secondResult; assert(attempted.error); assert.match(attempted.error.message, /REPLACING|unavailable/i);
    sim.dispose(); report.coverage.push('concurrent replace rejects stale control epoch');
  }
  report.pass = true;
} catch (error) { report.error = error.stack || String(error); process.exitCode = 1; }
finally {
  report.finishedAt = new Date().toISOString(); report.sourceEnd = sourceInventory();
  report.sourceUnchanged = report.sourceStart.sha256 === report.sourceEnd.sha256;
  if (!report.sourceUnchanged) { report.pass = false; report.sourceError = 'src/research changed during final verification'; process.exitCode = 1; }
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(report, null, 2)); console.log(JSON.stringify({ pass: report.pass, error: report.error, out }));
}
