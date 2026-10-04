import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { decodeEnvironmentGLTF, readEnvironmentLibrary } from './inkbox-environment-glb-reader.mjs';
import { EnvironmentAssetLibrary, loadEnvironmentAssetLibrary } from '../src/inkbox/render3d/environment/EnvironmentAssetLibrary.js';
import { EnvironmentBatch } from '../src/inkbox/render3d/environment/EnvironmentBatch.js';
import { createEnvironmentMaterial } from '../src/inkbox/render3d/environment/EnvironmentMaterial.js';
import { Render3DHost } from '../src/inkbox/render3d/Render3DHost.js';
import { deriveSettlements } from '../src/inkbox/render3d/settlements/SettlementLayer.js';
import { resolvePlaneSubject } from '../src/inkbox/ui/realmInspector.js';
import { WORLD_PRESETS, STRUCT } from '../src/inkbox/core/config.js';
import { mulberry32 } from '../src/inkbox/core/noise.js';
import { createAdvanceState, advanceWorld } from '../src/inkbox/sim/advance.js';
import { Life } from '../src/inkbox/sim/life.js';
import { UpperLife } from '../src/inkbox/sim/upperLife.js';
import { greetOnBoot } from '../src/inkbox/sim/busanzi.js';
import { generateWorld } from '../src/inkbox/world/worldgen.js';
import { generateUpperWorld, recomputeUpperQi } from '../src/inkbox/world/worldgenUpper.js';
import { generateNetherWorld } from '../src/inkbox/world/worldgenNether.js';
import { applyScenario } from '../src/inkbox/render3d/art/VisualScenarios.js';
import { serializeWorld } from '../src/inkbox/io/save.js';
import { RegionMask } from '../src/inkbox/ui/RegionMask.js';
import { normalizeRegion } from '../src/inkbox/ui/tools.js';
import { houseFamilyFor } from '../src/inkbox/render3d/settlements/houseFamily.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.resolve(process.env.INKBOX_REPORT_DIR || path.join(ROOT, 'reports/m2c2b/pass1/sample'));
const report = { suite: 'M2-C2B single-house actual-GLB gate', checks: [], pass: false };
const sha = value => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex');
const check = async (name, fn) => { await fn(); report.checks.push({ name, passed: true }); console.log(`PASS ${name}`); };

function naturalGolden() {
  const sandbox = {
    rng: mulberry32(12345), advanceState: createAdvanceState(), selection: null, toolId: 'raise',
    newWorld(presetKey, seed) {
      const preset = WORLD_PRESETS[presetKey] || WORLD_PRESETS.medium;
      this.world = generateWorld({ preset, seed: seed >>> 0, scatter: true });
      this.life = new Life(this.world, mulberry32(this.world.seed ^ 0xa5a5a5a5));
      this.world.upper = generateUpperWorld({ preset, seed: this.world.seed }); recomputeUpperQi(this.world.upper);
      this.upperLife = new UpperLife(this.world.upper);
      this.world.nether = generateNetherWorld({ preset, seed: this.world.seed }); greetOnBoot(this.world, this.rng);
    },
    advanceDays(days) { return advanceWorld(this.world, days, { life: this.life, upperLife: this.upperLife,
      rng: this.rng, state: this.advanceState, riftActive: false }); },
  };
  applyScenario(sandbox, 'GOLDEN_A'); return sandbox;
}
function smallWorld(seed) {
  const preset = { w: 32, h: 24 }, world = generateWorld({ preset, seed, scatter: true });
  world.upper = generateUpperWorld({ preset, seed }); world.nether = generateNetherWorld({ preset, seed }); return world;
}
function hostFor(world, options = {}) {
  const camera = new THREE.OrthographicCamera(-110, 110, 90, -90, .1, 2000);
  camera.position.set(0, 150, 150); camera.lookAt(0, 0, 0); camera.updateMatrixWorld(true);
  const gpu = { info: { memory: { geometries: 0, textures: 0 }, render: { calls: 0, triangles: 0 } },
    setPixelRatio() {}, setClearColor() {}, setSize() {}, render() {}, dispose() {} };
  const cameraRig = { camera, update() {}, resize() {}, setDimensions() {}, dispose() {}, focusOn() {} };
  const host = new Render3DHost({}, world, { gpu, cameraRig, characters: false, environment: false,
    productionAssets: true, lodEnabled: true, artProfile: 'realm-style-v1', ...options });
  host.resize(900, 600); host.update(.3); return host;
}
function view(host, ppu) {
  const camera = host.cameraRig.camera;
  for (const stage of host.stages.values()) stage.settlements?.setArtView({ pixelsPerUnit: ppu,
    verticalPixelsPerUnit: ppu, width: 900, height: 600, camera });
}
function disposedCounts(decoded) {
  const result = { geometry: 0, material: 0, texture: 0 }, geometries = new Set(), materials = new Set(), textures = new Set();
  decoded.gltf.scene.traverse(node => { if (node.geometry) geometries.add(node.geometry);
    if (node.material) { materials.add(node.material); if (node.material.map) textures.add(node.material.map); } });
  for (const geometry of geometries) geometry.addEventListener('dispose', () => result.geometry++);
  for (const material of materials) material.addEventListener('dispose', () => result.material++);
  for (const texture of textures) texture.addEventListener('dispose', () => result.texture++);
  Object.defineProperty(result, 'expected', { value: { geometry: geometries.size, material: materials.size, texture: textures.size } });
  return result;
}

