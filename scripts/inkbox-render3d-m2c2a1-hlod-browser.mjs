import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, findBrowser, sleep } from './cdp.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const base = process.env.INKBOX_URL || `http://127.0.0.1:${process.env.INKBOX_PORT || 4192}`;
const url = new URL(base);
url.pathname = `${url.pathname.replace(/\/$/, '').replace(/\/inkbox\.html$/i, '')}/inkbox.html`;
url.searchParams.set('renderer', '3d'); url.searchParams.set('assets','off');
const output = path.resolve(root, 'reports/m2c2a1/hlod');
const page = body => browser.js(`return (async()=>{${body}})();`);
let browser;
const evidence = { generatedAt: new Date().toISOString(), world: 'GOLDEN_A', source: url.toString(), captures: [] };

try {
  fs.mkdirSync(output, { recursive: true });
  browser = await launch({ url: url.toString(), browser: findBrowser(), width: 1500, height: 940, gpu: true, timeoutMs: 30000 });
  assert(await browser.waitFor('return !!window.inkbox?.render3d?.renderer?.stages?.size', { timeoutMs: 60000 }),
    `Render3D failed to boot: ${browser.errors().join(' | ')}`);
  await page(`const r=window.inkbox.render3d.renderer;await r.characterLoadPromise;if(r.characterLoadError)throw r.characterLoadError;window.__m2c2a1=await import('./src/inkbox/render3d/art/VisualScenarios.js');return true;`);
  const scenario = await page(`
    const k=window.inkbox,a=window.__m2c2a1,result=a.applyScenario(k,'GOLDEN_A');
    return {...result,digest:await a.snapshotDigest(k)};
  `);
  await page(`const k=window.inkbox,r=k.render3d.renderer;r.setArtProfile('pilot');r.setLODEnabled(true);r.update(.3);r.render();return true;`);
  await sleep(800);
  const viewRecipe = await page(`
    const r=window.inkbox.render3d.renderer;
    return await window.__m2c2a1.applyVisibleCamera(r,'SETTLEMENT');
  `);
  const poi = { settlementId: viewRecipe.poi.id, houses: viewRecipe.poi.houses, house: viewRecipe.poi.house,
    x: viewRecipe.poi.x, y: viewRecipe.poi.y, source: viewRecipe.poi.source, entityId: viewRecipe.poi.entityId };
  const target = JSON.stringify({ x: poi.x, y: poi.y, source: poi.source, settlementId: poi.settlementId });
  const camera = async zoom => page(`
    const r=window.inkbox.render3d.renderer,a=window.__m2c2a1,T=await import('three');
    a.applyCamera(r,'WORLD_OVERVIEW',{poi:${target},yaw:${viewRecipe.recipe.yaw},polar:${viewRecipe.recipe.polar},zoom:${zoom}});
    for(let i=0;i<4;i++)await new Promise(requestAnimationFrame);r.render();
    const s=r.stages.get('mortal').settlements;
    const house=${JSON.stringify(poi.house)},building=s._selectedBuildings.find(b=>b.settlementId===${JSON.stringify(poi.settlementId)}
      &&b.type==='house'&&Math.abs(b.x-(house.x+.5))<.01&&Math.abs(b.y-(house.y+.5))<.01);
    const targetHouseLod=building?s._currentLods[building._layerIndex]:-1;
    let targetHouseVisible=targetHouseLod===0?${!!viewRecipe.visibilityProof.house?.visible}:false;
    if(targetHouseLod===1&&s.lod1.visible){
      const list=s.lod1.userData.renderBuildings||[],index=list.findIndex(b=>b.sourceIndex===building.sourceIndex);
      if(index>=0&&index<s.lod1.count){
        r.scene.updateMatrixWorld(true);
        const worldPoint=r.coordinates.worldToRender(house.x+.5,house.y+.5,s.elevation.at(house.x+.5,house.y+.5)+1.5);
        const point=new T.Vector3(worldPoint.x,worldPoint.y,worldPoint.z).project(r.cameraRig.camera);
        if(Math.abs(point.x)<.95&&Math.abs(point.y)<.95&&point.z>-1&&point.z<1){
          const ray=new T.Raycaster();ray.setFromCamera(new T.Vector2(point.x,point.y),r.cameraRig.camera);
          const hit=ray.intersectObjects(r.scene.children,true).find(item=>{for(let p=item.object;p;p=p.parent)if(!p.visible)return false;return true;});
          targetHouseVisible=hit?.object===s.lod1&&hit.instanceId===index;
        }
      }
    }
    return {zoom:${zoom},stats:{...s.stats,lod:[...s.stats.lod]},entries:s.hlodCluster.userData.renderSettlements,
      targetHouseLod,targetHouseVisible};
  `);
  const capture = async (name, mode, zoom, cropSettlement = false) => {
    const result = await page(`
      const r=window.inkbox.render3d.renderer,a=window.__m2c2a1,s=r.stages.get('mortal').settlements;
      s.setHLODMode(${JSON.stringify(mode)});
      const entries=(s.hlodMode==='cluster'?s.hlodCluster:s.hlodLegacy).userData.renderSettlements;
      const item=entries.find(entry=>entry.settlementId===${JSON.stringify(poi.settlementId)})||entries[0];
      a.applyCamera(r,'WORLD_OVERVIEW',{poi:${target},yaw:${viewRecipe.recipe.yaw},polar:${viewRecipe.recipe.polar},zoom:${zoom}});
      for(let i=0;i<4;i++)await new Promise(requestAnimationFrame);r.render();
      return {mode:s.hlodMode,stats:{...s.stats,lod:[...s.stats.lod]},entry:item,entries:entries.length,
        camera:{target:[...r.cameraRig.controls.target.toArray()],position:[...r.cameraRig.camera.position.toArray()],zoom:r.cameraRig.camera.zoom}};
    `);
    const filename = path.join(output, `${name}.png`);
    const canvasRect = await page(`
      const canvas=window.inkbox.render3d.renderer.gpu.domElement,rect=canvas.getBoundingClientRect();
      return {x:rect.x,y:rect.y,width:rect.width,height:rect.height,scale:devicePixelRatio};
    `);
    const clip = cropSettlement ? { x: canvasRect.x + canvasRect.width / 2 - 180,
      y: canvasRect.y + canvasRect.height / 2 - 180, width: 360, height: 360, scale: canvasRect.scale }
      : { x: canvasRect.x, y: canvasRect.y, width: canvasRect.width, height: canvasRect.height, scale: canvasRect.scale };
    const shot = await browser.cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false,
      clip });
    fs.writeFileSync(filename, Buffer.from(shot.data, 'base64'));
    evidence.captures.push({ name, file: path.relative(root, filename).replaceAll('\\', '/'), cropOnly: cropSettlement,
      cropRectCssPx: cropSettlement ? { x: clip.x, y: clip.y, width: clip.width, height: clip.height } : null, ...result });
    console.log(`Captured ${name}: ${result.mode}, ${result.stats.hlod} villages, ${result.stats.hlodClusters} clusters`);
  };

  const nearZoom = viewRecipe.recipe.zoom || 9;
  const nearProof = await camera(nearZoom);
  assert.equal(nearProof.targetHouseLod, 0, `near must restore the chosen real house: ${JSON.stringify(nearProof)}`);
  const measurements = [{...nearProof}];
  let midZoom = null, farZoom = null, fullFarZoom = null;
  for (const zoom of [12, 11, 10, 9, 8, 7, 6, 5, 4]) {
    const result = await camera(zoom); measurements.push(result);
    if (midZoom == null && result.targetHouseLod === 1 && result.targetHouseVisible) midZoom = zoom;
  }
  for (const zoom of [3, 2, 1.4, 1, .8, .65, .5]) {
    const result = await camera(zoom); measurements.push(result);
    if (farZoom == null && result.stats.hlod > 0 && result.entries.some(entry => entry.settlementId === poi.settlementId)) farZoom = zoom;
    if (fullFarZoom == null && result.stats.hlod === result.stats.villages
      && result.entries.some(entry => entry.settlementId === poi.settlementId)) fullFarZoom = zoom;
  }
  farZoom = fullFarZoom ?? farZoom;
  assert(nearZoom != null, `Could not find GOLDEN_A near zoom: ${JSON.stringify(measurements)}`);
  assert(midZoom != null, `Could not find GOLDEN_A mid LOD zoom: ${JSON.stringify(measurements)}`);
  assert(farZoom != null, `Could not find GOLDEN_A far HLOD zoom: ${JSON.stringify(measurements)}`);
  await capture('near', 'cluster', nearZoom);
  await capture('mid', 'cluster', midZoom);
  await capture('far-legacy-overview', 'legacy', farZoom);
  await capture('far-cluster-overview', 'cluster', farZoom);
  await capture('far-legacy', 'legacy', farZoom, true);
  await capture('far-cluster', 'cluster', farZoom, true);
  const farPair = evidence.captures.slice(-2);
  assert(farPair[1].entry?.settlementId === poi.settlementId, 'far cluster screenshot must show the selected real village HLOD');
  assert(farPair[0].entry?.settlementId === poi.settlementId, 'far legacy screenshot must show the same real village');
  assert.deepEqual(farPair[0].camera, farPair[1].camera, 'far legacy/cluster captures must use the same camera');
  evidence.scenario = scenario; evidence.poi = poi; evidence.viewRecipe = viewRecipe;
  evidence.selectedZooms = { nearZoom, midZoom, farZoom };
  evidence.measurements = measurements;
  evidence.consoleErrors = browser.cdp.events.filter(event => event.method === 'Runtime.consoleAPICalled' && event.params?.type === 'error')
    .map(event => event.params.args?.map(arg => arg.value || arg.description || '').join(' '));
  evidence.runtimeErrors = browser.errors();
  evidence.worldDigestAfter = await page(`return window.__m2c2a1.snapshotDigest(window.inkbox);`);
  evidence.sameWorldDigest = evidence.scenario.digest.value === evidence.worldDigestAfter.value;
  assert(evidence.sameWorldDigest, 'browser visual capture must preserve GOLDEN_A world digest and advance state');
  assert.equal(evidence.consoleErrors.length, 0, evidence.consoleErrors.join('\n'));
  assert.equal(evidence.runtimeErrors.length, 0, evidence.runtimeErrors.join('\n'));
  fs.writeFileSync(path.join(output, 'evidence.json'), JSON.stringify(evidence, null, 2));
  console.log(`\nSaved four GOLDEN_A views and evidence under ${path.relative(root, output)}`);
} finally { await browser?.close(); }
