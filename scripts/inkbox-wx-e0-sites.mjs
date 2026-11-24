// Controlled candidate, lifecycle, save and formal-arrival boundaries.
// These fixtures test rules only; they are not natural-world samples.
import assert from 'node:assert/strict';
import {World} from '../src/inkbox/world/World.js';
import {Life} from '../src/inkbox/sim/life.js';
import {TERRAIN} from '../src/inkbox/core/config.js';
import {MANUALS} from '../src/inkbox/core/lore.js';
import {enableWanxiang} from '../src/inkbox/wanxiang/runtime.js';
import {emptyProfile} from '../src/inkbox/wanxiang/profile.js';
import {nearestSeekSite} from '../src/inkbox/sim/siteSearch.js';
import {SITE_LIFESPAN_YEARS,siteHasContent,stepSites} from '../src/inkbox/sim/sites.js';
import {forgeArtifact,toGround,claimGroundArtifact} from '../src/inkbox/sim/artifacts.js';
import {serializeWorld,deserializeWorld} from '../src/inkbox/io/save.js';

const fixture=(seed=93001)=>{
  const world=new World(64,64,seed);
  world.height.fill(.5);world.water.fill(0);world.moist.fill(.6);world.veg.fill(.6);world.type.fill(TERRAIN.GRASS);world.qi.fill(.7);
  return world;
};
const cave=(id,x,y,extra={})=>({id,kind:'cave',name:`受控洞府${id}`,x,y,age:0,visits:0,...extra});
const actor=(id,x,y,level=8)=>({id,name:`受控修士${id}`,sp:'cultivator',level,hp:100,maxHp:100,x,y,plane:0,fortune:60,exp:0,techniques:[],artifacts:[],wanxiang:emptyProfile()});

// An empty nearest cave and a formation cannot mask a farther valid opportunity.
{
  const world=fixture(),empty=cave(1,20,20),formation={id:2,kind:'formation',x:20.5,y:20,age:0};
  const valid=cave(3,24,20,{dragonBoneCharges:1});world.sites=[empty,formation,valid];
  const legacyNear=world.sitesNear(20,20,30);
  assert.deepEqual(legacyNear.map(row=>row.site),[empty,formation,valid],'World.sitesNear keeps its existing all-site distance ordering');
  assert.deepEqual(legacyNear.map(row=>row.dist),[0,.5,4],'World.sitesNear retains distance values');
  assert.equal(nearestSeekSite(world,20,20,30),valid,'skip empty cave and formation, select the nearest real-content site');
  assert.deepEqual(world.sites,[empty,formation,valid],'selection preserves World.sites order and references');
  assert.deepEqual(world.sitesNear(20,20,30),legacyNear,'selector calls do not alter the legacy World.sitesNear result');
}

// Equal distances keep the original array order; the radius is inclusive.
{
  const world=fixture(),first=cave(10,22,20,{phoenixFeatherCharges:1}),second={id:11,kind:'secret',x:18,y:20,age:0};
  world.sites=[first,second];
  assert.equal(nearestSeekSite(world,20,20,2),first,'equal-distance ties retain sites-array order and radius edge is included');
  world.sites.reverse();
  assert.equal(nearestSeekSite(world,20,20,2),second,'reversing site order reverses an exact tie');
  assert.equal(nearestSeekSite(world,20,20,1.999),null,'outside-radius sites are excluded');
}

// Each formal finite cave payload makes a cave a real candidate, then disappears
// immediately when that payload is exhausted or claimed.
{
  const cases=[
    ['inheritanceManual',{inheritanceManual:MANUALS[0].name},s=>{s.inheritanceExhausted=true;}],
    ['dragonBoneCharges',{dragonBoneCharges:1},s=>{s.dragonBoneCharges=0;}],
    ['phoenixFeatherCharges',{phoenixFeatherCharges:1},s=>{s.phoenixFeatherCharges=0;}],
    ['godFragmentCharges',{godFragmentCharges:1},s=>{s.godFragmentCharges=0;}],
  ];
  for(const [label,payload,deplete] of cases){
    const world=fixture(),site=cave(20,22,20,payload);world.sites=[site];
    assert.equal(siteHasContent(site,world),true,`${label} is an existing formal content source`);
    assert.equal(nearestSeekSite(world,20,20,30),site,`${label} qualifies the cave`);
    deplete(site);
    assert.equal(siteHasContent(site,world),false,`${label} depletion is reflected by official content semantics`);
    assert.equal(nearestSeekSite(world,20,20,30),null,`${label} depletion invalidates the candidate without a cache`);
  }
  const claimed=cave(21,22,20,{inheritanceManual:MANUALS[0].name,inheritanceClaimedBy:42});
  const world=fixture();world.sites=[claimed];assert.equal(nearestSeekSite(world,20,20,30),null,'claimed inheritance does not qualify a cave');
}

