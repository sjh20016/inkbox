import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { nativeApi } from './inkbox-wx-e0-replay.mjs';
import { loadCheckpoint } from './inkbox-mlod0b-inputs.mjs';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const api = await nativeApi(root);
const rows = [];
for (const age of [100, 400]) {
  const {saved,file,sha256:hash,bytes} = loadCheckpoint(age);
  const c = api.restore(saved);
  const count = id => c.world.entities.reduce((total, entity) => total + (entity.faction === id ? 1 : 0), 0);
  const pop = id => c.world.entities.reduce((total, entity) => total + (entity.faction === id && api.demographics.isPracticingHuman(entity) && entity.hp > 0 && entity.age < entity.lifespan && !entity._ascended ? 1 : 0), 0);
  rows.push({ age, file, sha256: hash, day: c.world.day, entities: c.world.entities.length, villages: c.world.villages.length, sects: c.world.factions.length, factions: c.world.factions.filter(s => age === 400 && [2, 42].includes(s.id)).map(s => ({id:s.id,name:s.name,stored:{followers:s.followers,pop:s.pop},derived:{followers:count(s.id),pop:pop(s.id)},memberIds:c.world.entities.filter(e=>e.faction===s.id).map(e=>e.id),practitionerIds:c.world.entities.filter(e=>e.faction===s.id&&api.demographics.isPracticingHuman(e)&&e.hp>0&&e.age<e.lifespan&&!e._ascended).map(e=>e.id)})) });
  if (age === 400) {
    assert.deepEqual(rows.at(-1).factions.map(s => [s.id,s.stored.followers,s.stored.pop,s.derived.followers,s.derived.pop]),[[2,599,72,574,69],[42,0,0,25,3]]);
  }
}
const birthWorld=api.restore(loadCheckpoint(100).saved);
const birthVillage=birthWorld.world.villages[0];
const before=api.capture(birthWorld);
const denied=birthWorld.life.spawn(birthVillage.x,birthVillage.y,'human',1,0,{village:birthVillage.id,allowSouls:true,parents:null});
assert.equal(denied,0,'Missing parents must reject natural birth');
assert.deepEqual(api.capture(birthWorld),before,'Rejected birth must not mutate world or RNG');
const birthWitness={villageId:birthVillage.id,attemptedNaturalBirthWithoutParents:1,created:denied,worldAndRuntimeUnchanged:true};
const out = path.join(root,'reports/mlod0b/red-fixture.json');
fs.writeFileSync(out, JSON.stringify({baseline:'3772bea8fa7b7ef753770c3a47877e6b461dd3c8',rows,birthWitness},null,2)+'\n');
console.log(JSON.stringify({out,rows:rows.map(({age,day,entities,factions})=>({age,day,entities,factions}))}));
