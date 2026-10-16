#!/usr/bin/env node
// G2-P0.3 final real-browser checks. Uses an isolated Microsoft Edge profile and hardware WebGL.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launch, findEdge, sleep } from './cdp.mjs';
import { collectBrowserErrors } from './inkbox-g2pf-config.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.INKBOX_PORT || 4273);
const BASE = process.env.INKBOX_URL || `http://127.0.0.1:${PORT}`;
const APP_URL = new URL('inkbox.html?renderer=3d', BASE.endsWith('/') ? BASE : BASE + '/').href;
const OUT = path.resolve(process.env.INKBOX_REPORT_DIR || path.join(ROOT, 'reports/analysis/g2-p03/g2p03-final-browser.json'));
const SHOTS = path.join(os.tmpdir(), 'inkbox-g2p03-final-shots');
const SOURCES = ['scripts/inkbox-g2p03-final-browser.mjs', 'src/inkbox/render3d/vegetation/VegetationLayer.js',
  'src/inkbox/render3d/stage/PlaneStage.js', 'src/inkbox/render3d/Render3DHost.js'];
const report = {
  startedAt: new Date().toISOString(), pass: false, url: APP_URL, viewport: '1440x1000',
  sourceHead: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8', windowsHide: true }).trim(),
  sourceHashes: Object.fromEntries(SOURCES.map(file => [file, createHash('sha256').update(fs.readFileSync(path.join(ROOT, file))).digest('hex')])),
  browser: 'isolated Microsoft Edge/CDP', gpuRequested: true, checks: [], screenshots: [],
  performanceClaim: false, uploadScope: 'All WebGL bufferData/bufferSubData submissions; not vegetation-exclusive bytes.',
};
let server, browser;
const page = (body, timeoutMs = 60000) => browser.js(`return (async()=>{${body}})()`, { timeoutMs });
const frames = n => page(`for(let i=0;i<${n};i++)await new Promise(requestAnimationFrame);return true;`, 60000);
async function check(name, run) {
  try {
    const evidence = await run(); report.checks.push({ name, pass: true, evidence }); console.log(`PASS ${name}`);
  } catch (error) {
    report.checks.push({ name, pass: false, error: String(error.stack || error) }); throw error;
  }
}
async function shot(name) {
  const file = await browser.screenshot(path.join(SHOTS, `${name}.png`), { timeoutMs: 30000 });
  report.screenshots.push(file); return file;
}
async function startServer() {
  if (process.env.INKBOX_URL) return;
  server = spawn(process.execPath, ['scripts/inkbox-server.mjs', '--port', String(PORT)], { cwd: ROOT, stdio: 'ignore', windowsHide: true });
  for (let n = 0; n < 100; n += 1) {
    if (server.exitCode !== null) throw Error(`Server exited: ${server.exitCode}`);
    try { if ((await fetch(APP_URL)).ok) return; } catch { /* wait for local server */ }
    await sleep(150);
  }
  throw Error(`Server unavailable: ${APP_URL}`);
}

