// A pure formatter and display-only view. All values originate in Codex's runtime.
import { readable } from "./characterCardFormat.js";

function valueOrUnknown(value) {
  return value === null || value === undefined || value === "" ? "未载" : String(value);
}

/** Expected: { seed, terrainName, mapSize:{width,height}, gradualAccess, openedRangeText } */
export function formatWorldCreationInfo(model = {}) {
  const size = model?.mapSize;
  const width = size?.width;
  const height = size?.height;
  const sizeText = Number.isInteger(width) && width > 0 &&
    Number.isInteger(height) && height > 0
    ? width + " × " + height : valueOrUnknown(model?.mapSizeText);
  const gradual = model?.gradualAccess === true ? "已启用" :
    model?.gradualAccess === false ? "未启用" : "未载";
  return [
    { label: "世界种子", value: valueOrUnknown(model?.seed) },
    { label: "地貌", value: valueOrUnknown(model?.terrainName) },
    { label: "天地幅员", value: sizeText },
    { label: "渐进开放", value: gradual },
    { label: "已开放范围", value: valueOrUnknown(model?.openedRangeText) },
  ];
}

export function createWorldCreationInfoView(root) {
  if (!root?.ownerDocument || typeof root.replaceChildren !== "function")
    throw new TypeError("createWorldCreationInfoView requires a DOM root");
  const doc = root.ownerDocument;
  const section = doc.createElement("section");
  section.className = "g1-world-creation";
  section.setAttribute("aria-label", "创世信息");
  const title = doc.createElement("h3");
  title.textContent = "天地初定";
  const rows = doc.createElement("dl");
  section.append(title, rows);
  root.replaceChildren(section);
  let disposed = false;
  return {
    render(model) {
      if (disposed) return;
      const items = formatWorldCreationInfo(model);
      for (let i = 0; i < items.length; i++) {
        let dt = rows.children[i * 2], dd = rows.children[i * 2 + 1];
        if (!dt || !dd) {
          dt = doc.createElement("dt"); dd = doc.createElement("dd");
          rows.append(dt, dd);
        }
        const label = readable(items[i].label);
        const value = readable(items[i].value);
        if (dt.textContent !== label) dt.textContent = label;
        if (dd.textContent !== value) dd.textContent = value;
      }
    },
    destroy() {
      if (disposed) return;
      disposed = true;
      section.remove();
    },
  };
}
