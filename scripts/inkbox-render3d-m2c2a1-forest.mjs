// A3 dense-forest LOD CPU probe. Synthetic records are presentation-only and never enter World.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { launch, findBrowser } from './cdp.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const base = process.env.INKBOX_URL || 'http://127.0.0.1:4192';
const pageURL = new URL(base);
if (!/\/inkbox\.html\/?$/i.test(pageURL.pathname)) pageURL.pathname = `${pageURL.pathname.replace(/\/$/, '')}/inkbox.html`;
pageURL.searchParams.set('renderer', '3d');
const output = path.resolve(process.env.INKBOX_REPORT_DIR || path.join(root, 'reports/m2c2a1/forest-probe'));
const frames = Math.max(120, Math.min(300, Number(process.env.INKBOX_FOREST_FRAMES || 180)));
const realModes = process.env.INKBOX_FOREST_REAL_STATIC_ONLY === '1' ? ['static'] : ['static', 'rotate-pan-zoom'];
const realStaticOnly = process.env.INKBOX_FOREST_REAL_STATIC_ONLY === '1';
const choices = [5000, 10000];
const report = {
  startedAt: new Date().toISOString(),
  pass: false,
  samplesPerFrameMode: frames,
  scenarios: [],
  provenance: {
    world: 'DENSITY_A real World is generated once; its full World + advanceState SHA-256 is checked before and after.',
    synthetic: '5k and 10k fixed-grid records replace only VegetationLayer.trees. They are presentation probe inputs, not World vegetation facts; every cell key is unique.',
    timing: 'Assignment phases use opt-in VegetationLayer.lodProbe. matrixUploadMs is CPU setMatrixAt/writeMatrices time; needsUpdate marks are counted, GPU transfer time is not measured.',
  },
};
let browser;
const page = body => browser.js(`return (async()=>{${body}})();`);
const hashFile = filename => createHash('sha256').update(fs.readFileSync(filename)).digest('hex');

