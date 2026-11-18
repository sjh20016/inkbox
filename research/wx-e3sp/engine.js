// Isolated research authority. No World or iterator is returned by this module.
// Fixed dt=3 is L2 relative to the variable-dt product, NOT FOR PRODUCTION.
import { TIME } from '../../src/inkbox/core/config.js';
import { advanceWorld, advanceWorldPhases } from '../../src/inkbox/sim/advance.js';
import { manageCommittedWorlds, beginCompleteStep, publishCompleteStep, abortCompleteStep,
  getCommittedFrame, getCommittedQuery, disposeCommittedWorlds } from '../../src/inkbox/presentation/readView/committedStore.js';
import { CommandBridge } from '../../src/inkbox/presentation/readView/commandBridge.js';
import { peekRuntimeEvents, drainRuntimeEvents, runtimeEventStats } from '../../src/inkbox/core/runtimeEvents.js';
import { readPersonStories, readObjectStories } from '../../src/inkbox/wanxiang/storyReading.js';
import { restoreResearchContext, captureResearchSave } from './context.js';
import { executeResearchCommand } from './commandPort.js';

export const RESEARCH_BASE_SHA = '37e3b1a64aedc921012fadb2b92668787d0fd3ac';
export const RESEARCH_DT = 3;
const planes = ['mortal', 'upper', 'nether'];
function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype)
      throw new TypeError('Research projection must contain only plain data');
    for (const item of Object.values(value)) freeze(item);
    Object.freeze(value);
  }
  return value;
}
function copy(value) { return JSON.parse(JSON.stringify(value)); }
async function sha256(text) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
}
const faultError = reason => new Error('Research authority unavailable: ' + reason);

