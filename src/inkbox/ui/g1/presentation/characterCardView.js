import {
  G1_CHARACTER_SCHEMA, CHARACTER_TABS, readable, cultivationProgress, safeStatus,
  statusLabel,
} from "./characterCardFormat.js";

function node(doc, tag, className, value) {
  const el = doc.createElement(tag);
  if (className) el.className = className;
  if (value !== undefined) el.textContent = String(value);
  return el;
}
function put(el, value) {
  const next = String(value);
  if (el.textContent !== next) el.textContent = next;
}
function command(doc, label, action, className = "g1-character__tool") {
  const el = node(doc, "button", className, label);
  el.type = "button";
  el.dataset.g1Action = action;
  return el;
}
function section(doc, title, parent) {
  parent.append(node(doc, "h3", "g1-character__section-title", title));
}
function syncPairs(doc, list, rows) {
  const items = Array.isArray(rows) ? rows : [];
  // Reuse existing dt/dd pairs. Patching text never resets page scroll or focus.
  for (let i = 0; i < items.length; i++) {
    let title = list.children[i * 2];
    let value = list.children[i * 2 + 1];
    if (!title || !value) {
      title = node(doc, "dt");
      value = node(doc, "dd");
      list.append(title, value);
    }
    put(title, readable(items[i]?.label, "未载"));
    put(value, readable(items[i]?.value));
  }
  while (list.children.length > items.length * 2) list.lastChild.remove();
}
function syncHistory(doc, list, events) {
  const items = Array.isArray(events) ? events : [];
  for (let i = 0; i < items.length; i++) {
    let line = list.children[i];
    if (!line) {
      line = node(doc, "li", "g1-character__event");
      line.append(node(doc, "span", "g1-character__event-day"),
        node(doc, "span", "g1-character__event-text"));
      list.append(line);
    }
    const item = items[i] || {};
    put(line.children[0], Number.isFinite(item.day) ? "第 " + item.day + " 日" : "年月未载");
    put(line.children[1], readable(item.text, "往事未载"));
  }
  while (list.children.length > items.length) list.lastChild.remove();
}
function syncEdicts(doc, list, edicts, available, readonlyMessage) {
  const items = Array.isArray(edicts) ? edicts : [];
  for (let i = 0; i < items.length; i++) {
    let item = list.children[i];
    if (!item) {
      item = node(doc, "article", "g1-character__edict");
      const head = node(doc, "div", "g1-character__edict-head");
      const label = node(doc, "strong", "g1-character__edict-name");
      const button = command(doc, "敕令", "edict", "g1-character__edict-button");
      head.append(label, button);
      item.append(head, node(doc, "p", "g1-character__edict-text"),
        node(doc, "p", "g1-character__reason"));
      list.append(item);
    }
    const edict = items[i] || {};
    const button = item.children[0].children[1];
    put(item.children[0].children[0], readable(edict.title, "未名敕令"));
    put(item.children[1], readable(edict.description, ""));
    button.dataset.edictId = typeof edict.id === "string" ? edict.id : "";
    button.disabled = !available || !edict.enabled || !button.dataset.edictId;
    const reason = !available ? readonlyMessage :
      edict.enabled ? "" : readable(edict.disabledReason, "当前无法施行");
    put(item.children[2], reason);
    item.children[2].hidden = !reason;
  }
  while (list.children.length > items.length) list.lastChild.remove();
}
function validIdentity(identity) {
  return !!identity && typeof identity.key === "string" && identity.key.length > 0;
}

/**
 * DOM presentation for Codex-supplied CharacterViewModel v1.
 * Never reads World, never mutates a viewModel, never executes an edict.
 * Load characterCard.css separately in the consuming host.
 */
