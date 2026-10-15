// The character family is a projection of simulation data. Never write these
// choices back to an entity, save, or simulation random stream.
export const CHARACTER_ROLES = Object.freeze([
  'basic', 'sect_disciple', 'wanderer', 'elder', 'ghost', 'alchemist',
]);

const SECT_COLORS = Object.freeze(['#466487', '#8d4747', '#557759', '#76717c', '#333238']);

export function factionPaletteIndex(color) {
  if (typeof color !== 'string') return 5;
  const rgb = /^#([0-9a-f]{6})$/i.exec(color);
  if (!rgb) return 5;
  const value = parseInt(rgb[1], 16);
  const r = (value >> 16) & 255, g = (value >> 8) & 255, b = value & 255;
  let best = 0, distance = Infinity;
  for (let i = 0; i < SECT_COLORS.length; i += 1) {
    const candidate = parseInt(SECT_COLORS[i].slice(1), 16);
    const dr = r - ((candidate >> 16) & 255);
    const dg = g - ((candidate >> 8) & 255);
    const db = b - (candidate & 255);
    const d = dr * dr + dg * dg + db * db;
    if (d < distance) { distance = d; best = i; }
  }
  // Palette order is specified by the material manifest. This compact mapping
  // gives factions a stable large colour block without per-faction geometry.
  return [5, 7, 11, 10, 3][best];
}

export function characterAppearanceOf(entity, cls, color) {
  if (cls === 'wraith') {
    return entity?.soulKind === 'ghostCultivator'
      ? { role: 'ghost', paletteIndex: 3 }
      : null;
  }
  if (cls !== 'cultivator') return null;
  const level = Number(entity?.level) || 0;
  let role = 'basic';
  if (entity?.dao?.path?.key === 'alchemy') role = 'alchemist';
  else if (level >= 20) role = 'elder';
  else if ((Number(entity?.faction) || 0) > 0) role = 'sect_disciple';
  return { role, paletteIndex: (Number(entity?.faction) || 0) > 0
    ? factionPaletteIndex(color) : undefined };
}
