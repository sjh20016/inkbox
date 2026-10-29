#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import{createHash}from'node:crypto';
import * as THREE from 'three';
import{WORLD_PRESETS}from'../src/inkbox/core/config.js';
import{generateNetherStrataCandidate,generateNetherInkArtCandidate,getNetherStrataMetadata,repairThinNetherRidges,NETHER_INK_ART_VERSION}from'../src/inkbox/world/netherStrataCandidate.js';
import{PlaneStage}from'../src/inkbox/render3d/stage/PlaneStage.js';
import{ART_PROFILES}from'../src/inkbox/render3d/art/ArtPassProfile.js';
import{SHANHAI_OPTIONS,shanhaiStyleFor}from'../src/inkbox/render3d/shanhai/ShanhaiStyle.js';
import{serializeWorld}from'../src/inkbox/io/save.js';

const digest=a=>createHash('sha256').update(new Uint8Array(a.buffer,a.byteOffset,a.byteLength)).digest('hex');
const report={pass:false,maps:[],checks:[]};
const golden=['1c5319f0a0496d0222d93ba53d72bd8d77b9392a92dd260a3e0ed9855b0869f1','22cacfa32110149e5fc4e42540f49e128556511311a47c5db501a77b23aa1385','4fa51df0d5d7dcec5278bf460fa8651547386fc095bd23503798453e1a1b3a0a'];
for(const[at,seed]of[0,1,42].entries())assert.equal(digest(generateNetherStrataCandidate({preset:WORLD_PRESETS.medium,seed}).height),golden[at],'original DN2A byte-for-byte height fixture from 034784d');
function wetComponents(w){const seen=new Uint8Array(w.size);let parts=0;for(let i=0;i<w.size;i++){if(seen[i]||w.water[i]<=.0015)continue;parts++;const q=[i];seen[i]=1;for(let p=0;p<q.length;p++){const v=q[p],x=v%w.w,y=(v/w.w)|0;for(const n of[x>0?v-1:-1,x+1<w.w?v+1:-1,y>0?v-w.w:-1,y+1<w.h?v+w.w:-1])if(n>=0&&!seen[n]&&w.water[n]>.0015){seen[n]=1;q.push(n);}}}return parts;}
function shore(w){let count=0,sum=0,max=0;for(let y=0;y<w.h;y++)for(let x=0;x<w.w;x++){const i=y*w.w+x;for(const n of[x+1<w.w?i+1:-1,y+1<w.h?i+w.w:-1])if(n>=0&&(w.water[i]>.0015)!==(w.water[n]>.0015)){const d=Math.abs(w.height[i]-w.height[n]);sum+=d;max=Math.max(max,d);count++;}}return{count,mean:sum/count,max};}
const families=new Set();
for(const preset of Object.values(WORLD_PRESETS))for(const seed of[0,1,42,20260914,0xffffffff]){
  const w=generateNetherInkArtCandidate({preset,seed}),b=generateNetherInkArtCandidate({preset,seed}),old=generateNetherStrataCandidate({preset,seed});
  for(const field of['height','water','type','veg','moist','temp','riverBase','qi','over'])assert.equal(digest(w[field]),digest(b[field]),'deterministic '+field);
  let min=2,max=0;for(const v of w.height){assert(Number.isFinite(v)&&v>=.059&&v<=1.241);min=Math.min(min,v);max=Math.max(max,v);}
  assert(max-min>.65,'large structural relief remains');assert.equal(wetComponents(w),1,'connected Huangquan');
  const meta=getNetherStrataMetadata(w);assert.equal(meta.version,NETHER_INK_ART_VERSION);families.add(meta.family);
  const a=shore(old),c=shore(w);assert(c.mean<a.mean*.8,'bank blend removes the narrow cutoff jump');assert(c.max<.30,'no accidental hard river shoulder');
  report.maps.push({preset:preset.key,seed,min,max,family:meta.family,repair:meta.repair.repaired,oldShore:a,newShore:c});
  console.log(`${preset.key}/${seed}: bank ${a.mean.toFixed(3)} -> ${c.mean.toFixed(3)}, local repairs ${meta.repair.repaired}`);
}
assert.equal(families.size,3);
const heights=new Float32Array(64*48).fill(.3);
for(let y=3;y<45;y++)for(let x=3;x<20;x++)heights[y*64+x]=1;
for(let y=8;y<40;y++)for(let x=42;x<44;x++)heights[y*64+x]=1;
for(let y=15;y<29;y++)for(let x=27;x<37;x++)heights[y*64+x]=1;
const fix=repairThinNetherRidges(heights,64,48);assert(fix.repaired>0);assert(heights[24*64+42]<.6);assert.equal(heights[24*64+10],1,'wide wall survives');assert.equal(heights[22*64+32],1,'supported rock column survives');
report.checks.push('local unsupported ridge repair preserves broad walls and real pillars');