try {
  fs.mkdirSync(output, { recursive: true });
  const executable = findBrowser();
  assert(executable, 'Microsoft Edge or Chrome is required');
  browser = await launch({ url: pageURL.toString(), browser: executable, width: 1500, height: 940, gpu: true, timeoutMs: 30000 });
  assert(await browser.waitFor('return !!window.inkbox?.render3d?.renderer?.stages?.size', { timeoutMs: 60000 }), `Render3D did not boot: ${browser.errors().join(' | ')}`);
  await page(`const r=window.inkbox.render3d.renderer;await r.characterLoadPromise;if(r.characterLoadError)throw r.characterLoadError;window.__a3=await import('./src/inkbox/render3d/art/VisualScenarios.js');window.__a3LOD=await import('./src/inkbox/render3d/lod/PresentationBudget.js');return true;`);
  report.environment = await page(`const r=window.inkbox.render3d.renderer,g=r.gpu.getContext(),e=g.getExtension('WEBGL_debug_renderer_info');return {browser:navigator.userAgent,gpu:e?g.getParameter(e.UNMASKED_RENDERER_WEBGL):g.getParameter(g.RENDERER),viewport:[innerWidth,innerHeight],dpr:r.gpu.getPixelRatio()};`);
  report.source = {
    vegetationLayerSha256: hashFile(path.join(root, 'src/inkbox/render3d/vegetation/VegetationLayer.js')),
    presentationBudgetSha256: hashFile(path.join(root, 'src/inkbox/render3d/lod/PresentationBudget.js')),
  };

  report.worldSetup = await page(`
    const k=window.inkbox,r=k.render3d.renderer,a=window.__a3,spec=a.applyScenario(k,'DENSITY_A');
    await r.characterLoadPromise;
    const {deriveVegetation}=await import('./src/inkbox/render3d/vegetation/deriveVegetation.js');
    const trees=deriveVegetation(k.world),tile=16,cols=Math.ceil(k.world.w/tile),rows=Math.ceil(k.world.h/tile),counts=new Uint32Array(cols*rows);
    for(const t of trees)counts[Math.floor(t.y/tile)*cols+Math.floor(t.x/tile)]++;
    let best=0;for(let i=1;i<counts.length;i++)if(counts[i]>counts[best])best=i;
    const tx=best%cols,ty=Math.floor(best/cols),x0=tx*tile,y0=ty*tile,x1=Math.min(k.world.w,x0+tile),y1=Math.min(k.world.h,y0+tile);
    const poi={x:(x0+x1-1)/2,y:(y0+y1-1)/2,bounds:[x0,y0,x1,y1],trees:counts[best],totalTrees:trees.length,tiles:counts.length,meanTreesPerTile:trees.length/counts.length};
    window.__a3DENSITYTrees=trees;window.__a3ForestPoi=poi;
    r.setArtProfile('pilot');r.setLODEnabled(true);a.applyCamera(r,'WORLD_OVERVIEW',{poi,zoom:9});
    for(let i=0;i<10;i++){await new Promise(requestAnimationFrame);r.update(1/60);r.render();}
    return {spec,poi,worldDigest:await a.snapshotDigest(k)};
  `);

  report.chooseLODMicrobenchmark = await page(`
    const chooseLOD=window.__a3LOD.chooseLOD,batches=[],batchSize=10000,rounds=40;
    for(let warm=0;warm<3;warm++)for(let i=0;i<batchSize;i++)chooseLOD('tree',(i*37)%60,i%3,true);
    for(let round=0;round<rounds;round++){const start=performance.now();let checksum=0;for(let i=0;i<batchSize;i++)checksum+=chooseLOD('tree',(i*37+round)%60,i%3,true);batches.push({elapsedMs:performance.now()-start,checksum});}
    const ordered=batches.map(x=>x.elapsedMs).sort((a,b)=>a-b),totalMs=batches.reduce((sum,x)=>sum+x.elapsedMs,0);
    return {kind:'isolated pure chooseLOD microbenchmark; not included in layer timings',callsPerBatch:batchSize,batches:rounds,totalCalls:batchSize*rounds,medianBatchMs:ordered[Math.floor(ordered.length*.5)],p95BatchMs:ordered[Math.floor(ordered.length*.95)],meanNsPerCall:totalMs/(batchSize*rounds)*1e6,checksum:batches.reduce((sum,x)=>sum+x.checksum,0)};
  `);

  report.realDENSITY5kSetup = await page(`
    const r=window.inkbox.render3d.renderer,layer=r.stages.get('mortal').vegetation,trees=window.__a3DENSITYTrees.slice(0,5000),cells=new Set(trees.map(t=>t.cell));
    if(cells.size!==5000||trees.some(t=>!Number.isInteger(t.cell)))throw new Error('Real DENSITY_A subset must retain unique numeric World cell IDs');
    layer.setLODProbeEnabled(false);layer.trees=trees;layer._lodByTree.clear();layer._nextLodByTree.clear();r.setArtProfile('pilot');r.setLODEnabled(true);
    window.__a3.applyCamera(r,'WORLD_OVERVIEW',{poi:window.__a3ForestPoi,zoom:9});
    for(let i=0;i<10;i++){await new Promise(requestAnimationFrame);r.update(1/60);r.render();}
    return {treeCount:trees.length,uniqueNumericCells:cells.size,sizeRange:[Math.min(...trees.map(t=>t.size)),Math.max(...trees.map(t=>t.size))],cameraPoi:window.__a3ForestPoi,fixture:'first 5,000 deriveVegetation records from real DENSITY_A; layer-local subset only'};
  `);
  report.realDENSITY5k = {};
  for (const mode of realModes) {
    await page(`
      const r=window.inkbox.render3d.renderer,stage=r.stages.get('mortal'),layer=stage.vegetation;
      window.__a3.applyCamera(r,'WORLD_OVERVIEW',{poi:window.__a3ForestPoi,zoom:9});
      layer.trees=window.__a3DENSITYTrees.slice(0,5000);layer.pendingRegionRebuild=false;stage.vegetationPending=false;
      layer._lodByTree.clear();layer._nextLodByTree.clear();layer._reassignAndUpload(true);
      if(layer.trees.length!==5000||layer.stats.lod.reduce((sum,count)=>sum+count,0)!==5000)throw new Error('Real DENSITY_A fixture install did not settle at 5,000 trees');
      layer.setLODProbeEnabled(true);return true;
    `);
    report.realDENSITY5k[mode] = await page(`
      const r=window.inkbox.render3d.renderer,layer=r.stages.get('mortal').vegetation,raf=[],updates=[],assignment=[];let previous=null,lastCall=layer.lodProbe.calls;
      const target=r.cameraRig.controls.target,baseX=target.x,baseZ=target.z;
      for(let i=0;i<${frames};i++){
        const ts=await new Promise(requestAnimationFrame);if(previous!==null)raf.push(ts-previous);previous=ts;
        ${mode === 'rotate-pan-zoom' ? `
          r.cameraRig.rotate(.006);
          const rigTarget=r.cameraRig.controls.target,dx=Math.sin(i*.11)*.02,dz=Math.cos(i*.09)*.02;
          rigTarget.set(baseX+dx,rigTarget.y,baseZ+dz);r.cameraRig.camera.position.x+=dx;r.cameraRig.camera.position.z+=dz;
          r.cameraRig.controls.update();r.cameraRig.camera.zoom=9+.35*Math.sin(i/(${frames}-1)*Math.PI*4);r.cameraRig.camera.updateProjectionMatrix();r.cameraRig.camera.updateMatrixWorld(true);
        ` : ''}
        const start=performance.now();r.update(1/60);const elapsed=performance.now()-start;updates.push(r.updateMs||elapsed);r.render();
        const lodSum=layer.stats.lod.reduce((sum,count)=>sum+count,0);
        if(layer.trees.length!==5000||lodSum!==5000)throw new Error('Real DENSITY_A sample left the 5,000-tree fixture');
        if(layer.lodProbe.calls>lastCall){assignment.push({...layer.lodProbe.last});lastCall=layer.lodProbe.calls;}
      }
      const summarize=values=>{const v=[...values].sort((a,b)=>a-b);return {samples:values.length,medianMs:v.length?v[Math.floor(v.length*.5)]:null,p95Ms:v.length?v[Math.floor(v.length*.95)]:null,meanMs:values.length?values.reduce((a,b)=>a+b,0)/values.length:null};};
      const field=name=>summarize(assignment.map(s=>s[name])),assignmentOnly=assignment.map(s=>Math.max(0,s.totalReassignMs-s.matrixUploadMs));
      return {frames:${frames},raf:summarize(raf),rendererUpdate:summarize(updates),assignmentCalls:assignment.length,assignment:{projectionChooseLoopMs:field('projectionChooseLoopMs'),crowdedPartitionMs:field('crowdedPartitionMs'),budgetAssignMs:field('budgetAssignMs'),matrixUploadMs:field('matrixUploadMs'),assignmentOnlyMs:summarize(assignmentOnly),totalReassignMs:field('totalReassignMs'),matrixUploadCount:layer.lodProbe.matrixUploadCount,matrixInstancesWritten:layer.lodProbe.matrixInstancesWritten,matrixNeedsUpdateMarks:layer.lodProbe.matrixNeedsUpdateMarks,concatTemporaryArrays:layer.lodProbe.concatTemporaryArrays,concatTemporaryElements:layer.lodProbe.concatTemporaryElements,concatTemporaryElementsAvoided:layer.lodProbe.concatTemporaryElementsAvoided,last:layer.lodProbe.last},lod:layer.stats.lod,budgetDemotions:layer.stats.budgetDemotions,crowded:layer._budgetCrowded,triangles:layer.stats.triangles};
    `);
    if(mode==='static') await page(`const r=window.inkbox.render3d.renderer,w=window.inkbox.world;window.__a3.applyCamera(r,'WORLD_OVERVIEW',{poi:window.__a3ForestPoi,zoom:9});return true;`);
  }
  report.realDENSITY5k.worldDigestAfter = await page(`return window.__a3.snapshotDigest(window.inkbox);`);
  assert.equal(report.realDENSITY5k.worldDigestAfter.value, report.worldSetup.worldDigest.value, 'Real DENSITY_A 5k subset changed World/advanceState');

  if (!realStaticOnly) for (const count of choices) {
    const result = await page(`
      const k=window.inkbox,r=k.render3d.renderer,layer=r.stages.get('mortal').vegetation,w=k.world;
      const cols=Math.ceil(Math.sqrt(${count}*w.w/w.h)),rows=Math.ceil(${count}/cols),trees=[];
      for(let i=0;i<${count};i++){
        const row=Math.floor(i/cols),col=i%cols;
        trees.push({cell:'a3-probe-${count}-'+i,x:(col+.5)*w.w/cols,y:(row+.5)*w.h/rows,size:.72+((i*37)%61)/100,rotation:((i*104729)%628319)/100000});
      }
      const unique=new Set(trees.map(t=>t.cell));if(unique.size!==${count})throw new Error('Synthetic tree cells collide');
      layer.setLODProbeEnabled(false);layer.trees=trees;layer._lodByTree.clear();layer._nextLodByTree.clear();
      r.setArtProfile('pilot');r.setLODEnabled(true);window.__a3.applyCamera(r,'WORLD_OVERVIEW',{poi:{x:(w.w-1)/2,y:(w.h-1)/2,source:'A3 synthetic grid'},zoom:18});
      for(let i=0;i<8;i++){await new Promise(requestAnimationFrame);r.update(1/60);r.render();}
      return {count:${count},uniqueCells:unique.size,fixture:'fixed uniform grid; renderer layer only',synthetic:true};
    `);
    const scenario = { treeCount: count, fixture: result, modes: {} };

    scenario.modes.forcedStaticAssignment = await page(`
      const layer=window.inkbox.render3d.renderer.stages.get('mortal').vegetation,times=[];
      layer.setLODProbeEnabled(false);
      for(let i=0;i<${frames}+10;i++){const start=performance.now();layer._reassignAndUpload(false);const elapsed=performance.now()-start;if(i>=10)times.push(elapsed);}
      const values=[...times].sort((a,b)=>a-b);return {kind:'forced recomputation at a stationary view; measures normal assignment body without opt-in timing overhead',samples:times.length,medianMs:values[Math.floor(values.length*.5)],p95Ms:values[Math.floor(values.length*.95)],meanMs:times.reduce((a,b)=>a+b,0)/times.length};
    `);

    scenario.modes.forcedStaticAssignmentInstrumented = await page(`
      const layer=window.inkbox.render3d.renderer.stages.get('mortal').vegetation;layer.setLODProbeEnabled(true);
      for(let i=0;i<10;i++)layer._reassignAndUpload(false);
      const samples=[];for(let i=0;i<${frames};i++){layer._reassignAndUpload(false);samples.push({...layer.lodProbe.last});}
      const summarize=key=>{const v=samples.map(s=>s[key]).sort((a,b)=>a-b);return {medianMs:v[Math.floor(v.length*.5)],p95Ms:v[Math.floor(v.length*.95)]};};
      const assignmentOnly=samples.map(s=>Math.max(0,s.totalReassignMs-s.matrixUploadMs)).sort((a,b)=>a-b);
      return {samples:samples.length,projectionChooseLoopMs:summarize('projectionChooseLoopMs'),crowdedPartitionMs:summarize('crowdedPartitionMs'),budgetAssignMs:summarize('budgetAssignMs'),matrixUploadMs:summarize('matrixUploadMs'),assignmentOnlyMs:{medianMs:assignmentOnly[Math.floor(assignmentOnly.length*.5)],p95Ms:assignmentOnly[Math.floor(assignmentOnly.length*.95)]},totalReassignMs:summarize('totalReassignMs'),last:samples.at(-1),cumulative:{...layer.lodProbe,last:undefined}};
    `);

    scenario.modes.forcedUpload = await page(`
      const layer=window.inkbox.render3d.renderer.stages.get('mortal').vegetation;layer.setLODProbeEnabled(true);
      const samples=[];for(let i=0;i<Math.max(30,Math.floor(${frames}/3));i++){layer._reassignAndUpload(true);samples.push({...layer.lodProbe.last});}
      const values=samples.map(s=>s.matrixUploadMs).sort((a,b)=>a-b),totals=samples.map(s=>s.totalReassignMs).sort((a,b)=>a-b);
      return {samples:samples.length,matrixUploadMs:{medianMs:values[Math.floor(values.length*.5)],p95Ms:values[Math.floor(values.length*.95)]},totalReassignMs:{medianMs:totals[Math.floor(totals.length*.5)],p95Ms:totals[Math.floor(totals.length*.95)]},matrixUploadCount:layer.lodProbe.matrixUploadCount,matrixInstancesWritten:layer.lodProbe.matrixInstancesWritten,matrixNeedsUpdateMarks:layer.lodProbe.matrixNeedsUpdateMarks,renderTreesArraysAllocated:layer.lodProbe.renderTreesArraysAllocated,gpuTransferTiming:'not measured'};
    `);

    for (const mode of ['static', 'rotate-pan-zoom']) {
      await page(`
        const r=window.inkbox.render3d.renderer,w=window.inkbox.world;window.__a3.applyCamera(r,'WORLD_OVERVIEW',{poi:{x:(w.w-1)/2,y:(w.h-1)/2,source:'A3 mode reset'},zoom:18});
        const layer=r.stages.get('mortal').vegetation;layer.setLODProbeEnabled(true);for(let i=0;i<8;i++){await new Promise(requestAnimationFrame);r.update(1/60);r.render();}return true;
      `);
      scenario.modes[mode] = await page(`
        const r=window.inkbox.render3d.renderer,layer=r.stages.get('mortal').vegetation,raf=[],updates=[],assignment=[];let previous=null,lastCall=layer.lodProbe.calls;
        const target=r.cameraRig.controls.target,baseX=target.x,baseZ=target.z;
        for(let i=0;i<${frames};i++){
          const ts=await new Promise(requestAnimationFrame);if(previous!==null)raf.push(ts-previous);previous=ts;
          ${mode === 'rotate-pan-zoom' ? `
            r.cameraRig.rotate(.006);
            const rigTarget=r.cameraRig.controls.target,dx=Math.sin(i*.11)*.22,dz=Math.cos(i*.09)*.18;
            rigTarget.set(baseX+dx,rigTarget.y,baseZ+dz);r.cameraRig.camera.position.x+=dx;r.cameraRig.camera.position.z+=dz;
            r.cameraRig.controls.update();r.cameraRig.camera.zoom=17.65+.35*(1-Math.cos(i/(${frames}-1)*Math.PI*4))/2;r.cameraRig.camera.updateProjectionMatrix();r.cameraRig.camera.updateMatrixWorld(true);
          ` : ''}
          const start=performance.now();r.update(1/60);const elapsed=performance.now()-start;updates.push(r.updateMs||elapsed);r.render();
          if(layer.lodProbe.calls>lastCall){assignment.push({...layer.lodProbe.last});lastCall=layer.lodProbe.calls;}
        }
        const summarize=values=>{const v=[...values].sort((a,b)=>a-b);return {samples:values.length,medianMs:v[Math.floor(v.length*.5)],p95Ms:v[Math.floor(v.length*.95)],meanMs:values.reduce((a,b)=>a+b,0)/values.length};};
        const field=name=>summarize(assignment.map(s=>s[name]));
        const assignmentOnly=assignment.map(s=>Math.max(0,s.totalReassignMs-s.matrixUploadMs));
        return {frames:${frames},raf:summarize(raf),rendererUpdate:summarize(updates),assignmentCalls:assignment.length,assignment:{projectionChooseLoopMs:field('projectionChooseLoopMs'),crowdedPartitionMs:field('crowdedPartitionMs'),budgetAssignMs:field('budgetAssignMs'),matrixUploadMs:field('matrixUploadMs'),assignmentOnlyMs:summarize(assignmentOnly),totalReassignMs:field('totalReassignMs'),matrixUploadCount:layer.lodProbe.matrixUploadCount,matrixInstancesWritten:layer.lodProbe.matrixInstancesWritten,matrixNeedsUpdateMarks:layer.lodProbe.matrixNeedsUpdateMarks,concatTemporaryArrays:layer.lodProbe.concatTemporaryArrays,concatTemporaryElements:layer.lodProbe.concatTemporaryElements,concatTemporaryElementsAvoided:layer.lodProbe.concatTemporaryElementsAvoided,partitionElementsProcessed:layer.lodProbe.partitionElementsProcessed,renderTreesArraysAllocated:layer.lodProbe.renderTreesArraysAllocated,last:layer.lodProbe.last},lod:layer.stats.lod,budgetDemotions:layer.stats.budgetDemotions,crowded:layer._budgetCrowded,triangles:layer.stats.triangles};
      `);
    }
    scenario.worldDigestAfter = await page(`return window.__a3.snapshotDigest(window.inkbox);`);
    assert.equal(scenario.worldDigestAfter.value, report.worldSetup.worldDigest.value, `Synthetic ${count} probe changed World/advanceState`);
    report.scenarios.push(scenario);
    console.log(`forest ${count}: static assignment p95 ${scenario.modes.forcedStaticAssignmentInstrumented.totalReassignMs.p95Ms.toFixed(3)}ms; dynamic assignment p95 ${scenario.modes['rotate-pan-zoom'].assignment.totalReassignMs.p95Ms.toFixed(3)}ms; ${scenario.modes['rotate-pan-zoom'].assignmentCalls} assignments`);
  }

  report.browserErrors = browser.errors();
  assert.deepEqual(report.browserErrors, [], 'Browser console/runtime errors');
  report.consoleErrors = browser.cdp.events
    .filter(event => event.method === 'Runtime.consoleAPICalled' && event.params.type === 'error')
    .map(event => event.params.args.map(arg => arg.value ?? arg.description ?? '').join(' '));
  assert.deepEqual(report.consoleErrors, [], 'Browser console.error calls');
  report.glError = await page(`const code=window.inkbox.render3d.renderer.gpu.getContext().getError();return {code,name:code===0?'NO_ERROR':'GL_ERROR_'+code};`);
  assert.equal(report.glError.code, 0, `WebGL error ${report.glError.name}`);
  report.pass = true;
} catch (error) {
  report.failure = error.stack || String(error);
  report.browserErrors = browser?.errors() || [];
  process.exitCode = 1;
  console.error(error.stack || error);
} finally {
  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(path.join(output, 'M2C2A1_FOREST_PROBE.json'), JSON.stringify(report, null, 2));
  await browser?.close();
}
