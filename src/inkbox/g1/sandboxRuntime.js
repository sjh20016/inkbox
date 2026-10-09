import { createCharacterController, resolveCharacter, summarizeCharacterObservation } from './characterRuntime.js';
import { canAccess } from '../core/mapAccess.js';
import { UnitsLayer } from '../render/unitsLayer.js';
import { spawnFocusPulse } from '../render/overlayLayer.js';

// Candidates retain source references: delayed choices cannot target a replacement.
export function canvasCharacterCandidates(sb, sx, sy, plane = 'mortal', radius = 19) {
  if (!sb.world || !sb.camera || !Number.isFinite(sx) || !Number.isFinite(sy)) return [];
  const world = plane === 'mortal' ? sb.world : sb.world[plane];
  if (!world) return [];
  const view = sb.getRealmViewState?.();
  const inWindow = !!(view?.open && view.region?.contains(sb.camera.toWorldX(sx), sb.camera.toWorldY(sy)));
  if (plane === 'mortal' ? inWindow : !inWindow || view?.targetPlane !== plane) return [];
  const candidates = [];
  for (const entity of world.entities || []) {
    if (!entity || !(entity.hp > 0) || !['human', 'cultivator', 'ghost'].includes(entity.sp)
      || !Number.isSafeInteger(entity.id) || entity.id <= 0 || !canAccess(sb.world, entity.x, entity.y)) continue;
    const index = world.idx(Math.floor(entity.x), Math.floor(entity.y));
    const [x, y] = UnitsLayer.project(sb.camera, entity.x, entity.y, world.height[index] || 0);
    const distance = Math.hypot(x - sx, y - sy);
    if (distance <= radius) candidates.push({ key: plane + ':' + entity.id, id: entity.id, plane,
      name: entity.name || '无名', distance, entity, world: sb.world });
  }
  return candidates.sort((a, b) => a.distance - b.distance || a.id - b.id);
}

export function createSandboxCharacterRuntime(sb, views = {}) {
  const controller = createCharacterController({ getWorld: () => sb.world });
  let token = null, revision = 0, rendered = '', observationSince = null;
  function draw(force = false) {
    const model = controller.current();
    if (!model) return;
    const text = JSON.stringify(model);
    if (!force && text === rendered) return;
    rendered = text;
    const expectedToken = token, expectedRevision = revision;
    views.render?.(sb, model, action => dispatch(action, expectedToken, expectedRevision));
  }
  function open(keyOrPick, { focus = false, sinceDay = null } = {}) {
    const result = controller.select(keyOrPick);
    if (!result.ok) { close(); sb.notify?.(result.message || '此人已不在当前名录', 2600); return result; }
    token = result.token; revision += 1; rendered = '';
    observationSince = Number.isFinite(sinceDay) ? sinceDay : null;
    sb.personOpenId = result.viewModel.identity.plane === 'mortal' ? result.viewModel.identity.id : null;
    draw(true);
    if (focus && result.viewModel.identity.canFocus) dispatch({ type: 'focus', targetKey: result.viewModel.identity.key });
    sb.qol?.noteRecent({ key: result.viewModel.identity.key, kind: 'person', id: result.viewModel.identity.id,
      name: result.viewModel.identity.name, plane: result.viewModel.identity.plane });
    sb.refreshRecent?.();
    return result;
  }
  function dispatch(action, expectedToken = token, expectedRevision = revision) {
    if (!expectedToken || expectedToken !== token || expectedRevision !== revision)
      return { ok: false, reason: 'stale-selection', message: '人物选择已失效' };
    const result = controller.handleAction(action);
    if (!result.ok) { sb.notify?.(result.message || '此操作当前不可用', 2600); refresh(); return result; }
    const effect = result.effect;
    if (effect?.type === 'focus') {
      if (sb.render3d?.active) sb.render3d.renderer.focusOn(effect.x, effect.y, { duration: 0.75 }, effect.plane);
      else sb.camera?.focusOn(effect.x, effect.y, { zoom: Math.max(sb.camera.zoom, 7), duration: 0.75 });
      if (effect.plane === 'mortal') spawnFocusPulse(sb.focusPulses, effect.x, effect.y);
      sb.dirty = true;
    } else if (effect?.type === 'export') sb.downloadText?.(effect.filename, effect.text);
    else if (effect?.type === 'show-relations') views.relations?.(sb, effect);
    if (action.type === 'close') { close(); return result; }
    if (action.type === 'watch') { sb.qol?.markDirty('watch'); sb.refreshWatch?.(); }
    if (action.type === 'edict') {
      sb.qol?.markDirty('intervention');
      sb.refreshChronicle?.(); sb.refreshWatch?.(); sb.refreshNotables?.();
    }
    if (action.type === 'edict' || action.type === 'watch') sb.notify?.(result.message || '已落笔', 2600);
    draw();
    return result;
  }
  function refresh() {
    const model = controller.refresh();
    if (!model) { if (token) close(); return null; }
    draw();
    return model;
  }
  function close() {
    controller.close(); token = null; revision += 1; rendered = ''; observationSince = null;
    views.hide?.(sb); sb.personOpenId = null;
  }
  function choose(candidate) {
    if (!candidate) return { ok: false, reason: 'invalid-candidate' };
    const now = resolveCharacter(sb.world, candidate.key);
    if (candidate.world !== sb.world || now?.entity !== candidate.entity) {
      sb.notify?.('人物选择已失效', 2600); return { ok: false, reason: 'stale-selection' };
    }
    return open(candidate.key);
  }
  function inspectCanvas(sx, sy, plane = 'mortal') {
    const candidates = canvasCharacterCandidates(sb, sx, sy, plane);
    if (!candidates.length) return false;
    if (candidates.length === 1) choose(candidates[0]);
    else views.candidates?.(sb, candidates, choose);
    return true;
  }
  return { open, dispatch, refresh, close, reset: close, inspectCanvas, choose,
    current: () => controller.current(), resolve: key => resolveCharacter(sb.world, key),
    summary: () => token && observationSince !== null ? summarizeCharacterObservation(sb.world, token, observationSince) : null,
    destroy() { close(); controller.destroy(); } };
}