const world=generateNetherInkArtCandidate({preset:WORLD_PRESETS.small,seed:42}),facts=JSON.stringify(serializeWorld(world));
const stage=new PlaneStage({plane:'nether',world});assert.equal(stage.netherInkflame,null);
SHANHAI_OPTIONS.nether='ink-art';const style=shanhaiStyleFor('nether');
stage.terrain.setArtProfile({...ART_PROFILES['shanhai-v1'],realmStyle:style});stage.terrainLines.setStyle(style.shanhai.lines);
stage.setNetherStrataEnabled(true);
const full={tone:'inkflame',soulfire:'flow',cliffInk:'full',lowMist:true,art:'cangmo',flame:'pale',details:true};
stage.setNetherInkflame(full);stage.update(0);
const layer=stage.netherInkflame,mesh=layer.mesh,geometry=layer.geometry,texture=layer.texture,counts={...layer.stats};
assert(layer.stats.instances>0&&layer.stats.instances<=24&&layer.stats.triangles<=576);
assert.equal(mesh.userData.presentationOnly,true);assert.equal(layer.material.depthTest,true);assert.equal(layer.material.depthWrite,false);assert.equal(layer.material.forceSinglePass,true);
for(const art of['charcoal','cangmo','white']){stage.setNetherInkflame({...full,art});assert.equal(layer.mesh,mesh);assert.equal(layer.geometry,geometry);assert.equal(layer.texture,texture);}
for(let i=0;i<90;i++){stage.update(.016);stage.setNetherInkflameTime(i/10);}
assert.equal(layer.stats.rebuilds,counts.rebuilds);assert.equal(layer.stats.instanceWrites,counts.instanceWrites);
assert.equal(layer.time,8.9,'caller owns animation time');
const clock=stage.terrain.inkMaterial.uniforms.nfClock.value;
stage.setNetherInkflame({...full,soulfire:'off'});assert.equal(layer.mesh,null);
stage.setNetherInkflameTime(200);layer.setTime(200);assert.equal(layer.time,8.9);assert.equal(stage.terrain.inkMaterial.uniforms.nfClock.value,clock,'off does not update time uniforms');
stage.setNetherInkflame(full);
const region={x0:10,y0:10,x1:145,y1:110,contains:(x,y)=>x>=10&&x<=145&&y>=10&&y<=110};
stage.setRegionMask(region,true);const writes=layer.stats.instanceWrites;
for(let i=0;i<8;i++){stage.setRegionMask(region,true);stage.update(0);}
assert.equal(layer.stats.instanceWrites,writes);
const matrix=new THREE.Matrix4(),v=new THREE.Vector3();
for(let i=0;i<layer.mesh.count;i++){layer.mesh.getMatrixAt(i,matrix);const p=layer.geometry.attributes.position;for(let k=0;k<p.count;k++){v.fromBufferAttribute(p,k).applyMatrix4(matrix);assert(region.contains(v.x+(world.w-1)/2,v.z+(world.h-1)/2),'entire curved plume footprint is Region-owned');}}
stage.setRegionMask(null);
const pos=stage.netherCliffs.geometry.attributes.position.array;
assert(stage.netherCliffs.stats.triangles<=19000);
for(let k=0;k<pos.length;k+=3){assert(Number.isFinite(pos[k]+pos[k+1]+pos[k+2]));const x=pos[k]+(world.w-1)/2,y=pos[k+2]+(world.h-1)/2;assert(Math.abs(pos[k+1]-stage.elevation.at(x,y))<1e-4,'overlay vertices use the exact authoritative terrain');}
assert.equal(JSON.stringify(serializeWorld(world)),facts,'render choices, Region and animation never change World or RNG');
assert(stage.scenery.stats.kinds.deadtree<=12,'extra branch tips reuse the twelve-tree instance budget');
let disposed=0;for(const r of[layer.texture,layer.geometry,layer.material])r.addEventListener('dispose',()=>disposed++);
stage.setNetherInkflame({});assert.equal(disposed,3);assert.equal(stage.netherInkflame,null);assert(stage.terrain.inkMaterial.uniforms.nfArt.value.toArray().every(v=>v===0));
stage.setNetherInkflame(full);const previous=stage.netherInkflame;
stage.setWorld(generateNetherInkArtCandidate({preset:WORLD_PRESETS.small,seed:1}));assert(previous.disposed&&previous.world===null);assert.equal(stage.netherInkflame,null);stage.dispose();assert.equal(stage.root.children.length,0);
report.checks.push('single terrain authority; bounded mesh and shared presets; idle cache; off clock; World/RNG purity; full Region footprints; rollback and world replacement release');
const originalRandom=Math.random;try{Math.random=()=>{throw Error('global RNG used');};generateNetherInkArtCandidate({preset:WORLD_PRESETS.small,seed:0});}finally{Math.random=originalRandom;}
report.pass=true;
if(process.env.INKBOX_REPORT_DIR){fs.mkdirSync(process.env.INKBOX_REPORT_DIR,{recursive:true});fs.writeFileSync(path.join(process.env.INKBOX_REPORT_DIR,'technical.json'),JSON.stringify(report,null,2));}
console.log('D-N2A.2 geography, original fixtures, shore continuity, ink fields, Region, clocks, purity and lifecycle passed.');
