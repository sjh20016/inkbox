// G2-P0.2 transform-only cache: frozen BASE writer equivalence; no GPU.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import * as THREE from 'three';
import { WebGLAttributes } from 'three/src/renderers/webgl/WebGLAttributes.js';
import { VegetationLayer } from '../src/inkbox/render3d/vegetation/VegetationLayer.js';
import { generateWorld } from '../src/inkbox/world/worldgen.js';
import { createCoordinates } from '../src/inkbox/render3d/coordinates.js';
import { deriveVegetation } from '../src/inkbox/render3d/vegetation/deriveVegetation.js';
import { TREE_VARIANT_SCALES, treeVariantIndex } from '../src/inkbox/render3d/vegetation/treeVariation.js';
import { ART_PROFILES } from '../src/inkbox/render3d/art/ArtPassProfile.js';
import { REALM_STYLES } from '../src/inkbox/render3d/art/RealmStyleProfile.js';
import { RegionGeometry } from '../src/inkbox/render3d/region/RegionGeometry.js';
import { RegionMask } from '../src/inkbox/ui/RegionMask.js';
import { normalizeRegion } from '../src/inkbox/ui/tools.js';

assert.equal(THREE.REVISION, '186', 'Test requires shipped Three 0.186.1');
assert.equal(JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.resolve('three')))).version, '0.186.1');
const BASE='e071e832e78857fc9de84cf6af2ca78764717330';
const SOURCE='src/inkbox/render3d/vegetation/VegetationLayer.js';
const baselineSourceHash='dfa7a2430b7672131824df2ff7469f860238fc05b5d1e326982892703ba3d213';
const originalBody=`const dummy = this._dummy, counts = this._batchCounts;
    const varied = this.artProfile?.realmStyle?.plane === 'mortal';
    this._variantCounts.fill(0);
    let matrixInstancesWritten = 0;
    counts.fill(0);
    for (const mesh of this.lodMeshes) mesh.userData.renderTrees = [];
    for (const tree of this.trees) {
      const lod = this._lodByTree.get(tree.cell) ?? 0;
      const p = this.coordinates.worldToRender(tree.x, tree.y, this.elevation.at(tree.x, tree.y));
      dummy.position.set(p.x, p.y, p.z); dummy.scale.setScalar(tree.size);
      const variant = varied ? treeVariantIndex(this.world.seed, tree.cell) : 0;
      this._variantCounts[variant]++;
      if (varied) {
        const scale = TREE_VARIANT_SCALES[variant];
        dummy.scale.set(tree.size * scale[0], tree.size * scale[1], tree.size * scale[2]);
      }
      const tint = varied ? this._variantTints[variant] : this._whiteTint;
      const target = this.lodMeshes[lod];
      if (lod === 0 && !this.artProfile) {
        for (let side = 0; side < 2; side++) {
          dummy.rotation.y = tree.rotation + side * Math.PI / 2;
          dummy.updateMatrix(); target.setColorAt(counts[lod], tint); target.setMatrixAt(counts[lod]++, dummy.matrix); matrixInstancesWritten++;
          target.userData.renderTrees.push(tree);
        }
      } else {
        dummy.rotation.y = tree.rotation;
        dummy.updateMatrix(); target.setColorAt(counts[lod], tint); target.setMatrixAt(counts[lod]++, dummy.matrix); matrixInstancesWritten++;
        target.userData.renderTrees.push(tree);
      }
    }
    for (let lod = 0; lod < 3; lod++) {
      const mesh = this.lodMeshes[lod];
      mesh.count = counts[lod];
      if (counts[lod] > 0) {
        // Keep earlier pending ranges until Three submits their union. Hidden
        // empty batches need no new upload; fixed-capacity tail is not drawn.
        mesh.instanceMatrix.addUpdateRange(0, counts[lod] * 16);
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) {
          mesh.instanceColor.addUpdateRange(0, counts[lod] * 3);
          mesh.instanceColor.needsUpdate = true;
        }
      }
      mesh.boundingBox = null; mesh.boundingSphere = null;
      mesh.visible = counts[lod] > 0;
    }
    return matrixInstancesWritten;`;
