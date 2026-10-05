// Package 3 gate: real cave, shipped GLB, product RAF and an actual input click.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launch, findEdge, sleep } from './cdp.mjs';
import { createScenarioSandbox } from './inkbox-c2c-browser-fixtures.mjs';
import { serializeWorld } from '../src/inkbox/io/save.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.resolve(process.env.INKBOX_REPORT_DIR || path.join(ROOT, 'reports/local/m2c2c/pilot'));
const base = process.env.INKBOX_URL || 'http://127.0.0.1:4235';
const naturalSave = path.resolve(process.env.INKBOX_PILOT_SAVE || path.join(OUT, 'suitable-natural-save.json'));
let browser, server;
const report = { suite: 'C2C cave pilot actual Edge', pass: false, cases: [] };
const page = body => browser.js(`return (async()=>{${body}})();`, { timeoutMs: 180000 });
const frames = n => page(`for(let i=0;i<${n};i++)await new Promise(requestAnimationFrame);return true;`);
try {
  fs.mkdirSync(OUT, { recursive: true });
  if (!fs.existsSync(naturalSave)) {
    const sandbox=createScenarioSandbox(); sandbox.newWorld('small',20260930);
    for(let day=0;day<28500;day++) sandbox.advanceDays(1);
    assert(sandbox.world.sites.some(site=>site.kind==='cave'), 'fixed natural pilot recipe has no cave');
    fs.mkdirSync(path.dirname(naturalSave),{recursive:true});
    fs.writeFileSync(naturalSave,JSON.stringify(serializeWorld(sandbox.world)));
    report.recipe={preset:'small',seed:20260930,day:28500,stepDays:1,
      source:'ordinary headless simulation, serialized and imported through product UI; no World fact edits'};
  }
  if (!process.env.INKBOX_URL) {
    server = spawn(process.execPath, ['scripts/inkbox-server.mjs', '--port', '4235'], { cwd: ROOT, windowsHide: true, stdio: 'ignore' });
    let ready = false;
    for (let i = 0; i < 100; i++) {
      if (server.exitCode !== null) throw new Error(`server exited ${server.exitCode}`);
      try { ready = (await fetch(`${base}/inkbox.html`)).ok; } catch {}
      if (ready) break; await sleep(100);
    }
    assert(ready, 'owned server startup failed');
  }
  const edge = findEdge(); assert(edge, 'Microsoft Edge is required');
  browser = await launch({ url: `${base}/inkbox.html?renderer=3d&assets=on&geography=on`, browser: edge, gpu: true, width: 1500, height: 940 });
  assert(await browser.waitFor('return !!window.inkbox?.render3d?.renderer?.stages.size', { timeoutMs: 30000 }));
  const cached = fs.existsSync(naturalSave) ? JSON.parse(fs.readFileSync(naturalSave, 'utf8')) : null;
  if (cached) {
    await page('window.inkbox.speedIndex=0;return true;');
    const { root } = await browser.cdp.send('DOM.getDocument');
    const { nodeId } = await browser.cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: '#inkImportFile' });
    await browser.cdp.send('DOM.setFileInputFiles', { nodeId, files: [naturalSave] });
    assert(await browser.waitFor(`return window.inkbox?.world?.seed===${cached.seed}&&window.inkbox.world.day===${cached.day}`, { timeoutMs: 30000 }), 'product import failed');
  }
  report.prepared = await page(`
    const k=window.inkbox,r=k.render3d.renderer;
    window.__pilot={a:await import('./src/inkbox/render3d/art/VisualScenarios.js'),T:await import('three')};
    const scenario=${cached ? `{scenario:'normal saved natural World',seed:${cached.seed},worldDay:${cached.day},source:'product importFile path; no Site/terrain edits'}` : "window.__pilot.a.applyScenario(k,'GOLDEN_A')"};
    // The four-year house recipe may contain no cave. Continue the existing
    // simulation until its first actual cave appears, without planting a Site.
    let extraDays=0;
    while(!k.world.sites.some(s=>s.kind==='cave')&&extraDays<36000) {
      k.advanceDays(1);extraDays++;
      if(extraDays%120===0)await new Promise(requestAnimationFrame);
    }
    scenario.caveSearch={ordinaryExtraDays:extraDays,worldDay:k.world.day,stop:'first current cave; maximum 100 additional years'};
    for(let i=0;i<180&&r.world!==k.world;i++)await new Promise(requestAnimationFrame);
    if(r.world!==k.world)throw new Error('product RAF failed to adopt scenario');
    await r.environmentLoadPromise;await r.characterLoadPromise;
    if(r.environmentLoadError||r.characterLoadError)throw r.environmentLoadError||r.characterLoadError;
    r.setGeographyEnabled(false);r.setGeographyFeature('sites',true);r.setLODEnabled(true);
    return {scenario,digest:await window.__pilot.a.snapshotDigest(k),caves:k.world.sites.filter(s=>s.kind==='cave').length};
  `);
  if (!cached) {
    const save = await page(`return (await import('./src/inkbox/io/save.js')).serializeWorld(window.inkbox.world);`);
    fs.writeFileSync(naturalSave, JSON.stringify(save));
  }
  assert(report.prepared.caves > 0, 'natural cave is required');
  for (const [lod, targetPixels] of [[0, 80], [1, 24], [2, 5]]) {
    const found = await page(`
      const k=window.inkbox,r=k.render3d.renderer,{a,T}=window.__pilot,stage=r.stages.get('mortal');
      const asset=r.environmentLibrary.assetInfo('mortal.site.cave');
      const camera=r.cameraRig.camera;
      // Exercise the real camera/projection and hysteresis, without forcing LOD.
      const zoom=${targetPixels}*(camera.top-camera.bottom)/(r.height*asset.footprint.width);
      for(const source of k.world.sites.filter(s=>s.kind==='cave'))for(const yaw of [.2,1.8,3.5,4.8]) {
        const pose=a.applyCamera(r,'REGIONAL',{poi:{x:source.x,y:source.y,id:source.id,source:'current-world-cave'},zoom,polar:.8,yaw});
        for(let i=0;i<8;i++)await new Promise(requestAnimationFrame);
        const batch=stage.markers.siteGeography?.batch,mesh=batch?.meshes.get(asset.lods[${lod}]);
        if(!mesh?.visible||!mesh.count)continue;
        r.scene.updateMatrixWorld(true);
        const blockers=[],ray=new T.Raycaster();
        r.scene.traverse(o=>{
          if(!o.isMesh||o.isInstancedMesh&&!o.count||o.material?.transparent||o.renderOrder>5)return;
          for(let p=o;p;p=p.parent)if(!p.visible)return;
          blockers.push(o);
        });
        const ix=mesh.geometry.index,p=mesh.geometry.attributes.position,im=new T.Matrix4(),combined=new T.Matrix4(),v=new T.Vector3();
        for(let n=0;n<mesh.count;n++) {
          const rec=mesh.userData.renderSites[n];if(rec.id!==source.id)continue;
          mesh.getMatrixAt(n,im);combined.multiplyMatrices(mesh.matrixWorld,im);
          for(let f=0;f<ix.count;f+=3) {
            v.set(0,0,0);for(let j=0;j<3;j++)v.add(new T.Vector3().fromBufferAttribute(p,ix.getX(f+j)));
            v.multiplyScalar(1/3).applyMatrix4(combined).project(r.cameraRig.camera);
            if(Math.abs(v.x)>.85||Math.abs(v.y)>.85||v.z< -1||v.z>1)continue;
            const pixel=[(v.x+1)*r.width/2,(1-v.y)*r.height/2],hit=r.pick(...pixel);
            if(hit?.kind!=='site'||hit.siteId!==source.id)continue;
            ray.setFromCamera(new T.Vector2(v.x,v.y),r.cameraRig.camera);
            const submittedHit=ray.intersectObjects(blockers,false)[0];
            if(submittedHit?.object!==mesh||submittedHit.instanceId!==n)continue;
            const rect=k.render3d.canvas.getBoundingClientRect();
            return {lod:${lod},targetPixels:${targetPixels},source:{id:source.id,x:source.x,y:source.y,kind:source.kind,name:source.name},node:mesh.name,
              triangles:ix.count/3,pose,pixel,client:[rect.left+pixel[0]/r.width*rect.width,rect.top+pixel[1]/r.height*rect.height],
              hit:{kind:hit.kind,siteId:hit.siteId,plane:hit.plane},stats:{...stage.markers.siteGeography.stats}};
          }
        }
      }
      throw new Error('no submitted and pickable cave LOD ${lod} through legal poses');
    `);
    // Normal view first. The inspector proof is kept separately from the normal image.
    await browser.screenshot(path.join(OUT, `cave-lod${lod}-normal.png`));
    await browser.click(...found.client);
    const inspected = await page(`const p=document.getElementById('inkInspect');return {kind:p.dataset.subjectKind,id:p.dataset.subjectId,text:p.innerText,on:p.classList.contains('on')};`);
    assert.equal(inspected.kind, 'site'); assert.equal(inspected.id, String(found.source.id)); assert(inspected.on);
    assert(inspected.text.includes(found.source.name));
    await browser.screenshot(path.join(OUT, `cave-lod${lod}-identity-proof.png`));
    await page(`document.getElementById('inkInspectClose')?.click();return true;`);
    report.cases.push({ ...found, inspected });
  }
  report.fallback = await page(`
    const k=window.inkbox,r=k.render3d.renderer;
    const before=await window.__pilot.a.snapshotDigest(k);
    r.setProductionAssetsEnabled(false);for(let i=0;i<20;i++)await new Promise(requestAnimationFrame);
    const marker=r.stages.get('mortal').markers;
    const result={productionInstances:marker.siteGeography.stats.instances,caveMarkers:marker.siteMeshes.cave.count,
      before,after:await window.__pilot.a.snapshotDigest(k)};
    r.setProductionAssetsEnabled(true);return result;
  `);
  assert.equal(report.fallback.productionInstances, 0); assert(report.fallback.caveMarkers > 0);
  assert.equal(report.fallback.before.value, report.fallback.after.value);
  await frames(10);
  report.final = await page(`
    const k=window.inkbox,r=k.render3d.renderer,g=r.gpu,gl=g.getContext();
    return {digest:await window.__pilot.a.snapshotDigest(k),glError:gl.getError(),
      programs:g.info.programs.map(p=>({id:p.id,linked:gl.getProgramParameter(p.program,gl.LINK_STATUS)})),
      draws:g.info.render.calls,memory:{...g.info.memory},geography:r.getGeographyStats()};
  `);
  assert.equal(report.final.digest.value, report.prepared.digest.value); assert.equal(report.final.glError, 0);
  assert(report.final.programs.length && report.final.programs.every(p => p.linked));
  assert.deepEqual(browser.errors(), []); report.pass = true;
  console.log('PASS actual Edge cave pilot: all three LODs, real click/identity, assets-off fallback, unchanged World');
} catch (error) {
  report.failure = error.stack; process.exitCode = 1; console.error(error.stack);
  if (browser) {
    try {
      report.diagnostic = await page(`const k=window.inkbox,r=k?.render3d?.renderer;return {sites:k?.world?.sites,
        geography:r?.getGeographyStats(),camera:r?{zoom:r.cameraRig.camera.zoom,position:r.cameraRig.camera.position.toArray()}:null};`);
      await browser.screenshot(path.join(OUT, 'failure-proof.png'));
    } catch {}
  }
}
finally {
  if (browser) { report.runtimeErrors = browser.errors(); await browser.close(); }
  server?.kill(); fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'evidence.json'), JSON.stringify(report, null, 2));
}
