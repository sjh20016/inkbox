import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {World} from '../src/inkbox/world/World.js';
import {TERRAIN} from '../src/inkbox/core/config.js';
import {WorldMarkerLayer,deriveMarkers} from '../src/inkbox/render3d/markers/WorldMarkerLayer.js';
import {RIFT_WOUND_CAPACITY,RIFT_WOUND_STROKES,deriveRiftWoundStrokes} from '../src/inkbox/render3d/markers/RiftWoundLayer.js';
import {leylinePatchPose} from '../src/inkbox/render3d/markers/LeylineGeographyLayer.js';
import {ElevationField} from '../src/inkbox/render3d/terrain/ElevationField.js';
import {createCoordinates} from '../src/inkbox/render3d/coordinates.js';
import {visibleRift} from '../src/inkbox/render3d/readers/riftViewModel.js';
import {RegionGeometry} from '../src/inkbox/render3d/region/RegionGeometry.js';
import {PlanePicker} from '../src/inkbox/render3d/picking/PlanePicker.js';
import {resolvePlaneSubject,planeSubjectInspectRows} from '../src/inkbox/ui/realmInspector.js';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),OUT=path.resolve(process.env.INKBOX_REPORT_DIR||path.join(ROOT,'reports/local/m2c2c/rift-wounds'));
const report={suite:'M2-C2C persistent Rift wounds CPU gate',checks:[],pass:false,browser:false};
const check=(name,fn)=>{fn();report.checks.push({name,passed:true});console.log(`PASS ${name}`);};
const sha=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const world=new World(48,36,445);world.height.fill(.55);world.type.fill(TERRAIN.GRASS);
const upper={id:1,x:15,y:18,age:1800,strength:8,closedDay:-1,openedDay:10,targetPlane:'upper'},nether={...upper,id:2,x:30,targetPlane:'nether'};
world.rifts.push(upper,nether);const coordinates=createCoordinates(world),elevation=new ElevationField(world),markers=new WorldMarkerLayer(world,coordinates,elevation),layer=markers.riftWounds;
markers.setGeographyFeatures({rifts:true});markers.setEnvironmentAssets(null,null,true);markers.update(.3,world);
try{
 check('true Rift source uses only visibleRift radius and real age/target/position',()=>{
   const derived=deriveMarkers(world);assert.equal(derived.rifts[0].radius,visibleRift(upper).radius);assert.equal(derived.rifts[0].age,upper.age);
   const strokes=deriveRiftWoundStrokes(world,derived.rifts);assert.equal(strokes.length,28);
   for(const p of strokes){assert.equal(p.source.radius,visibleRift(world.rifts.find(r=>r.id===p.source.id)).radius);assert(['upper','nether'].includes(p.source.targetPlane));}
   assert.equal(layer.stats.instances,28);assert.equal(layer.stats.drawCalls,1);assert.equal(layer.stats.triangles,336);assert.equal(markers.rifts.count,0);
 });
 check('single shared closed geometry has bounded fixed instances and broken seams without a ring',()=>{
   layer.geometry.computeBoundingBox();assert.equal(layer.geometry.boundingBox.min.y,0);assert.equal(layer.geometry.boundingBox.max.y,1);
   assert.equal(layer.geometry.index.count/3,12);assert.equal(layer.mesh.instanceMatrix.count,RIFT_WOUND_CAPACITY*RIFT_WOUND_STROKES);
   assert.equal(layer.material.transparent,false);assert.equal(layer.material.depthWrite,true);
   const edges=new Map(),ix=layer.geometry.index,p=layer.geometry.attributes.position,key=i=>[p.getX(i),p.getY(i),p.getZ(i)].join(',');
   for(let i=0;i<ix.count;i+=3)for(let j=0;j<3;j++){const k=[key(ix.getX(i+j)),key(ix.getX(i+(j+1)%3))].sort().join('|');edges.set(k,(edges.get(k)||0)+1);}
   assert([...edges.values()].every(n=>n===2));
   const strokes=deriveRiftWoundStrokes(world,deriveMarkers(world).rifts);assert(strokes.every(p=>p.width<=.55));
   assert.equal(strokes.filter(p=>p.source.targetPlane==='nether'&&p.accent==='red').length,1);
   assert.notDeepEqual(layer.color('upper','ink').toArray(),layer.color('nether','ink').toArray());
 });
 check('curved real ElevationField keeps geometry top above terrain for half-to-full-height gap and falls back when fully buried',()=>{
   const probeWorld=new World(20,20,8);probeWorld.type.fill(TERRAIN.GRASS);probeWorld.height.fill(.55);
   const probeRift={id:91,x:10,y:10,age:1800,strength:3,closedDay:-1,targetPlane:'upper'};
   probeWorld.rifts.push(probeRift);const coords=createCoordinates(probeWorld),field=new ElevationField(probeWorld);
   const probeMarkers=new WorldMarkerLayer(probeWorld,coords,field),probe=probeMarkers.riftWounds;
   probe.geometry.computeBoundingBox();
   probeMarkers.setGeographyFeatures({rifts:true});probeMarkers.setEnvironmentAssets(null,null,true);
   try{
     // Search deterministic single-cell curvature magnitudes. The shared
     // geometry's bottom must remain on pose.ground, rather than being lifted.
     let witness=null;
     for(const amount of [.002,.004,.006,.008,.010,.012,.016,.020,.026,.032]){
       probeWorld.height.fill(.55);probeWorld.height[10*probeWorld.w+10]+=(amount);
       probeMarkers.update(.3,probeWorld,{heightChanged:true});
       const candidates=deriveRiftWoundStrokes(probeWorld,deriveMarkers(probeWorld).rifts);
       for(const candidate of candidates){
         const pose=leylinePatchPose(field,candidate),height=candidate.h*pose.normalY,gap=pose.center-pose.ground;
         if(!(gap>.5*height&&gap<height))continue;
         const submitted=probe.mesh.userData.renderRifts.findIndex((ref,n)=>{
           const m=new THREE.Matrix4();probe.mesh.getMatrixAt(n,m);const pos=new THREE.Vector3().setFromMatrixPosition(m);
           const expected=coords.worldToRender(candidate.x,candidate.y,pose.ground);
           return Math.abs(pos.x-expected.x)<1e-5&&Math.abs(pos.z-expected.z)<1e-5;
         });
         if(submitted<0)continue;
         const m=new THREE.Matrix4();probe.mesh.getMatrixAt(submitted,m);
         const actualTop=new THREE.Vector3(0,1,0).applyMatrix4(m),actualBottom=new THREE.Vector3(0,0,0).applyMatrix4(m);
         const topWorld=coords.renderToWorld(actualTop.x,actualTop.z);
         assert(Math.abs(actualBottom.y-pose.ground)<1e-5,'bottom is actual sampled ground');
         assert(actualTop.y>field.at(candidate.x,candidate.y),'actual submitted top clears the terrain center');
         assert(actualTop.y>field.at(topWorld.x,topWorld.y),'actual submitted top also clears terrain at its tilted position');
         assert(pose.ground+.5*height<pose.center,'old centered box top would have been below terrain');
         witness={amount,gap,height,actualTop:actualTop.y,terrain:pose.center};break;
       }
       if(witness)break;
     }
     assert(witness,'real grid curvature must exercise .5h < gap < h');report.curvature=witness;
     // A small real Rift over a single grid peak puts every short stroke
     // across the same bend. Fully rejected geometry must retain its ring.
     let fullyBuried=false;
     for(const strength of [.08,.1,.12,.16,.2,.3,.5])for(const amount of [.02,.05,.1,.2,.3,.4]){
       if(fullyBuried)break;
       probeRift.strength=strength;probeWorld.height.fill(.55);probeWorld.height[10*probeWorld.w+10]+=amount;
       probeMarkers.update(.3,probeWorld,{heightChanged:true});
       const candidates=deriveRiftWoundStrokes(probeWorld,deriveMarkers(probeWorld).rifts);
       if(candidates.length===RIFT_WOUND_STROKES&&candidates.every(p=>{const pose=leylinePatchPose(field,p);return pose.center>=pose.ground+p.h*pose.normalY;})){
         for(const p of candidates){
           const pose=leylinePatchPose(field,p),point=coords.worldToRender(p.x,p.y,pose.ground);
           const matrix=new THREE.Matrix4().compose(new THREE.Vector3(point.x,point.y,point.z),new THREE.Quaternion().fromArray(pose.quaternion),new THREE.Vector3(p.width,p.h,p.depth));
           const actualTop=new THREE.Vector3(0,probe.geometry.boundingBox.max.y,0).applyMatrix4(matrix);
           assert(actualTop.y<=field.at(p.x,p.y),'every rejected actual geometry top fails terrain-center clearance');
         }
         assert.equal(probe.stats.instances,0);assert.equal(probe.renderedIds.has(probeRift.id),false);assert.equal(probeMarkers.rifts.count,1);
         report.buriedCurvature={strength,amount,radius:visibleRift(probeRift).radius,strokes:candidates.length};fullyBuried=true;
       }
     }
     assert(fullyBuried,'all buried strokes must recover truthful legacy fallback');
   }finally{probeMarkers.dispose();}
 });
 check('persistent Rift Region exception remains invariant for both inside/outside masks',()=>{
   const before=Array.from(layer.mesh.instanceMatrix.array),count=layer.mesh.count;
   const region={x0:1,y0:1,x1:5,y1:5,contains:(x,y)=>x>=1&&x<5&&y>=1&&y<5},geometry=new RegionGeometry(world,region);
   markers.setRegionGeometry(geometry,true);markers.update(.3,world);assert.equal(layer.mesh.count,count);assert.deepEqual(Array.from(layer.mesh.instanceMatrix.array),before);
   markers.setRegionGeometry(geometry,false);markers.update(.3,world);assert.equal(layer.mesh.count,count);assert.deepEqual(Array.from(layer.mesh.instanceMatrix.array),before);
 });
 check('actual age/target/position update refreshes records without rewriting World',()=>{
   const before=Array.from(layer.mesh.instanceMatrix.array);upper.age+=30;upper.x+=1;nether.targetPlane='upper';const source=sha(world);
   assert(markers.update(.3,world));assert.notDeepEqual(Array.from(layer.mesh.instanceMatrix.array),before);assert.equal(sha(world),source);
   assert(layer.mesh.userData.renderRifts.some(r=>r.id===1&&r.x===16&&r.age===1830));assert(layer.mesh.userData.renderRifts.filter(r=>r.id===2).every(r=>r.targetPlane==='upper'));
 });
 check('assets/geography off preserves exact legacy counts and reuses the persistent mesh',()=>{
   const source=sha(world),mesh=layer.mesh,geometry=layer.geometry,material=layer.material;
   markers.setEnvironmentAssets(null,null,false);markers.update(.3,world);assert.equal(layer.mesh.count,0);assert.equal(markers.rifts.count,2);assert.equal(markers.rifts.userData.renderRifts,undefined);
   markers.setEnvironmentAssets(null,null,true);markers.setGeographyFeatures({rifts:false});markers.update(.3,world);assert.equal(markers.rifts.count,2);
   markers.setGeographyFeatures({rifts:true});markers.update(.3,world);assert.equal(markers.rifts.count,0);assert.equal(layer.mesh,mesh);assert.equal(layer.geometry,geometry);assert.equal(layer.material,material);assert.equal(sha(world),source);
 });
 check('unknown target is never guessed, closes honestly and leaves fallback ring',()=>{
   const unknown={...upper,id:3,targetPlane:'unmapped'};world.rifts.push(unknown);markers.update(.3,world);assert.equal(markers.rifts.count,1);assert.equal(layer.renderedIds.has(3),false);
   unknown.closedDay=world.day;markers.update(.3,world);assert.equal(markers.rifts.count,0);assert.equal(resolvePlaneSubject(world,'mortal',{kind:'rift',riftId:3}),null);
 });
 check('actual submitted wound triangles pick current Rift; FX is absent and stale closure is rejected',()=>{
   const scene=new THREE.Scene();scene.add(markers.group);const camera=new THREE.OrthographicCamera(-24,24,18,-18,.1,2000);camera.position.set(0,70,70);camera.lookAt(0,0,0);camera.updateProjectionMatrix();camera.updateMatrixWorld(true);
   const stage={world,plane:'mortal',visible:true,terrain:{mesh:new THREE.Mesh(new THREE.BufferGeometry(),new THREE.MeshBasicMaterial())},coordinates,markers};
   const picker=new PlanePicker({cameraRig:{camera},scene,stages:new Map([['mortal',stage]])});scene.updateMatrixWorld(true);let pixel=null;
   const g=layer.geometry,p=g.attributes.position,ix=g.index,im=new THREE.Matrix4();layer.mesh.getMatrixAt(0,im);
   for(let i=0;i<ix.count&&!pixel;i+=3){const v=new THREE.Vector3();for(let j=0;j<3;j++)v.add(new THREE.Vector3().fromBufferAttribute(p,ix.getX(i+j)));v.multiplyScalar(1/3).applyMatrix4(im).applyMatrix4(layer.mesh.matrixWorld).project(camera);
     const xy=[(v.x+1)*450,(1-v.y)*300],hit=picker.pick(...xy,900,600);if(hit?.kind==='rift'&&hit.riftId===upper.id)pixel=xy;}
   assert(pixel);assert.equal(resolvePlaneSubject(world,'mortal',{kind:'rift',riftId:upper.id}).subject,upper);assert(planeSubjectInspectRows(resolvePlaneSubject(world,'mortal',{kind:'rift',riftId:upper.id})).rows.some(r=>r[0]==='通向'&&r[1]==='上界'));
   upper.closedDay=world.day;assert.equal(resolvePlaneSubject(world,'mortal',{kind:'rift',riftId:upper.id}),null);assert(picker.pick(...pixel,900,600)?.riftId!==upper.id);markers.update(.3,world);assert.equal(layer.renderedIds.has(upper.id),false);
   world.rifts.splice(world.rifts.indexOf(nether),1);markers.update(.3,world);assert.equal(layer.mesh.count,0);
   stage.terrain.mesh.geometry.dispose();stage.terrain.mesh.material.dispose();
 });
 check('fixed 64 Rift capacity records overflow and dispose frees shared owned resources once',()=>{
   world.rifts=[];for(let i=0;i<70;i++)world.rifts.push({...nether,id:i+20,closedDay:-1});const source=sha(world);markers.update(.3,world);
   assert.equal(layer.stats.instances,896);assert.equal(layer.stats.overflow,6);assert.equal(layer.stats.fallback,6);assert.equal(markers.rifts.count,6);assert.equal(sha(world),source);report.worldSHA=source;report.stats={...layer.stats};
   let geometry=0,material=0,mesh=0;layer.geometry.addEventListener('dispose',()=>geometry++);layer.material.addEventListener('dispose',()=>material++);layer.mesh.addEventListener('dispose',()=>mesh++);
   markers.dispose();layer.dispose();assert.equal(geometry,1);assert.equal(material,1);assert.equal(mesh,1);
 });
 report.pass=true;
}catch(error){report.failure=error.stack;console.error(error.stack);process.exitCode=1;}
finally{markers.dispose();fs.mkdirSync(OUT,{recursive:true});fs.writeFileSync(path.join(OUT,'summary.json'),JSON.stringify(report,null,2)+'\n');}
