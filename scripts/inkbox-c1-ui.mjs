import assert from 'node:assert/strict';
import { World } from '../src/inkbox/world/World.js';
import { TERRAIN } from '../src/inkbox/core/config.js';
import { personLifeFacts, personLifeRows, personBirthOriginText } from '../src/inkbox/ui/personLifeFacts.js';
import { settlementInspectCard } from '../src/inkbox/ui/settlementInspector.js';
import { sectSupplyFacts } from '../src/inkbox/ui/sectSupplyFacts.js';
import { buildCharacterViewModel } from '../src/inkbox/g1/characterRuntime.js';
import { serializeWorld, deserializeWorld } from '../src/inkbox/io/save.js';

const world = new World(32, 32, 61001);
world.height.fill(0.48); world.type.fill(TERRAIN.GRASS); world.water.fill(0); world.fire.fill(0);
const village = { id: 1, name: '生息村', x: 16, y: 16, hp: 100, faction: 1, food: 90,
  pop: 999, houses: [], fieldTiles: [], level: 1, foundedDay: 0, history: [] };
const sect = { id: 1, name: '生息门', villages: [1], war: new Set(), resources: { provisions: 5 }, destroyedDay: -1 };
world.villages = [village]; world.factions = [sect];
const person = (id, sp, age, level = 0) => ({ id, sp, age, level, hp: 10, lifespan: 65 * 360,
  x: 16, y: 16, name: `居民${id}`, village: 1, faction: 1, log: [] });
world.entities = [person(1, 'human', 18 * 360 - 1), person(2, 'human', 18 * 360),
  person(3, 'cultivator', 30 * 360, 1), person(4, 'cultivator', 0)];
world.entities[3].pastLife = { name: '前世长老', level: 40 };

for (const years of [60, 110, 240, 620]) {
  assert.equal(personLifeFacts({ ...world.entities[0], lifespan: years * 360 }).adulthood, '未成年');
  assert.match(personLifeFacts({ ...world.entities[1], lifespan: years * 360 }).adulthood, /^成年/);
}
const infant = buildCharacterViewModel(world, 'mortal:4');
assert.match(infant.header.realm, /未入门/);
assert.equal(infant.header.ageText, '0 岁');
assert.equal(infant.header.lifespanText, '寿元上限 65 年');
assert.ok(infant.overview.some(row => row.label === '身份' && /转世/.test(row.value)));
assert.ok(infant.overview.some(row => row.label === '出生来历' && /不可考/.test(row.value)), 'old saves never invent origin');
const elder = { ...world.entities[2], age: 900 * 360, lifespan: 1500 * 360, log: [],
  birthOrigin: { kind: 'village', day: 1, villageId: 999, villageName: '已荒废的旧村', parentNames: ['已故父', '已故母'] } };
world.entities.push({ ...elder, id: 5 });
assert.equal(personBirthOriginText(elder), '凡间自然出生 · 已荒废的旧村 · 双亲 已故父、已故母');
assert.ok(buildCharacterViewModel(world, 'mortal:5').overview.some(row => row.label === '出生来历'
  && row.value === personBirthOriginText(elder)), 'a durable origin is shown with no retained birth log or live parents');
const oldOriginRestored = deserializeWorld(structuredClone(serializeWorld(world)));
assert.ok(buildCharacterViewModel(oldOriginRestored, 'mortal:5').overview.some(row => row.label === '出生来历'
  && row.value === personBirthOriginText(elder)), 'durable origin survives save/load');
world.entities.pop();
assert.deepEqual(personLifeRows({ sp: 'ghost', age: 100, lifespan: 200 }), []);

const before = structuredClone(serializeWorld(world));
const rows = settlementInspectCard(world, village).rows;
assert.match(rows.find(row => row[0] === '人口')[1], /^4 人 · 凡人 3 \/ 修士 1$/);
assert.match(rows.find(row => row[0] === '成年劳力')[1], /^1 名/);
assert.match(rows.find(row => row[0] === '粮食余缺')[1], /富余 40.0/);
assert.equal(sectSupplyFacts(world, sect).ledger, '粮草收支尚未记账');
sect.economy = { lastDt: 2, lastDay: 2, lastSupplied: 0.4, lastConsumed: 0.1, recruited: 3 };
const facts = sectSupplyFacts(world, sect);
assert.equal(facts.practitioners, 1);
assert.match(facts.ledger, /入 0.200 · 耗 0.050 · 净 \+0.150/);
assert.match(facts.succession, /记账以来入门 3 人/);
delete sect.economy;
assert.deepEqual(serializeWorld(world), before, 'all inspection readers leave the saved state untouched');

const restored = deserializeWorld(before);
assert.deepEqual(buildCharacterViewModel(restored, 'mortal:4').header, infant.header);
assert.deepEqual(settlementInspectCard(restored, restored.villages[0]).rows, rows);
world.entities = world.entities.filter(e => e.level > 0);
assert.match(sectSupplyFacts(world, sect).succession, /地方断供/);
assert.equal(sectSupplyFacts(world, sect).practitioners, 1, 'existing cultivator survives display of supply loss');
console.log('✓ C1 UI: absolute adulthood, identity/attainment/longevity, real village counts, settled supply, read purity and save/load');
