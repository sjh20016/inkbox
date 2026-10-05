import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { World } from '../src/inkbox/world/World.js';
import { TERRAIN } from '../src/inkbox/core/config.js';
import { Render3DHost } from '../src/inkbox/render3d/Render3DHost.js';
import { RegionGeometry } from '../src/inkbox/render3d/region/RegionGeometry.js';
import { PlanePicker } from '../src/inkbox/render3d/picking/PlanePicker.js';
import { resolvePlaneSubject, planeSubjectInspectRows } from '../src/inkbox/ui/realmInspector.js';
import { deriveMarkers } from '../src/inkbox/render3d/markers/WorldMarkerLayer.js';
import { readEnvironmentLibrary } from './inkbox-environment-glb-reader.mjs';
import { EnvironmentBatch } from '../src/inkbox/render3d/environment/EnvironmentBatch.js';
import { stepSites, SITE_LIFESPAN_YEARS } from '../src/inkbox/sim/sites.js';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const OUT=path.resolve(process.env.INKBOX_REPORT_DIR || path.join(ROOT,'reports/local/m2c2c/sites'));
const report={suite:'M2-C2C four Site families actual-GLB CPU gate',checks:[],pass:false,browser:false};
const sha=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const check=(name,fn)=>{fn();report.checks.push({name,passed:true});console.log(`PASS ${name}`);};
function fixture(){const world=new World(32,24,411);world.plane='mortal';world.height.fill(.55);world.type.fill(TERRAIN.GRASS);
  world.addSite({kind:'cave',x:16,y:12,name:'测试洞府',age:720,visits:1,reward:'现有字段'});return world;}
function hostFor(world,library){const camera=new THREE.OrthographicCamera(-20,20,15,-15,.1,2000);
  camera.position.set(0,60,60);camera.lookAt(0,0,0);camera.zoom=2;camera.updateProjectionMatrix();camera.updateMatrixWorld(true);
  const gpu={info:{memory:{geometries:0,textures:0},render:{calls:0,triangles:0}},setPixelRatio(){},setClearColor(){},setSize(){},render(){},dispose(){}};
  const cameraRig={camera,update(){},resize(){},setDimensions(){},dispose(){},focusOn(){}};
  const host=new Render3DHost({},world,{gpu,cameraRig,characters:false,environment:false,environmentLibrary:library,productionAssets:true,geography:{sites:true},lodEnabled:true});
  host.resize(900,600);host.update(.3);return host;}
function view(host,ppu){host.stages.get('mortal').setEnvironmentArtView({pixelsPerUnit:ppu,verticalPixelsPerUnit:ppu,camera:host.cameraRig.camera});}
function visibleRecord(host){const layer=host.stages.get('mortal').markers.siteGeography;
  for(const mesh of layer.batch?.meshes.values() || [])if(mesh.count)return {mesh,record:mesh.userData.renderSites[0]};return null;}
function fullFixture(){const world=new World(64,40,411);world.height.fill(.55);world.type.fill(TERRAIN.GRASS);
  for(const [n,kind] of ['secret','cave','formation','ruin'].entries())world.addSite({kind,x:12+n*12,y:20,name:`真实${kind}字段`,age:0,visits:0});return world;}
