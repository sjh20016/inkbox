import assert from 'node:assert/strict';
import {characterPortraitInput} from '../src/inkbox/g1/characterPortraitInput.js';
import {buildPortraitLayerPlan} from '../src/inkbox/ui/g2/portraits/v2/portraitComposer.js';
import {createPortraitAssetRegistry} from '../src/inkbox/ui/g2/portraits/v2/portraitAssetRegistry.js';
import {getPortraitRegistry} from '../src/inkbox/ui/g2/portraits/v2/portraitRuntimeAssets.js';

let checks = 0;
function check(condition, label) {
  assert.ok(condition, label);
  checks += 1;
}

const original = characterPortraitInput(20261011, {key:'mortal:17',status:'alive',name:'云扶心'});
const repeated = characterPortraitInput(20261011, {key:'mortal:17',status:'alive',name:'云扶心'});
const renamed = characterPortraitInput(20261011, {key:'mortal:17',status:'alive',name:'改名'});
const otherWorld = characterPortraitInput(20261012, {key:'mortal:17',status:'alive',name:'云扶心'});
check(JSON.stringify(original) === JSON.stringify(repeated), 'same world identity makes same portrait input');
check(original.identityKey === renamed.identityKey, 'display-name changes do not change portrait identity');
check(original.identityKey !== otherWorld.identityKey, 'world seed namespaces character identity');
check(JSON.stringify(Object.keys(original).sort()) === JSON.stringify(['alt','identityKey','status']),
  'portrait adapter carries no genome, state, or save data');
check(characterPortraitInput(1, null) === null, 'invalid G1 identity is rejected');

const emptyPack = createPortraitAssetRegistry({manifest:{id:'inkbox-face-v1',schemaVersion:1,slots:{}}});
const first = buildPortraitLayerPlan(original, emptyPack);
const again = buildPortraitLayerPlan(repeated, emptyPack);
check(JSON.stringify(first.recipe) === JSON.stringify(again.recipe), 'same character resolves deterministically');
check(first.items.find(item => item.slot === 'eyes')?.kind === 'procedural', 'missing PNG eyes use procedural fallback');
check(first.items.find(item => item.slot === 'face')?.kind === 'procedural', 'missing PNG face uses procedural fallback');
check(first.items.every(item => item.kind === 'procedural'), 'empty local pack safely renders all available slots');
const missingPack = await getPortraitRegistry({fetcher:async()=>({ok:false})});
const missingPlan = buildPortraitLayerPlan(original, missingPack);
check(missingPlan.items.every(item => item.kind === 'procedural'), 'missing runtime manifest safely falls back to the procedural pack');

const recipes = new Set();
for (let id = 1; id <= 64; id += 1) {
  const input = characterPortraitInput(20261011, {key:`mortal:${id}`,status:'alive',name:`人物${id}`});
  recipes.add(JSON.stringify(buildPortraitLayerPlan(input, emptyPack).recipe));
}
check(recipes.size >= 48, '64 real-identity inputs produce a differentiated deterministic gallery');

console.log(`G1-P0 PASS ${checks} checks`);
