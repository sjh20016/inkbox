import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readEnvironmentLibrary } from './inkbox-environment-glb-reader.mjs';
import { EnvironmentBatch } from '../src/inkbox/render3d/environment/EnvironmentBatch.js';
import { createEnvironmentMaterial } from '../src/inkbox/render3d/environment/EnvironmentMaterial.js';
import { LOD_BUDGETS, chooseLOD, allocateCategoryBudget } from '../src/inkbox/render3d/lod/PresentationBudget.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const checks = [];
function check(name, fn) { fn(); checks.push({ name, passed: true }); console.log(`PASS ${name}`); }
const library = readEnvironmentLibrary(ROOT);
try {
  check('production assets sharing one module make one batch without losing their identities', () => {
    const shared = new Map();
    for (const [id, asset] of Object.entries(library.assets)) {
      const node = asset.lods[2];
      const list = shared.get(node) || []; list.push(id); shared.set(node, list);
    }
    const [node, ids] = [...shared].find(([, ids]) => ids.length >= 3);
    const material = createEnvironmentMaterial(library, 'nether');
    const batch = new EnvironmentBatch(library, { material, capacity: 8, assetIds: ids, pickField: 'renderEntities' });
    const records = ids.map((assetId, i) => ({ assetId, lod: 2, position: { x: i * 2, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 }, source: { id: 100 + i } }));
    batch.write(records);
    assert.equal(batch.stats.drawCalls, 1); assert.equal(batch.stats.instances, ids.length);
    assert.deepEqual(batch.meshes.get(node).userData.renderEntities.map(r => r.id), records.map(r => r.source.id));
    for (const id of ids) assert.equal(library.geometryFor(id, 2), batch.meshes.get(node).geometry);
    batch.dispose(); assert.equal(library.disposed, false); material.dispose();
  });
  check('decoration and artifact retain legacy tree hysteresis through threshold crossings', () => {
    for (const kind of ['decoration', 'artifact']) {
      let previous = 1, legacy = 1;
      for (const px of [4, 5, 6, 7, 8, 24, 27, 28, 29, 27, 25, 24, 23, 5, 4, 8]) {
        previous = chooseLOD(kind, px, previous); legacy = chooseLOD('tree', px, legacy);
        assert.equal(previous, legacy, `${kind} changed at ${px}px`);
      }
      assert.notEqual(LOD_BUDGETS.thresholds[kind], LOD_BUDGETS.thresholds.tree);
    }
    const entries = Array.from({ length: 270 }, (_, id) => ({ id, pixels: 100 }));
    const result = allocateCategoryBudget('site', entries);
    assert.equal(result.entries.length, entries.length); assert.equal(result.overflow, 14);
    assert.equal(result.counts[0], 64); assert.equal(result.counts[1], 160); assert.equal(result.counts[2], 46);
    assert.equal(allocateCategoryBudget('artifact', entries).counts[0], 256);
  });
  check('new-stage Git evidence stays compact with no more than eight normal golden PNGs', () => {
    const dir = path.join(ROOT, 'reports/release/render3d-m2c2c');
    const golden = path.join(dir, 'golden'), summary = path.join(dir, 'summary');
    const images = fs.existsSync(golden) ? fs.readdirSync(golden).filter(f => f.endsWith('.png')) : [];
    assert(images.length <= 8, `stage has ${images.length} golden images`);
    for (const file of fs.existsSync(summary) ? fs.readdirSync(summary) : []) {
      if (!file.endsWith('.json')) continue;
      const p = path.join(summary, file); assert(fs.statSync(p).size <= 256 * 1024, `${file} is not compact`);
      JSON.parse(fs.readFileSync(p, 'utf8'));
    }
  });
} finally { library.dispose(); }
const out = path.resolve(process.env.INKBOX_REPORT_DIR || path.join(ROOT, 'reports/local/c2b1-contract'));
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'summary.json'), JSON.stringify({ suite: 'C2B.1 production contract', checks, pass: true }, null, 2));
