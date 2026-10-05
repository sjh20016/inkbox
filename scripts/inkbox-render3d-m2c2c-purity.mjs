import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { makeTestHost } from './inkbox-c2c-test-utils.mjs';
import { generateWorld } from '../src/inkbox/world/worldgen.js';
import { generateUpperWorld } from '../src/inkbox/world/worldgenUpper.js';
import { generateNetherWorld } from '../src/inkbox/world/worldgenNether.js';
import { RegionMask } from '../src/inkbox/ui/RegionMask.js';
import { normalizeRegion } from '../src/inkbox/ui/tools.js';
import { mulberry32 } from '../src/inkbox/core/noise.js';
import { Life, mercyRngFor, MERCY_SEED_KEY } from '../src/inkbox/sim/life.js';
import { UpperLife } from '../src/inkbox/sim/upperLife.js';
import { openRifts, riftRngFor, RIFT_SEED_KEY, netherRiftRngFor, NETHRIFT_SEED_KEY,
  netherItemRngFor, NETHERITEM_SEED_KEY, netherPossessRngFor, NETHER_POSSESS_SEED_KEY } from '../src/inkbox/sim/rifts.js';
import { mortalHauntRngFor, MORTALHAUNT_SEED_KEY } from '../src/inkbox/sim/wraiths.js';
import { advanceWorld, createAdvanceState } from '../src/inkbox/sim/advance.js';
import { serializeWorld } from '../src/inkbox/io/save.js';
import { PresentationStage } from '../src/inkbox/render/presentationStage.js';
import { GEOGRAPHY_FEATURES } from '../src/inkbox/render3d/stage/GeographyFeatures.js';

const OUT=path.resolve(process.env.INKBOX_REPORT_DIR || 'reports/local/m2c2c/purity');
const SHA=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const STREAMS=[['mercy',MERCY_SEED_KEY,mercyRngFor],['rift',RIFT_SEED_KEY,riftRngFor],
  ['netherRift',NETHRIFT_SEED_KEY,netherRiftRngFor],['netherItem',NETHERITEM_SEED_KEY,netherItemRngFor],
  ['netherPossess',NETHER_POSSESS_SEED_KEY,netherPossessRngFor],['mortalHaunt',MORTALHAUNT_SEED_KEY,mortalHauntRngFor]];
const MODES=['no-render','C2B-production','sites','leylines','upperQi','netherYin','riftFx',
  'all-C2C','upper-window','nether-window','toggle-cycle'];
const report={suite:'C2C 11-mode 600-day actual GLB purity',gpu:false,modes:[],passed:false,
  fixture:'identical seeded three-world simulation; four explicit Site API test fixtures and real openRifts producer in every mode'};
