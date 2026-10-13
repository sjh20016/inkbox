const PLANE_LABEL = { mortal: '凡间', upper: '上界', nether: '幽冥' };
const STATE_LABEL = { 'has-fire': '有火势', scorched: '留有焦土', ash: '余烬未尽', clear: '当前无明显灾迹', unknown: '不可考' };
const percent = value => Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : '不可考';
const count = value => Number.isFinite(value) ? `${value} 格` : '不可考';
const signed = value => Number.isFinite(value) ? `${value > 0 ? '+' : ''}${value}` : '不可考';
function node(doc, tag, cls, text) {
  const element = doc.createElement(tag); if (cls) element.className = cls;
  if (text !== undefined) element.textContent = text; return element;
}
function update(element, text) { if (element.textContent !== text) element.textContent = text; }

/** Fact-only compact surface inside the existing rail. All commands carry host-issued IDs. */
export function createEnvironmentObserverView(root, { onAction } = {}) {
  const doc = root.ownerDocument, frame = node(doc, 'section', 'g23-environment');
  frame.setAttribute('aria-label', '山河有痕');
  const heading = node(doc, 'h3', '', '山河有痕'), location = node(doc, 'p', 'g23-environment__location');
  const status = node(doc, 'p', 'g23-environment__status'), facts = node(doc, 'p', 'g23-environment__facts');
  const comparison = node(doc, 'p', 'g23-environment__comparison'), message = node(doc, 'p', 'g23-environment__message');
  message.setAttribute('role', 'status');
  const actions = node(doc, 'div', 'g23-environment__actions');
  const buttons = new Map();
  for (const [type, label] of [['read-area', '重读此地'], ['record-baseline', '记下此刻'], ['focus-area', '聚焦此地'], ['find-fires', '查找火情']]) {
    const button = node(doc, 'button', '', label); button.type = 'button';
    button.dataset.environmentAction = type; buttons.set(type, button); actions.append(button);
  }
  const list = node(doc, 'ol', 'g23-environment__fires');
  const note = node(doc, 'p', 'g23-environment__note', '先用检视选一处山河。只记当前事实；前后对照不作为长期史料存档。');
  frame.append(heading, location, status, facts, comparison, actions, message, list, note);
  root.replaceChildren(frame);
  let disposed = false;
  function onClick(event) {
    const button = event.target.closest?.('[data-environment-action]');
    if (disposed || !button || !frame.contains(button) || button.disabled) return;
    onAction?.({ type: button.dataset.environmentAction, contextId: button.dataset.environmentContext,
      observationId: button.dataset.environmentId || null });
  }
  frame.addEventListener('click', onClick);
  return {
    render(vm = {}) {
      if (disposed) return;
      const observation = vm.observation, environment = observation?.environment, valid = !!observation?.ok;
      update(location, valid ? `${PLANE_LABEL[observation.plane]} · (${observation.location.x}, ${observation.location.y}) · 第 ${Number(observation.day).toFixed(1)} 日` : '请选择当前可观察的位置');
      const states = observation?.states || [];
      update(status, valid ? states.map(state => STATE_LABEL[state] || '不可考').join(' · ') : '当前环境不可考');
      const vegetationLabel = observation?.plane === 'nether' ? '阴气' : observation?.plane === 'upper' ? '灵植' : '植被';
      update(facts, valid ? `${environment.fireSupported ? `火势 ${count(environment.activeFireCells)}` : '该位面未运行正式火灾机制'} · 焦土 ${count(environment.scorchedCells)} · 灰烬 ${count(environment.ashCells)}\n${vegetationLabel}均值 ${percent(observation.plane === 'nether' ? environment.yinMean : environment.vegetationMean)} · 采样 ${observation.coverage.sampledCells} 格${observation.coverage.restrictedCells ? '（范围已按可见权限裁剪）' : ''}` : '');
      const diff = vm.comparison, changes = diff?.changes;
      update(comparison, diff?.ok ? `距基线 ${diff.deltaDays.toFixed(1)} 日 · 火势 ${signed(changes.activeFireCells)} 格 · 焦土 ${signed(changes.scorchedCells)} 格 · 灰烬 ${signed(changes.ashCells)} 格\n${vegetationLabel}变化 ${Number.isFinite(changes.vegetationMean) ? `${changes.vegetationMean > 0 ? '+' : ''}${(changes.vegetationMean * 100).toFixed(1)} 个百分点` : '不可考'}${diff.recovering ? ' · 植被恢复中' : ''}` : vm.baselineDay !== null && vm.baselineDay !== undefined ? '当前范围无法与基线比较。' : '尚未记下会话基线');
      update(message, vm.message || '');
      for (const [type, button] of buttons) {
        button.disabled = type === 'find-fires' ? false : !valid;
        button.dataset.environmentContext = vm.contextId || '';
        button.dataset.environmentId = vm.observationId || '';
      }
      const scroll = list.scrollTop, items = vm.search?.items || [];
      items.forEach((item, index) => {
        let row = list.children[index];
        if (!row) { row = node(doc, 'li'); row.append(node(doc, 'span'), node(doc, 'button', '', '观察火情')); list.append(row); }
        update(row.children[0], `${PLANE_LABEL[item.plane]} (${item.location.x}, ${item.location.y})`);
        const button = row.children[1]; button.type = 'button'; button.dataset.environmentAction = 'observe-fire';
        button.dataset.environmentContext = vm.contextId; button.dataset.environmentId = item.id;
      });
      while (list.children.length > items.length) list.lastChild.remove();
      list.scrollTop = scroll;
    },
    destroy() { if (disposed) return; disposed = true; frame.removeEventListener('click', onClick); frame.remove(); }
  };
}