export function createCharacterCardView(root, { onAction } = {}) {
  if (!root || typeof root.replaceChildren !== "function" || !root.ownerDocument) {
    throw new TypeError("createCharacterCardView requires a DOM root");
  }
  const doc = root.ownerDocument;
  const card = node(doc, "section", "g1-character");
  card.setAttribute("aria-label", "人物命簿");

  const header = node(doc, "header", "g1-character__header");
  const top = node(doc, "div", "g1-character__eyebrow-row");
  top.append(node(doc, "span", "g1-character__eyebrow", "坐天观井  /  人物命簿"));
  const tools = node(doc, "div", "g1-character__tools");
  const watch = command(doc, "记挂", "watch");
  const focus = command(doc, "寻踪", "focus");
  const exportButton = command(doc, "传记", "export");
  const close = command(doc, "收起", "close");
  tools.append(watch, focus, exportButton, close);
  top.append(tools);
  const row = node(doc, "div", "g1-character__name-row");
  const name = node(doc, "h2", "g1-character__name");
  const status = node(doc, "span", "g1-character__status");
  row.append(name, status);
  const realm = node(doc, "p", "g1-character__realm");
  const summary = node(doc, "p", "g1-character__summary");
  header.append(top, row, realm, summary);

  const growth = node(doc, "section", "g1-character__growth");
  const growthHead = node(doc, "div", "g1-character__growth-heading");
  growthHead.append(node(doc, "span", "", "修为积累"));
  const percent = node(doc, "strong", "g1-character__growth-percent");
  growthHead.append(percent);
  const track = node(doc, "div", "g1-character__track");
  track.setAttribute("role", "progressbar");
  track.setAttribute("aria-label", "修为进度");
  track.setAttribute("aria-valuemin", "0");
  track.setAttribute("aria-valuemax", "100");
  const fill = node(doc, "div", "g1-character__track-fill");
  track.append(fill);
  const growthMeta = node(doc, "div", "g1-character__growth-meta");
  const measure = node(doc, "span");
  const growthState = node(doc, "span");
  growthMeta.append(measure, growthState);
  growth.append(growthHead, track, growthMeta);

  const tabs = node(doc, "div", "g1-character__tabs");
  tabs.setAttribute("role", "tablist");
  tabs.setAttribute("aria-label", "命簿四卷");
  const body = node(doc, "div", "g1-character__body");
  const pages = {};
  const tabButtons = {};
  CHARACTER_TABS.forEach((tab, index) => {
    const button = command(doc, tab.label, "tab", "g1-character__tab");
    button.dataset.tab = tab.id;
    button.id = "g1-card-tab-" + ++createCharacterCardView.nextId;
    button.setAttribute("role", "tab");
    const page = node(doc, "section", "g1-character__pane");
    page.id = "g1-card-pane-" + createCharacterCardView.nextId;
    page.setAttribute("role", "tabpanel");
    page.setAttribute("aria-labelledby", button.id);
    button.setAttribute("aria-controls", page.id);
    page.hidden = index !== 0;
    tabs.append(button);
    body.append(page);
    pages[tab.id] = page;
    tabButtons[tab.id] = button;
  });

  section(doc, "命里所载", pages.overview);
  const overview = node(doc, "dl", "g1-character__pairs");
  pages.overview.append(overview);
  section(doc, "修行之势", pages.cultivation);
  const cultivationIntro = node(doc, "p", "g1-character__prose");
  const cultivation = node(doc, "dl", "g1-character__pairs");
  pages.cultivation.append(cultivationIntro, cultivation);
  section(doc, "天道敕令", pages.fate);
  const fateIntro = node(doc, "p", "g1-character__prose", "敕令请求交由天道裁决，此处不直接改写人物命数。");
  const edicts = node(doc, "div", "g1-character__edicts");
  const edictEmpty = node(doc, "p", "g1-character__volume-empty", "暂无可颁之令");
  pages.fate.append(fateIntro, edicts, edictEmpty);
  section(doc, "生平行迹", pages.history);
  const history = node(doc, "ol", "g1-character__history");
  const historyEmpty = node(doc, "p", "g1-character__volume-empty", "此人生平尚无可考之事");
  pages.history.append(history, historyEmpty);
  section(doc, "人间牵系", pages.history);
  const relations = node(doc, "dl", "g1-character__pairs");
  const relationsAction = command(doc, "察看人物关系", "show-relations", "g1-character__section-action");
  pages.history.append(relations, relationsAction);

  const footer = node(doc, "footer", "g1-character__footer", "观其所历，不代其所行");
  card.append(header, growth, tabs, body, footer);
  root.replaceChildren(card);

  let model = null;
  let activeTab = "overview";
  let currentKey = null;
  let disposed = false;

  function showTab(id, resetScroll = true) {
    if (!pages[id]) return;
    activeTab = id;
    for (const key of Object.keys(pages)) {
      pages[key].hidden = key !== id;
      tabButtons[key].setAttribute("aria-selected", String(key === id));
      tabButtons[key].tabIndex = key === id ? 0 : -1;
    }
    if (resetScroll) body.scrollTop = 0;
  }
  function emit(type, payload = {}) {
    if (disposed || typeof onAction !== "function") return;
    const identity = model?.identity;
    if (type === "close") {
      onAction({ type: "close", targetKey: validIdentity(identity) ? identity.key : null });
      return;
    }
    if (!validIdentity(identity)) return;
    const alive = safeStatus(identity.status) === "alive";
    if (type === "watch" && alive) onAction({ type, targetKey: identity.key, watched: !Boolean(model.watched) });
    else if (type === "focus" && alive && identity.canFocus === true) onAction({ type, targetKey: identity.key });
    else if (type === "export") onAction({ type, targetKey: identity.key });
    else if (type === "show-relations") onAction({ type, targetKey: identity.key });
    else if (type === "edict" && alive) {
      const entry = Array.isArray(model.edicts)
        ? model.edicts.find(item => item?.id === payload.edictId) : null;
      if (entry?.enabled === true && typeof entry.id === "string" && entry.id) {
        onAction({ type, targetKey: identity.key, edictId: entry.id });
      }
    }
  }
  function onClick(event) {
    const button = event.target?.closest?.("button[data-g1-action]");
    if (!button || !card.contains(button) || button.disabled) return;
    const type = button.dataset.g1Action;
    if (type === "tab") {
      showTab(button.dataset.tab);
      return;
    }
    if (["close", "watch", "focus", "export", "edict", "show-relations"].includes(type)) {
      emit(type, { edictId: button.dataset.edictId });
    }
  }
  function onKeydown(event) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    const target = event.target;
    if (target?.getAttribute?.("role") !== "tab" || !card.contains(target)) return;
    const ids = CHARACTER_TABS.map(item => item.id);
    let next = ids.indexOf(activeTab);
    if (event.key === "Home") next = 0;
    else if (event.key === "End") next = ids.length - 1;
    else next = (next + (event.key === "ArrowRight" ? 1 : -1) + ids.length) % ids.length;
    event.preventDefault();
    showTab(ids[next]);
    tabButtons[ids[next]].focus();
  }
  card.addEventListener("click", onClick);
  card.addEventListener("keydown", onKeydown);

  function render(viewModel) {
    if (disposed) return;
    const valid = viewModel && viewModel.schemaVersion === G1_CHARACTER_SCHEMA &&
      validIdentity(viewModel.identity);
    const next = valid ? viewModel : null;
    const nextKey = next?.identity.key || null;
    if (nextKey !== currentKey) {
      currentKey = nextKey;
      showTab("overview");
    }
    model = next;
    const identity = next?.identity || {};
    const info = next?.header || {};
    const cultivationModel = next?.cultivation || {};
    const progress = cultivationProgress(cultivationModel);
    const alive = safeStatus(identity.status) === "alive";
    card.dataset.status = safeStatus(identity.status);
    put(name, readable(identity.name, "无名之人"));
    put(status, statusLabel(identity.status));
    put(realm, readable(info.realm, "境界未载"));
    put(summary, [info.ageText, info.affiliation, info.stateText]
      .filter(value => value !== undefined && value !== null && value !== "")
      .map(value => String(value)).join(" · ") || "生平尚待考录");
    const hasProgress = Number.isFinite(cultivationModel.percent) ||
      (Number.isFinite(cultivationModel.exp) && Number.isFinite(cultivationModel.required) &&
      cultivationModel.required > 0);
    const percentText = hasProgress ? progress.percent.toFixed(1).replace(/\.0$/, "") + "%" : "未载";
    put(percent, percentText);
    fill.style.width = hasProgress ? progress.percent + "%" : "0%";
    track.setAttribute("aria-valuenow", hasProgress ? String(progress.percent) : "0");
    track.setAttribute("aria-valuetext", percentText);
    put(measure, Number.isFinite(cultivationModel.exp) && Number.isFinite(cultivationModel.required)
      ? progress.exp + " / " + progress.required : "数值未载");
    const growthStatus = cultivationModel.atRealmCap === true ? "已至境界上限" :
      cultivationModel.unawakened === true ? "尚未启灵" :
      hasProgress && progress.percent >= 100 ? "修为已满" :
      readable(cultivationModel.stateText, "修行未载");
    put(growthState, growthStatus);
    watch.hidden = !alive || !next;
    watch.dataset.active = String(Boolean(next?.watched));
    put(watch, next?.watched ? "已记挂" : "记挂");
    focus.hidden = !alive || !next || identity.canFocus !== true;
    exportButton.hidden = !next;
    // Actions are dispatched only after re-checking the latest model in emit().
    syncPairs(doc, overview, next?.overview);
    put(cultivationIntro, [cultivationModel.rateText, cultivationModel.stateText]
      .filter(Boolean).map(String).join(" · ") || "此人修行之路尚未明晰。");
    syncPairs(doc, cultivation, next?.cultivationRows);
    const readonlyReason = !next ? "没有可考录的施令对象" :
      identity.status === "dead" ? "此人已故，不可再施敕令" :
      identity.status === "ascended" ? "此人已飞升，凡间敕令不可施行" :
      identity.status === "missing" ? "踪迹未明，无法施行敕令" :
      "身份不可考，无法施行敕令";
    fateIntro.textContent = alive ? "敕令请求交由天道裁决，此处不直接改写人物命数。" :
      readonlyReason;
    syncEdicts(doc, edicts, next?.edicts, alive && !!next, readonlyReason);
    edictEmpty.hidden = Array.isArray(next?.edicts) && next.edicts.length > 0;
    syncHistory(doc, history, next?.history);
    historyEmpty.hidden = Array.isArray(next?.history) && next.history.length > 0;
    syncPairs(doc, relations, next?.relations);
    relationsAction.hidden = !next || !Array.isArray(next.relations) || !next.relations.length;
  }
  function destroy() {
    if (disposed) return;
    disposed = true;
    model = null;
    currentKey = null;
    card.removeEventListener("click", onClick);
    card.removeEventListener("keydown", onKeydown);
    card.remove();
  }
  showTab("overview");
  return { render, destroy };
}
createCharacterCardView.nextId = 0;
