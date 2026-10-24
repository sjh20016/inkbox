import { writeFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { ASSETS, createRuinsLibrary } from '../src/ruinsLibrary.js';
import { SEMANTIC_SLOTS } from '../src/materials.js';

export function generateManifest() {
  const library = createRuinsLibrary();
  try {
    return {
      schema: 'shanhai-ruins-research-v1', source: 'authored procedural Three.js geometry', units: 'world units; gallery reference person height 1.7',
      axis: 'Y-up', pivot: [0, 0, 0], forward: '+Z', instantiable: true, mergedMeshesPerAsset: 1,
      material: { semanticSlots: SEMANTIC_SLOTS, uv: '8x8 cell centers, slots 0..27', textureBytes: 0, sharedBy: 'realm/style/light', styles: ['flat', 'toon', 'solid', 'ink'] },
      outline: { method: 'merged edge line segments', drawCallsPerBatch: 1, buffers: 'batch-owned; edge source library-owned' },
      lifecycle: 'dispose batches before library, or library.dispose() disposes all live batches; both idempotent',
      assets: ASSETS.map(asset => ({
        ...asset, decorativeOnly: true, worldFacts: false,
        futureBinding: { 'shanhai.sect.gate': 'real sect entrance, future adapter required', 'shanhai.settlement.ruin': 'real settlement/building damage, future adapter required', 'shanhai.leyline.altar': 'explicit real site/formation or decoration; never implies a leyline or buff', 'shanhai.nether.remnant': 'Nether decoration or explicit future site identity' }[asset.id],
        states: asset.states.map(state => ({ ...state, lods: [0, 1, 2].map(lod => ({ lod, ...library.statsFor(asset.id, lod, state.id) })) })),
      })),
    };
  } finally { library.dispose(); }
}
const target = new URL('../assets/manifest.json', import.meta.url);
export async function checkManifest() {
  const actual = JSON.parse(await readFile(target, 'utf8'));
  if (JSON.stringify(actual) !== JSON.stringify(generateManifest())) throw new Error('Manifest differs from generated assets; run node research/shanhai-ruins-v01/tools/generate-manifest.mjs');
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--check')) { await checkManifest(); console.log('Manifest matches generated geometry.'); }
  else { await writeFile(target, `${JSON.stringify(generateManifest(), null, 2)}\n`); console.log('Generated research/shanhai-ruins-v01/assets/manifest.json'); }
}
