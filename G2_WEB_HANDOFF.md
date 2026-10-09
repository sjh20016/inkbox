# G2-W · Presentation & Player Experience / Codex Handoff

Date: 2026-10-09
Repository: sjh20016/inkbox
Branch: feat/g2-presentation-web
Base main: fc612ac9470b48aaaa3291b7fc39a9e0bdf87fff

**Presentation only. Do not merge before G1 integration.**

This branch was created from main, not from G1-W, G1 runtime or the parallel Codex G2 branch. It intentionally adds no main.js, sim, world, core, save, render3d, G1 or CI edits.

## 1. Component files and imports

All imports below are relative to the repository root. CSS must be linked separately.

A. Creation: src/inkbox/ui/g2/creation/
- creationMenuModel.js: WORLD_PRESETS, TERRAIN_PRESETS, parseCreationSeed, makeCreationRequest, safeSlots
- creationMenuView.js: createCreationMenuView(root, {onAction})
- creationMenu.css

B. Portraits: src/inkbox/ui/g2/portraits/
- portraitGenerator.js: generatePortraitParts(input), portraitSvg(input), PORTRAIT_VARIANTS
- characterPortrait.js: createCharacterPortrait(root)
- characterPortrait.css

C. Combat: src/inkbox/ui/g2/combat/
- combatObserverModel.js: normalizeCombatEvents(events), combatCharacterStatus(character), combatObserverModel(input)
- combatObserverView.js: createCombatObserverView(root, {onAction})
- combatObserver.css

D. Busuanzi: src/inkbox/ui/g2/busanzi/
- busanziBridgeModel.js: TASK_KINDS, TASK_STATES, normalizeBusanziModel(input), makeBusanziTaskRequest(type,target,capabilities)
- busanziPortrait.js: busanziPortraitSvg({wind})
- busanziBridgeView.js: createBusanziBridgeView(root, {onAction})
- busanziBridge.css

E. World edge: src/inkbox/ui/g2/realm-edge/
- realmEdgeStyles.js: EDGE_PALETTES, EDGE_SPECS, buildRealmEdgeGeometry(points,options), geometryToSvgPath(nodes,project)
- realmEdgePreview.js: createRealmEdgePreview(root)
- realmEdgePreview.css

All DOM view constructors return {render(viewModel), destroy()}. Views own only transient presentation state: drafts, open tab, collapsed panel, guide visibility and DOM nodes. Every gameplay action is emitted through onAction. Never use these views as a source of World facts.

Preview: research/g2-web-preview/index.html, workbench.js, workbench.css, fixture.js, portraitsDemo.js, portraitsDemo.css, combatDemo.js, busanziDemo.js, README.md.
Run a static server from repository root, such as python -m http.server 8000, then visit http://localhost:8000/research/g2-web-preview/index.html. Do not use file://. The five tabs contain fictional fixture inputs and a request log, not an active game.

Tests: scripts/inkbox-g2-web-check.mjs. Command: node scripts/inkbox-g2-web-check.mjs.

## 2. Creation ViewModel and onAction

render({canContinue, recentWorld, slots, seed, busy, result, message, error, loadError, page}).

- Host truth: canContinue, recentWorld, slots, seed supplied by current runtime, busy/result/any error, current page override.
- slots: array of {id,label,description,available}; omitted means unknown/empty. The UI must not invent a save date, creator, or play time.
- Action requests:
  - {type:"continue-game"}
  - {type:"create-world",options:{preset,terrainPreset,seed,progressive}}
  - {type:"request-random-seed"}
  - {type:"load-save",slotId}
  - {type:"import-save",file} where file is the browser File object
  - {type:"open-help"}
- Host owns world generation, verification, save import, and success/failure. A callback is not a completion event. Return busy/result and updated state after every completed attempt.

**Verified enum reconciliation**:
- core/config.js world keys: small (200×128), medium (288×180), large (384×240), expanse (512×320). Do not use huge.
- world/worldGeneration.js terrain keys: standard, mountains, wetlands. Do not use mountain or wetland.
- Seed is 0..4294967295 decimal. Seed 0 must be preserved.
- Official wiring can reuse ui/worldCreation.js parsing and creationOptions; v2 terrain configuration belongs to the official creation host, not UI.

## 3. Portrait ViewModel and G1 integration

render({identityKey, appearance, appearanceSeed, status, alt}).

The stable G1 CharacterViewModel identity.key is the recommended identityKey. The appearanceSeed, if legitimately provided by the game, takes precedence over identityKey for appearance generation. Explicit appearance is an optional collection of bounded indexes into fixed face/eyes/hair/skinColor/hairColor/robe/collar/motif/accent families; absent or out-of-range values fall back to identity-derived appearance. Names are never parsed to guess gender, path, race, cultivation, sect, or allegiance.

Status (alive/dead/ascended/nether/missing/unknown) alters frame styling only, never redraws the same individual's identity. SVG data URLs contain only vetted template and palette data, no user markup or remote assets.

G1 character card lives at src/inkbox/ui/g1/presentation/characterCardView.js on feat/g1-presentation-web and was not inherited into G2. At integration, add a separate portrait root to the card header, pass identity.key from G1, and call its destroy with the card lifecycle. Do not fork G1 four-page view or schema.

## 4. Combat ViewModel and G2.1 integration

render({enabled,events,focusedCharacter,summary,loading,error}).