try {
  const library = readEnvironmentLibrary(ROOT);
  try {
    await check('shipped GLB, external PNG and semantic UV cells decode exactly', () => {
      assert(library.modules.size >= 12);
      for (const [id,lod0] of [['mortal.house.base',80],['mortal.house.small',128],['mortal.house.courtyard',188]]) {
        assert.deepEqual(library.assetInfo(id).lods.map(n=>library.modules.get(n).triangles), [lod0,30,8]);
        assert.equal(library.modules.get(library.assetInfo(id).hlod).triangles, 14);
      }
      assert(library.modules.get('env_house_courtyard_lod0').uvSlots.every(s => ![12,13,14].includes(s)), 'unowned red/gold wealth symbols were remapped');
      assert.deepEqual(library.modules.get('env_house_base_lod0').uvSlots, [0,1,2,4,5,7,8,9,10]);
      assert.deepEqual(library.geometryFor('mortal.house.base').boundingBox.min.toArray(), [-.5,0,-.5]);
      assert.deepEqual(library.geometryFor('mortal.house.base').boundingBox.max.toArray(), [.5,1,.5]);
      assert.equal(library.texture.image.width, 128); assert.equal(library.texture.image.height, 128);
      for (let slot = 0; slot < 28; slot++) {
        const x = (slot % 8) * 16 + 8, y = Math.floor(slot / 8) * 16 + 8;
        assert.equal(library.texture.image.data[(y * 128 + x) * 4], slot + 1);
      }
      for (const module of library.modules.values()) {
        const geometry = module.geometry, p = geometry.attributes.position, n = geometry.attributes.normal, ix = geometry.index;
        const a = new THREE.Vector3(), b = a.clone(), c = a.clone(), normal = a.clone();
        for (let i = 0; i < ix.count; i += 3) {
          a.fromBufferAttribute(p, ix.getX(i)); b.fromBufferAttribute(p, ix.getX(i + 1)); c.fromBufferAttribute(p, ix.getX(i + 2));
          normal.subVectors(b, a).cross(c.sub(a)).normalize();
          assert(normal.dot(new THREE.Vector3().fromBufferAttribute(n, ix.getX(i))) > .99, `${module.node.name} winding/normal mismatch`);
        }
      }
      report.assets = { triangles: [80,30,8], sourceSlots: [0,1,2,4,5,7,8,9,10],
        glbSha256: sha(fs.readFileSync(path.join(ROOT, 'assets/environment/mesh/environment_library.glb'))),
        atlasSha256: sha(fs.readFileSync(path.join(ROOT, 'assets/environment/materials/EntityAtlas.png'))) };
    });
    await check('batches share decoded geometry, Stage material and atlas; moving instances resets raycast bounds', () => {
      const material = createEnvironmentMaterial(library, 'mortal'), batch = new EnvironmentBatch(library, { material, capacity: 2 });
      let geoDisposed = 0, materialDisposed = 0, textureDisposed = 0;
      const geometry = library.geometryFor('mortal.house.base');
      geometry.addEventListener('dispose', () => geoDisposed++); material.addEventListener('dispose', () => materialDisposed++);
      library.texture.addEventListener('dispose', () => textureDisposed++);
      const source = { houseKey: 'house:1:2:3' }, record = x => ({ assetId: 'mortal.house.base', lod: 0,
        position: { x, y: 0, z: 0 }, scale: { x: 2, y: 3, z: 2 }, source });
      const mesh = batch.meshes.get('env_house_base_lod0');
      assert.equal(mesh.geometry, geometry); assert.equal(mesh.material, material);
      batch.write([record(0)]); mesh.computeBoundingSphere(); assert(mesh.boundingSphere);
      batch.write([record(100)]); assert.equal(mesh.boundingSphere, null);
      batch.group.updateMatrixWorld(true);
      const ray = new THREE.Raycaster(new THREE.Vector3(100, 10, 0), new THREE.Vector3(0,-1,0));
      const hit = ray.intersectObject(mesh)[0]; assert(hit); assert.equal(mesh.userData.renderBuildings[hit.instanceId], source);
      assert.deepEqual(batch.stats, { instances: 1, triangles: 80, drawCalls: 1, overflow: 0, lod: [1,0,0] });
      batch.write([record(0),record(4),record(8)]); assert.equal(batch.stats.overflow, 1);
      assert.throws(() => batch.write([{ ...record(0), scale: { x: -1, y: 1, z: 1 } }]), /positive/);
      batch.dispose(); batch.dispose(); assert.equal(geoDisposed, 0); assert.equal(materialDisposed, 0); assert.equal(textureDisposed, 0);
      material.dispose(); assert.equal(materialDisposed, 1);
    });
    const sandbox = naturalGolden(), world = sandbox.world, before = {
      full: sha({ world, advanceState: sandbox.advanceState }), save: sha(serializeWorld(world)), keys: Object.keys(serializeWorld(world)).sort(),
    };
    await check('natural GOLDEN_A keeps 83 current houses and 5 real halls, without manufactured coordinates', () => {
      const data = deriveSettlements(world, { productionAssets: true });
      assert.equal(data.historicalCandidates, 88); assert.equal(data.currentHouses, 83); assert.equal(data.currentHalls, 5); assert.equal(data.excludedHouses, 0);
      for (const record of data.buildings.filter(b => b.type === 'house')) {
        const village = world.villages.find(v => v.id === record.settlementId);
        assert(village.houses.some(h => h.x === record.houseX && h.y === record.houseY));
        assert.equal(record.structType, world.struct[world.idx(record.houseX, record.houseY)]);
      }
      report.naturalCoverage = { recipe: 'GOLDEN_A', day: world.day, candidates: 88, house: 83, hall: 5, excluded: 0 };
    });
    await check('village row families and roof axis survive level changes, removal, order and camera changes', () => {
      const before = sha(world), data = deriveSettlements(world,{productionAssets:true});
      const counts = {};
      for (const b of data.buildings.filter(b=>b.structType===STRUCT.HOUSE)) {
        const v=world.villages.find(v=>v.id===b.settlementId), original=houseFamilyFor(world.seed,v,b.houseX,b.houseY);
        const changed=houseFamilyFor(world.seed,{...v,level:1,houses:[],pop:99999},b.houseX,b.houseY);
        assert.deepEqual(changed,original); assert.equal(original.assetId,b.productionAssetId);
        assert.equal(Math.abs(Math.sin(original.rotationY))>.5, Math.abs(Math.sin(houseFamilyFor(world.seed,v,v.x+10,v.y+10).rotationY))>.5);
        counts[b.productionAssetId]=(counts[b.productionAssetId]||0)+1;
      }
      assert.deepEqual(Object.keys(counts).sort(), ['mortal.house.base','mortal.house.courtyard','mortal.house.small']);
      assert.equal(sha(world),before); report.houseFamilies=counts;
    });
    const host = hostFor(world, { environmentLibrary: library });
    try {
      await check('all three house LODs and existing far aggregate retain ownership and toggle back to legacy', () => {
        const layer = host.stages.get('mortal').settlements;
        host.setLODEnabled(false); assert.equal(layer.environmentBatch.stats.instances, 83); assert.deepEqual(layer.environmentBatch.stats.lod, [83,0,0]);
        assert(layer.bodies.count >= 5, 'real halls keep fallback');
        assert(layer._renderBuildingLists[0].every(b => b.type !== 'house' || b.structType === STRUCT.HALL));
        host.setLODEnabled(true);
        const observed = [];
        for (const ppu of [60,15,3]) { view(host, ppu); observed.push(layer.environmentBatch.stats.lod); }
        assert(observed.some(lod => lod[0])); assert(observed.some(lod => lod[1]));
        // Intact multi-house villages enter HLOD before single-roof LOD2. A real
        // partial window prevents aggregation and exercises remaining roof LOD2.
        const originalHouse = world.villages.find(v => v.houses?.length > 1).houses[0];
        const { x, y } = originalHouse;
        const region = new RegionMask(normalizeRegion([[x-1,y-1],[x+2,y-1],[x+2,y+2],[x-1,y+2]], world, .45));
        host.setRealmViewState({ open: true, targetPlane: 'upper', region }); host.update(.3); view(host, 2);
        const partial = layer.environmentBatch.stats.lod;
        assert(partial[2] > 0, `partial window must use single roofs: ${JSON.stringify(partial)}`);
        report.partialWindowLOD = partial;
        host.setRealmViewState({ open: false, targetPlane: null, region: null }); host.update(.3);
        view(host, .1); assert(layer.stats.hlodClusters > 0);
        assert(layer.environmentBatch.stats.hlod > 0); assert.deepEqual(layer.environmentBatch.stats.lod,[0,0,0]);
        assert(layer._hlodPickEntries.every(row => row.buildings.length && row.settlementId != null));
        assert.equal(layer.hlodCluster.count,0,'production aggregates replace the old dark cluster');
        for (const group of layer._groups.filter(g=>g.useHlod)) {
          assert(group.clusters.length>=2&&group.clusters.length<=4);
          const seen=new Set(group.clusters.flatMap(c=>c.memberIds));
          assert.equal(seen.size,group.houseCount,'all true house members belong to an aggregate');
        }
        host.setProductionAssetsEnabled(false); host.setLODEnabled(false); assert.equal(layer.environmentBatch.stats.instances, 0); assert(layer.bodies.count >= 88);
        host.setProductionAssetsEnabled(true); assert.equal(layer.environmentBatch.stats.instances, 83);
        report.lodCoverage = observed;
      });
      await check('actual house geometry raycasts to its original house key and exact village', () => {
        const stage = host.stages.get('mortal'), layer = stage.settlements, mesh = layer.environmentBatch.meshes.get('env_house_base_lod0');
        const source = mesh.userData.renderBuildings[0], matrix = new THREE.Matrix4(); mesh.getMatrixAt(0, matrix);
        const target = new THREE.Vector3(0, .6, 0).applyMatrix4(matrix);
        const camera = host.cameraRig.camera;
        camera.position.copy(target).add(new THREE.Vector3(0,30,.1)); camera.lookAt(target); camera.updateMatrixWorld(true); camera.updateProjectionMatrix();
        const ndc = target.clone().project(camera);
        const hit = host.pick((ndc.x + 1) * host.width / 2, (1 - ndc.y) * host.height / 2);
        assert.equal(hit?.kind, 'house'); assert.equal(hit.houseKey, source.houseKey);
        const resolved = resolvePlaneSubject(world, hit.plane, hit);
        assert(resolved); assert.equal(resolved.village.id, source.settlementId);
        const terrainOnly = host.pickPlane((ndc.x + 1) * host.width / 2, (1 - ndc.y) * host.height / 2, 'mortal');
        assert.equal(terrainOnly.kind, 'terrain');
        report.pick = { houseKey: hit.houseKey, settlementId: hit.settlementId, originalXY: [hit.houseX,hit.houseY] };
        // Choose a genuinely visible center surface. Its center may lie underneath
        // a taller real house; a fixed center ray would then test the wrong object.
        let checkedSurfaces = 0;
        const objects = [stage.terrain.mesh];
        layer.group.traverse(m=>{if(m.isInstancedMesh&&m.visible&&m.count)objects.push(m);});
        const ray = new THREE.Raycaster(); host.scene.updateMatrixWorld(true);
        for (const center of layer._selectedBuildings.filter(b => b.type === 'center')) {
          const at = stage.coordinates.worldToRender(center.x, center.y, stage.elevation.at(center.x,center.y));
          for (const dx of [-.4,0,.4]) for (const dz of [-.4,0,.4]) {
            const target = new THREE.Vector3(at.x+dx*center.w,at.y+center.h,at.z+dz*center.d);
            camera.position.copy(target).add(new THREE.Vector3(0,30,.1)); camera.lookAt(target); camera.updateMatrixWorld(true);
            const ndc = target.clone().project(camera); ray.setFromCamera(new THREE.Vector2(ndc.x,ndc.y),camera);
            const first = ray.intersectObjects(objects,false)[0];
            const closest = first?.object.userData.renderBuildings?.[first.instanceId];
            if (!closest) continue;
            const picked = host.pick((ndc.x+1)*host.width/2,(1-ndc.y)*host.height/2);
            assert.equal(picked.kind, closest.houseKey ? 'house' : 'terrain', 'closest submitted surface controls identity');
            if (closest.houseKey) assert.equal(picked.houseKey,closest.houseKey,'a taller real house hides the smaller center proxy');
            checkedSurfaces++;
          }
        }
        assert(checkedSurfaces>0,'natural center rays encounter submitted geometry');
      });
      await check('presentation profiles, realm switches and World replacement preserve full World and save', () => {
        for (const plane of ['upper','nether','mortal']) { host.setActivePlane(plane); host.setArtProfile('legacy'); host.update(.3);
          host.setArtProfile('realm-style-v1'); host.setProductionAssetsEnabled(false); host.setProductionAssetsEnabled(true); }
        const oldGeometry = host.stages.get('mortal').settlements.environmentBatch.meshes.get('env_house_base_lod0').geometry;
        host.setWorld(smallWorld(700)); host.update(.3); assert.equal(host.environmentLibrary, library);
        assert.equal(host.stages.get('mortal').settlements.environmentBatch.meshes.get('env_house_base_lod0').geometry, oldGeometry);
        host.setWorld(world); host.update(.3);
        assert.equal(sha({ world, advanceState: sandbox.advanceState }), before.full);
        assert.equal(sha(serializeWorld(world)), before.save); assert.deepEqual(Object.keys(serializeWorld(world)).sort(), before.keys);
        report.purity = { fullWorldAdvanceSha256: before.full, saveSha256: before.save, saveKeys: before.keys, unchanged: true };
      });
    } finally { host.dispose(); assert.equal(library.disposed, false, 'injected library belongs to caller'); }
    await check('destroyed stale house records are excluded using current struct without writing World', () => {
      const w = smallWorld(701), v = { id: 42, x: 5, y: 5, level: 1, houses: [{ x: 5, y: 5, type: STRUCT.HOUSE },{ x: 6,y: 5,type: STRUCT.HALL }] };
      w.villages = [v]; w.struct[w.idx(5,5)] = STRUCT.RUIN; w.struct[w.idx(6,5)] = STRUCT.HOUSE;
      const hash = sha(w), records = deriveSettlements(w, { productionAssets: true });
      assert.equal(records.houses, 1); assert.equal(records.excludedHouses, 1); assert.equal(records.buildings[0].structType, STRUCT.HOUSE);
      assert.equal(records.buildings[0].buildType, STRUCT.HALL); assert.equal(sha(w), hash);
    });
  } finally { library.dispose(); }
  await check('invalid manifest and palette release each decoded geometry, material and atlas once', () => {
    for (const mutate of [d => { d.paletteSlots.slots[0].semantic = 'wrong'; }, d => { d.manifest.modules.env_house_base_lod0.triangles++; },
      d => { d.manifest.assets['mortal.house.base'].lods[1] = 'missing'; }]) {
      const decoded = decodeEnvironmentGLTF(ROOT), counts = disposedCounts(decoded); mutate(decoded);
      assert.throws(() => new EnvironmentAssetLibrary(decoded.gltf, decoded.manifest, decoded.paletteSlots));
      assert.deepEqual(counts, counts.expected);
    }
  });
  await check('loader fetches each input once and does not double-dispose rejected decoded assets', async () => {
    const decoded = decodeEnvironmentGLTF(ROOT), counts = disposedCounts(decoded), fetched = [];
    decoded.manifest.modules.env_house_base_lod0.triangles++;
    await assert.rejects(loadEnvironmentAssetLibrary({ url: 'https://test.invalid/mesh/environment_library.glb', manifestUrl: 'manifest', paletteUrl: 'palette',
      fetcher: async url => { fetched.push(url); return { ok: true, json: async () => url === 'manifest' ? decoded.manifest : decoded.paletteSlots,
        arrayBuffer: async () => decoded.bytes.buffer.slice(decoded.bytes.byteOffset, decoded.bytes.byteOffset + decoded.bytes.byteLength) }; },
      loader: { parse(bytes, base, resolve) { assert.equal(base, 'https://test.invalid/mesh/'); assert.equal(bytes.byteLength, decoded.bytes.length); resolve(decoded.gltf); } },
    }));
    assert.equal(fetched.length, 3); assert.equal(new Set(fetched).size, 3); assert.deepEqual(counts, counts.expected);
  });
  await check('one asynchronous library survives World/toggle changes and is released once, including late completion', async () => {
    for (const late of [false,true]) {
      const library = readEnvironmentLibrary(ROOT); let releaseCount = 0, loads = 0, finish;
      const originalDispose = library.dispose.bind(library); library.dispose = () => { releaseCount++; originalDispose(); };
      const pending = new Promise(resolve => { finish = resolve; });
      const host = hostFor(smallWorld(702), { loadEnvironmentAssetLibrary: () => { loads++; return pending; } });
      host.setProductionAssetsEnabled(false); host.setWorld(smallWorld(703)); host.setProductionAssetsEnabled(true);
      await Promise.resolve(); assert.equal(loads, 1);
      if (late) host.dispose(); finish(library); await host.environmentLoadPromise;
      if (!late) { assert.equal(host.environmentLibrary, library); host.setWorld(smallWorld(704)); assert.equal(host.environmentLibrary, library); host.dispose(); }
      host.dispose(); assert.equal(releaseCount, 1);
    }
  });
  report.pass = true;
} catch (error) { report.failure = error.stack; process.exitCode = 1; console.error(error.stack); }
finally { fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(path.join(OUT, 'node.json'), JSON.stringify(report, null, 2) + '\n'); }
