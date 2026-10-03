// Structural asset acceptance. Reads exported GLB data, not just author-reported counts.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { characterAppearanceOf, factionPaletteIndex } from '../src/inkbox/render3d/characters/characterAppearance.js';
import { CharacterLibrary } from '../src/inkbox/render3d/characters/CharacterLibrary.js';
import { CharacterBatch } from '../src/inkbox/render3d/characters/CharacterBatch.js';
import * as THREE from 'three';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../assets/characters/cultivator');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'data/cultivator_manifest.json'), 'utf8'));
const binary = fs.readFileSync(path.join(root, 'mesh/cultivator_library.glb'));
assert.equal(binary.toString('ascii', 0, 4), 'glTF');
assert.equal(binary.readUInt32LE(4), 2);
assert.equal(binary.readUInt32LE(8), binary.length);
const jsonLength = binary.readUInt32LE(12);
const gltf = JSON.parse(binary.toString('utf8', 20, 20 + jsonLength));
assert.equal(gltf.materials.length, 1, 'One shared exported material');
assert.equal(gltf.images.length, 1, 'One shared atlas image');
assert.equal(gltf.textures.length, 1, 'One shared texture');
assert(gltf.images[0].bufferView !== undefined, 'GLB must contain its atlas');
assert.equal(gltf.buffers.length, 1);
assert.equal(gltf.buffers[0].uri, undefined, 'GLB must be self contained');

const roles = ['basic', 'sect_disciple', 'wanderer', 'elder', 'ghost', 'alchemist'];
assert.deepEqual(Object.keys(manifest.roles).sort(), [...roles].sort());
const moduleTriangles = {};
for (const [id, module] of Object.entries(manifest.modules)) {
  assert(/^[a-z][a-z0-9_]*$/.test(id), `Stable lower-case module name: ${id}`);
  const node = gltf.nodes.find(node => node.name === (module.node || id));
  assert(node?.mesh !== undefined, `Actual GLB mesh for ${id}`);
  const primitives = gltf.meshes[node.mesh].primitives;
  assert.equal(primitives.length, 1, `One material primitive for ${id}`);
  const p = primitives[0];
  assert.equal(p.material, 0);
  assert.equal(p.mode ?? 4, 4, 'Triangulated export');
  assert(p.attributes.NORMAL !== undefined && p.attributes.TEXCOORD_0 !== undefined);
  const vertices = gltf.accessors[p.indices ?? p.attributes.POSITION].count;
  assert.equal(vertices % 3, 0);
  const triangles = vertices / 3;
  assert.equal(module.triangles, triangles, `Measured triangle count for ${id}`);
  moduleTriangles[id] = triangles;
}
const bodyId = manifest.roles.basic.body;
const basicCount = moduleTriangles[bodyId] + moduleTriangles[manifest.roles.basic.hair];
assert(basicCount >= 250 && basicCount <= 450, `Basic total ${basicCount} in 250–450`);
for (const role of roles) {
  const config = manifest.roles[role];
  assert.equal(config.body, bodyId, `${role} must reuse the same body`);
  assert(config.hair && manifest.modules[config.hair]);
  assert([config.weapon, config.prop, config.tag].filter(Boolean).length <= 2, 'No full weapon/prop/tag stack');
  const silhouetteCount = moduleTriangles[config.body] + moduleTriangles[config.hair] + (moduleTriangles[config.robe] || 0);
  assert(silhouetteCount <= 450, `${role} shared body/hair/robe must stay within the silhouette budget`);
}
const basic = manifest.roles.basic;
assert(!basic.weapon && !basic.prop && !basic.back && !basic.tag, 'Base stands alone without attachments');
assert(!manifest.roles.ghost.tag, 'Ghost uses lamp instead of lamp plus paper');
assert(!manifest.roles.alchemist.tag || !manifest.roles.alchemist.prop, 'Alchemist uses gourd or tag');
const bodyNode = gltf.nodes.find(n => n.name === manifest.modules[bodyId].node);
const bodyPrimitive = gltf.meshes[bodyNode.mesh].primitives[0];
assert(bodyPrimitive.attributes.JOINTS_0 !== undefined && bodyPrimitive.attributes.WEIGHTS_0 !== undefined, 'Real skin data');
const joints = gltf.skins[bodyNode.skin].joints;
assert.equal(joints.length, 16, 'Shared simple 16-bone rig');
for (const skin of gltf.skins) assert.deepEqual(skin.joints, joints, 'Modules use the same rig joints');
const names = (gltf.animations || []).map(a => a.name.toLowerCase());
assert(names.includes('idle') && names.includes('walk'), 'Real Idle and Walk clips');
for (const animation of gltf.animations) {
  assert(animation.channels.length > 0 && animation.samplers.length > 0, 'Animations contain actual bone channels');
  assert(animation.channels.some(channel => joints.includes(channel.target.node)), 'Animations address the shared skeleton');
  assert(animation.samplers.some(sampler => gltf.accessors[sampler.input].count > 1), 'Animations contain multiple keyframes');
}
assert(fs.statSync(path.join(root, 'source/cultivator_master.blend')).size > 10000, 'Editable master scene');

