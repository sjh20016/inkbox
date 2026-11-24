import { mkdirSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { createSandboxWorld } from '../src/inkbox/ui/worldCreation.js';
import { WORLD_PRESETS, TIME } from '../src/inkbox/core/config.js';
import { enableWanxiang } from '../src/inkbox/wanxiang/runtime.js';
import { Life } from '../src/inkbox/sim/life.js';
import { advanceWorld, createAdvanceState } from '../src/inkbox/sim/advance.js';
import { rngStream } from '../src/inkbox/core/noise.js';

const out='reports/local/wanxiang/profile';mkdirSync(out,{recursive:true});
const seeds=[73101,73102], years=Number(process.argv.find(x=>x.startsWith('--years='))?.split('=')[1]||30), step=3, results=[];
for(const seed of seeds){
 const started=performance.now();
 const world=createSandboxWorld(WORLD_PRESETS.small,seed,{terrainPreset:'standard'});
 enableWanxiang(world);
 const life=new Life(world,rngStream(world.seed ^ 0xa5a5a5a5)),state=createAdvanceState();
 const snapshots=[];
 const sample=()=>{
  const living=world.entities.filter(e=>e.hp>0&&['human','cultivator'].includes(e.sp));
  const profiles=living.map(e=>e.wanxiang).filter(Boolean);
  const count=(key)=>profiles.filter(p=>p[key]).length;
  snapshots.push({year:world.year,day:world.day,population:living.length,withProfile:profiles.length,
   species:{human:living.filter(e=>e.sp==='human').length,cultivator:living.filter(e=>e.sp==='cultivator').length},
   traits:{personality:profiles.filter(p=>p.personality?.length).length,hobbies:profiles.filter(p=>p.hobbies?.length).length,traitEntries:profiles.reduce((n,p)=>n+(p.traits?.length||0),0),physique:count('physique'),bloodlines:profiles.filter(p=>p.bloodlines?.length).length,hexagram:count('hexagram'),daoSeed:count('daoSeed')},
   activeEncounters:world.wanxiang?.encounters?.filter(s=>s.stage==='open').length??0,
   ledgers:{profileHistoryEntries:profiles.reduce((n,p)=>n+(p.history?.length||0),0),encounterParticipants:world.wanxiang?.encounters?.filter(s=>s.stage==='open').reduce((n,s)=>n+(s.participants?.length||0),0)||0},
   elapsedMs:Math.round(performance.now()-started)});
 };
 sample();
 for(let d=0;d<years*TIME.daysPerYear;d+=step){advanceWorld(world,step,{life,state});if(world.day%(TIME.daysPerYear*2)===0)sample();}
 sample();results.push({seed,preset:'small',years,worldDay:world.day,elapsedMs:Math.round(performance.now()-started),snapshots});
}
const report={method:'Native createSandboxWorld and advanceWorld at 3-day steps, Alpha enabled before simulation; no manual spawns, forced facts, encounter injection, or reward grants.',seeds,years,results};
writeFileSync(`${out}/profile.json`,JSON.stringify(report,null,2));
console.log(JSON.stringify(results.map(r=>({seed:r.seed,elapsedMs:r.elapsedMs,checkpoints:r.snapshots.map(s=>({year:s.year,population:s.population,profiles:s.withProfile,traits:s.traits}))}))));
