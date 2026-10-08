import {
  G1_CHARACTER_SCHEMA, CHARACTER_TABS, readable, cultivationProgress, safeStatus,
  statusLabel,
} from "./characterCardFormat.js";

function node(doc, tag, className, value) {
  const result = doc.createElement(tag);
  if (className) result.className = className;
  if (value !== undefined) result.textContent = value;
  return result;
}
function put(target, value) {
  if (target.textContent !== value) target.textContent = value;
}

/**
 * A read-only G1-W character card. CSS must be loaded separately by its host.
 * W1 provides the stable mount/render/destroy lifecycle and composition shell.
 */
export function createCharacterCardView(root, { onAction } = {}) {
  if (!root || typeof root.replaceChildren !== "function") {
    throw new TypeError("createCharacterCardView requires a DOM root");
  }
  const doc = root.ownerDocument;
  const card = node(doc, "section", "g1-character");
  card.setAttribute("aria-label", "人物命簿");
  const heading = node(doc, "header", "g1-character__header");
  const eyebrow = node(doc, "div", "g1-character__eyebrow", "坐天观井  /  人物命簿");
  const nameRow = node(doc, "div", "g1-character__name-row");
  const name = node(doc, "h2", "g1-character__name");
  const status = node(doc, "span", "g1-character__status");
  nameRow.append(name, status);
  const realm = node(doc, "p", "g1-character__realm");
  const summary = node(doc, "p", "g1-character__summary");
  heading.append(eyebrow, nameRow, realm, summary);

  const growth = node(doc, "section", "g1-character__growth");
  const progressHeading = node(doc, "div", "g1-character__growth-heading");
  const growthLabel = node(doc, "span", "", "修为积累");
  const growthPercent = node(doc, "strong", "g1-character__growth-percent", "0%");
  progressHeading.append(growthLabel, growthPercent);
  const track = node(doc, "div", "g1-character__track");
  track.setAttribute("role", "progressbar");
  track.setAttribute("aria-label", "修为进度");
  track.setAttribute("aria-valuemin", "0");
  track.setAttribute("aria-valuemax", "100");
  const fill = node(doc, "div", "g1-character__track-fill");
  track.append(fill);
  const progressMeta = node(doc, "div", "g1-character__growth-meta");
  growth.append(progressHeading, track, progressMeta);

  const navigation = node(doc, "nav", "g1-character__tabs");
  navigation.setAttribute("aria-label", "命簿分页");
  CHARACTER_TABS.forEach((tab, index) => {
    const item = node(doc, "button", "g1-character__tab", tab.label);
    item.type = "button";
    item.disabled = true;
    item.setAttribute("aria-current", index === 0 ? "page" : "false");
    navigation.append(item);
  });
  const content = node(doc, "div", "g1-character__body");
  const note = node(doc, "p", "g1-character__empty", "此处将展现人物的行迹、修行与命数。");
  content.append(note);
  const footer = node(doc, "footer", "g1-character__footer", "观其所历，不代其所行");
  card.append(heading, growth, navigation, content, footer);
  root.replaceChildren(card);

  let disposed = false;
  function render(viewModel) {
    if (disposed) return;
    const data = viewModel && viewModel.schemaVersion === G1_CHARACTER_SCHEMA
      ? viewModel : null;
    const identity = data?.identity || {};
    const header = data?.header || {};
    const cultivated = cultivationProgress(data?.cultivation);
    put(name, readable(identity.name, "无名之人"));
    put(status, statusLabel(identity.status));
    card.dataset.status = safeStatus(identity.status);
    put(realm, readable(header.realm, "境界未载"));
    put(summary, [header.ageText, header.affiliation, header.stateText]
      .filter(item => item !== undefined && item !== null && item !== "").join(" · ") || "生平尚待考录");
    put(growthPercent, cultivated.percent.toFixed(1).replace(/\.0$/, "") + "%");
    fill.style.width = cultivated.percent + "%";
    track.setAttribute("aria-valuenow", String(cultivated.percent));
    put(progressMeta, data?.cultivation?.stateText || "修为未载");
    put(note, data ? "人物命簿四卷正在编纂。" : "无可考录之人");
  }
  function destroy() {
    if (disposed) return;
    disposed = true;
    card.remove();
  }
  return { render, destroy };
}
