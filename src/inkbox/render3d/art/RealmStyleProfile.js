// Fixed presentation colours. Indices in terrain.palette match TERRAIN_INFO;
// atlas12 follows the cultivator manifest's twelve semantic slots.
const freeze = value => {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
};

export const REALM_STYLES = freeze({
  mortal: {
    name: 'MortalStyleV1',
    plane: 'mortal',
    paper: { color: '#ECE4D2', background: '#ECE4D2', exposure: 1.02 },
    terrain: {
      palette: ['#5B777C','#718F94','#83A6A9','#A5BFC0','#D8CEB8','#A9B77D','#B9BE89','#627A62','#435E50','#B8B68B','#C9AD75','#C9C6B3','#8A937A','#8C9184','#70868A','#58696A','#DDD9CB','#C8AE59','#755F50','#89857D','#A66E49','#AAA08C','#B58A5F'],
      rock: '#70868A', soil: '#B58A5F', slopeStrength: 0.30,
    },
    water: { color: '#8FB5B8', opacity: 0.43 },
    vegetation: { palette: ['#A9B77D','#627A62','#435E50'], tints5: ['#95A36A','#6C8D62','#577E67','#4D7170','#B0A368'], instanceTintWeight: 0.55, distanceFade: 0.24 },
    building: { palette: { wall: '#DED5BE', roof: '#53605C', wood: '#79664F', earth: '#B58A5F', accent: '#B75A49' }, instanceTintWeight: 0.10, distanceFade: 0.24 },
    entity: { palette: { cloth: '#70868A', skin: '#C9B698', accent: '#B75A49' }, atlas12: ['#C9B698','#ECE4D2','#D8CEB8','#303533','#70868A','#627A62','#B58A5F','#B75A49','#8FB5B8','#C8AE59','#846C80','#627A62'], instanceTintWeight: 0.24, distanceFade: 0.20 },
    pilotPalette: { paper: '#ECE4D2', warm: '#DED5BE', ink: '#303533', blue: '#70868A', wood: '#79664F', earth: '#B58A5F', red: '#B75A49', cyan: '#A9B77D', skin: '#C9B698' },
    boundary: { color: '#A59C89', rift: '#70868A' },
    pigment: { density: 0.66, saturation: 0.58, boundaryStrength: 0.14, distanceFade: 0.42 },
    ink: { structure: 0.59, silhouette: 0.18, density: 0.39, dryBrush: 0.31, feibai: 0.13, color: '#303533' },
    contrast: 1.03,
    atmosphere: { color: '#D8CEB8', strength: 0.025, low: -3, high: 15, near: 60, far: 180 },
    accentLimit: 0.05,
  },
  nether: {
    name: 'NetherStyleV1',
    plane: 'nether',
    paper: { color: '#D5D1C7', background: '#D5D1C7', exposure: 0.88 },
    terrain: {
      palette: ['#252C2B','#303A38','#40514E','#566D69','#8B8B84','#666760','#777770','#353A39','#242827','#625D52','#66594D','#8B8B84','#4D554F','#353A39','#252827','#181A19','#D9D3C6','#66594D','#272320','#46423C','#353A39','#45413B','#60584C'],
      rock: '#181A19', soil: '#66594D', slopeStrength: 0.66,
    },
    water: { color: '#354C49', opacity: 0.48 },
    vegetation: { palette: ['#353A39','#566D69','#66594D'], tints5: ['#353A39','#242827','#566D69','#66594D','#8B8B84'], instanceTintWeight: 0.08 },
    building: { palette: { wall: '#8B8B84', roof: '#181A19', wood: '#353A39', earth: '#66594D', accent: '#8E302B' }, instanceTintWeight: 0.04 },
    // Slot 8 is the actual soul_lamp.lamp_glass; slot 7 stays grey for faction robes.
    entity: { palette: { cloth: '#353A39', skin: '#D9D3C6', accent: '#C63A2E' }, atlas12: ['#D9D3C6','#D5D1C7','#8B8B84','#181A19','#566D69','#353A39','#66594D','#353A39','#C63A2E','#8B8B84','#66594D','#353A39'], instanceTintWeight: 0.09 },
    pilotPalette: { paper: '#D9D3C6', warm: '#8B8B84', ink: '#181A19', blue: '#566D69', wood: '#353A39', earth: '#66594D', red: '#8E302B', cyan: '#566D69', skin: '#D9D3C6' },
    boundary: { color: '#484D49', top: '#484D49', base: '#242827', rift: '#8E302B' },
    pigment: { density: 0.77, saturation: 0.52, boundaryStrength: 0.22 },
    ink: { structure: 0.89, silhouette: 0.39, density: 0.72, dryBrush: 0.78, feibai: 0.52, color: '#181A19' },
    contrast: 1.30,
    atmosphere: { color: '#8B8B84', strength: 0.09, low: -25, high: 12, near: 50, far: 145 },
    accentLimit: 0.03,
  },
  upper: {
    name: 'UpperStyleV1',
    plane: 'upper',
    paper: { color: '#E8DEC8', background: '#E8DEC8', exposure: 1.02 },
    terrain: {
      palette: ['#386786','#426F97','#4A878D','#90B3A3','#D5BD85','#B1A370','#B8A66A','#3E8069','#3B6856','#BFA16C','#C6AB72','#E8DCC4','#879B78','#578E7C','#3C648C','#855A40','#E8DCC4','#B89B55','#A66E49','#B08B67','#A55B45','#9B7959','#C8AE7C'],
      rock: '#3C648C', soil: '#A66E49', slopeStrength: 0.44,
    },
    water: { color: '#557D91', opacity: 0.42 },
    vegetation: { palette: ['#6F9877','#557E6A','#B89B55'], tints5: ['#6F9877','#557E6A','#65A39A','#B89B55','#8E9B7A'], instanceTintWeight: 0.10 },
    building: { palette: { wall: '#E4D6B7', roof: '#46392E', wood: '#A66E49', earth: '#C8AE7C', accent: '#B89B55' }, instanceTintWeight: 0.07 },
    entity: { palette: { cloth: '#557D91', skin: '#E4D6B7', accent: '#B73F32' }, atlas12: ['#D6BE9D','#E4D6B7','#C8AE7C','#46392E','#557D91','#6F9877','#A66E49','#B73F32','#65A39A','#B89B55','#A55B45','#6F9877'], instanceTintWeight: 0.15 },
    pilotPalette: { paper: '#E4D6B7', warm: '#C8AE7C', ink: '#46392E', blue: '#557D91', wood: '#A66E49', earth: '#C8AE7C', red: '#B73F32', cyan: '#6F9877', skin: '#D6BE9D' },
    boundary: { color: '#9D9275', top: '#A89878', base: '#756C5B', rift: '#557D91' },
    pigment: { density: 0.71, saturation: 0.84, boundaryStrength: 0.19, colorLayer: 0.90 },
    ink: { structure: 0.68, silhouette: 0.23, density: 0.46, dryBrush: 0.41, feibai: 0.24, color: '#46392E' },
    contrast: 1.09,
    // Low valley wash is attached to upper terrain. It is not an independent cloud surface.
    atmosphere: { color: '#ECE5D6', strength: 0.18, low: 14, high: 40, near: 65, far: 180 },
    accentLimit: 0.08,
  },
});

