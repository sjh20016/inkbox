// Debug-only evidence recipes. Only newWorld/advanceDays create simulation facts.
import { deriveEntities } from '../entities/deriveEntities.js';
import { mulberry32 } from '../../core/noise.js';
import { createAdvanceState } from '../../sim/advance.js';
export const VISUAL_SCENARIOS = Object.freeze({
  GOLDEN_A: { seed: 20260930, preset: 'small', days: 1440 },
  TERRAIN_STRESS: { seed: 20261003, preset: 'medium', days: 10 },
  DENSITY_A: { seed: 20260928, preset: 'medium', days: 1800 },
});
export const CAMERA_RECIPES = Object.freeze({
  WORLD_OVERVIEW: { target: 'bounds', polar: 0.52, yaw: 0.15, zoom: 1.45 },
  REGIONAL: { target: 'mountain', polar: 0.86, yaw: 0.32, zoom: 2.5 },
  REALM_BOUNDARY: { target: 'bounds', polar: 0.85, yaw: 0.1, zoom: 1.4 },
  ENTITY_MEDIUM: { target: 'entity', polar: 0.88, yaw: 0.2, zoom: 9 },
  ENTITY_CLOSE: { target: 'entity', polar: 1.1, yaw: 0.2, zoom: 18 },
  SETTLEMENT: { target: 'settlement', polar: 0.88, yaw: 0.4, zoom: 9 },
});
export function applyScenario(sandbox, name = 'GOLDEN_A') {
  const spec = VISUAL_SCENARIOS[name];
  if (!spec) throw new Error(`Unknown visual scenario: ${name}`);
  sandbox.rng=mulberry32(12345); sandbox.advanceState=createAdvanceState();
  sandbox.newWorld(spec.preset, spec.seed); sandbox.speedIndex = 0;
  for(let day=0;day<spec.days;day++) sandbox.advanceDays(1);
  sandbox.selection = null; sandbox.dirty = true;
  return { scenario: name, ...spec, worldDay: sandbox.world.day, mapSize: [sandbox.world.w, sandbox.world.h],rngRecipe:{sandbox:'mulberry32(12345) reset before newWorld; greetOnBoot consumes first draws',life:'newWorld seed ^ 0xa5a5a5a5',advanceState:'fresh createAdvanceState()',stepDays:1},
    coverage:{entities:sandbox.world.entities.length,cultivators:deriveEntities(sandbox.world).cultivator.length,villages:sandbox.world.villages.length,houses:sandbox.world.villages.reduce((n,v)=>n+(v.houses?.length||0),0)} };
}
export async function snapshotDigest(sandbox) {
  const bytes=new TextEncoder().encode(JSON.stringify({world:sandbox.world,advanceState:sandbox.advanceState}));
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  return {algorithm:'SHA-256',scope:'JSON.stringify entire world (including upper/nether, all typed arrays and facts) + advanceState; functions excluded by JSON',bytes:bytes.length,value:[...new Uint8Array(digest)].map(v=>v.toString(16).padStart(2,'0')).join('')};
}
export function scenarioPoi(world, kind) {
  const center = { x: (world.w - 1) / 2, y: (world.h - 1) / 2, source: 'world-bounds' };
  if (kind === 'mountain') {
    let index = 0; for (let i = 1; i < world.height.length; i++) if (world.height[i] > world.height[index]) index = i;
    return { x: index % world.w, y: Math.floor(index / world.w), source: 'height-maximum', index };
  }
  if (kind === 'entity') {
    const pair=nearestCultivatorHouse(world),e = pair?.entity || deriveEntities(world).cultivator[0];
    if (!e) throw new Error('ENTITY recipe requires a real cultivator; advance the scenario instead of fabricating one');
    return { x: e.x, y: e.y, source: 'real-entity', id: e.id, kind: 'cultivator', level: e.level, nearestHouse:pair?.house,distanceToHouse:pair?.distance };
  }
  if (kind === 'settlement') {
    const pair=nearestCultivatorHouse(world);
    if(pair) return {x:(pair.entity.x+pair.house.x)/2,y:(pair.entity.y+pair.house.y)/2,source:'real-house-cultivator-pair',id:pair.village.id,houses:pair.village.houses.length,entityId:pair.entity.id,kind:'cultivator',house:pair.house,distance:pair.distance};
    const v = [...(world.villages || [])].sort((a, b) => (b.houses?.length || 0) - (a.houses?.length || 0))[0];
    if (!v?.houses?.length) throw new Error('SETTLEMENT recipe requires real houses');
    return { x: v.x, y: v.y, source: 'real-settlement', id: v.id, houses: v.houses.length };
  }
  return center;
}
function nearestCultivatorHouse(world) {
  let best=null;
  for(const entity of deriveEntities(world).cultivator) for(const village of world.villages||[]) for(const house of village.houses||[]) {
    const distance=Math.hypot(entity.x-house.x,entity.y-house.y);
    if(!best||distance<best.distance)best={entity,village,house:{x:house.x,y:house.y,type:house.type},distance};
  }
  return best;
}
export function applyCamera(host, name = 'WORLD_OVERVIEW', overrides = {}) {
  const recipe = { ...CAMERA_RECIPES[name], ...overrides };
  if (!CAMERA_RECIPES[name]) throw new Error(`Unknown camera recipe: ${name}`);
  const poi = overrides.poi || scenarioPoi(host.world, recipe.target), rig = host.cameraRig;
  const elevation = host.stages.get(host.activePlane)?.elevation?.at?.(poi.x, poi.y) || 0;
  const point = host.coordinates.worldToRender(poi.x, poi.y, elevation);
  const distance = Math.max(host.world.w, host.world.h) * 2.15;
  rig.cancelFocus(); rig.controls.target.set(point.x, point.y, point.z);
  rig.camera.position.set(point.x + Math.sin(recipe.yaw) * distance * Math.sin(recipe.polar),
    point.y + Math.cos(recipe.polar) * distance, point.z + Math.cos(recipe.yaw) * distance * Math.sin(recipe.polar));
  rig.camera.zoom = recipe.zoom; rig.camera.updateProjectionMatrix(); rig.controls.update(); rig.camera.updateMatrixWorld(true);
  return { cameraRecipe: name, recipe, poi, position: rig.camera.position.toArray(), target: rig.controls.target.toArray(), zoom: rig.camera.zoom };
}
export async function applyVisibleCamera(host,name) {
  if(!['ENTITY_MEDIUM','ENTITY_CLOSE','SETTLEMENT'].includes(name))return applyCamera(host,name);
  const T=await import('three'),stage=host.stages.get('mortal');host.setArtProfile('pilot');
  const pairs=deriveEntities(host.world).cultivator.map(entity=>{
    let pair=null;for(const village of host.world.villages)for(const house of village.houses||[]){const distance=Math.hypot(entity.x-house.x,entity.y-house.y);if(!pair||distance<pair.distance)pair={entity,village,house,distance};}return pair;
  }).filter(Boolean).sort((a,b)=>{const score=p=>p.distance>=5&&p.distance<20?p.distance:p.distance+100;return score(a)-score(b);});
  if(!pairs.length)throw new Error('Required cultivator/house pair is absent');
  const project=(x,y,lift)=>{
    const p=host.coordinates.worldToRender(x,y,stage.elevation.at(x,y)+lift),v=new T.Vector3(p.x,p.y,p.z).project(host.cameraRig.camera);
    return {x:(v.x+1)*host.width/2,y:(1-v.y)*host.height/2,inFrame:Math.abs(v.x)<.88&&Math.abs(v.y)<.88&&v.z>-1&&v.z<1};
  };
  const ray=new T.Raycaster();
  const blockers=[stage.terrain.mesh,stage.vegetation.mesh];
  for(const group of [stage.entities.group,stage.settlements.group])group.traverse(o=>{if(o.isInstancedMesh&&o.visible&&o.count)blockers.push(o);});
  const visibleObject=(mesh,x,y,lift)=>{
    const p=project(x,y,lift);if(!p.inFrame)return {...p,visible:false};
    ray.setFromCamera(new T.Vector2(p.x/host.width*2-1,1-p.y/host.height*2),host.cameraRig.camera);
    const hit=ray.intersectObjects(blockers,false)[0];
    return {...p,visible:hit?.object===mesh,instanceId:hit?.instanceId};
  };
  for(const pair of pairs){const {entity,house,village,distance}=pair;
  const poi=name==='SETTLEMENT'?{x:(entity.x+house.x)/2,y:(entity.y+house.y)/2,source:'visible-house-cultivator-pair',entityId:entity.id,id:village.id,house,houses:village.houses.length,distance}:{x:entity.x,y:entity.y,source:'visible-real-cultivator',id:entity.id,kind:'cultivator',level:entity.level,nearestHouse:house,distanceToHouse:distance};
  for(const polar of [.65,.45,.28])for(const yaw of [.2,1.77,3.34,4.91]){
    const view=applyCamera(host,name,{polar,yaw,poi});host.scene.updateMatrixWorld(true);host.cameraRig.camera.updateMatrixWorld(true);
    const p=project(entity.x,entity.y,entity.lift+1.45),hit=p.inFrame?host.pick(p.x,p.y):null;
    ray.setFromCamera(new T.Vector2(p.x/host.width*2-1,1-p.y/host.height*2),host.cameraRig.camera);
    const front=ray.intersectObjects(blockers,false)[0];
    const frontEntity=front?.object.userData.renderEntities?.[front?.instanceId];
    const bodyPoints=[.25,.8,1.45,1.95,2.65].map(lift=>{
      const pixel=project(entity.x,entity.y,entity.lift+lift);ray.setFromCamera(new T.Vector2(pixel.x/host.width*2-1,1-pixel.y/host.height*2),host.cameraRig.camera);
      const first=ray.intersectObjects(blockers,false)[0],firstEntity=first?.object.userData.renderEntities?.[first?.instanceId];
      return {lift,pixel,visible:pixel.inFrame&&firstEntity?.id===entity.id};
    });
    const visibleBodyPoints=bodyPoints.filter(p=>p.visible).length;
    const proof={entityId:entity.id,kind:'cultivator',projected:p,pickedEntityId:hit?.entityId,pickedPlane:hit?.plane,frontmostEntityId:frontEntity?.id,bodyPoints,visibleBodyPoints,visible:p.inFrame&&hit?.entityId===entity.id&&frontEntity?.id===entity.id&&visibleBodyPoints>=3};
    if(!proof.visible)continue;
    if(name==='SETTLEMENT'){
      const house=poi.house,houseMeshes=[];stage.settlements.group.traverse(o=>{if(o.isInstancedMesh)houseMeshes.push(o);});
      const houseProof=houseMeshes.map(mesh=>visibleObject(mesh,house.x+.5,house.y+.5,1.5)).find(v=>v.visible);
      const trees=[...stage.vegetation.trees].sort((a,b)=>Math.hypot(a.x-entity.x,a.y-entity.y)-Math.hypot(b.x-entity.x,b.y-entity.y)).slice(0,40);
      const treeProof=trees.map(tree=>({...visibleObject(stage.vegetation.mesh,tree.x,tree.y,tree.size*.9),world:[tree.x,tree.y]})).find(v=>v.visible);
      if(!houseProof||!treeProof)continue;
      proof.house=houseProof;proof.tree=treeProof;
    }
    return {...view,visibilityProof:proof};
  }}
  throw new Error(`No proven visible camera for ${name}`);
}
export function screenshotManifest(sandbox, metadata = {}) {
  return { seed: sandbox.seed, worldGenVersion: 'unversioned-source; see commit/source hash', mapSize: [sandbox.world.w, sandbox.world.h],
    worldDay: sandbox.world.day, viewRealm: sandbox.render3d.renderer.activePlane, ...metadata };
}

