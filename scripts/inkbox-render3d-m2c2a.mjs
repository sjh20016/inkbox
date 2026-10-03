import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { LOD_BUDGETS, projectedPixels, chooseLOD, budgetLOD } from '../src/inkbox/render3d/lod/PresentationBudget.js';
import { Render3DHost } from '../src/inkbox/render3d/Render3DHost.js';
import { generateWorld } from '../src/inkbox/world/worldgen.js';
import { generateUpperWorld } from '../src/inkbox/world/worldgenUpper.js';
import { generateNetherWorld } from '../src/inkbox/world/worldgenNether.js';
import { deriveVegetation } from '../src/inkbox/render3d/vegetation/deriveVegetation.js';
import { deriveEntities } from '../src/inkbox/render3d/entities/deriveEntities.js';
import { EntityLayer } from '../src/inkbox/render3d/entities/EntityLayer.js';
import { PlanePicker } from '../src/inkbox/render3d/picking/PlanePicker.js';
import { deriveSettlements } from '../src/inkbox/render3d/settlements/SettlementLayer.js';
import { RegionMask } from '../src/inkbox/ui/RegionMask.js';
import { normalizeRegion } from '../src/inkbox/ui/tools.js';
import { mulberry32 } from '../src/inkbox/core/noise.js';
import { Life } from '../src/inkbox/sim/life.js';
import { UpperLife } from '../src/inkbox/sim/upperLife.js';
import { spawnNetherGhost } from '../src/inkbox/sim/netherLife.js';
import { advanceWorld, createAdvanceState } from '../src/inkbox/sim/advance.js';

const results={suite:'M2-C2A',checks:[],simulation:[]};
const digest=world=>createHash('sha256').update(JSON.stringify(world)).digest('hex');
function check(name, fn){fn();results.checks.push({name,passed:true});console.log(`PASS ${name}`);}
function worldFor(seed=927){
  const preset={w:64,h:48},w=generateWorld({preset,seed,scatter:true});
  w.upper=generateUpperWorld({preset,seed:w.seed});w.nether=generateNetherWorld({preset,seed:w.seed});
  for(let i=0;i<30;i++)spawnNetherGhost(w.nether,{kind:'ghost',decayYears:10});
  return w;
}
function populatedWorld(seed){
  const w=worldFor(seed),deps={life:new Life(w,mulberry32(w.seed^0xa5a5a5a5)),upperLife:new UpperLife(w.upper),state:createAdvanceState(),rng:mulberry32(w.seed^0x1a2b3c4d),nether:true,wraith:true,riftActive:true};
  for(let day=0;day<1440;day++)advanceWorld(w,1,deps);
  assert(w.entities.length>0&&w.villages.some(v=>v.houses?.length),'fixture must have real population and houses');
  return w;
}
function hostFor(w){
  const camera=new THREE.OrthographicCamera(-50,50,40,-40,.1,2000);
  camera.position.set(0,100,100);camera.lookAt(0,0,0);camera.updateMatrixWorld();
  const gpu={info:{memory:{geometries:0,textures:0},render:{calls:0,triangles:0}},setPixelRatio(){},setClearColor(){},setSize(){},render(){},dispose(){}};
  const cameraRig={camera,update(){},resize(){},setDimensions(){},dispose(){},focusOn(){}};
  const host=new Render3DHost({},w,{gpu,cameraRig,characters:false,lodEnabled:true});host.resize(900,600);return host;
}
function view(host, ppu){
  const data={pixelsPerUnit:ppu,verticalPixelsPerUnit:ppu,width:900,height:600,camera:host.cameraRig.camera};
  for(const stage of host.stages.values())for(const layer of [stage.vegetation,stage.entities,stage.settlements])layer?.setArtView(data);
}
function region(w){return new RegionMask(normalizeRegion([[10,9],[44,9],[44,35],[10,35]],w,.45));}
function meshTriangles(root){let n=0;root.traverse(m=>{if(m.isInstancedMesh&&m.visible)n+=m.count*(m.geometry.index?.count??m.geometry.attributes.position.count)/3;});return n;}

