// World access rules are never calculated here. This module only renders what Codex supplies.
export const REVELATION_STAGES = Object.freeze({
  40: { title: "初开天眼", note: "一隅山河，已在眼前。" },
  60: { title: "天地渐明", note: "远近相连，天地渐有轮廓。" },
  80: { title: "观尽八荒", note: "八方风物，次第入眼。" },
  100: { title: "山河尽览", note: "天地尽展，仍有无数故事。" },
});
function asText(value, fallback = "未载") {
  return value === undefined || value === null || value === "" ? fallback : String(value);
}
function displayPercent(value) {
  return Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : null;
}
/**
 * ViewModel v1: { stage:40|60|80|100, openedPercent, boundaryText,
 *   canRequestExpand, disabledReason, progressText }.
 * onAction({type:"request-map-expansion", stage}) is a request only.
 */
export function createWorldProgressView(root, { onAction } = {}) {
  if (!root?.ownerDocument || typeof root.replaceChildren !== "function")
    throw new TypeError("createWorldProgressView requires a DOM root");
  const doc = root.ownerDocument;
  const section = doc.createElement("section");
  section.className = "g1-world-progress";
  section.setAttribute("aria-label", "观天地");
  const eyebrow = doc.createElement("p");
  eyebrow.className = "g1-world-progress__eyebrow";
  eyebrow.textContent = "天地渐开";
  const title = doc.createElement("h3");
  title.className = "g1-world-progress__title";
  const note = doc.createElement("p");
  note.className = "g1-world-progress__note";
  const track = doc.createElement("div");
  track.className = "g1-world-progress__track";
  track.setAttribute("role", "progressbar");
  track.setAttribute("aria-label", "地图已开放比例");
  track.setAttribute("aria-valuemin", "0");
  track.setAttribute("aria-valuemax", "100");
  const fill = doc.createElement("div");
  fill.className = "g1-world-progress__fill";
  track.append(fill);
  const meta = doc.createElement("p");
  meta.className = "g1-world-progress__meta";
  const button = doc.createElement("button");
  button.type = "button";
  button.className = "g1-world-progress__button";
  button.textContent = "请求开拓";
  const reason = doc.createElement("p");
  reason.className = "g1-world-progress__reason";
  section.append(eyebrow, title, note, track, meta, button, reason);
  root.replaceChildren(section);
  let current = null;
  let disposed = false;
  function click() {
    if (disposed || !current || current.canRequestExpand !== true ||
      !Object.hasOwn(REVELATION_STAGES, String(current.stage)) ||
      typeof onAction !== "function") return;
    onAction({ type: "request-map-expansion", stage: current.stage });
  }
  button.addEventListener("click", click);
  return {
    render(viewModel) {
      if (disposed) return;
      current = viewModel && typeof viewModel === "object" ? viewModel : null;
      const entry = current && Object.hasOwn(REVELATION_STAGES, String(current.stage))
        ? REVELATION_STAGES[current.stage] : null;
      title.textContent = entry?.title || "天地未明";
      note.textContent = entry?.note || "天地开放进度尚未载入。";
      const percent = displayPercent(current?.openedPercent);
      fill.style.width = percent === null ? "0%" : percent + "%";
      track.setAttribute("aria-valuenow", String(percent ?? 0));
      track.setAttribute("aria-valuetext", percent === null ? "开放比例未载" : percent + "%");
      meta.textContent = (percent === null ? "开放比例未载" : percent + "% 已开放") +
        "  ·  " + asText(current?.boundaryText, "边界未载");
      button.disabled = !entry || current?.canRequestExpand !== true;
      button.hidden = !current || current.stage === 100;
      reason.textContent = button.hidden || !button.disabled ? "" :
        asText(current?.disabledReason, "尚未达到开拓条件");
      reason.hidden = !reason.textContent;
    },
    destroy() {
      if (disposed) return;
      disposed = true;
      current = null;
      button.removeEventListener("click", click);
      section.remove();
    },
  };
}
