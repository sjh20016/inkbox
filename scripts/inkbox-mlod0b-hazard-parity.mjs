import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {loadCheckpoint} from './inkbox-mlod0b-inputs.mjs';
import {nativeApi, digest} from './inkbox-wx-e0-replay.mjs';
import {lightning} from '../src/inkbox/sim/powers.js';
import {History} from '../src/inkbox/sim/powers.js';
import {grantRoot} from '../src/inkbox/sim/divine.js';
import {isHumanPerson,isMortalHuman} from '../src/inkbox/core/demographics.js';
import {buildPopulationCensus} from '../src/inkbox/sim/demography/legacyCensus.js';
import {legacyVillageSocieties} from '../src/inkbox/sim/sectEconomy.js';
import {readVillageSocieties,setPopulationUiReadMode} from '../src/inkbox/sim/demography/populationReadPort.js';

const root=path.resolve(fileURLToPath(new URL('../',import.meta.url)));
const dt=Number(process.argv.find(x=>x.startsWith('--dt='))?.slice(5)??3);
assert([0.1,1,3].includes(dt),'dt must match a supported MLOD-0B legal advance span');
const api=await nativeApi(root);
const modes=[['off','legacy'],['audit','audit'],['selective','census']];

function alive(e){return isHumanPerson(e)&&e.hp>0&&!e._ascended&&e.age<e.lifespan;}
function totals(world){
  const g=buildPopulationCensus(world,'hazard-parity').global;
  return Object.fromEntries(['total','living','humans','mortals','practitioners','mortalAdults','fertileMortals','fertileHumans','nonHuman','dead'].map(k=>[k,g[k]]));
}
function portRead(world,mode){
  const result=readVillageSocieties(world,legacyVillageSocieties,mode);
  assert.deepEqual(result.differences,[],`${mode} audit must match the legacy predicate on committed simulation state`);
  return {mode:result.mode,villages:result.societies.size,signature:digest([...result.societies])};
}
function selectLightningTarget(world){
  const candidates=world.entities.filter(alive).sort((a,b)=>a.id-b.id);
  assert(candidates.length,'checkpoint needs living human targets');
  const ranked=candidates.map(center=>({center,count:candidates.filter(e=>(e.x-center.x)**2+(e.y-center.y)**2<=16).length}))
    .sort((a,b)=>b.count-a.count||a.center.id-b.center.id);
  return ranked[0];
}
function selectRootTarget(world){
  const target=world.entities.filter(e=>isMortalHuman(e)&&alive(e)).sort((a,b)=>a.id-b.id)[0];
  assert(target,'checkpoint needs a living mortal human for grantRoot');
  return target;
}

const rows=[];
for(const age of [100,400]){
  const cp=loadCheckpoint(age);
  for(const eventKind of ['lightning','grantRoot']){
    const runs=[];
    for(const [label,portMode] of modes){
      const c=api.restore(cp.saved),world=c.world;
      if(portMode==='legacy')setPopulationUiReadMode(world,'legacy');
      else setPopulationUiReadMode(world,portMode);
      const before=totals(world),beforeSave=digest(api.capture(c));
      const livingHumanIds=new Set(world.entities.filter(alive).map(e=>e.id));
      const queryBefore=portRead(world,portMode);
      let write;
      if(eventKind==='lightning'){
        const {center,count}=selectLightningTarget(world),history=new History();
        history.begin({toolId:'lightning',x:center.x,y:center.y,radius:0});
        const text=lightning(world,center.x,center.y,history);
        assert.equal(history.end('雷击'),true,'official terrain/disaster write must commit through History');
        const marked=world.entities.filter(e=>livingHumanIds.has(e.id)&&e.hp<=0);
        const humanMarked=marked.filter(isHumanPerson);
        assert(humanMarked.length>0,'controlled lightning must mark at least one actual human casualty');
        write={kind:'controlled-player-disaster',writer:'sim/powers.js:lightning',targetId:center.id,
          target:{x:center.x,y:center.y},livingHumansInRadius:count,markedHumanCasualties:humanMarked.length,text};
      }else{
        const target=selectRootTarget(world),beforeLevel=target.level;
        const text=grantRoot(world,target.x,target.y,0.5,()=>0,target.id);
        assert.equal(target.level,1,'official grantRoot must awaken the selected mortal');
        assert(beforeLevel===0);
        write={kind:'controlled-divine-write',writer:'sim/divine.js:grantRoot',targetId:target.id,
          target:{x:target.x,y:target.y},levelBefore:beforeLevel,levelAfter:target.level,text};
      }
      const afterWrite=totals(world),queryAfterWrite=portRead(world,portMode);
      api.advance(c,dt);
      const afterStep=totals(world),queryAfterStep=portRead(world,portMode),full=api.capture(c);
      assert.equal(world.day,cp.saved.day+dt,'the scenario must cross one legal advanceWorld dt boundary');
      if(eventKind==='lightning'){
        assert(afterStep.humans<before.humans,'lightning-marked humans must flow through Life death cleanup');
        assert(world.dead.length>0,'formal Life death cleanup should retain the deceased ledger');
      }else{
        assert(afterWrite.practitioners>before.practitioners,'grantRoot must change the population practitioner predicate');
        assert(afterWrite.mortals<before.mortals,'grantRoot must remove its target from the mortal predicate');
      }
      runs.push({mode:label,portMode,beforeSaveSha256:beforeSave,before,write,afterWrite,afterStep,
        day:world.day,query:{before:queryBefore,afterWrite:queryAfterWrite,afterStep:queryAfterStep},
        v11G8Sha256:digest(full),runtimeSha256:digest(full.runtime),deadRetained:world.dead.length});
    }
    assert.equal(new Set(runs.map(r=>r.v11G8Sha256)).size,1,`${age}y ${eventKind}: off/audit/selective complete v11+G8 states must match at same dt`);
    assert.equal(new Set(runs.map(r=>r.query.afterStep.signature)).size,1,`${age}y ${eventKind}: population reads must match after the legal step`);
    rows.push({age,input:{file:cp.file,sha256:cp.sha256,day:cp.saved.day},eventKind,dt,runs,
      parity:{completeV11G8Equal:true,postStepPopulationReadEqual:true,allModeQueriesAgree:runs.every(r=>r.query.afterStep.mode===r.portMode)}});
  }
}

const git=args=>execFileSync('git',['-C',root,...args],{encoding:'utf8'}).trim();
const evidence={baseline:'3772bea8fa7b7ef753770c3a47877e6b461dd3c8',source:{head:git(['rev-parse','HEAD']),dirty:git(['status','--porcelain'])},
  environment:{node:process.version,platform:process.platform},dt,rows,
  conclusion:'All cases start from the fixed natural v11+G8 checkpoint. Lightning and grantRoot are controlled official player writes, not naturally triggered events. Each is followed by one legal advanceWorld(dt); off(legacy), audit, and selective(census) branches have identical full saved world plus registered runtime/RNG state and identical post-step population reads.'};
assert(rows.every(r=>r.parity.completeV11G8Equal&&r.parity.postStepPopulationReadEqual));
const out=path.join(root,'reports/mlod0b/hazard-parity.json');fs.mkdirSync(path.dirname(out),{recursive:true});
fs.writeFileSync(out,JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify({pass:true,dt,cases:rows.map(r=>({age:r.age,event:r.eventKind,sha:r.runs[0].v11G8Sha256}))}));