// Use real exported metadata with synthetic geometry to check runtime sharing and capacities without a DOM.
const scene = new THREE.Group();
const texture = new THREE.DataTexture(new Uint8Array(12 * 4).fill(255), 12, 1);
const material = new THREE.MeshLambertMaterial({ map: texture });
for (const [id, module] of Object.entries(manifest.modules)) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(.4, 1, .4), material);
  mesh.name = module.node || id; scene.add(mesh);
}
const library = new CharacterLibrary({ scene, animations: [] }, manifest);
const batch = new CharacterBatch(library, 50);
batch.write(Array.from({ length: 50 }, (_, i) => ({ id: i + 1, role: roles[i % roles.length], x: i, y: 0, z: 0 })));
assert.equal(batch.stats.characters, 50);
assert.equal(new Set(Object.values(batch.meshes).map(m => m.material)).size, 1);
for (const mesh of Object.values(batch.meshes)) assert.equal(mesh.userData.renderEntities.length, mesh.count);
const worldEntity = { id: 17, level: 3, faction: 0, state: 'wander' };
const original = JSON.stringify(worldEntity);
assert.equal(characterAppearanceOf(worldEntity, 'cultivator', '#fff').role, 'basic', 'Movement state does not invent a profession');
assert.equal(JSON.stringify(worldEntity), original, 'Read-only appearance');
assert.equal(characterAppearanceOf({ ...worldEntity, dao: { path: { key: 'alchemy' } } }, 'cultivator').role, 'alchemist');
assert.equal(characterAppearanceOf({ soulKind: 'ghostCultivator' }, 'wraith').role, 'ghost');
assert.equal(characterAppearanceOf({ soulKind: 'ghost' }, 'wraith'), null);
assert.equal(factionPaletteIndex('#76717c'), 10);
assert.throws(() => library.resolveAppearance('basic', { hair: ['hair_base', 'hair_elder'] }), /hair/);
assert.throws(() => library.resolveAppearance('basic', { modules: Object.keys(manifest.modules) }), /named/);
assert.throws(() => library.resolveAppearance('basic', { body: manifest.roles.basic.hair }), /body/);
assert.throws(() => library.resolveAppearance('basic', { weapon: manifest.roles.sect_disciple.weapon,
  prop: manifest.roles.wanderer.prop, tag: manifest.roles.sect_disciple.tag }), /two slots/);
assert.throws(() => library.resolveAppearance('ghost', { tag: manifest.roles.alchemist.tag }), /alternatives/);
batch.dispose(); batch.dispose(); library.dispose(); library.dispose();

const result = { generatedAt: new Date().toISOString(), pass: true, glbBytes: binary.length,
  baseTriangles: basicCount, modules: moduleTriangles, sharedMeshCount: Object.keys(moduleTriangles).length,
  materialCount: gltf.materials.length, textureCount: gltf.textures.length, bones: joints.map(i => gltf.nodes[i].name), animations: names };
fs.writeFileSync(path.join(root, 'data/structural_validation.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
