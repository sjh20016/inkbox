// Strict Edge sample gate. Observes the product RAF and submitted house meshes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { launch, findEdge, sleep } from './cdp.mjs';
import { waitForIdlePresentation } from './inkbox-browser-steady-view.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.resolve(process.env.INKBOX_REPORT_DIR || path.join(ROOT, 'reports/m2c2b/pass1/sample/edge'));
const port = Number(process.env.INKBOX_PORT || 4226), base = process.env.INKBOX_URL || `http://127.0.0.1:${port}`;
const familyMatrix = process.env.INKBOX_FAMILY_MATRIX === '1';
const assetIds = process.env.INKBOX_HALL_MATRIX === '1' ? ['mortal.house.hall']
  : familyMatrix ? ['mortal.house.base','mortal.house.small','mortal.house.courtyard'] : ['mortal.house.base'];
const report = { suite: 'M2-C2B single-house Edge gate', generatedAt: new Date().toISOString(), pass: false,
  source: 'actual product RAF; submitted GLB triangle centroids; real input click; no forced picker or LOD results', cases: [] };
let browser, server;
const page = (body, options) => browser.js(`return (async()=>{${body}})();`, options);
const frames = count => page(`for(let i=0;i<${count};i++)await new Promise(requestAnimationFrame);return true;`);

async function findHouse(lod, assetId) {
  return page(`
    const k=window.inkbox,r=k.render3d.renderer,a=window.__sample.scenarios,T=window.__sample.THREE;
    const stage=r.stages.get('mortal'),layer=stage.settlements;
    const villages=[...k.world.villages].filter(v=>v.houses?.some(h=>k.world.struct[k.world.idx(h.x,h.y)]===1));
    const poses=${JSON.stringify(lod === 3 ? [[.5,.52,.15],[.5,.52,1.8],[.65,.52,3.5]] : lod === 0 ? [[18,.88,.4],[18,.72,1.8],[18,1.04,3.5],[18,.36,4.6]] : [[6,.88,.4],[4,.88,1.8],[5,1.04,3.5],[6,.36,4.6]])};
    for(const v of villages)for(const [zoom,polar,yaw] of poses){
      const pose=a.applyCamera(r,'SETTLEMENT',{poi:{x:v.x,y:v.y,id:v.id,source:'real-village'},zoom,polar,yaw});
      for(let i=0;i<6;i++)await new Promise(requestAnimationFrame);
      r.scene.updateMatrixWorld(true);r.cameraRig.camera.updateMatrixWorld(true);
      const asset=r.environmentLibrary.assetInfo(${JSON.stringify(assetId)});
      const mesh=layer.environmentBatch.meshes.get(${lod}===3?asset.hlod:asset.lods[${lod}]);
      if(!mesh.visible||!mesh.count)continue;
      const p=mesh.geometry.attributes.position,ix=mesh.geometry.index,im=new T.Matrix4(),combined=new T.Matrix4(),center=new T.Vector3();
      const rect=k.render3d.canvas.getBoundingClientRect();
      const ray=new T.Raycaster(),blockers=[];
      r.scene.traverse(o=>{
        if(!o.isMesh||o.renderOrder>5||o.isInstancedMesh&&!o.count||o.material?.transparent)return;
        for(let parent=o;parent;parent=parent.parent)if(!parent.visible)return;
        blockers.push(o);
      });
      for(let instance=0;instance<mesh.count;instance++){
        const source=mesh.userData.renderBuildings[instance];if(source.settlementId!==v.id)continue;
        mesh.getMatrixAt(instance,im);combined.multiplyMatrices(mesh.matrixWorld,im);
        for(let face=0;face<ix.count;face+=3){
          center.set(0,0,0);for(let j=0;j<3;j++)center.add(new T.Vector3().fromBufferAttribute(p,ix.getX(face+j)));
          center.multiplyScalar(1/3).applyMatrix4(combined);
          const ndc=center.clone().project(r.cameraRig.camera);
          if(Math.abs(ndc.x)>.84||Math.abs(ndc.y)>.84||ndc.z< -1||ndc.z>1)continue;
          const pixel=[(ndc.x+1)*r.width/2,(1-ndc.y)*r.height/2],hit=r.pick(...pixel);
          if(hit?.kind!==${JSON.stringify(lod === 3 ? 'settlement' : 'house')}||(${lod}===3?hit.settlementId!==source.settlementId:hit.houseKey!==source.houseKey))continue;
          ray.setFromCamera(new T.Vector2(ndc.x,ndc.y),r.cameraRig.camera);
          const submittedHit=ray.intersectObjects(blockers,false)[0];
          if(submittedHit?.object!==mesh||submittedHit.instanceId!==instance)continue;
          return {lod:${lod},assetId:${JSON.stringify(assetId)},identityKind:${JSON.stringify(lod === 3 ? 'settlement' : 'house')},
            identityKey:${lod}===3?String(source.settlementId):source.houseKey,node:mesh.name,geometry:mesh.geometry.uuid,material:mesh.material.uuid,source:{houseKey:source.houseKey,
            settlementId:source.settlementId,x:source.houseX,y:source.houseY,structType:source.structType},
            pixel,client:[rect.left+pixel[0]/r.width*rect.width,rect.top+pixel[1]/r.height*rect.height],pose,
            submittedDepthProof:{mesh:submittedHit.object.name,instanceId:submittedHit.instanceId,distance:submittedHit.distance,opaqueBlockerCount:blockers.length},
            instances:mesh.count,triangleCount:ix.count/3,stats:{...layer.stats,lod:[...layer.stats.lod]},
            instanceScale:new T.Vector3().setFromMatrixScale(im).toArray()};
        }
      }
    }
    throw new Error('No visible actual house LOD ${lod} found through legal camera poses');
  `, { timeoutMs: 180000 });
}
async function snapshot(name) {
  return page(`
    const k=window.inkbox,r=k.render3d.renderer,s=r.stages.get('mortal'),g=r.gpu,gl=g.getContext(),debug=gl.getExtension('WEBGL_debug_renderer_info');
    return {name:${JSON.stringify(name)},digest:await window.__sample.scenarios.snapshotDigest(k),
      renderer:{triangles:g.info.render.triangles,drawCalls:g.info.render.calls,memory:{...g.info.memory},glError:gl.getError(),
        programs:g.info.programs.map(p=>({id:p.id,linked:gl.getProgramParameter(p.program,gl.LINK_STATUS)})),
        vendor:debug?gl.getParameter(debug.UNMASKED_VENDOR_WEBGL):gl.getParameter(gl.VENDOR),
        renderer:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER)},
      world:{day:k.world.day,houses:s.settlements.stats.currentHouses,halls:s.settlements.stats.currentHalls},
      assets:{enabled:r.productionAssetsEnabled,ready:!!r.environmentLibrary,instances:s.settlements.stats.productionInstances,
        triangles:s.settlements.stats.productionTriangles,drawCalls:s.settlements.stats.productionDrawCalls},
      camera:{position:r.cameraRig.camera.position.toArray(),target:r.cameraRig.controls.target.toArray(),zoom:r.cameraRig.camera.zoom}};
  `);
}

