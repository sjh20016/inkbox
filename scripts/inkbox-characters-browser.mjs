// Real WebGL acceptance evidence, using the project's existing CDP browser driver.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launch, sleep } from './cdp.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.CHARACTER_PORT || 4186);
const base = process.env.CHARACTER_URL || `http://127.0.0.1:${port}`;
const output = path.join(root, 'assets/characters/cultivator/preview');
const reportFile = path.join(root, 'assets/characters/cultivator/data/runtime_validation.json');
let server, browser;
const report = { generatedAt: new Date().toISOString(), scales: [], game: {}, errors: [] };
fs.mkdirSync(output, { recursive: true });

try {
  if (!process.env.CHARACTER_URL) {
    server = spawn(process.execPath, ['scripts/inkbox-server.mjs', '--port', String(port)], { cwd: root, stdio: 'pipe', windowsHide: true });
    let serverError = '';
    server.stderr.on('data', data => { serverError += data; });
    server.on('error', error => { serverError += error.message; });
    let ready = false;
    for (let i = 0; i < 60; i += 1) {
      if (server.exitCode !== null) throw new Error(`Asset QA server exited: ${serverError}`);
      try { const r = await fetch(`${base}/cultivator-lab.html`); ready = r.ok; } catch { /* boot */ }
      if (ready) break;
      await sleep(150);
    }
    assert(ready, 'Asset QA server failed to start');
  }
  browser = await launch({ url: `${base}/cultivator-lab.html`, width: 1440, height: 900, gpu: process.env.CHARACTER_GPU !== '0' });
  assert(await browser.waitFor('return window.cultivatorLab?.ready', { timeoutMs: 30000 }), `Character scene not ready: ${browser.errors().join(' | ')}`);
  report.browser = browser.meta;
  report.library = await browser.js(`
    const l=window.cultivatorLab.library;
    return { modules:l.modules.size, roles:Object.keys(l.roles), animations:l.animations.map(a=>a.name), loadedFrom:performance.getEntriesByType('resource').filter(r=>/cultivator.*(glb|json)$/.test(r.name)).map(r=>r.name) };
  `);
  if (process.env.CHARACTER_PHASE === 'material') {
    assert.deepEqual(report.library.roles, ['basic']);
    report.materialPrototype = await browser.js(`
      const lab=window.cultivatorLab,c=lab.camera;
      lab.batch.write([{id:1,role:'basic',x:0,y:0,z:0}]);
      const half=2.8,aspect=lab.renderer.domElement.clientHeight/lab.renderer.domElement.clientWidth;
      c.left=-half;c.right=half;c.top=half*aspect;c.bottom=-half*aspect;
      c.position.set(.65,2.2,6);c.lookAt(0,1.14,0);c.updateProjectionMatrix();
      document.querySelector('#labels').replaceChildren();
      document.querySelector('#status').textContent=['材质原型 · 普通修士','共享身体 + 基础发型 · 无附件'].join(String.fromCharCode(10));
      document.querySelector('h1').textContent='坐天观井 · 普通修士材质验收';
      lab.renderer.render(lab.scene,c);
      return { characters:lab.batch.stats.characters, draws:lab.batch.stats.drawCalls, material:lab.library.material.type };
    `);
    assert.equal(report.materialPrototype.characters, 1);
    assert.equal(report.materialPrototype.material, 'MeshLambertMaterial');
    await browser.screenshot(path.join(output, 'material_base.png'));
    assert.deepEqual(browser.errors(), []);
    report.pass = true;
    console.log('Material prototype imports and displays in real Three.js');
  } else {
  assert.equal(report.library.roles.length, 6, 'All six role configurations must be loaded');
  assert(report.library.loadedFrom.some(url => url.endsWith('cultivator_library.glb')), 'Lab must load the real exported GLB');
  for (const [count, filename] of [[6, 'scale_near.png'], [20, 'scale_mid.png'], [50, 'scale_far.png'], [300, 'scale_stress.png']]) {
    await browser.js(`return window.cultivatorLab.setCount(${count});`);
    const result = await browser.js('return window.cultivatorLab.sample(90);');
    assert.equal(result.count, count);
    assert.equal(result.materialCount, 1, 'Character batches must share one material');
    assert(result.characterDraws > 0 && result.characterDraws <= report.library.modules, 'Draw cost must be bounded by shared modules');
    result.softwareRasterizer = /basic render|swiftshader|llvmpipe|software|mesa offscreen/i.test(result.renderer);
    report.scales.push(result);
    await browser.screenshot(path.join(output, filename));
    console.log(`${count} characters · ${result.characterDraws} draws · ${result.characterTriangles} tris · frame mean ${result.frameMs.mean.toFixed(2)} ms · batch CPU p95 ${result.batchWriteMs.p95.toFixed(2)} ms`);
  }
  await browser.js('return window.cultivatorLab.setCount(6);');
  report.picking = await browser.js(`
    return import('/vendor/three/build/three.module.js').then(THREE=>{
      const lab=window.cultivatorLab, result=[];
      lab.scene.updateMatrixWorld(true);
      for(let i=0;i<6;i++){
        const p=new THREE.Vector3((i-2.5)*2.6,.95,0).project(lab.camera);
        const ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2(p.x,p.y),lab.camera);
        const hit=ray.intersectObject(lab.batch.group,true).find(h=>h.object.visible && h.instanceId!==undefined);
        result.push(hit?.object.userData.renderEntities[hit.instanceId]?.id ?? null);
      }
      return result;
    });
  `);
  assert.deepEqual(report.picking, [1, 2, 3, 4, 5, 6], 'Actual character geometry must map back to its instance identity');
  report.errors.push(...browser.errors());
  assert.deepEqual(report.errors, [], 'Lab must have no runtime or resource errors');

  // Exercise the actual Host -> Stage -> EntityLayer integration using a separate, temporary browser profile.
  await browser.cdp.send('Page.navigate', { url: `${base}/inkbox.html?renderer=3d` });
  assert(await browser.waitFor('return !!window.inkbox?.render3d?.renderer', { timeoutMs: 30000 }), 'Game Render3D must boot');
  report.game.spawn = await browser.js(`
    const k=window.inkbox;k.newWorld('small',20261002);k.speedIndex=0;
    const w=k.world;let made=0;
    for(let y=8;y<w.h-8 && made<100;y+=8)for(let x=8;x<w.w-8 && made<100;x+=8){
      if(w.isWalkable(y*w.w+x))made+=k.life.spawn(x,y,'cultivator',Math.min(10,100-made),0);
    }
    return { made, entities:w.entities.length, cultivators:w.entities.filter(e=>e.level>0).length };
  `);
  assert(report.game.spawn.cultivators > 0, 'Factory must create real cultivators');
  assert(await browser.waitFor(`return window.inkbox.render3d.renderer.entities?.characterBatch?.stats.characters === ${report.game.spawn.cultivators}`, { timeoutMs: 30000 }), 'Game must display the GLB character batches');
  report.game.snapshot = await browser.js(`
    const k=window.inkbox,r=k.render3d.renderer;
    const json=JSON.stringify({entities:k.world.entities,factions:k.world.factions,day:k.world.day});
    r.entities.update(1,k.world,{heightChanged:true});
    return { pure:json===JSON.stringify({entities:k.world.entities,factions:k.world.factions,day:k.world.day}), characters:r.entities.characterBatch.stats.characters, stats:r.entities.stats, geometries:r.gpu.info.memory.geometries, materialCount:new Set(Object.values(r.entities.characterBatch.meshes).map(m=>m.material)).size };
  `);
  assert(report.game.snapshot.pure, 'Presentation must not modify the world');
  assert.equal(report.game.snapshot.materialCount, 1);
  await browser.screenshot(path.join(output, 'in_game.png'));
  for (let i = 0; i < 3; i += 1) {
    await browser.js(`const k=window.inkbox;k.newWorld('small',${20261003 + i});k.speedIndex=0;return true;`);
    assert(await browser.waitFor('return window.inkbox.render3d.renderer.world===window.inkbox.world && !!window.inkbox.render3d.renderer.entities?.characterBatch', { timeoutMs: 15000 }), 'Rebuilt stages must retain the shared character library');
  }
  report.game.afterRebuild = await browser.js('return { geometries:window.inkbox.render3d.renderer.gpu.info.memory.geometries };');
  assert(report.game.afterRebuild.geometries <= report.game.snapshot.geometries + 5, 'Repeated world rebuild must release old instance geometry');
  report.errors.push(...browser.errors());
  assert.deepEqual(report.errors, [], 'Game must have no runtime or resource errors');
  report.pass = true;
  console.log('GLB scale, picking, game integration and lifecycle acceptance passed');
  }
} catch (error) {
  report.pass = false; report.errors.push(error.stack || String(error));
  process.exitCode = 1; console.error(error.stack || error);
} finally {
  fs.mkdirSync(path.dirname(reportFile), { recursive: true });
  fs.writeFileSync(process.env.CHARACTER_PHASE === 'material' ? path.join(root, 'assets/characters/cultivator/data/material_validation.json') : reportFile, JSON.stringify(report, null, 2));
  await browser?.close();
  if (server) { server.kill(); await sleep(200); }
}
