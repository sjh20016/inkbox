import { decorationFootprintOwned } from '../src/inkbox/render3d/environment/RealmDecorationLayer.js';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { generateUpperWorld } from '../src/inkbox/world/worldgenUpper.js';
import { generateNetherWorld } from '../src/inkbox/world/worldgenNether.js';
import { generateWorld } from '../src/inkbox/world/worldgen.js';
import { serializeWorld, deserializeWorld } from '../src/inkbox/io/save.js';
import { createMapProgress, accessBounds, canAccess, expandMap } from '../src/inkbox/world/mapProgress.js';
import { AccessGeometry, composeAccessGeometry } from '../src/inkbox/render3d/region/AccessGeometry.js';
import { RegionGeometry } from '../src/inkbox/render3d/region/RegionGeometry.js';
import { Render3DHost } from '../src/inkbox/render3d/Render3DHost.js';
import { CameraRig } from '../src/inkbox/render3d/CameraRig.js';
import { createCoordinates } from '../src/inkbox/render3d/coordinates.js';
const checks = [];
function check(label, fn) { fn(); checks.push(label); console.log(`PASS ${label}`); }
const world = generateWorld({ preset: { w: 64, h: 48 }, seed: 42, generationVersion: 2 });
world.upper = generateUpperWorld({ preset: world, seed: world.seed }); world.nether = generateNetherWorld({ preset: world, seed: world.seed });
const mask = { x0: 25, y0: 10, x1: 50, y1: 40, contains(x,y) { return x >= this.x0 && x < this.x1 && y >= this.y0 && y < this.y1; } };
const rg = new RegionGeometry(world, mask);
check('legacy identity and side are preserved; access and realm side are independent', () => {
  for (const inside of [false,true]) {
    const legacy = composeAccessGeometry(world, null, rg, inside); assert.equal(legacy.geometry, rg); assert.equal(legacy.inside, inside);
    const b = { x0: 20, y0: 15, x1: 43, y1: 31 }, access = new AccessGeometry(world,b,rg,inside);
    for (let y=0;y<world.h-1;y++) for(let x=0;x<world.w-1;x++) {
      assert.equal(access.isInsideQuad(x,y), x+.5 >= b.x0 && x+.5 <= b.x1 && y+.5 >= b.y0 && y+.5 <= b.y1 && rg.isInsideQuad(x,y)===inside);
    }
  }
});
check('shared access supports complete geography/FX footprint ownership protocol',()=>{
  const access = new AccessGeometry(world,{x0:20,y0:15,x1:43,y1:31});
  const r={x:30,y:23,width:3,depth:3,rotationY:.3};
  assert.equal(decorationFootprintOwned(world,access,true,r),true);
  assert.equal(decorationFootprintOwned(world,access,true,{...r,x:20}),false);
  assert.equal(decorationFootprintOwned(world,access,true,{...r,x:1}),false);
});
createMapProgress(world,true);
const gpu = { info:{memory:{},render:{}}, setPixelRatio(){},setClearColor(){},setSize(){},render(){},dispose(){} };
const camera = new THREE.OrthographicCamera(-50,50,40,-40,.1,1000);camera.position.set(0,300,0);camera.up.set(0,0,-1);camera.lookAt(0,0,0);camera.updateMatrixWorld();
const accessCalls=[];
const cameraRig={camera,setDimensions(){},update(){},resize(){},setAccessBounds(b,options){accessCalls.push({b,options});},dispose(){}};
const host = new Render3DHost({clientWidth:1000,clientHeight:800},world,{gpu,cameraRig,characters:false,environment:false});
check('Host clips all three stage layers with one content predicate and retains real Region geometry',()=>{
  host.setRealmViewState({open:true,targetPlane:'upper',region:mask});host.update(0);
  for(const stage of host.stages.values()) {
    assert.ok(stage.contentGeometry instanceof AccessGeometry);
    for(const layer of [stage.terrain,stage.water,stage.terrainSides,stage.entities,stage.vegetation,stage.settlements,stage.markers,stage.decorations,stage.realmArtifacts].filter(Boolean)) {
      assert.equal(layer.regionGeometry,stage.contentGeometry); assert.equal(layer.regionInside,true);
    }
  }
  const stage=host.stages.get('upper');assert.equal(stage.regionGeometry.region,mask);assert.notEqual(stage.regionGeometry,stage.contentGeometry);
  const b=accessBounds(world);
  for(let edge=0;edge<host.boundary.edges;edge++)for(let node=0;node<2;node++) {
    const x=host.boundary.edgeNodes[edge*4+node*2],y=host.boundary.edgeNodes[edge*4+node*2+1];assert.ok(x>=b.x0&&x<=b.x1&&y>=b.y0&&y<=b.y1);
  }
  const stable=stage.contentGeometry;host.applyView();assert.equal(stage.contentGeometry,stable);
});
function pick(x,y) {
  host.scene.updateMatrixWorld(true);const p=host.coordinates.cellToRender(x,y);
  const screen=new THREE.Vector3(p.x,0,p.z).project(camera);
  return host.picker.pick((screen.x+1)*500,(1-screen.y)*400,1000,800);
}
check('locked region never picks; opened terrain is pickable; no internal physical sidewalls',()=>{
  host.setRealmViewState({open:false});host.update(0);
  assert.equal(pick(4.2,4.2),null);assert.ok(pick(32.2,24.2));
  assert.equal(host.stages.get('mortal').terrainSides.geometry.drawRange.count,0);
});
check('expansion propagates automatically without changing terrain/identity/realm selection and saves stage',()=>{
  const arrays=[world.height,world.upper.height,world.nether.height],entities=world.entities,heights=Array.from(world.height),seed=world.seed;
  host.setRealmViewState({open:true,targetPlane:'upper',region:mask});
  const actualRegion=host.stages.get('upper').regionGeometry;
  for(let stage=1;stage<=3;stage++) { assert.equal(expandMap(world),true);host.update(.1);assert.equal(host.realmViewState.region,mask);assert.equal(host.stages.get('upper').regionGeometry,actualRegion); }
  assert.equal(world.height,arrays[0]);assert.equal(world.upper.height,arrays[1]);assert.equal(world.nether.height,arrays[2]);assert.deepEqual(Array.from(world.height),heights);assert.equal(world.entities,entities);assert.equal(world.seed,seed);
  assert.equal(host.stages.get('upper').contentGeometry,actualRegion);assert.equal(host.stages.get('mortal').contentInside,false);
  assert.ok(accessCalls.length===4&&accessCalls[1].options.transition);
  const loaded=deserializeWorld(JSON.parse(JSON.stringify(serializeWorld(world))));assert.deepEqual(loaded.mapProgress,{version:1,stage:3});
});
check('Camera focus and pan clamp to access rectangle and expansion feedback completes',()=>{
  const rig=Object.create(CameraRig.prototype);rig.camera=new THREE.OrthographicCamera();rig.camera.position.set(100,200,100);
  rig.dimensions={w:64,h:48};rig.coordinates=createCoordinates(world);rig.controls={target:new THREE.Vector3(0,0,0),update(){}};
  const b={x0:20,y0:15,x1:43,y1:31};rig.setAccessBounds(b);rig.focusOn(-100,1000);const dest=rig.coordinates.renderToWorld(rig.focus.to.x,rig.focus.to.z);assert.deepEqual(dest,{x:20,y:31});
  rig.fit();assert.equal(rig.camera.zoom,rig.accessZoom());
  rig.cancelFocus();rig.controls.target.set(1000,0,-1000);rig.update(0);const p=rig.coordinates.renderToWorld(rig.controls.target.x,rig.controls.target.z);assert.deepEqual(p,{x:43,y:15});
  rig.setAccessBounds(null,{transition:true});rig.update(.5);assert.equal(rig.camera.zoom,1);assert.equal(rig.accessTransition,null);
});
host.dispose();console.log(`M2-C2E expansion CPU contracts: ${checks.length}/${checks.length} passed`);