export function realmStyleFor(plane) {
  const style = REALM_STYLES[plane];
  if (!style) throw new Error(`Unknown realm style plane: ${plane}`);
  return style;
}

export const MortalStyleV1 = REALM_STYLES.mortal;
export const NetherStyleV1 = REALM_STYLES.nether;
export const UpperStyleV1 = REALM_STYLES.upper;

// Environment UVs encode these semantic slots, never authored RGB authority.
// Reuse the Stage palette so buildings, rocks and later ghost silhouettes agree.
export const ENVIRONMENT_PALETTE_SLOTS = Object.freeze([
  'paper', 'paperDeep', 'paperShade', 'mist', 'ink', 'inkMid', 'inkLight',
  'stone', 'stoneDark', 'wood', 'woodDark', 'clay', 'cinnabar', 'rouge',
  'gold', 'azurite', 'indigo', 'malachite', 'pineGreen', 'orchid',
  'upperA', 'upperB', 'upperC', 'upperD', 'nether', 'netherMid', 'soulFlame', 'snow',
]);

export function realmEnvironmentPalette(style) {
  if (typeof style === 'string') style = realmStyleFor(style);
  if (!style?.building?.palette || !style?.entity?.atlas12) throw new Error('Environment palette requires a realm style');
  const b = style.building.palette, p = style.pilotPalette, e = style.entity.atlas12;
  return [
    b.wall, p.warm, style.terrain.palette[11], style.atmosphere.color,
    style.ink.color, b.roof, style.terrain.rock,
    style.terrain.rock, style.terrain.palette[15], b.wood, style.terrain.palette[18],
    b.earth, b.accent, style.entity.palette.accent, e[9],
    style.terrain.palette[14], style.terrain.palette[0], style.vegetation.palette[0],
    style.vegetation.palette[2], e[10],
    style.terrain.palette[14], style.terrain.palette[13], style.terrain.palette[3],
    style.paper.color, style.ink.color, style.terrain.palette[2], e[8], e[1],
  ];
}

/** Semantic swatches share the same geometry, with colours owned by its layer. */
export function realmPilotColor(style, category, swatch) {
  if (category === 'building') {
    const role = { paper: 'wall', warm: 'wall', ink: 'roof', wood: 'wood', earth: 'earth', red: 'accent' }[swatch];
    if (role) return style.building.palette[role];
  } else if (category === 'entity') {
    const role = { blue: 'cloth', skin: 'skin', red: 'accent' }[swatch];
    if (role) return style.entity.palette[role];
  } else if (category === 'vegetation' && swatch === 'cyan') return style.vegetation.palette[0];
  return style.pilotPalette[swatch];
}
