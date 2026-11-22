import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { nativeApi } from './inkbox-wx-e0-replay.mjs';
import { loadCheckpoint } from './inkbox-mlod0b-inputs.mjs';
import { setPopulationPhaseObserver } from '../src/inkbox/sim/demography/phaseProbe.js';

const root=path.resolve(fileURLToPath(new URL('..',import.meta.url)));
const api=await nativeApi(root);
const cp=loadCheckpoint(100),a=api.restore(cp.saved),b=api.restore(cp.saved);
const events=[];
let prior=new Map(b.world.entities.map(e=>[e.id,{village:e.village,faction:e.faction,hp:e.hp,ascended:e._ascended}]));
setPopulationPhaseObserver(b.world,(phase,detail)=>{
  if (!['after-death-cleanup','after-natural-birth','after-village-split-membership','before-schism','after-schism-membership','after-villages','after-sects'].includes(phase)) return;
  const current=new Map(b.world.entities.map(e=>[e.id,{village:e.village,faction:e.faction,hp:e.hp,ascended:e._ascended}]));
  const changed=[];
  for(const [id,after] of current){const before=prior.get(id);if(!before||before.village!==after.village||before.faction!==after.faction||before.ascended!==after.ascended)changed.push({id,before,after});}
  for(const [id,before] of prior)if(!current.has(id))changed.push({id,before,after:null});
  if(changed.length||detail)events.push({day:b.world.day,phase,firstWriter:detail?.firstWriter||phase,detail,changed:changed.slice(0,20),changedTotal:changed.length,entityCount:b.world.entities.length});
  prior=current;
});
for(let n=0;n<120;n++){api.advance(a,3);api.advance(b,3);assert.deepEqual(api.capture(a),api.capture(b),`observer changed world at step ${n}`);}
setPopulationPhaseObserver(b.world,null);
const result={source:cp.sha256,startDay:cp.saved.day,endDay:b.world.day,steps:120,pass:true,events,counts:Object.fromEntries([...new Set(events.map(e=>e.phase))].map(phase=>[phase,events.filter(e=>e.phase===phase).length]))};
const out=path.join(root,'reports/mlod0b/phase-events.json');fs.writeFileSync(out,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({out,events:events.length,counts:result.counts}));
