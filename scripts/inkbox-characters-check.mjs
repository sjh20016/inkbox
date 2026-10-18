// Structural asset acceptance. Reads exported GLB data, not just author-reported counts.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { characterAppearanceOf, factionPaletteIndex } from '../src/inkbox/render3d/characters/characterAppearance.js';
import { CharacterLibrary } from '../src/inkbox/render3d/characters/CharacterLibrary.js';
import { CharacterBatch } from '../src/inkbox/render3d/characters/CharacterBatch.js';
import * as THREE from 'three';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../assets/characters/cultivator');
const runtimeOnly = process.argv.includes('--runtime-only');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'data/cultivator_manifest.json'), 'utf8'));
const binary = fs.readFileSync(path.join(root, 'mesh/cultivator_library.glb'));
assert.equal(binary.toString('ascii', 0, 4), 'glTF');
assert.equal(binary.readUInt32LE(4), 2);
assert.equal(binary.readUInt32LE(8), binary.length);
const jsonLength = binary.readUInt32LE(12);
const gltf = JSON.parse(binary.toString('utf8', 20, 20 + jsonLength));
const binChunkHeader = 20 + jsonLength;
assert.equal(binary.readUInt32LE(binChunkHeader + 4), 0x004e4942, 'GLB must contain a BIN chunk');
const binChunkStart = binChunkHeader + 8;
assert(binChunkStart + binary.readUInt32LE(binChunkHeader) <= binary.length, 'BIN chunk stays inside the GLB');
assert.equal(gltf.materials.length, 1, 'One shared exported material');
assert.equal(gltf.images.length, 1, 'One shared atlas image');
assert.equal(gltf.textures.length, 1, 'One shared texture');
assert(gltf.images[0].bufferView !== undefined, 'GLB must contain its atlas');
assert.equal(gltf.buffers.length, 1);
assert.equal(gltf.buffers[0].uri, undefined, 'GLB must be self contained');

// Provenance is part of the asset contract: a re-export must update the manifest
// (and the documented rollback) instead of silently replacing the accepted drift.
const assetSha256 = createHash('sha256').update(binary).digest('hex');
assert.equal(manifest.asset_sha256?.toLowerCase(), assetSha256,
  'Manifest asset_sha256 must match the shipped cultivator_library.glb');
assert.equal(manifest.provenance?.delivered_sha256?.toLowerCase(), assetSha256,
  'Provenance delivered_sha256 must match the shipped cultivator_library.glb');
assert(/^[a-f0-9]{64}$/i.test(manifest.provenance?.source_archive?.sha256 || ''),
  'Provenance must record the source archive sha256');
assert.equal(manifest.asset, 'mesh/cultivator_library.glb', 'Runtime asset path records the swapped-in GLB');
assert(Array.isArray(manifest.rollback?.steps) && manifest.rollback.steps.length > 0,
  'Manifest records explicit rollback steps');

// Accessors are needed to read palette UVs and triangle counts from the exported
// data instead of trusting author-provided numbers.
const COMPONENT_TYPES = new Map([[5121, Uint8Array], [5123, Uint16Array], [5125, Uint32Array], [5126, Float32Array]]);
const COMPONENT_BYTES = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const TYPE_COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
function accessorValues(accessorIndex) {
  const accessor = gltf.accessors[accessorIndex];
  const bufferView = gltf.bufferViews[accessor.bufferView];
  const components = TYPE_COMPONENTS[accessor.type];
  const Ctor = COMPONENT_TYPES.get(accessor.componentType);
  assert(Ctor && components, `Unsupported accessor ${accessorIndex}`);
  const elementSize = COMPONENT_BYTES[accessor.componentType] * components;
  const stride = bufferView.byteStride || elementSize;
  const start = (bufferView.byteOffset || 0) + (accessor.byteOffset || 0);
  const values = [];
  for (let i = 0; i < accessor.count; i += 1) {
    const offset = binary.byteOffset + binChunkStart + start + i * stride;
    values.push(Array.from(new Ctor(binary.buffer.slice(offset, offset + elementSize))));
  }
  return values;
}