// Artifact eligibility is tied to a real ground pointer, and claim removes that
// pointer through the formal artifact ownership functions.
let artifactWorld,artifactSite,artifactId,artifactCollectorId;
{
  artifactWorld=fixture(93002);enableWanxiang(artifactWorld,{fresh:true});
  const life=new Life(artifactWorld,()=>.5);assert.equal(life.spawn(30,30,'cultivator',2,0,{genesis:true}),2);
  const [owner,collector]=artifactWorld.entities;owner.level=8;collector.level=8;
  const artifact=forgeArtifact(artifactWorld,owner,()=>.5,{slot:'武器'});assert(artifact,'formal forge produces the controlled test artifact');
  artifactId=artifact.id;artifactCollectorId=collector.id;toGround(artifactWorld,artifact,owner.x,owner.y);
  artifactSite=cave(22,owner.x+1,owner.y,{artifactId});artifactWorld.sites=[artifactSite];
  assert.equal(artifact.ownerId,0);assert(artifactWorld.artifacts.includes(artifact));
  assert.equal(nearestSeekSite(artifactWorld,owner.x,owner.y,30),artifactSite,'site artifact pointer resolves to an unowned ground artifact');
  assert.equal(claimGroundArtifact(artifactWorld,collector,artifactId,()=>.5,'found'),artifact,'formal claim transfers the exact pointed artifact');
  assert.equal(artifact.ownerId,collector.id);assert(!artifactWorld.artifacts.includes(artifact));
  assert.equal(nearestSeekSite(artifactWorld,owner.x,owner.y,30),null,'ownership transfer invalidates the stale site pointer immediately');
}

// One hundred reads do not mutate world, candidate data, artifacts, order or RNG.
{
  toGround(artifactWorld,artifactWorld.entities.find(e=>e.id===artifactCollectorId).artifacts[0],20,20);
  artifactSite.x=22;artifactSite.y=20;
  const before=JSON.stringify(serializeWorld(artifactWorld)),siteOrder=artifactWorld.sites.map(s=>s.id);
  let draws=0;const unrelatedRng=()=>{draws++;return .5;};
  for(let i=0;i<100;i++)assert.equal(nearestSeekSite(artifactWorld,20,20,30),artifactSite);
  assert.equal(JSON.stringify(serializeWorld(artifactWorld)),before,'100 selector reads preserve the full serialized world');
  assert.deepEqual(artifactWorld.sites.map(s=>s.id),siteOrder);assert.equal(draws,0,'selector accepts and consumes no RNG');
}

// v11 restore keeps site-resource and ground-artifact pointers usable, without a
// selector cache tied to the pre-restore World instance.
{
  const saved=serializeWorld(artifactWorld),restored=deserializeWorld(saved),site=restored.sites.find(s=>s.id===artifactSite.id);
  assert.equal(nearestSeekSite(restored,20,20,30),site,'restored unowned artifact remains a live candidate');
  const restoredArtifact=restored.artifacts.find(a=>a.id===artifactId);assert(restoredArtifact);
  const collector=restored.entities.find(e=>e.id===artifactCollectorId);
  assert.equal(claimGroundArtifact(restored,collector,artifactId,()=>.5,'found'),restoredArtifact);
  assert.equal(nearestSeekSite(restored,20,20,30),null,'post-restore claim invalidates candidate immediately');
  const resourceWorld=fixture(93003),resourceSite=cave(30,24,20,{godFragmentCharges:1});resourceWorld.sites=[resourceSite];
  const restoredResource=deserializeWorld(serializeWorld(resourceWorld));
  assert.equal(nearestSeekSite(restoredResource,20,20,30).id,30);
  restoredResource.sites[0].godFragmentCharges=0;
  assert.equal(nearestSeekSite(restoredResource,20,20,30),null,'restored resource exhaustion is read afresh');
}

// Life.planNext changes only the candidate query. The original seek roll remains
// the first draw; the existing duration draw occurs only when a valid target exists.
{
  let draws=0;const world=fixture(93004),life=new Life(world,()=>{draws++;return draws===1?.1:.5;});
  const monk=actor(1,20,20);world.entities.push(monk);world.sites=[
    {id:40,kind:'formation',x:20.5,y:20},cave(41,20.5,20),
  ];
  life.findBestTile=()=>null;
  draws=0;
  const rejected=life.planNext(monk,{canBuild:false});
  assert.notEqual(rejected.state,'seek','empty cave and formation do not create a false seek plan');
  assert.equal(draws,4,'after the unchanged .1 seek roll, empty selection uses only the three existing fallback-wander draws');

  world.sites=[cave(42,24,20,{dragonBoneCharges:1})];draws=0;
  const selected=life.planNext(monk,{canBuild:false});
  assert.equal(selected.state,'seek');assert.equal(selected.x,24.5);assert.equal(selected.y,20.5);
  assert.equal(draws,2,'valid target consumes the existing single duration draw after the unchanged roll');
}

// The 400-year dormant-cave rule deliberately defers equality: keep it at the exact
// boundary, then remove it on the next positive step. Do not rewrite site ageing.
{
  const world=fixture(93005),lifeYears=SITE_LIFESPAN_YEARS.cave,site=cave(50,20,20,{age:lifeYears*360,lastLifecycleDay:0});world.sites=[site];
  stepSites(world,0,()=>.999);
  assert(world.sites.includes(site),'empty cave survives exact lifespan equality');
  world.day=1;stepSites(world,1,()=>.999);
  assert.equal(world.sites.includes(site),false,'empty cave expires on the next positive age step');
}

// WX-B path B already covers production stepEncounters → stepEncounterTravel →
// enterSite and committed site-success/site-failure facts after true arrival.
// Keep this suite focused on selector integration and exact 400-year expiry.

console.log('WX-E0 sites: controlled selector resources, stable ties, radius, no-cache reads, v11 restore, Life RNG draw boundary and dormant-cave expiry passed');