try {
  fs.mkdirSync(SHOTS, { recursive: true }); await startServer();
  const edgePath = findEdge(); assert(edgePath, 'Microsoft Edge was not found');
  browser = await launch({ url: APP_URL, browser: edgePath, width: 1440, height: 1000, gpu: true });
  report.edge = browser.meta;
  assert(!/SwiftShader|llvmpipe/i.test(JSON.stringify(browser.meta)), `Edge did not report a hardware GPU: ${JSON.stringify(browser.meta)}`);
  assert(await browser.waitFor('return !!window.inkbox?.render3d?.active && !!window.inkbox.render3d.renderer?.stages?.get("mortal")', { timeoutMs: 60000 }),
    'Official 3D app failed to load');
  await page(`window.inkbox.setSpeed(0);window.inkbox.newWorld('small',2302301);return true;`);
  assert(await browser.waitFor('return window.inkbox.render3d.renderer.world===window.inkbox.world', { timeoutMs: 30000 }), 'Renderer did not adopt the test World');
  await page(`const r=window.inkbox.render3d.renderer;await Promise.all([r.characterLoadPromise,r.environmentLoadPromise,r.art.comparisonReady]);return true;`, 90000);
  await frames(120);
  report.page = await page(`const k=window.inkbox,r=k.render3d.renderer,s=r.stages.get('mortal'),gl=r.gpu.getContext(),g=r.gpu.info;return{
    title:document.title,url:location.href,world:[k.world.w,k.world.h],day:k.world.day,fullTerrainQuads:s.terrain.geometry.drawRange.count,
    expectedTerrainQuads:(k.world.w-1)*(k.world.h-1)*6,treeCount:s.vegetation.trees.length,
    visibleTreeInstances:s.vegetation.lodMeshes.reduce((n,m)=>n+(m.visible?m.count:0),0),art:r.art.profile.name,
    glVersion:gl.getParameter(gl.VERSION),glRenderer:gl.getParameter(gl.RENDERER),glVendor:gl.getParameter(gl.VENDOR),
    resources:{...g.memory,programs:g.programs?.length??0},overlay:!!document.querySelector('vite-error-overlay,nextjs-portal,#webpack-dev-server-client-overlay')};`);
  assert(report.page.fullTerrainQuads === report.page.expectedTerrainQuads && report.page.treeCount > 0
    && report.page.visibleTreeInstances > 0 && !report.page.overlay, `Full mortal view failed: ${JSON.stringify(report.page)}`);
  assert(!/SwiftShader|llvmpipe/i.test(report.page.glRenderer), `Software renderer active: ${report.page.glRenderer}`);
  report.screenshots.push(await shot('mortal-full-view'));
  report.checks.push({ name: 'Full mortal 3D view on hardware WebGL', pass: true, evidence: report.page });
  console.log('PASS Full mortal 3D view on hardware WebGL');

  await page(`(() => {
    const kinds=[...(typeof WebGL2RenderingContext!=='undefined'?[WebGL2RenderingContext]:[]),...(typeof WebGLRenderingContext!=='undefined'?[WebGLRenderingContext]:[])];
    window.__p03Uploads={active:false,rows:[]};let patched=0;
    for(const C of kinds)for(const name of ['bufferData','bufferSubData']){
      const proto=C.prototype,key='__p03_'+name;if(proto[key])continue;
      const original=proto[name];Object.defineProperty(proto,key,{value:true,configurable:true});
      proto[name]=function(...args){if(window.__p03Uploads.active){let bytes=0;
        if(name==='bufferData')bytes=typeof args[1]==='number'?args[1]:(args[1]?.byteLength||0);
        else {const src=args.find(ArrayBuffer.isView);bytes=src?(typeof args[4]==='number'?args[4]*src.BYTES_PER_ELEMENT:src.byteLength):0;}
        window.__p03Uploads.rows.push({name,bytes,target:args[0]});}
        return original.apply(this,args);};patched++;}
    return patched;
  })()`);

  report.target = await page(`const k=window.inkbox,r=k.render3d.renderer,s=r.stages.get('mortal'),T=await import('three'),rect=k.render3d.canvas.getBoundingClientRect();
    r.cameraRig.fit();r.update(.2);r.render();r.cameraRig.camera.updateMatrixWorld();
    const ordered=s.vegetation.trees.slice().sort((a,b)=>Math.hypot(a.x-k.world.w/2,a.y-k.world.h/2)-Math.hypot(b.x-k.world.w/2,b.y-k.world.h/2));
    for(const t of ordered){if(k.world.height[t.cell]<.6)continue;const p=r.coordinates.worldToRender(t.x,t.y,s.elevation.at(t.x,t.y)),v=new T.Vector3(p.x,p.y,p.z).project(r.cameraRig.camera),x=(v.x+1)*rect.width/2,y=(1-v.y)*rect.height/2;
      if(x<16||y<16||x>rect.width-16||y>rect.height-16)continue;
      const hit=r.pickPlane(x,y,'mortal');if(hit?.plane==='mortal')return{cell:t.cell,x:t.x,y:t.y,height:k.world.height[t.cell],water:k.world.water[t.cell],veg:k.world.veg[t.cell],type:k.world.type[t.cell],screen:{x:x+rect.left,y:y+rect.top},pick:{x:hit.x,y:hit.y,plane:hit.plane,kind:hit.kind}};}
    throw Error('No screen-visible highland tree with a mortal terrain pick');`);
  assert(report.target.water <= 0.0015 && report.target.veg >= 0.25, `Invalid threshold target ${JSON.stringify(report.target)}`);

  const snapshotCode = `(()=>{const s=window.inkbox.render3d.renderer.stages.get('mortal').vegetation;
    const hash=(attr,count,width)=>{if(!attr)return null;const bytes=new Uint8Array(attr.array.buffer,attr.array.byteOffset,count*width*attr.array.BYTES_PER_ELEMENT);let h=2166136261;for(const b of bytes){h^=b;h=Math.imul(h,16777619);}return(h>>>0).toString(16)};
    return s.lodMeshes.map(m=>({count:m.count,visible:m.visible,cells:m.userData.renderTrees.map(t=>t.cell),matrix:hash(m.instanceMatrix,m.count,16),color:hash(m.instanceColor,m.count,3),matrixVersion:m.instanceMatrix.version,colorVersion:m.instanceColor?.version??null}));})()`;
  report.initialInstances = await page(`return ${snapshotCode};`);

  await check('Water-only threshold crossing removes and restores the real visible instance and pick target', async () => {
    const beforeVersions = await page(`const s=window.inkbox.render3d.renderer.stages.get('mortal').vegetation;return s.lodMeshes.map(m=>[m.instanceMatrix.version,m.instanceColor?.version??null]);`);
    await page(`const k=window.inkbox,r=k.render3d.renderer,i=${report.target.cell};window.__p03BeforeWater={height:k.world.height[i],veg:k.world.veg[i],type:k.world.type[i],water:k.world.water[i]};
      window.__p03Uploads.rows=[];window.__p03Uploads.active=true;k.world.water[i]=0.4;r.update(.2);r.render();window.__p03Uploads.active=false;return true;`);
    const high = await page(`const k=window.inkbox,r=k.render3d.renderer,s=r.stages.get('mortal'),i=${report.target.cell},gl=r.gpu.getContext(),tree=s.vegetation.trees.find(t=>t.cell===i);
      const row=window.__p03Uploads.rows;return{height:k.world.height[i],veg:k.world.veg[i],type:k.world.type[i],water:k.world.water[i],stillPresent:!!tree,
        updates:s.vegetation.lodMeshes.map(m=>({matrix:m.instanceMatrix.version,color:m.instanceColor?.version??null})),uploads:{calls:row.length,bytes:row.reduce((n,r)=>n+r.bytes,0),byMethod:row.reduce((o,r)=>(o[r.name]=(o[r.name]||0)+r.bytes,o),{})},glError:gl.getError()};`);
    assert(high.water > 0.0015 && !high.stillPresent && high.height === report.target.height && high.veg === report.target.veg && high.type === report.target.type);
    assert(high.updates.some((v,i)=>v.matrix>beforeVersions[i][0]&&v.color>beforeVersions[i][1]), `Water change did not mark instance attributes: ${JSON.stringify(high.updates)}`);
    assert(high.uploads.calls > 0 && high.uploads.bytes > 0 && high.glError === 0, `No real WebGL submission after vegetation update: ${JSON.stringify(high.uploads)}`);
    await page(`const k=window.inkbox,r=k.render3d.renderer,i=${report.target.cell};window.__p03Uploads.rows=[];window.__p03Uploads.active=true;k.world.water[i]=0;r.update(.2);r.render();window.__p03Uploads.active=false;return true;`);
    const restored = await page(`const s=window.inkbox.render3d.renderer.stages.get('mortal');return{present:s.vegetation.trees.some(t=>t.cell===${report.target.cell}),state:${snapshotCode}};`);
    assert(restored.present, 'Tree must return when water falls below 0.0015');
    assert.deepEqual(restored.state.map(x=>({count:x.count,cells:x.cells,matrix:x.matrix,color:x.color})),
      report.initialInstances.map(x=>({count:x.count,cells:x.cells,matrix:x.matrix,color:x.color})), 'Restored GPU-visible instance arrays must match initial state');
    const afterPick = await page(`const k=window.inkbox,r=k.render3d.renderer,T=await import('three'),rect=k.render3d.canvas.getBoundingClientRect(),t=r.stages.get('mortal').vegetation.trees.find(t=>t.cell===${report.target.cell});
      const p=r.coordinates.worldToRender(t.x,t.y,r.stages.get('mortal').elevation.at(t.x,t.y)),v=new T.Vector3(p.x,p.y,p.z).project(r.cameraRig.camera),x=(v.x+1)*rect.width/2,y=(1-v.y)*rect.height/2,h=r.pickPlane(x,y,'mortal');return h?{x:h.x,y:h.y,plane:h.plane,kind:h.kind}:null;`);
    assert(afterPick?.plane === 'mortal', `Restored tree ground pick failed: ${JSON.stringify(afterPick)}`);
    return { target: report.target, highWater: high, restored, initialPick: report.target.pick, afterPick, matrixAndColorFlags: true,
      actualWebGLSubmission: true, submissionBytesScope: report.uploadScope };
  });

  await check('Height-only change repositions a real instance onto the new elevation', async () => {
    const before = await page(`const k=window.inkbox,r=k.render3d.renderer,s=r.stages.get('mortal'),i=${report.target.cell},t=s.vegetation.trees.find(t=>t.cell===i);
      const lod=s.vegetation.lodMeshes.findIndex(m=>m.userData.renderTrees.some(q=>q.cell===i)),m=s.vegetation.lodMeshes[lod],index=m.userData.renderTrees.findIndex(q=>q.cell===i);
      return{height:k.world.height[i],cell:k.world.type[i],tree:{x:t.x,y:t.y},lod,index,y:m.instanceMatrix.array[index*16+13],versions:[m.instanceMatrix.version,m.instanceColor?.version??null]};`);
    await page(`const k=window.inkbox,r=k.render3d.renderer,i=${report.target.cell};window.__p03Uploads.rows=[];window.__p03Uploads.active=true;k.world.height[i]+=.07;r.update(.2);r.render();window.__p03Uploads.active=false;return true;`);
    const after = await page(`const k=window.inkbox,r=k.render3d.renderer,s=r.stages.get('mortal'),i=${report.target.cell},t=s.vegetation.trees.find(t=>t.cell===i),lod=s.vegetation.lodMeshes.findIndex(m=>m.userData.renderTrees.some(q=>q.cell===i)),m=s.vegetation.lodMeshes[lod],index=m.userData.renderTrees.findIndex(q=>q.cell===i),p=r.coordinates.worldToRender(t.x,t.y,s.elevation.at(t.x,t.y));
      return{height:k.world.height[i],tree:{x:t.x,y:t.y},lod,index,y:m.instanceMatrix.array[index*16+13],expectedY:p.y,versions:[m.instanceMatrix.version,m.instanceColor?.version??null],uploads:window.__p03Uploads.rows.length};`);
    assert(Math.abs(after.height - (before.height + 0.07)) < 1e-6, `Unexpected Float32 height value: ${JSON.stringify({ before: before.height, after: after.height })}`);
    assert(Math.abs(after.expectedY - after.y) < 1e-4 && Math.abs(after.y - before.y) > 1e-3,
      `Grounding did not follow elevation: ${JSON.stringify({ before, after })}`);
    assert(after.versions[0] > before.versions[0] && after.uploads > 0, 'Height change must dirty and submit instance matrix');
    report.screenshots.push(await shot('elevation-grounding'));
    return { before, after, memberStillPresent: true };
  });

  await check('Camera wheel zoom and right-drag pan move the rendered view', async () => {
    const before = await page(`const r=window.inkbox.render3d.renderer,c=r.cameraRig.camera,t=r.cameraRig.controls.target,rect=r.canvas.getBoundingClientRect();return{zoom:c.zoom,position:c.position.toArray(),target:t.toArray(),center:{x:rect.x+rect.width/2,y:rect.y+rect.height/2}};`);
    await browser.wheel(before.center.x, before.center.y, -240);
    await browser.cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: before.center.x, y: before.center.y, button: 'none', buttons: 0 });
    await browser.cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: before.center.x, y: before.center.y, button: 'right', buttons: 2, clickCount: 1 });
    for (let n = 1; n <= 8; n += 1) {
      await browser.cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: before.center.x + n * 8, y: before.center.y + n * 4, button: 'right', buttons: 2 });
      await sleep(20);
    }
    await browser.cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: before.center.x + 64, y: before.center.y + 32, button: 'right', buttons: 0, clickCount: 1 });
    await frames(12);
    const after = await page(`const r=window.inkbox.render3d.renderer,c=r.cameraRig.camera,t=r.cameraRig.controls.target;return{zoom:c.zoom,position:c.position.toArray(),target:t.toArray()};`);
    const targetMoved = Math.hypot(...after.target.map((value,i)=>value-before.target[i])) > 0.01;
    assert(after.zoom > before.zoom && targetMoved, `Camera did not zoom and pan: ${JSON.stringify({before,after})}`);
    report.screenshots.push(await shot('camera-zoom-pan'));
    return { before, after, zoomed: true, panned: targetMoved };
  });

  await check('Vegetation Region inside, outside and reversed restores the full instance identity', async () => {
    const result = await page(`const k=window.inkbox,r=k.render3d.renderer,s=r.stages.get('mortal'),w=k.world;
      const {normalizeRegion}=await import('./src/inkbox/ui/tools.js'),{RegionMask}=await import('./src/inkbox/ui/RegionMask.js');
      const hash=(attr,count,width)=>{const bytes=new Uint8Array(attr.array.buffer,attr.array.byteOffset,count*width*attr.array.BYTES_PER_ELEMENT);let h=2166136261;for(const b of bytes){h^=b;h=Math.imul(h,16777619);}return(h>>>0).toString(16)};
      const rangeHash=(attr,start,width)=>{const bytes=new Uint8Array(attr.array.buffer,attr.array.byteOffset+start*attr.array.BYTES_PER_ELEMENT,width*attr.array.BYTES_PER_ELEMENT);let h=2166136261;for(const b of bytes){h^=b;h=Math.imul(h,16777619);}return(h>>>0).toString(16)};
      const layerState=layer=>{const byCell=new Map(),pickByCell=[];for(let lod=0;lod<layer.lodMeshes.length;lod++){const m=layer.lodMeshes[lod],expected=layer.trees.filter(t=>layer._lodByTree.get(t.cell)===lod).flatMap(t=>lod===0&&!layer.artProfile?[t.cell,t.cell]:[t.cell]),actual=m.userData.renderTrees.map(t=>t.cell);if(JSON.stringify(actual)!==JSON.stringify(expected))throw Error('Region pick mapping mismatch LOD'+lod);pickByCell.push(...actual);for(let i=0;i<actual.length;i++){const cell=actual[i];if(!byCell.has(cell))byCell.set(cell,[]);byCell.get(cell).push({matrix:rangeHash(m.instanceMatrix,i*16,16),color:rangeHash(m.instanceColor,i*3,3)});}}const visualByCell=[...byCell].map(([cell,rows])=>({cell,rows:rows.sort((a,b)=>a.matrix.localeCompare(b.matrix)||a.color.localeCompare(b.color))})).sort((a,b)=>a.cell-b.cell);return{memberCells:layer.trees.map(t=>t.cell).sort((a,b)=>a-b),pickByCell:pickByCell.sort((a,b)=>a-b),visualByCell};};
      r.update(.2);r.render();const baseline=layerState(s.vegetation);
      const originalMask=s.regionMask,originalInside=s.regionInside;
      const mask=new RegionMask(normalizeRegion([[48,30],[152,30],[152,96],[48,96]],w,.45));
      const run=inside=>{s.setRegionMask(mask,inside);s.update(.2);r.render();const layer=s.vegetation;
        return{inside,count:layer.trees.length,valid:layer.trees.every(t=>layer.regionGeometry.isInsideCell(t.x,t.y)===layer.regionInside),resources:{...r.gpu.info.memory,programs:r.gpu.info.programs?.length??0}};};
      const inView=run(true),outView=run(false);s.setRegionMask(originalMask,originalInside);s.update(.2);r.render();
      const restored=layerState(s.vegetation);return{baseline,inView,outView,restored};`);
    assert(result.inView.valid && result.outView.valid && result.inView.count > 0 && result.outView.count > 0);
    assert.deepEqual(result.restored, result.baseline, 'Region reverse must restore full instance membership, matrix/color bytes and pick mapping');
    report.screenshots.push(await shot('region-in-out-reverse'));
    return { inView: result.inView, outView: result.outView, restoredExactly: true };
  });

  await check('Repeated Region rebuilds keep warmed GPU resource counts stable', async () => {
    const resource = await page(`const r=window.inkbox.render3d.renderer;return{...r.gpu.info.memory,programs:r.gpu.info.programs?.length??0};`);
    const rows = await page(`const k=window.inkbox,r=k.render3d.renderer,s=r.stages.get('mortal'),w=k.world,{normalizeRegion}=await import('./src/inkbox/ui/tools.js'),{RegionMask}=await import('./src/inkbox/ui/RegionMask.js'),mask=new RegionMask(normalizeRegion([[45,28],[155,28],[155,98],[45,98]],w,.45)),out=[];
      for(let n=0;n<6;n++){s.setRegionMask(mask,n%2===0);s.update(.2);r.render();out.push({...r.gpu.info.memory,programs:r.gpu.info.programs?.length??0});}s.setRegionMask(null,true);s.update(.2);r.render();
      return{resource:out.at(-1),samples:out,final:{...r.gpu.info.memory,programs:r.gpu.info.programs?.length??0}};`);
    assert(rows.samples.every(value=>JSON.stringify(value)===JSON.stringify(resource)), `Resources grew during Region toggles: ${JSON.stringify({resource,rows})}`);
    assert.deepEqual(rows.final, resource);
    return { baseline: resource, repeatedSamples: rows.samples.length, final: rows.final };
  });

  await check('Disposed renderer resources fire lifecycle events and a fresh renderer returns to the same resource plateau', async () => {
    const old = await page(`const k=window.inkbox,a=k.render3d,s=a.renderer.stages.get('mortal'),v=s.vegetation;
      window.__p03Disposed={geometries:0,materials:0,textures:0};
      for(const g of [...new Set([v.geometry,...v.lodGeometries])])g.addEventListener('dispose',()=>window.__p03Disposed.geometries++);
      for(const m of [...new Set([v.material,v.pilotMaterial].filter(Boolean))])m.addEventListener('dispose',()=>window.__p03Disposed.materials++);
      v.texture.addEventListener('dispose',()=>window.__p03Disposed.textures++);
      const memory={...a.renderer.gpu.info.memory,programs:a.renderer.gpu.info.programs?.length??0};a.dispose();return{memory,disposed:a.renderer.disposed};`);
    assert(old.disposed, 'Old Render3DHost should be disposed');
    const created = await page(`const k=window.inkbox,{Render3DAdapter}=await import('./src/inkbox/render3d/Render3DAdapter.js'),next=new Render3DAdapter(k);k.render3d=next;return{active:next.active,hostDisposed:next.renderer.disposed};`);
    assert(created.active && !created.hostDisposed);
    await page(`const r=window.inkbox.render3d.renderer;await Promise.all([r.characterLoadPromise,r.environmentLoadPromise,r.art.comparisonReady]);return true;`, 90000);
    await frames(120);
    const after = await page(`const k=window.inkbox,r=k.render3d.renderer;return{worldAdopted:r.world===k.world,active:k.render3d.active,
      memory:{...r.gpu.info.memory,programs:r.gpu.info.programs?.length??0},disposed:window.__p03Disposed,glError:r.gpu.getContext().getError()};`);
    assert(after.worldAdopted && after.active && after.glError === 0);
    assert(after.disposed.geometries > 0 && after.disposed.materials > 0 && after.disposed.textures > 0,
      `Owned vegetation resources did not dispose: ${JSON.stringify(after.disposed)}`);
    assert.deepEqual(after.memory, old.memory, 'Fresh renderer should return to the same warmed GPU resource counts');
    report.screenshots.push(await shot('renderer-recreated'));
    return { old, created, after };
  });

  report.runtimeErrors = browser.errors();
  report.consoleErrors = browser.cdp.events.filter(event => event.method === 'Runtime.consoleAPICalled' && event.params.type === 'error')
    .map(event => event.params.args.map(arg => arg.value || arg.description || '').join(' '));
  assert.deepEqual(report.runtimeErrors, []); assert.deepEqual(report.consoleErrors, []);
  report.pass = report.checks.every(item => item.pass);
} catch (error) {
  report.error = String(error.stack || error); process.exitCode = 1; console.error(error);
  if (browser) { try { report.screenshots.push(await shot('failure')); } catch { /* preserve primary failure */ } }
} finally {
  if (browser) report.browserCleanup = await browser.close();
  if (server) { server.kill(); for (let n = 0; n < 50 && server.exitCode === null && server.signalCode === null; n += 1) await sleep(100); }
  report.cleanup = { edgeExited: !browser || browser.child.exitCode !== null || browser.child.signalCode !== null,
    ownedProcessesExited: !browser || report.browserCleanup?.processesExited,
    profileRemoved: !browser || !fs.existsSync(browser.userDataDir), serverExited: !server || server.exitCode !== null || server.signalCode !== null };
  if (Object.values(report.cleanup).some(value => !value)) { report.pass = false; process.exitCode = 1; }
  report.browserErrors = collectBrowserErrors(browser);
  if (report.browserErrors.length) { report.pass = false; process.exitCode = 1; }
  report.finishedAt = new Date().toISOString();
  fs.mkdirSync(path.dirname(OUT), { recursive: true }); fs.writeFileSync(OUT, JSON.stringify(report, null, 2) + '\n');
}
console.log(`G2-P0.3 final browser: ${report.checks.filter(item => item.pass).length}/${report.checks.length}; pass=${report.pass}; report=${OUT}`);
if (!report.pass) process.exitCode = 1;

