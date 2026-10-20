// Deterministic presentation only. The closed palettes keep untrusted identity data
// out of SVG markup, and no World RNG is used.
const SKIN = ["#eac5a4", "#f1d7b9", "#dcb193", "#b98d72", "#f3d9c6"];
const HAIR = ["#2e3030", "#45403c", "#4f4844", "#68635e", "#292d36"];
const ROBE = ["#e3e2d7", "#b8c8b9", "#9bacae", "#c2a88c", "#ddd0bd", "#a6b2a7"];
const ACCENT = ["#8e4942", "#6b857e", "#7d7365", "#4d6d79"];
const FACE = [
  "M34 31 Q27 40 30 60 Q34 78 50 83 Q66 78 70 60 Q73 40 66 31 Z",
  "M32 32 Q24 49 32 66 Q38 80 50 82 Q62 80 68 66 Q76 49 68 32 Z",
  "M32 34 Q27 48 32 66 Q37 81 50 84 Q63 81 68 66 Q73 48 68 34 Z",
  "M35 31 Q29 43 31 61 Q35 76 50 80 Q65 76 69 61 Q71 43 65 31 Z",
];
const EYES = [
  ["M35 52 Q40 49 44 52", "M56 52 Q60 49 65 52"],
  ["M35 52 L44 51", "M56 51 L65 52"],
  ["M35 51 Q40 54 44 51", "M56 51 Q60 54 65 51"],
  ["M35 50 Q40 47 44 50", "M56 50 Q60 47 65 50"],
  ["M35 52 L44 53", "M56 53 L65 52"],
  ["M35 51 Q39 50 43 49", "M57 49 Q61 50 65 51"],
  ["M35 52 Q39 55 44 52", "M56 52 Q61 55 65 52"],
];
const HAIRSTYLE = [
  "M27 51 Q17 18 36 15 Q51 8 66 17 Q84 31 72 58 L65 37 Q50 33 35 41 Z",
  "M27 60 Q19 18 46 14 Q73 13 76 43 L70 67 L65 34 Q49 29 34 38 Z",
  "M27 52 Q18 23 36 16 L51 10 L70 20 Q83 40 70 57 L66 36 L34 39 Z",
  "M29 67 Q13 23 38 16 Q55 7 68 21 Q81 37 72 62 L65 36 L33 42 Z",
  "M26 60 Q17 26 32 18 Q52 4 70 19 Q83 40 74 62 L66 38 Q54 44 35 37 Z",
  "M26 56 Q17 20 40 15 Q63 9 72 25 Q79 41 71 58 L65 37 L34 38 Z",
  "M29 59 Q20 27 39 17 Q60 8 72 27 Q81 47 71 60 L65 40 Q51 35 34 42 Z",
  "M27 62 Q20 18 42 14 Q66 13 74 33 L71 65 L65 39 Q49 31 34 42 Z",
];
const COLLAR = [
  "M31 83 L49 96 L58 86 L50 82 L39 89 Z",
  "M32 84 L48 95 L66 82 L59 80 L46 88 Z",
  "M31 83 L50 95 L65 84 L60 84 L50 90 Z",
  "M35 83 L50 95 L63 83 L56 80 L50 88 Z",
  "M30 83 L47 95 L68 83 L60 82 L48 90 Z",
];
const MOTIF = [
  '<circle cx="50" cy="48" r="40" fill="none" stroke="#98aaa0" stroke-width=".55" opacity=".6"/>',
  '<path d="M8 70 Q20 49 33 65 T60 63 T92 56" fill="none" stroke="#9aada8" stroke-width="1.5" opacity=".6"/>',
  '<circle cx="70" cy="27" r="15" fill="none" stroke="#9ea9a0" opacity=".45"/><path d="M10 72 H86" stroke="#bcb8a7" opacity=".6"/>',
  '<path d="M10 28 Q34 2 60 20 T97 30 M3 67 Q45 53 96 75" fill="none" stroke="#9da7a0" opacity=".45"/>',
];
const INK = "#353936";

