// A small read-only presentation of real travel facts. Dispatch and cancel
// always go through the injected actions owned by the application shell.
import { canAccess } from '../core/mapAccess.js';
import { readTransitJourneys } from '../world/transitState.js';
import { canFly } from '../world/transitGeography.js';

const ACTIVE = new Set(['active', 'blocked', 'landing']);
const idOf = value => Number(value);
const villageName = village => village?.name || `聚落 ${village?.id ?? ''}`;
const personName = person => person?.name || `修士 ${person?.id ?? ''}`;
const DAY = 360;
const MONTH = 30;

function dateAt(day) {
  if (!Number.isFinite(day)) return '日期未定';
  return `第 ${Math.floor(day / DAY) + 1} 年 ${Math.floor((day % DAY) / MONTH) + 1} 月`;
}

function etaText(journey, day) {
  if (!Number.isFinite(journey.etaDay)) return '到期未知';
  if (journey.etaDay <= day) return `应于 ${dateAt(journey.etaDay)} 抵达`;
  const left = Math.ceil(journey.etaDay - day);
  return `约 ${left} 日后 · ${dateAt(journey.etaDay)}`;
}

function statusText(journey) {
  if (journey.status === 'blocked') return `受阻：${reasonText(journey.reason)}`;
  if (journey.status === 'landing') return '正在靠岸';
  if (journey.status === 'arrived') return '已抵达';
  if (journey.status === 'cancelled') return '已中止';
  if (journey.status === 'lost') return '已失联';
  return '行进中';
}

function reasonText(reason) {
  const labels = {
    blocked_water: '水道被阻', no_port: '没有可用渡口', no_land_connection: '陆路不通',
    unsafe_landing: '落点不安全', destination_lost: '目的聚落已失效', actor_dead: '行者已不在世',
    flight_lost: '已失去飞行能力', vehicle_lost: '舟船已失去', vehicle_destroyed: '舟船已毁',
    cancelled_at_source: '从出发地退回', cancelled_at_destination: '已安全落地并中止',
    abandoned_at_sea: '弃舟于海', abandoned_on_land: '已在陆地中止', cancel_requested: '待安全落地',
    invalid_village: '聚落选择无效', invalid_person_or_village: '修士或目的聚落无效',
    insufficient_food: '出发村存粮不足（须留足口粮）', no_sailor: '出发村暂无可行船的成年居民',
    capacity: '在途名额已满', no_flight_capability: '此人尚无御空之能',
    kept_journey: '行程仍在继续', world_changed: '世界已经更换，请重新查看行程',
    confirmation_open: '仍有中止确认待处理',
  };
  return labels[reason] || (reason ? String(reason) : '航路暂不可通');
}

function positionFor(world, journey) {
  if (journey.kind === 'person') return world.entities?.find(person => person.id === journey.actorId) || journey.position;
  return journey.position;
}

