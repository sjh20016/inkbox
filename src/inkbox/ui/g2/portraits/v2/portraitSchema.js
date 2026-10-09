// G2-P asset contract v1: immutable slot identifiers, normalized 100x100 viewport.
// Painting target: 1024 square master; PNG export: 512 square, full canvas, untrimmed.
export const PORTRAIT_CANVAS=Object.freeze({viewBox:"0 0 100 100",master:1024,exportSize:512});
export const SLOT_ORDER=Object.freeze([
  "background","backHair","robe","neck","face","ears",
  "eyes","brows","nose","mouth","cheeks","skinMarks",
  "frontHair","ornament","effects","frame"
]);
export const GENETIC_SLOTS=Object.freeze(["face","eyes","brows","nose","mouth","skin","hair"]);
export const STYLE_SLOTS=Object.freeze(["backHair","frontHair","robe","collar","ornament","motif","accent"]);
export const VARIANTS=Object.freeze({
  face:Object.freeze(["oval-01","round-01","long-01","square-01","soft-01"]),
  eyes:Object.freeze(["calm-01","round-01","sharp-01","droop-01","narrow-01","bright-01","sleepy-01","soft-01"]),
  brows:Object.freeze(["level-01","sword-01","arch-01","low-01","short-01","wispy-01"]),
  nose:Object.freeze(["dot-01","stroke-01","fine-01"]),
  mouth:Object.freeze(["neutral-01","smile-01","serious-01","soft-01","down-01"]),
  skin:Object.freeze(["ivory-01","peach-01","tan-01","ochre-01","pale-01"]),
  hair:Object.freeze(["ink-01","brown-01","ash-01","silver-01","blueblack-01"]),
  backHair:Object.freeze(["loose-01","tied-01","bun-01","short-01","double-01","tail-01"]),
  frontHair:Object.freeze(["part-01","sweep-01","straight-01","open-01","tuft-01","side-01","double-01","short-01"]),
  robe:Object.freeze(["paper-01","sage-01","stone-01","ochre-01","slate-01"]),
  collar:Object.freeze(["cross-01","scholar-01","high-01","open-01","traveler-01"]),
  ornament:Object.freeze(["none","pin-01","ribbon-01","bead-01","cord-01"]),
  motif:Object.freeze(["none","round-01","mist-01","line-01"]),
  accent:Object.freeze(["cinnabar-01","jade-01","ink-01","blue-01"]),
});
export const PALETTES=Object.freeze({
  skin:Object.freeze(["#f4d8bf","#e6c2aa","#cda085","#b98469","#e9d7c7"]),
  hair:Object.freeze(["#252c2d","#58483f","#817c73","#b7b5af","#303b47"]),
  robe:Object.freeze(["#e6e1d2","#afc3b8","#b0b9ba","#cdb49b","#7a8b91"]),
  accent:Object.freeze(["#a64b42","#5e867b","#645a50","#58798b"]),
  ink:"#303637",paper:"#f1eee5",ghost:"#a7bdc1",gold:"#bda27a"
});
export function hasVariant(slot,value){return typeof value==="string"&&(VARIANTS[slot]||[]).includes(value);}
export function slotIndex(slot,id){return (VARIANTS[slot]||[]).indexOf(id);}