if(process.argv.includes('--historical'))assert.equal(createHash('sha256').update(execFileSync('git',['show',`${BASE}:${SOURCE}`],{encoding:'utf8',windowsHide:true})).digest('hex'),baselineSourceHash);
const oracle=new Function('TREE_VARIANT_SCALES','treeVariantIndex',`return function(){${originalBody}}`)(TREE_VARIANT_SCALES,treeVariantIndex);
const world=generateWorld({preset:{w:64,h:48},seed:673231,scatter:true,generationVersion:2,terrainPreset:'standard'});
const beforeHash=createHash('sha256').update(JSON.stringify(world)).digest('hex');
const candidate=new VegetationLayer(world,createCoordinates(world)),reference=new VegetationLayer(world,createCoordinates(world));
reference._writeMatrices=oracle;
const layers=[candidate,reference],profile={...ART_PROFILES.pilot,realmStyle:REALM_STYLES.mortal};
const checks=[];
const check=(name,fn)=>{fn();checks.push(name);console.log('PASS '+name);};
const identities=layers.map(layer=>layer.lodMeshes.map(mesh=>({mesh,matrix:mesh.instanceMatrix,array:mesh.instanceMatrix.array,color:mesh.instanceColor,colorArray:mesh.instanceColor?.array,capacity:mesh.instanceMatrix.count})));
function assertIdentities(){for(let i=0;i<layers.length;i++)for(let lod=0;lod<3;lod++){const mesh=layers[i].lodMeshes[lod],saved=identities[i][lod];assert.equal(mesh,saved.mesh);assert.equal(mesh.instanceMatrix,saved.matrix);assert.equal(mesh.instanceMatrix.array,saved.array);assert.equal(mesh.instanceMatrix.count,saved.capacity);if(!saved.color&&mesh.instanceColor){saved.color=mesh.instanceColor;saved.colorArray=mesh.instanceColor.array;}assert.equal(mesh.instanceColor,saved.color);assert.equal(mesh.instanceColor?.array,saved.colorArray);}}
const prefix=(attribute,count,width)=>attribute?Buffer.from(attribute.array.buffer,attribute.array.byteOffset,count*width*attribute.array.BYTES_PER_ELEMENT):null;
function equalOutputs(label){
  assert.deepEqual(candidate.stats,reference.stats,label+' stats');assert.deepEqual([...candidate._lodByTree],[...reference._lodByTree],label+' LOD order');assert.deepEqual(candidate.trees,reference.trees,label+' source facts');
  for(let lod=0;lod<3;lod++){const a=candidate.lodMeshes[lod],b=reference.lodMeshes[lod];assert.equal(a.count,b.count);assert.equal(a.visible,b.visible);assert.deepEqual(prefix(a.instanceMatrix,a.count,16),prefix(b.instanceMatrix,b.count,16),label+' matrix bytes LOD'+lod);assert.deepEqual(prefix(a.instanceColor,a.count,3),prefix(b.instanceColor,b.count,3),label+' color bytes LOD'+lod);assert.deepEqual(a.userData.renderTrees,b.userData.renderTrees);const ownFacts=new Set(candidate.trees);assert(a.userData.renderTrees.every(tree=>ownFacts.has(tree)),'renderTrees must use this refresh source objects');assert.deepEqual(a.instanceMatrix.updateRanges,b.instanceMatrix.updateRanges,'matrix ranges');assert.deepEqual(a.instanceColor?.updateRanges,b.instanceColor?.updateRanges,'color ranges');assert.equal(a.boundingBox,null);assert.equal(a.boundingSphere,null);if(Array.from(a.instanceMatrix.array.subarray(0,a.count*16)).every(Number.isFinite)){a.computeBoundingBox();b.computeBoundingBox();a.computeBoundingSphere();b.computeBoundingSphere();assert.deepEqual(a.boundingBox,b.boundingBox);assert.deepEqual(a.boundingSphere,b.boundingSphere);a.boundingBox=b.boundingBox=null;a.boundingSphere=b.boundingSphere=null;}}
  assertIdentities();assert.equal(candidate._nextTransformCache.size,0,'Retired Map must be empty');assert.equal(candidate._transformCache.size,new Set(candidate.trees.map(tree=>tree.cell)).size,'Only current reachable cells may remain cached');assert([...candidate._transformCache.values()].every(slots=>slots.length===(candidate.artProfile?1:2)),'Retired legacy side must not be retained');
}
function rewrite(label){for(const layer of layers)layer._reassignAndUpload(true);equalOutputs(label);}
function refresh(label){for(const layer of layers)layer.update();equalOutputs(label);}
function clearRanges(){for(const layer of layers)for(const mesh of layer.lodMeshes){mesh.instanceMatrix.clearUpdateRanges();mesh.instanceColor?.clearUpdateRanges();}}
let actualComposes=0,oracleComposes=0;
for(const [i,layer]of layers.entries()){const original=layer._dummy.updateMatrix;layer._dummy.updateMatrix=function(...args){if(i===0)actualComposes++;else oracleComposes++;return original.apply(this,args);};}
check('legacy crossed faces: cold misses then exact hits; writes still occur',()=>{
 candidate._transformCache.clear();candidate._nextTransformCache.clear();clearRanges();rewrite('legacy cold');assert.equal(candidate._transformCacheMisses,candidate.stats.instances);assert.equal(candidate._transformCacheHits,0);const before=actualComposes,versions=candidate.lodMeshes.map(mesh=>mesh.instanceMatrix.version);rewrite('legacy warm');assert.equal(candidate._transformCacheHits,candidate.stats.instances);assert.equal(actualComposes,before);assert.equal(candidate.mesh.instanceMatrix.version,versions[0]+1,'Hit must still mark the original prefix dirty');
});
for(const [name,ppu,lod]of [['near',100,0],['middle',5,1],['far',.5,2]])check('pilot varied '+name+' LOD'+lod,()=>{for(const layer of layers){layer.setArtProfile(profile);layer.setLODEnabled(true);layer.setArtView({pixelsPerUnit:ppu,verticalPixelsPerUnit:ppu});}clearRanges();refresh(name);assert(candidate.lodMeshes[lod].count>0);rewrite(name+' repeat');assert.equal(candidate._transformCacheHits,candidate.stats.instances);});
check('Region inside/outside/empty preserves exact ordered facts and retires missing cells',()=>{
 const region=new RegionGeometry(world,new RegionMask(normalizeRegion([[12,10],[38,10],[38,31],[12,31]],world,.45)));
 for(const inside of [true,false]){for(const layer of layers)layer.setRegionGeometry(region,inside);refresh('region '+inside);}
 for(const layer of layers){layer.setRegionGeometry(new RegionGeometry(world,{x0:0,y0:0,x1:0,y1:0,contains:()=>false}),true);}refresh('empty region');assert.equal(candidate._transformCache.size,0);for(const layer of layers)layer.setRegionGeometry(null);refresh('full restore');
});
check('live height mutation without touch and elevation profile changes force correct transforms',()=>{
 const tree=candidate.trees[0],i=world.idx(Math.floor(tree.x),Math.floor(tree.y)),saved=world.height[i];world.height[i]=saved+.008;rewrite('live height');assert(candidate._transformCacheMisses>0);world.height[i]=saved;rewrite('restored height');for(const layer of layers)layer.elevation.setProfile({datum:.25,relief:1.1});rewrite('live elevation');assert.equal(candidate._transformCacheMisses,candidate.stats.instances);for(const layer of layers)layer.elevation.setProfile(null);rewrite('raw restore');
});
const originalCoordinates=layers.map(layer=>layer.coordinates.worldToRender);
check('live coordinate conversion and in-place tree position/rotation/size changes never stale',()=>{
 for(const [i,layer]of layers.entries())layer.coordinates.worldToRender=(...args)=>{const p=originalCoordinates[i](...args);return{x:p.x+.125,y:p.y-.25,z:p.z+.5};};rewrite('new coordinates');assert.equal(candidate._transformCacheMisses,candidate.stats.instances);for(const [i,layer]of layers.entries())layer.coordinates.worldToRender=originalCoordinates[i];rewrite('coordinates restore');for(const layer of layers){layer.trees[0].x+=.125;layer.trees[0].rotation+=.2;layer.trees[0].size*=1.01;}rewrite('mutated live facts');assert(candidate._transformCacheMisses>0);refresh('formal facts restored');
});
check('in-place tint updates always rewrite colors while matrix hits remain valid',()=>{
 for(const layer of layers)for(const color of layer._variantTints)color.setRGB(.17,.31,.49);rewrite('in-place tint');assert.equal(candidate._transformCacheHits,candidate.stats.instances);for(const layer of layers)layer.setArtProfile({...profile});rewrite('tint restore');
});
check('Object.is protects signed-zero and nonfinite matrix inputs never hit',()=>{
 for(const y of [0,-0,NaN,Infinity]){for(const [i,layer]of layers.entries())layer.coordinates.worldToRender=(...args)=>({...originalCoordinates[i](...args),y});rewrite('coordinate '+String(y));assert.equal(candidate._transformCacheMisses,candidate.stats.instances);rewrite('coordinate repeat '+String(y));if(Number.isFinite(y))assert.equal(candidate._transformCacheHits,candidate.stats.instances);else assert.equal(candidate._transformCacheHits,0);}for(const [i,layer]of layers.entries())layer.coordinates.worldToRender=originalCoordinates[i];rewrite('finite restore');
});
check('Euler x/z/order and legacy side transitions follow BASE composition exactly',()=>{
 for(const layer of layers){layer._dummy.rotation.x=.1;layer._dummy.rotation.z=-.2;layer._dummy.rotation.order='ZYX';}rewrite('other Euler components');assert.equal(candidate._transformCacheMisses,candidate.stats.instances);for(const layer of layers){layer.setArtProfile(null);layer.setLODEnabled(false);}rewrite('legacy sides restored');assert([...candidate._transformCache.values()].every(slots=>slots.length===2));for(const layer of layers){layer._dummy.rotation.x=0;layer._dummy.rotation.z=0;layer._dummy.rotation.order='XYZ';layer.setArtProfile(profile);}rewrite('pilot sides restored');
});
check('World/seed replacement invalidates cache while target array replacement still gets every write',()=>{
 const replacement=Object.assign(Object.create(Object.getPrototypeOf(world)),world);for(const layer of layers)layer.world=replacement;rewrite('new World identity');assert.equal(candidate._transformCacheMisses,candidate.stats.instances);for(const layer of layers)layer.world=world;rewrite('old World restore');const seed=world.seed;world.seed=seed+1;rewrite('seed changed');assert.equal(candidate._transformCacheMisses,candidate.stats.instances);world.seed=seed;rewrite('seed restore');
 const old=layers.map(layer=>({matrix:layer.mesh.instanceMatrix.array,color:layer.mesh.instanceColor.array}));for(const layer of layers){layer.mesh.instanceMatrix.array=new Float32Array(layer.mesh.instanceMatrix.array.length);layer.mesh.instanceColor.array=new Float32Array(layer.mesh.instanceColor.array.length);}const newArrays=layers.map(layer=>({matrix:layer.mesh.instanceMatrix.array,color:layer.mesh.instanceColor.array}));for(const layer of layers)layer._reassignAndUpload(true);for(let i=0;i<layers.length;i++){assert.equal(layers[i].mesh.instanceMatrix.array,newArrays[i].matrix);assert.equal(layers[i].mesh.instanceColor.array,newArrays[i].color);}assert.deepEqual(prefix(candidate.mesh.instanceMatrix,candidate.mesh.count,16),prefix(reference.mesh.instanceMatrix,reference.mesh.count,16));assert.deepEqual(prefix(candidate.mesh.instanceColor,candidate.mesh.count,3),prefix(reference.mesh.instanceColor,reference.mesh.count,3));for(let i=0;i<layers.length;i++){layers[i].mesh.instanceMatrix.array=old[i].matrix;layers[i].mesh.instanceColor.array=old[i].color;}rewrite('original arrays restored');
});
check('real WebGLAttributes still submits prefix union on cache hits and empty batches stay clean',()=>{
 const calls=[],gl={FLOAT:0x1406,ARRAY_BUFFER:0x8892,createBuffer:()=>({}),bindBuffer(){},deleteBuffer(){},bufferData(target,array){calls.push({kind:'full',bytes:array.byteLength});},bufferSubData(target,offset,array,start=0,count=array.length){calls.push({kind:'sub',bytes:count*array.BYTES_PER_ELEMENT});}},attributes=WebGLAttributes(gl),referenceAttributes=WebGLAttributes({...gl,bufferData(){},bufferSubData(){}});
 const mesh=candidate.mesh,uploadFacts=layers.map(layer=>layer.trees.slice(0,12));for(const layer of layers){layer.setLODEnabled(false);layer.trees=layer.trees.slice(0,8);}rewrite('upload fixture');const submit=()=>{attributes.update(mesh.instanceMatrix,gl.ARRAY_BUFFER);attributes.update(mesh.instanceColor,gl.ARRAY_BUFFER);referenceAttributes.update(reference.mesh.instanceMatrix,gl.ARRAY_BUFFER);referenceAttributes.update(reference.mesh.instanceColor,gl.ARRAY_BUFFER);};submit();rewrite('consume initial pending');submit();calls.length=0;clearRanges();rewrite('warm cache hit upload');assert.equal(candidate._transformCacheHits,8);submit();assert.deepEqual(calls.map(call=>call.bytes),[8*16*4,8*3*4]);calls.length=0;
 for(let i=0;i<layers.length;i++)layers[i].trees=uploadFacts[i];rewrite('pending expand');for(const layer of layers)layer.trees=layer.trees.slice(0,3);rewrite('pending shrink');for(const layer of layers)layer.trees=[];rewrite('pending empty');for(let i=0;i<layers.length;i++)layers[i].trees=uploadFacts[i].slice(0,5);rewrite('pending restore');assert.equal(candidate._transformCacheMisses,5,'Evicted cells must not retain historical transforms');submit();assert.deepEqual(calls.map(call=>call.bytes),[12*16*4,12*3*4]);calls.length=0;
 for(const layer of layers)layer.trees=[];rewrite('empty upload');const version=mesh.instanceMatrix.version;rewrite('repeat empty');assert.equal(mesh.instanceMatrix.version,version);submit();assert.deepEqual(calls,[]);assert.equal(candidate._transformCache.size,0);refresh('after empty restore');
});
check('probe reports actual compose hits/misses without suppressing write accounting',()=>{
 const probe=candidate.setLODProbeEnabled();rewrite('probe warm');assert.equal(probe.last.transformCacheHits,candidate.stats.instances);assert.equal(probe.last.transformCacheMisses,0);assert.equal(probe.last.matrixInstancesWritten,candidate.stats.instances);assert.equal(probe.last.matrixNeedsUpdateMarks,candidate.lodMeshes.filter(mesh=>mesh.count>0).length);candidate.setLODProbeEnabled(false);
});
check('formal World facts unchanged; disposal empties both transform maps',()=>{
 assert.equal(createHash('sha256').update(JSON.stringify(world)).digest('hex'),beforeHash);for(const layer of layers)layer.dispose();assert.equal(candidate._transformCache.size,0);assert.equal(candidate._nextTransformCache.size,0);assert.equal(candidate._transformWorld,null);
});
console.log(JSON.stringify({suite:'G2-P0.2 transform Matrix4 cache',BASE,baselineSourceHash,checks,actualComposes,oracleComposes,scope:'Exact CPU/real WebGLAttributes protocol only; no GPU or product P95 claim.'}));