export async function createResumableSimulation(checkpoint, options = {}) {
  const mode = options.mode || 'cooperative';
  if (!['cooperative', 'sync'].includes(mode)) throw new TypeError('Unknown research mode');
  const clock = options.clock || (() => performance.now());
  const capacity = options.metricCapacity || 250000, ledgerLimit = options.ledgerLimit || 4096;
  const eventCapacity = options.eventCapacity || 4096;
  let initial = typeof checkpoint === 'string' ? checkpoint : JSON.stringify(checkpoint);
  let initialHash = await sha256(initial), ctx, bridge, front, publicFront, replaying = false, iterator = null, state = 'IDLE', phase = 'idle';
  let running = false, paused = false, speed = 0, targetDay, anchorTarget, anchorWall = null;
  let nextSeq = 1, commits = 0, commandCommits = 0, fault = null, injection = null, stepRift = false, riftActive = options.riftActive ?? true;
  let controlEpoch = 0, acknowledgedSequence = -1;
  let ledger = [], pending = [], waiters = new Map(), atomicSamples = [], slices = [], dropped = 0;
  let totalCpuMs = 0, atomicMaxMs = 0, restoreCalls = 0, fullSaveCalls = 0, sliceCalls = 0;

  function worldFor(plane) { return plane === 'mortal' ? ctx.world : ctx.world[plane]; }
  function record(phaseName, start, token = {}) {
    const durationMs = clock() - start;
    atomicMaxMs = Math.max(atomicMaxMs, durationMs);
    const row = Object.freeze({ phase: phaseName, durationMs, ...token });
    if (atomicSamples.length < capacity) atomicSamples.push(row); else dropped++;
    return durationMs;
  }
  function prepareFront(receipts = front?.receipts || [], resetEvents = false) {
    const frames = {}, queries = {}, events = resetEvents ? [] : [...(front?.events || [])], eventStats = {};
    for (const plane of planes) {
      const world = worldFor(plane); if (!world) continue;
      const frame = getCommittedFrame(world), query = getCommittedQuery(world);
      frames[plane] = Object.freeze({ ...frame, geometry: Object.freeze({ ...frame.geometry,
        generation: Object.freeze({ version: world.generation?.version ?? 1 }) }) });
      queries[plane] = freeze({ ...query, entities: query.entities.map((entity, index) => ({ ...entity,
        storyRef: { kind: 'person', plane, id: entity.entityId,
          incarnation: world.entities[index].incarnation ?? 1,
          identitySince: world.entities[index].possessedBy?.day ?? null } })) });
      eventStats[plane] = copy(runtimeEventStats(world));
      if (frame.commitSequence > acknowledgedSequence) for (const [index, event] of peekRuntimeEvents(world).entries())
        events.push({ deliveryId: `${frame.worldGeneration}:${frame.commitSequence}:${plane}:${index}`,
          worldGeneration: frame.worldGeneration, commitSequence: frame.commitSequence, plane, event: copy(event) });
    }
    if (events.length > eventCapacity) throw new Error('Committed event queue full; acknowledge consumed packets before resuming');
    return freeze({ frames, queries, events, eventStats, receipts: receipts.slice(-128) });
  }
  function consumeEvents() { for (const plane of planes) { const world = worldFor(plane); if (world) drainRuntimeEvents(world); } }
  function open(saved) {
    ctx = restoreResearchContext(saved); restoreCalls++;
    manageCommittedWorlds(ctx.world); bridge = new CommandBridge(() => ctx.world);
    const candidate = prepareFront([], true); consumeEvents(); return candidate;
  }
  front = open(initial); publicFront = front; targetDay = anchorTarget = front.frames.mortal.committedDay;

  function status() {
    const frame = publicFront.frames.mortal, inFlightDays = iterator ? RESEARCH_DT : 0;
    const lagDays = Math.max(0, targetDay - frame.committedDay);
    return Object.freeze({ state, phase, paused, speed, mode, dtDays: RESEARCH_DT,
      committedDay: frame.committedDay, targetDay, lagDays, queuedDays: Math.max(0, lagDays - inFlightDays),
      notStartedDays: Math.max(0, lagDays - inFlightDays), inFlightDays,
      worldGeneration: frame.worldGeneration, commitSequence: frame.commitSequence,
      queueLength: pending.length, nextCommandSeq: nextSeq, commits, commandCommits,
      atomicMaxMs, totalCpuMs, restoreCalls, fullSaveCalls, normalStepRestores: 0, normalStepFullSaves: 0,
      ledgerEntries: ledger.length, initialCheckpointSha256: initialHash, fault });
  }
  function unavailable() { return ['FAULT', 'DISPOSED', 'RECOVERING', 'REPLACING'].includes(state); }
  function rejectPending(reason) {
    const error = faultError(reason);
    for (const op of pending) op.reject?.(error);
    pending = [];
    for (const entries of waiters.values()) for (const entry of entries) entry.reject(error);
    waiters.clear();
  }
  function closeIterator() {
    const active = iterator; iterator = null;
    if (active) active.return();
  }
  function fail(error) {
    try { closeIterator(); } catch (cleanupError) { error = new AggregateError([error, cleanupError], 'Research iterator cleanup failed'); }
    try { abortCompleteStep(ctx.world); } catch { /* a replaced/disposed authority is already closed */ }
    state = 'FAULT'; phase = 'fault'; paused = true;
    fault = String(error?.message || error); rejectPending(fault);
  }
  function checkLedger() { if (ledger.length >= ledgerLimit) throw new Error('Recovery ledger full; save at a complete boundary and explicitly replace the session'); }
  function stageAfter(token) {
    phase = token.phase;
    if (phase === 'life.entity') state = 'ENTITY_LOOP';
    else if (phase === 'life.sweep') state = 'SWEEP';
    else if (phase.startsWith('life.') && phase !== 'life.prepare') state = 'POST_LIFE';
    else if (phase.startsWith('advance.') && !['advance.day', 'advance.epoch', 'advance.day-epoch', 'advance.wanling'].includes(phase)) state = 'OTHER_CLOCKS';
    else state = 'PREPARE';
  }
  function maybeInject(token) {
    if (injection?.entityFraction != null && token.phase === 'life.entity'
      && token.entityIndex >= Math.ceil(token.entityCount * injection.entityFraction)) {
      const detail = `${token.entityIndex}/${token.entityCount}`; injection = null;
      throw new Error('Injected real entity-loop fault at ' + detail);
    }
  }
  function publishStep() {
    state = 'COMMIT'; phase = 'commit';
    publishCompleteStep(ctx.world);
    if (injection?.commitPhase === 'after-store') { injection = null; throw new Error('Injected failure after private store publication'); }
    const candidate = prepareFront();
    const entry = Object.freeze({ kind: 'step', days: RESEARCH_DT, riftActive: stepRift });
    consumeEvents(); ledger.push(entry); front = publicFront = candidate; commits++;
    iterator = null; state = 'IDLE'; phase = 'idle';
  }
  function executeCommand(op, replay = false) {
    const execution = bridge.create(op.command.type, op.command.payload);
    const result = bridge.dispatch(execution, () => executeResearchCommand(ctx, op.command));
    if (!result.ok) throw new Error('Private command admission failed: ' + result.reason);
    const completed = getCommittedFrame(ctx.world);
    const native = copy(result.value);
    if (replay && op.receipt && JSON.stringify(native) !== JSON.stringify(op.receipt.native))
      throw new Error('Recovery command receipt differs from the committed ledger');
    const receipt = replay && op.receipt ? op.receipt : freeze({ ok: true, seq: op.command.seq, type: op.command.type,
      worldGeneration: completed.worldGeneration, issuedAtCommittedDay: op.command.issuedAtCommittedDay,
      committedDay: completed.committedDay, commitSequence: completed.commitSequence,
      issuedAtMs: op.issuedAtMs, authorityAtMs: clock(), responseMs: Math.max(0, clock() - op.issuedAtMs),
      native });
    const candidate = prepareFront([...(front?.receipts || []), receipt]);
    consumeEvents();
    if (!replay) ledger.push(Object.freeze({ kind: 'command', command: op.command, issuedAtMs: op.issuedAtMs, receipt }));
    front = candidate; if (!replaying) publicFront = candidate; commandCommits++;
    for (const waiter of waiters.get(receipt.seq) || []) waiter.resolve(receipt);
    waiters.delete(receipt.seq);
  }
  function boundaryOperation(op) {
    if (op.kind === 'command') { checkLedger(); executeCommand(op); return; }
    if (op.kind === 'save') { fullSaveCalls++; op.resolve(captureResearchSave(ctx)); return; }
    if (op.kind === 'story') {
      if (op.generation !== front.frames.mortal.worldGeneration) { op.reject(faultError('stale-world')); return; }
      const value = op.ref?.kind === 'person' ? readPersonStories(ctx.world, op.ref) : readObjectStories(ctx.world, op.ref);
      op.resolve(freeze(copy(value)));
    }
  }
  function startStep() {
    checkLedger(); state = 'PREPARE'; phase = 'prepare'; stepRift = riftActive;
    beginCompleteStep(ctx.world);
    if (mode === 'cooperative') iterator = advanceWorldPhases(ctx.world, RESEARCH_DT,
      { ...ctx, riftActive: stepRift }, { cooperative: true });
    else iterator = (function* () { const result = advanceWorld(ctx.world, RESEARCH_DT, { ...ctx, riftActive: stepRift }); yield { phase: 'sync.step' }; return result; })();
  }
  function runSlice({ budgetMs = options.budgetMs || 6, maxAtoms = Infinity, maxStarts = 1 } = {}) {
    if (running) throw new Error('Reentrant research slice');
    if (unavailable()) return status();
    if (!(budgetMs > 0) || !(maxAtoms >= 1) || (!Number.isInteger(maxAtoms) && maxAtoms !== Infinity)
      || !Number.isInteger(maxStarts) || maxStarts < 0 || maxStarts > 1)
      throw new TypeError('Invalid bounded slice budget');
    const start = clock(); let atoms = 0, starts = 0, operations = 0; running = true;
    try {
      while (atoms < maxAtoms && clock() - start < budgetMs) {
        if (!iterator) {
          if (pending.length && operations < 4) {
            const op = pending.shift(), a = clock();
            try { boundaryOperation(op); } catch (error) { op.reject?.(error); throw error; }
            record('boundary.' + op.kind, a); atoms++; operations++; continue;
          }
          if (pending.length || paused || starts >= maxStarts || targetDay - front.frames.mortal.committedDay < RESEARCH_DT - 1e-8) break;
          startStep(); starts++;
        }
        const a = clock(); let result;
        try { result = iterator.next(); } catch (error) { record('atomic.throw', a); throw error; }
        atoms++;
        if (result.done) { record('advance.complete', a); const c = clock(); publishStep(); record('commit.projection', c); }
        else { const token = result.value; record(token.phase, a, token); stageAfter(token); maybeInject(token); }
      }
    } catch (error) { fail(error); }
    finally {
      const durationMs = clock() - start; totalCpuMs += durationMs; sliceCalls++;
      if (slices.length < 20000) slices.push(Object.freeze({ durationMs, atomicCalls: atoms, starts, state,
        committedDay: front.frames.mortal.committedDay, targetDay })); else dropped++;
      running = false;
    }
    return status();
  }
  function tick(now = clock()) {
    if (!Number.isFinite(now)) throw new TypeError('Finite wall time required');
    if (anchorWall === null) { anchorWall = now; anchorTarget = targetDay; }
    if (now < anchorWall) throw new TypeError('Wall clock moved backwards');
    if (!paused && !unavailable()) targetDay = Math.max(targetDay, anchorTarget + speed * TIME.baseDaysPerSecond * (now - anchorWall) / 1000);
    return status();
  }
  function setSpeed(mult, now = clock()) {
    if (!Number.isFinite(mult) || mult < 0 || mult > 20) throw new TypeError('Invalid research speed');
    tick(now); speed = mult; paused = mult === 0; anchorTarget = targetDay; anchorWall = now; return status();
  }
  function submit(command) {
    if (unavailable()) return Object.freeze({ ok: false, reason: 'world-unavailable' });
    const frame = publicFront.frames.mortal;
    if (command?.worldGeneration !== frame.worldGeneration) return Object.freeze({ ok: false, reason: 'stale-world' });
    if (command.schemaVersion !== 1 || !['power', 'terrain-stroke', 'undo'].includes(command.type)) return Object.freeze({ ok: false, reason: 'invalid-command' });
    if (command.seq !== nextSeq) return Object.freeze({ ok: false, reason: 'out-of-order' });
    if (command.issuedAtCommittedDay !== frame.committedDay) return Object.freeze({ ok: false, reason: 'stale-commit' });
    if (pending.length >= 64) return Object.freeze({ ok: false, reason: 'queue-full' });
    let data; try { data = freeze(copy(command)); } catch { return Object.freeze({ ok: false, reason: 'invalid-command' }); }
    pending.push({ kind: 'command', command: data, issuedAtMs: clock() }); nextSeq++;
    return Object.freeze({ ok: true, seq: data.seq, worldGeneration: frame.worldGeneration });
  }
  function enqueueQuery(kind, values = {}) {
    if (unavailable()) return Promise.reject(faultError(state));
    if (pending.length >= 64) return Promise.reject(faultError('queue-full'));
    return new Promise((resolve, reject) => { pending.push({ kind, ...values, resolve, reject }); });
  }
  async function recover() {
    if (running || ['DISPOSED', 'RECOVERING', 'REPLACING'].includes(state)) throw faultError(state);
    const epoch = ++controlEpoch;
    closeIterator(); rejectPending('recovering'); state = 'RECOVERING'; paused = true;
    const retained = publicFront, oldLedger = ledger.slice(); replaying = true;
    try {
      const hash = await sha256(initial);
      if (epoch !== controlEpoch || state !== 'RECOVERING') throw faultError('stale-control');
      if (hash !== initialHash) throw new Error('Initial checkpoint integrity failure');
      try { disposeCommittedWorlds(ctx.world); } catch { /* prior failed initialization */ }
      front = open(initial); commits = 0; commandCommits = 0;
      for (const entry of oldLedger) {
        if (entry.kind === 'step') {
          beginCompleteStep(ctx.world); advanceWorld(ctx.world, entry.days, { ...ctx, riftActive: entry.riftActive });
          publishCompleteStep(ctx.world); const candidate = prepareFront(); consumeEvents(); front = candidate; commits++;
        } else executeCommand(entry, true);
      }
      ledger = oldLedger; nextSeq = oldLedger.filter(e => e.kind === 'command').length + 1;
      publicFront = front; replaying = false;
      fault = null; state = 'IDLE'; phase = 'idle'; injection = null;
      anchorTarget = targetDay; anchorWall = clock();
      return status();
    } catch (error) {
      if (epoch !== controlEpoch || state === 'DISPOSED') throw error;
      front = publicFront = retained; replaying = false; fail(error); throw error;
    }
  }
  async function replace(saved) {
    if (running || ['DISPOSED', 'RECOVERING', 'REPLACING'].includes(state)) throw faultError(state);
    const epoch = ++controlEpoch;
    closeIterator(); rejectPending('world-replaced'); state = 'REPLACING'; paused = true;
    const retained = publicFront, retainedAck = acknowledgedSequence;
    try {
      const data = typeof saved === 'string' ? saved : JSON.stringify(saved), hash = await sha256(data);
      if (epoch !== controlEpoch || state !== 'REPLACING') throw faultError('stale-control');
      try { disposeCommittedWorlds(ctx.world); } catch { /* prior failed initialization */ }
      acknowledgedSequence = -1;
      front = open(data); initial = data; initialHash = hash; ledger = []; nextSeq = 1;
      publicFront = front;
      targetDay = anchorTarget = front.frames.mortal.committedDay; anchorWall = clock();
      commits = commandCommits = 0; fault = null; injection = null; state = 'IDLE'; phase = 'idle';
      return status();
    } catch (error) {
      if (epoch !== controlEpoch || state === 'DISPOSED') throw error;
      acknowledgedSequence = retainedAck; front = publicFront = retained; fail(error); throw error;
    }
  }
  return Object.freeze({
    getFrame: (plane = 'mortal') => publicFront.frames[plane] || null,
    getQuery: (plane = 'mortal') => publicFront.queries[plane] || null,
    getEvents: () => publicFront.events, getReceipts: () => publicFront.receipts, getStatus: status,
    ackEvents(sequence, generation = publicFront.frames.mortal.worldGeneration) {
      const f = publicFront.frames.mortal;
      if (generation !== f.worldGeneration || !Number.isSafeInteger(sequence) || sequence < 0 || sequence > f.commitSequence) return false;
      acknowledgedSequence = Math.max(acknowledgedSequence, sequence);
      const candidate = freeze({ ...publicFront, events: publicFront.events.filter(e => e.commitSequence > acknowledgedSequence) });
      publicFront = candidate; if (!replaying) front = candidate;
      return true;
    },
    runSlice, tick, setSpeed, submit, recover, replace,
    setTargetDay(day) {
      if (unavailable()) throw faultError(state);
      if (!Number.isFinite(day) || day < targetDay) throw new TypeError('Target watermark cannot discard pending days');
      targetDay = anchorTarget = day; anchorWall = clock(); return status();
    },
    pause: (now = clock()) => setSpeed(0, now), resume: (mult = 2, now = clock()) => setSpeed(mult, now),
    setRiftActive(value) { riftActive = !!value; },
    requestSave: () => enqueueQuery('save'),
    readStories: (ref, generation = publicFront.frames.mortal.worldGeneration) => enqueueQuery('story', { ref: freeze(copy(ref)), generation }),
    waitForReceipt(seq) {
      const found = publicFront.receipts.find(r => r.seq === seq && r.worldGeneration === publicFront.frames.mortal.worldGeneration);
      if (found) return Promise.resolve(found);
      if (unavailable()) return Promise.reject(faultError(state));
      if (!pending.some(op => op.kind === 'command' && op.command.seq === seq)) return Promise.reject(faultError('unknown-or-expired-sequence'));
      if ((waiters.get(seq)?.length || 0) >= 4) return Promise.reject(faultError('too-many-waiters'));
      return new Promise((resolve, reject) => { const list = waiters.get(seq) || []; list.push({ resolve, reject }); waiters.set(seq, list); });
    },
    injectFault(config) {
      if (config?.entityFraction != null && ![.3, .7].includes(config.entityFraction)) throw new TypeError('Only audited 30%/70% entity faults');
      if (config?.commitPhase != null && config.commitPhase !== 'after-store') throw new TypeError('Unknown commit fault');
      injection = freeze(copy(config));
    },
    cancel() { if (!unavailable()) fail(new Error('Cancelled in-flight draft; explicit verified recovery required')); return status(); },
    getMetrics: () => Object.freeze({ atomicSamples: Object.freeze(atomicSamples.slice()), slices: Object.freeze(slices.slice()),
      dropped, atomicMaxMs, totalCpuMs, sliceCalls, restoreCalls, fullSaveCalls, normalStepRestores: 0, normalStepFullSaves: 0 }),
    resetMetrics() { atomicSamples = []; slices = []; dropped = 0; atomicMaxMs = totalCpuMs = sliceCalls = 0; },
    dispose() {
      if (state === 'DISPOSED') return;
      controlEpoch++;
      try { closeIterator(); } finally {
        rejectPending('disposed');
        try { disposeCommittedWorlds(ctx.world); } finally { state = 'DISPOSED'; phase = 'disposed'; }
      }
    },
  });
}
