// Browser acceptance matrix for M2-C2A. Run after the production LOD API is ready.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { launch, findEdge, sleep } from './cdp.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const basePort = Number(process.env.INKBOX_PORT || 4191);
const base = process.env.INKBOX_URL || `http://127.0.0.1:${basePort}`;
function rendererPageURL(value) {
  const url = new URL(value);
  if (/\/inkbox\.html\/?$/i.test(url.pathname)) url.pathname = url.pathname.replace(/\/$/, '');
  else url.pathname = `${url.pathname.replace(/\/$/, '')}/inkbox.html`;
  url.searchParams.set('renderer', '3d');
  return url.toString();
}
const pageURL = rendererPageURL(base);
const output = path.resolve(process.env.INKBOX_REPORT_DIR || path.join(root, 'reports/m2c2a/browser'));
const release = path.resolve(process.env.INKBOX_RELEASE_DIR || path.join(root, 'reports/release/render3d-m2c2a'));
const samples = Math.max(120, Math.min(180, Number(process.env.INKBOX_SAMPLES || 150)));
const evidence = { generatedAt: new Date().toISOString(), samplesPerPass: samples, cases: [], errors: [], pass: false };
let server, browser;

const page = (body, options) => browser.js(`return (async()=>{${body}})();`, options);
const shaFile = filename => createHash('sha256').update(fs.readFileSync(filename)).digest('hex');
const jsFiles = [
  'src/inkbox/render3d/Render3DHost.js', 'src/inkbox/render3d/stage/PlaneStage.js',
  'src/inkbox/render3d/vegetation/VegetationLayer.js', 'src/inkbox/render3d/entities/EntityLayer.js',
  'src/inkbox/render3d/settlements/SettlementLayer.js', 'src/inkbox/render3d/art/VisualScenarios.js',
];
function startServer() {
  if (process.env.INKBOX_URL) return null;
  return spawn(process.execPath, ['scripts/inkbox-server.mjs', '--port', String(basePort)], { cwd: root, stdio: 'ignore', windowsHide: true });
}
function renderSourceDigest() {
  const baseDir = path.join(root, 'src/inkbox/render3d');
  const files = [];
  const walk = dir => {
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      const filename = path.join(dir, item.name);
      if (item.isDirectory()) walk(filename);
      else if (/\.(?:js|mjs)$/.test(item.name)) files.push(filename);
    }
  };
  walk(baseDir); files.sort();
  const hash = createHash('sha256');
  for (const filename of files) {
    hash.update(path.relative(root, filename).replaceAll(path.sep, '/')); hash.update('\0');
    hash.update(fs.readFileSync(filename)); hash.update('\0');
  }
  return { algorithm: 'SHA-256', files: files.map(f => path.relative(root, f).replaceAll(path.sep, '/')), value: hash.digest('hex') };
}
async function waitServer() {
  for (let i = 0; i < 80; i += 1) {
    try { if ((await fetch(pageURL)).ok) return; } catch { /* server starting */ }
    await sleep(150);
  }
  throw new Error(`Inkbox server did not start at ${base}`);
}
function statsShape(stats, label) {
  assert(stats && typeof stats === 'object', `${label}: missing layer stats`);
  const lod = stats.lod ?? stats.lodCounts;
  assert(Array.isArray(lod) && lod.length === 3 && lod.every(Number.isFinite), `${label}: stats.lod must be [LOD0, LOD1, LOD2]`);
  assert(Number.isFinite(stats.triangles), `${label}: stats.triangles missing`);
  assert(Number.isFinite(stats.overflow), `${label}: stats.overflow missing`);
  assert(Number.isFinite(stats.capacity), `${label}: stats.capacity missing`);
  return { lod, triangles: stats.triangles, overflow: stats.overflow, capacity: stats.capacity };
}
function browserDiagnostics() {
  const consoleErrors = browser?.cdp.events.filter(event => event.method === 'Runtime.consoleAPICalled' && event.params?.type === 'error')
    .map(event => event.params.args?.map(arg => arg.value || arg.description || '').join(' ')) || [];
  const runtimeErrors = browser?.errors() || [];
  return { consoleErrors, runtimeErrors };
}
async function prepareScenario(name) {
  const spec = await page(`const a=window.__m2c2a;const result=a.applyScenario(window.inkbox,${JSON.stringify(name)});const r=window.inkbox.render3d.renderer;await r.characterLoadPromise;if(r.characterLoadError)throw r.characterLoadError;return result;`);
  await sleep(450);
  return spec;
}
async function forestPoi() {
  return page(`
    const r=window.inkbox.render3d.renderer,w=window.inkbox.world;
    const {deriveVegetation}=await import('./src/inkbox/render3d/vegetation/deriveVegetation.js');
    const trees=deriveVegetation(w),tile=16,cols=Math.ceil(w.w/tile),rows=Math.ceil(w.h/tile),counts=new Uint32Array(cols*rows);
    for(const t of trees)counts[Math.floor(t.y/tile)*cols+Math.floor(t.x/tile)]++;
    let best=0;for(let i=1;i<counts.length;i++)if(counts[i]>counts[best])best=i;
    const tx=best%cols,ty=Math.floor(best/cols),x0=tx*tile,y0=ty*tile,x1=Math.min(w.w,x0+tile),y1=Math.min(w.h,y0+tile);
    return {kind:'deriveVegetation 16x16 raster maximum',x:(x0+x1-1)/2,y:(y0+y1-1)/2,bounds:[x0,y0,x1,y1],trees:counts[best],totalTrees:trees.length,tiles:counts.length,meanTreesPerTile:trees.length/counts.length};
  `);
}
async function setupRealm(plane) {
  return page(`
    const k=window.inkbox,r=k.render3d.renderer,w=k.world;
    const side=Math.floor(Math.min(w.w,w.h)*.60),cx=(w.w-1)/2,cy=(w.h-1)/2;
    const x0=Math.max(0,Math.floor(cx-side/2)),y0=Math.max(0,Math.floor(cy-side/2)),x1=Math.min(w.w-1,x0+side),y1=Math.min(w.h-1,y0+side);
    const selection={path:[[x0,y0],[x1,y0],[x1,y1],[x0,y1]],x0,y0,x1,y1,area:(x1-x0)*(y1-y0)};
    k.selectTool(${JSON.stringify(plane==='upper'?'viewUpper':'viewNether')});k.selection=selection;k.dirty=true;
    r.setRealmViewState(k.getRealmViewState());
    window.__m2c2a.applyCamera(r,'WORLD_OVERVIEW',{poi:{x:(x0+x1)/2,y:(y0+y1)/2,source:'large-rectangle-region'}});
    for(let i=0;i<3;i++)await new Promise(requestAnimationFrame);r.render();
    return {targetPlane:${JSON.stringify(plane)},bounds:[x0,y0,x1,y1],fraction:selection.area/(w.w*w.h),visiblePlanes:[...r.stages.values()].filter(s=>s.visible).map(s=>s.plane),regionChecks:[...r.stages.values()].filter(s=>s.visible).map(s=>{const layers=[s.terrain,s.water,s.vegetation,s.entities,s.settlements,s.markers].filter(Boolean);return {plane:s.plane,inside:s.regionInside,essentialLayers:!!s.terrain&&!!s.entities,shared:!!s.regionGeometry&&layers.every(layer=>layer.regionGeometry===s.regionGeometry),layerCount:layers.length};})};
  `);
}
async function setMode(profile, lod) {
  await page(`const r=window.inkbox.render3d.renderer;r.setArtProfile(${JSON.stringify(profile)});if(typeof r.setLODEnabled!=='function')throw new Error('Render3DHost.setLODEnabled(bool) is required');r.setLODEnabled(${lod});for(let i=0;i<3;i++)await new Promise(requestAnimationFrame);r.render();return true;`);
}
async function collectSample(label, scenario, poi, region) {
  return page(`
    const r=window.inkbox.render3d.renderer,visible=[...r.stages.values()].filter(s=>s.visible);
    const summarize=a=>{const v=[...a].sort((x,y)=>x-y);return {samples:a.length,medianMs:v[Math.floor(v.length*.5)],p95Ms:v[Math.floor(v.length*.95)],meanMs:a.reduce((x,y)=>x+y,0)/a.length};};
    const frameTimes=[],updates=[];let prev=null;
    for(let i=0;i<${samples}+1;i++){const ts=await new Promise(requestAnimationFrame);if(prev!==null){frameTimes.push(ts-prev);updates.push(r.updateMs||0);}prev=ts;}
    const submits=[];for(let i=0;i<${samples}+5;i++){const t=performance.now();r.render();const dt=performance.now()-t;if(i>=5)submits.push(dt);}
    const tris=m=>{const g=m.geometry;if(!g)return 0;const n=g.index?.count??g.attributes.position?.count??0;let count=Math.min(n,g.drawRange?.count??n);if(Array.isArray(m.material)&&g.groups?.length)count=g.groups.reduce((s,x)=>s+Math.min(x.count,Math.max(0,n-x.start)),0);return Math.floor(count/3)*(m.isInstancedMesh?m.count:1);};
    const category=(root)=>{let total=0;if(root)root.traverse(o=>{if(!o.isMesh||!o.visible)return;for(let p=o.parent;p;p=p.parent)if(!p.visible)return;total+=tris(o);});return total;};
    const layerStats={},regionAudit=[],categoryInstances={trees:0,characters:0,buildings:0},logicalCounts={trees:0,characters:0,buildings:0};let categoryTriangles={trees:0,characters:0,buildings:0};
    for(const s of visible){
      for(const [key,layer] of [['trees',s.vegetation],['characters',s.entities],['buildings',s.settlements]]){
        layerStats[s.plane]??={};layerStats[s.plane][key]=layer?layer.stats:{absent:true,lod:[0,0,0],triangles:0,overflow:0,capacity:0};
        if(!layer)continue;
        const group=layer.group||(key==='trees'?layer.mesh:null);categoryTriangles[key]+=category(group);
        group?.traverse(mesh=>{if(!mesh.isInstancedMesh||!mesh.visible)return;for(let parent=mesh.parent;parent;parent=parent.parent)if(!parent.visible)return;categoryInstances[key]+=mesh.count;});
        logicalCounts[key]+=key==='trees'?(layer.stats.trees??0):key==='buildings'?(layer.stats.buildings??0):(layer.stats.instances??0);
      }
      if(${JSON.stringify(region)}&&s.regionGeometry){
        const leaks={trees:0,characters:0,buildings:0},seen={trees:0,characters:0,buildings:0};
        const auditItems=(category,items)=>{for(const raw of items||[]){const item=raw?.source&&typeof raw.source==='object'?raw.source:raw;if(!Number.isFinite(item?.x)||!Number.isFinite(item?.y))continue;seen[category]++;if(s.regionGeometry.isInsideCell(item.x,item.y)!==s.regionInside)leaks[category]++;}};
        if(s.vegetation)auditItems('trees',s.vegetation.trees);
        for(const [category,layer] of [['characters',s.entities],['buildings',s.settlements]]){
          if(!layer)continue;
          layer.group.traverse(mesh=>{if(!mesh.isInstancedMesh||!mesh.visible||!mesh.count)return;const field=Object.entries(mesh.userData).find(([key,value])=>key.toLowerCase().startsWith('render')&&Array.isArray(value)&&value.length);if(!field)throw new Error('Region mask audit missing '+category+' instance identities on '+mesh.name);const items=field[1].slice(0,mesh.count);auditItems(category,items);if(category==='buildings'&&field[0]==='renderSettlements'){const buildings=layer.lastDerived?.buildings||[];for(const cluster of items)for(const sourceIndex of cluster.members||[]){const member=buildings.find(building=>building.sourceIndex===sourceIndex);if(!member)throw new Error('HLOD source member '+sourceIndex+' cannot be resolved to a derived building');seen.buildings++;if(s.regionGeometry.isInsideCell(member.x,member.y)!==s.regionInside)leaks.buildings++;}}});
        }
        const layers=[s.terrain,s.water,s.vegetation,s.entities,s.settlements,s.markers].filter(Boolean);
        regionAudit.push({plane:s.plane,inside:s.regionInside,shared:!!s.regionGeometry&&layers.every(layer=>layer.regionGeometry===s.regionGeometry),presentLayers:layers.map(layer=>layer.constructor.name),seen,leaks});
      }
    }
    const gl=r.gpu.getContext(),debug=gl.getExtension('WEBGL_debug_renderer_info');
    return {case:${JSON.stringify(label)},scenario:${JSON.stringify(scenario)},poi:${JSON.stringify(poi)},region:${JSON.stringify(region)},profile:r.art.profile,lodEnabled:r.lodEnabled,
      raf:summarize(frameTimes),layerUpdate:summarize(updates),renderSubmitCpu:summarize(submits),drawCalls:r.gpu.info.render.calls,triangles:r.gpu.info.render.triangles,
      categoryTriangles,categoryInstances,logicalCounts,instances:Object.values(categoryInstances).reduce((sum,count)=>sum+count,0),layerStats,
      visiblePlanes:visible.map(s=>s.plane),regionAudit,resources:{...r.gpu.info.memory,programs:r.gpu.info.programs.length},programStatus:r.gpu.info.programs.map(p=>({name:p.name||null,runnable:p.diagnostics?.runnable??p.runnable??null})),gpu:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),glError:gl.getError(),viewport:[innerWidth,innerHeight],dpr:r.gpu.getPixelRatio()};
  `, { timeoutMs: 180000 });
}
async function worldDigest() { return page('return window.__m2c2a.snapshotDigest(window.inkbox);'); }
async function verifyIdentity() {
  const setup=await page(`
    const k=window.inkbox,r=k.render3d.renderer,{deriveEntities}=await import('./src/inkbox/render3d/entities/deriveEntities.js');r.setArtProfile('pilot');r.setLODEnabled(true);
    const preferred=await window.__m2c2a.applyVisibleCamera(r,'ENTITY_MEDIUM');
    const candidates=deriveEntities(k.world).cultivator.map(entity=>{let pair=null;for(const village of k.world.villages||[])for(const house of village.houses||[]){const distance=Math.hypot(entity.x-house.x,entity.y-house.y);if(!pair||distance<pair.distance)pair={house,distance};}return {entity,pair};}).filter(value=>value.pair&&value.pair.distance>=5&&value.pair.distance<=20).sort((a,b)=>Math.abs(a.pair.distance-10)-Math.abs(b.pair.distance-10)||a.entity.id-b.entity.id);
    const preferredIndex=candidates.findIndex(value=>value.entity.id===preferred.poi?.id);if(preferredIndex>0)candidates.unshift(...candidates.splice(preferredIndex,1));return {preferredCamera:preferred.recipe,candidates:candidates.slice(0,10).map(value=>({entity:value.entity,pair:value.pair,preferred:value.entity.id===preferred.poi?.id}))};
  `, { timeoutMs: 180000 });
  await page(`window.__verifyRenderedEntityLOD=async function(id,wantedLod,preferredCamera,diagnosticOnly){
    const T=await import('three'),k=window.inkbox,r=k.render3d.renderer,stage=r.stages.get('mortal'),ray=new T.Raycaster(),entity=stage.entities.lastDerived.cultivator.find(value=>value.id===id),ancestorsVisible=o=>{for(let p=o;p;p=p.parent)if(!p.visible)return false;return true;};if(!entity)throw new Error('deriveEntities record absent: '+id);
    const surfaceHit=(mesh,instance)=>{const g=mesh.geometry,p=g.attributes.position,index=g.index,triangles=Math.floor((index?.count??p.count)/3),samples=Math.min(4,triangles),im=new T.Matrix4(),wm=new T.Matrix4(),points=[];mesh.getMatrixAt(instance,im);wm.multiplyMatrices(mesh.matrixWorld,im);for(let sample=0;sample<samples;sample++){const triangle=samples===triangles?sample:Math.floor(sample*(triangles-1)/Math.max(1,samples-1)),ids=index?[index.getX(triangle*3),index.getX(triangle*3+1),index.getX(triangle*3+2)]:[triangle*3,triangle*3+1,triangle*3+2],point=new T.Vector3().fromBufferAttribute(p,ids[0]).add(new T.Vector3().fromBufferAttribute(p,ids[1])).add(new T.Vector3().fromBufferAttribute(p,ids[2])).multiplyScalar(1/3).applyMatrix4(wm),projected=point.clone().project(r.cameraRig.camera);if(Math.abs(projected.x)>.94||Math.abs(projected.y)>.94||projected.z< -1||projected.z>1)continue;const pixel=[(projected.x+1)*r.width/2,(1-projected.y)*r.height/2];ray.setFromCamera(new T.Vector2(projected.x,projected.y),r.cameraRig.camera);const boundBefore=mesh.boundingSphere?{center:mesh.boundingSphere.center.toArray(),radius:mesh.boundingSphere.radius}:null,self=ray.intersectObject(mesh,false).find(hit=>hit.instanceId===instance);let repairedSelf=null,repairedFirst=null,repairedPick=null;if(diagnosticOnly&&!self){mesh.boundingSphere=null;repairedSelf=ray.intersectObject(mesh,false).find(hit=>hit.instanceId===instance)||null;if(repairedSelf){repairedFirst=ray.intersectObjects(r.scene.children,true).find(hit=>ancestorsVisible(hit.object))||null;repairedPick=r.pick(...pixel)||null;}}const first=self?ray.intersectObjects(r.scene.children,true).find(hit=>ancestorsVisible(hit.object)):null,pick=r.pick(...pixel),candidate={triangle,pixel,worldPoint:point.toArray(),boundBefore,selfInstance:self?.instanceId??null,frontObject:first?.object?.name||null,frontInstance:first?.instanceId??null,pick:pick?{entityId:pick.entityId,plane:pick.plane,kind:pick.kind}:null,repairedBoundRadius:mesh.boundingSphere?.radius??null,repairedSelfInstance:repairedSelf?.instanceId??null,repairedFrontObject:repairedFirst?.object?.name||null,repairedFrontInstance:repairedFirst?.instanceId??null,repairedPick:repairedPick?{entityId:repairedPick.entityId,plane:repairedPick.plane,kind:repairedPick.kind}:null};points.push(candidate);if((first?.object===mesh&&first.instanceId===instance&&pick?.entityId===id)||(repairedFirst?.object===mesh&&repairedFirst.instanceId===instance&&repairedPick?.entityId===id))return {matched:candidate,points};}return {matched:null,points};};
    const zooms=diagnosticOnly?(wantedLod===0?[18,14]:[10,8,6,4]):(wantedLod===0?[18,14,10]:[10,8,6,4,2,1,.5]),yaws=diagnosticOnly?[preferredCamera?.yaw,.2].filter(Number.isFinite):[preferredCamera?.yaw,.2,3.34].filter(Number.isFinite),polars=diagnosticOnly?[preferredCamera?.polar].filter(Number.isFinite):[preferredCamera?.polar,.65].filter(Number.isFinite),attempts=[];
    for(const zoom of [...new Set(zooms)])for(const yaw of [...new Set(yaws)])for(const polar of [...new Set(polars)]){window.__m2c2a.applyCamera(r,'ENTITY_MEDIUM',{poi:{x:entity.x,y:entity.y,id,source:'deriveEntities real cultivator near house'},polar,yaw,zoom});await new Promise(requestAnimationFrame);r.update(1/60);r.render();r.scene.updateMatrixWorld(true);r.cameraRig.camera.updateMatrixWorld(true);const owners=[];stage.entities.group.traverse(mesh=>{if(!mesh.isInstancedMesh||mesh.userData.lod!==wantedLod||!mesh.visible||!ancestorsVisible(mesh))return;for(let i=0;i<(mesh.userData.renderEntities||[]).length;i++)if(mesh.userData.renderEntities[i]?.id===id)owners.push({mesh,index:i});});const samples=[];for(const owner of owners){const result=surfaceHit(owner.mesh,owner.index);samples.push({mesh:owner.mesh.name,instance:owner.index,...result});if(result.matched)return {ok:true,id,wantedLod,pickedEntityId:id,mesh:owner.mesh.name,instance:owner.index,zoom,yaw,polar,surface:result.matched,counts:[...stage.entities.stats.lod]};}attempts.push({zoom,yaw,polar,owners:owners.map(owner=>({mesh:owner.mesh.name,instance:owner.index})),samples,counts:[...stage.entities.stats.lod]});}return {ok:false,id,wantedLod,attempts};
  };return true;`, { timeoutMs: 180000 });
  const diagnosticOnly=process.env.INKBOX_IDENTITY_ONLY==='1',failures=[],candidateLimit=diagnosticOnly?1:10;for(const candidate of setup.candidates.slice(0,candidateLimit)){const levels=[];for(const lod of [0,1]){const result=await page(`return window.__verifyRenderedEntityLOD(${candidate.entity.id},${lod},${JSON.stringify(setup.preferredCamera)},${diagnosticOnly});`, { timeoutMs: 180000 });if(!result.ok){failures.push({id:candidate.entity.id,distanceToHouse:candidate.pair.distance,failedLOD:lod,attempts:result.attempts});break;}levels.push(result);}if(levels.length===2)return {entityId:candidate.entity.id,x:candidate.entity.x,y:candidate.entity.y,kind:'cultivator',level:candidate.entity.level,nearestHouse:candidate.pair.house,distanceToHouse:candidate.pair.distance,source:'deriveEntities cultivator 5-20 cells from real house; all visible GLB modules and Host.pick confirmed at LOD0/1',preferredByApplyVisibleCamera:candidate.preferred,levels};}
  throw new Error('No nearby cultivator passed real GLB foreground and Host.pick at LOD0+LOD1: '+JSON.stringify(failures));
}
async function visibleL0TreePoi() {
  return page(`
    const T=await import('three'),r=window.inkbox.render3d.renderer,w=window.inkbox.world;
    const {deriveVegetation}=await import('./src/inkbox/render3d/vegetation/deriveVegetation.js');
    const trees=deriveVegetation(w),tile=16,cols=Math.ceil(w.w/tile),counts=new Uint32Array(cols*Math.ceil(w.h/tile));
    for(const t of trees)counts[Math.floor(t.y/tile)*cols+Math.floor(t.x/tile)]++;
    const tiles=[...counts.keys()].sort((a,b)=>counts[b]-counts[a]).slice(0,2),ray=new T.Raycaster();
    const ancestorsVisible=o=>{for(let p=o;p;p=p.parent)if(!p.visible)return false;return true;};
    const surfaceHit=(mesh,instance)=>{
      const geometry=mesh.geometry,position=geometry.attributes.position,index=geometry.index,triangleCount=Math.floor((index?.count??position.count)/3),instanceMatrix=new T.Matrix4(),worldMatrix=new T.Matrix4();
      mesh.getMatrixAt(instance,instanceMatrix);worldMatrix.multiplyMatrices(mesh.matrixWorld,instanceMatrix);
      const pointAt=(triangle)=>{const ids=index?[index.getX(triangle*3),index.getX(triangle*3+1),index.getX(triangle*3+2)]:[triangle*3,triangle*3+1,triangle*3+2];const a=new T.Vector3().fromBufferAttribute(position,ids[0]),b=new T.Vector3().fromBufferAttribute(position,ids[1]),c=new T.Vector3().fromBufferAttribute(position,ids[2]);return a.add(b).add(c).multiplyScalar(1/3).applyMatrix4(worldMatrix);};
      for(let triangle=0;triangle<triangleCount;triangle++){const worldPoint=pointAt(triangle),projected=worldPoint.clone().project(r.cameraRig.camera);if(Math.abs(projected.x)>.9||Math.abs(projected.y)>.9||projected.z< -1||projected.z>1)continue;ray.setFromCamera(new T.Vector2(projected.x,projected.y),r.cameraRig.camera);const first=ray.intersectObjects(r.scene.children,true).find(hit=>ancestorsVisible(hit.object));if(first?.object===mesh&&first.instanceId===instance)return {triangle,worldPoint:worldPoint.toArray(),pixel:[(projected.x+1)*r.width/2,(1-projected.y)*r.height/2],object:first.object.name,instanceId:first.instanceId};}
      return null;
    };
    for(const tileIndex of tiles){
      const tx=tileIndex%cols,ty=Math.floor(tileIndex/cols),x0=tx*tile,y0=ty*tile,x1=Math.min(w.w,x0+tile),y1=Math.min(w.h,y0+tile),tileCells=new Set(trees.filter(t=>Math.floor(t.x/tile)===tx&&Math.floor(t.y/tile)===ty).map(t=>t.cell)),poi={x:(x0+x1-1)/2,y:(y0+y1-1)/2,source:'deriveVegetation densest L0 raster cell'};
      for(const yaw of [.2,1.77,3.34,4.91]){
        window.__m2c2a.applyCamera(r,'WORLD_OVERVIEW',{poi,polar:.65,yaw,zoom:18});
        for(let n=0;n<3;n++)await new Promise(requestAnimationFrame);r.render();
        const stage=r.stages.get('mortal'),items=[];r.scene.updateMatrixWorld(true);r.cameraRig.camera.updateMatrixWorld(true);
        for(const mesh of stage.vegetation.group.children){
          if(mesh.userData.lod!==0||!mesh.visible||!ancestorsVisible(mesh))continue;
          const batch=mesh.userData.renderTrees||[];
          for(let i=0;i<Math.min(mesh.count,batch.length);i++){
            const tree=batch[i];if(!tileCells.has(tree.cell))continue;
            const p=r.coordinates.worldToRender(tree.x,tree.y,stage.elevation.at(tree.x,tree.y)),projected=new T.Vector3(p.x,p.y+tree.size*.75,p.z).project(r.cameraRig.camera);
            const x=(projected.x+1)*r.width/2,y=(1-projected.y)*r.height/2;
            if(Math.abs(projected.x)>.9||Math.abs(projected.y)>.9||projected.z< -1||projected.z>1)continue;
            items.push({mesh,index:i,tree,pixel:[x,y],score:Math.abs(projected.x)+Math.abs(projected.y)});
          }
        }
        items.sort((a,b)=>a.score-b.score);
        for(const candidate of items.slice(0,8)){
          const hit=surfaceHit(candidate.mesh,candidate.index);
          if(hit)return {x:candidate.tree.x,y:candidate.tree.y,cell:candidate.tree.cell,size:candidate.tree.size,rank:candidate.tree.rank,source:'deriveVegetation real tree',selectedRasterTile:[x0,y0,x1,y1],tileTrees:counts[tileIndex],totalTrees:trees.length,proof:{lod:0,mesh:candidate.mesh.name,instance:candidate.index,visibleAncestors:true,screen:hit.pixel,foregroundRayHit:hit},camera:{zoom:18,yaw,polar:.65}};
        }
      }
    }
    throw new Error('No actual visible LOD0 tree instance found in the densest deriveVegetation raster cells');
  `, { timeoutMs: 180000 });
}
async function capturePoiTriplet(verifiedCharacter) {
  await prepareScenario('GOLDEN_A');
  await setMode('pilot', true);
  const recipes=await page(`
    const r=window.inkbox.render3d.renderer,w=window.inkbox.world,a=window.__m2c2a;
    const entity=a.scenarioPoi(w,'entity'),settlement=a.scenarioPoi(w,'settlement');
    return {character:{...entity,source:'deriveEntities real entity'},building:{...settlement,x:settlement.house.x+.5,y:settlement.house.y+.5,targetHouse:settlement.house}};
  `);
  recipes.character={...verifiedCharacter,id:verifiedCharacter.entityId,source:'deriveEntities cultivator whose LOD0 and LOD1 picker identity was proven'};
  recipes.tree=await visibleL0TreePoi();
  const proof=[];
  for(const [kind,poi] of Object.entries(recipes)) for(const [distance,wantedLod] of [['near',0],['mid',1],['far',2]]) {
    let chosen=null;
    for(const zoom of [18,16,14,12,10,8,6,4,3,2,1,.8,.65,.5]) {
      const result=await page(`
        const r=window.inkbox.render3d.renderer,a=window.__m2c2a,poi=${JSON.stringify({id:poi.id,x:poi.x,y:poi.y,source:poi.source||'real-derived-poi'})};
        const T=await import('three'),kind=${JSON.stringify(kind)},wanted=${wantedLod},yaw=${kind==='tree'?(recipes.tree?.camera?.yaw??.25):kind==='character'?(poi.levels[Math.min(wantedLod,1)].yaw):.25},polar=${kind==='tree'?(recipes.tree?.camera?.polar??.65):kind==='character'?(poi.levels[Math.min(wantedLod,1)].polar):.62};
        const stage=r.stages.get('mortal'),group=kind==='tree'?stage.vegetation.group:kind==='character'?stage.entities.group:stage.settlements.group;
        a.applyCamera(r,'WORLD_OVERVIEW',{poi,yaw,polar,zoom:${zoom}});
        for(let i=0;i<3;i++)await new Promise(requestAnimationFrame);r.render();
        if(kind==='building'&&wanted===2){let center=null;group.traverse(mesh=>{const list=mesh.userData.renderSettlements;if(center||!Array.isArray(list))return;center=list.find(item=>item.settlementId===poi.id||item.id===poi.id)||null;});if(!center)return {zoom:${zoom},matches:[],layerStats:stage.settlements.stats,lodTotals:r.getLODStats?.()||null};const cameraPoi={x:center.x,y:center.y,source:'real-settlement-HLOD-centroid',settlementId:center.settlementId};a.applyCamera(r,'WORLD_OVERVIEW',{poi:cameraPoi,yaw,polar,zoom:${zoom}});for(let i=0;i<3;i++)await new Promise(requestAnimationFrame);r.render();}
        const ancestorVisible=o=>{for(let p=o;p;p=p.parent)if(!p.visible)return false;return true;},ray=new T.Raycaster(),matches=[];
        const visibleSurfaceHit=(mesh,instance)=>{
          const geometry=mesh.geometry,position=geometry?.attributes?.position,index=geometry?.index;if(!position)return null;
          const triangleCount=Math.floor((index?.count??position.count)/3),sampleCount=Math.min(96,triangleCount),matrix=new T.Matrix4(),worldMatrix=new T.Matrix4();
          mesh.getMatrixAt(instance,matrix);worldMatrix.multiplyMatrices(mesh.matrixWorld,matrix);
          for(let sample=0;sample<sampleCount;sample++){
            const triangle=sampleCount===triangleCount?sample:Math.floor(sample*(triangleCount-1)/Math.max(1,sampleCount-1));
            const ids=index?[index.getX(triangle*3),index.getX(triangle*3+1),index.getX(triangle*3+2)]:[triangle*3,triangle*3+1,triangle*3+2];
            const point=new T.Vector3().fromBufferAttribute(position,ids[0]).add(new T.Vector3().fromBufferAttribute(position,ids[1])).add(new T.Vector3().fromBufferAttribute(position,ids[2])).multiplyScalar(1/3).applyMatrix4(worldMatrix),projected=point.clone().project(r.cameraRig.camera);
            if(Math.abs(projected.x)>.94||Math.abs(projected.y)>.94||projected.z< -1||projected.z>1)continue;
            ray.setFromCamera(new T.Vector2(projected.x,projected.y),r.cameraRig.camera);
            const first=ray.intersectObjects(r.scene.children,true).find(hit=>ancestorVisible(hit.object));
            if(first?.object===mesh&&first.instanceId===instance)return {first,projected,triangle,worldPoint:point.toArray()};
          }
          return null;
        };
        const settlementId=${JSON.stringify(poi.id)};
        group.traverse(mesh=>{
          if(!mesh.isInstancedMesh||!Number.isInteger(mesh.userData.lod))return;
          const keys=kind==='tree'?['renderTrees']:kind==='character'?['renderEntities']:wanted===2?['renderSettlements']:['renderBuildings'];
          for(const key of keys){const list=mesh.userData[key];if(!Array.isArray(list))continue;for(let i=0;i<Math.min(mesh.count,list.length);i++){
            const item=list[i],source=item?.source&&typeof item.source==='object'?item.source:item;
            const same=kind==='character'?item.id===settlementId:kind==='tree'?item.cell===${poi.cell}:wanted===2?(item.settlementId===settlementId||item.id===settlementId||item.members?.some(member=>member?.settlementId===settlementId||member?.villageId===settlementId||member?.village?.id===settlementId)):(Math.abs(source.x-${poi.x})<.01&&Math.abs(source.y-${poi.y})<.01);
            if(!same||mesh.userData.lod!==wanted||!mesh.visible||!ancestorVisible(mesh))continue;
            let wx=source.x,wy=source.y;
            if(wanted===2&&kind==='building'){wx=item.x;wy=item.y;}
            if(!Number.isFinite(wx)||!Number.isFinite(wy))continue;
            const surface=visibleSurfaceHit(mesh,i);if(!surface)continue;
            const {first,projected}=surface;
            let pick=null;if(kind==='character')pick=r.pick((projected.x+1)*r.width/2,(1-projected.y)*r.height/2);
            if(kind==='building'&&wanted===2)pick=r.pick((projected.x+1)*r.width/2,(1-projected.y)*r.height/2);
            if(!pick||(kind==='character'?pick.entityId===settlementId:kind==='building'&&wanted===2?pick.kind==='settlement'&&pick.settlementId===settlementId:true))matches.push({lod:mesh.userData.lod,mesh:mesh.name,instance:i,visible:true,pixel:[(projected.x+1)*r.width/2,(1-projected.y)*r.height/2],foregroundRay:{object:first.object.name,instanceId:first.instanceId,triangle:surface.triangle,worldPoint:surface.worldPoint},pick:pick?{kind:pick.kind,entityId:pick.entityId,settlementId:pick.settlementId}:null,hlod:!!mesh.userData.hlod,item:{id:item.id,settlementId:item.settlementId,cell:source.cell,x:wx,y:wy,members:item.members?.length||0}});
          }
          }
        });
        const layer=${JSON.stringify(kind)}==='tree'?stage.vegetation:${JSON.stringify(kind)}==='character'?stage.entities:stage.settlements;
        return {zoom:${zoom},matches,layerStats:layer.stats,lodTotals:r.getLODStats?.()||null};
      `, { timeoutMs: 180000 });
      const match=result.matches.find(item=>item.visible);
      if(match?.lod===wantedLod){chosen={...result,match,wantedLod};break;}
    }
    assert(chosen, `${kind}/${distance}: could not prove an in-frame foreground real batch identity at legal zoom for LOD${wantedLod}`);
    const finalPoi=kind==='building'&&wantedLod===2?{x:chosen.match.item.x,y:chosen.match.item.y,source:'real-settlement-HLOD-centroid',settlementId:poi.id}:{x:poi.x,y:poi.y,source:poi.source||'real-derived-poi'};
    await page(`const r=window.inkbox.render3d.renderer,a=window.__m2c2a;a.applyCamera(r,'WORLD_OVERVIEW',{poi:${JSON.stringify(finalPoi)},yaw:${kind==='tree'?(poi.camera?.yaw??.25):kind==='character'?poi.levels[Math.min(wantedLod,1)].yaw:.25},polar:${kind==='tree'?(poi.camera?.polar??.65):kind==='character'?poi.levels[Math.min(wantedLod,1)].polar:.62},zoom:${chosen.zoom}});for(let i=0;i<3;i++)await new Promise(requestAnimationFrame);r.render();return true;`);
    await browser.screenshot(path.join(release, `${kind}-${distance}-pilot-lod.png`));
    proof.push({kind,distance,poi,zoom:chosen.zoom,mesh:chosen.match,layerStats:chosen.layerStats,lodTotals:chosen.lodTotals});
  }
  fs.writeFileSync(path.join(release,'poi-lod-screenshots.json'),JSON.stringify({generatedAt:new Date().toISOString(),world:'GOLDEN_A',proof},null,2));
  evidence.poiLodScreenshots=proof;
}

