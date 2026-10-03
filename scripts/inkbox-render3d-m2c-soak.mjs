#!/usr/bin/env node
// Real Edge stability check, chunked so CDP requests remain bounded.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { launch, findBrowser, sleep } from './cdp.mjs';

const OUT = path.resolve(process.env.INKBOX_REPORT_DIR || 'reports/release/render3d-m2c');
const frames = Number(process.env.INKBOX_M2C_SOAK_FRAMES || 6000);
if (!Number.isInteger(frames) || frames < 1800 || frames % 300) throw new Error('Soak frames must be a multiple of 300, at least 1800');
fs.mkdirSync(OUT, { recursive: true });
const edge = findBrowser(['C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe']);
if (!edge) throw new Error('Microsoft Edge required');
const base = process.env.INKBOX_URL || 'http://127.0.0.1:4180/inkbox.html';
const result = { generatedAt: new Date().toISOString(), frames, chunks: [], errors: [],
  timingKind: 'CPU-visible requestAnimationFrame intervals, not GPU timer',
  limitation: 'Bounded 6000-frame stability run; not an hours-long endurance or arbitrary-density guarantee' };
function sourceHashes(directory) {
  const hashes = {};
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) Object.assign(hashes, sourceHashes(file));
    else if (entry.name.endsWith('.js')) hashes[file.replaceAll('\\', '/')] = createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  }
  return hashes;
}
result.renderSourceHashes = sourceHashes('src/inkbox/render3d');
const session = await launch({ url: `${base}${base.includes('?') ? '&' : '?'}renderer=3d`, browser: edge, width: 1500, height: 940, gpu: true });
const js = body => session.js(`return (async()=>{${body}})();`);
try {
  if (!await session.waitFor('return !!window.inkbox?.render3d?.renderer?.stages?.size', { timeoutMs: 60000 })) throw new Error('Renderer not ready');
  result.environment = await js(`const r=window.inkbox.render3d.renderer,gl=r.gpu.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');
    return {browser:navigator.userAgent,gpu:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),dpr:devicePixelRatio,viewport:[innerWidth,innerHeight]};`);
  result.scenario = await js(`window.__soakHarness=await import('./src/inkbox/render3d/art/VisualScenarios.js');
    const s=window.inkbox;const spec=window.__soakHarness.applyScenario(s,'DENSITY_A');
    s.selectTool('inspect');s.selection=null;window.__soakHarness.applyCamera(s.render3d.renderer,'WORLD_OVERVIEW');
    window.__soakIntervals=[];
    window.__soakFingerprint=async()=>{
      const seen=new WeakMap();
      const snapshot=(v,at='world')=>{
        if(v===null||typeof v!=='object')return typeof v==='function'?'[function]':v;
        if(seen.has(v))return {'$ref':seen.get(v)};seen.set(v,at);
        if(ArrayBuffer.isView(v))return {type:v.constructor.name,data:Array.from(v)};
        if(Array.isArray(v))return v.map((item,i)=>snapshot(item,at+'.'+i));
        const out={};for(const key of Object.keys(v).sort())out[key]=snapshot(v[key],at+'.'+key);return out;
      };
      const bytes=new TextEncoder().encode(JSON.stringify(snapshot(s.world)));
      return {bytes:bytes.length,sha256:Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(b=>b.toString(16).padStart(2,'0')).join('')};
    };
    return spec;`);
  // Warm every profile before counting stable resources.
  for (const profile of ['baseline', 'pigment', 'ink', 'pilot']) {
    await js(`window.inkbox.render3d.renderer.setArtProfile('${profile}');return true;`);
    await sleep(180);
  }
  result.dataTextureProbe = await js(`
    const T=await import('three'),{TerrainDataTextures}=await import('./src/inkbox/render3d/art/TerrainDataTextures.js');
    const gpu=window.inkbox.render3d.renderer.gpu,gl=gpu.getContext(),before={...gpu.info.memory};
    // Synthetic texture fixture only: the real Sandbox World remains untouched.
    const w=7,h=5,fixture={w,h,size:w*h,height:new Float32Array(w*h),type:new Uint8Array(w*h)};
    for(let i=0;i<fixture.size;i++){fixture.height[i]=.1+(i%7)*.08;fixture.type[i]=i%23;}
    const data=new TerrainDataTextures(fixture,{node:(x,y)=>fixture.height[y*w+x]*2});
    const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute([-1,-1,0,3,-1,0,-1,3,0],3));
    const material=new T.ShaderMaterial({uniforms:{heightMap:{value:data.heightTexture},typeMap:{value:data.typeTexture},mapSize:{value:new T.Vector2(w,h)}},
      vertexShader:'void main(){gl_Position=vec4(position,1.0);}',
      fragmentShader:'uniform sampler2D heightMap;uniform sampler2D typeMap;uniform vec2 mapSize;void main(){vec2 uv=(gl_FragCoord.xy+vec2(.32,0))/mapSize;vec4 height=texture2D(heightMap,uv);gl_FragColor=vec4(texture2D(typeMap,uv).r,height.r,height.g*.5,1.0);}',
      depthTest:false,depthWrite:false});
    const scene=new T.Scene();scene.add(new T.Mesh(geometry,material));const camera=new T.Camera();
    const rt=new T.WebGLRenderTarget(w,h,{depthBuffer:false});const oldTarget=gpu.getRenderTarget();
    const read=()=>{gpu.setRenderTarget(rt);gpu.render(scene,camera);const p=new Uint8Array(w*h*4);gpu.readRenderTargetPixels(rt,0,0,w,h,p);return p;};
    let initial,typeOnly,heightOnly,nearest=true,untouched=true,rawAndFinal=true,error=0;
    try{
      const first=read();
      for(let i=0;i<fixture.size;i++){
        nearest&&=first[i*4]===fixture.type[i];
        rawAndFinal&&=Math.abs(first[i*4+1]-fixture.height[i]*255)<=1&&Math.abs(first[i*4+2]-fixture.height[i]*255)<=1;
      }
      initial={nearestCategories:nearest,rawAndFinalHeight:rawAndFinal};
      const x=3,y=2,index=y*w+x;fixture.type[index]=22;fixture.height[index]=.75;
      data.update({x0:x,y0:y,x1:x,y1:y},{height:false,type:true});const second=read();
      typeOnly=second[index*4]===22&&second[index*4+1]===first[index*4+1]&&second[index*4+2]===first[index*4+2];
      for(let i=0;i<fixture.size;i++)if(i!==index)for(let c=0;c<4;c++)untouched&&=first[i*4+c]===second[i*4+c];
      data.update({x0:x,y0:y,x1:x,y1:y},{height:true,type:false});const third=read();
      heightOnly=third[index*4]===22&&Math.abs(third[index*4+1]-.75*255)<=1&&Math.abs(third[index*4+2]-.75*255)<=1;
      for(let i=0;i<fixture.size;i++)if(i!==index)for(let c=0;c<4;c++)untouched&&=second[i*4+c]===third[i*4+c];
      error=gl.getError();
    }finally{gpu.setRenderTarget(oldTarget);rt.dispose();geometry.dispose();material.dispose();data.dispose();}
    return {mapSize:[w,h],sampleOffsetCells:[.32,0],initial,typeOnly,heightOnly,untouched,glError:error,
      passed:nearest&&rawAndFinal&&typeOnly&&heightOnly&&untouched&&error===0,before,after:{...gpu.info.memory}};
  `);
  result.beforeSnapshot = await js('return window.__soakFingerprint();');
  const started = Date.now();
  for (let chunk = 0; chunk < frames / 300; chunk++) {
    const sample = await js(`const s=window.inkbox,r=s.render3d.renderer,chunk=${chunk};
      const width=r.width,height=r.height;
      // No simulation facts, new objects, or committed region edits are introduced.
      if(chunk%4===0){r.setArtProfile('baseline');r.setArtProfile('pilot');}
      if(chunk===2)r.resize(width-31,height-19);
      if(chunk===3)r.resize(width+31,height+19);
      let previous=null;
      for(let i=0;i<300;i++){
        if(chunk<6)r.cameraRig.rotate(Math.PI*2/1800);
        const t=await new Promise(requestAnimationFrame);
        if(previous!==null)window.__soakIntervals.push(t-previous);previous=t;
      }
      const gl=r.gpu.getContext();return {chunk,frame:(chunk+1)*300,profile:r.art.profile.name,
        memory:{...r.gpu.info.memory,programs:r.gpu.info.programs.length},calls:r.gpu.info.render.calls,
        triangles:r.gpu.info.render.triangles,glError:gl.getError(),canvas:[r.canvas.width,r.canvas.height]};`);
    result.chunks.push(sample);
    console.log(`soak ${sample.frame}/${frames} geometry=${sample.memory.geometries} textures=${sample.memory.textures} gl=${sample.glError}`);
  }
  result.elapsedMs = Date.now() - started;
  result.afterSnapshot = await js('return window.__soakFingerprint();');
  result.worldFactsUnchanged = result.beforeSnapshot.sha256 === result.afterSnapshot.sha256;
  result.frameIntervals = await js(`const values=window.__soakIntervals,ordered=[...values].sort((a,b)=>a-b);
    return {samples:values.length,averageMs:values.reduce((a,b)=>a+b,0)/values.length,
      medianMs:ordered[Math.floor(values.length*.5)],p95Ms:ordered[Math.floor(values.length*.95)]};`);
  const settled = result.chunks.slice(4);
  result.resourcesStable = settled.every(s => s.memory.geometries === settled[0].memory.geometries && s.memory.textures === settled[0].memory.textures && s.memory.programs === settled[0].memory.programs);
  result.profileStable = result.chunks.every(s => s.profile === 'pilot');
  result.errors = [...session.errors(), ...session.cdp.events.filter(e => e.method === 'Runtime.consoleAPICalled' && e.params.type === 'error').map(e => e.params.args.map(a => a.value || a.description || '').join(' '))];
  result.passed = result.dataTextureProbe.passed && result.worldFactsUnchanged && result.resourcesStable && result.profileStable && !result.errors.length && result.chunks.every(s => s.glError === 0);
  if (!result.passed) throw new Error('M2-C soak invariant failed; see soak-evidence.json');
} catch (error) {
  result.failure = String(error?.stack || error); throw error;
} finally {
  fs.writeFileSync(path.join(OUT, 'soak-evidence.json'), JSON.stringify(result, null, 2));
  await session.close();
}
