import { observeEnvironment, findCurrentFires, compareEnvironment } from './environmentObservation.js';
import { accessBounds } from '../core/mapAccess.js';
import { createEnvironmentObserverView } from '../ui/g2/environment/environmentObserverView.js';

const freeze = value => {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
};
const sourceFor = (world, plane) => plane === 'mortal' ? world : world?.[plane];
const buffers = source => ['fire', 'veg', 'over', 'type'].map(field => source?.[field]);
const sameArea = (a, b) => a?.location && b?.location && a.plane === b.plane && a.location.x === b.location.x
  && a.location.y === b.location.y && a.radius === b.radius;

/** Terrain masks test cell centers; access bounds refer to integer cell indices. */
export function createEnvironmentVisibility(sb, view = sb.getRealmViewState?.(),
  bounds = sb.world ? accessBounds(sb.world) : null) {
  const world = sb.world;
  const active = sb.render3d?.active ? sb.render3d.renderer?.activePlane || 'mortal' : 'mortal';
  return (plane, x, y) => {
    const source = sourceFor(world, plane);
    if (!source || !bounds || !Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0
      || x >= source.w || y >= source.h || x < bounds.x0 || y < bounds.y0 || x > bounds.x1 || y > bounds.y1) return false;
    if (active !== 'mortal') return plane === active;
    const inWindow = !!(view?.open && view.region?.contains(x + .5, y + .5));
    return plane === 'mortal' ? !inWindow : inWindow && view.targetPlane === plane;
  };
}
export const environmentPointVisible = (sb, plane, x, y) => createEnvironmentVisibility(sb)(plane, x, y);

