import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { makeTestHost } from './inkbox-c2c-test-utils.mjs';
import { generateWorld } from '../src/inkbox/world/worldgen.js';
import { generateUpperWorld } from '../src/inkbox/world/worldgenUpper.js';
import { generateNetherWorld } from '../src/inkbox/world/worldgenNether.js';
import { GEOGRAPHY_FEATURES, geographyFeatures } from '../src/inkbox/render3d/stage/GeographyFeatures.js';
import { deriveMarkers } from '../src/inkbox/render3d/markers/WorldMarkerLayer.js';
import { RegionMask } from '../src/inkbox/ui/RegionMask.js';
import { normalizeRegion } from '../src/inkbox/ui/tools.js';
import { resolvePlaneSubject } from '../src/inkbox/ui/realmInspector.js';
import { TERRAIN } from '../src/inkbox/core/config.js';
import { serializeWorld } from '../src/inkbox/io/save.js';
import { openRifts, stepRifts } from '../src/inkbox/sim/rifts.js';
import { visibleRift } from '../src/inkbox/render3d/readers/riftViewModel.js';
import { PresentationStage } from '../src/inkbox/render/presentationStage.js';
import { emitRiftCross } from '../src/inkbox/sim/presentation.js';

const OUT=path.resolve(process.env.INKBOX_REPORT_DIR||'reports/local/m2c2c/contracts');
const report={suite:'C2C cross-realm semantic and Stage acceptance',gpu:false,checks:[]};
const sha=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const check=(name,fn)=>{fn();report.checks.push({name,passed:true});console.log(`PASS ${name}`);};
const preset={w:64,h:48},seed=511,world=generateWorld({preset,seed,scatter:true});
world.upper=generateUpperWorld({preset,seed});world.nether=generateNetherWorld({preset,seed});
// Explicit flat terrain/identity boundary fixtures. Normal-view evidence uses
// separately simulated Worlds; these fixtures never become production saves.
for(const w of [world,world.upper,world.nether]){w.height.fill(.55);w.type.fill(TERRAIN.GRASS);w.water.fill(0);}
for(const [i,kind] of ['secret','cave','formation','ruin'].entries())world.addSite({kind,x:16+i*9,y:24,name:`contract fixture ${kind}`,age:0,visits:0});
world.leylines=[{id:81,x:20,y:15,radius:7,strength:.7,element:'wood',owner:0}];
const selection={x0:10,y0:9,x1:44,y1:35};
assert(openRifts(world,selection,'upper').opened>0);assert(openRifts(world,selection,'nether').opened>0);
// Existing canonical lifecycle API supplies nonzero radii for this unit fixture;
// no renderer formula or authored radius is substituted for real Rift state.
stepRifts(world);
// Explicit presentation API unit fixtures exercise depart/arrive masking. They
// do not claim that these transfers happened during natural browser gameplay.
for(const plane of ['upper','nether'])assert.equal(emitRiftCross(world,{kind:'person',
  fromPlane:'mortal',toPlane:plane,fromX:20,fromY:20,toX:30,toY:24,subjectId:1}).length,2);
