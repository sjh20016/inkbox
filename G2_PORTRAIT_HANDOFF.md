# G2-P Portrait Engine · Implementation Handoff

Branch: feat/g2-p-portrait-engine-web; base: feat/g2-presentation-web @ 58ceefe695dbc681097ad6fd9b195a90ea137969.

## Delivered modules

- v2/portraitSchema.js: shared slot order, fixed IDs, 1024 master / 512 PNG canvas spec.
- v2/portraitGenome.js: founder recipe, explicit immutable genome, two-parent/single-parent inheritance and opt-in legacy appearance mapping.
- v2/portraitState.js: host-supplied states and effects. Never infer a permanent wound from transient attack FX.
- v2/proceduralPortraitPack.js: closed-shape SVG placeholder asset family.
- v2/portraitAssetRegistry.js: validates local image manifest, PNG fallback to procedural nodes.
- v2/portraitComposer.js: buildPortraitLayerPlan() and createLayeredCharacterPortrait(root,{registry}).
- v2/portraitV2.css: namespaced styling, existing characterPortrait.css remains compatible.
- assets/portraits/inkbox-face-v1/: empty local hand-drawn pack, documented PNG manifest format.
- research/g2-portrait-preview/: four-mode self-contained fixture workbench with local PNG test override.
- scripts/inkbox-g2-portrait-check.mjs: node assertion and simplified DOM lifecycle test.

## ViewModel contract

createLayeredCharacterPortrait(root,{registry?}) => {render(model),getPlan(),destroy()}
model: {identityKey,appearanceSeed?,appearance?,genome?,style?,portraitState?,status?,alt?}.
genome has stable genetic identifiers: face,eyes,brows,nose,mouth,skin,hair.
style has non-genetic IDs: backHair,frontHair,robe,collar,ornament,motif,accent.
portraitState is a **host-confirmed fact mapping**: {ageStage: youth|adult|middle|elder, injury:0..3, scar:boolean, ghost:boolean, corruption:0..3, technique:none|fire|frost|wood|yin, expression?}.
status remains the existing G2-W outer-frame value. Only host-provided evidence may set states; the view never reads hp, age, runtime FX, Soul or World.
identityKey must include stable world/plane and entity identities. Rerender with the same recipe retains the same DOM; any real data change can redraw finite SVG groups. Old G2-W createCharacterPortrait remains unchanged for compatibility.

## Asset and inheritance rules

Manifest: assets/portraits/inkbox-face-v1/manifest.json with schemaVersion=1, slots mapping stable variant ID to relative .png path.
Example: {"id":"inkbox-face-v1","schemaVersion":1,"slots":{"eyes":{"calm-01":"eyes/calm-01.png"}}}.
PNG master 1024 square, full transparent export 512 square, untrimmed, aligned to viewBox 0 0 100 100. Missing slot or failed image load immediately falls back to procedural render.
Slot sequence: background/backHair/robe/neck/face/ears/eyes/brows/nose/mouth/cheeks/skinMarks/frontHair/ornament/effects/frame.
Do not rename IDs after public saves exist; pin manifest versions. Personal hand-drawn art overwrites parts gradually without touching genome and SVG rendering rules.
inheritPortraitGenome({parentA,parentB,childKey,mutationRate}) is pure, deterministic and makes **no claim** to persist World genetics. Parent snapshots must be taken at birth; read-time derivation from currently living parents is forbidden. Parent A/B are sex-neutral, matching sim/family.js. No second RNG stream.

## Codex integration

1. Merge G1 and G2-W at their established integration baseline before accepting the new G2-P modules.
2. In the G1 character header use the v2 constructor on its own DOM root. Do not fork G1 UI source before integration.
3. Let the formal runtime create and persist a compact *appearance genome snapshot* on birth. src/inkbox/sim/family.js currently records parentA/B but NOT parents' portrait genome; do not confuse their gameplay heritageQ/B/M fields with visual genetics.
4. Update serialize/restore together after choosing persistence format; preserve old save compatibility and existing id/World semantics. No PNG/SVG blobs in saves.
5. Define body vs soul identity contracts for ghost, possession, reincarnation and ascent before connecting these transformations.
6. Adapt current combat, technique, age and soul facts into a normalized portraitState in host code. No UI invented facts.
7. Only Codex edits main.js, sim, save, render3d, G1 official card and project CI. The isolated branch does not.

## Test evidence and gaps

Standalone: python -m http.server 8000, visit http://localhost:8000/research/g2-portrait-preview/index.html.
Test command: node scripts/inkbox-g2-portrait-check.mjs. Contains pure data, safety, file-format, family and fake DOM render/destroy checks.
Source logic was evaluated directly from GitHub via an in-process JS evaluator, NOT a real Node/Chromium run. The Node file must still be run on a clone. Real browser layout, keyboard, image decode/fallback and 64-svg memory/performance not yet accepted.

Presentation only. Do not merge before G1 integration.
