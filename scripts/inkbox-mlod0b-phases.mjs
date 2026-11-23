import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { nativeApi } from './inkbox-wx-e0-replay.mjs';
import { loadCheckpoint } from './inkbox-mlod0b-inputs.mjs';
import { setPopulationPhaseObserver } from '../src/inkbox/sim/demography/phaseProbe.js';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const api = await nativeApi(root);
const digest = value => createHash('sha256').update(value).digest('hex');
const output = { baseline: '3772bea8fa7b7ef753770c3a47877e6b461dd3c8', cases: [] };
for (const age of [100, 400]) {
  const {file,sha256,bytes,saved} = loadCheckpoint(age);
  const a = api.restore(saved), b = api.restore(saved);
  const phases = [];
  const state = (world, phase, detail) => ({
    day: world.day, phase, detail, entityCount: world.entities.length,
    factions: world.factions.filter(s => age === 400 && [2, 42].includes(s.id)).map(s => {
      const members = world.entities.filter(e => e.faction === s.id);
      return {id:s.id,stored:{followers:s.followers,pop:s.pop},derived:{followers:members.length,pop:members.filter(e=>api.demographics.isPracticingHuman(e)&&e.hp>0&&e.age<e.lifespan&&!e._ascended).length}};
    })
  });
  phases.push(state(b.world, 'restored', null));
  setPopulationPhaseObserver(b.world, (phase, detail) => phases.push(state(b.world, phase, detail)));
  api.advance(a, 3);
  api.advance(b, 3);
  setPopulationPhaseObserver(b.world, null);
  const aBytes=JSON.stringify(api.capture(a)),bBytes=JSON.stringify(api.capture(b));
  assert.equal(bBytes,aBytes,'phase observer changed the serialized world/runtime');
  phases.push(state(b.world,'complete-step',null));
  output.cases.push({age,file,sha256,startDay:saved.day,endDay:b.world.day,phases,worldAndRuntimeSha256:digest(bBytes),equalToUnobserved:true});
}
output.pass = true;
const out=path.join(root,'reports/mlod0b/phases.json');
fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify({out,counts:output.cases.map(c=>({age:c.age,phases:c.phases.length,initial:c.phases[0].factions,final:c.phases.at(-1).factions}))}));
