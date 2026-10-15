import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {World} from '../src/inkbox/world/World.js';
import {TERRAIN} from '../src/inkbox/core/config.js';
import {Render3DHost} from '../src/inkbox/render3d/Render3DHost.js';
import {RegionGeometry} from '../src/inkbox/render3d/region/RegionGeometry.js';
import {PlanePicker} from '../src/inkbox/render3d/picking/PlanePicker.js';
import {deriveMarkers} from '../src/inkbox/render3d/markers/WorldMarkerLayer.js';
import {leylinePatches,leylinePatchPose} from '../src/inkbox/render3d/markers/LeylineGeographyLayer.js';
import {decorationFootprintOwned} from '../src/inkbox/render3d/environment/RealmDecorationLayer.js';
import {resolvePlaneSubject,planeSubjectInspectRows} from '../src/inkbox/ui/realmInspector.js';
import {readEnvironmentLibrary} from './inkbox-environment-glb-reader.mjs';
import {EnvironmentBatch} from '../src/inkbox/render3d/environment/EnvironmentBatch.js';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const OUT=path.resolve(process.env.INKBOX_REPORT_DIR||path.join(ROOT,'reports/local/m2c2c/leylines'));
const report={suite:'M2-C2C actual-GLB leyline CPU geography',checks:[],pass:false,browser:false};
const sha=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const check=(name,fn)=>{fn();report.checks.push({name,passed:true});console.log(`PASS ${name}`);};
const world=new World(48,36,808);world.height.fill(.55);world.type.fill(TERRAIN.GRASS);
const leyline=world.addLeyline({x:24,y:18,radius:7,strength:.3});
const library=readEnvironmentLibrary(ROOT),camera=new THREE.OrthographicCamera(-24,24,18,-18,.1,2000);
camera.position.set(0,60,60);camera.lookAt(0,0,0);camera.zoom=2;camera.updateProjectionMatrix();camera.updateMatrixWorld(true);
const gpu={info:{memory:{geometries:0,textures:0},render:{calls:0,triangles:0}},setPixelRatio(){},setClearColor(){},setSize(){},render(){},dispose(){}};
const cameraRig={camera,update(){},resize(){},setDimensions(){},dispose(){},focusOn(){}};
let host=new Render3DHost({},world,{gpu,cameraRig,characters:false,environment:false,environmentLibrary:library,productionAssets:true,geography:{leylines:true},lodEnabled:true});
host.resize(900,600);host.update(.3);const stage=host.stages.get('mortal'),markers=stage.markers,layer=markers.leylineGeography;
const view=ppu=>stage.setEnvironmentArtView({pixelsPerUnit:ppu,verticalPixelsPerUnit:ppu,camera});
try{
 check('shipped closed mineral-vein GLB binding and 36/12/4 LOD triangles',()=>{
   const asset=library.assetInfo('mortal.leyline.vein');assert.equal(asset.pick,'leyline');assert.match(asset.binding,/world.leylines/);
   assert.deepEqual(asset.lods.map(n=>library.modules.get(n).triangles),[36,12,4]);
   for(const n of asset.lods){const g=library.geometryFor(asset.id,n),ix=g.index,p=g.attributes.position,edges=new Map();
     const key=i=>[p.getX(i),p.getY(i),p.getZ(i)].map(v=>v.toFixed(6)).join(',');
     for(let i=0;i<ix.count;i+=3)for(let j=0;j<3;j++){const k=[key(ix.getX(i+j)),key(ix.getX(i+(j+1)%3))].sort().join('|');edges.set(k,(edges.get(k)||0)+1);}
     assert([...edges.values()].every(n=>n%2===0));
   }
 });
 check('one authoritative derivation supplies radius/strength and all patches retain same true identity',()=>{
   const derived=deriveMarkers(world).leylines[0];assert.equal(derived.radius,leyline.radius);assert.equal(derived.strength,leyline.strength);
   view(100);assert.equal(layer.stats.instances,10);assert.equal(layer.stats.drawCalls,1);assert.equal(markers.leylines.count,0);
   for(const mesh of layer.batch.meshes.values())for(const ref of mesh.userData.renderLeylines){assert.equal(ref.id,leyline.id);assert.equal(ref.x,leyline.x);assert.equal(ref.y,leyline.y);}
   assert.equal(resolvePlaneSubject(world,'mortal',{kind:'leyline',leylineId:leyline.id}).subject,leyline);
   assert(planeSubjectInspectRows(resolvePlaneSubject(world,'mortal',{kind:'leyline',leylineId:leyline.id})).rows.some(r=>r[0]==='强度'&&r[1]==='0.300'));
 });
 check('real strength change updates continuity and dimensions using same material/color/geometry',()=>{
   const batch=layer.batch,weak=leylinePatches(world,deriveMarkers(world).leylines),geometry=library.geometryFor('mortal.leyline.vein',0),material=batch.material;
   leyline.strength=.9;const before=sha(world);markers.update(.3,world);view(100);
   const strong=layer.patches;assert.equal(layer.stats.instances,19);assert(strong[0].width>weak[0].width);assert(strong[0].depth>weak[0].depth);assert(strong[0].h>weak[0].h);
   assert.equal(layer.batch,batch);assert.equal(layer.batch.material,material);assert.equal(library.geometryFor('mortal.leyline.vein',0),geometry);assert.equal(sha(world),before);
   assert.equal(deriveMarkers(world).leylines[0].strength,.9);report.strength={weakPatches:weak.length,strongPatches:strong.length,weakWidth:weak[0].width,strongWidth:strong[0].width};
 });
 check('actual radius changes layout without assigning new simulation or palette semantics',()=>{
   const before=layer.patches.map(p=>[p.x,p.y]);leyline.radius=10;const sourceSHA=sha(world);markers.update(.3,world);
   assert.notDeepEqual(layer.patches.map(p=>[p.x,p.y]),before);assert.equal(sha(world),sourceSHA);assert.equal(layer.batch.meshes.size,3);
 });
 check('short patch grounding reads current Stage elevation independently',()=>{
   const before=sha(world);for(const mesh of layer.batch.meshes.values())for(let i=0;i<mesh.count;i++){
     const matrix=new THREE.Matrix4();mesh.getMatrixAt(i,matrix);const position=new THREE.Vector3().setFromMatrixPosition(matrix);
     assert(Math.abs(position.y-stage.elevation.at(leyline.x,leyline.y))<1e-5);
   }assert.equal(sha(world),before);
 });
 check('unit quaternion tangent follows actual affine slope without lifting the patch',()=>{
   const p={x:8,y:7,width:.55,depth:.14,h:.2,rotationY:.8},field={at:(x,y)=>x*2+y*.8};
   const pose=leylinePatchPose(field,p),q=new THREE.Quaternion().fromArray(pose.quaternion);assert(Math.abs(q.length()-1)<1e-12);
   assert(Math.abs(pose.ground-field.at(p.x,p.y))<1e-12);assert(pose.normalY<1&&pose.normalY>0);
   for(const x of [-p.width/2,p.width/2])for(const z of [-p.depth/2,p.depth/2]){
     const v=new THREE.Vector3(x,0,z).applyQuaternion(q);assert(Math.abs(pose.ground+v.y-field.at(p.x+v.x,p.y+v.z))<1e-10);
   }
 });
 check('optional quaternion preserves old rotationY transforms and rejects malformed input',()=>{
   const batch=new EnvironmentBatch(library,{material:layer.batch.material,capacity:2,assetIds:['mortal.leyline.vein'],pickField:'renderLeylines'});
   try{
     const record={assetId:'mortal.leyline.vein',lod:0,position:{x:1,y:2,z:3},scale:{x:2,y:.2,z:.3},rotationY:.73,source:leyline};
     const dummy=new THREE.Object3D();dummy.position.set(1,2,3);dummy.scale.set(2,.2,.3);dummy.rotation.set(0,.73,0);dummy.updateMatrix();
     batch.write([record]);const matrix=new THREE.Matrix4();batch.meshes.get('env_leyline_vein_lod0').getMatrixAt(0,matrix);
     assert.deepEqual(matrix.elements,Array.from(new Float32Array(dummy.matrix.elements)));
     for(const quaternion of [[0,0,0,2],[0,0,0],[0,NaN,0,1]])assert.throws(()=>batch.write([{...record,quaternion}]),/finite unit quaternion/);
     const q=new THREE.Quaternion().setFromEuler(new THREE.Euler(.5,.2,0)).toArray();batch.write([{...record,quaternion:q}]);
     batch.meshes.get('env_leyline_vein_lod0').getMatrixAt(0,matrix);dummy.quaternion.fromArray(q);dummy.updateMatrix();
     assert.deepEqual(matrix.elements,Array.from(new Float32Array(dummy.matrix.elements)));
   }finally{batch.dispose();}
 });
 check('each actual submitted quad footprint belongs to same Region; zero coverage restores legacy circle',()=>{
   const region={x0:19,y0:13,x1:28,y1:23,contains:(x,y)=>x>=19&&x<28&&y>=13&&y<23},geometry=new RegionGeometry(world,region);
   markers.setRegionGeometry(geometry,true);markers.update(.3,world);assert(layer.stats.maskRejected>0);
   const admitted=layer.patches.filter(p=>decorationFootprintOwned(world,geometry,true,leylinePatchPose(stage.elevation,p).footprint));assert.equal(layer.stats.instances,admitted.length);
   const thin={x0:24,y0:18,x1:25,y1:19,contains:(x,y)=>x>=24&&x<25&&y>=18&&y<19};
   markers.setRegionGeometry(new RegionGeometry(world,thin),true);markers.update(.3,world);assert.equal(layer.stats.instances,0);assert.equal(markers.leylines.count,1);
   assert.equal(markers.leylines.userData.renderLeylines[0].id,leyline.id);
   markers.setRegionGeometry(null);markers.update(.3,world);
 });
 check('assets/geography toggles preserve fixed batch and World SHA with honest fallback',()=>{
   const before=sha(world),batch=layer.batch;host.setProductionAssetsEnabled(false);host.update(.3);assert.equal(layer.stats.instances,0);assert.equal(markers.leylines.count,1);assert.equal(layer.batch,batch);
   host.setProductionAssetsEnabled(true);host.update(.3);assert(layer.stats.instances>0);assert.equal(layer.batch,batch);
   host.setGeographyFeature('leylines',false);host.update(.3);assert.equal(layer.stats.instances,0);assert.equal(markers.leylines.count,1);
   host.setGeographyFeature('leylines',true);host.update(.3);assert.equal(sha(world),before);report.worldSHA=before;
 });
 check('actual patch triangle raycast resolves current leyline and rejects stale record after removal',()=>{
   view(50);host.scene.updateMatrixWorld(true);const picker=new PlanePicker(host);let pixel=null;
   for(const mesh of layer.batch.meshes.values()){if(!mesh.count)continue;const ix=mesh.geometry.index,p=mesh.geometry.attributes.position,im=new THREE.Matrix4();mesh.getMatrixAt(0,im);
     for(let i=0;i<ix.count&&!pixel;i+=3){const v=new THREE.Vector3();for(let j=0;j<3;j++)v.add(new THREE.Vector3().fromBufferAttribute(p,ix.getX(i+j)));
       v.multiplyScalar(1/3).applyMatrix4(im).applyMatrix4(mesh.matrixWorld).project(camera);const xy=[(v.x+1)*450,(1-v.y)*300],hit=picker.pick(...xy,900,600);if(hit?.kind==='leyline'&&hit.leylineId===leyline.id)pixel=xy;}
   }assert(pixel,'real submitted mineral patch must map to current Leyline');
   world.leylines=[];assert.equal(resolvePlaneSubject(world,'mortal',{kind:'leyline',leylineId:leyline.id}),null);assert(picker.pick(...pixel,900,600)?.kind!=='leyline');markers.update(.3,world);assert.equal(layer.stats.instances,0);assert.equal(markers.leylines.count,0);
   world.leylines.push(leyline);markers.update(.3,world);
 });
 check('fixed-capacity overflow remains measurable; dispose never frees borrowed geometry',()=>{
   for(let i=0;i<40;i++)world.addLeyline({x:24,y:18,radius:7,strength:.9});markers.update(.3,world);assert.equal(layer.stats.instances,256);assert(layer.stats.overflow>0);assert.equal(layer.batch.meshes.size,3);
   let disposed=0;for(const m of library.modules.values())m.geometry.addEventListener('dispose',()=>disposed++);const batch=layer.batch;
   host.dispose();host=null;assert.equal(batch.disposed,true);assert.equal(disposed,0);assert.equal(library.disposed,false);
 });
 report.pass=true;
}catch(error){report.failure=error.stack;console.error(error.stack);process.exitCode=1;}
finally{host?.dispose();library.dispose();fs.mkdirSync(OUT,{recursive:true});fs.writeFileSync(path.join(OUT,'summary.json'),JSON.stringify(report,null,2)+'\n');}
