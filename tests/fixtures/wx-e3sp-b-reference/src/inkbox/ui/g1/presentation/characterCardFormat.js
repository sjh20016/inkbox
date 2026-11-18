// G1-W presentation only. Never read simulation state here.
export const G1_CHARACTER_SCHEMA = 1;
export const CHARACTER_TABS = Object.freeze([
  { id: "overview", label: "命簿" },
  { id: "cultivation", label: "修行" },
  { id: "fate", label: "改命" },
  { id: "history", label: "生平" },
]);

export function readable(value, fallback = "未载") {
  return value === undefined || value === null || value === ""
    ? fallback : String(value);
}

export function finiteNumber(value, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function cultivationProgress(cultivation = {}) {
  const exp = Math.max(0, finiteNumber(cultivation?.exp));
  const required = Math.max(0, finiteNumber(cultivation?.required));
  const percent = Number.isFinite(cultivation?.percent)
    ? Math.min(100, Math.max(0, cultivation.percent))
    : required > 0 ? Math.min(100, (exp / required) * 100) : 0;
  return { exp, required, percent };
}

export function isReadonlyIdentity(identity = {}) {
  return !identity || identity.status !== "alive" ||
    typeof identity.key !== "string" || identity.key.length === 0;
}

export function statusLabel(status) {
  return ({ alive: "在世", dead: "已故", ascended: "飞升", nether: "已落幽冥", missing: "失踪",
    unknown: "不可考" })[status] || "不可考";
}

export function safeStatus(status) {
  return ["alive", "dead", "ascended", "nether", "missing", "unknown"].includes(status)
    ? status : "unknown";
}
