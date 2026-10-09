import assert from 'node:assert/strict';
import * as THREE from 'three';
import { fixture } from './inkbox-g1-fixtures.mjs';
import { serializeWorld, deserializeWorld } from '../src/inkbox/io/save.js';
import { createSandboxCharacterRuntime, canvasCharacterCandidates } from '../src/inkbox/g1/sandboxRuntime.js';
import { Render3DHost } from '../src/inkbox/render3d/Render3DHost.js';
import { canAccess } from '../src/inkbox/core/mapAccess.js';

let checks = 0;
function check(label, fn) { fn(); checks++; console.log('PASS ' + label); }
const f = fixture(812), world = f.world, entity = f.entity;
entity.x = 32; entity.y = 20;
const dirty = [], renders = [], effects = [];
const sb = { world, focusPulses: [], personOpenId: null,
  camera: { zoom: 7, relief: false, toScreenX:x=>x*10, toScreenY:y=>y*10, toWorldX:x=>x/10, toWorldY:y=>y/10,
    focusOn(...args){ effects.push(args); } },
  qol: {markDirty:kind=>dirty.push(kind),noteRecent(){}}, notify(){},
  getRealmViewState:()=>({open:false}), refreshWatch(){}, refreshChronicle(){}, refreshNotables(){}, refreshRecent(){},
};
let invoke, choices, selectCandidate, hides = 0;
sb.g1 = createSandboxCharacterRuntime(sb, {
  render(_sb, model, action) { renders.push(model); invoke = action; },
  hide(){ hides++; }, candidates(_sb, list, choose){choices=list; selectCandidate=choose;},
});
const key = 'mortal:' + entity.id;
check('legacy host renders actual model and effects; watch/edict mark save dirty at the command boundary', () => {
  assert.ok(sb.g1.open(key).ok);
  const before = entity.exp;
  assert.ok(invoke({type:'edict',targetKey:key,edictId:'cultivation'}).ok);
  assert.ok(entity.exp > before); assert.deepEqual(dirty,['intervention']);
  assert.ok(invoke({type:'watch',targetKey:key}).ok);
  assert.deepEqual(dirty,['intervention','watch']); assert.equal(world.watch[0].key,key);
  entity.x = 33; sb.g1.refresh(); assert.ok(invoke({type:'focus',targetKey:key}).ok);
  assert.equal(effects.at(-1)[0],33); assert.equal(sb.g1.current().watched,true);
});
check('old DOM callbacks cannot operate after reopening even the same target; new World invalidates choices', () => {
  const oldAction = invoke;
  sb.g1.open(key); const before = JSON.stringify(serializeWorld(world));
  assert.equal(oldAction({type:'edict',targetKey:key,edictId:'mind'}).ok,false);
  assert.equal(JSON.stringify(serializeWorld(world)),before);
  const candidate = {world,entity,key};
  sb.world = deserializeWorld(JSON.parse(before));
  assert.equal(sb.g1.choose(candidate).ok,false);
  assert.equal(sb.g1.refresh(),null); assert.ok(hides > 0);
  assert.ok(sb.g1.open(key).ok);
  sb.world = world; sb.g1.reset();
});
check('Canvas overlapping people are all selectable by stable IDs; candidate click rechecks references', () => {
  world.entities = [entity]; entity.x=32; entity.y=20;
  const second = {...entity,id:entity.id+200000,name:entity.name};
  world.entities.push(second);
  const before = JSON.stringify(serializeWorld(world));
  const candidates = canvasCharacterCandidates(sb,320,200);
  assert.deepEqual(candidates.map(c=>c.key),[key,'mortal:'+second.id]);
  assert.equal(sb.g1.inspectCanvas(320,200),true); assert.equal(choices.length,2);
  assert.ok(selectCandidate(choices[1]).ok); assert.equal(sb.g1.current().identity.id,second.id);
  world.entities[1]={...second}; assert.equal(selectCandidate(choices[1]).ok,false);
  world.entities[1]=second; assert.equal(JSON.stringify(serializeWorld(world)),before);
});
check('Canvas relief follows the exact UnitsLayer projection; locked people never enter candidates', () => {
  sb.camera.relief=true; sb.camera.reliefScale=10;
  world.height[world.idx(32,20)]=.4;
  assert.ok(canvasCharacterCandidates(sb,320,160).some(c=>c.key===key));
  assert.equal(canvasCharacterCandidates(sb,320,200).length,0);
  sb.camera.relief=false;
  world.mapProgress={version:1,stage:0}; entity.x=2;entity.y=2;
  assert.equal(canAccess(world,2,2),false); assert.equal(canvasCharacterCandidates(sb,20,20).length,0);
  assert.equal(sb.g1.open(key).ok,false);
  world.mapProgress.stage=3; entity.x=32;entity.y=20;
});
check('Canvas nether windows cannot pick mortal people at the same screen/world coordinate', () => {
  const ghost = {...entity,id:entity.id,sp:'ghost'};
  world.nether.entities=[ghost];
  sb.getRealmViewState=()=>({open:true,targetPlane:'nether',region:{contains:(x,y)=>x>20&&x<45&&y>10&&y<30}});
  assert.equal(canvasCharacterCandidates(sb,320,200,'mortal').length,0);
  const hits=canvasCharacterCandidates(sb,320,200,'nether');
  assert.equal(hits.length,1); assert.equal(hits[0].key,'nether:'+ghost.id);
  assert.ok(sb.g1.choose(hits[0]).ok); assert.equal(sb.g1.current().identity.plane,'nether');
  sb.getRealmViewState=()=>({open:false});
});

