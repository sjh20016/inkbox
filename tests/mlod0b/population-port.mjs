import assert from 'node:assert/strict';
import { loadCheckpoint } from '../../scripts/inkbox-mlod0b-inputs.mjs';
import { deserializeWorld } from '../../src/inkbox/io/save.js';
import { villageSocieties } from '../../src/inkbox/sim/sectEconomy.js';
import { readVillageSocieties, setPopulationUiReadMode } from '../../src/inkbox/sim/demography/populationReadPort.js';
import { getSettlementInspection } from '../../src/inkbox/presentation/readView/query.js';
import { manageCommittedWorlds, beginCompleteStep, publishCompleteStep, abortCompleteStep, disposeCommittedWorlds } from '../../src/inkbox/presentation/readView/committedStore.js';

for (const age of [100, 400]) {
  const { saved } = loadCheckpoint(age);
  const world = deserializeWorld(saved);
  const village = world.villages[0];
  const original = villageSocieties(world);
  for (const mode of ['audit', 'census']) {
    const result = readVillageSocieties(world, villageSocieties, mode);
    assert.deepEqual(result.differences, []);
    assert.deepEqual([...result.societies], [...original]);
  }
  // Equal population size and unchanged day still require a fresh read.
  const resident = world.entities.find(e => e.village === village.id && e.hp > 0 && !e._ascended);
  if (resident) {
    const target = world.villages.find(v => v.id !== village.id);
    const prior = resident.village;
    resident.village = target.id;
    assert.deepEqual([...villageSocieties(world, 'census')], [...villageSocieties(world)]);
    resident.village = prior;
  }
  manageCommittedWorlds(world);
  const legacyCard = getSettlementInspection(world, 'mortal', village.id);
  for (const mode of ['audit', 'census']) {
    setPopulationUiReadMode(world, mode);
    assert.deepEqual(getSettlementInspection(world, 'mortal', village.id).rows, legacyCard.rows);
  }
  beginCompleteStep(world);
  if (resident) resident.village = world.villages.at(-1).id;
  assert.deepEqual(getSettlementInspection(world, 'mortal', village.id).rows, legacyCard.rows);
  assert.throws(() => readVillageSocieties(world, villageSocieties, 'census'));
  publishCompleteStep(world);
  assert.notEqual(getSettlementInspection(world, 'mortal', village.id), null);
  const committedCard = getSettlementInspection(world, 'mortal', village.id);
  beginCompleteStep(world);
  if (resident) resident.faction = 999999;
  abortCompleteStep(world);
  assert.deepEqual(getSettlementInspection(world, 'mortal', village.id), committedCard);
  assert.throws(() => setPopulationUiReadMode(world, 'legacy'));
  disposeCommittedWorlds(world);
  assert.throws(() => setPopulationUiReadMode(world, 'audit'));
  console.log(`${age}y population port passed`);
}
