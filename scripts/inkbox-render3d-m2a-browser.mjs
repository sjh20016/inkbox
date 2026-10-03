#!/usr/bin/env node
// Render3D M2-A browser evidence collector. Uses the repository's zero-dependency CDP driver.
import fs from 'node:fs';
import path from 'node:path';
import { launch, sleep, findBrowser } from './cdp.mjs';

const BASE = process.env.INKBOX_URL || 'http://127.0.0.1:4180/inkbox.html';
const URL = `${BASE}${BASE.includes('?') ? '&' : '?'}renderer=3d`;
const OUT = path.resolve(process.env.INKBOX_REPORT_DIR || 'reports/release/render3d-m2a');
const SEED = 20260929;
const FRAME_COUNT = Number(process.env.INKBOX_M2A_FRAMES || 60);
const GPU_REQUESTED = true;
const EDGE = findBrowser([
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
].filter(Boolean));
if (!EDGE) throw new Error('M2-A 浏览器验收需要本机 Microsoft Edge。');
fs.mkdirSync(OUT, { recursive: true });

const evidence = {
  generatedAt: new Date().toISOString(),
  stage: 'Render3D M2-A browser evidence',
  request: { url: URL, browser: 'Microsoft Edge', worldPreset: 'small', seed: SEED, frameCount: FRAME_COUNT, gpuFlag: GPU_REQUESTED },
  environment: {},
  world: {},
  screenshots: [],
  planes: {},
  masks: {},
  picking: {},
  slab: {},
  runtimeErrors: [],
  pickingOracle: {
    version: 2,
    geometry: 'visible terrain + entities + M2-B realm boundary; independent Three.Raycaster',
    boundaryDecoder: 'faceIndex / 2 -> edgeNodes midpoint; no PlanePicker/edgeAtTriangle call',
    assertions: 'unchanged 80 samples/plane, four poses, 32 interior + 32 exterior + 16 boundary; boundary identity, point and distance also required',
  },
};

const session = await launch({ url: URL, browser: EDGE, width: 1500, height: 940, gpu: GPU_REQUESTED });
const output = (name) => path.join(OUT, name);
const capture = async (name, metadata = {}) => {
  const file = output(name);
  await session.screenshot(file);
  evidence.screenshots.push({ file: path.relative(process.cwd(), file).replaceAll('\\', '/'), ...metadata });
  console.log(`  screenshot ${name}`);
};

