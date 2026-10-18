import assert from 'node:assert/strict';
import { fixture } from './inkbox-g1-fixtures.mjs';
import { attemptBreakthrough } from '../src/inkbox/sim/cultivation.js';
import { combatPresentationStats } from '../src/inkbox/sim/presentation.js';
import { peekRuntimeEvents } from '../src/inkbox/core/runtimeEvents.js';
import { PresentationStage } from '../src/inkbox/render/presentationStage.js';
import { createCoordinates } from '../src/inkbox/render3d/coordinates.js';
import { ElevationField } from '../src/inkbox/render3d/terrain/ElevationField.js';
import { ThreeFxProbe } from '../src/inkbox/render3d/view/ThreeFxProbe.js';
import { World } from '../src/inkbox/world/World.js';
import { TERRAIN } from '../src/inkbox/core/config.js';
import { WorldMarkerLayer } from '../src/inkbox/render3d/markers/WorldMarkerLayer.js';
import { RegionGeometry } from '../src/inkbox/render3d/region/RegionGeometry.js';
import * as THREE from 'three';

function probeFor(world) {
  return new ThreeFxProbe({ plane: 'mortal', coordinates: createCoordinates(world), elevation: new ElevationField(world) });
}
// A real cave on a rejected steep footprint keeps one inspectable, owned marker.
{
  const world=new World(32,24,260603);world.plane='mortal';
  world.height.fill(.55);world.type.fill(TERRAIN.GRASS);
  const site=world.addSite({kind:'cave',x:16,y:12,name:'坡上洞府',age:1,visits:0});
  world.height[world.idx(17,12)]=.9;
  const elevation=new ElevationField(world),markers=new WorldMarkerLayer(world,createCoordinates(world),elevation);
  const matrix=new THREE.Matrix4();
  try {
    markers.update(.3,world);
    assert.equal(markers.siteGeography.renderedIds.size,0);
    assert.equal(markers.siteMeshes.cave.count,1);
    assert.equal(markers.siteMeshes.cave.userData.renderSites[0].id,site.id);
    markers.siteMeshes.cave.getMatrixAt(0,matrix);
    assert(matrix.elements[13]>elevation.at(site.x,site.y)+.25,'cave doorway clears local slope');
    const narrow={x0:16,y0:12,x1:17,y1:13,contains:(x,y)=>x>=16&&x<17&&y>=12&&y<13};
    markers.setRegionGeometry(new RegionGeometry(world,narrow),true);markers.update(.3,world);
    assert.equal(markers.siteMeshes.cave.count,0,'partial footprint cannot leak into locked region');
    markers.setRegionGeometry(null);markers.update(.3,world);
    world.removeSite(site);markers.update(.3,world);
    assert.equal(markers.siteMeshes.cave.count,0,'expired identity has no fallback marker');
  } finally {markers.dispose();}
}
for (const [level, draw, outcome, major] of [[8,0,'success',false],[8,.99999,'failure',false],
  [9,0,'success',true],[9,.99999,'failure',true]]) {
  const {world,entity}=fixture(260600+level*10+Math.round(draw));
  entity.level=level; entity.exp=3000; entity.root.quality=0;
  entity.x=entity.tx=28.25; entity.y=entity.ty=20.25;
  entity.heartDemon=0; entity.pollution=0; entity.karma=0; entity.fortune=50;
  attemptBreakthrough(world,entity,()=>draw);
  const result=peekRuntimeEvents(world).find(e=>e.type==='breakthrough');
  assert.equal(result?.data.outcome,outcome); assert.equal(result.data.major,major);
  const stage=new PresentationStage(), probe=probeFor(world);
  try {
    stage.ingestWorlds(world).update(.12);probe.update(stage,world);
    assert.equal(probe.breakthrough.stats.active,1);
    const style=`${major?'major':'minor'}${outcome==='success'?'Success':'Failure'}`;
    assert.equal(probe.breakthrough.batches[style].mesh.count,1);
    assert.equal(probe.breakthrough.auras[style].mesh.count,1);
    assert(probe.breakthrough.auras[style].geometry.getAttribute('position').array.some((v,i)=>i%3===1&&v>.5));
    assert(probe.breakthrough.stats.drawCalls<=8);
    assert.equal(probe.combat.stats.lightningActive,major?1:0);
    if (major) assert(probe.combat.batches.thunder.mesh.instanceMatrix.array[1]>4,
      'formal tribulation has a tall lightning stroke');
    stage.update(3);probe.update(stage,world);assert.equal(probe.breakthrough.stats.active,0);
  } finally {probe.dispose();stage.dispose();}
}

{
  const {world,entity,life}=fixture(260699);
  let target=world.entities.find(e=>e!==entity && e.id>0);
  if (!target) {
    for (let i=0;i<world.w*world.h&&!target;i++) {
      if (!world.isWalkable(i)||world.struct[i]) continue;
      life.spawn(i%world.w,Math.floor(i/world.w),'cultivator',1);
      target=world.entities.find(e=>e!==entity&&e.id>0);
    }
  }
  assert(target,'formal second Life entity');
  entity.level=30; entity.x=entity.tx=28.2;entity.y=entity.ty=20.2;
  target.x=target.tx=28.8;target.y=target.ty=20.2;target.maxHp=target.hp=100000;
  const hp=target.hp;life.attack(entity,target,.001);
  assert(target.hp<hp,'actual Life.attack reduced HP');
  const event=peekRuntimeEvents(world).find(e=>e.type==='combat-hit'&&e.subjectId===entity.id&&e.targetId===target.id);
  assert(event,'formal combat hit event');
  assert(combatPresentationStats(world).emitted>0);
  const stage=new PresentationStage(),probe=probeFor(world);
  try {
    stage.ingestWorlds(world).update(.12);probe.update(stage,world);
    const item=stage.snapshotPlane('mortal').items.find(i=>i.kind==='combat');
    assert(item&&item.ttl>=.65&&item.data.tier==='high');
    assert.equal(probe.combat.stats.combatActive,1);
    assert(probe.combat.stats.drawCalls<=3);
    stage.update(1);probe.update(stage,world);assert.equal(probe.combat.stats.active,0);
  } finally {probe.dispose();stage.dispose();}
}
console.log('G2.6 FX: formal breakthrough outcomes and real Life.attack -> presentation -> 3D pools passed');