const library=readEnvironmentLibrary(ROOT);let host;
try{
  check('shipped cave asset has 84/36/6 triangles and closed normalized components',()=>{
    const asset=library.assetInfo('mortal.site.cave');assert.equal(asset.pick,'site');assert.match(asset.binding,/world.sites/);
    assert.deepEqual(asset.lods.map(name=>library.modules.get(name).triangles),[84,36,6]);
    for(const node of asset.lods){const {geometry,bounds}=library.modules.get(node);assert.equal(bounds.min[1],0);
      assert(bounds.min[0]>=-.50001&&bounds.max[0]<=.50001&&bounds.min[2]>=-.50001&&bounds.max[2]<=.50001);
      const edges=new Map(),p=geometry.attributes.position,ix=geometry.index;
      const key=i=>[p.getX(i),p.getY(i),p.getZ(i)].map(v=>v.toFixed(6)).join(',');
      for(let i=0;i<ix.count;i+=3)for(let j=0;j<3;j++){const a=key(ix.getX(i+j)),b=key(ix.getX(i+(j+1)%3));const k=[a,b].sort().join('|');edges.set(k,(edges.get(k)||0)+1);}
      assert([...edges.values()].every(count=>count%2===0),'every component edge is closed');
    }
  });
  const world=fixture(),before=sha(world);host=hostFor(world,library);view(host,30);
  const stage=host.stages.get('mortal'),markers=stage.markers,site=world.sites[0];
  check('one derivation binds current cave identity and suppresses only cave legacy marker',()=>{
    assert.equal(markers.siteGeography.stats.siteCount,1);assert.equal(markers.siteGeography.stats.instances,1);assert.equal(markers.siteMeshes.cave.count,0);
    assert.deepEqual(visibleRecord(host).record,{id:site.id,x:site.x,y:site.y,kind:'cave'});
    const picked=resolvePlaneSubject(world,'mortal',{kind:'site',siteId:site.id});assert.equal(picked.subject,site);
    assert(planeSubjectInspectRows(picked).rows.some(row=>row[0]==='访问'&&row[1]==='1'));
  });
  check('site screen LOD and hysteresis preserve identity',()=>{
    view(host,30);assert.deepEqual(markers.siteGeography.stats.lod,[1,0,0]);
    view(host,13);assert.deepEqual(markers.siteGeography.stats.lod,[1,0,0]);
    view(host,10);assert.deepEqual(markers.siteGeography.stats.lod,[0,1,0]);
    view(host,1);assert.deepEqual(markers.siteGeography.stats.lod,[0,0,1]);
    view(host,2.8);assert.deepEqual(markers.siteGeography.stats.lod,[0,0,1]);
    markers.setLODEnabled(false);assert.deepEqual(markers.siteGeography.stats.lod,[1,0,0]);markers.setLODEnabled(true);
    assert.equal(visibleRecord(host).record.id,site.id);
  });
  check('full footprint Region rejects protruding asset and retains truthful marker',()=>{
    const narrow={x0:15,y0:11,x1:18,y1:15,contains:(x,y)=>x>=15&&x<18&&y>=11&&y<15};
    markers.setRegionGeometry(new RegionGeometry(world,narrow),true);markers.update(.3,world);
    assert.equal(markers.siteGeography.stats.instances,0);assert.equal(markers.siteMeshes.cave.count,1);assert.equal(markers.siteGeography.stats.maskRejected,1);
    const outside={x0:1,y0:1,x1:4,y1:4,contains:(x,y)=>x>=1&&x<4&&y>=1&&y<4};
    markers.setRegionGeometry(new RegionGeometry(world,outside),true);markers.update(.3,world);
    assert.equal(markers.siteMeshes.cave.count,0);assert.equal(markers.siteGeography.stats.instances,0);
    markers.setRegionGeometry(null,true);markers.update(.3,world);
  });
  check('production disabled and geography disabled recover original marker without duplicate',()=>{
    const fixedBatch=markers.siteGeography.batch;
    host.setProductionAssetsEnabled(false);host.update(.3);assert.equal(markers.siteMeshes.cave.count,1);assert.equal(markers.siteGeography.stats.instances,0);assert.equal(markers.siteGeography.batch,fixedBatch);
    host.setProductionAssetsEnabled(true);host.update(.3);assert.equal(markers.siteMeshes.cave.count,0);assert.equal(markers.siteGeography.stats.instances,1);assert.equal(markers.siteGeography.batch,fixedBatch);
    host.setGeographyFeature('sites',false);host.update(.3);assert.equal(markers.siteMeshes.cave.count,1);assert.equal(markers.siteGeography.stats.instances,0);
    host.setGeographyFeature('sites',true);host.update(.3);view(host,30);
  });
  check('actual submitted triangles raycast to exact current Site; removed identity is rejected',()=>{
    host.scene.updateMatrixWorld(true);const {mesh}=visibleRecord(host),p=mesh.geometry.attributes.position,ix=mesh.geometry.index,m=new THREE.Matrix4();mesh.getMatrixAt(0,m);
    const picker=new PlanePicker(host);let found=false,foundPixel=null;
    for(let i=0;i<ix.count&&!found;i+=3){const point=new THREE.Vector3();for(let j=0;j<3;j++)point.add(new THREE.Vector3().fromBufferAttribute(p,ix.getX(i+j)));point.multiplyScalar(1/3).applyMatrix4(m).applyMatrix4(mesh.matrixWorld).project(host.cameraRig.camera);
      const pixel=[(point.x+1)*450,(1-point.y)*300];
      const hit=picker.pick(...pixel,900,600);if(hit?.kind==='site'&&hit.siteId===site.id){found=true;foundPixel=pixel;}}
    assert(found,'submitted site geometry is pickable through actual CPU raycasting');
    const blockerGeometry=new THREE.BoxGeometry(4,4,4),blockerMaterial=new THREE.MeshBasicMaterial(),blocker=new THREE.InstancedMesh(blockerGeometry,blockerMaterial,1);
    const sourceHit=picker.pick(...foundPixel,900,600),position=picker.raycaster.ray.at(sourceHit.distance*.5,new THREE.Vector3());
    blocker.setMatrixAt(0,new THREE.Matrix4().makeTranslation(position.x,position.y,position.z));
    const blockerGroup=new THREE.Group();blockerGroup.add(blocker);stage.root.add(blockerGroup);const previousDecorations=stage.decorations;
    stage.decorations={group:blockerGroup};
    try{assert(picker.pick(...foundPixel,900,600)?.kind !== 'site','visible opaque geometry occludes a Site');}
    finally{stage.decorations=previousDecorations;blockerGroup.removeFromParent();blocker.dispose();blockerGeometry.dispose();blockerMaterial.dispose();}
    world.removeSite(site);assert(resolvePlaneSubject(world,'mortal',{kind:'site',siteId:site.id}) === null);
    assert(picker.pick(...foundPixel,900,600)?.kind !== 'site','stale instance cannot resolve before next marker refresh');
    markers.update(.3,world);assert.equal(markers.siteGeography.stats.instances,0);assert.equal(markers.siteMeshes.cave.count,0);
    world.sites.push(site);markers.update(.3,world);
  });
  check('World SHA unchanged across render toggles and derivation',()=>{assert.equal(sha(world),before);assert.equal(deriveMarkers(world).sites.cave[0].id,site.id);report.worldSha=before;});
  check('Stage replacement/disposal releases own instances while preserving borrowed GLB geometry',()=>{
    let geometryDisposals=0,materialDisposals=0;for(const module of library.modules.values())module.geometry.addEventListener('dispose',()=>geometryDisposals++);
    const borrowed=stage.environmentMaterial;borrowed.addEventListener('dispose',()=>materialDisposals++);
    const oldBatch=markers.siteGeography.batch;host.setWorld(fixture());host.update(.3);
    assert.equal(oldBatch.disposed,true);assert.equal(geometryDisposals,0);assert.equal(materialDisposals,1);assert.equal(library.disposed,false);
    host.dispose();host=null;assert.equal(geometryDisposals,0);assert.equal(library.disposed,false);
  });
  check('all four shipped families have distinct LOD0 and official shared LOD1/LOD2 modules',()=>{
    const assets=['secret','cave','formation','ruin'].map(kind=>library.assetInfo(`mortal.site.${kind}`));
    assert.equal(new Set(assets.map(a=>a.lods[0])).size,4);assert.equal(new Set(assets.map(a=>a.lods[1])).size,3);assert.equal(new Set(assets.map(a=>a.lods[2])).size,1);
    assert.equal(library.geometryFor('mortal.site.secret',1),library.geometryFor('mortal.site.cave',1));
    for(const a of assets){assert.equal(a.pick,'site');assert(a.footprint.width>=2&&a.footprint.width<=6&&a.footprint.depth>=2&&a.footprint.depth<=6);
      const triangles=a.lods.map((node,lod)=>library.modules.get(node).triangles*(a.compositeParts?.[lod]?.length||1));assert(triangles[0]>=60&&triangles[0]<=220&&triangles[1]>=20&&triangles[1]<=60&&triangles[2]>=6&&triangles[2]<=16);
      assert.equal(library.geometryFor(a.id,2),library.geometryFor('mortal.site.cave',2));
      for(const node of a.lods){const {geometry,bounds}=library.modules.get(node);assert.equal(bounds.min[1],0);
        assert(bounds.min[0]>=-.50001&&bounds.max[0]<=.50001&&bounds.min[2]>=-.50001&&bounds.max[2]<=.50001);
        const edges=new Map(),p=geometry.attributes.position,ix=geometry.index;
        const key=i=>[p.getX(i),p.getY(i),p.getZ(i)].map(v=>v.toFixed(6)).join(',');
        for(let i=0;i<ix.count;i+=3)for(let j=0;j<3;j++){const k=[key(ix.getX(i+j)),key(ix.getX(i+(j+1)%3))].sort().join('|');edges.set(k,(edges.get(k)||0)+1);}
        assert([...edges.values()].every(n=>n%2===0),'every Site recognizer has closed components');
      }
    }
    const formation=assets[2];assert.deepEqual(formation.compositeParts.map(parts=>parts?.length||1),[8,4,1]);assert.equal(formation.lods[0],formation.lods[1]);
    assert.deepEqual(formation.footprint,{width:4.2,depth:4.2,height:1.1});
    report.assets=Object.fromEntries(assets.map(a=>[a.id,{lods:a.lods,triangles:a.lods.map((n,lod)=>library.modules.get(n).triangles*(a.compositeParts?.[lod]?.length||1))}]));
  });
  const full=fullFixture(),fullBefore=sha(full);host=hostFor(full,library);const fullMarkers=host.stages.get('mortal').markers,fullLayer=fullMarkers.siteGeography;
  check('four true identities share seven fixed nodes; local Formation parts preserve identity and far shared draw',()=>{
    assert.equal(fullLayer.batch.meshes.size,7);view(host,30);assert.equal(fullLayer.stats.instances,11);assert.equal(fullLayer.stats.renderedSiteCount,4);assert.equal(fullLayer.stats.drawCalls,4);assert.equal(fullLayer.stats.triangles,336);
    assert.equal(fullMarkers.stats.sites,4,'marker Site totals count identities, not eleven presentation parts');
    for(const s of full.sites){assert.equal(fullMarkers.siteMeshes[s.kind].count,0);assert.equal(resolvePlaneSubject(full,'mortal',{kind:'site',siteId:s.id}).subject,s);}
    const formation=full.sites.find(s=>s.kind==='formation'),asset=library.assetInfo('mortal.site.formation'),mesh=fullLayer.batch.meshes.get(asset.lods[0]);
    assert.equal(mesh.instanceMatrix.count,2048);assert.equal(mesh.count,8);assert(mesh.userData.renderSites.every(s=>s.id===formation.id&&s.x===formation.x&&s.y===formation.y));
    const mixed=new EnvironmentBatch(library,{material:host.stages.get('mortal').environmentMaterial,capacity:4,nodeCapacities:{[asset.lods[0]]:8},assetIds:[asset.id]});
    try{
      mixed.write(Array.from({length:5},(_,i)=>({assetId:asset.id,lod:i<2?0:1,position:{x:i,y:0,z:0},scale:{x:1,y:1,z:1}})));
      assert.deepEqual(mixed.stats.lod,[2,3,0]);assert.equal(mixed.stats.instances,5);assert.equal(mixed.stats.overflow,0);assert.equal(mixed.stats.drawCalls,1);
      assert.equal(mixed.meshes.get(asset.lods[0]).userData.lod,null);assert.deepEqual(mixed.meshes.get(asset.lods[0]).userData.lods,[0,1]);
    }finally{mixed.dispose();}
    for(const [node,m] of fullLayer.batch.meshes)if(node!==asset.lods[0])assert.equal(m.instanceMatrix.count,256);
    view(host,5);assert.equal(fullLayer.stats.instances,7);assert.equal(fullLayer.stats.drawCalls,3);assert.deepEqual(fullLayer.stats.lod,[0,4,0]);assert.deepEqual(fullLayer.stats.instanceLOD,[0,7,0]);
    view(host,1);assert.equal(fullLayer.stats.instances,4);assert.equal(fullLayer.stats.drawCalls,1);assert.equal(fullLayer.stats.triangles,24);assert.deepEqual(fullLayer.stats.lod,[0,0,4]);
    assert.equal(sha(full),fullBefore);report.batches={fixedNodes:7,siteCapacity:256,formationPartCapacity:2048,totalAllocatedSlots:3584,detailDraws:4,reducedDraws:3,farDraws:1,farTriangles:24};
    const slope=new World(32,24,9);slope.type.fill(TERRAIN.GRASS);
    for(let y=0;y<slope.h;y++)for(let x=0;x<slope.w;x++)slope.height[y*slope.w+x]=.55+x*.006+y*.004;
    const current=slope.addSite({kind:'formation',x:16,y:12,name:'真实斜坡阵点'}),before=sha(slope),probeHost=hostFor(slope,library);
    try{
      const probeStage=probeHost.stages.get('mortal'),probeLayer=probeStage.markers.siteGeography;
      for(const [ppu,lod,parts] of [[30,0,8],[5,1,4]]){
        view(probeHost,ppu);const stones=probeLayer.batch.meshes.get(asset.lods[lod]);assert.equal(stones.count,parts);assert.equal(probeLayer.stats.renderedSiteCount,1);assert.equal(probeLayer.stats.fallback,0);
        for(let n=0;n<stones.count;n++){
          assert.deepEqual(stones.userData.renderSites[n],{id:current.id,x:16,y:12,kind:'formation'});
          const matrix=new THREE.Matrix4();stones.getMatrixAt(n,matrix);
          for(const x of [-.5,.5])for(const z of [-.5,.5]){
            const top=new THREE.Vector3(x,1,z).applyMatrix4(matrix),cell=probeStage.coordinates.renderToWorld(top.x,top.z);
            assert(top.y>probeStage.elevation.at(cell.x,cell.y),'every actual GLB stone top corner clears its local terrain');
          }
        }
      }
      assert.equal(sha(slope),before);
    }finally{probeHost.dispose();}
  });
  check('each family and unknown fallback preserve current id under Region and removal',()=>{
    full.addSite({kind:'unknown-kind',x:8,y:20,name:'未知真实地点'});fullMarkers.update(.3,full);assert.equal(fullMarkers.unknownSites.count,1);assert.equal(fullLayer.stats.fallback,1);
    assert.equal(deriveMarkers(full).sites['unknown-kind'],undefined);assert.equal(deriveMarkers(full).unknownSites.length,1);
    const region={x0:0,y0:0,x1:18,y1:39,contains:(x,y)=>x>=0&&x<18&&y>=0&&y<39};
    fullMarkers.setRegionGeometry(new RegionGeometry(full,region),true);fullMarkers.update(.3,full);
    assert.equal(fullLayer.stats.instances,1);assert.equal(fullLayer.renderedIds.has(full.sites[0].id),true);
    fullMarkers.setRegionGeometry(null);fullMarkers.update(.3,full);
    for(const site of [...full.sites]){full.removeSite(site);fullMarkers.update(.3,full);assert.equal(resolvePlaneSubject(full,'mortal',{kind:'site',siteId:site.id}),null);assert.equal(fullLayer.renderedIds.has(site.id),false);}
    assert.equal(fullLayer.stats.instances,0);assert.equal(fullMarkers.unknownSites.count,0);
  });
  check('actual secret second-visit exhaustion removes production instance and stale identity',()=>{
    const secret=full.addSite({kind:'secret',x:24,y:20,name:'探尽测试',visits:1});
    full.entities.push({id:42,name:'测试修士',x:24,y:20,level:3,hp:100,maxHp:100,exp:0,fortune:50,mind:50,heartDemon:0,techniques:[]});
    fullMarkers.update(.3,full);assert.equal(fullLayer.stats.instances,1);
    stepSites(full,1,()=>0);assert.equal(secret.visits,2);assert(!full.sites.includes(secret));
    assert(resolvePlaneSubject(full,'mortal',{kind:'site',siteId:secret.id})===null);fullMarkers.update(.3,full);assert.equal(fullLayer.stats.instances,0);
  });
  check('all four actual lifespan closures clear geometry; capacity is fixed with honest overflow fallback',()=>{
    full.entities=[];
    for(const [i,kind] of ['secret','cave','formation','ruin'].entries())full.addSite({kind,x:12+i*12,y:20,name:kind,age:SITE_LIFESPAN_YEARS[kind]*360});
    fullMarkers.update(.3,full);assert.equal(fullLayer.stats.renderedSiteCount,4);stepSites(full,1,()=>1);fullMarkers.update(.3,full);assert.equal(fullLayer.stats.instances,0);
    for(let i=0;i<300;i++)full.addSite({kind:'secret',x:24,y:20,name:String(i)});
    const sourceSHA=sha(full);view(host,30);fullMarkers.update(.3,full);
    assert.equal(fullLayer.stats.instances,256);assert.equal(fullLayer.stats.overflow,44);assert.equal(fullLayer.stats.fallback,44);assert.equal(fullMarkers.siteMeshes.secret.count,44);
    assert.deepEqual(fullLayer.stats.lod,[64,160,32]);assert.equal(sha(full),sourceSHA);assert.equal(fullLayer.batch.meshes.size,7);
    full.sites=[];for(let i=0;i<300;i++)full.addSite({kind:'formation',x:24,y:20,name:String(i)});
    fullMarkers.update(.3,full);assert.equal(fullLayer.stats.instances,1184);assert.equal(fullLayer.stats.renderedSiteCount,256);assert.equal(fullLayer.stats.fallback,44);assert.equal(fullLayer.stats.overflow,44);
    fullLayer.setLODEnabled(false);fullMarkers.update(.3,full);assert.equal(fullLayer.stats.instances,2048);assert.equal(fullLayer.stats.renderedSiteCount,256);assert.equal(fullLayer.stats.fallback,44);
    fullLayer.setLODEnabled(true);
  });
  check('fully buried short recognizer retains honest marker without lifting terrain or Site',()=>{
    full.sites=[];const formation=full.addSite({kind:'formation',x:24,y:20,name:'坡上古阵'});
    full.height.fill(.55);full.height[20*full.w+26]=.75;view(host,30);
    const before=sha(full);fullMarkers.update(.3,full,{heightChanged:true});
    assert.equal(fullLayer.stats.instances,0);assert.equal(fullLayer.stats.groundRejected,1);assert.equal(fullMarkers.siteMeshes.formation.count,1);
    assert.equal(resolvePlaneSubject(full,'mortal',{kind:'site',siteId:formation.id}).subject,formation);assert.equal(sha(full),before);
  });
  report.pass=true;
}catch(error){report.error=error.stack;console.error(error);process.exitCode=1;}
finally{host?.dispose();library.dispose();fs.mkdirSync(OUT,{recursive:true});fs.writeFileSync(path.join(OUT,'summary.json'),JSON.stringify(report,null,2)+'\n');}
