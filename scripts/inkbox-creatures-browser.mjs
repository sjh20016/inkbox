// 山海异兽真实 WebGL 验收（Edge + CDP，零依赖）
//
// 覆盖（全部按产品支持路径断言，不假设默认镜头一定落在某个 LOD 档）：
//   A. Lab：13 只统一加载、名称/体型/材质/默认姿态可查、8 套动画可切换（真实 AnimationMixer）；
//   B. 游戏 LOD 开启（?renderer=3d）：默认镜头 beast 仍计入实体统计（LOD2 占位也不丢实体）；
//      相机拉近到 LOD1 / LOD0 后 creatureBatch 按物种分布 ≥1、至少 3 种出现，
//      落地 y 与地表一致、朝向为纯 Y 旋转、拾取映射回实体 id；世界重建 3 次资源稳定；
//   C. 游戏 LOD 关闭（?renderer=3d&lod=off）：默认镜头即可见真实模型（全 LOD0 路径）；
//   D. 回退（?renderer=3d&creatures=off&lod=off）：旧灵兽占位照常绘制，游戏不报错；
//   E. 截图落 assets/creatures/preview/，摘要落 data/runtime_validation.json。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launch, sleep } from './cdp.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.CREATURE_PORT || 4187);
const base = process.env.CREATURE_URL || `http://127.0.0.1:${port}`;
const output = path.join(root, 'assets/creatures/preview');
const reportFile = path.join(root, 'assets/creatures/data/runtime_validation.json');
const EXPECTED_IDS = ['jingwei', 'biyi', 'chiru', 'xuangui', 'tiangou', 'dangkang', 'jiuweihu', 'lushu', 'dijiang', 'zheng', 'qiongqi', 'fei', 'kaiming'];
const CLIPS = ['static', 'idle', 'walk', 'run', 'eat', 'dance', 'gesture-positive', 'gesture-negative'];
const WORLD_TRIAL = ['tiangou', 'dangkang', 'lushu', 'xuangui'];
const SPAWN_BEASTS = 24;
let server, browser;
const report = { generatedAt: new Date().toISOString(), lab: {}, game: {}, lodOff: {}, fallback: {}, errors: [], pass: false };
fs.mkdirSync(output, { recursive: true });

const spawnBeastsExpression = target => `
  const k = window.inkbox;
  k.newWorld('small', 20261017); k.speedIndex = 0;
  const w = k.world; let made = 0;
  for (let y = 10; y < w.h - 10 && made < ${target}; y += 6) {
    for (let x = 10; x < w.w - 10 && made < ${target}; x += 6) {
      if (w.isWalkable(y * w.w + x)) made += k.life.spawn(x, y, 'beast', 1, 0);
    }
  }
  return { made, beasts: w.entities.filter(e => e.sp === 'beast').length, entities: w.entities.length };
`;

const readWorldLodStatsExpression = `
  const k = window.inkbox, renderer = k.render3d.renderer;
  const stage = renderer.stages.get('mortal');
  const entityLayer = stage.entities;
  const derived = entityLayer.derive(k.world);
  const visible = {};
  for (const cls of ['human', 'cultivator', 'beast', 'spirit', 'wraith']) visible[cls] = entityLayer.visibleList(derived, cls).length;
  const batch = entityLayer.creatureBatch;
  const bySpecies = {};
  if (batch) for (const mesh of batch.group.children) if (mesh.count) bySpecies[mesh.userData.species] = mesh.count;
  return { ppu: entityLayer._viewPpu ?? null, zoom: renderer.cameraRig.camera.zoom,
    visible, visibleTotal: Object.values(visible).reduce((a, b) => a + b, 0),
    creatureInstances: batch?.stats?.instances || 0, bySpecies, batch: batch ? { ...batch.stats } : null,
    stats: { ...entityLayer.stats, byClass: { ...entityLayer.stats.byClass }, lod: [...entityLayer.stats.lod] },
    placeholderCount: entityLayer.placeholderMeshes.beast.count,
    lodMeshCounts: (entityLayer.lodMeshes.beast || []).map(mesh => mesh.count) };
`;