- events is a curated host-provided recent snapshot array of {id,type,title,detail,actor,target,timeLabel,plane,x,y,canObserve}.
- At most 24 distinct events are rendered. Missing data is unknown. A transient FX hit cannot imply continued combat, a kill, damage total, true HP, victory or permanent history.
- focusedCharacter.combatStatus is one of fighting/wounded/recovering/left/idle/unknown, and **must** be based on a host-supplied current state. If missing, displays unknown.
- summary.text is a host-supplied summary, not UI-generated battle statistics.
- Action: {type:"locate-combat",eventId,plane,x,y}. The host must revalidate target identity, plane access and camera before moving.

G2.1's 3D/Canvas FX may provide short-lived read-only event snapshots through its owning presentation adapter. Do not directly call drainRuntimeEvents, do not create another runtime FX queue, and do not duplicate formal Chronicle / biography / war-ledger events. This is an observer, not a parallel history service.

## 5. Busuanzi ViewModel and definitive user character notes

render({character,dialogue,affinity,capabilities,tasks,guide,wind,busy,error}).

- character: {displayName,state,location}. Character introduced themself to the player as **卜算子**; true name unknown.
- dialogue: latest host-provided strings or {text,time} entries, max 12. Affinity: {label,percent}; the host owns the official derived relationship, UI does not increase it.
- guide: {available,text}; a skip button emits {type:"dismiss-busanzi-guide"}. Reopen via {type:"open-help",source:"busanzi"}. Cross-session persistence, if desired, must be handled by the host UI preferences (qolState) and never saved as new World simulation state.
- capabilities: {taskRequests,allowedTaskKinds,targets,help}. Missing taskRequests or target disables the corresponding task button by default. All buttons send requests only.
- target: {kind:"site"|"entity"|"region",id}. Allowed taskType: seek-prodigy, investigate-site, clear-beast.
- Task action: {type:"request-busanzi-task",taskType,target}. Host alone determines valid targets, eligibility, travel, actual tasks and success; do not enable capabilities before G3 implementation.
- tasks: host-provided array of {id,title,state,targetLabel,result} with idle/traveling/working/blocked/completed/failed states. Fictional task progression exists only in the labeled preview fixture.
- wind: only "breeze" permits a small symbol shift and a faint glimpse of features. There is no continuous animation loop.

**User-approved visual and narrative constraints**:
- Female, unknown real name, introduces herself as "卜算子" at first meeting; retains the self-reference "小爷我". Swagger and riddles are verbal flavor; her bearing stays gentle.
- Long black hair, a large paper talisman permanently concealing the eyes/nose/mouth, with a **red Li hexagram** (six lines, two Li trigrams) front and center.
- A breeze can shift it very slightly; never clearly display the full face. Red braided forehead cord, bells, old torn umbrella with trigram motif, warm off-white robes, muted crimson lining and worn hem.
- The SVG is a deliberately low-cost independent UI silhouette using those motifs, not a licensed reproduction of uploaded images and not a new 3D asset.
- Existing sim/busanzi.js and core/lore.js refer to the character in earlier masculine phrasing and use the signature "小爷我". Do not rewrite or retcon the old dialogue as part of G2-W. The feminine silhouette plus self-reference is intentional and should be supported without UI-level fixed gender assumptions.

## 6. World-edge visual algorithm contract

buildRealmEdgeGeometry accepts finite points in world grid coordinates, seed and kind view/rift. geometryToSvgPath accepts those points and a caller's projection function. Rendering remains a *visual study*, with no new geometry lifecycle in the production renderer.

Parameters (preview units, not calibrated world dimensions):
- Ordinary view: dark ink width 3.2, soft outer ink width 8 opacity .16, no gold, world jitter amplitude up to 0.625, fade suggestion 5 world units.
- Genuine rift: dark ink width 3.8, soft outer width 9 opacity .28, gold width 1.2 opacity .72, world jitter up to 0.85, fade suggestion 7 world units.
- Mortal / upper: paper #eeeae1, distant ground #c2c8b7, ink #353b3a, muted gold #998454.
- Mortal / nether: paper #e8e4dd, distant ground #737d7c, ink #222a2a, muted gold #8b7150.

Renderer integration must do actual world coordinates, camera projection, region mask, depth, visibility, highland elevation and occlusion. **Do not create a screen-fixed CSS tear** as a substitute for world-space realm boundaries. No simulation RNG or new Region truth sources.

## 7. Test and integration boundaries

G2 logic was executed against remotely fetched source in an in-process JavaScript environment: creation enum and Seed range, deterministic 64-person avatar variation, 1,000-event bounded normalization, task permission and SVG border algorithm. The Node script includes 49 checks covering pure models and a minimal DOM-double lifecycle; run it in a real Node workspace before acceptance. The script is not a real browser.

Still required by Codex: actual Node command result on a clean clone, manual/static-browser checking of responsive widths, keyboard navigation, focus and scroll, SVG stress rendering, G1 + G2.1 wiring, core npm test, real 3D GPU/browser performance, and regression tests. None of these have been claimed passed here.

Suggested integration sequence:
1. Wait for G1 Runtime/G1 Web to agree on a clean integration baseline.
2. Add creation menu to main route using existing world creation + save actions.
3. Embed portrait root in G1 character panel; preserve old schema and lifecycle.
4. Feed combat observer only curated G2.1 runtime snapshots and authenticated character status.
5. Wire Busuanzi existing affinity/dialogue to BridgeVM; leave G3 taskRequests false until real task system exists.
6. Transfer edge style values to the future RealmBoundaryLayer and calibrate against actual world geometry.
7. Run Node check, existing repo tests and browser matrix. Destroy components on view/world transitions.

**Request is not authorization or completion.** The host remains the sole authority on World actions, creation success, mission results, save data and battle consequences.
