import { PlanePicker } from '../src/inkbox/render3d/picking/PlanePicker.js';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ElevationField } from '../src/inkbox/render3d/terrain/ElevationField.js';
import { TerrainMesh } from '../src/inkbox/render3d/terrain/TerrainMesh.js';
import { TerrainSideLayer } from '../src/inkbox/render3d/terrain/TerrainSideLayer.js';
import { WaterLayer } from '../src/inkbox/render3d/water/WaterLayer.js';
import { quadIndices } from '../src/inkbox/render3d/terrain/topology.js';
import { createCoordinates } from '../src/inkbox/render3d/coordinates.js';
import { RegionGeometry } from '../src/inkbox/render3d/region/RegionGeometry.js';
import { generateWorld } from '../src/inkbox/world/worldgen.js';
import { PlaneStage } from '../src/inkbox/render3d/stage/PlaneStage.js';
const checks=[];
function check(label,fn){fn();checks.push(label);console.log(`PASS ${label}`);}
function world(version=2){return {w:3,h:3,size:9,seed:42,generation:{version},height:Float32Array.from([.3,.9,.6,.8,.31,.5,.2,.4,.7]),water:new Float32Array(9),type:new Uint8Array(9)};}
check('v1 retains historical diagonal and v2 selects both diagonals from real heights',()=>{
  assert.deepEqual(quadIndices(world(1),0,0),[0,3,1,1,3,4]);
  assert.deepEqual(quadIndices(world(),0,0),[0,3,4,0,4,1]);
  const w=world();w.height[4]=0;assert.deepEqual(quadIndices(w,0,0),[0,3,1,1,3,4]);
});
check('terrain triangles and ElevationField agree with physical raycasts before and after sculpt dirty',()=>{
  const w=world(),c=createCoordinates(w),e=new ElevationField(w),t=new TerrainMesh(w,c,e);
  const test=()=>{t.mesh.updateMatrixWorld();for(let y=.1;y<2;y+=.17)for(let x=.1;x<2;x+=.13){
    const p=c.cellToRender(x,y),ray=new THREE.Raycaster(new THREE.Vector3(p.x,150,p.z),new THREE.Vector3(0,-1,0));
    const hit=ray.intersectObject(t.mesh)[0];assert.ok(hit);assert.ok(Math.abs(hit.point.y-e.at(x,y))<1e-5);
  }};test();w.height[4]=0;t.update({x0:1,y0:1,x1:1,y1:1},{height:true,type:false});test();t.dispose();
});
check('wet-domain clipping removes dry triangles, follows source interpolation and updates locally',()=>{
  const w=world(),c=createCoordinates(w),e=new ElevationField(w),water=new WaterLayer(w,c,e);w.water[0]=.03;
  water.setClipped(true);assert.equal(water.geometry.drawRange.count,18);
  const attr=water.geometry.attributes.position,first=attr.array.slice(0,36),unaffected=attr.array.slice(108,144);
  const threshold=.0015,ratio=(.03-threshold)/.03;
  const shore=c.cellToRender(0,ratio);assert.ok(Math.abs(attr.getZ(1)-shore.z)<1e-6);
  const expected=Math.fround(e.nodeForHeight(w.height[0]+w.water[0]))+.04+ratio*(Math.fround(e.nodeForHeight(w.height[3]))-Math.fround(e.nodeForHeight(w.height[0]+w.water[0])));
  assert.ok(Math.abs(attr.getY(1)-expected)<1e-5);
  w.water[0]=0;water.update({x0:0,y0:0,x1:0,y1:0});assert.equal(water.geometry.drawRange.count,0);
  assert.deepEqual(attr.array.slice(108,144),unaffected);assert.equal(water.clipCounts[0],0);water.dispose();
});
check('water perimeter curtains match terrain bottoms and clipped water tops with no internal wall',()=>{
  const w=world();w.water.fill(.02);const c=createCoordinates(w),e=new ElevationField(w),water=new WaterLayer(w,c,e);water.setClipped(true);
  const a=water.geometry.attributes.position,base=4*12;
  assert.equal(water.rimEdges.length,8);
  for(let k=0;k<8;k++){const [x,y,bx,by]=water.rimEdges[k];assert.equal(a.getY(base+k*6),Math.fround(e.node(x,y)));
    assert.equal(a.getY(base+k*6+1),Math.fround(Math.fround(e.nodeForHeight(w.height[y*w.w+x]+w.water[y*w.w+x],x,y))+.04));
    assert.ok(x===0&&bx===0||y===0&&by===0||x===2&&bx===2||y===2&&by===2);}
  water.dispose();
});
check('clipped Region filtering and repeated geometry hot switches restore and catch up',()=>{
  const w=world();w.water.fill(.02);const water=new WaterLayer(w,createCoordinates(w));water.setClipped(true);
  const r=new RegionGeometry(w,{x0:0,y0:0,x1:1,y1:1,contains:(x,y)=>x<1&&y<1});
  water.setRegionGeometry(r,true);assert.equal(water.geometry.drawRange.count,18);
  water.setClipped(false);assert.equal(water.geometry,water.legacyGeometry);assert.equal(water.geometry.drawRange.count,6);
  w.water.fill(0);water.update({x0:0,y0:0,x1:2,y1:2});water.setClipped(true);assert.equal(water.geometry.drawRange.count,0);
  water.setRegionGeometry(r,false);w.water.fill(.02);water.update({x0:0,y0:0,x1:2,y1:2});assert.equal(water.geometry.drawRange.count,54);water.dispose();
});
check('outside walls cover only world perimeter and track terrain/profile/Region exactly',()=>{
  const w=world(),e=new ElevationField(w),side=new TerrainSideLayer(w,createCoordinates(w),e);assert.equal(side.edges.length,8);
  const r=new RegionGeometry(w,{x0:0,y0:0,x1:1,y1:1,contains:(x,y)=>x<1&&y<1});
  side.setRegionGeometry(r,true);assert.equal(side.geometry.drawRange.count,12);
  for(const [ax,ay,bx,by] of side.edges)assert.ok(ax===0&&bx===0||ay===0&&by===0||ax===2&&bx===2||ay===2&&by===2);
  w.height[0]=.6;side.update({x0:0,y0:0,x1:0,y1:0});assert.equal(side.geometry.attributes.position.getY(0),Math.fround(e.at(0,0)));
  e.setProfile({datum:3,relief:.7});side.update();assert.equal(side.geometry.attributes.position.getY(0),Math.fround(e.at(0,0)));side.dispose();
});
check('height edits refresh vegetation and outside sides in the same Stage update',()=>{
  const w=generateWorld({preset:{w:16,h:12},seed:1234,scatter:false});const stage=new PlaneStage({plane:'mortal',world:w});
  stage.update(.2);let rebuilt=0;stage.vegetation.update=()=>rebuilt++;w.height[0]+=.05;stage.update(.001);assert.equal(rebuilt,1);
  assert.equal(stage.terrainSides.geometry.attributes.position.getY(0),Math.fround(stage.elevation.at(0,0)));stage.dispose();
});
check('opaque world edge wins depth; onlyPlane still samples terrain',()=>{
  const w=world();w.height=Float32Array.from([.6,.35,.1,.6,.35,.1,.6,.35,.1]);
  const c=createCoordinates(w),e=new ElevationField(w),t=new TerrainMesh(w,c,e),side=new TerrainSideLayer(w,c,e);
  const scene=new THREE.Scene();scene.add(t.mesh,side.mesh);
  const stage={plane:'mortal',world:w,coordinates:c,terrain:t,terrainSides:side,visible:true};
  const picker=new PlanePicker({stages:new Map([['mortal',stage]]),scene,cameraRig:{camera:new THREE.PerspectiveCamera()}});
  picker.raycaster.setFromCamera=()=>picker.raycaster.ray.set(new THREE.Vector3(-3,0,0),new THREE.Vector3(1,.5,0).normalize());
  const hit=picker.pick(1,1,2,2),wall=picker.raycaster.intersectObject(side.mesh)[0];
  assert.equal(hit.kind,'world-edge');assert.equal(hit.distance,wall.distance);
  const terrainHit=picker.pick(1,1,2,2,'mortal');assert.equal(terrainHit.kind,'terrain');assert.ok(terrainHit.distance>hit.distance);
  t.dispose();side.dispose();
});
check('profile refresh grounds layers immediately without Bridge scan or clock advance',()=>{
  const w=generateWorld({preset:{w:16,h:12},seed:1234,scatter:false}),s=new PlaneStage({plane:'mortal',world:w});
  s.setSelection(0,0);s.update(.2);const calls=[];
  for(const key of ['vegetation','entities','settlements','markers']){
    const original=s[key].update.bind(s[key]);s[key].update=(...args)=>{calls.push([key,args[0]]);return original(...args);};
  }
  s.bridge.changes=()=>{throw Error('profile refresh must not scan Bridge');};
  s.setElevationProfile({datum:3,relief:.7});
  assert.ok(Math.abs(s.selectionMarker.mesh.position.y-(s.elevation.at(0,0)+.18))<1e-9);
  assert.equal(s.vegetationPending,false);assert.equal(s.treeClock,0);
  assert.deepEqual(calls.map(c=>c[0]),['vegetation','entities','settlements','markers']);
  for(const [,dt]of calls.slice(1))assert.equal(dt,0);
  s.dispose();
});
console.log(`M2-C2E geometry CPU contracts: ${checks.length}/${checks.length} passed`);