/** One bounded session baseline. Tokens bind actions to World, source and access context. */
export function createEnvironmentObservationRuntime({ getWorld, getContext = () => ({}),
  isVisible = () => false, onFocus = () => {}, view } = {}) {
  let world, context, epoch = 0, sequence = 0, selected = null, baseline = null;
  let findings = new Map(), search = null, vm = null, rendered = '', destroyed = false, message = '', invalidationNotice = '';
  function contextMatches(next) { return context?.key === next?.key && context?.region === next?.region; }
  function publish(observation = null, comparison = null) {
    vm = freeze({ schemaVersion: 1, contextId: `environment-context-${epoch}`, observationId: selected?.id || null,
      observation, comparison, baselineDay: baseline?.observation.day ?? null, message,
      canFocus: !!observation?.ok, search });
    const text = JSON.stringify(vm);
    if (text !== rendered) { rendered = text; view?.render(vm); }
    return vm;
  }
  function reset(reason = 'world-replaced') {
    if (destroyed) return null;
    const hadObservation = !!selected || !!baseline || !!findings.size;
    world = getWorld?.(); context = getContext(); epoch++; selected = null; baseline = null;
    findings.clear(); search = null;
    if (hadObservation) invalidationNotice = reason === 'access-changed'
      ? '位面或访问范围已变化，会话对照已清除；请重新检视。'
      : '世界已替换，会话对照已清除；它未作为长期史料存档。';
    // Load also closes the old Region. Preserve the explanation across that
    // second context reset until the player starts a fresh observation.
    message = invalidationNotice;
    return publish();
  }
  function sync() {
    if (world !== getWorld?.()) reset();
    else if (!contextMatches(getContext())) reset('access-changed');
  }
  function bind(observation) {
    const source = sourceFor(world, observation.plane);
    return { id: `environment-${epoch}-${++sequence}`, epoch, world, source, buffers: buffers(source),
      w: source.w, h: source.h, plane: observation.plane, x: observation.location.x,
      y: observation.location.y, radius: observation.radius };
  }
  function valid(binding) {
    const source = sourceFor(world, binding?.plane);
    return !!binding && binding.epoch === epoch && binding.world === world && binding.source === source
      && binding.w === source?.w && binding.h === source?.h
      && buffers(source).every((buffer, i) => buffer === binding.buffers[i])
      && isVisible(binding.plane, binding.x, binding.y);
  }
  function read(binding) {
    return observeEnvironment(world, { plane: binding.plane, x: binding.x, y: binding.y,
      radius: binding.radius, isVisible });
  }
  function refresh() {
    if (destroyed) return null;
    sync();
    if ([...findings.values()].some(binding => !valid(binding))) {
      findings.clear(); search = null; message = '上次火情查找已失效，请重新查找。';
    }
    if (!selected) return publish();
    if (!valid(selected)) {
      selected = null; baseline = null; findings.clear(); search = null;
      message = '原观察位置或地表已不可考，会话对照已清除。';
      return publish();
    }
    const observation = read(selected);
    if (!observation.ok) { selected = null; baseline = null; return publish(observation); }
    // A baseline never follows coordinate reuse across World/source replacement.
    const comparison = baseline && valid(baseline.binding)
      ? compareEnvironment(baseline.observation, observation) : null;
    return publish(observation, comparison);
  }
  function select({ plane = 'mortal', x, y, radius = 3 } = {}) {
    if (destroyed) return { ok: false, reason: 'destroyed' };
    sync();
    const observation = observeEnvironment(world, { plane, x, y, radius, isVisible });
    if (!observation.ok) return { ok: false, reason: observation.reason, observation };
    invalidationNotice = '';
    if (!sameArea(vm?.observation, observation) || !valid(selected)) selected = bind(observation);
    if (baseline && (!sameArea(baseline.observation, observation) || !valid(baseline.binding))) {
      baseline = null; message = '观察地点已变化，请在此地重新记下基线。';
    } else message = '';
    refresh();
    return { ok: true, observationId: selected.id };
  }
  function handleAction(action) {
    if (destroyed) return { ok: false, reason: 'destroyed' };
    sync();
    if (!action || action.contextId !== `environment-context-${epoch}`)
      return { ok: false, reason: 'stale-context' };
    if (action.type === 'find-fires') {
      invalidationNotice = '';
      const result = findCurrentFires(world, { plane: context?.plane || 'mortal', isVisible });
      findings.clear();
      const items = result.items.map(item => {
        const binding = bind({ ...item, radius: 3 }); findings.set(binding.id, binding);
        return { ...item, id: binding.id };
      });
      search = freeze({ ...result, items });
      message = items.length ? `本次查找发现可观察火情 ${items.length} 处${result.truncated ? '（结果已达上限）' : ''}。`
        : (result.fireSupported === false ? '该位面未运行正式火灾机制。' : '当前可观察范围未找到火情；这不说明过去从未起火。');
      refresh(); return { ok: result.ok, search };
    }
    if (action.type === 'observe-fire') {
      const finding = findings.get(action.observationId);
      // Recheck the actual live cell; a search result is not a lasting permission.
      if (!valid(finding)) return { ok: false, reason: 'stale-or-inaccessible-area' };
      const current = observeEnvironment(world, { plane: finding.plane, x: finding.x, y: finding.y,
        radius: 0, isVisible });
      if (!current.ok || !(current.environment.activeFireCells > 0))
        return { ok: false, reason: 'fire-no-longer-active' };
      const result = select(finding);
      if (result.ok) onFocus({ plane: selected.plane, x: selected.x, y: selected.y });
      return result;
    }
    if (!selected || action.observationId !== selected.id || !valid(selected))
      return { ok: false, reason: 'stale-or-inaccessible-area' };
    if (action.type === 'record-baseline') {
      const observation = read(selected);
      if (!observation.ok) return { ok: false, reason: observation.reason };
      if (!Number.isFinite(observation.day)) return { ok: false, reason: 'unknown-day' };
      baseline = { binding: selected, observation };
      message = '已记下此刻；只作本次会话前后对照，不推断起火者。';
      refresh(); return { ok: true, day: observation.day };
    }
    if (action.type === 'read-area') { refresh(); return { ok: !!vm.observation?.ok }; }
    if (action.type === 'focus-area') {
      const observation = read(selected);
      if (!observation.ok) return { ok: false, reason: observation.reason };
      const effect = { type: 'focus', plane: selected.plane, x: selected.x, y: selected.y };
      onFocus(effect); return { ok: true, effect };
    }
    return { ok: false, reason: 'invalid-action' };
  }
  reset();
  return { select, refresh, reset, handleAction, current() { if (destroyed) return null; sync(); return vm; },
    destroy() { if (destroyed) return; selected = null; baseline = null; findings.clear(); destroyed = true; view?.destroy(); } };
}

export function createSandboxEnvironmentObservation(sb, root) {
  let runtime, visible = () => false;
  const view = root ? createEnvironmentObserverView(root, { onAction: action => {
    const result = runtime.handleAction(action);
    if (!result.ok) {
      runtime.refresh();
      sb.notify?.('这次观察请求已失效或位置不可访问，请重新检视或查找火情。', 2600);
    }
    return result;
  } }) : null;
  runtime = createEnvironmentObservationRuntime({ getWorld: () => sb.world, view,
    isVisible: (plane, x, y) => visible(plane, x, y),
    getContext: () => {
      const view = sb.getRealmViewState?.(), plane = sb.render3d?.active ? sb.render3d.renderer?.activePlane || 'mortal' : 'mortal';
      const bounds = sb.world ? accessBounds(sb.world) : null;
      visible = createEnvironmentVisibility(sb, view, bounds);
      return { key: JSON.stringify([plane, bounds, !!view?.open, view?.targetPlane]), plane,
        region: view?.open ? view.region : null };
    },
    onFocus: ({ plane, x, y }) => {
      if (sb.render3d?.active) sb.render3d.renderer.focusOn(x, y, { duration: .75 }, plane);
      else sb.camera.focusOn(x, y, { zoom: Math.max(sb.camera.zoom, 7), duration: .75 });
      sb.dirty = true;
    } });
  return runtime;
}
