import assert from 'node:assert/strict';
import { generateWorld } from '../src/inkbox/world/worldgen.js';
import { generateUpperWorld } from '../src/inkbox/world/worldgenUpper.js';
import { TERRAIN } from '../src/inkbox/core/config.js';
import { ignite, stepFire, stepVegetation } from '../src/inkbox/sim/ecology.js';
import { OVER, classify, decayOverlay } from '../src/inkbox/world/terrain.js';
import { WorldRenderBridge } from '../src/inkbox/render3d/WorldRenderBridge.js';
import { TerrainMesh } from '../src/inkbox/render3d/terrain/TerrainMesh.js';
import { PlaneStage } from '../src/inkbox/render3d/stage/PlaneStage.js';
import { resolveArtProfile } from '../src/inkbox/render3d/art/ArtPassProfile.js';
import { RegionGeometry } from '../src/inkbox/render3d/region/RegionGeometry.js';

let passed = 0;
function check(name, fn) { fn(); passed++; console.log(`PASS ${name}`); }
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t ^= t + Math.imul(t ^ t >>> 7, 61 | t); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function world(seed = 1) { return generateWorld({ preset: { w: 64, h: 48 }, seed, scatter: false }); }
function forestCell(w) {
  for (let y = 3; y < w.h - 3; y++) for (let x = 3; x < w.w - 3; x++) {
    const i = y * w.w + x;
    if (w.veg[i] > 0.6 && w.water[i] === 0 && w.height[i] > 0.36) return { x, y, i };
  }
  throw Error('generated world lacks a dry forest cell');
}
function assertDerived(w, i) {
  assert.equal(w.type[i], classify(w, i % w.w, Math.floor(i / w.w), i));
}

check('fire-only bridge dirty never reports unrelated layers', () => {
  const w = world(), b = new WorldRenderBridge(w), { x, y, i } = forestCell(w);
  assert.equal(ignite(w, x, y, 0), 1);
  const d = b.changes();
  assert.deepEqual(d.fire, { x0: x, y0: y, x1: x, y1: y });
  for (const key of ['height', 'water', 'type', 'veg']) assert.equal(d[key], null);
  assert.equal(b.changes(), null);
  assert(w.fire[i] > 0);
});

check('burn, scorch, ash and cleared overlay synchronize type and qi', () => {
  const w = world(2), { x, y, i } = forestCell(w);
  ignite(w, x, y, 0);
  const random = rng(17);
  for (let k = 0; k < 8 && w.veg[i] > 0.4; k++) stepFire(w, 1, random);
  assert.equal(w.over[i], OVER.SCORCHED);
  assert.equal(w.type[i], TERRAIN.SCORCHED);
  assertDerived(w, i);
  const scorchedQi = w.qi[i];
  decayOverlay(w, 3600, rng(18));
  assert.equal(w.over[i], OVER.ASH);
  assert.equal(w.type[i], TERRAIN.ASH);
  assertDerived(w, i);
  assert.notEqual(w.qi[i], scorchedQi);
  decayOverlay(w, 3600, rng(19));
  assert.equal(w.over[i], OVER.NONE);
  assertDerived(w, i);
  assert.notEqual(w.type[i], TERRAIN.ASH);
});

check('edge ignition burns and extinguishes without out-of-bounds spread', () => {
  const w = world(3), x = 0, y = 0, i = 0;
  w.height[i] = 0.5; w.water[i] = 0; w.veg[i] = 0.8;
  ignite(w, x, y, 0);
  let burning = false;
  for (let k = 0; k < 20; k++) {
    stepFire(w, 1, rng(k + 1));
    burning ||= w.over[i] === OVER.SCORCHED;
  }
  assert(burning);
  assert.equal(w.fire[i], 0);
  assertDerived(w, i);
});

check('same seed and formal ecology path produce deterministic burn to recovery', () => {
  const run = () => {
    const w = world(76), { x, y, i } = forestCell(w), random = rng(6901);
    const initialVeg = w.veg[i];
    ignite(w, x, y, 0);
    let burned = false;
    for (let k = 0; k < 30; k++) { stepFire(w, 1, random); burned ||= w.over[i] === OVER.SCORCHED; }
    const lowVeg = w.veg[i];
    assert(burned && lowVeg < initialVeg && w.fire[i] <= 0.02);
    for (let k = 0; k < 160 && w.over[i] === OVER.SCORCHED; k++) stepVegetation(w, 22, random);
    for (let k = 0; k < 100 && w.over[i] !== OVER.NONE; k++) decayOverlay(w, 36, random);
    assert.equal(w.over[i], OVER.NONE);
    assert(w.veg[i] > lowVeg);
    assertDerived(w, i);
    return [w.fire[i], w.veg[i], w.over[i], w.type[i], w.qi[i]];
  };
  assert.deepEqual(run(), run());
});

check('mortal legacy and pigment surfaces refresh fire color and clear it', () => {
  const w = world(4), b = new WorldRenderBridge(w), t = new TerrainMesh(w, b.coordinates, undefined, true);
  const { x, y, i } = forestCell(w), c = t.geometry.attributes.color;
  const original = [c.getX(i), c.getY(i), c.getZ(i)];
  t.setArtProfile(resolveArtProfile('realm-style-v1'));
  assert(t.artData, 'mortal art data must exist');
  ignite(w, x, y, 0);
  const d = b.changes();
  t.update(d.fire, { height: false, type: false, fire: true });
  assert(c.getX(i) > original[0] || c.getY(i) > original[1] || c.getZ(i) > original[2]);
  assert(t.artData.types[i * 4 + 3] > 0);
  assert(t.inkMaterial.fragmentShader.includes('texture2D(typeTexture,uvAt(p)).a'));
  w.fire[i] = 0;
  t.update(b.changes().fire, { height: false, type: false, fire: true });
  assert.deepEqual([c.getX(i), c.getY(i), c.getZ(i)], original);
  assert.equal(t.artData.types[i * 4 + 3], 0);
  t.dispose();
});

check('other realms and region geometry cannot reveal mortal fire', () => {
  const w = world(5), { x, y, i } = forestCell(w);
  const upperWorld = generateUpperWorld({ preset: { w: 64, h: 48 }, seed: 5 });
  const upper = new PlaneStage({ plane: 'upper', world: upperWorld });
  const original = upper.terrain.geometry.attributes.color.getX(i);
  ignite(w, x, y, 0);
  upperWorld.fire[i] = 0.9; // Even a stray field value is not mortal fire.
  upper.update(0.016);
  assert.equal(upper.terrain.geometry.attributes.color.getX(i), original);
  assert.equal(upper.terrain.fireEnabled, false);
  upper.terrain.setArtProfile(resolveArtProfile('realm-style-v1'));
  assert.equal(upper.terrain.artData.types[i * 4 + 3], 0);
  const mortal = new PlaneStage({ plane: 'mortal', world: w });
  assert.equal(mortal.terrain.fireEnabled, true);
  // Terrain uses the same existing quad mask at every zoom level; no fire mesh
  // can bypass a realm/access mask, while near/far share the same material.
  const geometry = mortal.terrain.geometry, material = mortal.terrain.mesh.material;
  mortal.terrain.setRegionGeometry(new RegionGeometry(w, { contains: () => false }), true);
  assert.equal(geometry.drawRange.count, 0);
  assert.equal(mortal.terrain.mesh.material, material);
  mortal.dispose(); upper.dispose();
});

console.log(`G2.3 terrain checks: ${passed} passed`);