try {
  const ready = await session.waitFor('return !!window.inkbox?.render3d?.renderer?.stages?.size', { timeoutMs: 60000 });
  if (!ready) throw new Error(`Render3D 未就绪：${session.errors().slice(0, 4).join(' | ')}`);

  evidence.environment = await session.js(`
    const r = window.inkbox.render3d.renderer, gl = r.gpu.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return {
      browser: navigator.userAgent,
      gpuRenderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
      gpuVendor: ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
      webglVersion: gl.getParameter(gl.VERSION), shadingLanguage: gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
      viewport: [innerWidth, innerHeight], canvasCss: [r.width, r.height], canvasPixels: [r.canvas.width, r.canvas.height],
      dpr: devicePixelRatio, pixelRatioUsed: r.gpu.getPixelRatio(),
      threeRuntimeUrl: performance.getEntriesByType('resource').find(e => /three\\.module\\.js$/.test(e.name))?.name || null,
    };
  `);
  evidence.environment.softwareRasterizer = /basic render|swiftshader|llvmpipe|software|mesa offscreen/i.test(String(evidence.environment.gpuRenderer));
  evidence.environment.realGpu = !evidence.environment.softwareRasterizer;
  console.log(`GPU ${evidence.environment.gpuRenderer} (${evidence.environment.softwareRasterizer ? 'software' : 'hardware/unknown'})`);

  await session.js(`return (async () => {
    const s = window.inkbox;
    s.newWorld('small', ${SEED}); s.speedIndex = 0;
    // Flush generated spawn jobs through the real simulation entry point.
    s.advanceDays(10);
    const { spawnNetherGhost } = await import('./src/inkbox/sim/netherLife.js');
    for (let i = 0; i < 48; i++) spawnNetherGhost(s.world.nether, { kind: i % 4 ? 'ghost' : 'cultivator' });
    return true;
  })()`);
  if (!(await session.waitFor('return window.inkbox.render3d.renderer.world === window.inkbox.world', { timeoutMs: 30000 }))) {
    throw new Error('确定性 small world 未切换到 Render3D');
  }
  await sleep(700);

  evidence.world = await session.js(`
    const s = window.inkbox, r = s.render3d.renderer;
    return {
      preset: s.presetKey, seed: s.seed, dimensions: [s.world.w, s.world.h], paused: s.speedIndex === 0,
      planeCounts: Object.fromEntries([...r.stages].map(([name, stage]) => [name, {
        terrain: !!stage.terrain, entities: stage.world.entities?.length ?? 0,
        submittedEntityInstances: stage.entities?.stats.instances ?? 0,
        terrainVertices: stage.terrain?.geometry.attributes.position.count ?? 0,
      }])),
    };
  `);
  await session.js(`
    window.__m2aBufferBytes = (stage) => {
      const geometries = new Set(); let geometryBytes = 0, instancedBytes = 0;
      stage.root.traverse(object => {
        if (object.geometry && !geometries.has(object.geometry)) {
          geometries.add(object.geometry);
          for (const attribute of Object.values(object.geometry.attributes || {})) geometryBytes += attribute.array?.byteLength || 0;
          geometryBytes += object.geometry.index?.array?.byteLength || 0;
        }
        if (object.isInstancedMesh) instancedBytes += (object.instanceMatrix?.array?.byteLength || 0) + (object.instanceColor?.array?.byteLength || 0);
      });
      const snapshots = stage.bridge?.snapshots || {};
      const bridgeSnapshotBytes = Object.values(snapshots).reduce((n, array) => n + (array?.byteLength || 0), 0);
      return { geometryAttributeAndIndexBytes: geometryBytes, instanceMatrixBytes: instancedBytes,
        bridgeSnapshotBytes, totalTypedArrayBytes: geometryBytes + instancedBytes + bridgeSnapshotBytes };
    };
    return true;
  `);

  const markers = await session.js(`return (async () => {
    const THREE = await import('three');
    const { surfaceElevation } = await import('./src/inkbox/render3d/terrain/VisualElevation.js');
    const r = window.inkbox.render3d.renderer, w = window.inkbox.world;
    const x = Math.floor(w.w * 0.5), y = Math.floor(w.h * 0.5);
    const geometry = new THREE.TorusGeometry(1.15, 0.22, 6, 20);
    const material = new THREE.MeshBasicMaterial({ color: '#c43c32', depthTest: false, transparent: true, opacity: 0.98 });
    const mounted = [];
    for (const [plane, stage] of r.stages) {
      const marker = new THREE.Mesh(geometry, material);
      marker.rotation.x = Math.PI / 2; marker.renderOrder = 1000;
      const p = r.coordinates.cellToRender(x, y);
      marker.position.set(p.x, surfaceElevation(stage.world, x, y) + 1.4, p.z);
      marker.name = 'M2A-debug-same-coordinate-marker';
      stage.root.add(marker); mounted.push(marker);
    }
    return { x, y, stageHeights: Object.fromEntries([...r.stages].map(([name, stage]) => [name, surfaceElevation(stage.world, x, y)])), mounted: mounted.length };
  })()`);
  evidence.world.debugMarker = markers;

  const camera = async ({ yaw = 0, polar = Math.PI / 4, zoom = 1, panX = 0, panZ = 0 }) => session.js(`
    const r = window.inkbox.render3d.renderer, rig = r.cameraRig, w = window.inkbox.world;
    const distance = Math.max(w.w, w.h) * 2.15;
    rig.controls.target.set(${panX}, 0, ${panZ});
    rig.camera.position.set(${panX} + Math.sin(${yaw}) * distance * Math.sin(${polar}),
      Math.cos(${polar}) * distance, ${panZ} + Math.cos(${yaw}) * distance * Math.sin(${polar}));
    rig.camera.zoom = ${zoom}; rig.camera.updateProjectionMatrix(); rig.controls.update(); rig.camera.updateMatrixWorld(true);
    return { position: rig.camera.position.toArray(), target: rig.controls.target.toArray(), zoom: rig.camera.zoom };
  `);
  const cameraPoses = [
    { name: 'overhead', yaw: 0, polar: 0.16, zoom: 1 },
    { name: 'oblique-45', yaw: 0, polar: Math.PI / 4, zoom: 1 },
    { name: 'low-angle', yaw: 0, polar: 1.16, zoom: 1.08 },
    { name: 'yaw-pan-zoom', yaw: 2.28, polar: Math.PI / 4, zoom: 0.88, panX: 10, panZ: -7 },
  ];

  // Same cross-plane debug marker and one camera for the three resident stages.
  await camera(cameraPoses[1]);
  const setMask = async (target, fraction) => session.js(`
    const s = window.inkbox, r = s.render3d.renderer, w = s.world;
    const width = Math.max(8, Math.min(w.w - 4, Math.round(w.w * Math.sqrt(${fraction}))));
    const height = Math.max(8, Math.min(w.h - 4, Math.round(w.h * Math.sqrt(${fraction}))));
    const x0 = Math.floor((w.w - width) / 2), y0 = Math.floor((w.h - height) / 2), x1 = x0 + width, y1 = y0 + height;
    s.speedIndex = 0; s.selectTool('${target === 'upper' ? 'viewUpper' : 'viewNether'}');
    s.selection = { x0, y0, x1, y1, area: width * height, path: [[x0,y0],[x1,y0],[x1,y1],[x0,y1]] };
    const planeSelect=document.querySelector('#inkRender3DTools [aria-label="调试位面"]');
    planeSelect.value='mortal'; planeSelect.dispatchEvent(new Event('change',{bubbles:true}));
    r.setRealmViewState(s.getRealmViewState());
    return { target: '${target}', region: { x0,y0,x1,y1,width,height }, requestedFraction: ${fraction}, actualFraction: width*height/(w.w*w.h) };
  `);
  const closeView = async () => session.js(`
    const s = window.inkbox, r = s.render3d.renderer, select=document.querySelector('#inkRender3DTools [aria-label="调试位面"]');
    s.selectTool('inspect'); select.value='mortal'; select.dispatchEvent(new Event('change',{bubbles:true}));
    r.setRealmViewState(s.getRealmViewState()); return true;
  `);
  const maskState = async () => session.js(`
    const r = window.inkbox.render3d.renderer;
    const stageInfo = stage => ({ visible: stage.visible, terrainVisible: !!stage.terrain?.mesh.visible,
      indexBufferTriangles: Math.floor((stage.terrain?.geometry.index?.count || 0) / 3),
      submittedTriangles: Math.floor((stage.terrain?.geometry.drawRange.count ?? (stage.terrain?.geometry.index?.count || 0)) / 3),
      entities: stage.entities?.stats.instances ?? 0 });
    return { open: r.realmPrototype.open, targetPlane: r.realmPrototype.targetPlane, activePlane: r.activePlane,
      residentPlanes: [...r.stages.keys()], visiblePlanes: [...r.stages].filter(([,s])=>s.visible).map(([p])=>p),
      updatedPlanes: [...(r.updatedPlanes || [])], stages: Object.fromEntries([...r.stages].map(([p,s])=>[p,stageInfo(s)])),
      drawCalls: r.gpu.info.render.calls, triangles: r.gpu.info.render.triangles,
      memory: { ...r.gpu.info.memory }, typedArrayBytes: Object.fromEntries([...r.stages].map(([p,s])=>[p,window.__m2aBufferBytes(s)])),
      typedArrayEstimateNote:'CPU-side typed-array byte estimate only; excludes driver allocations and is not VRAM',
      profile: { ...r.profile }, updateMs: r.updateMs };
  `);
  const changeAndMeasureOpen = async (target, repeat) => {
    await closeView(); await session.js('return new Promise(requestAnimationFrame)');
    const opening = await session.js('return performance.now()');
    await setMask(target, 0.2);
    const first = await session.js(`return new Promise(resolve => requestAnimationFrame(() => {
      const r = window.inkbox.render3d.renderer;
      resolve({ wallMs: performance.now(), metric: { ...r.debug.metrics }, state: {
        open:r.realmPrototype.open,targetPlane:r.realmPrototype.targetPlane,visiblePlanes:[...r.stages].filter(([,s])=>s.visible).map(([p])=>p),
        updatedPlanes:[...(r.updatedPlanes||[])], memory:{...r.gpu.info.memory},
        typedArrayBytes:Object.fromEntries([...r.stages].map(([p,s])=>[p,window.__m2aBufferBytes(s)])) } });
    }))`);
    await sleep(120);
    return { target, pass: repeat ? 'repeat-open' : 'first-open',
      firstCompletedFrameMs: first.wallMs - opening, ...first };
  };

  // Measure the first target-plane upload before any target Stage or Mask has
  // been shown. The repeated opening then measures the already resident GPU data.
  evidence.performance = {
    paused: true, frameCount: FRAME_COUNT, conditions: {}, openFrames: {}, gpuRepeatRender: null,
    sceneNote: 'Small seeded world, 10 simulated days, plus 48 nether probe inhabitants; debug rings included.',
  };
  for (const target of ['upper', 'nether']) {
    evidence.performance.openFrames[target] = {
      first: await changeAndMeasureOpen(target, false),
      repeat: await changeAndMeasureOpen(target, true),
    };
    await closeView();
  }
  for (const plane of ['mortal', 'upper', 'nether']) {
    evidence.planes[plane] = await session.js(`
      const r = window.inkbox.render3d.renderer, select=document.querySelector('#inkRender3DTools [aria-label="调试位面"]');
      select.value='${plane}'; select.dispatchEvent(new Event('change',{bubbles:true}));
      return { activePlane: r.activePlane, residentPlanes: [...r.stages.keys()], visiblePlanes: [...r.stages].filter(([,s])=>s.visible).map(([p])=>p) };
    `);
    await sleep(160);
    await capture(`stage-${plane}.png`, { view: 'stage', plane, marker: [markers.x, markers.y], camera: cameraPoses[1].name });
  }

  // Stage/Mask screenshots: top-down, 45°, low angle and altered yaw/pan/zoom.
  for (const target of ['upper', 'nether']) {
    const selection = await setMask(target, 0.2);
    evidence.masks[target] = { screenshotRegion: selection, screenshots: [] };
    for (const pose of cameraPoses) {
      await camera(pose); await sleep(120);
      const name = `mask-${target}-${pose.name}.png`;
      await capture(name, { view: 'mask', target, camera: pose.name, marker: [markers.x, markers.y] });
      evidence.masks[target].screenshots.push(name);
    }
    await closeView();
  }

  // Resident/visible/updated, real submitted triangles, per-layer CPU timings and renderer memory.
  const conditions = [{ target: null, requested: 0 },
    ...['upper', 'nether'].flatMap(target => [0.04, 0.2, 0.4].map(requested => ({ target, requested })))];
  for (const { target, requested } of conditions) {
    const selection = target ? await setMask(target, requested) : (await closeView(), null);
    await camera(cameraPoses[1]); await sleep(180);
    const sample = await session.js(`return (async () => {
      const r = window.inkbox.render3d.renderer, frames=[];
      let previous = await new Promise(requestAnimationFrame);
      for (let i=0; i<${FRAME_COUNT}; i++) { const t=await new Promise(requestAnimationFrame); frames.push({ intervalMs:t-previous, ...r.debug.metrics }); previous=t; }
      const keys=['intervalMs','frameMs','fps','drawCalls','triangles','bridgeScanMs','terrainUpdateMs','waterUpdateMs','vegetationUpdateMs','entityUpdateMs','settlementUpdateMs','markerUpdateMs','layerUpdateMs','renderMs','updateMs'];
      const mean = values => values.length ? values.reduce((a,b)=>a+b,0)/values.length : null;
      const percentile = (values,p) => { if(!values.length)return null; const a=[...values].sort((x,y)=>x-y); return a[Math.min(a.length-1,Math.floor(a.length*p))]; };
      const timing=Object.fromEntries(keys.map(k=>{ const a=frames.map(f=>Number(f[k])).filter(Number.isFinite); return [k,{mean:mean(a),p95:percentile(a,.95),max:a.length?Math.max(...a):null}]; }));
      return { frames:frames.length,timing,last:frames.at(-1),state: {
        residentPlanes:[...r.stages.keys()],visiblePlanes:[...r.stages].filter(([,s])=>s.visible).map(([p])=>p),updatedPlanes:[...(r.updatedPlanes||[])],
        drawCalls:r.gpu.info.render.calls,triangles:r.gpu.info.render.triangles,memory:{...r.gpu.info.memory},
        typedArrayBytes:Object.fromEntries([...r.stages].map(([p,s])=>[p,window.__m2aBufferBytes(s)])),
        typedArrayEstimateNote:'CPU-side typed-array byte estimate only; excludes driver allocations and is not VRAM',
        stages:Object.fromEntries([...r.stages].map(([p,s])=>[p,{terrainTriangles:Math.floor((s.terrain?.geometry.drawRange.count ?? s.terrain?.geometry.index?.count ?? 0)/3),entities:s.entities?.stats.instances??0}])),
        profile:{...r.profile} } };
    })()`);
    const label = target ? `${target}-${Math.round(requested * 100)}pct` : 'closed';
    evidence.performance.conditions[label] = { selection, ...sample };
    console.log(`  perf ${label}: ${sample.timing.intervalMs.mean?.toFixed(2)} ms / ${sample.last?.triangles} tris`);
    await closeView();
  }

  if (evidence.environment.realGpu) {
    await session.js('return new Promise(requestAnimationFrame)');
    evidence.performance.gpuRepeatRender = await session.js(`return (() => {
      const r=window.inkbox.render3d.renderer, gl=r.gpu.getContext(), output={method:'gpu.render repeated N times then gl.finish()',runs:{}};
      for (let n=1;n<=4;n++) {
        const samples=[];
        for(let trial=0;trial<6;trial++) { const start=performance.now(); for(let i=0;i<n;i++) r.gpu.render(r.scene,r.cameraRig.camera); gl.finish(); samples.push(performance.now()-start); }
        const sorted=[...samples].sort((a,b)=>a-b); output.runs['x'+n]={samplesMs:samples,meanMs:samples.reduce((a,b)=>a+b,0)/samples.length,p95Ms:sorted[Math.floor(sorted.length*.95)]};
      }
      return output;
    })()`);
  } else {
    evidence.performance.gpuRepeatRender = { skipped: true, reason: 'renderer identifies a software rasterizer; no hardware-GPU claim recorded' };
  }

  // Slab probe screenshot and geometry stats from the host's actual attached probe.
  await closeView();
  await session.js(`document.querySelector('#inkRender3DTools [data-probe="slab"]').click(); return true;`);
  await camera({ ...cameraPoses[1], zoom: 3 }); await sleep(240);
  evidence.slab = await session.js(`
    const r=window.inkbox.render3d.renderer,p=r.slabProbe;
    return { attached:!!p&&p.root.parent===r.scene, stats:p?.stats||null, region:p?.region||null,
      residentPlanes:[...r.stages.keys()], visiblePlanes:[...r.stages].filter(([,s])=>s.visible).map(([k])=>k),
      mortalTerrainDrawRange:r.stages.get('mortal')?.terrain?.geometry.drawRange,
      drawCalls:r.gpu.info.render.calls,triangles:r.gpu.info.render.triangles,memory:{...r.gpu.info.memory},
      typedArrayBytes:Object.fromEntries([...r.stages].map(([p,s])=>[p,window.__m2aBufferBytes(s)])),
      typedArrayEstimateNote:'CPU-side typed-array byte estimate only; excludes driver allocations and is not VRAM' };
  `);
  await capture('slab-nether-20x20.png', { view: 'slab', target: 'nether', region: evidence.slab.region, stats: evidence.slab.stats });
  await camera({ ...cameraPoses[0], zoom: 3 }); await sleep(120);
  await capture('slab-nether-overhead.png', { view: 'slab', target: 'nether', camera: 'overhead', zoom: 3 });
  await session.js('window.inkbox.render3d.renderer.setSlabProbe(false); return true;');

  // Picking: 80 points per Mask target (32 inside, 32 outside, 16 boundary), across four poses.
  // Oracle is an independent Three.Raycaster over the submitted pickable geometry.
  // M2-B added visible boundary facets: include them without calling PlanePicker or its decoder.
  // Keep every original sample/count/exit assertion; boundary hits require full identity + geometry.
  for (const target of ['upper', 'nether']) {
    const selection = await setMask(target, 0.4); await camera(cameraPoses[1]); await sleep(180);
    const samples = await session.js(`return (async () => {
      const THREE=await import('three'), r=window.inkbox.render3d.renderer, w=window.inkbox.world;
      const {surfaceElevation}=await import('./src/inkbox/render3d/terrain/VisualElevation.js');
      const region=r.realmViewState.region, targetPlane='${target}', poses=${JSON.stringify(cameraPoses)};
      const oracle=new THREE.Raycaster(), rect=r.canvas.getBoundingClientRect();
      const categories={
        interior:Array.from({length:8},(_,i)=>[region.x0+4+(i%4)*Math.max(1,Math.floor(((region.x1-region.x0)-8)/3)),region.y0+4+Math.floor(i/4)*Math.max(1,Math.floor(((region.y1-region.y0)-8)/2))]),
        exterior:Array.from({length:8},(_,i)=>{ const x=[6,w.w-7,6,w.w-7,Math.floor(w.w*.5),Math.floor(w.w*.5),6,w.w-7][i]; const y=[6,6,w.h-7,w.h-7,6,w.h-7,Math.floor(w.h*.5),Math.floor(w.h*.5)][i]; return [x,y]; }),
        boundary:[[region.x0+1,Math.floor((region.y0+region.y1)/2)],[region.x1+1,Math.floor((region.y0+region.y1)/2)],
          [Math.floor((region.x0+region.x1)/2),region.y0+1],[Math.floor((region.x0+region.x1)/2),region.y1+1]],
      };
      const result={targetPlane,region:{x0:region.x0,y0:region.y0,x1:region.x1,y1:region.y1},poses:[],samples:[],summary:{total:0,exact:0,mismatch:0,occluded:0,byCategory:{}}};
      const objects=[]; const owner=new Map();
      for(const [plane,stage] of r.stages){ if(!stage.visible)continue;
        if(stage.terrain?.mesh.visible){ objects.push(stage.terrain.mesh); owner.set(stage.terrain.mesh,stage); }
        stage.entities?.group.traverse(o=>{if(o.isInstancedMesh&&o.visible&&o.count){objects.push(o);owner.set(o,stage);}});
      }
      const boundary=r.boundary;
      if(boundary?.mesh.visible&&boundary.edges) objects.push(boundary.mesh);
      const inside=(x,y)=>region.contains(x+.5,y+.5);
      for(let poseIndex=0;poseIndex<poses.length;poseIndex++){
        const pose=poses[poseIndex],distance=Math.max(w.w,w.h)*2.15, yaw=pose.yaw,polar=pose.polar,panX=pose.panX||0,panZ=pose.panZ||0;
        r.cameraRig.controls.target.set(panX,0,panZ);
        r.cameraRig.camera.position.set(panX+Math.sin(yaw)*distance*Math.sin(polar),Math.cos(polar)*distance,panZ+Math.cos(yaw)*distance*Math.sin(polar));
        r.cameraRig.camera.zoom=pose.zoom;r.cameraRig.camera.updateProjectionMatrix();r.cameraRig.controls.update();r.cameraRig.camera.updateMatrixWorld(true);
        const poseSummary={name:pose.name,yaw,polar,zoom:pose.zoom,pan:[panX,panZ],counts:{interior:0,exterior:0,boundary:0}};
        for(const category of ['interior','exterior','boundary']) for(let i=0;i<categories[category].length;i++){
          const [x,y]=categories[category][i], expectedPlane=inside(x,y)?targetPlane:'mortal';
          const stage=r.stages.get(expectedPlane); const wx=x+.04,wy=y+.04;
          const p=r.coordinates.worldToRender(wx,wy,surfaceElevation(stage.world,wx,wy));
          const projected=new THREE.Vector3(p.x,p.y,p.z).project(r.cameraRig.camera);
          const sx=(projected.x+1)*.5*r.width, sy=(1-projected.y)*.5*r.height;
          const onScreen=projected.z>=-1&&projected.z<=1&&sx>=0&&sy>=0&&sx<r.width&&sy<r.height;
          let oracleHit=null, picked=null, status='offscreen';
          if(onScreen){
            oracle.setFromCamera(new THREE.Vector2(projected.x,projected.y),r.cameraRig.camera);
            const hits=oracle.intersectObjects(objects,false);
            const nearest=hits[0];
            if(nearest&&nearest.object===boundary?.mesh){
              if(!Number.isInteger(nearest.faceIndex)||nearest.faceIndex<0)throw new Error('Boundary oracle needs a triangle index');
              const edge=Math.floor(nearest.faceIndex/2), nodes=boundary.edgeNodes;
              if(edge>=boundary.edges)throw new Error('Boundary oracle triangle exceeds submitted edges');
              const ax=nodes[edge*4],ay=nodes[edge*4+1],bx=nodes[edge*4+2],by=nodes[edge*4+3];
              oracleHit={kind:'realm-boundary',plane:null,targetPlane:boundary.targetPlane,x:(ax+bx)/2,y:(ay+by)/2,
                ax,ay,bx,by,edge,distance:nearest.distance,object:nearest.object.name,
                point:[nearest.point.x,nearest.point.y,nearest.point.z]};
            }else if(nearest){ const stage=owner.get(nearest.object), entity=nearest.instanceId==null?null:nearest.object.userData.renderEntities?.[nearest.instanceId];
              const cell=entity?{x:Math.max(0,Math.min(stage.world.w-1,Math.floor(entity.x))),y:Math.max(0,Math.min(stage.world.h-1,Math.floor(entity.y)))}:stage.coordinates.renderPointToCell(nearest.point);
              oracleHit={plane:stage.plane,x:cell.x,y:cell.y,distance:nearest.distance,object:nearest.object.name||nearest.object.type,instanceId:nearest.instanceId??null,entityId:entity?.id??null,point:[nearest.point.x,nearest.point.y,nearest.point.z]}; }
            picked=r.pick(sx,sy);
            const picker={plane:picked?.plane??null,x:picked?.x??null,y:picked?.y??null,distance:picked?.distance??null,
              kind:picked?.kind??null,targetPlane:picked?.targetPlane??null,ax:picked?.ax??null,ay:picked?.ay??null,bx:picked?.bx??null,by:picked?.by??null,
              point:picked?.point?[picked.point.x,picked.point.y,picked.point.z]:null};
            const boundaryMatches=oracleHit?.kind!=='realm-boundary'||(picker.kind==='realm-boundary'
              &&picker.targetPlane===oracleHit.targetPlane&&['ax','ay','bx','by'].every(k=>picker[k]===oracleHit[k])
              &&Math.abs(picker.distance-oracleHit.distance)<1e-6
              &&picker.point?.every((value,i)=>Math.abs(value-oracleHit.point[i])<1e-6));
            if(!oracleHit)status='no-geometry-hit';
            else if(picker.plane===oracleHit.plane&&picker.x===oracleHit.x&&picker.y===oracleHit.y&&boundaryMatches)status=oracleHit.plane===expectedPlane?'exact-visible':'legal-occlusion';
            else status='picker-oracle-mismatch';
            const sample={pose:pose.name,category,index:i,target:[x,y],expectedPlane,onScreen,status,oracle:oracleHit,picker,oracleVisiblePlane:oracleHit?.plane??null};
            result.samples.push(sample); result.summary.total++;
            result.summary.byCategory[category]||={total:0,exact:0,legalOcclusion:0,mismatch:0,offscreen:0};
            const cs=result.summary.byCategory[category];cs.total++;
            if(status==='exact-visible'){result.summary.exact++;cs.exact++;poseSummary.counts[category]++;}
            else if(status==='legal-occlusion'){result.summary.occluded++;cs.legalOcclusion++;poseSummary.counts[category]++;}
            else if(status==='picker-oracle-mismatch'||status==='no-geometry-hit'){result.summary.mismatch++;cs.mismatch++;}
            else cs.offscreen++;
            sample.picker=picker;
          } else { result.samples.push({pose:pose.name,category,index:i,target:[x,y],expectedPlane,onScreen,status}); result.summary.total++; result.summary.byCategory[category]||={total:0,exact:0,legalOcclusion:0,mismatch:0,offscreen:0}; result.summary.byCategory[category].total++; result.summary.byCategory[category].offscreen++; }
        }
        result.poses.push(poseSummary);
      }
      return result;
    })()`);
    evidence.picking[target] = samples;
    await closeView();
  }

  // Exercise real UI loading and renderer lifetimes in addition to Node probes.
  evidence.lifecycle = await session.js(`return (async () => {
    const s = window.inkbox, adapter = s.render3d, r = adapter.renderer;
    const gpu = r.gpu, rig = r.cameraRig, camera = rig.camera, gl = gpu.getContext(), checks = [];
    const frame = () => new Promise(requestAnimationFrame);
    const verify = (name, condition) => { checks.push({ name, passed: !!condition }); if (!condition) throw new Error(name); };
    const shared = () => r.gpu === gpu && r.cameraRig === rig && rig.camera === camera && gpu.getContext() === gl
      && document.querySelectorAll('#inkCanvas3D').length === 1;
    const { saveToStorage, deleteSlot } = await import('./src/inkbox/io/save.js');
    try {
      const saved = await saveToStorage(s.world, 'slot8'); verify('actual save succeeds', saved.ok);
      s.refreshSlots(); document.querySelector('#inkSlotSelect').value = 'slot8';
      const oldStages = [...r.stages.values()]; let released = 0;
      for (const stage of oldStages) stage.terrain.geometry.addEventListener('dispose', () => released++);
      s.newWorld('medium', ${SEED + 1}); s.speedIndex = 0; await frame(); await frame();
      verify('new world rebuilds all Stage geometry and fits new dimensions', released === 3
        && rig.dimensions.w === 288 && rig.dimensions.h === 180
        && [...r.stages.values()].every(stage => stage.world.size === 288 * 180) && shared());
      document.querySelector('#inkBtnLoad').click();
      for (let i = 0; i < 180 && (s.world.seed !== ${SEED} || r.world !== s.world); i++) await frame();
      verify('UI load rebinds all three worlds and preserves GPU / Camera', s.world.seed === ${SEED}
        && [...r.stages.values()].every(stage => stage.world === (stage.plane === 'mortal' ? s.world : s.world[stage.plane])) && shared());
      const upper = s.world.upper, nether = s.world.nether;
      r.setActivePlane('upper'); s.world.upper = null; s.world.nether = null; await frame(); await frame();
      verify('missing subworlds fall back to mortal', r.activePlane === 'mortal' && r.stages.size === 1 && shared());
      s.world.upper = upper; s.world.nether = nether; await frame(); await frame();
      verify('subworlds replaced on the same root world are detected', r.stages.size === 3 && shared());
      const x0 = 60, y0 = 40, x1 = 120, y1 = 80;
      s.selectTool('viewNether'); s.selection = { x0, y0, x1, y1, area: 2400,
        path: [[x0,y0],[x1,y0],[x1,y1],[x0,y1]] }; await frame();
      const region = r.realmViewState.region;
      adapter.setActive(false); await frame();
      verify('Canvas retains canonical world-space RealmViewState', s.riftViewOpen()
        && s.getRealmViewState().region === region && adapter.canvas.hidden);
      adapter.setActive(true); await frame();
      verify('3D resumes the same region and context', r.realmViewState.region === region && shared());
      for (const plane of ['upper', 'nether']) {
        s.selected = null; s.inspectPlaneAt(plane, 100, 64);
        verify(plane + ' inspect remains read-only', s.selected === null && document.querySelector('#inkInspect').classList.contains('on'));
      }
      s.selection = null; s.selectTool('inspect'); await frame();
      for (const plane of ['upper', 'nether']) {
        r.setActivePlane(plane); adapter.mode = 'raise';
        const before = s.world.height.slice(), remoteBefore = s.world[plane].height.slice();
        adapter.stroke = { plane: 'mortal', world: s.world, before: new Map(), changed: false, targetHeight: 0.5 };
        adapter.stamp({ x: 100, y: 64 }, plane); adapter.endStroke();
        verify(plane + ' blocks sculpt through the real adapter', before.every((value,i) => value === s.world.height[i])
          && remoteBefore.every((value,i) => value === s.world[plane].height[i]));
      }
      adapter.mode = 'inspect'; r.setActivePlane('mortal'); await frame();
      return { checks, sharedRendererAndCamera: shared(), gpuMemory: { ...gpu.info.memory } };
    } finally { deleteSlot('slot8'); }
  })()`);
  evidence.runtimeErrors = session.errors();
  const perfFile = output('performance.json');
  fs.writeFileSync(perfFile, `${JSON.stringify({ generatedAt: evidence.generatedAt,
    environment: evidence.environment, world: evidence.world, ...evidence.performance }, null, 2)}\n`);
  const evidenceFile = output('browser-evidence.json');
  fs.writeFileSync(evidenceFile, `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(`Raw performance JSON: ${perfFile}`);
  console.log(`Raw browser evidence: ${evidenceFile}`);
  const pickSummary = Object.fromEntries(Object.entries(evidence.picking).map(([k,v])=>[k,v.summary]));
  console.log(`Picking summary: ${JSON.stringify(pickSummary)}`);
  if (evidence.runtimeErrors.length) process.exitCode = 1;
  if (Object.values(evidence.picking).some(v => v.summary.mismatch > 0
    || Object.values(v.summary.byCategory).some(c => c.offscreen > 0 || c.mismatch > 0)
    || v.summary.total !== 80
    || v.summary.byCategory.interior?.total !== 32
    || v.summary.byCategory.exterior?.total !== 32
    || v.summary.byCategory.boundary?.total !== 16)) process.exitCode = 1;
} finally {
  try {
    await session.js(`
      const r=window.inkbox?.render3d?.renderer;
      if(r){ r.setSlabProbe(false); for(const stage of r.stages.values()) for(const o of [...stage.root.children]) if(o.name==='M2A-debug-same-coordinate-marker'){stage.root.remove(o);o.geometry.dispose();o.material.dispose();} }
      return true;
    `);
  } catch { /* page may have navigated */ }
  await session.close();
}