export async function measureRenderer(host, profile, { samples = 60 } = {}) {
  const submission=[], intervals=[]; let previous=null;
  for(let i=0;i<samples+5;i++) {
    const now=await new Promise(requestAnimationFrame);
    const t=performance.now();host.render();const elapsed=performance.now()-t;
    if(i>=5){submission.push(elapsed);if(previous!==null)intervals.push(now-previous);}previous=now;
  }
  const summarize = list => {const sorted=[...list].sort((a,b)=>a-b);return {averageMs:list.reduce((a,b)=>a+b,0)/list.length,medianMs:sorted[Math.floor(list.length*.5)],p95Ms:sorted[Math.floor(list.length*.95)]};};
  const visible=[...host.stages.values()].filter(s=>s.visible);
  return { profile,kind:'CPU-visible renderer.render() submission timing',samples, ...summarize(submission),rafFrameIntervals:summarize(intervals),
    calls:host.gpu.info.render.calls,triangles:host.gpu.info.render.triangles,
    instances:visible.reduce((n,s)=>n+(s.entities?.stats.instances||0)+(s.vegetation?.mesh.count||0)+(s.settlements?.stats.buildings||0),0),
    rtResolution:null,dpr:host.gpu.getPixelRatio(),canvasResolution:[host.canvas.width,host.canvas.height] };
}