export function createTransitPanel(sandbox, actions, doc = document) {
  const shelf = doc.getElementById('inkTransitPanel');
  const stage = doc.querySelector('.stage');
  if (!shelf || !stage) return null;

  // Build the compact paper-roll disclosure once so low-frequency refreshes
  // never replace a form currently being edited.
  let disclosure = shelf.querySelector('details.transit-details');
  if (!disclosure) {
    disclosure = doc.createElement('details'); disclosure.className = 'transit-details';
    const summary = doc.createElement('summary'); summary.textContent = '山海通衢 · 在途 0';
    disclosure.append(summary); shelf.replaceChildren(disclosure);
  }
  let body = disclosure.querySelector('.transit-body');
  if (!body) { body = doc.createElement('div'); body.className = 'transit-body'; disclosure.append(body); }
  const layer = doc.createElement('div');
  layer.className = 'transit-map-marks';
  layer.setAttribute('aria-label', '在途行程地图标记');
  stage.append(layer);

  const villages = () => (sandbox.world?.villages || []).filter(v => Number.isSafeInteger(v.id)
    && Number.isFinite(v.x) && Number.isFinite(v.y) && canAccess(sandbox.world, v.x, v.y));
  const form = doc.createElement('div'); form.className = 'transit-dispatch';
  const cargoForm = doc.createElement('form'); cargoForm.className = 'transit-form'; cargoForm.dataset.kind = 'cargo';
  const personForm = doc.createElement('form'); personForm.className = 'transit-form'; personForm.dataset.kind = 'person';
  function field(labelText, name) {
    const label = doc.createElement('label'); label.textContent = labelText;
    const select = doc.createElement('select'); select.name = name; select.required = true;
    label.append(select); return { label, select };
  }
  const cargoFrom = field('从', 'fromVillageId'), cargoTo = field('送往', 'toVillageId');
  const cargoButton = doc.createElement('button'); cargoButton.type = 'submit'; cargoButton.textContent = '运粮 24';
  const cargoHint = doc.createElement('p'); cargoHint.className = 'transit-note';
  cargoHint.textContent = '仅从现有村粮装船；在途不计入目的地，靠岸后才交付。';
  cargoForm.append(cargoFrom.label, cargoTo.label, cargoButton, cargoHint);
  const personSelect = field('修士', 'actorId'), personTo = field('远行至', 'toVillageId');
  const personButton = doc.createElement('button'); personButton.type = 'submit'; personButton.textContent = '御剑远行';
  personForm.append(personSelect.label, personTo.label, personButton);
  const notice = doc.createElement('p'); notice.className = 'transit-notice'; notice.setAttribute('role', 'status'); notice.hidden = true;
  form.append(cargoForm, personForm, notice);
  const list = doc.createElement('div'); list.className = 'transit-journey-list';
  body.replaceChildren(form, list);

  let attachedWorld = null, journeys = [], signature = '', selectedId = null;
  let lastRefresh = -Infinity, wasVisible = false;
  const markerButtons = [];
  const setNotice = text => { notice.textContent = text; notice.hidden = !text; };

  function fillSelect(select, entries, selectedValue, placeholder) {
    const current = String(selectedValue ?? '');
    select.replaceChildren();
    const empty = doc.createElement('option'); empty.value = ''; empty.textContent = placeholder; select.append(empty);
    for (const item of entries) {
      const option = doc.createElement('option'); option.value = String(item.id); option.textContent = item.label;
      select.append(option);
    }
    if (entries.some(item => String(item.id) === current)) select.value = current;
  }

  function refresh(force = false) {
    const world = sandbox.world;
    if (!world) return;
    const changedWorld = attachedWorld !== world;
    const visible = shelf.getClientRects().length > 0, opened = visible && !wasVisible;
    wasVisible = visible;
    const now = globalThis.performance?.now?.() ?? Date.now();
    if (!force && !changedWorld && !opened && now - lastRefresh < 1600) return;
    lastRefresh = now;
    if (changedWorld) { attachedWorld = world; selectedId = null; signature = ''; setNotice(''); }

    const openVillages = villages();
    journeys = readTransitJourneys(world);
    const travelling = new Set(journeys.filter(j => ACTIVE.has(j.status)).map(j => j.actorId));
    const people = (world.entities || []).filter(canFly).filter(person => !travelling.has(person.id)
      && (person.village == null || openVillages.some(v => v.id === person.village)));
    const formFocused = body.contains(doc.activeElement);
    if (!formFocused || changedWorld) {
      const fromValue = changedWorld ? '' : cargoFrom.select.value;
      const cargoToValue = changedWorld ? '' : cargoTo.select.value;
      const personToValue = changedWorld ? '' : personTo.select.value;
      const actorValue = changedWorld ? '' : personSelect.select.value;
      const villageOptions = openVillages.map(v => ({ id: v.id, label: `${villageName(v)} · 粮 ${Math.floor(v.food ?? 0)}` }));
      fillSelect(cargoFrom.select, villageOptions, fromValue, '选择出发村');
      fillSelect(cargoTo.select, villageOptions, cargoToValue, '选择目的村');
      fillSelect(personTo.select, openVillages.map(v => ({ id: v.id, label: villageName(v) })), personToValue, '选择目的村');
      fillSelect(personSelect.select, people.map(p => ({ id: p.id, label: `${personName(p)} · Lv${p.level}` })), actorValue, '选择具飞行之能者');
      cargoButton.disabled = openVillages.length < 2;
      personButton.disabled = !people.length || !openVillages.length;
    }

    disclosure.querySelector('summary').textContent = `山海通衢 · 在途 ${journeys.filter(j => ACTIVE.has(j.status)).length}`;
    const nextSignature = JSON.stringify([world.day, openVillages.map(v => [v.id, v.name, v.food, v.x, v.y]),
      people.map(p => [p.id, p.name, p.level]), journeys]);
    if (nextSignature === signature) { syncMarkers(); return; }
    if (!force && !changedWorld && body.contains(doc.activeElement)) { syncMarkers(); return; }
    signature = nextSignature;
    renderRows(); syncMarkers();
  }

  function renderRows() {
    const world = sandbox.world;
    const sorted = journeys.slice().sort((a, b) => Number(ACTIVE.has(b.status)) - Number(ACTIVE.has(a.status)) || b.id - a.id);
    list.replaceChildren();
    if (!sorted.length) {
      const empty = doc.createElement('p'); empty.className = 'transit-note'; empty.textContent = '尚无真实行程。'; list.append(empty); return;
    }
    for (const journey of sorted) {
      const row = doc.createElement('article'); row.className = 'transit-journey';
      row.dataset.status = journey.status;
      row.dataset.journeyId = String(journey.id);
      row.dataset.selected = String(Number(journey.id) === Number(selectedId));
      const title = doc.createElement('h4');
      const from = world.villageById?.(journey.fromVillageId) || world.villages?.find(v => v.id === journey.fromVillageId);
      const to = world.villageById?.(journey.toVillageId) || world.villages?.find(v => v.id === journey.toVillageId);
      title.textContent = `${journey.kind === 'cargo' ? '🚢 船' : '✦ 御剑'} #${journey.id} · ${villageName(from)} → ${villageName(to)}`;
      const details = doc.createElement('p'); details.textContent = journey.kind === 'cargo'
        ? `${journey.status === 'arrived' ? `已交粮 ${journey.cargo?.amount ?? '原数量未保留'}` : `在途粮 ${journey.cargo?.food ?? 0}`} · ${statusText(journey)} · ${etaText(journey, world.day)}`
        : `${personName(world.entities?.find(p => p.id === journey.actorId) || { id: journey.actorId })} · ${statusText(journey)} · ${etaText(journey, world.day)}`;
      const controls = doc.createElement('div'); controls.className = 'transit-actions';
      const locate = doc.createElement('button'); locate.type = 'button'; locate.textContent = '定位'; locate.dataset.action = 'locate'; locate.dataset.id = journey.id;
      controls.append(locate);
      if (ACTIVE.has(journey.status)) {
        const cancel = doc.createElement('button'); cancel.type = 'button'; cancel.textContent = '中止 / 弃航（可能损失货物）'; cancel.dataset.action = 'cancel'; cancel.dataset.id = journey.id;
        controls.append(cancel);
      }
      row.append(title, details, controls); list.append(row);
    }
  }

  function ensureMarkers(count) {
    while (markerButtons.length < count) {
      const button = doc.createElement('button'); button.type = 'button'; button.className = 'transit-map-mark';
      button.addEventListener('click', () => {
        selectedId = Number(button.dataset.id);
        disclosure.open = true;
        const row = list.querySelector(`[data-journey-id="${selectedId}"]`);
        if (row) { list.querySelectorAll('.transit-journey').forEach(item => { item.dataset.selected = String(item === row); }); row.scrollIntoView?.({ block: 'nearest' }); }
        refresh(true);
      });
      layer.append(button); markerButtons.push(button);
    }
  }

  function syncMarkers() {
    const visibleJourneys = journeys.filter(j => ACTIVE.has(j.status)).slice(0, 12);
    ensureMarkers(visibleJourneys.length);
    markerButtons.forEach((button, index) => {
      const journey = visibleJourneys[index]; button.hidden = !journey; if (!journey) return;
      button.dataset.id = String(journey.id);
      button.dataset.status = journey.status;
      button.setAttribute('aria-pressed', String(Number(journey.id) === Number(selectedId)));
      button.textContent = `${journey.kind === 'cargo' ? '⛵' : '✦'} #${journey.id}`;
      button.title = `${journey.kind === 'cargo' ? `运粮 ${journey.cargo?.food ?? 0}` : '修士远行'} · ${statusText(journey)}`;
    });
  }

  function project() {
    const world = sandbox.world;
    if (!world || world !== attachedWorld) { markerButtons.forEach(b => { b.hidden = true; }); return; }
    // Travel state is small and bounded. Read only its first twelve active
    // journey IDs each frame so fast-forward arrivals and short flights do not
    // linger behind the slower shelf refresh.
    const source = (world.transit?.journeys || []).slice(0, 36);
    const currentIds = source.filter(journey => ACTIVE.has(journey.status)).slice(0, 12).map(journey => journey.id);
    ensureMarkers(currentIds.length);
    const three = !!sandbox.render3d?.active;
    const activePlane = three ? sandbox.render3d.renderer?.activePlane || 'mortal' : 'mortal';
    const view = sandbox.getRealmViewState?.();
    const bounds = stage.getBoundingClientRect();
    markerButtons.forEach((button, index) => {
      const id = currentIds[index];
      if (id == null) { button.hidden = true; return; }
      const journey = source.find(item => item.id === id);
      if (!journey || !ACTIVE.has(journey.status) || activePlane !== 'mortal') { button.hidden = true; return; }
      button.dataset.id = String(journey.id);
      button.dataset.status = journey.status;
      button.dataset.kind = journey.kind;
      button.setAttribute('aria-pressed', String(Number(journey.id) === Number(selectedId)));
      button.textContent = `${journey.kind === 'cargo' ? '⛵' : '✦'} #${journey.id}`;
      button.title = `${journey.kind === 'cargo' ? `运粮 ${journey.cargo?.food ?? 0}` : '修士远行'} · ${statusText(journey)}`;
      const place = journey.position;
      if (!place || !canAccess(world, place.x, place.y)) { button.hidden = true; return; }
      if (view?.open && view.targetPlane !== 'mortal' && view.region?.contains(place.x + .5, place.y + .5)) { button.hidden = true; return; }
      let point;
      if (three) point = sandbox.render3d.projectSettlementAnchor?.(place);
      else {
        const x = Math.floor(place.x), y = Math.floor(place.y);
        if (!world.inside(x, y)) { button.hidden = true; return; }
        const [sx, sy] = sandbox.camera.tileScreen(place.x, place.y, world.height[world.idx(x, y)]);
        point = { x: sx, y: sy, visible: true };
      }
      if (!point?.visible) { button.hidden = true; return; }
      const x = point.x - 31, y = point.y - (journey.kind === 'person' ? 36 : 30);
      button.hidden = x < 4 || y < 14 || x > bounds.width - 68 || y > bounds.height - 42;
      if (!button.hidden) button.style.transform = `translate(${Math.round(x)}px,${Math.round(y)}px)`;
    });
  }

  function focusJourney(id) {
    const world = sandbox.world, journey = journeys.find(j => j.id === id);
    if (!journey || !world || world !== attachedWorld) { refresh(true); return; }
    const place = journey.status === 'arrived'
      ? world.villages?.find(v => v.id === journey.toVillageId)
      : positionFor(world, journey);
    if (!place || !canAccess(world, place.x, place.y)) { setNotice('行程所在位置尚未开放，无法定位。'); return; }
    selectedId = id;
    sandbox.camera.focusOn(place.x, place.y, { zoom: Math.max(sandbox.camera.zoom, 7), duration: 0.75 });
    sandbox.selected = { x: Math.floor(place.x), y: Math.floor(place.y) };
    refresh(true);
  }

  cargoForm.addEventListener('submit', async event => {
    event.preventDefault();
    const fromVillageId = idOf(cargoFrom.select.value), toVillageId = idOf(cargoTo.select.value);
    if (!Number.isSafeInteger(fromVillageId) || !Number.isSafeInteger(toVillageId) || fromVillageId === toVillageId) {
      setNotice('请选择不同的出发村与目的村。'); return;
    }
    const result = await actions?.cargo?.({ fromVillageId, toVillageId, food: 24 });
    setNotice(result?.ok ? `行程已启程 · #${result.journey?.id ?? '新行程'}` : reasonText(result?.reason));
    if (result?.ok) cargoButton.blur();
    refresh(true);
  });
  personForm.addEventListener('submit', async event => {
    event.preventDefault();
    const actorId = idOf(personSelect.select.value), toVillageId = idOf(personTo.select.value);
    if (!Number.isSafeInteger(actorId) || !Number.isSafeInteger(toVillageId)) { setNotice('请选择修士与目的村。'); return; }
    const result = await actions?.person?.({ actorId, toVillageId });
    setNotice(result?.ok ? `远行已启程 · #${result.journey?.id ?? '新行程'}` : reasonText(result?.reason));
    if (result?.ok) personButton.blur();
    refresh(true);
  });
  function onShelfClick(event) {
    const button = event.target.closest('[data-action]');
    if (!button || !shelf.contains(button)) return;
    const id = Number(button.dataset.id);
    if (button.dataset.action === 'locate') focusJourney(id);
    if (button.dataset.action === 'cancel') {
      Promise.resolve(actions?.cancel?.(id)).then(result => {
        const message = result?.journey?.status === 'landing'
          ? `行程 #${id} 正前往安全落点后中止。`
          : result?.ok ? `行程 #${id} 已中止。` : reasonText(result?.reason);
        setNotice(message);
        refresh(true);
      });
    }
  }
  shelf.addEventListener('click', onShelfClick);

  function frame(now) {
    if (attachedWorld !== sandbox.world) refresh(true);
    else if ((Number.isFinite(now) ? now : Date.now()) - lastRefresh >= 1600) refresh(false);
    project();
  }
  refresh(true);
  return { frame, refresh, dispose() { shelf.removeEventListener('click', onShelfClick); layer.remove(); } };
}