function hiddenPositions(world){
  const result={};
  for(const [name,salt,get] of STREAMS){
    const sample=Array.from({length:8},()=>get(world)()),rng=mulberry32((world.seed^salt)>>>0);
    const sequence=new Float64Array(1000008);for(let i=0;i<sequence.length;i++)sequence[i]=rng();
    let found=-1;
    outer:for(let i=0;i<=1000000;i++){
      for(let j=0;j<8;j++)if(sequence[i+j]!==sample[j])continue outer;
      found=i;break;
    }
    assert(found>=0,`${name}: hidden RNG position exceeds scan limit`);result[name]=found;
  }
  return result;
}
function noPresentationKeys(value,prefix=''){
  if(!value||typeof value!=='object')return;
  for(const [key,child] of Object.entries(value)){
    assert(!/(?:geographyFeatures|scalarField|fieldTexture|riftFx|productionAssets|lodEnabled|environmentAsset)/i.test(key),`save presentation key ${prefix}.${key}`);
    noPresentationKeys(child,`${prefix}.${key}`);
  }
}
for(const mode of MODES){
  const seed=908,preset={w:64,h:48};
  const world=generateWorld({preset,seed,scatter:true});
  world.upper=generateUpperWorld({preset,seed});world.nether=generateNetherWorld({preset,seed});
  for(const [i,kind] of ['secret','cave','formation','ruin'].entries())
    world.addSite({kind,x:15+i*6,y:22,name:`CPU purity fixture ${kind}`,age:0,visits:0});
  const selection={x0:10,y0:9,x1:44,y1:35};
  const opened={upper:openRifts(world,selection,'upper'),nether:openRifts(world,selection,'nether')};
  assert(opened.upper.opened&&opened.nether.opened);
  const state=createAdvanceState(),counts={};let total=0;
  const counted=(name,rng)=>{counts[name]=0;return()=>{counts[name]++;total++;return rng();};};
  const life=new Life(world,counted('life',mulberry32(seed^0xa5a5a5a5))),upperLife=new UpperLife(world.upper);
  life.warRng=counted('war',life.warRng);upperLife.rng=counted('upper',upperLife.rng);
  upperLife.spatialRng=counted('upperSpatial',upperLife.spatialRng);
  const deps={life,upperLife,state,rng:counted('advance',mulberry32(seed^0x1a2b3c4d)),nether:true,wraith:true,riftActive:true};
  const presentation=new PresentationStage(),host=mode==='no-render'?null:makeTestHost(world);
  const region=new RegionMask(normalizeRegion([[10,9],[44,9],[44,35],[10,35]],world,.45));
  const coverage={frames:0,snapshotItems:0,fieldUploads:0,siteInstances:0,leylineInstances:0,fxInstances:0};
  try{
    if(host){
      host.setArtProfile('realm-style-v1');host.setGeographyEnabled(false);host.setPresentation(presentation);
      if(GEOGRAPHY_FEATURES.includes(mode))host.setGeographyFeature(mode,true);
      if(['all-C2C','upper-window','nether-window','toggle-cycle'].includes(mode))host.setGeographyEnabled(true);
      if(mode==='upperQi')host.setActivePlane('upper');if(mode==='netherYin')host.setActivePlane('nether');
      if(mode.endsWith('-window'))host.setRealmViewState({open:true,targetPlane:mode.startsWith('upper')?'upper':'nether',region});
    }
    for(let day=0;day<600;day++){
      advanceWorld(world,1,deps);
      const before=total;
      // The same sole presentation consumer runs in all eleven modes.
      presentation.ingestWorlds(world).update(.2);
      for(const plane of ['mortal','upper','nether'])coverage.snapshotItems+=presentation.snapshotPlane(plane).items.length;
      if(host){
        if(mode==='toggle-cycle'){
          if(day%10===0){host.setProductionAssetsEnabled((day/10)%2===0);host.setGeographyEnabled((day/20|0)%2===0);}
          if(day%15===0)host.setArtProfile(['legacy','realm-style-v1'][(day/15|0)%2]);
          if(day%20===0){host.setLODEnabled((day/20)%2===0);host.cameraRig.camera.zoom=1+(day%60)/20;host.cameraRig.camera.updateProjectionMatrix();}
          if(day%12===0){const phase=(day/12|0)%3;host.setRealmViewState(phase?{open:true,targetPlane:phase===1?'upper':'nether',region}:{open:false});}
        }
        if(mode==='all-C2C'&&day%60===0)host.setActivePlane(['mortal','upper','nether'][(day/60|0)%3]);
        host.update(.2);coverage.frames++;
        const g=host.getGeographyStats();
        for(const stage of Object.values(g.stages))if(stage.visible){
          coverage.siteInstances+=stage.site?.instances||0;coverage.leylineInstances+=stage.leyline?.instances||0;
          coverage.fieldUploads+=stage.field?.uploads||0;coverage.fxInstances+=stage.fx?.active||0;
        }
      }
      assert.equal(total,before,`${mode}: presentation consumes simulation RNG`);
    }
    const save=serializeWorld(world);noPresentationKeys(save);
    const row={mode,days:world.day,worldSha:SHA(world),advanceSha:SHA(state),fullSha:SHA({world,advanceState:state}),
      saveSha:SHA(save),saveKeys:Object.keys(save).sort(),rng:{directCounts:{...counts},hiddenPositions:hiddenPositions(world),directTotal:total},coverage};
    assert.equal(world.day,600);assert.equal(Object.keys(counts).length,5);assert(coverage.snapshotItems>0,'actual producer FX snapshots exercised');
    if(host)assert.equal(coverage.frames,600);
    if(mode==='upperQi'||mode==='netherYin')assert(coverage.fieldUploads>0,`${mode} is not connected`);
    if(mode==='leylines')assert(coverage.leylineInstances>0,'leyline geography is not connected');
    if(mode==='riftFx')assert(coverage.fxInstances>0,'pooled Rift FX is not connected');
    const baseline=report.modes[0];
    if(baseline){for(const key of ['worldSha','advanceSha','fullSha','saveSha'])assert.equal(row[key],baseline[key],`${mode} ${key}`);
      assert.deepEqual(row.saveKeys,baseline.saveKeys);assert.deepEqual(row.rng,baseline.rng,`${mode} all eleven RNG streams`);}
    report.modes.push(row);console.log(`PASS ${mode}: World/advance/save + 11 RNG streams ${row.fullSha.slice(0,16)}`);
  }finally{host?.dispose();}
}
assert.equal(report.modes.length,11);report.passed=true;
fs.mkdirSync(OUT,{recursive:true});fs.writeFileSync(path.join(OUT,'purity.json'),JSON.stringify(report,null,2));
console.log(`PASS eleven actual-GLB modes, 600 days each, digest ${report.modes[0].fullSha}`);