check('empty LOD bounds invalidate when a real entity enters the batch',()=>{
  const item={id:42,x:10,y:10,lift:0,color:'#697b83',appearance:{role:'basic'}};
  const derived={human:[],cultivator:[item],beast:[],spirit:[],wraith:[]};
  const coordinates={worldToRender:(x,y)=>({x,z:y}),renderToWorld:(x,z)=>({x,y:z}),renderPointToCell:p=>({x:Math.floor(p.x),y:Math.floor(p.z)})};
  const layer=new EntityLayer({},coordinates,{at:()=>0},{derive:()=>derived});
  const camera=new THREE.OrthographicCamera(-5,5,5,-5,.1,100);
  camera.position.set(10,5,20);camera.lookAt(10,1,10);camera.updateMatrixWorld(true);
  const terrain=new THREE.Mesh(new THREE.BoxGeometry(100,.1,100),new THREE.MeshBasicMaterial());
  terrain.position.set(10,-1,10);
  const scene=new THREE.Scene();scene.add(terrain,layer.group);scene.updateMatrixWorld(true);
  try{
    const mesh=layer.lodMeshes.cultivator[0],ray=new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(0,0),camera);
    assert.equal(ray.intersectObject(mesh,false).length,0);
    assert(mesh.boundingSphere,'empty raycast must cache the sphere that caused the regression');
    layer.setArtProfile({});layer.setLODEnabled(true);
    layer.setArtView({pixelsPerUnit:10,verticalPixelsPerUnit:10,camera});layer.write(derived);
    scene.updateMatrixWorld(true);
    assert.equal(mesh.count,1);assert.equal(mesh.boundingSphere,null);
    const hit=ray.intersectObject(mesh,false)[0];
    assert.equal(mesh.userData.renderEntities[hit?.instanceId]?.id,42);
    const stage={plane:'mortal',visible:true,terrain:{mesh:terrain},entities:layer,coordinates,world:{w:100,h:100}};
    const host={cameraRig:{camera},scene,stages:new Map([['mortal',stage]])};
    assert.equal(new PlanePicker(host).pick(450,300,900,600)?.entityId,42);
  }finally{layer.dispose();terrain.geometry.dispose();terrain.material.dispose();}
});