const paletteCount = manifest.palette?.count;
assert(Number.isInteger(paletteCount) && paletteCount >= 8 && paletteCount <= 12,
  'Palette must contain 8–12 colours');
function paletteCell(u, v) {
  const scaled = u * paletteCount - 0.5;
  const cell = Math.round(scaled);
  assert(Math.abs(scaled - cell) < 1e-3, `Palette UV must sit on a cell centre, got ${u}`);
  assert(cell >= 0 && cell < paletteCount, `Palette UV cell out of range: ${cell}`);
  assert(Math.abs(v - 0.5) < 1e-6, `Palette UV rows must stay on the single row, got ${v}`);
  return cell;
}
// Every triangle must sample exactly one flat palette cell; otherwise nearest
// sampling would blend two colours across a face.
function uvCellTriangles(primitive) {
  const uvs = accessorValues(primitive.attributes.TEXCOORD_0);
  const indices = primitive.indices !== undefined
    ? accessorValues(primitive.indices).map(value => value[0]) : null;
  const triangles = (indices ? indices.length : uvs.length) / 3;
  assert(Number.isInteger(triangles), 'Triangulated palette UV accessor');
  const cells = {};
  for (let triangle = 0; triangle < triangles; triangle += 1) {
    const corners = indices
      ? [indices[triangle * 3], indices[triangle * 3 + 1], indices[triangle * 3 + 2]]
      : [triangle * 3, triangle * 3 + 1, triangle * 3 + 2];
    const cell = paletteCell(uvs[corners[0]][0], uvs[corners[0]][1]);
    for (const corner of corners) {
      assert.equal(paletteCell(uvs[corner][0], uvs[corner][1]), cell,
        'One triangle must not straddle palette cells');
    }
    cells[cell] = (cells[cell] || 0) + 1;
  }
  return cells;
}

const roles = ['basic', 'sect_disciple', 'wanderer', 'elder', 'ghost', 'alchemist'];
assert.deepEqual(Object.keys(manifest.roles).sort(), [...roles].sort());
const moduleTriangles = {};
const moduleDetails = {};
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
  moduleDetails[id] = { triangles, uvCells: uvCellTriangles(p) };
}
const bodyId = manifest.roles.basic.body;
const basicCount = moduleTriangles[bodyId] + moduleTriangles[manifest.roles.basic.hair];
assert(basicCount >= 250 && basicCount <= 450, `Basic total ${basicCount} in 250–450`);

// Silhouette policy is split on purpose (documented in the manifest and
// docs/CULTIVATOR_REBUILD_INTEGRATION.md): the 250–450 v1 budget covers the
// shared core body+hair; the optional attachment slots (robe included) carry
// their own measured caps because the rebuilt elder robe is larger.
const budget = manifest.limits?.silhouette;
assert(budget && Number.isInteger(budget.core_body_hair_min) && Number.isInteger(budget.core_body_hair_max)
  && Number.isInteger(budget.attachment_module_max) && Number.isInteger(budget.attachment_total_max)
  && Number.isInteger(budget.full_outfit_max) && Array.isArray(budget.attachment_slots),
  'Manifest must declare the cultivator silhouette budget policy');
assert.equal(manifest.palette.legacy_cells?.faction_robe, manifest.palette.factionSlot,
  'Legacy faction robe cell must match palette.factionSlot');
const bodyCells = moduleDetails[bodyId].uvCells;
const legacyCells = manifest.palette.legacy_cells;
assert((bodyCells[legacyCells.faction_robe] || 0) >= 50,
  `Body must keep the outer robe/sleeve region on faction cell ${legacyCells.faction_robe}; `
  + `legacy-cells export measures 88 tris, the default-cells variant only 34 (belt)`);
