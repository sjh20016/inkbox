import { WORLD_PRESETS, TERRAIN_PRESETS, makeCreationRequest, safeSlots } from "./creationMenuModel.js";
// Host owns all creation, save parsing, random seed generation and success/failure states.
function el(doc, tag, cls, text) {
  const node = doc.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}
function button(doc, text, action, cls) {
  const node = el(doc, "button", cls || "g2-creation__button", text);
  node.type = "button"; node.dataset.action = action;
  return node;
}
function setText(node, value) {
  const next = String(value ?? "");
  if (node.textContent !== next) node.textContent = next;
}
export function createCreationMenuView(root, { onAction } = {}) {
  if (!root?.ownerDocument || typeof root.replaceChildren !== "function") throw new TypeError("DOM root required");
  const doc = root.ownerDocument;
  const frame = el(doc, "section", "g2-creation");
  frame.setAttribute("aria-label", "坐天观井主菜单");
  const header = el(doc, "header", "g2-creation__masthead");
  header.append(el(doc, "p", "g2-creation__eyebrow", "INKBOX   /   水墨天地"),
    el(doc, "h1", "g2-creation__title", "坐天观井"),
    el(doc, "p", "g2-creation__subtitle", "看万物自生，拨一线因果。"));
  const home = el(doc, "div", "g2-creation__page");
  home.append(el(doc, "p", "g2-creation__sublabel", "一卷山河，从此开篇"));
  const actions = el(doc, "div", "g2-creation__home-actions");
  const homeActions = [
    ["继续游戏", "continue"], ["创建天地", "open-create"], ["读取存档", "open-saves"],
    ["导入存档", "import"], ["游戏帮助", "help"],
  ];
  homeActions.forEach(([label, action]) => actions.append(button(doc, label, action)));
  const recent = el(doc, "p", "g2-creation__recent");
  home.append(actions, recent);
  const create = el(doc, "div", "g2-creation__page");
  const form = el(doc, "form", "g2-creation__form");
  const createHeading = el(doc, "h2", "", "创建天地");
  const seedField = el(doc, "label", "g2-creation__field");
  seedField.append(el(doc, "span", "", "世界种子"));
  const seedRow = el(doc, "div", "g2-creation__seed-row");
  const seed = el(doc, "input", "g2-creation__input");
  seed.type = "text"; seed.inputMode = "numeric"; seed.autocomplete = "off";
  seed.placeholder = "0 至 4294967295"; seed.setAttribute("aria-label", "世界种子");
  const random = button(doc, "掷种", "random-seed", "g2-creation__button g2-creation__button--quiet");
  seedRow.append(seed, random);
  const seedError = el(doc, "span", "g2-creation__error");
  seedError.id = "g2-creation-seed-error";
  seed.setAttribute("aria-describedby", seedError.id);
  seedField.append(seedRow, seedError);
  const presetField = el(doc, "label", "g2-creation__field");
  presetField.append(el(doc, "span", "", "天地幅员"));
  const preset = el(doc, "select", "g2-creation__input");
  WORLD_PRESETS.forEach((item) => {
    const option = el(doc, "option", "", item.label + " · " + item.width + " × " + item.height);
    option.value = item.id; preset.append(option);
  });
  preset.value = "medium"; presetField.append(preset);
  const terrainField = el(doc, "label", "g2-creation__field");
  terrainField.append(el(doc, "span", "", "地貌预设"));
  const terrain = el(doc, "select", "g2-creation__input");
  TERRAIN_PRESETS.forEach((item) => {
    const option = el(doc, "option", "", item.label + " · " + item.detail);
    option.value = item.id; terrain.append(option);
  });
  terrainField.append(terrain);
  const progressiveField = el(doc, "label", "g2-creation__toggle");
  const progressive = el(doc, "input"); progressive.type = "checkbox";
  progressiveField.append(progressive, el(doc, "span", "", "渐开天地"));
  const explanation = el(doc, "p", "g2-creation__note",
    "仅逐步开放可观察与操作的范围。未开放之地依然存在，天地照常运转。");
  const formActions = el(doc, "div", "g2-creation__row");
  const submit = el(doc, "button", "g2-creation__button g2-creation__button--primary", "落笔开天");
  submit.type = "submit";
  formActions.append(submit, button(doc, "返回", "home", "g2-creation__button g2-creation__button--quiet"));
  form.append(createHeading, seedField, presetField, terrainField, progressiveField, explanation, formActions);
  create.append(form);
  const saves = el(doc, "div", "g2-creation__page");
  saves.append(el(doc, "h2", "", "旧卷重读"));
  const saveList = el(doc, "div", "g2-creation__slots");
  const saveStatus = el(doc, "p", "g2-creation__note");
  saves.append(saveList, saveStatus, button(doc, "返回主菜单", "home"));
  const footer = el(doc, "footer", "g2-creation__footer");
  const status = el(doc, "p", "g2-creation__status");
  status.setAttribute("role", "status"); status.setAttribute("aria-live", "polite");
  footer.append(status, el(doc, "span", "", "天地无尽 · 观者有心"));
  const fileInput = el(doc, "input", "g2-creation__file");
  fileInput.type = "file"; fileInput.accept = ".json,application/json"; fileInput.hidden = true;
  frame.append(header, home, create, saves, footer, fileInput);
  root.replaceChildren(frame);
  let disposed = false, currentPage = "home", host = {}, requested = false;
  function emit(payload) { if (!disposed && typeof onAction === "function") onAction(payload); }
  function showPage(page) {
    currentPage = page; home.hidden = page !== "home"; create.hidden = page !== "create"; saves.hidden = page !== "saves";
    const heading = page === "create" ? createHeading : page === "saves" ? saves.querySelector("h2") : actions.querySelector("button");
    heading?.focus?.();
  }
  function onClick(event) {
    const target = event.target.closest?.("[data-action]");
    if (!target || !frame.contains(target) || target.disabled || disposed) return;
    const action = target.dataset.action;
    if (action === "open-create") showPage("create");
    else if (action === "open-saves") showPage("saves");
    else if (action === "home") showPage("home");
    else if (action === "random-seed") emit({ type: "request-random-seed" });
    else if (action === "import") fileInput.click();
    else if (action === "load") {
      if (host.busy || requested) return;
      requested = true; emit({ type: "load-save", slotId: target.dataset.slotId });
    } else if (action === "continue" || action === "help") emit({ type: action === "continue" ? "continue-game" : "open-help" });
  }
  function onSubmit(event) {
    event.preventDefault();
    if (disposed || requested || host.busy) return;
    try {
      const request = makeCreationRequest({
        preset: preset.value, terrainPreset: terrain.value, seed: seed.value, progressive: progressive.checked,
      });
      setText(seedError, ""); seed.removeAttribute("aria-invalid");
      requested = true; submit.disabled = true; emit(request);
    } catch (error) {
      setText(seedError, error.message); seed.setAttribute("aria-invalid", "true"); seed.focus();
    }
  }
  function onFile() {
    if (!disposed && !host.busy && fileInput.files?.[0]) emit({ type: "import-save", file: fileInput.files[0] });
    fileInput.value = "";
  }
  frame.addEventListener("click", onClick);
  form.addEventListener("submit", onSubmit);
  fileInput.addEventListener("change", onFile);
  showPage("home");
  return {
    render(model = {}) {
      if (disposed) return;
      host = model && typeof model === "object" ? model : {};
      // Busy is host-controlled; a host acknowledgement (even failure) unlocks the UI.
      if (Object.hasOwn(host, "busy") || Object.hasOwn(host, "result")) requested = !!host.busy;
      if (Object.hasOwn(host, "seed") && host.seed !== undefined && host.seed !== null && doc.activeElement !== seed) {
        seed.value = String(host.seed);
      }
      setText(recent, host.recentWorld ? "最近一卷 · " + String(host.recentWorld.name ?? "未命名天地") :
        "尚无最近游玩的世界");
      setText(status, host.error ? String(host.error) : host.busy ? "正在处理，请稍候…" :
        typeof host.message === "string" ? host.message : "");
      setText(saveStatus, host.loadError ? "读取失败：" + String(host.loadError) :
        host.busy ? "读取中…" : "");
      actions.querySelector('[data-action="continue"]').disabled = !host.canContinue || !!host.busy;
      submit.disabled = !!host.busy || requested;
      random.disabled = !!host.busy;
      saveList.replaceChildren();
      const slots = safeSlots(host.slots);
      if (!slots.length) saveList.append(el(doc, "p", "g2-creation__note", "暂无可读取的存档"));
      slots.forEach((slot) => {
        const row = el(doc, "article", "g2-creation__slot");
        const content = el(doc, "div");
        content.append(el(doc, "strong", "", String(slot.label ?? "存档 " + slot.id)),
          el(doc, "small", "", slot.description == null ? "记录未载" : String(slot.description)));
        const load = button(doc, "读取", "load", "g2-creation__button g2-creation__button--quiet");
        load.dataset.slotId = String(slot.id);
        load.disabled = !slot.available || !!host.busy || requested;
        row.append(content, load); saveList.append(row);
      });
      if (host.page === "home" || host.page === "create" || host.page === "saves") showPage(host.page);
    },
    destroy() {
      if (disposed) return;
      disposed = true; frame.removeEventListener("click", onClick);
      form.removeEventListener("submit", onSubmit); fileInput.removeEventListener("change", onFile);
      frame.remove();
    },
  };
}