function hash(value) {
  let result = 2166136261;
  for (const character of String(value)) {
    result ^= character.codePointAt(0);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}
function choice(explicit, salt, size, source) {
  return Number.isInteger(explicit) && explicit >= 0 && explicit < size
    ? explicit : hash(source + ":" + salt) % size;
}

/** identityKey is the formal stable key; names and status never affect appearance. */
export function generatePortraitParts({ identityKey, appearance, appearanceSeed } = {}) {
  const source = appearanceSeed !== undefined && appearanceSeed !== null
    ? String(appearanceSeed) : String(identityKey ?? "unknown");
  const a = appearance && typeof appearance === "object" && !Array.isArray(appearance) ? appearance : {};
  return Object.freeze({
    face: choice(a.face, 1, FACE.length, source),
    eyes: choice(a.eyes, 2, EYES.length, source),
    hair: choice(a.hair, 3, HAIRSTYLE.length, source),
    skinColor: choice(a.skinColor, 4, SKIN.length, source),
    hairColor: choice(a.hairColor, 5, HAIR.length, source),
    robe: choice(a.robe, 6, ROBE.length, source),
    collar: choice(a.collar, 7, COLLAR.length, source),
    motif: choice(a.motif, 8, MOTIF.length, source),
    accent: choice(a.accent, 9, ACCENT.length, source),
    signature: hash(source).toString(16).padStart(8, "0"),
  });
}

export function portraitSvg(options = {}) {
  const p = generatePortraitParts(options);
  const eye = EYES[p.eyes];
  const hair = HAIR[p.hairColor];
  const skin = SKIN[p.skinColor];
  const robe = ROBE[p.robe];
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" aria-hidden="true">' +
    '<rect width="100" height="100" fill="#edeae1"/>' + MOTIF[p.motif] +
    '<path d="M5 100 Q10 78 33 76 L50 81 L67 76 Q90 77 95 100 Z" fill="' + robe + '" stroke="' + INK + '" stroke-width="1.6"/>' +
    '<path d="M39 75 L40 86 L50 92 L60 86 L61 75" fill="' + hair + '"/>' +
    '<path d="' + FACE[p.face] + '" fill="' + skin + '" stroke="' + INK + '" stroke-width="1.65"/>' +
    '<path d="M36 48 Q40 46 44 48 M56 48 Q60 46 64 48" fill="none" stroke="' + INK + '" stroke-width="1.4" opacity=".7"/>' +
    '<g fill="none" stroke="' + INK + '" stroke-width="1.8" stroke-linecap="round"><path d="' + eye[0] + '"/><path d="' + eye[1] + '"/></g>' +
    '<path d="M49 54 L48 62 M46 69 Q50 71 54 69" fill="none" stroke="#946e62" stroke-width="1.1" stroke-linecap="round"/>' +
    '<path d="' + HAIRSTYLE[p.hair] + '" fill="' + hair + '" stroke="' + INK + '" stroke-width="1.9" stroke-linejoin="round"/>' +
    '<path d="M29 41 Q26 57 33 74 L29 87 Q21 71 25 50 Z" fill="' + hair + '" stroke="' + INK + '" stroke-width="1.1"/>' +
    '<path d="M70 41 Q74 56 66 74 L71 86 Q80 69 74 47 Z" fill="' + hair + '" stroke="' + INK + '" stroke-width="1.1"/>' +
    '<path d="' + COLLAR[p.collar] + '" fill="#f8f3e7" stroke="' + INK + '" stroke-width="1.15"/>' +
    '<path d="M50 92 L57 100 L64 100" fill="none" stroke="' + ACCENT[p.accent] + '" stroke-width="3"/>' +
    '<path d="M16 96 Q50 91 84 96" stroke="#333832" stroke-opacity=".19" fill="none"/></svg>';
}
