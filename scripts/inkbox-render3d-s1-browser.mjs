// R3D-S1 finite, serial, real-browser A/B. Start the project's HTTP server separately.
// INKBOX_URL=http://127.0.0.1:4197 node scripts/inkbox-render3d-s1-browser.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { launch, findBrowser } from './cdp.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'reports/r3d-s1/browser');
const frames = 180;
const viewport = { width: 1500, height: 940, dpr: 1 };
const sourceFiles = [
  'scripts/inkbox-render3d-s1-browser.mjs',
  'src/inkbox/render3d/vegetation/VegetationLayer.js',
  'src/inkbox/render3d/Render3DHost.js',
  'src/inkbox/render3d/Render3DAdapter.js',
  'src/inkbox/render3d/stage/PlaneStage.js',
  'src/inkbox/render3d/art/VisualScenarios.js',
];
const sourceHashes = () => Object.fromEntries(sourceFiles.map(file =>
  [file, createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex')]));
const base = new URL(process.env.INKBOX_URL || 'http://127.0.0.1:4197');
if (!/\/inkbox\.html\/?$/i.test(base.pathname)) base.pathname = `${base.pathname.replace(/\/$/, '')}/inkbox.html`;
base.searchParams.set('renderer', '3d');
const report = {
  startedAt: new Date().toISOString(), pass: false, url: base.toString(), viewport,
  framesPerScene: frames, recipe: 'VisualScenarios.DENSITY_A', modes: {},
  timing: 'RAF intervals, host.updateMs and WebGLRenderer.render CPU wall time only. No GPU timer query; GPU execution milliseconds are not measured.',
  counting: 'onBeforeRender counts body and outline InstancedMesh submissions actually reached by WebGLRenderer; renderer.info is read after the product render. Buffer bytes are JavaScript TypedArray capacity, not GPU memory. Attached capacity includes offscreen partitions. No extra render is issued in measurement windows.',
  sourceSha256: sourceHashes(),
};
let browser;
const page = (body, timeoutMs = 120000) => browser.js(`return (async()=>{${body}})();`, { timeoutMs });
const q = n => `(${JSON.stringify(n)})`;

try {
  fs.mkdirSync(output, { recursive: true });
  const executable = findBrowser();
  assert(executable, 'Microsoft Edge or Chrome is required');
  for (const mode of ['off', 'on']) {
    const url = new URL(base);
    url.searchParams.set('forestCull', mode);
    browser = await launch({ url: url.toString(), browser: executable,
      width: viewport.width, height: viewport.height, gpu: true, timeoutMs: 30000 });
    assert(await browser.waitFor('return !!window.inkbox?.render3d?.renderer?.stages?.size', { timeoutMs: 60000 }),
      `Render3D did not boot: ${browser.errors().join(' | ')}`);
    const modeReport = report.modes[mode] = { url: url.toString(), scenarios: {}, screenshots: {} };
    modeReport.setup = await page(`
      const k=window.inkbox,r=k.render3d.renderer;
      k.creationMenu.close();k.qol.closeHelp();k.setSpeed(0);
      if(k.creationMenu.isOpen()||!document.getElementById('inkCreationMenu').hidden||k.qol.helpOpen())
        throw new Error('Creation/help overlay remains open');
      await Promise.all([r.characterLoadPromise,r.environmentLoadPromise]);
      if(r.characterLoadError||r.environmentLoadError)throw r.characterLoadError||r.environmentLoadError;
      const a=await import('./src/inkbox/render3d/art/VisualScenarios.js');
      const spec=a.applyScenario(k,'DENSITY_A');
      document.getElementById('inkBusanziLater')?.click();
      if(!k.busanziCollapsed)throw new Error('Busanzi tutorial panel did not collapse');
      for(let i=0;i<120&&r.world!==k.world;i++)await new Promise(requestAnimationFrame);
      if(r.world!==k.world)throw new Error('DENSITY_A was not adopted by Render3DHost');
      // Keep the production Shanhai body and ink-outline materials in both modes.
      r.setLODEnabled(true);
      const {deriveVegetation}=await import('./src/inkbox/render3d/vegetation/deriveVegetation.js');
      const trees=deriveVegetation(k.world),tile=16,cols=Math.ceil(k.world.w/tile),counts=new Uint32Array(cols*Math.ceil(k.world.h/tile));
      for(const t of trees)counts[Math.floor(t.y/tile)*cols+Math.floor(t.x/tile)]++;
      let best=0;for(let i=1;i<counts.length;i++)if(counts[i]>counts[best])best=i;
      const tx=best%cols,ty=Math.floor(best/cols),poi={x:Math.min(k.world.w-1,tx*tile+7.5),y:Math.min(k.world.h-1,ty*tile+7.5),tileTrees:counts[best],source:'densest real DENSITY_A 16x16 tile'};
      window.__s1={a,poi,trees:trees.length};
      const layer=r.stages.get('mortal').vegetation;
      if(layer.spatialBatches!==${mode === 'on'})throw new Error('forestCull URL switch did not reach VegetationLayer');
      layer.setLODProbeEnabled(true);
      const gl=r.gpu.getContext(),debug=gl.getExtension('WEBGL_debug_renderer_info');
      return {spec,poi,treeCount:trees.length,worldDigest:await a.snapshotDigest(k),
        browser:navigator.userAgent,gpu:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),
        dpr:r.gpu.getPixelRatio(),canvas:[r.canvas.width,r.canvas.height],spatialBatches:layer.spatialBatches};
    `, 240000);
    assert.equal(modeReport.setup.dpr, viewport.dpr, 'DPR drift');
    modeReport.scenarios.far = await page(sampleBody('far', frames), 240000);
    await browser.screenshot(path.join(output, `far-${mode}.png`));
    modeReport.screenshots.far = `far-${mode}.png`;
    modeReport.scenarios.near = await page(sampleBody('near', frames), 240000);
    await browser.screenshot(path.join(output, `near-${mode}.png`));
    modeReport.screenshots.near = `near-${mode}.png`;
    modeReport.scenarios.motion = await page(sampleBody('motion', frames), 240000);
    modeReport.scenarios.realmSculptReturn = await page(sampleBody('realmSculptReturn', frames), 240000);
    modeReport.finalWorldDigest = await page(`return window.__s1.a.snapshotDigest(window.inkbox);`);
    modeReport.browserErrors = browser.errors();
    assert.deepEqual(modeReport.browserErrors, [], `${mode} browser errors`);
    const cleanup = await browser.close();
    modeReport.browserCleanup = cleanup;
    browser = null;
    assert(cleanup.complete, `${mode} owned browser cleanup failed`);
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  }
    const off = report.modes.off, on = report.modes.on;
  assert.equal(off.setup.worldDigest.value, on.setup.worldDigest.value, 'initial world digests differ');
  assert.equal(off.finalWorldDigest.value, on.finalWorldDigest.value, 'final world digests differ');
  for (const key of ['far','near','motion','realmSculptReturn']) {
    assert.equal(off.scenarios[key].worldDigest.value, on.scenarios[key].worldDigest.value, `${key} world digests differ`);
    assert.equal(off.scenarios[key].logicalTrees, on.scenarios[key].logicalTrees, `${key} logical tree counts differ`);
    assert.deepEqual(off.scenarios[key].lod, on.scenarios[key].lod, `${key} LOD allocation differs`);
  }
  report.sourceSha256After = sourceHashes();
  assert.deepEqual(report.sourceSha256After, report.sourceSha256, 'source changed during A/B run');
  report.pass = true;
} catch (error) {
  report.failure = error.stack || String(error);
  process.exitCode = 1;
  console.error(report.failure);
} finally {
  if (browser) {
    const mode = Object.values(report.modes).at(-1);
    if (mode) mode.browserErrors = browser.errors();
    try { const cleanup = await browser.close(); if (mode) mode.browserCleanup = cleanup; }
    catch (error) { report.cleanupFailure = error.stack || String(error); process.exitCode = 1; }
  }
  report.finishedAt = new Date().toISOString();
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
}

function sampleBody(scene, count) {
  return `
    const k=window.inkbox,r=k.render3d.renderer,layer=r.stages.get('mortal').vegetation,a=window.__s1.a,poi=window.__s1.poi;
    const scene=${q(scene)},count=${count};
    k.selectTool('inspect');k.selection=null;r.setRealmViewState(k.getRealmViewState());
    if(scene==='far')a.applyCamera(r,'WORLD_OVERVIEW',{zoom:1.45});
    else a.applyCamera(r,'WORLD_OVERVIEW',{poi,zoom:9});
    for(let i=0;i<12;i++)await new Promise(requestAnimationFrame);
    const startDigest=await a.snapshotDigest(k);
    const terrainSculpt=scene==='realmSculptReturn'?(await import('./src/inkbox/render3d/terrain/sculpt.js')).sculpt:null;
    const samples=[], events=[], assignments=[], originalRender=r.gpu.render, originalSceneBefore=r.scene.onBeforeRender;
    const hooked=new Map(), legacy=new Set(layer.lodMeshes||[]);
    let current=null,previous=null;
    const stats=()=>({...layer.spatialStats});
    const initialSpatial=stats(),initialProbe=layer.lodProbe?{...layer.lodProbe}:null;
    let lastProbeCall=layer.lodProbe?.calls||0;
    const summary=(values,unit)=>{const v=values.filter(Number.isFinite).sort((a,b)=>a-b);return {unit,samples:v.length,p50:v.length?v[Math.floor(v.length*.5)]:null,p95:v.length?v[Math.min(v.length-1,Math.floor(v.length*.95))]:null,mean:v.length?v.reduce((a,b)=>a+b,0)/v.length:null};};
    const attach=()=>layer.group.traverse(o=>{
      if(!o.isInstancedMesh||hooked.has(o))return;
      const body=!!o.userData.s1VegetationBody||legacy.has(o);
      const outline=!!o.userData.inkOutline||!!o.userData.presentationOnly;
      if(!body&&!outline)return;
      const prior=o.onBeforeRender;
      o.onBeforeRender=function(...args){
        if(current){const target=body?current.body:current.outline;target.calls++;target.instances+=this.count;}
        return prior?.apply(this,args);
      };
      hooked.set(o,prior);
    });
    r.scene.onBeforeRender=function(...args){attach();return originalSceneBefore?.apply(this,args);};
    r.gpu.render=function(...args){
      const started=performance.now();
      if(current){current.renderCount=(current.renderCount||0)+1;current.body={calls:0,instances:0};current.outline={calls:0,instances:0};}
      const result=originalRender.apply(this,args);
      if(current){current.renderCpuMs=performance.now()-started;
        current.drawCalls=this.info.render.calls;current.triangles=this.info.render.triangles;
        current.memory={...this.info.memory};current.spatial=stats();}
      return result;
    };
    try {
      for(let i=0;i<count;i++){
        current={frame:i};
        const ts=await new Promise(requestAnimationFrame);
        if(previous!==null)current.rafMs=ts-previous;previous=ts;
        current.updateMs=r.updateMs;
        if(current.renderCount!==1)throw new Error('Product RAF did not call gpu.render exactly once');
        samples.push(current);current=null;
        if(layer.lodProbe&&layer.lodProbe.calls>lastProbeCall){
          assignments.push({...layer.lodProbe.last});lastProbeCall=layer.lodProbe.calls;
        }
        if(scene==='motion'){
          const phase=i/count;
          r.cameraRig.moveLocal(Math.sin(i*.07),Math.cos(i*.055),1/60,false);
          r.cameraRig.rotate(.006);
          r.cameraRig.camera.zoom=9+.8*Math.sin(phase*Math.PI*4);
          r.cameraRig.camera.updateProjectionMatrix();
        }
        if(scene==='realmSculptReturn'){
          if(i===24){
            const w=k.world,x0=Math.max(1,Math.floor(poi.x-12)),y0=Math.max(1,Math.floor(poi.y-12)),x1=Math.min(w.w-2,x0+24),y1=Math.min(w.h-2,y0+24);
            k.selectTool('viewUpper');k.commitSelection([[x0,y0],[x1,y0],[x1,y1],[x0,y1]]);
            r.setRealmViewState(k.getRealmViewState());events.push({frame:i,kind:'realm-open',open:r.realmPrototype.open});
            if(!r.realmPrototype.open)throw new Error('Realm window did not open');
          }
          if(i===72){
            const region=terrainSculpt(k.world,{x:poi.x,y:poi.y,radius:5,strength:.04,mode:'raise',natural:true});
            if(!region?.changes?.length)throw new Error('Sculpt produced no terrain changes');
            k.render3d.applyTerrainDirty(region);events.push({frame:i,kind:'sculpt',cells:region.changes.length});
          }
          if(i===132){
            k.selectTool('inspect');k.selection=null;r.setRealmViewState(k.getRealmViewState());
            a.applyCamera(r,'WORLD_OVERVIEW',{poi,zoom:9});events.push({frame:i,kind:'realm-close-return',open:r.realmPrototype.open});
            if(r.realmPrototype.open)throw new Error('Realm window did not close');
          }
        }
      }
    } finally {
      current=null;r.gpu.render=originalRender;r.scene.onBeforeRender=originalSceneBefore;
      for(const [mesh,prior] of hooked)mesh.onBeforeRender=prior;
    }
    const field=name=>summary(samples.map(s=>s[name]),'ms');
    const countSummary=values=>summary(values,'count');
    const deltas={};for(const key of ['matrixWrites','uploadMarks'])deltas[key]=(layer.spatialStats?.[key]||0)-(initialSpatial[key]||0);
    const probe=layer.lodProbe;
    const probeDeltas={};if(probe&&initialProbe)for(const key of ['calls','matrixUploadCount','matrixInstancesWritten','matrixNeedsUpdateMarks'])probeDeltas[key]=(probe[key]||0)-(initialProbe[key]||0);
    const buffers=new Set();let totalVegetationCpuBufferBytes=0,attachedVegetationMeshCount=0;
    const addBuffers=o=>{if(!o.isInstancedMesh)return;
      for(const attr of [o.instanceMatrix,o.instanceColor])if(attr?.array&&!buffers.has(attr.array)){
        buffers.add(attr.array);totalVegetationCpuBufferBytes+=attr.array.byteLength;
      }
    };
    layer.group.traverse(o=>{if(o.isInstancedMesh)attachedVegetationMeshCount++;addBuffers(o);});
    const submittedTreeBufferCapacityBytes=totalVegetationCpuBufferBytes;
    for(const mesh of layer.lodMeshes||[])mesh?.traverse(addBuffers);
    return {scene,frames:samples.length,cameraPoi:poi,events,startWorldDigest:startDigest,worldDigest:await a.snapshotDigest(k),
      raf:field('rafMs'),hostUpdateCpu:field('updateMs'),gpuRenderCpu:field('renderCpuMs'),
      drawCalls:countSummary(samples.map(s=>s.drawCalls)),triangles:countSummary(samples.map(s=>s.triangles)),
      bodySubmittedCalls:countSummary(samples.map(s=>s.body?.calls)),bodySubmittedInstances:countSummary(samples.map(s=>s.body?.instances)),
      outlineSubmittedCalls:countSummary(samples.map(s=>s.outline?.calls)),outlineSubmittedInstances:countSummary(samples.map(s=>s.outline?.instances)),
      visiblePartitions:countSummary(samples.map(s=>s.spatial?.visiblePartitions)),
      activeVegetationMeshes:countSummary(samples.map(s=>s.spatial?.activeMeshes)),
      spatialEstimatedInstances:countSummary(samples.map(s=>s.spatial?.submittedInstances)),
      memory:samples.at(-1)?.memory,submittedTreeBufferCapacityBytes,totalVegetationCpuBufferBytes,attachedVegetationMeshCount,
      spatialLast:samples.at(-1)?.spatial,spatialDeltas:deltas,spatialRebuildLastMs:layer.spatialStats?.rebuildMs||0,
      lodProbeDeltas:probeDeltas,lodProbeLast:probe?.last||null,
      assignmentCpu:{calls:assignments.length,totalReassignMs:summary(assignments.map(x=>x.totalReassignMs),'ms'),
        matrixUploadMs:summary(assignments.map(x=>x.matrixUploadMs),'ms')},
      lod:[...layer.stats.lod],logicalTrees:layer.trees.length};
  `;
}