try {
  fs.mkdirSync(OUT, { recursive: true });
  if (!process.env.INKBOX_URL) {
    let listening = false, serverError;
    server = spawn(process.execPath, ['scripts/inkbox-server.mjs','--port',String(port)], { cwd: ROOT, windowsHide: true, stdio: ['ignore','pipe','pipe'] });
    server.stdout.on('data', data => { if (data.toString().includes(`http://127.0.0.1:${port}/`)) listening = true; });
    server.on('error', error => { serverError = error; });
    let ready = false;
    for (let i = 0; i < 100; i++) { if (serverError || server.exitCode !== null) throw serverError || new Error(`owned server exited ${server.exitCode}`);
      if (listening) { try { ready = (await fetch(`${base}/inkbox.html`)).ok; } catch {} } if (ready) break; await sleep(150); }
    assert(ready, 'owned server startup failed');
  }
  const edge = findEdge(); assert(edge, 'Microsoft Edge is required');
  browser = await launch({ url: 'about:blank', browser: edge, width: 1500, height: 940, gpu: true });
  report.browser = browser.meta;
  await browser.cdp.send('Network.enable');
  const url = new URL('inkbox.html?renderer=3d&assets=on', base.replace(/\/$/, '') + '/');
  await browser.cdp.send('Page.navigate', { url: url.href });
  assert(await browser.waitFor('return !!window.inkbox?.render3d?.renderer?.stages?.size', { timeoutMs: 30000 }), browser.errors().join(' | '));
  report.prepared = await page(`
    const k=window.inkbox,r=k.render3d.renderer;
    await r.environmentLoadPromise;await r.characterLoadPromise;
    if(r.environmentLoadError)throw r.environmentLoadError;if(r.characterLoadError)throw r.characterLoadError;
    if(!r.environmentLibrary)throw new Error('missing decoded environment library');
    window.__sample={scenarios:await import('./src/inkbox/render3d/art/VisualScenarios.js'),THREE:await import('three')};
    const scenario=window.__sample.scenarios.applyScenario(k,'GOLDEN_A');
    let adopted=false;for(let i=0;i<180;i++){await new Promise(requestAnimationFrame);if(r.world===k.world){adopted=true;break;}}
    if(!adopted)throw new Error('product did not adopt GOLDEN_A');
    r.setArtProfile('realm-style-v1');r.setLODEnabled(true);r.setProductionAssetsEnabled(true);
    k.render3d.mode='inspect';k.render3d.panel.querySelector('select').value='inspect';
    window.__sample.library=r.environmentLibrary;window.__sample.geometries=[...r.environmentLibrary.modules.values()].map(m=>m.geometry);
    window.__sample.material=r.stages.get('mortal').environmentMaterial;
    window.__sample.inspectOriginal=k.inspectPlaneSubject;window.__sample.coordinateOriginal=k.inspectPlaneAt;
    k.inspectPlaneSubject=function(plane,ref){window.__sample.lastInspect={plane,ref:{...ref}};return window.__sample.inspectOriginal.call(this,plane,ref);};
    k.inspectPlaneAt=function(...args){window.__sample.coordinateFallback=true;return window.__sample.coordinateOriginal.apply(this,args);};
    return {scenario,digest:await window.__sample.scenarios.snapshotDigest(k),modules:[...r.environmentLibrary.modules.values()].map(m=>({node:m.node.name,triangles:m.triangles}))};
  `, { timeoutMs: 180000 });
  report.idlePresentation = await page(`return (${waitForIdlePresentation.toString()})(window.inkbox.render3d.renderer);`);
  const cases = assetIds.flatMap(assetId=>[0,1].map(lod=>({assetId,lod})));
  if (familyMatrix) cases.push({assetId:'mortal.house.base',lod:3});
  for (const {lod,assetId} of cases) {
    const found = await findHouse(lod,assetId); console.log(`Found actual ${assetId} LOD${lod}: ${found.identityKey}`);
    await page('window.__sample.lastInspect=null;window.__sample.coordinateFallback=false;return true;');
    await browser.click(...found.client); await frames(3);
    const inspected = await page(`const p=document.getElementById('inkInspect');return {ref:window.__sample.lastInspect,
      fallback:!!window.__sample.coordinateFallback,panel:{on:p.classList.contains('on'),plane:p.dataset.plane,kind:p.dataset.subjectKind,id:p.dataset.subjectId,text:p.innerText}};`);
    assert.equal(inspected.ref?.plane, 'mortal'); assert.equal(inspected.ref?.ref.kind,found.identityKind);
    if(lod!==3) assert.equal(inspected.ref?.ref.houseKey, found.source.houseKey);
    assert.equal(inspected.ref?.ref.settlementId, found.source.settlementId); assert.equal(inspected.fallback, false);
    assert.equal(inspected.panel.kind,found.identityKind); assert.equal(inspected.panel.id,found.identityKey); assert(inspected.panel.on);
    const on = await snapshot(`${assetId} LOD${lod} production`);
    const screenshot = path.join(OUT, familyMatrix ? `${assetId.split('.').at(-1)}-lod${lod}.png` : `sample-lod${lod}.png`);
    await browser.screenshot(screenshot);
    await page('document.getElementById("inkInspectClose")?.click();window.inkbox.render3d.renderer.setProductionAssetsEnabled(false);return true;'); await frames(6);
    const off = await snapshot(`LOD${lod} fallback`);
    assert.deepEqual(on.camera, off.camera); assert.equal(on.digest.value, off.digest.value);
    assert.equal(on.digest.value, report.prepared.digest.value); assert.equal(off.assets.instances, 0);
    await page('window.inkbox.render3d.renderer.setProductionAssetsEnabled(true);return true;'); await frames(6);
    report.cases.push({ ...found, inspected, on, off, image: path.relative(ROOT, screenshot).replaceAll(path.sep,'/'),
      imageSha256: createHash('sha256').update(fs.readFileSync(screenshot)).digest('hex') });
  }
  report.productLoop = await page(`
    const r=window.inkbox.render3d.renderer,update=r.update,render=r.render;let updates=0,renders=0;const times=[];
    r.update=function(...args){updates++;const start=performance.now();const result=update.apply(this,args);times.push(performance.now()-start);return result;};
    r.render=function(...args){renders++;return render.apply(this,args);};
    try{for(let i=0;i<120;i++)await new Promise(requestAnimationFrame);times.sort((a,b)=>a-b);return {observedFrames:120,updates,renders,
      updateMedianMs:times[Math.floor(times.length*.5)],updateP95Ms:times[Math.floor(times.length*.95)]};}
    finally{r.update=update;r.render=render;}
  `);
  assert(Math.abs(report.productLoop.updates - 120) <= 1); assert(Math.abs(report.productLoop.renders - 120) <= 1);
  report.sharing = await page(`
    const k=window.inkbox,r=k.render3d.renderer,lib=window.__sample.library,T=window.__sample.THREE;
    for(const plane of ['upper','nether','mortal']){r.setActivePlane(plane);r.setArtProfile('legacy');r.setArtProfile('realm-style-v1');
      r.setProductionAssetsEnabled(false);r.setProductionAssetsEnabled(true);for(let i=0;i<5;i++)await new Promise(requestAnimationFrame);}
    const digestBeforeReplacement=await window.__sample.scenarios.snapshotDigest(k);
    const sameMaterial=r.stages.get('mortal').environmentMaterial===window.__sample.material;
    const atlas=lib.texture;
    window.__sample.scenarios.applyScenario(k,'GOLDEN_A');
    for(let i=0;i<180;i++){await new Promise(requestAnimationFrame);if(r.world===k.world)break;}
    if(r.world!==k.world)throw new Error('replacement not adopted');
    const stage=r.stages.get('mortal'),batch=stage.settlements.environmentBatch;
    return {digestBeforeReplacement,digestAfterReplacement:await window.__sample.scenarios.snapshotDigest(k),sameMaterial,
      sameLibrary:r.environmentLibrary===lib,sameGeometries:[...batch.meshes.values()].every(m=>window.__sample.geometries.includes(m.geometry)),
      sameAtlas:[...r.stages.values()].every(s=>s.environmentMaterial?.uniforms.uEnvironmentAtlas.value===atlas),
      sharedStageMaterial:[...batch.meshes.values()].every(m=>m.material===stage.environmentMaterial)};
  `, { timeoutMs: 180000 });
  assert.equal(report.sharing.digestBeforeReplacement.value, report.prepared.digest.value);
  assert.equal(report.sharing.digestAfterReplacement.value, report.prepared.digest.value);
  for (const key of ['sameMaterial','sameLibrary','sameGeometries','sameAtlas','sharedStageMaterial']) assert(report.sharing[key], key);
  report.final = await snapshot('after World replacement');
  const requests = browser.cdp.events.filter(e=>e.method==='Network.requestWillBeSent').map(e=>e.params.request.url);
  report.loads = { glb: requests.filter(u=>new URL(u).pathname.endsWith('/assets/environment/mesh/environment_library.glb')).length,
    atlas: requests.filter(u=>new URL(u).pathname.endsWith('/assets/environment/materials/EntityAtlas.png')).length };
  assert.deepEqual(report.loads, { glb: 1, atlas: 1 });
  for (const row of [...report.cases.flatMap(c=>[c.on,c.off]),report.final]) {
    assert.equal(row.renderer.glError, 0); assert(row.renderer.programs.length && row.renderer.programs.every(p=>p.linked));
  }
  report.consoleErrors = browser.cdp.events.filter(e=>e.method==='Runtime.consoleAPICalled'&&e.params.type==='error').map(e=>e.params.args.map(a=>a.value||a.description).join(' '));
  report.runtimeErrors = browser.errors(); assert.deepEqual(report.consoleErrors, []); assert.deepEqual(report.runtimeErrors, []);
  report.pass = true; console.log(`PASS Edge ${familyMatrix?'house/hut/manor matrix':'single-house'}: visible submitted surfaces, real clicks, one GLB/atlas, actual RAF, shared resources, unchanged full World`);
} catch (error) { report.failure = error.stack; process.exitCode = 1; console.error(error.stack); }
finally {
  if (browser) {
    report.consoleErrors = browser.cdp.events.filter(e=>e.method==='Runtime.consoleAPICalled'&&e.params.type==='error').map(e=>e.params.args.map(a=>a.value||a.description).join(' '));
    report.runtimeErrors = browser.errors();
    try { await page('const k=window.inkbox;if(window.__sample?.inspectOriginal)k.inspectPlaneSubject=window.__sample.inspectOriginal;if(window.__sample?.coordinateOriginal)k.inspectPlaneAt=window.__sample.coordinateOriginal;return true;'); } catch {}
    await browser.close();
  }
  server?.kill(); report.finishedAt = new Date().toISOString();
  fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(path.join(OUT,'evidence.json'), JSON.stringify(report,null,2)+'\n');
}