try {
  fs.mkdirSync(output, { recursive: true }); fs.mkdirSync(release, { recursive: true });
  const executable = findEdge(); assert(executable, 'Microsoft Edge is required');
  server = startServer(); if (server) await waitServer();
  browser = await launch({ url: pageURL, browser: executable, width: 1500, height: 940, gpu: true, timeoutMs: 30000 });
  assert(await browser.waitFor('return !!window.inkbox?.render3d?.renderer?.stages?.size', { timeoutMs: 60000 }), `Render3D failed to boot: ${browser.errors().join(' | ')}`);
  await page(`const r=window.inkbox.render3d.renderer;await r.characterLoadPromise;if(r.characterLoadError)throw r.characterLoadError;window.__m2c2a=await import('./src/inkbox/render3d/art/VisualScenarios.js');return true;`);
  evidence.environment = await page(`const r=window.inkbox.render3d.renderer,g=r.gpu.getContext(),e=g.getExtension('WEBGL_debug_renderer_info');return {browser:navigator.userAgent,version:${JSON.stringify(browser.meta.browser)},gpu:e?g.getParameter(e.UNMASKED_RENDERER_WEBGL):g.getParameter(g.RENDERER),viewport:[innerWidth,innerHeight],pixelRatio:r.gpu.getPixelRatio(),gpuTimerQuery:!!(g.getExtension('EXT_disjoint_timer_query_webgl2')||g.getExtension('EXT_disjoint_timer_query'))};`);
  evidence.sourceHashes = Object.fromEntries(jsFiles.map(f => [f, shaFile(path.join(root, f))]));
  evidence.renderSourceHash = renderSourceDigest();
  evidence.provenance = { visualScenarios: 'src/inkbox/render3d/art/VisualScenarios.js', worldDigest: 'snapshotDigest serializes full world and advanceState', timing: `rAF intervals and CPU host.render() submission; ${samples} samples`, gpuTiming: 'GPU time unavailable unless timer-query extension exists; no GPU query is issued' };
  const scenarios = process.env.INKBOX_IDENTITY_ONLY === '1' || process.env.INKBOX_POI_ONLY === '1' ? [] : [
    { name: 'GOLDEN_A', camera: 'WORLD_OVERVIEW', screenshot: true },
    { name: 'DENSITY_A', camera: 'WORLD_OVERVIEW' },
    { name: 'DENSITY_A', camera: 'forest-stress' },
    { name: 'DENSITY_A', camera: 'upper-window' },
    { name: 'DENSITY_A', camera: 'nether-window' },
  ];
  const lodSavings = [];
  let densityPilotNoLodTriangles = null;
  for (const item of scenarios) {
    const spec = await prepareScenario(item.name);
    const poi = item.camera === 'forest-stress' ? await forestPoi() : null;
    const region = item.camera === 'upper-window' ? await setupRealm('upper') : item.camera === 'nether-window' ? await setupRealm('nether') : null;
    if (region) {
      assert(region.visiblePlanes.includes('mortal') && region.visiblePlanes.includes(region.targetPlane), `${region.targetPlane}: both mortal and target plane should be visible`);
      assert(region.regionChecks.every(x => x.shared), `${region.targetPlane}: layers must share stage RegionGeometry`);
      assert(region.regionChecks.find(x=>x.plane===region.targetPlane)?.essentialLayers, `${region.targetPlane}: target terrain and entities layers must be present`);
      assert(region.regionChecks.find(x=>x.plane==='mortal')?.inside === false, 'Mortal RegionGeometry must submit outside the window');
      assert(region.regionChecks.find(x=>x.plane===region.targetPlane)?.inside === true, 'Realm RegionGeometry must submit inside the window');
    }
    if (poi) {
      assert(poi.trees > poi.meanTreesPerTile, 'Forest stress POI is not denser than the deriveVegetation raster mean');
      await page(`const r=window.inkbox.render3d.renderer;window.__m2c2a.applyCamera(r,'WORLD_OVERVIEW',{poi:${JSON.stringify(poi)},zoom:9});return true;`);
    } else if (!region) await page(`window.__m2c2a.applyCamera(window.inkbox.render3d.renderer,'WORLD_OVERVIEW');return true;`);
    const digestBefore = await worldDigest();
    const rows = [];
    for (const [profile, lod] of [['baseline', false], ['pilot', false], ['pilot', true]]) {
      const label = `${profile === 'baseline' ? 'baseline' : lod ? 'pilot-lod' : 'pilot-no-lod'}`;
      await setMode(profile, lod);
      const sample = await collectSample(label, `${item.name}:${item.camera}`, poi, region);
      assert.equal(sample.glError, 0, `${label} GL error ${sample.glError}`);
      assert(sample.programStatus.every(p=>p.runnable!==false), `${label} contains an unlinked shader program`);
      assert(sample.visiblePlanes.includes('mortal'), `${label} mortal stage missing`);
      if (region) assert(sample.visiblePlanes.includes(region.targetPlane), `${label} realm stage missing`);
      if (region) {
        assert(sample.regionAudit.length===2&&sample.regionAudit.every(x=>x.shared), `${label} layers do not share the stage RegionGeometry`);
        assert(sample.regionAudit.every(x=>Object.values(x.leaks).every(n=>n===0)), `${label} submitted instance crossed the Region mask: ${JSON.stringify(sample.regionAudit)}`);
      }
      for (const [plane, layers] of Object.entries(sample.layerStats)) for (const [category, stats] of Object.entries(layers)) {
        statsShape(stats, `${plane}.${category}`);
      }
      if (!region) assert(sample.drawCalls <= 20, `${item.name}/${item.camera}: ordinary view draw calls ${sample.drawCalls} exceed 20`);
      if (region) {
        assert(sample.drawCalls <= 40, `${item.name}/${item.camera}: realm window draw calls ${sample.drawCalls} exceed the bounded 40-call budget`);
        assert(densityPilotNoLodTriangles !== null, 'Realm triangle budget needs the earlier DENSITY_A pilot-no-lod reference');
        sample.realmTriangleRatio = densityPilotNoLodTriangles ? sample.triangles / densityPilotNoLodTriangles : 0;
        assert(sample.realmTriangleRatio <= 2, `${item.name}/${item.camera}: realm submission is over 2x the full DENSITY_A mortal pilot-no-lod view`);
      }
      if (item.name === 'DENSITY_A' && item.camera === 'WORLD_OVERVIEW' && label === 'pilot-no-lod') densityPilotNoLodTriangles = sample.triangles;
      const after = await worldDigest(); assert.equal(after.value, digestBefore.value, `${label} changed the full World / advanceState digest`);
      rows.push(sample); evidence.cases.push({ spec, ...sample, worldDigest: digestBefore });
      const filename = `${item.name}-${item.camera}-${label}.png`;
      await browser.screenshot(path.join(output, filename));
      if (item.name === 'GOLDEN_A' && item.camera === 'WORLD_OVERVIEW') await browser.screenshot(path.join(release, `golden-overview-${label}.png`));
      console.log(`${item.name}/${item.camera}/${label}: ${sample.drawCalls} draws, ${sample.triangles} triangles, rAF p95 ${sample.raf.p95Ms.toFixed(2)} ms`);
    }
    const noLod = rows[1], withLod = rows[2];
    assert.deepEqual(noLod.logicalCounts, rows[0].logicalCounts, `${item.name}/${item.camera}: Pilot changed submitted logical counts`);
    assert.deepEqual(withLod.logicalCounts, noLod.logicalCounts, `${item.name}/${item.camera}: LOD deleted logical presentation records`);
    const reduction = noLod.triangles ? 1 - withLod.triangles / noLod.triangles : 0;
    lodSavings.push({ scenario: `${item.name}:${item.camera}`, pilotNoLodTriangles: noLod.triangles, pilotLodTriangles: withLod.triangles, reduction });
    if (item.name === 'GOLDEN_A' && item.camera === 'WORLD_OVERVIEW') assert(reduction >= 0.35, `GOLDEN_A overview pilot LOD triangles must fall by at least 35% (got ${(reduction*100).toFixed(1)}%)`);
  }
  evidence.lodSavings = lodSavings;
  evidence.realmBudget = { drawCallsPerViewMaximum: 40, trianglesAtMostMultiplierOfDensityMortalPilotNoLod: 2, explanation: 'A realm window submits mortal outside-region plus one target-plane inside-region through the shared RegionGeometry; the bounds allow both stage partitions and the boundary while preventing unbounded batch/draw growth.' };
  const identityScenario = await prepareScenario('GOLDEN_A');
  await setMode('pilot', true);
  evidence.pickerIdentity = await verifyIdentity();
  const identityDigest = await worldDigest();
  assert(identityDigest.value, 'Full world digest missing');
  if (process.env.INKBOX_IDENTITY_ONLY === '1') evidence.probeOnly='picker identity diagnostic; full matrix intentionally skipped';
  else {if(process.env.INKBOX_POI_ONLY==='1')evidence.probeOnly='real POI screenshot diagnostic; full matrix intentionally skipped';await capturePoiTriplet(evidence.pickerIdentity);}
  evidence.diagnostics = browserDiagnostics();
  evidence.errors = [...evidence.diagnostics.consoleErrors, ...evidence.diagnostics.runtimeErrors];
  assert.deepEqual(evidence.errors, [], 'Browser console/runtime/shader errors');
  evidence.finalWorldDigest = identityDigest; evidence.pass = true;
} catch (error) {
  evidence.failure = error.stack || String(error); evidence.diagnostics = browser ? browserDiagnostics() : { consoleErrors: [], runtimeErrors: [] };
  evidence.errors = [...evidence.errors, ...evidence.diagnostics.consoleErrors, ...evidence.diagnostics.runtimeErrors];
  process.exitCode = 1; console.error(error.stack || error);
} finally {
  evidence.finishedAt = new Date().toISOString();
  fs.writeFileSync(path.join(output, 'browser-matrix.json'), JSON.stringify(evidence, null, 2));
  await browser?.close();
  if (server && server.exitCode === null) { server.kill(); await sleep(250); }
}
