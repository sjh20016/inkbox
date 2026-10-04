import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { readEnvironmentLibrary } from './inkbox-environment-glb-reader.mjs';
import { Render3DHost } from '../src/inkbox/render3d/Render3DHost.js';
import { generateWorld } from '../src/inkbox/world/worldgen.js';
import { generateUpperWorld } from '../src/inkbox/world/worldgenUpper.js';
import { generateNetherWorld } from '../src/inkbox/world/worldgenNether.js';
import { SPECIES } from '../src/inkbox/core/config.js';
import { deriveNetherEntities, deriveEntities } from '../src/inkbox/render3d/entities/deriveEntities.js';
import { ghostAssetFor, ordinaryNetherGhost } from '../src/inkbox/render3d/entities/ghostFamily.js';
import { resolvePlaneSubject } from '../src/inkbox/ui/realmInspector.js';
import { RegionMask } from '../src/inkbox/ui/RegionMask.js';
import { normalizeRegion } from '../src/inkbox/ui/tools.js';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const OUT=path.resolve(process.env.INKBOX_REPORT_DIR||'reports/m2c2b/pass1/content/node');
const sha=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const report={suite:'M2-C2B content CPU',fixture:'Explicit unit facts; natural production population and visual proof are measured separately in Edge',checks:[],pass:false};
const check=(name,fn)=>{fn();report.checks.push({name,passed:true});console.log('PASS '+name);};
const preset={w:32,h:24},world=generateWorld({preset,seed:795,scatter:true});
world.upper=generateUpperWorld({preset,seed:795});world.nether=generateNetherWorld({preset,seed:795});
const ids=[];for(let id=1;ids.filter(Boolean).length<3;id++){const variant=Number(ghostAssetFor(world.nether.seed,id).at(-1));if(!ids[variant])ids[variant]=id;}
world.nether.entities=ids.map((id,i)=>({id,x:5+i*6,y:8,sp:SPECIES.GHOST,level:0,soulKind:'ghost'}));
world.nether.entities.push({id:51,x:8,y:17,sp:SPECIES.GHOST,level:18,soulKind:'ghostCultivator'});
const before=sha(world),library=readEnvironmentLibrary(ROOT);
const camera=new THREE.OrthographicCamera(-40,40,30,-30,.1,2000);camera.position.set(0,100,100);camera.lookAt(0,0,0);camera.updateMatrixWorld(true);
const gpu={info:{memory:{geometries:0,textures:0},render:{calls:0,triangles:0}},setPixelRatio(){},setClearColor(){},setSize(){},render(){},dispose(){}};
const cameraRig={camera,update(){},resize(){},setDimensions(){},dispose(){},focusOn(){}};
const host=new Render3DHost({},world,{gpu,cameraRig,characters:false,environment:false,environmentLibrary:library,productionAssets:true,lodEnabled:true,artProfile:'realm-style-v1'});
host.resize(900,600);host.setActivePlane('nether');host.update(.3);
try{
 const stage=host.stages.get('nether'),layer=stage.entities;
 check('three actual opaque shipping silhouettes share one Stage material and one far geometry',()=>{
  for(let i=0;i<3;i++){const a=library.assetInfo(`nether.ghost.${i}`);assert.deepEqual(a.lods.map(n=>library.modules.get(n).triangles),[36,16,6]);assert.equal(library.geometryFor(`nether.ghost.${i}`,2),library.geometryFor('nether.ghost.0',2));}
  assert.equal(layer.ghostBatch.material,stage.environmentMaterial);assert.equal(layer.ghostBatch.material.transparent,false);assert(layer.ghostBatch.material.depthWrite);
  assert.equal(layer.ghostBatch.material.uniforms.uEnvironmentAtlas.value,library.texture);
 });
 check('only ordinary Nether entities use the family; ghostCultivator and Mortal wraith preserve existing semantics',()=>{
  const d=deriveNetherEntities(world.nether);assert.equal(d.total,4);assert.equal(d.wraith.filter(e=>ordinaryNetherGhost(world.nether,e)).length,3);
  assert.equal(d.wraith.find(e=>e.id===51).appearance.role,'ghost');
  for(const e of d.wraith)assert(!ordinaryNetherGhost(world,e));
  assert(deriveEntities(world).wraith.every(e=>!ordinaryNetherGhost(world,e)));
  const m=JSON.parse(fs.readFileSync(path.join(ROOT,'assets/characters/cultivator/data/cultivator_manifest.json')));
  assert.equal(m.roles.ghost.body,m.roles.basic.body);assert.equal(m.roles.ghost.hair,'hair_ghost');assert.equal(m.roles.ghost.prop,'soul_lamp');
 });
 check('camera LOD0/1/2 preserves all original ghost IDs and deterministic family assignments',()=>{
  const observed=[];
  for(const ppu of [30,12,2]){layer.setArtView({pixelsPerUnit:ppu,verticalPixelsPerUnit:ppu,camera,width:900,height:600});layer.update(.3,world.nether);
   const records=[...layer.ghostBatch.meshes.values()].flatMap(m=>m.userData.renderEntities);
   assert.deepEqual(records.map(e=>e.id).sort((a,b)=>a-b),ids.slice().sort((a,b)=>a-b));assert.equal(layer.stats.instances,4);observed.push(layer.ghostBatch.stats.lod);}
  assert.deepEqual(observed,[[3,0,0],[0,3,0],[0,0,3]]);report.lod=observed;
 });
 check('actual shipping silhouette raycast resolves the exact Nether entity container',()=>{
  layer.setArtView({pixelsPerUnit:30,verticalPixelsPerUnit:30,camera});layer.update(.3,world.nether);
  const mesh=[...layer.ghostBatch.meshes.values()].find(m=>m.count),source=mesh.userData.renderEntities[0],matrix=new THREE.Matrix4();mesh.getMatrixAt(0,matrix);
  const at=new THREE.Vector3(0,.6,0).applyMatrix4(matrix);camera.position.copy(at).add(new THREE.Vector3(0,30,.1));camera.lookAt(at);camera.updateMatrixWorld(true);camera.updateProjectionMatrix();
  const p=at.clone().project(camera),hit=host.pick((p.x+1)*host.width/2,(1-p.y)*host.height/2);
  assert.equal(hit.kind,'entity');assert.equal(hit.plane,'nether');assert.equal(hit.entityId,source.id);assert.equal(hit.entityContainer,'entities');assert.equal(resolvePlaneSubject(world.nether,'nether',hit).subject.id,source.id);
 });
 check('region filtering and production off/on preserve World, shared geometry and original identities',()=>{
  const region=new RegionMask(normalizeRegion([[3,5],[10,5],[10,11],[3,11]],world,.45));
  host.setActivePlane('mortal');host.setRealmViewState({open:true,targetPlane:'nether',region});host.update(.3);
  const records=[...layer.ghostBatch.meshes.values()].flatMap(m=>m.userData.renderEntities);assert(records.length>0&&records.length<3);assert(records.every(e=>stage.regionGeometry.isInsideCell(e.x,e.y)));
  host.setProductionAssetsEnabled(false);host.update(.3);assert.equal(layer.ghostBatch.stats.instances,0);
  host.setProductionAssetsEnabled(true);host.update(.3);assert.equal(layer.ghostBatch.stats.instances,records.length);assert.equal(sha(world),before);
 });
 report.pass=true;report.worldSha=before;
}finally{host.dispose();assert(!library.disposed);library.dispose();fs.mkdirSync(OUT,{recursive:true});fs.writeFileSync(path.join(OUT,'evidence.json'),JSON.stringify(report,null,2)+'\n');}