assert((bodyCells[legacyCells.trim] || 0) >= 20, 'Body must keep collar/belt/cuff trim on the legacy trim cell');
assert((bodyCells[legacyCells.trousers] || 0) >= 20, 'Body must keep the trousers on the legacy trousers cell');

const roleBudget = {};
let maxCore = 0, maxAttachmentTotal = 0, maxFull = 0;
for (const role of roles) {
  const config = manifest.roles[role];
  assert.equal(config.body, bodyId, `${role} must reuse the same body`);
  assert(config.hair && manifest.modules[config.hair]);
  assert([config.weapon, config.prop, config.tag].filter(Boolean).length <= 2, 'No full weapon/prop/tag stack');
  const core = moduleTriangles[config.body] + moduleTriangles[config.hair];
  assert(core >= budget.core_body_hair_min && core <= budget.core_body_hair_max,
    `${role} core silhouette body+hair ${core} outside ${budget.core_body_hair_min}–${budget.core_body_hair_max}`);
  const attachments = {};
  let attachmentTotal = 0;
  for (const slot of ['robe', 'weapon', 'back', 'prop', 'tag']) {
    const moduleId = config[slot];
    if (!moduleId) continue;
    assert(budget.attachment_slots.includes(slot), `Budget policy must cover attachment slot ${slot}`);
    const triangles = moduleTriangles[moduleId];
    assert(triangles <= budget.attachment_module_max,
      `${role} ${slot} ${moduleId} has ${triangles} tris, over the ${budget.attachment_module_max} attachment cap`);
    attachments[moduleId] = triangles;
    attachmentTotal += triangles;
  }
  assert(attachmentTotal <= budget.attachment_total_max,
    `${role} attachments ${attachmentTotal} tris exceed ${budget.attachment_total_max}`);
  const full = core + attachmentTotal;
  assert(full <= budget.full_outfit_max, `${role} full outfit ${full} tris exceed ${budget.full_outfit_max}`);
  roleBudget[role] = { core, attachments, attachmentTotal, full };
  maxCore = Math.max(maxCore, core);
  maxAttachmentTotal = Math.max(maxAttachmentTotal, attachmentTotal);
  maxFull = Math.max(maxFull, full);
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
let previousAssetSha256 = null;
if (!runtimeOnly) {
  assert(fs.statSync(path.join(root, 'source/cultivator_master.blend')).size > 10000, 'Editable master scene');
  const previous = path.join(root, 'mesh/cultivator_library_prev.glb');
  assert(fs.existsSync(previous), 'Previous cultivator GLB is kept for rollback');
  previousAssetSha256 = createHash('sha256').update(fs.readFileSync(previous)).digest('hex');
  assert.equal(manifest.rollback?.previous_asset_sha256?.toLowerCase(), previousAssetSha256,
    'Rollback previous_asset_sha256 must match mesh/cultivator_library_prev.glb');
}

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

const result = { generatedAt: new Date().toISOString(), pass: true, glbBytes: binary.length, assetSha256,
  previousAssetSha256, baseTriangles: basicCount, modules: moduleTriangles,
  moduleUvCells: Object.fromEntries(Object.entries(moduleDetails).map(([id, detail]) => [id, detail.uvCells])),
  roleBudget, silhouette: { coreBodyHair: [Math.min(...Object.values(roleBudget).map(r => r.core)), maxCore],
    attachmentTotalMax: maxAttachmentTotal, fullOutfitMax: maxFull, policy: budget },
  sharedMeshCount: Object.keys(moduleTriangles).length,
  materialCount: gltf.materials.length, textureCount: gltf.textures.length, bones: joints.map(i => gltf.nodes[i].name), animations: names };
fs.writeFileSync(path.join(root, 'data/structural_validation.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify({ ...result, sourceMasterChecked: !runtimeOnly }, null, 2));