const presentation=new PresentationStage().ingestWorlds(world).update(.01);
const before=sha(world),saveBefore=sha(serializeWorld(world)),host=makeTestHost(world,{geography:true});
try{
  host.setArtProfile('realm-style-v1');host.setPresentation(presentation);host.update(.3);
  check('frozen presentation switches are explicit and reject unknown feature names',()=>{
    assert(Object.isFrozen(GEOGRAPHY_FEATURES));assert(Object.isFrozen(geographyFeatures(true)));
    assert.deepEqual(GEOGRAPHY_FEATURES,['sites','leylines','upperQi','netherYin','rifts','riftFx']);
    assert.throws(()=>host.setGeographyFeature('inventedWorldKind',true));
  });
  check('three Stages keep exact independent World references and mortal-only landmarks',()=>{
    for(const [plane,w] of [['mortal',world],['upper',world.upper],['nether',world.nether]])assert.equal(host.stages.get(plane).world,w);
    assert.equal(host.stages.get('upper').markers,null);assert.equal(host.stages.get('nether').markers,null);
    const markers=deriveMarkers(world);assert.equal(Object.values(markers.sites).flat().length,4);
    assert.equal(markers.leylines[0].id,81);assert.equal(markers.leylines[0].strength,.7);
    assert.equal(resolvePlaneSubject(world.upper,'upper',{kind:'site',siteId:world.sites[0].id}),null);
    assert.equal(resolvePlaneSubject(world.nether,'nether',{kind:'leyline',leylineId:81}),null);
  });
  const region=new RegionMask(normalizeRegion([[10,9],[44,9],[44,35],[10,35]],world,.45));
  for(const plane of ['upper','nether']){
    check(`${plane} window masks Mortal Site/Leyline footprints and reads only its own field`,()=>{
      host.setActivePlane('mortal');host.setRealmViewState({open:true,targetPlane:plane,region});host.update(.3);
      const mortal=host.stages.get('mortal'),target=host.stages.get(plane);
      assert(mortal.visible&&target.visible);assert.equal(mortal.regionInside,false);assert.equal(target.regionInside,true);
      assert.equal(mortal.markers.siteGeography.regionGeometry,mortal.regionGeometry);
      assert.equal(mortal.markers.leylineGeography.regionGeometry,mortal.regionGeometry);
      for(const mesh of mortal.markers.siteGeography.batch.meshes.values())for(const record of mesh.userData.renderSites||[])
        assert.equal(mortal.regionGeometry.isInsideCell(record.x,record.y),false);
      for(const mesh of mortal.markers.leylineGeography.batch.meshes.values())for(const record of mesh.userData.renderLeylines||[])
        assert.equal(mortal.regionGeometry.isInsideCell(record.x,record.y),false);
      assert.equal(target.terrain.regionGeometry,target.regionGeometry);assert(target.terrain.keptQuads>0);
      assert.equal(target.scalarField.world,target.world);assert.equal(target.scalarField.key,plane==='upper'?'qi':'veg');
      assert.equal(target.terrain.inkMaterial.uniforms.fieldMode.value,plane==='upper'?1:2);
      assert.equal(target.terrain.inkMaterial.uniforms.fieldTexture.value,target.scalarField.texture);
      assert.notEqual(target.world,world);assert.equal(target.markers,null);
    });
    check(`${plane} Rift wounds remain Mortal while Boundary and FX follow the real target contract`,()=>{
      const mortal=host.stages.get('mortal'),target=host.stages.get(plane);
      const trueRifts=world.rifts.filter(r=>visibleRift(r)?.targetPlane===plane);
      assert(trueRifts.length>0);assert.equal(host.boundary.targetPlane,plane);
      assert.deepEqual(host.boundary.rifts.map(r=>r.id),trueRifts.map(r=>r.id));
      for(const r of host.boundary.rifts)assert.equal(r.radius,visibleRift(world.rifts.find(x=>x.id===r.id)).radius);
      assert(mortal.markers.riftWounds.stats.instances>0);
      assert.equal(host.getGeographyStats().stages.mortal.rift.instances,mortal.markers.riftWounds.stats.instances);
      assert.equal(target.markers,null,'persistent Mortal Rifts are not copied into another World');
      const snapshot=presentation.snapshotPlane(plane);
      assert(Object.isFrozen(snapshot)&&snapshot.items.every(Object.isFrozen));
      assert(target.fxProbe.stats.active>0,'arrival snapshot must reach the visible target pool');
      assert(mortal.fxProbe.stats.regionRejected>0,'inside departure strokes cannot leak from Mortal into the target window');
      assert.equal(target.fxProbe.narrative.mesh.count,target.fxProbe.stats.active);
    });
  }
  check('type-only changes refresh production footprints without forcing legacy marker elevation',()=>{
    host.setActivePlane('mortal');host.setRealmViewState({open:false});host.setProductionAssetsEnabled(true);host.setGeographyEnabled(true);host.update(.3);
    const markers=host.stages.get('mortal').markers,site=world.sites.find(s=>s.kind==='cave'),line=world.leylines[0];
    const cells=[site,line].map(p=>Math.floor(p.y)*world.w+Math.floor(p.x)),previous=cells.map(i=>world.type[i]);
    assert(markers.siteGeography.renderedIds.has(site.id));assert(markers.leylineGeography.renderedIds.has(line.id));
    try{
      for(const i of cells)world.type[i]=TERRAIN.SEA;
      host.update(.001);
      assert(!markers.siteGeography.renderedIds.has(site.id),'type-only water change must reject the current Site footprint immediately');
      assert(markers.siteMeshes.cave.count>0,'rejected production Site must retain its true legacy identity');
      assert(markers.leylineGeography.stats.terrainRejected>0,'type-only water change must refresh actual Leyline segments');
      for(const [j,i] of cells.entries())world.type[i]=previous[j];
      host.update(.001);assert(markers.siteGeography.renderedIds.has(site.id));assert(markers.leylineGeography.renderedIds.has(line.id));
      host.setGeographyEnabled(false);host.update(.3);
      const prior=markers.lastDerived,matrixVersion=markers.siteMeshes.cave.instanceMatrix.version;
      world.type[cells[0]]=TERRAIN.SEA;host.update(.001);
      assert.equal(markers.lastDerived,prior,'inactive geography must not force a legacy marker derivation');
      assert.equal(markers.siteMeshes.cave.instanceMatrix.version,matrixVersion,'terrain type cannot force legacy marker elevation writes');
    }finally{for(const [j,i] of cells.entries())world.type[i]=previous[j];host.update(.3);host.setGeographyEnabled(true);}
  });
  check('toggle cycles reuse resources and never alter World or save keys',()=>{
    const mortal=host.stages.get('mortal'),siteBatch=mortal.markers.siteGeography.batch,leylineBatch=mortal.markers.leylineGeography.batch;
    const textures=[host.stages.get('upper').scalarField.texture,host.stages.get('nether').scalarField.texture];
    assert(textures.every(Boolean));assert.notEqual(...textures);
    for(let i=0;i<60;i++){
      host.setGeographyEnabled(i%2===0);host.setProductionAssetsEnabled(i%3!==0);
      host.setLODEnabled(i%2===0);host.setArtProfile(i%3?'realm-style-v1':'baseline');
      host.setRealmViewState(i%3?{open:true,targetPlane:i%2?'upper':'nether',region}:{open:false});host.update(.3);
    }
    assert.equal(mortal.markers.siteGeography.batch,siteBatch);assert.equal(mortal.markers.leylineGeography.batch,leylineBatch);
    assert.equal(host.stages.get('upper').scalarField.texture,textures[0]);assert.equal(host.stages.get('nether').scalarField.texture,textures[1]);
    assert.equal(sha(world),before);assert.equal(sha(serializeWorld(world)),saveBefore);
  });
}finally{host.dispose();}
report.passed=true;report.worldSha=before;report.saveSha=saveBefore;
fs.mkdirSync(OUT,{recursive:true});fs.writeFileSync(path.join(OUT,'contracts.json'),JSON.stringify(report,null,2));