try {
  if (!process.env.CREATURE_URL) {
    server = spawn(process.execPath, ['scripts/inkbox-server.mjs', '--port', String(port)], { cwd: root, stdio: 'pipe', windowsHide: true });
    let serverError = '';
    server.stderr.on('data', data => { serverError += data; });
    server.on('error', error => { serverError += error.message; });
    let ready = false;
    for (let i = 0; i < 80; i += 1) {
      if (server.exitCode !== null) throw new Error(`Creature QA server exited: ${serverError}`);
      try { const response = await fetch(`${base}/creature-lab.html`); ready = response.ok; } catch { /* boot */ }
      if (ready) break;
      await sleep(150);
    }
    assert(ready, 'Creature QA server failed to start');
  }

  // ── A. Lab：13 只 + 8 套动画 ─────────────────────────────────────────
  browser = await launch({ url: `${base}/creature-lab.html`, width: 1440, height: 900, gpu: process.env.CREATURE_GPU !== '0' });
  assert(await browser.waitFor('return window.creatureLab?.ready === true', { timeoutMs: 45000 }),
    `Creature lab not ready: ${browser.errors().join(' | ')}`);
  report.browser = browser.meta;
  report.lab.loaded = await browser.js(`
    const lab = window.creatureLab;
    return { species: lab.species.map(species => species.id), names: lab.species.map(species => species.name_zh),
      heights: lab.species.map(species => species.height), clips: lab.metrics().clips, errors: lab.errors.slice(),
      loadedFrom: performance.getEntriesByType('resource').filter(entry => /creature.*(glb|png|json)$/.test(entry.name)).map(entry => entry.name) };
  `);
  assert.deepEqual(report.lab.loaded.species, EXPECTED_IDS, 'Lab must load all 13 creatures in manifest order');
  assert.deepEqual(report.lab.loaded.clips, CLIPS, 'Lab exposes the 8 canonical clips');
  assert.deepEqual(report.lab.loaded.errors, [], 'Lab library reports no per-species load errors');
  assert(report.lab.loaded.loadedFrom.filter(url => url.endsWith('.glb')).length === 13, 'Lab must fetch 13 real GLB files');
  assert(report.lab.loaded.loadedFrom.some(url => url.endsWith('creature_palette.png')), 'Lab must load the external 16×1 palette');
  report.lab.lineup = await browser.js(`
    const lab = window.creatureLab;
    lab.select('all');
    return new Promise(resolve => setTimeout(() => resolve(lab.metrics()), 300));
  `);
  assert.equal(report.lab.lineup.species, 13);
  assert.equal(report.lab.lineup.rigs, 13);
  assert.equal(report.lab.lineup.materialCount, 1, 'All 13 rigs share one palette material');
  assert.equal(report.lab.lineup.textureCount, 1, 'All 13 rigs share one palette texture');
  assert.equal(report.lab.lineup.allClipsMatch, true, 'Every rig has 8 clips in canonical order');
  assert(report.lab.lineup.clipsPerRig.every(count => count === 8), 'Every rig can play every clip');
  assert(report.lab.lineup.drawCalls > 20 && report.lab.lineup.triangles > 4000, 'Lab submits real three.js geometry');
  await browser.screenshot(path.join(output, 'creature_lab_lineup.png'));
  report.lab.info = await browser.js(`
    const lab = window.creatureLab;
    const pick = lab.species.find(species => species.id === 'lushu');
    return { pick, speciesCount: lab.species.length, defaultRigVisible: lab.rigs.get('jingwei').scene.visible,
      worldTrial: lab.species.filter(species => species.worldTrial).map(species => species.id) };
  `);
  assert.equal(report.lab.info.pick.name_zh, '鹿蜀');
  assert(report.lab.info.pick.clips.length === 8 && report.lab.info.pick.triangles === 504);
  assert.deepEqual([...report.lab.info.worldTrial].sort(), [...WORLD_TRIAL].sort(), 'Lab marks the 4 world trial species');
  report.lab.animation = await browser.js(`
    return (async () => {
      const lab = window.creatureLab;
      lab.select('lushu');
      const rig = lab.rigs.get('lushu');
      const rootNode = rig.gltfScene.getObjectByName('root');
      const snapshot = () => ({ p: rootNode.position.toArray(), q: rootNode.quaternion.toArray() });
      const rest = snapshot();
      lab.play('walk');
      await new Promise(resolve => setTimeout(resolve, 400));
      const walking = snapshot();
      lab.play('gesture-positive');
      await new Promise(resolve => setTimeout(resolve, 250));
      const gesturing = snapshot();
      const isolated = [...lab.rigs.entries()].filter(([, entry]) => entry.scene.visible).map(([id]) => id);
      return { rest, walking, gesturing, isolated, metrics: lab.metrics() };
    })();
  `);
  assert.deepEqual(report.lab.animation.isolated, ['lushu'], 'select() isolates one species');
  assert.notDeepEqual(report.lab.animation.rest, report.lab.animation.walking, 'walk must actually animate the rig');
  assert.notDeepEqual(report.lab.animation.walking, report.lab.animation.gesturing, 'AnimationMixer switches clips');
  assert.equal(report.lab.animation.metrics.currentClip, 'gesture-positive');
  assert.equal(report.lab.animation.metrics.materialCount, 1);
  await sleep(150);
  await browser.screenshot(path.join(output, 'creature_lab_animation.png'));
  report.lab.defaultPose = await browser.js(`
    const lab = window.creatureLab;
    lab.play('rest');
    return { currentClip: lab.metrics().currentClip, selected: lab.metrics().selected };
  `);
  assert.equal(report.lab.defaultPose.currentClip, 'rest', 'Default rest pose is available');
  report.errors.push(...browser.errors());
  assert.deepEqual(report.errors, [], 'Lab must have no runtime or resource errors');

  // ── B. 游戏 LOD 开启：默认 LOD2 不丢实体；LOD1/LOD0 显示真实模型 ──────
  await browser.cdp.send('Page.navigate', { url: `${base}/inkbox.html?renderer=3d` });
  assert(await browser.waitFor('return !!window.inkbox?.render3d?.renderer', { timeoutMs: 45000 }), 'Game Render3D must boot');
  report.game.library = await browser.js(`
    return (async () => {
      const renderer = window.inkbox.render3d.renderer;
      await renderer.creatureLoadPromise;
      return { ready: !!renderer.creatureLibrary && !renderer.creatureLibrary.disposed,
        error: renderer.creatureLoadError ? String(renderer.creatureLoadError.message || renderer.creatureLoadError) : null,
        worldSpecies: renderer.creatureLibrary ? [...renderer.creatureLibrary.worldSpecies] : [],
        speciesCount: renderer.creatureLibrary ? renderer.creatureLibrary.size : 0 };
    })();
  `);
  assert(report.game.library.ready, `Game creature library must load: ${report.game.library.error}`);
  assert.deepEqual(report.game.library.worldSpecies, WORLD_TRIAL, 'Game preloads the 4 world trial species');
  assert.equal(report.game.library.speciesCount, 4, 'Game loads only the 4 trial species');
  report.game.spawn = await browser.js(spawnBeastsExpression(SPAWN_BEASTS));
  assert(report.game.spawn.beasts >= 8, 'Test world must contain real beast entities');
  assert(await browser.waitFor('return window.inkbox.render3d.renderer.world === window.inkbox.world && !!window.inkbox.render3d.renderer.stages.get("mortal")?.entities?.creatureBatch', { timeoutMs: 30000 }),
    'Rebuilt stage must keep the creature batch');

  // B1：默认镜头（产品默认 LOD 开启）——实体统计不得丢 beast（占位也算）。
  await sleep(600);
  report.game.defaultLod = await browser.js(readWorldLodStatsExpression);
  assert.equal(report.game.defaultLod.stats.byClass.beast, report.game.defaultLod.visible.beast,
    'Default camera keeps every visible beast in the entity statistics (no loss on LOD2)');
  assert.equal(report.game.defaultLod.stats.instances, report.game.defaultLod.visibleTotal,
    'Default camera submits exactly one presentation per visible entity');
  assert.equal(report.game.defaultLod.stats.lod.reduce((a, b) => a + b, 0), report.game.defaultLod.stats.instances,
    'LOD counters add up to the submitted instances');
  await browser.screenshot(path.join(output, 'creature_world_default_lod.png'));

  // B2：拉近到 LOD1（默认镜头 ppu≈1.86 时 zoom 2.5 → ppu≈4.6，灵兽宽 2.5×ppu > 7px）。
  let lod1Visible = await browser.waitFor('return (window.inkbox.render3d.renderer.entities?.creatureBatch?.stats?.instances || 0) > 0', { timeoutMs: 3000 });
  if (!lod1Visible) {
    await browser.js(`
      const renderer = window.inkbox.render3d.renderer;
      const camera = renderer.cameraRig.camera;
      camera.zoom = 2.5; camera.updateProjectionMatrix();
      return true;
    `);
    lod1Visible = await browser.waitFor('return (window.inkbox.render3d.renderer.entities?.creatureBatch?.stats?.instances || 0) > 0', { timeoutMs: 15000 });
  }
  assert(lod1Visible, 'LOD1/zoomed camera must display real creature models');
  report.game.lod1 = await browser.js(readWorldLodStatsExpression);
  assert(report.game.lod1.creatureInstances > 0, 'LOD1 submits real creature instances');
  const lod1Species = Object.entries(report.game.lod1.bySpecies).filter(([, count]) => count > 0);
  assert(lod1Species.length >= 3, `LOD1 must show at least 3 species (got ${JSON.stringify(report.game.lod1.bySpecies)})`);
  assert(report.game.lod1.stats.creatures === report.game.lod1.creatureInstances, 'EntityLayer stats expose LOD1 creature instances');
  await browser.screenshot(path.join(output, 'creature_world_lod1.png'));

  // B3：拉到近景 LOD0，聚焦一头灵兽截图，并做落地/朝向/拾取/只读断言。
  await browser.js(`
    const k = window.inkbox, renderer = k.render3d.renderer;
    const camera = renderer.cameraRig.camera;
    camera.zoom = 12; camera.updateProjectionMatrix();
    const beast = k.world.entities.find(entity => entity.sp === 'beast');
    if (beast) renderer.cameraRig.focusOn(beast.x, beast.y, renderer.entities.elevation.at(beast.x, beast.y), { duration: 0.05 });
    return true;
  `);
  assert(await browser.waitFor('return (window.inkbox.render3d.renderer.entities?._viewPpu || 0) > 15', { timeoutMs: 15000 }),
    'LOD0 zoom must reach the detailed pixel scale');
  report.game.lod0 = await browser.js(readWorldLodStatsExpression);
  assert(report.game.lod0.creatureInstances > 0, 'LOD0 submits real creature instances');
  report.game.world = await browser.js(`
    const k = window.inkbox, renderer = k.render3d.renderer;
    const stage = renderer.stages.get('mortal');
    const before = JSON.stringify({ entities: k.world.entities, factions: k.world.factions, day: k.world.day });
    stage.entities.update(1, k.world, { heightChanged: true });
    const after = JSON.stringify({ entities: k.world.entities, factions: k.world.factions, day: k.world.day });
    const entityLayer = stage.entities;
    const derived = entityLayer.derive(k.world);
    const visibleBeasts = entityLayer.visibleList(derived, 'beast');
    const batch = entityLayer.creatureBatch;
    const placements = [];
    const speciesCounts = {};
    for (const mesh of batch.group.children) {
      if (!mesh.count) continue;
      speciesCounts[mesh.userData.species] = mesh.count;
      const matrices = mesh.instanceMatrix.array;
      for (let i = 0; i < mesh.count; i += 1) {
        const entity = mesh.userData.renderEntities[i];
        const base = i * 16;
        const y = matrices[base + 13];
        const expectedY = entityLayer.elevation.at(entity.x, entity.y) + entity.lift;
        // 纯 Y 旋转 ⇒ 列主序矩阵的 x/z 倾斜分量 e[1]、e[9] 为 0。
        placements.push({ id: entity.id, species: mesh.userData.species, y, expectedY,
          dy: Math.abs(y - expectedY), tilt: [matrices[base + 1], matrices[base + 9]] });
      }
    }
    return { pure: before === after, visibleBeasts: visibleBeasts.length, batch: batch.stats, bySpecies: speciesCounts,
      placements, stats: { ...entityLayer.stats, byClass: { ...entityLayer.stats.byClass }, lod: [...entityLayer.stats.lod] },
      materialCount: new Set(batch.group.children.map(mesh => mesh.material)).size,
      placeholderCount: entityLayer.placeholderMeshes.beast.count,
      entities: k.world.entities.length, creatures: entityLayer.stats.creatures };
  `);
  assert(report.game.world.pure, 'Presentation must not modify the world');
  assert.equal(report.game.world.materialCount, 1, 'All real creature models share one material');
  assert.equal(report.game.world.batch.overflow, 0, 'No creature batch overflow in the test world');
  assert.equal(report.game.world.batch.instances, report.game.world.visibleBeasts, 'LOD0 draws every visible beast as a real model');
  assert.equal(report.game.world.creatures, report.game.world.visibleBeasts, 'EntityLayer stats expose creature instances');
  assert.equal(report.game.world.placeholderCount, 0, 'Real models replace the legacy beast placeholder');
  const speciesSeen = Object.entries(report.game.world.bySpecies).filter(([, count]) => count > 0);
  assert(speciesSeen.length >= 3, `At least 3 world trial species must appear (got ${JSON.stringify(report.game.world.bySpecies)})`);
  assert(report.game.world.placements.every(placement => placement.dy < 1e-6), 'Creature feet must sit on the interpolated terrain height');
  assert(report.game.world.placements.every(placement => Math.abs(placement.tilt[0]) < 1e-6 && Math.abs(placement.tilt[1]) < 1e-6),
    'Creature facing is a pure Y rotation (no invented tilt)');
  assert(report.game.world.placements.every(placement => WORLD_TRIAL.includes(placement.species)), 'Species ids come from the world trial list');

  report.game.stableFacing = await browser.js(`
    const k = window.inkbox, renderer = k.render3d.renderer;
    const stage = renderer.stages.get('mortal');
    const batch = stage.entities.creatureBatch;
    const snapshot = () => batch.group.children.map(mesh => Array.from(mesh.instanceMatrix.array.slice(0, mesh.count * 16)));
    stage.entities.update(1, k.world, { heightChanged: true });
    const first = snapshot();
    stage.entities.update(1, k.world, { heightChanged: true });
    const second = snapshot();
    return { stable: JSON.stringify(first) === JSON.stringify(second), meshes: batch.group.children.length };
  `);
  assert(report.game.stableFacing.stable, 'Creature placement/facing is stable across rewrites');

  // 拾取：真实射线命中 InstancedMesh，instanceId → 世界实体 id。
  report.game.picking = await browser.js(`
    return import('/vendor/three/build/three.module.js').then(THREE => {
      const renderer = window.inkbox.render3d.renderer;
      const stage = renderer.stages.get('mortal');
      const batch = stage.entities.creatureBatch;
      renderer.scene.updateMatrixWorld(true);
      renderer.cameraRig.camera.updateMatrixWorld(true);
      const camera = renderer.cameraRig.camera;
      const results = [];
      for (const mesh of batch.group.children) {
        if (!mesh.count) continue;
        for (let i = 0; i < Math.min(2, mesh.count); i += 1) {
          const matrix = new THREE.Matrix4();
          mesh.getMatrixAt(i, matrix);
          const position = new THREE.Vector3().setFromMatrixPosition(matrix);
          const species = batch.library.species.get(mesh.userData.species);
          position.y += species.height * 0.5;
          const projected = position.clone().project(camera);
          const raycaster = new THREE.Raycaster();
          raycaster.setFromCamera(new THREE.Vector2(projected.x, projected.y), camera);
          const hits = raycaster.intersectObject(batch.group, true)
            .filter(hit => hit.instanceId != null && hit.object.visible && hit.object.count);
          const entity = hits[0]?.object.userData.renderEntities?.[hits[0].instanceId];
          results.push({ expected: mesh.userData.renderEntities[i].id, picked: entity?.id ?? null,
            mesh: hits[0]?.object.name ?? null, mapped: hits.length > 0 && entity != null });
        }
      }
      return results;
    });
  `);
  assert(report.game.picking.length >= speciesSeen.length, 'Picking must be sampled across species');
  assert(report.game.picking.every(result => result.mapped), 'Raycast must resolve instanceId → world entity');
  assert(report.game.picking.some(result => result.expected === result.picked), 'Picking must map back to the exact beast id');

  // 交付截图：世界内近景（手动摆一个俯视 3/4 机位对准一头鹿蜀，避免山体遮挡）。
  await browser.js(`
    const k = window.inkbox, renderer = k.render3d.renderer;
    const camera = renderer.cameraRig.camera;
    const batch = renderer.entities.creatureBatch;
    const stage = renderer.stages.get('mortal');
    // 交付截图选一头周围树最少的灵兽（优先鹿蜀），避免树冠挡住模型。
    const speciesById = new Map();
    for (const mesh of batch.group.children) for (const entity of mesh.userData.renderEntities) speciesById.set(entity.id, mesh.userData.species);
    const trees = stage.vegetation?.trees || [];
    let target = null, bestScore = -Infinity;
    for (const entity of k.world.entities.filter(item => item.sp === 'beast')) {
      let nearestTree = 30;
      for (const tree of trees) nearestTree = Math.min(nearestTree, Math.hypot(tree.x - entity.x, tree.y - entity.y));
      const score = Math.min(nearestTree, 20) + (speciesById.get(entity.id) === 'lushu' ? 4 : 0);
      if (score > bestScore) { bestScore = score; target = entity; }
    }
    if (target) {
      const p = renderer.coordinates.worldToRender(target.x, target.y, 0);
      const groundY = renderer.entities.elevation.at(target.x, target.y) + (Number.isFinite(target.lift) ? target.lift : 0);
      camera.zoom = 14; camera.updateProjectionMatrix();
      renderer.cameraRig.cancelFocus();
      renderer.cameraRig.controls.target.set(p.x, groundY + 0.8, p.z);
      camera.position.set(p.x + 3, groundY + 14, p.z + 4);
      renderer.cameraRig.controls.update();
    }
    renderer.update(1 / 60);
    renderer.render();
    return true;
  `);
  await sleep(500);
  await browser.screenshot(path.join(output, 'creature_world.png'));

  // B4：世界重建 3 次——库保留、batch 重建、资源计数稳定。
  report.game.baseline = await browser.js(`
    const renderer = window.inkbox.render3d.renderer;
    window.__creatureLibraryProbe = renderer.creatureLibrary;
    return { geometries: renderer.gpu.info.memory.geometries, textures: renderer.gpu.info.memory.textures,
      programs: renderer.gpu.info.programs.length, libraryMaterial: renderer.creatureLibrary.material.uuid };
  `);
  for (let i = 0; i < 3; i += 1) {
    await browser.js(`const k = window.inkbox; k.newWorld('small', ${20261018 + i}); k.speedIndex = 0; return true;`);
    assert(await browser.waitFor(`return window.inkbox.render3d.renderer.world === window.inkbox.world && !!window.inkbox.render3d.renderer.stages.get('mortal')?.entities?.creatureBatch`, { timeoutMs: 20000 }),
      'Rebuilt stages must retain the shared creature library');
  }
  report.game.afterRebuild = await browser.js(`
    const renderer = window.inkbox.render3d.renderer;
    renderer.update(1 / 60); renderer.render();
    return { geometries: renderer.gpu.info.memory.geometries, textures: renderer.gpu.info.memory.textures,
      programs: renderer.gpu.info.programs.length,
      sameLibrary: renderer.creatureLibrary === window.__creatureLibraryProbe,
      materialUuid: renderer.creatureLibrary.material.uuid,
      creatureBatchAlive: !!renderer.stages.get('mortal')?.entities?.creatureBatch };
  `);
  assert(report.game.afterRebuild.sameLibrary, 'World rebuild must reuse the loaded creature library (no reload)');
  assert.equal(report.game.afterRebuild.materialUuid, report.game.baseline.libraryMaterial, 'World rebuild keeps the shared palette material');
  assert(report.game.afterRebuild.creatureBatchAlive, 'Rebuilt stage owns a fresh creature batch');
  assert(report.game.afterRebuild.geometries <= report.game.baseline.geometries + 4,
    `Repeated world rebuild must release old geometry (baseline ${report.game.baseline.geometries} → ${report.game.afterRebuild.geometries})`);
  assert(report.game.afterRebuild.textures <= report.game.baseline.textures + 2,
    `Repeated world rebuild must release old textures (baseline ${report.game.baseline.textures} → ${report.game.afterRebuild.textures})`);
  report.errors.push(...browser.errors());
  assert.deepEqual(report.errors, [], 'Game must have no runtime or resource errors');

  // ── C. 游戏 LOD 关闭：默认镜头全真模型（产品支持的 lod=off 路径）────────
  // 每个小节用独立浏览器实例：多次 Page.navigate 会累积旧 WebGL 上下文，
  // 隔离实例能避免 GPU 进程压力造成的假阴性。
  await browser.close();
  browser = await launch({ url: `${base}/inkbox.html?renderer=3d&lod=off`, width: 1440, height: 900, gpu: process.env.CREATURE_GPU !== '0' });
  assert(await browser.waitFor('return location.search.includes("lod=off") && !!window.inkbox?.render3d?.renderer', { timeoutMs: 45000 }),
    `LOD-off Render3D must boot: ${browser.errors().join(' | ')}`);
  report.lodOff.library = await browser.js(`
    return (async () => {
      const renderer = window.inkbox.render3d.renderer;
      await renderer.creatureLoadPromise;
      return { ready: !!renderer.creatureLibrary, lodEnabled: renderer.lodEnabled };
    })();
  `);
  assert(report.lodOff.library.ready, 'LOD-off page still loads the creature library');
  assert.equal(report.lodOff.library.lodEnabled, false, 'lod=off disables LOD');
  report.lodOff.spawn = await browser.js(spawnBeastsExpression(SPAWN_BEASTS));
  assert(await browser.waitFor('return window.inkbox.render3d.renderer.world === window.inkbox.world && (window.inkbox.render3d.renderer.entities?.creatureBatch?.stats?.instances || 0) > 0', { timeoutMs: 30000 }),
    'LOD off must display real creature models at the default camera');
  report.lodOff.stats = await browser.js(readWorldLodStatsExpression);
  assert(report.lodOff.stats.creatureInstances > 0, 'LOD-off default camera submits real creature instances');
  assert.equal(report.lodOff.stats.creatureInstances, report.lodOff.stats.visible.beast,
    'LOD-off draws every visible beast as a real model');
  assert.equal(report.lodOff.stats.stats.byClass.beast, report.lodOff.stats.visible.beast, 'LOD-off entity statistics keep every beast');
  assert.equal(report.lodOff.stats.placeholderCount, 0, 'LOD-off replaces the legacy beast placeholder');
  const lodOffSpecies = Object.entries(report.lodOff.stats.bySpecies).filter(([, count]) => count > 0);
  assert(lodOffSpecies.length >= 3, `LOD-off must show at least 3 species (got ${JSON.stringify(report.lodOff.stats.bySpecies)})`);
  await browser.js(`
    const k = window.inkbox, renderer = k.render3d.renderer;
    const camera = renderer.cameraRig.camera;
    const batch = renderer.entities.creatureBatch;
    const stage = renderer.stages.get('mortal');
    const speciesById = new Map();
    for (const mesh of batch.group.children) for (const entity of mesh.userData.renderEntities) speciesById.set(entity.id, mesh.userData.species);
    const trees = stage.vegetation?.trees || [];
    let target = null, bestScore = -Infinity;
    for (const entity of k.world.entities.filter(item => item.sp === 'beast')) {
      let nearestTree = 30;
      for (const tree of trees) nearestTree = Math.min(nearestTree, Math.hypot(tree.x - entity.x, tree.y - entity.y));
      const score = Math.min(nearestTree, 20) + (speciesById.get(entity.id) === 'lushu' ? 4 : 0);
      if (score > bestScore) { bestScore = score; target = entity; }
    }
    if (target) {
      const p = renderer.coordinates.worldToRender(target.x, target.y, 0);
      const groundY = renderer.entities.elevation.at(target.x, target.y) + (Number.isFinite(target.lift) ? target.lift : 0);
      camera.zoom = 14; camera.updateProjectionMatrix();
      renderer.cameraRig.cancelFocus();
      renderer.cameraRig.controls.target.set(p.x, groundY + 0.8, p.z);
      camera.position.set(p.x + 3, groundY + 14, p.z + 4);
      renderer.cameraRig.controls.update();
    }
    renderer.update(1 / 60);
    renderer.render();
    return true;
  `);
  await sleep(500);
  await browser.screenshot(path.join(output, 'creature_world_lod_off.png'));
  report.errors.push(...browser.errors());
  assert.deepEqual(report.errors, [], 'LOD-off game must have no runtime or resource errors');

  // ── D. 回退：creatures=off ⇒ 旧灵兽占位，游戏继续 ──────────────────────
  await browser.close();
  browser = await launch({ url: `${base}/inkbox.html?renderer=3d&creatures=off&lod=off`, width: 1440, height: 900, gpu: process.env.CREATURE_GPU !== '0' });
  assert(await browser.waitFor('return location.search.includes("creatures=off") && !!window.inkbox?.render3d?.renderer', { timeoutMs: 45000 }),
    `Fallback Render3D must boot: ${browser.errors().join(' | ')}`);
  report.fallback.library = await browser.js(`
    const renderer = window.inkbox.render3d.renderer;
    return { creatureLibrary: !!renderer.creatureLibrary, loadPromise: !!renderer.creatureLoadPromise,
      error: String(renderer.creatureLoadError || '') };
  `);
  assert.equal(report.fallback.library.creatureLibrary, false, '?creatures=off must not load the creature library');
  report.fallback.spawn = await browser.js(spawnBeastsExpression(8));
  assert(await browser.waitFor('return window.inkbox.render3d.renderer.world === window.inkbox.world && (window.inkbox.render3d.renderer.entities?.stats?.byClass?.beast || 0) > 0', { timeoutMs: 30000 }),
    'Without the library, beast placeholders must still be drawn');
  report.fallback.placeholder = await browser.js(`
    const k = window.inkbox, entityLayer = k.render3d.renderer.entities;
    return { creatureBatch: !!entityLayer.creatureBatch, creatures: entityLayer.stats.creatures || 0,
      beastInstances: entityLayer.stats.byClass.beast, placeholderCount: entityLayer.placeholderMeshes.beast.count,
      beastCount: k.world.entities.filter(entity => entity.sp === 'beast').length };
  `);
  assert.equal(report.fallback.placeholder.creatureBatch, false, 'Fallback path has no creature batch');
  assert(report.fallback.placeholder.beastInstances > 0, 'Fallback path draws legacy beast placeholders');
  assert.equal(report.fallback.placeholder.placeholderCount, report.fallback.placeholder.beastInstances);
  report.errors.push(...browser.errors());
  assert.deepEqual(report.errors, [], 'Fallback game must have no runtime or resource errors');

  report.pass = true;
  console.log(JSON.stringify({ pass: true,
    lab: { species: report.lab.lineup.species, materialCount: report.lab.lineup.materialCount, clips: report.lab.lineup.clips },
    game: { defaultLod: report.game.defaultLod.stats.lod, lod1Species: report.game.lod1.bySpecies, lod0Species: report.game.world.bySpecies,
      geometries: [report.game.baseline.geometries, report.game.afterRebuild.geometries],
      textures: [report.game.baseline.textures, report.game.afterRebuild.textures], picking: report.game.picking.length },
    lodOff: report.lodOff.stats.bySpecies, fallback: report.fallback.placeholder }, null, 2));
} catch (error) {
  report.pass = false;
  report.errors.push(error.stack || String(error));
  process.exitCode = 1;
  console.error(error.stack || error);
} finally {
  fs.mkdirSync(path.dirname(reportFile), { recursive: true });
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2) + '\n');
  await browser?.close();
  if (server) { server.kill(); await sleep(200); }
}
