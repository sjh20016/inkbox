// G2-W: pure creation request validation. No world imports or storage access.
export const WORLD_PRESETS = Object.freeze([
  { id: "small", label: "小景", width: 200, height: 128 },
  { id: "medium", label: "中堂", width: 288, height: 180 },
  { id: "large", label: "长卷", width: 384, height: 240 },
  { id: "huge", label: "广境", width: 512, height: 320 },
]);
export const TERRAIN_PRESETS = Object.freeze([
  { id: "standard", label: "标准", detail: "山水相宜" },
  { id: "mountain", label: "群山", detail: "重峦叠嶂" },
  { id: "wetland", label: "水泽", detail: "河湖纵横" },
]);
export function parseCreationSeed(value) {
  const text = String(value ?? "").trim();
  if (!/^[0-9]+$/.test(text)) throw new RangeError("种子须为 0 至 4294967295 的整数");
  const number = Number(text);
  if (!Number.isSafeInteger(number) || number < 0 || number > 0xffffffff) {
    throw new RangeError("种子须为 0 至 4294967295 的整数");
  }
  return number;
}
export function makeCreationRequest(form) {
  const preset = String(form?.preset ?? "");
  const terrainPreset = String(form?.terrainPreset ?? "");
  if (!WORLD_PRESETS.some((item) => item.id === preset)) throw new RangeError("未知天地幅员");
  if (!TERRAIN_PRESETS.some((item) => item.id === terrainPreset)) throw new RangeError("未知地貌预设");
  if (typeof form?.progressive !== "boolean") throw new TypeError("渐开天地必须是布尔值");
  return { type: "create-world", options: {
    preset, terrainPreset, seed: parseCreationSeed(form?.seed), progressive: form.progressive,
  } };
}
export function safeSlots(slots) {
  return (Array.isArray(slots) ? slots : []).filter((slot) =>
    slot && (typeof slot.id === "string" || Number.isSafeInteger(slot.id))).slice(0, 32);
}