export async function validateCameraAndLifecycle(sandbox, { frames = 600 } = {}) {
  const host=sandbox.render3d.renderer, width=host.width,height=host.height;
  const memory=[],rotations=[],zooms=[],frameIntervals=[];let previous=null;
  const fingerprint=()=>JSON.stringify({day:sandbox.world.day,height:[...sandbox.world.height],type:[...sandbox.world.type],veg:[...sandbox.world.veg],entities:sandbox.world.entities,villages:sandbox.world.villages});
  const before=fingerprint();
  const region=target=>{
    const w=sandbox.world;
    sandbox.selectTool(target==='upper'?'viewUpper':'viewNether');
    const path=[[w.w*.22,w.h*.22],[w.w*.78,w.h*.22],[w.w*.78,w.h*.78],[w.w*.22,w.h*.78]];
    sandbox.selection={path,x0:w.w*.22,y0:w.h*.22,x1:w.w*.78,y1:w.h*.78,area:w.w*w.h*.56*.56};
    host.setRealmViewState(sandbox.getRealmViewState());
  };
  const close=()=>{sandbox.selectTool('inspect');sandbox.selection=null;host.setRealmViewState(sandbox.getRealmViewState());};
  const pick=()=>{
    const counts={};let hits=0,visibleMismatch=0;
    for(let iy=0;iy<18;iy++)for(let ix=0;ix<24;ix++){
      const result=host.pick(width*(.05+.9*ix/23),height*(.05+.9*iy/17));
      const kind=result?.kind==='realm-boundary'?'realm-boundary':(result?.plane||'miss');
      counts[kind]=(counts[kind]||0)+1;
      if(result){hits++;if(result.plane&&!host.stages.get(result.plane)?.visible)visibleMismatch++;}
    }
    return {counts,hits,visibleMismatch,visiblePlanes:[...host.stages.values()].filter(s=>s.visible).map(s=>s.plane)};
  };
  const picking={};
  try {
    close();applyCamera(host,'WORLD_OVERVIEW');host.setArtProfile('pilot');
    for(let frame=0;frame<frames;frame++){
      if(frame===20)host.resize(width-31,height-19);
      if(frame===40)host.resize(width,height);
      if(frame<120){host.cameraRig.rotate(Math.PI*2/120);if(frame%30===0)rotations.push({frame,position:host.cameraRig.camera.position.toArray()});}
      if(frame>=120&&frame<240){host.cameraRig.camera.zoom=1.45+(18-1.45)*(1-Math.cos((frame-120)/120*Math.PI*2))/2;host.cameraRig.camera.updateProjectionMatrix();if(frame%30===0)zooms.push({frame,zoom:host.cameraRig.camera.zoom});}
      if(frame===240){applyCamera(host,'REALM_BOUNDARY');region('upper');}
      if(frame===300){picking.upper=pick();region('nether');}
      if(frame===360){picking.nether=pick();close();applyCamera(host,'WORLD_OVERVIEW');}
      if(frame>=360&&frame<400&&frame%10===0)host.setArtProfile(['baseline','pigment','ink','pilot'][(frame-360)/10]);
      const now=await new Promise(requestAnimationFrame);if(previous!==null)frameIntervals.push(now-previous);previous=now;
      if(frame===430||frame===frames-1)memory.push({frame,...host.gpu.info.memory,calls:host.gpu.info.render.calls,triangles:host.gpu.info.render.triangles});
    }
    picking.mortal=pick();
    const stable=memory.length===2&&memory[0].geometries===memory[1].geometries&&memory[0].textures===memory[1].textures;
    const ordered=frameIntervals.sort((a,b)=>a-b);
    return {frames,rotationDegrees:360,zoomRange:[1.45,18],rotations,zooms,picking,memory,resourcesStable:stable,worldFactsUnchanged:before===fingerprint(),resizeRestored:[host.width,host.height],
      kind:'CPU-visible requestAnimationFrame intervals, includes product loop',averageMs:ordered.reduce((a,b)=>a+b,0)/ordered.length,medianMs:ordered[Math.floor(ordered.length*.5)],p95Ms:ordered[Math.floor(ordered.length*.95)],
      limitation:'600-frame bounded stability run; not an endurance or GPU-time benchmark'};
  } finally {close();host.resize(width,height);host.setArtProfile('pilot');applyCamera(host,'WORLD_OVERVIEW');}
}

