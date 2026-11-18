import { canAccess } from '../core/mapAccess.js';
import { spawnFocusPulse } from '../render/overlayLayer.js';

const THEMES = Object.freeze({
  random: '随机机缘：剑冢、丹阁等各有际遇，修士仍须自行寻访。',
  sword: '剑冢：偏重剑道传承。能否取得，仍取决于探索结果与人物已有功法。',
  alchemy: '丹阁：偏重修为与养元。探索可能失败，也可能被别人抢先。',
});
const worlds = new WeakMap();
const element = id => globalThis.document?.getElementById(id);

export function syncOpportunityOptions(sb) {
  const root = element('inkOpportunityOptions');
  if (!root) return;
  root.hidden = !['secret', 'cave'].includes(sb.toolId);
  const select = element('inkOpportunityTheme');
  const label = element('inkOpportunityLabel');
  const note = element('inkOpportunityNote');
  const cave = sb.toolId === 'cave';
  if (!Object.hasOwn(THEMES, sb.opportunityTheme)) sb.opportunityTheme = 'random';
  if (select) { select.value = sb.opportunityTheme; select.hidden = cave; }
  if (label) label.textContent = cave ? '前人遗泽 · 功法传承' : '秘境主题';
  if (note) note.textContent = cave
    ? '洞府留有一份前人传承。修士须自行探索；先取得的人将带走遗泽。'
    : THEMES[sb.opportunityTheme];
  if (worlds.get(sb) !== sb.world) {
    worlds.set(sb, sb.world);
    const status = element('inkOpportunityStatus');
    if (status) status.textContent = '';
  }
}

export function bindOpportunityOptions(sb) {
  const select = element('inkOpportunityTheme');
  if (select) select.onchange = () => {
    sb.opportunityTheme = Object.hasOwn(THEMES, select.value) ? select.value : 'random';
    syncOpportunityOptions(sb);
  };
  syncOpportunityOptions(sb);
}

/** UI follows the actual site returned through the world's official site list. */
export function showOpportunityPlacement(sb, site, message) {
  const status = element('inkOpportunityStatus');
  if (status) status.textContent = message || '此次未能安置机缘';
  if (!site || !canAccess(sb.world, site.x, site.y)) return;
  sb.selected = { x: site.x, y: site.y };
  sb.environmentObservation?.select({ plane: 'mortal', x: site.x, y: site.y });
  sb.inspectPlaneSubject('mortal', { kind: 'site', siteId: site.id });
  if (sb.render3d?.active) sb.render3d.renderer.focusOn(site.x, site.y, { duration: .6 }, 'mortal');
  else sb.camera?.focusOn(site.x, site.y, { zoom: Math.max(sb.camera.zoom, 5), duration: .6 });
  spawnFocusPulse(sb.focusPulses, site.x, site.y);
  sb.refreshChronicle?.();
}
