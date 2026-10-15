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
import { deriveRealmArtifacts } from '../src/inkbox/render3d/markers/RealmArtifactLayer.js';
import { resolvePlaneSubject,planeSubjectInspectRows } from '../src/inkbox/ui/realmInspector.js';
import { RegionMask } from '../src/inkbox/ui/RegionMask.js';
import { normalizeRegion } from '../src/inkbox/ui/tools.js';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),OUT=path.resolve(process.env.INKBOX_REPORT_DIR||'reports/m2c2b/pass1/artifacts/node');
const sha=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex'),report={suite:'M2-C2B exact ground artifacts',fixture:'Explicit isolated unit artifacts; natural Edge evidence has separate population coverage',pass:false,checks:[]};
const check=(name,fn)=>{fn();report.checks.push({name,passed:true});console.log('PASS '+name);};
const preset={w:32,h:24},world=generateWorld({preset,seed:826,scatter:true});world.upper=generateUpperWorld({preset,seed:826});world.nether=generateNetherWorld({preset,seed:826});
world.nether.artifacts=[{id:200011,x:7.5,y:8.5,name:'单元法宝甲',slot:'法宝',tier:2,quality:3},{id:200012,x:19.5,y:14.5,name:'单元法宝乙',slot:'饰',tier:1,quality:1}];
const before=sha(world),library=readEnvironmentLibrary(ROOT),camera=new THREE.OrthographicCamera(-40,40,30,-30,.1,2000);camera.position.set(0,100,100);camera.lookAt(0,0,0);camera.updateMatrixWorld(true);
const gpu={info:{memory:{geometries:0,textures:0},render:{calls:0,triangles:0}},setPixelRatio(){},setClearColor(){},setSize(){},render(){},dispose(){}};
const cameraRig={camera,update(){},resize(){},setDimensions(){},dispose(){},focusOn(){}};
const host=new Render3DHost({},world,{gpu,cameraRig,characters:false,environment:false,environmentLibrary:library,productionAssets:true,lodEnabled:true,artProfile:'realm-style-v1'});host.resize(900,600);host.setActivePlane('nether');host.update(.3);
try{
 const stage=host.stages.get('nether'),layer=stage.realmArtifacts;
 check('neutral artifact GLB uses 20/8/4 triangles and never infers a soul lamp',()=>{
  const a=library.assetInfo('nether.artifact.ground');assert.equal(a.binding,'actual world.artifacts');assert.deepEqual(a.lods.map(n=>library.modules.get(n).triangles),[20,8,4]);
  assert(a.lods.every(n=>library.modules.get(n).uvSlots.every(s=>![12,13,14,26].includes(s))));assert.equal(layer.batch.material,stage.environmentMaterial);assert.equal(layer.batch.material.transparent,false);
  assert.deepEqual(deriveRealmArtifacts(world.nether),world.nether.artifacts);assert.deepEqual(deriveRealmArtifacts(world.upper),[]);assert.equal(stage.markers,null);
 });
 check('LOD0/1/2 retain actual artifact IDs, original coordinates and readonly names/slot/tier/quality',()=>{
  const observed=[];for(const ppu of [40,12,2]){layer.setArtView({pixelsPerUnit:ppu,verticalPixelsPerUnit:ppu,camera});layer.update(.3);
   const rows=[...layer.batch.meshes.values()].flatMap(m=>m.userData.renderArtifacts);assert.deepEqual(rows.map(r=>r.id),[200011,200012]);observed.push(layer.stats.lod);}
  assert.deepEqual(observed,[[2,0,0],[0,2,0],[0,0,2]]);assert.equal(sha(world),before);report.lod=observed;
 });
 check('actual submitted geometry resolves an exact artifact and displays its original facts',()=>{
  layer.setArtView({pixelsPerUnit:40,verticalPixelsPerUnit:40,camera});const mesh=layer.batch.meshes.get('env_nether_artifact_lod0'),matrix=new THREE.Matrix4();mesh.getMatrixAt(0,matrix);
  const target=new THREE.Vector3(0,.6,0).applyMatrix4(matrix);camera.position.copy(target).add(new THREE.Vector3(0,30,.1));camera.lookAt(target);camera.updateMatrixWorld(true);camera.updateProjectionMatrix();
  const p=target.clone().project(camera),hit=host.pick((p.x+1)*host.width/2,(1-p.y)*host.height/2);assert.equal(hit.kind,'artifact');assert.equal(hit.artifactId,200011);assert.equal(hit.plane,'nether');
  const resolved=resolvePlaneSubject(world.nether,'nether',hit);assert.equal(resolved.subject,world.nether.artifacts[0]);assert.equal(resolvePlaneSubject(world.nether,'nether',{...hit,artifactId:999}),null);
  const rows=planeSubjectInspectRows(resolved).rows;assert(rows.some(([k,v])=>k==='形制'&&v==='法宝'));assert(rows.some(([k,v])=>k==='品阶'&&v==='宝品'));assert(rows.some(([k,v])=>k==='品质'&&v==='珍品'));
 });
 check('Nether window ownership, production toggle and real removal update only presentation',()=>{
  const region=new RegionMask(normalizeRegion([[3,4],[12,4],[12,12],[3,12]],world,.45));host.setActivePlane('mortal');host.setRealmViewState({open:true,targetPlane:'nether',region});host.update(.3);assert.equal(layer.stats.instances,1);
  host.setProductionAssetsEnabled(false);host.update(.3);assert.equal(layer.stats.instances,0);host.setProductionAssetsEnabled(true);host.update(.3);assert.equal(layer.stats.instances,1);assert.equal(sha(world),before);
  world.nether.artifacts.splice(0,1);const after=sha(world);host.update(.3);assert.equal(layer.stats.instances,0);assert.equal(sha(world),after);
 });
 report.pass=true;report.worldShaBeforePresentation=before;
}finally{host.dispose();library.dispose();fs.mkdirSync(OUT,{recursive:true});fs.writeFileSync(path.join(OUT,'evidence.json'),JSON.stringify(report,null,2)+'\n');}