check('screen projection follows zoom/viewport/vertical tilt and finite dead bands',()=>{
  assert.equal(projectedPixels(3,{pixelsPerUnit:4,verticalPixelsPerUnit:2},1),6);
  assert.equal(projectedPixels(3,{pixelsPerUnit:8,verticalPixelsPerUnit:4},1),12);
  for(const category of ['tree','character','building','settlement']){
    const t=LOD_BUDGETS.thresholds[category];
    assert.equal(chooseLOD(category,1e4,2),0);assert.equal(chooseLOD(category,0,0),2);
    for(let i=0;i<100;i++){
      const px=(t.enterLod0+t.leaveLod0)/2+(i%2?.1:-.1);
      assert.equal(chooseLOD(category,px,0),0);assert.equal(chooseLOD(category,px,1),1);
      const far=(t.enterLod2+t.leaveLod2)/2;
      assert.equal(chooseLOD(category,far,2),2);assert.equal(chooseLOD(category,far,1),1);
    }
    assert.equal(chooseLOD(category,0,2,false),0);
  }
});
check('density budget demotes detailed presentation instead of deleting facts',()=>{
  const counts=[0,0,0];let represented=0;
  for(let i=0;i<2000;i++){const {lod:level}=budgetLOD('tree',0,counts);assert(level>=0&&level<=2);represented++;}
  assert.equal(counts.reduce((a,b)=>a+b,0),represented);assert(counts[1]>0||counts[2]>0);
});
check('tree fixed batches reduce real geometry; camera changes preserve facts and resources',()=>{
  const w=worldFor(),before=digest(w),host=hostFor(w),layer=host.vegetation;
  try{
    host.setArtProfile('pilot');host.setLODEnabled(false);host.update(.3);
    const trees=deriveVegetation(w),noLod=meshTriangles(layer.group||layer.mesh);
    const geometries=[];layer.group.traverse(m=>{if(m.isInstancedMesh)geometries.push(m.geometry);});
    host.setLODEnabled(true);view(host,.1);layer.update();view(host,.1);
    assert.equal(layer.stats.trees,trees.length);assert.equal(layer.stats.lod.reduce((a,b)=>a+b,0),trees.length);
    assert(meshTriangles(layer.group)<noLod*.4);assert.equal(layer.stats.overflow,0);
    for(let i=0;i<90;i++)view(host,i%3===0?.1:i%3===1?10:100);
    const after=[];layer.group.traverse(m=>{if(m.isInstancedMesh)after.push(m.geometry);});
    assert.deepEqual(after,geometries);assert.equal(digest(w),before);
  }finally{host.dispose();}
});
check('all LOD batches use Stage RegionGeometry; realm transitions preserve ownership and identity',()=>{
  const w=populatedWorld(928),before=digest(w),host=hostFor(w);
  try{
    host.setArtProfile('pilot');host.setLODEnabled(true);const mask=region(w);
    for(const targetPlane of ['upper','nether'])for(const px of [.1,10,100]){
      host.setRealmViewState({open:true,targetPlane,region:mask});host.update(.3);view(host,px);host.update(.3);view(host,px);
      for(const stage of host.stages.values()){
        if(!stage.visible)continue;
        const inside=stage.plane===targetPlane;
        for(const layer of [stage.vegetation,stage.entities,stage.settlements])if(layer)assert.equal(layer.regionGeometry,stage.regionGeometry);
        for(const tree of stage.vegetation?.trees||[])assert.equal(stage.regionGeometry.isInsideCell(tree.x,tree.y),inside);
        stage.entities?.group.traverse(mesh=>{
          if(!mesh.isInstancedMesh||!mesh.visible)return;
          const mapped=mesh.userData.renderEntities||[];assert.equal(mapped.length,mesh.count);
          for(const entity of mapped){assert(entity.id!=null);assert.equal(stage.regionGeometry.isInsideCell(entity.x,entity.y),inside);}
        });
      }
    }
    assert.equal(digest(w),before);
  }finally{host.dispose();}
});
check('character detailed/reduced/glyph batches preserve all derived identities',()=>{
  const w=populatedWorld(929),host=hostFor(w);
  try{
    host.setArtProfile('pilot');host.update(.3);
    for(const cls of ['human','cultivator','beast','spirit','wraith']){
      const triangles=g=>(g.index?.count??g.attributes.position.count)/3;
      const detailed=triangles(host.entities.placeholderMeshes[cls].geometry);
      const [mid,far]=host.entities.lodMeshes[cls].map(m=>triangles(m.geometry));
      assert(mid<=detailed&&far<mid,`${cls}: reduced geometry must not exceed L0 and far must reduce again`);
    }
    const expected=Object.values(deriveEntities(w)).filter(Array.isArray).flat().map(e=>e.id).sort((a,b)=>a-b);
    for(const px of [.1,10,100]){
      view(host,px);host.entities.update(.3,w);view(host,px);
      assert.equal(host.entities.stats.instances,expected.length);
      const ids=new Set();host.entities.group.traverse(mesh=>{if(mesh.isInstancedMesh&&mesh.visible)for(const e of mesh.userData.renderEntities||[])ids.add(e.id);});
      assert.deepEqual([...ids].sort((a,b)=>a-b),expected);
    }
  }finally{host.dispose();}
});
check('settlement HLOD remains a prototype, restores real houses and refuses mixed-region clusters',()=>{
  const w=populatedWorld(930),host=hostFor(w),before=digest(w);
  try{
    host.setArtProfile('pilot');host.update(.3);const expected=deriveSettlements(w).buildings.length;
    view(host,.1);host.settlements.update(.3,w);view(host,.1);
    assert.equal(host.settlements.stats.buildings,expected);
    assert(host.settlements.stats.hlod>0,'real villages must exercise far HLOD');
    const mesh=host.settlements.hlod,geometry=mesh.geometry,positions=geometry.attributes.position,index=geometry.index;
    host.scene.updateMatrixWorld(true);const transform=new THREE.Matrix4(),point=new THREE.Vector3();let picked=null;
    for(let instance=0;instance<mesh.count&&!picked;instance++){
      mesh.getMatrixAt(instance,transform);transform.premultiply(mesh.matrixWorld);
      for(let face=0;face<(index?.count??positions.count)&&!picked;face+=3){
        point.set(0,0,0);
        for(let k=0;k<3;k++)point.add(new THREE.Vector3().fromBufferAttribute(positions,index?index.getX(face+k):face+k));
        point.multiplyScalar(1/3).applyMatrix4(transform).project(host.cameraRig.camera);
        const x=(point.x+1)*host.width/2,y=(1-point.y)*host.height/2,hit=host.pick(x,y);
        if(hit?.kind==='settlement'&&hit.settlementId===mesh.userData.renderSettlements[instance].settlementId){
          const ground=host.pickPlane(x,y,'mortal');assert.equal(ground?.kind,'terrain');assert.equal(ground.settlementId,undefined);
          picked=hit;
        }
      }
    }
    assert(picked,'a visible real HLOD must resolve its settlement while drawing still picks terrain');
    view(host,100);host.settlements.update(.3,w);view(host,100);
    assert.equal(host.settlements.stats.buildings,expected);assert.equal(host.settlements.stats.hlod,0);
    const all=deriveSettlements(w).buildings;
    const village=w.villages.find(v=>v.houses.length>2&&new Set(v.houses.map(h=>h.x)).size>1);
    assert(village,'fixture must have a real village crossing a test window');
    const members=all.filter(b=>b.type==='house'&&b.settlementId===village.id);
    const minX=Math.min(...members.map(b=>b.x)),maxX=Math.max(...members.map(b=>b.x));
    const minY=Math.min(...members.map(b=>b.y)),maxY=Math.max(...members.map(b=>b.y));
    const split=new RegionMask(normalizeRegion([[(minX+maxX)/2,minY-1],[maxX+2,minY-1],[maxX+2,maxY+2],[(minX+maxX)/2,maxY+2]],w,.45));
    host.setRealmViewState({open:true,targetPlane:'upper',region:split});host.update(.3);view(host,.1);
    const layer=host.settlements,inside=members.filter(b=>layer.regionGeometry.isInsideCell(b.x,b.y));
    assert(inside.length>0&&inside.length<members.length,'real house members must straddle the test Region');
    assert(!layer.hlod.userData.renderSettlements.some(s=>s.settlementId===village.id),'mixed-region village must refuse HLOD');
    assert.equal(layer.stats.buildings,all.filter(b=>!layer.regionGeometry.isInsideCell(b.x,b.y)).length);
    assert.equal(digest(w),before);
  }finally{host.dispose();}
});
check('600 real simulation days: six render modes produce identical full World SHA-256 and RNG counts',()=>{
  for(const mode of ['no-render','baseline','pilot-no-lod','pilot-lod','pilot-camera','pilot-realms']){
    const w=worldFor(908);let rngCalls=0;const rngByStream={};
    const counted=(name,rng)=>()=>{rngCalls++;rngByStream[name]=(rngByStream[name]||0)+1;return rng();};
    const deps={life:new Life(w,counted('life',mulberry32(w.seed^0xa5a5a5a5))),upperLife:new UpperLife(w.upper),state:createAdvanceState(),rng:counted('advance',mulberry32(w.seed^0x1a2b3c4d)),nether:true,wraith:true,riftActive:true};
    deps.life.warRng=counted('war',deps.life.warRng);
    deps.upperLife.rng=counted('upper',deps.upperLife.rng);deps.upperLife.spatialRng=counted('upperSpatial',deps.upperLife.spatialRng);
    const host=mode==='no-render'?null:hostFor(w),mask=region(w);
    try{
      host?.setArtProfile(mode==='baseline'?'baseline':'pilot');host?.setLODEnabled(!['baseline','pilot-no-lod'].includes(mode));
      for(let day=0;day<600;day++){
        advanceWorld(w,1,deps);
        if(host){
          const count=rngCalls;
          if(mode==='pilot-camera'){host.cameraRig.camera.zoom=1+(day%30)/3;host.cameraRig.camera.updateProjectionMatrix();}
          if(mode==='pilot-realms'&&day%15===0)host.setRealmViewState(day%45===0?{open:false}:{open:true,targetPlane:day%30===0?'upper':'nether',region:mask});
          if(['pilot-camera','pilot-realms'].includes(mode)&&day%20===0)host.setLODEnabled(day%40===0);
          host.update(.2);assert.equal(rngCalls,count,'render does not consume simulation RNG');
        }
      }
      assert.equal(w.day,600);
      assert(w.entities.length>0&&w.upper.entities.length>0&&w.nether.entities.length>0,'purity fixture must contain active populations in all realms');
      assert(rngCalls>0,'RNG audit must observe real simulation consumption');
      const row={mode,days:w.day,sha256:digest(w),rngCalls,rngByStream,populations:{mortal:w.entities.length,upper:w.upper.entities.length,nether:w.nether.entities.length}};results.simulation.push(row);
      if(results.simulation.length>1){assert.equal(row.sha256,results.simulation[0].sha256);assert.equal(row.rngCalls,results.simulation[0].rngCalls);assert.deepEqual(row.rngByStream,results.simulation[0].rngByStream);}
    }finally{host?.dispose();}
  }
});
results.passed=true;
const out=path.resolve(process.env.INKBOX_REPORT_DIR||'reports/m2c2a/core');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'core-results.json'),JSON.stringify(results,null,2));
console.log(`${results.checks.length} M2-C2A groups passed; complete world digest ${results.simulation[0].sha256}`);
