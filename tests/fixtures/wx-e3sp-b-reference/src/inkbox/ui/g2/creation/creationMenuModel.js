// Presentation requests use the same preset table and seed parser as the game.
import { WORLD_PRESETS as GAME_PRESETS } from '../../../core/config.js';
import { parseSeed, creationOptions } from '../../worldCreation.js';
export const WORLD_PRESETS = Object.freeze(Object.values(GAME_PRESETS).map((item) => ({
  id: item.key, label: item.label.split(' · ')[0], width: item.w, height: item.h,
})));
export const TERRAIN_PRESETS = Object.freeze([
  { id: "standard", label: "标准", detail: "山水相宜" },
  { id: "mountains", label: "群山", detail: "重峦叠嶂" },
  { id: "wetlands", label: "水泽", detail: "河湖纵横" },
  { id: "legacy", label: "兼容旧世界", detail: "沿用旧版地貌" },
]);
export const parseCreationSeed = parseSeed;
export function makeCreationRequest(form) {
  const preset = String(form?.preset ?? "");
  const terrainPreset = String(form?.terrainPreset ?? "");
  if (!WORLD_PRESETS.some((item) => item.id === preset)) throw new RangeError("未知天地幅员");
  if (!TERRAIN_PRESETS.some((item) => item.id === terrainPreset)) throw new RangeError("未知地貌预设");
  if (typeof form?.progressive !== "boolean") throw new TypeError("渐开天地必须是布尔值");
  const options = creationOptions({ terrainPreset, progressive: form.progressive });
  return { type: "create-world", options: { preset, seed: parseCreationSeed(form?.seed), ...options } };
}
export function safeSlots(slots) {
  return (Array.isArray(slots) ? slots : []).filter((slot) =>
    slot && (typeof slot.id === "string" || Number.isSafeInteger(slot.id)));
}