check('real PlanePicker submitted geometry returns actual plane/ID; runtime consumes that identity', () => {
  world.entities=[entity]; entity.x=32.5;entity.y=20.5;
  world.height.fill(.2);world.water.fill(0);world.veg.fill(0);world.over.fill(0);world.struct.fill(0);
  world.villages=[]; world.factions=[];
  world.nether.height.fill(.2);world.nether.water.fill(0);world.nether.veg.fill(0);world.nether.entities=[];
  const camera=new THREE.OrthographicCamera(-50,50,40,-40,.1,1000);
  camera.position.set(0,300,0);camera.up.set(0,0,-1);camera.lookAt(0,0,0);camera.updateMatrixWorld();
  const gpu={info:{memory:{},render:{}},setPixelRatio(){},setClearColor(){},setSize(){},render(){},dispose(){}};
  const rig={camera,setDimensions(){},setAccessBounds(){},update(){},resize(){},dispose(){}};
  const host=new Render3DHost({clientWidth:1000,clientHeight:800},world,{gpu,cameraRig:rig,characters:false,environment:false,decorations:false,geography:false});
  function pick(x,y) {
    host.scene.updateMatrixWorld(true);
    const p=host.coordinates.cellToRender(x,y), screen=new THREE.Vector3(p.x,0,p.z).project(camera);
    return host.picker.pick((screen.x+1)*500,(1-screen.y)*400,1000,800);
  }
  try {
    host.update(0); const hit=pick(entity.x,entity.y);
    assert.equal(hit.kind,'entity'); assert.equal(hit.entityId,entity.id); assert.equal(hit.plane,'mortal');
    assert.ok(sb.g1.open({plane:hit.plane,entityId:hit.entityId}).ok);
    const ghost={...entity,id:entity.id,sp:'ghost'};world.nether.entities=[ghost];
    const region={x0:20,y0:10,x1:45,y1:30,contains:(x,y)=>x>=20&&x<=45&&y>=10&&y<=30};
    host.setRealmViewState({open:true,targetPlane:'nether',region});host.update(0);
    const netherHit=pick(ghost.x,ghost.y);
    assert.equal(netherHit.plane,'nether');assert.equal(netherHit.entityId,ghost.id);
    assert.ok(sb.g1.open({plane:netherHit.plane,entityId:netherHit.entityId}).ok);
    world.mapProgress.stage=0;assert.equal(pick(2.5,2.5),null);
    ghost.hp=0;assert.equal(sb.g1.refresh().identity.canFocus,false);
  } finally {host.dispose();}
});
sb.g1.destroy();
console.log('G1 host contracts: ' + checks + '/' + checks + ' passed');
