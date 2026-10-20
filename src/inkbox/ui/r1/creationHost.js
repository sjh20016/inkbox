import { listSlots } from '../../io/save.js';
import { createCreationMenuView } from '../g2/creation/creationMenuView.js';

// This is only a bridge to the existing Sandbox controls. The controls retain
// the QOL discard guard, async busy state, error messages and world replacement.
export function createCreationHost(sandbox, root) {
  let view = null;
  let opener = null;
  let previousSpeed = 0;
  const $ = (id) => document.getElementById(id);

  function slots() {
    const meta = sandbox.qol.slotMeta();
    return listSlots().map(({ slot, bytes, compressed }) => {
      const info = meta[slot];
      const description = [info?.seed != null ? `种子 ${info.seed}` : null,
        info?.day != null ? `仙历 ${Math.floor(info.day / 360) + 1} 年` : null,
        `${Math.round(bytes / 1024)} KB · ${compressed ? '压缩' : '明文'}`].filter(Boolean).join(' · ');
      return { id: slot, label: sandbox.qol.slotLabel(slot), description, available: bytes > 0 };
    });
  }

  function render(syncForm = false, error = '') {
    view?.render({
      canContinue: !!sandbox.world,
      recentWorld: sandbox.world ? { name: `种子 ${sandbox.world.seed >>> 0} · 仙历 ${Math.floor(sandbox.world.day / 360) + 1} 年` } : null,
      ...(syncForm ? {
        seed: sandbox.seed,
        preset: $('inkPresetSelect').value,
        terrainPreset: $('inkTerrainSelect').value,
        progressive: $('inkProgressive').checked,
      } : {}),
      slots: slots(),
      ...(error ? { result: 'stale', error } : {}),
    });
  }

  function close() {
    if (!view) return;
    view.destroy();
    view = null;
    root.hidden = true;
    root.classList.remove('on');
    sandbox.setSpeed(previousSpeed);
    const target = opener?.isConnected && opener !== document.body ? opener : $('inkBtnMenu');
    target?.focus?.({ preventScroll: true });
    opener = null;
  }

  function activate(action) {
    if (action.type === 'refresh-saves') { render(); return; }
    if (action.type === 'request-random-seed') {
      view?.setSeed(Math.floor(Math.random() * 0x100000000) >>> 0);
      return;
    }
    if (action.type === 'continue-game') { close(); return; }
    if (action.type === 'open-help') { close(); sandbox.qol.openHelp(); return; }
    if (action.type === 'create-world') {
      const { preset, seed, terrainPreset, generationVersion, progressive } = action.options;
      $('inkPresetSelect').value = preset;
      $('inkSeedInput').value = String(seed);
      $('inkTerrainSelect').value = generationVersion === 1 ? 'legacy' : terrainPreset;
      $('inkProgressive').checked = progressive;
      close();
      $('inkBtnRegen').click();
      return;
    }
    if (action.type === 'load-save') {
      if (!listSlots().some((slot) => slot.slot === action.slotId && slot.bytes > 0)) {
        render(false, '这份存档已不存在，请重新选择。');
        return;
      }
      const select = $('inkSlotSelect');
      select.value = action.slotId;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      close();
      $('inkBtnLoad').click();
      return;
    }
    if (action.type === 'import-save') { close(); $('inkBtnImport').click(); }
  }

  function open() {
    if (view || sandbox.qol.confirmOpen() ||
      ['inkBtnLoad', 'inkBtnImport', 'inkBtnRegen', 'inkBtnClear'].some((id) => sandbox.qol.isBusy(id))) return;
    sandbox.qol.closeHelp();
    sandbox.render3d?.clearCameraKeys?.();
    opener = document.activeElement;
    previousSpeed = sandbox.speedIndex;
    sandbox.setSpeed(0);
    root.hidden = false;
    root.classList.add('on');
    view = createCreationMenuView(root, { onAction: activate });
    render(true);
    root.querySelector('[role="dialog"]')?.focus({ preventScroll: true });
  }

  root.addEventListener('click', (event) => { if (event.target === root) close(); });
  root.addEventListener('keydown', (event) => {
    if (!view) return;
    if (event.key === 'Escape') {
      event.preventDefault(); event.stopImmediatePropagation(); close(); return;
    }
    if (event.key !== 'Tab') { event.stopImmediatePropagation(); return; }
    event.stopImmediatePropagation();
    const nodes = [...root.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled)')]
      .filter((node) => !node.closest('[hidden]'));
    if (!nodes.length) return;
    const first = nodes[0], last = nodes[nodes.length - 1];
    if (event.shiftKey && (document.activeElement === first || !nodes.includes(document.activeElement))) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && (document.activeElement === last || !nodes.includes(document.activeElement))) {
      event.preventDefault(); first.focus();
    }
  });
  return { open, close, render, isOpen: () => !!view };
}
