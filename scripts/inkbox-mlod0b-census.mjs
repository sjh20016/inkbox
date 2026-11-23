import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {nativeApi} from './inkbox-wx-e0-replay.mjs';
import {buildPopulationCensus, compareCensusToLegacy} from '../src/inkbox/sim/demography/legacyCensus.js';
import {villageSocieties} from '../src/inkbox/sim/sectEconomy.js';
import {hasMortalResidents} from '../src/inkbox/core/demographics.js';
const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
import {loadCheckpoint} from './inkbox-mlod0b-inputs.mjs';
const api = await nativeApi(root);
const cases = [];
for (const age of [100,400]) {
  const {saved, file, sha256, bytes} = loadCheckpoint(age);
  const {world} = api.restore(saved);
  const census = buildPopulationCensus(world, 'loaded-checkpoint');
  const oracle = villageSocieties(world);
  for (const [id, facts] of census.villages) {
    assert.deepEqual(facts.society, oracle.get(id), `${age}y village ${id}`);
    assert.equal(facts.society.mortals > 0, hasMortalResidents(world,id), `${age}y hasMortalResidents ${id}`);
  }
  const byClass = {mortal:0,practicing:0,other:0};
  for (const e of world.entities) {
    if (e.sp !== 'human' && e.sp !== 'cultivator') byClass.other++;
    else if (e.level > 0) byClass.practicing++;
    else byClass.mortal++;
  }
  assert.equal(census.byPlane.get('mortal').total, world.entities.length);
  assert.equal(census.villages.size, world.villages.length);
  assert.equal(census.sects.size, world.factions.length);
  cases.push({age,input:{file:path.relative(root,file),sha256,bytes},day:world.day,entities:world.entities.length,byClass,villages:census.villages.size,sects:census.sects.size,unassigned:census.unassigned,sectCacheDifferences:world.factions.map(s=>({id:s.id,name:s.name,cache:{followers:s.followers,pop:s.pop},derived:{followers:census.sects.get(s.id).followers,pop:census.sects.get(s.id).pop}})).filter(row=>row.cache.followers!==row.derived.followers||row.cache.pop!==row.derived.pop),societyOraclePass:true,staleCacheSuppressedAtLoad:compareCensusToLegacy(world,census,'loaded-checkpoint').length===0});
}
const out=path.join(root,'reports/mlod0b/census.json');
fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify({source:'3772bea8fa7b7ef753770c3a47877e6b461dd3c8',cases},null,2));
console.log(JSON.stringify(cases.map(({age,entities,byClass,sectCacheDifferences})=>({age,entities,byClass,sectCacheDifferences})),null,2));