// One-shot technical spike; does not enter the product render loop.
export async function probeRenderTargets(host, { samples = 30 } = {}) {
  const T = await import('three'), gpu = host.gpu, gl = gpu.getContext();
  const savedTarget = gpu.getRenderTarget(), savedAuto = gpu.autoClear;
  const oldDpr = gpu.getPixelRatio(), oldSize = gpu.getSize(new T.Vector2());
  const oldTone = gpu.toneMapping, oldSpace = gpu.outputColorSpace;
  const before = { ...gpu.info.memory }, results = [];
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute([-1,-1,0,3,-1,0,-1,3,0],3));
  geometry.setAttribute('uv', new T.Float32BufferAttribute([0,0,2,0,0,2],2));
  const material = new T.ShaderMaterial({
    uniforms: { colorMap: {value:null}, depthMap: {value:null}, showDepth: {value:0} },
    vertexShader:'varying vec2 vUv; void main(){vUv=uv; gl_Position=vec4(position,1.0);}',
    fragmentShader: `uniform sampler2D colorMap; uniform sampler2D depthMap; uniform float showDepth; varying vec2 vUv;
      void main(){ if(showDepth>0.5){ float d=texture2D(depthMap,vUv).r; gl_FragColor=vec4(vec3(d),1.0); }
      else {gl_FragColor=texture2D(colorMap,vUv); #include <tonemapping_fragment>
      #include <colorspace_fragment>
      } }`.replace(' #include','\n#include'),
    depthTest:false,depthWrite:false,toneMapped:true });
  const screen = new T.Scene(); screen.add(new T.Mesh(geometry,material));
  const camera = new T.Camera();
  const stats = values => {const ordered=[...values].sort((a,b)=>a-b);return {averageMs:values.reduce((a,b)=>a+b,0)/values.length,medianMs:ordered[Math.floor(values.length*.5)],p95Ms:ordered[Math.floor(values.length*.95)]};};
  const timing = fn => {const times=[];for(let i=0;i<samples+5;i++){const t=performance.now();fn();if(i>=5)times.push(performance.now()-t);}return stats(times);};
  try {
    gpu.autoClear=true;
    const direct=timing(()=>{gpu.setRenderTarget(null);gpu.render(host.scene,host.cameraRig.camera);});
    for(const dpr of [1,1.5]) for(const scale of [1,.5]) {
      gpu.setPixelRatio(dpr); gpu.setSize(oldSize.x,oldSize.y,false);
      const width=Math.max(1,Math.round(oldSize.x*dpr*scale)),height=Math.max(1,Math.round(oldSize.y*dpr*scale));
      const rt=new T.WebGLRenderTarget(width,height,{samples:4,depthTexture:new T.DepthTexture(width,height,T.UnsignedIntType)});
      rt.texture.colorSpace=T.LinearSRGBColorSpace;
      const depthRead=new T.WebGLRenderTarget(32,32,{depthBuffer:false});
      try {
        material.uniforms.colorMap.value=rt.texture;material.uniforms.depthMap.value=rt.depthTexture;
        material.uniforms.showDepth.value=0;
        const pass=()=>{gpu.setRenderTarget(rt);gpu.render(host.scene,host.cameraRig.camera);gpu.setRenderTarget(null);gpu.render(screen,camera);};
        const frame=timing(pass);
        const calibration=new T.Scene(), swatchMaterial=new T.MeshBasicMaterial({color:'#804020',depthTest:false,depthWrite:false});
        calibration.add(new T.Mesh(geometry,swatchMaterial));
        const colorRead=new T.WebGLRenderTarget(1,1,{depthBuffer:false}); colorRead.texture.colorSpace=T.SRGBColorSpace;
        const reference=new Uint8Array(4),copied=new Uint8Array(4);
        try {
          gpu.setRenderTarget(colorRead);gpu.render(calibration,camera);gpu.readRenderTargetPixels(colorRead,0,0,1,1,reference);
          gpu.setRenderTarget(rt);gpu.render(calibration,camera);gpu.setRenderTarget(colorRead);gpu.render(screen,camera);gpu.readRenderTargetPixels(colorRead,0,0,1,1,copied);
        } finally {gpu.setRenderTarget(null);colorRead.dispose();swatchMaterial.dispose();}
        const maxColorError=Math.max(...[0,1,2].map(i=>Math.abs(reference[i]-copied[i])));
        const colorSampling={reference:[...reference],fullscreenCopy:[...copied],maxByteError:maxColorError,passed:maxColorError<=2};
        pass(); // Restore scene contents after the known-color calibration.
        gpu.setRenderTarget(rt);const framebufferStatus=gl.checkFramebufferStatus(gl.FRAMEBUFFER);gpu.setRenderTarget(null);
        material.uniforms.showDepth.value=1;gpu.toneMapping=T.NoToneMapping;gpu.outputColorSpace=T.LinearSRGBColorSpace;
        gpu.setRenderTarget(depthRead);gpu.render(screen,camera);
        const pixels=new Uint8Array(32*32*4);gpu.readRenderTargetPixels(depthRead,0,0,32,32,pixels);
        const values=[];for(let i=0;i<pixels.length;i+=4)values.push(pixels[i]);
        const min=Math.min(...values),max=Math.max(...values),occupied=values.filter(v=>v<254).length;
        gpu.toneMapping=oldTone;gpu.outputColorSpace=oldSpace;material.uniforms.showDepth.value=0;
        results.push({scale,dpr,resolution:[width,height],samples:rt.samples,depthType:'UnsignedIntType',colorSpace:rt.texture.colorSpace,framebufferComplete:framebufferStatus===gl.FRAMEBUFFER_COMPLETE,
          colorSampling,depthSampling:{min,max,occupiedSamples:occupied,totalSamples:values.length,passed:min<max&&occupied>0},glError:gl.getError(),timing:frame,extraAverageMs:frame.averageMs-direct.averageMs});
        // Explicit resize after allocation exercises color + depth/MSAA reallocation.
        rt.setSize(Math.max(1,width-17),Math.max(1,height-11));pass();
        results.at(-1).resize={resolution:[rt.width,rt.height],depthResolution:[rt.depthTexture.image.width,rt.depthTexture.image.height],glError:gl.getError()};
      } finally {gpu.setRenderTarget(null);rt.dispose();depthRead.dispose();}
    }
    geometry.dispose();material.dispose();
    return {kind:'CPU-visible frame submission timing; not GPU timer',direct,results,before,after:{...gpu.info.memory},gate:results.every(r=>r.framebufferComplete&&r.colorSampling.passed&&r.depthSampling.passed&&r.glError===0&&r.resize.glError===0)};
  } finally {
    geometry.dispose();material.dispose();gpu.setPixelRatio(oldDpr);gpu.setSize(oldSize.x,oldSize.y,false);
    gpu.toneMapping=oldTone;gpu.outputColorSpace=oldSpace;gpu.autoClear=savedAuto;gpu.setRenderTarget(savedTarget);host.render();
  }
}
