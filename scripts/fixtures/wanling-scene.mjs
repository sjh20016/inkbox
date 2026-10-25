import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { World } from '../../src/inkbox/world/World.js';
import { recomputeAll } from '../../src/inkbox/world/terrain.js';
import { STRUCT } from '../../src/inkbox/core/config.js';
import { DAO_PATHS, DAO_BY_KEY } from '../../src/inkbox/core/cultivation.js';
import { mulberry32 } from '../../src/inkbox/core/noise.js';
import { Life } from '../../src/inkbox/sim/life.js';
import { lifespanForEntity, maxHpFor } from '../../src/inkbox/sim/cultivation.js';
import { addRelation, RELATION_TYPES } from '../../src/inkbox/sim/relations.js';
import { spawnFormation } from '../../src/inkbox/sim/sites.js';
import { placeLeyline } from '../../src/inkbox/sim/divine.js';
import { forgeArtifact, toGround } from '../../src/inkbox/sim/artifacts.js';
import { spawnWraith } from '../../src/inkbox/sim/wraiths.js';
import { stepDaoActivities } from '../../src/inkbox/sim/daoActivities.js';
import { wanlingState } from '../../src/inkbox/world/wanlingState.js';
import { requestWanling } from '../../src/inkbox/sim/wanling.js';
import { WANLING_CATALOG } from '../../src/inkbox/core/wanlingCatalog.js';
import { readBiyiPairs } from '../../src/inkbox/render/wanlingLayer.js';
import { serializeWorld, deserializeWorld } from '../../src/inkbox/io/save.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DEFAULT_OUTPUT = path.join(ROOT, 'reports', 'local', 'w01');
const SEED = 20261025;

function setTerrain(world) {
  world.height.fill(0.42);
  world.water.fill(0);
  world.temp.fill(0.6);
  world.moist.fill(0.6);
  world.veg.fill(0.5);
  world.fire.fill(0);
  world.flow.fill(0);
  world.riverBase.fill(0);

  for (let y = 18; y <= 44; y += 1) for (let x = 25; x <= 60; x += 1) {
    const i = world.idx(x, y);
    world.veg[i] = 0.9;
    world.moist[i] = 0.75;
  }
  for (let y = 40; y <= 90; y += 1) for (let x = 85; x <= 118; x += 1) {
    const i = world.idx(x, y);
    world.height[i] = 0.24;
    world.water[i] = 0.1;
  }
  for (let y = 18; y <= 44; y += 1) for (let x = 135; x <= 164; x += 1) {
    world.height[world.idx(x, y)] = 0.67;
  }
  recomputeAll(world);
}

function addVillageHouses(world, village, count = 5) {
  const offsets = [[-2, -1], [0, -2], [2, -1], [-1, 2], [2, 2], [-3, 2]];
  for (const [dx, dy] of offsets.slice(0, count)) {
    const x = Math.floor(village.x) + dx;
    const y = Math.floor(village.y) + dy;
    const i = world.idx(x, y);
    if (!world.isBuildable(i) || world.water[i] >= 0.02) continue;
    world.struct[i] = STRUCT.HOUSE;
    village.houses.push({ x, y, type: STRUCT.HOUSE });
  }
  if (village.houses.length < 3) throw new Error(`Village ${village.id} could not receive real house tiles`);
}

function addVillagePeople(life, village, count) {
  const before = life.world.entities.length;
  const created = life.spawn(village.x, village.y, 'human', count, 0, { genesis: true, village: village.id });
  if (created !== count) throw new Error(`Village ${village.id}: Life.spawn created ${created}/${count} genesis adults`);
  const people = life.world.entities.slice(before);
  if (people.some((person) => person.sp !== 'human' || person.age < 18 * 360 || person.village !== village.id)) {
    throw new Error(`Village ${village.id}: genesis inhabitants were not valid adult villagers`);
  }
  return people;
}

function addDaoCultivators(world, life) {
  const actors = {};
  const setDao = (actor, key, level) => {
    actor.dao = { path: DAO_BY_KEY[key], stage: 0, progress: 0 };
    actor.level = level;
    actor.maxHp = maxHpFor(actor);
    actor.hp = actor.maxHp;
    actor.lifespan = lifespanForEntity(actor, level);
  };
  for (let index = 0; index < DAO_PATHS.length; index += 1) {
    const path = DAO_PATHS[index];
    const x = 40 + (index % 6) * 4;
    const y = 51 + Math.floor(index / 6) * 12;
    const before = world.entities.length;
    const created = life.spawn(x, y, 'cultivator', 1, 0, { genesis: true });
    const actor = created === 1 ? world.entities[before] : null;
    if (!actor || actor.sp !== 'cultivator') throw new Error(`Life.spawn failed for ${path.key} cultivator`);
    setDao(actor, path.key, 5 + (index % 6));
    actor.mind = 60;
    actor.pollution = 0;
    actors[path.key] = actor;
  }

  const beforeExtra = world.entities.length;
  const extraCreated = life.spawn(62, 62, 'cultivator', 1, 0, { genesis: true });
  const secondSword = extraCreated === 1 ? world.entities[beforeExtra] : null;
  if (!secondSword) throw new Error('Life.spawn failed for the second sword cultivator');
  setDao(secondSword, 'sword', 8);
  // Controlled initial co-location exists only to expose the real derived Biyi pair
  // in the native-import scene. Normal simulation is free to move them apart.
  secondSword.x = actors.sword.x + 0.75;
  secondSword.y = actors.sword.y;
  secondSword.tx = secondSword.x;
  secondSword.ty = secondSword.y;
  addRelation(actors.sword, secondSword, RELATION_TYPES.LOVER, 80);
  if (readBiyiPairs(world).length !== 1) throw new Error('Controlled sword partners did not derive exactly one Biyi pair');

  const artifactOwner = actors.artifact;
  artifactOwner.level = Math.max(8, artifactOwner.level);
  const artifact = forgeArtifact(world, artifactOwner, mulberry32(world.seed ^ 0x41525449));
  if (!artifact) throw new Error('Formal forgeArtifact failed to create the fixture relic');
  const heldIndex = artifactOwner.artifacts.indexOf(artifact);
  if (heldIndex >= 0) artifactOwner.artifacts.splice(heldIndex, 1);
  toGround(world, artifact, artifactOwner.x, artifactOwner.y);

  return {
    ids: { ...Object.fromEntries(Object.entries(actors).map(([key, actor]) => [key, actor.id])), secondSword: secondSword.id },
    actualPositions: Object.fromEntries([...Object.entries(actors), ['secondSword', secondSword]]
      .map(([key, actor]) => [key, { id: actor.id, x: actor.x, y: actor.y, level: actor.level,
        dao: actor.dao.path.key }])),
    controlledPair: {
      arrangement: 'controlledfixture-initial-co-location',
      partners: [actors.sword.id, secondSword.id],
      distance: Math.hypot(actors.sword.x - secondSword.x, actors.sword.y - secondSword.y),
    },
  };
}

/** Add controlled legal Wanling placements through the normal placement API. */
export function populateWanlingFixture(world, { perForm = 1 } = {}) {
  const target = Math.max(0, Math.min(8, Math.floor(perForm)));
  const placed = [];
  for (const { key, derived } of WANLING_CATALOG) {
    if (derived || target === 0) continue;
    let made = 0;
    for (let y = 2; y < world.h - 2 && made < target; y += 1) {
      for (let x = 2; x < world.w - 2 && made < target; x += 1) {
        const result = requestWanling(world, key, x, y);
        if (result.ok) {
          placed.push({ form: key, id: result.unit.id, x, y });
          made += 1;
        } else if (/名额已满/.test(result.reason || '')) {
          break;
        }
      }
    }
  }
  return placed;
}

/** Create the deterministic, explicitly controlled W0.1 native-import scene. */
export function createWanlingScene({ w = 200, h = 128, seed = SEED, peoplePerVillage = 32 } = {}) {
  if (w < 200 || h < 128) throw new RangeError('W0.1 scene requires at least 200×128 so its fixed coordinates remain valid');
  if (!Number.isInteger(peoplePerVillage) || peoplePerVillage < 32 || peoplePerVillage > 120) {
    throw new RangeError('peoplePerVillage must be an integer from 32 to 120');
  }
  const world = new World(w, h, seed);
  setTerrain(world);
  const rng = mulberry32(seed ^ 0xa5a5a5a5);
  const life = new Life(world, rng);
  const villages = [life.foundVillage(45, 64, 0), life.foundVillage(150, 64, 0)];
  if (villages.some((village) => !village)) throw new Error('Could not found both scene villages');
  life.syncVillagePops();
  for (const village of villages) {
    addVillageHouses(world, village);
    village.food = 120;
    village.hp = 80;
    addVillagePeople(life, village, peoplePerVillage);
  }
  life.syncVillagePops();

  const mortals = world.entities.filter((entity) => entity.sp === 'human' && entity.village === villages[0].id);
  if (mortals.length) mortals[0].hp = 55;
  const daoActors = addDaoCultivators(world, life);
  const formation = spawnFormation(world, rng, { x: villages[0].x, y: villages[0].y, radius: 3 });
  if (!formation) throw new Error('Formal spawnFormation could not place the village formation site');
  const ruin = world.addSite({ kind: 'ruin', x: 58, y: 64, name: '旧阵遗迹', note: '受控场景遗迹', age: 0, visits: 0 });

  placeLeyline(world, 80, 25, rng);
  const wraiths = [
    spawnWraith(world, { id: 2000001, x: 73.5, y: 102.5, name: '河外孤魂', soulKind: 'ghost' }),
    spawnWraith(world, { id: 2000002, x: 77.5, y: 104.5, name: '游荡鬼修', soulKind: 'ghostCultivator', level: 3 }),
  ];
  if (wraiths.some((wraith) => !wraith)) throw new Error('Formal spawnWraith could not create the controlled haunt actors');

  const metadata = {
    fixture: 'controlledfixture',
    naturalSample: false,
    seed,
    size: { w, h },
    villages: villages.map((village) => ({ id: village.id, x: village.x, y: village.y, pop: village.pop,
      requestedAdults: peoplePerVillage, houses: village.houses.length, food: village.food, hp: village.hp })),
    actors: { dao: daoActors.ids, daoActualPositions: daoActors.actualPositions,
      biyiPair: daoActors.controlledPair, injuredMortalId: mortals[0]?.id || null,
      formationSiteId: formation.id, ruinSiteId: ruin.id, relicId: world.artifacts[0]?.id || null,
      wraithIds: wraiths.map((wraith) => wraith.id) },
    locations: {
      villages: villages.map(({ x, y }) => ({ x, y })),
      daoSpawn: { xMin: 40, xMax: 65, yMin: 50, yMax: 70 },
      formation: { x: formation.x, y: formation.y },
      ruin: { x: ruin.x, y: ruin.y },
      leyline: { x: 80, y: 25 },
      lake: { xMin: 85, xMax: 118, yMin: 40, yMax: 90, depth: 0.1 },
      legalWanlingSpawns: {
        land: { x: 70, y: 60 }, forest: { x: 30, y: 30 }, water: { x: 95, y: 60 },
        shore: { x: 84, y: 60 }, highland: { x: 145, y: 30 }, qi: { x: 80, y: 25 },
      },
    },
    terrain: {
      default: { height: 0.42, temp: 0.6, moist: 0.6, veg: 0.5 },
      forest: { xMin: 25, xMax: 60, yMin: 18, yMax: 44, veg: 0.9, moist: 0.75 },
      highland: { xMin: 135, xMax: 164, yMin: 18, yMax: 44, height: 0.67 },
      recomputedWith: 'recomputeAll',
    },
    formalApis: ['Life.spawn', 'Life.foundVillage', 'spawnFormation', 'World.addSite', 'placeLeyline',
      'forgeArtifact', 'toGround', 'spawnWraith', 'addRelation'],
  };
  return { world, life, metadata };
}

export function writeWanlingScene({ outputDir = DEFAULT_OUTPUT, ...options } = {}) {
  const { world, metadata } = createWanlingScene(options);
  const save = serializeWorld(world);
  const saveText = JSON.stringify(save);
  const restored = deserializeWorld(JSON.parse(saveText));
  if (restored.entities.length !== world.entities.length || restored.villages.length !== 2
    || restored.sites.length !== 2 || restored.wraiths.length !== 2 || restored.artifacts.length !== 1
    || readBiyiPairs(world).length !== 1 || readBiyiPairs(restored).length !== 1) {
    throw new Error('Production save deserialize round-trip did not preserve the controlled scene');
  }
  mkdirSync(outputDir, { recursive: true });
  const savePath = path.join(outputDir, 'scene.save.json');
  const metadataPath = path.join(outputDir, 'scene.metadata.json');
  writeFileSync(savePath, saveText, 'utf8');
  writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), 'utf8');
  return { savePath, metadataPath, metadata };
}

/** Small, explicit browser scene for real Buddha/soul path completion. */
export function createDaoHauntScene(options = {}) {
  const { world, life, metadata: base } = createWanlingScene(options);
  const actors = world.entities.filter(e => e.id === base.actors.dao.buddha || e.id === base.actors.dao.soul);
  const byPath = Object.fromEntries(actors.map(e => [e.dao.path.key, e]));
  const ghosts = world.wraiths;
  if (!byPath.buddha || !byPath.soul || ghosts.length !== 2) throw new Error('Real Buddha/soul actors or ghosts missing');
  // This is only fixture placement before serialization. The product advances
  // both real cultivators and spawned ghosts through the normal simulation.
  Object.assign(byPath.buddha, { x: 72.5, y: 103.5, tx: 72.5, ty: 103.5 });
  Object.assign(byPath.soul, { x: 96.5, y: 103.5, tx: 96.5, ty: 103.5 });
  Object.assign(ghosts[0], { x: 72.5, y: 104.5, tx: 72.5, ty: 104.5 });
  Object.assign(ghosts[1], { x: 96.5, y: 104.5, tx: 96.5, ty: 104.5 });
  const state = wanlingState(world);
  state.lastEcoDay = world.day;
  state.lastSpawnDay = world.day;
  state.lastPathDay = world.day - 30;
  stepDaoActivities(world, life);
  const jobs = state.jobs.filter(j => [byPath.buddha.id, byPath.soul.id].includes(j.actorId));
  if (jobs.length !== 2 || jobs.some(j => j.stage !== 'travel' || !ghosts.some(g => g.id === j.targetId))) {
    throw new Error('Could not assign both real ghost-targeting dao activities');
  }
  const metadata = {
    ...base,
    fixture: 'controlleddaohaunts',
    note: 'Only initial positions are controlled; advancement and actions use normal product code.',
    actors: { ...base.actors, focusedDao: { buddha: byPath.buddha.id, soul: byPath.soul.id },
      focusedJobs: jobs.map(j => ({ actorId: j.actorId, path: j.path, targetId: j.targetId })),
      wraithStart: ghosts.map(g => ({ id: g.id, hp: g.hp, soulKind: g.soulKind, x: g.x, y: g.y })) },
  };
  return { world, life, metadata };
}

export function writeDaoHauntScene({ outputDir = DEFAULT_OUTPUT, ...options } = {}) {
  const { world, metadata } = createDaoHauntScene(options);
  const saveText = JSON.stringify(serializeWorld(world));
  const restored = deserializeWorld(JSON.parse(saveText));
  if (restored.entities.length !== world.entities.length || restored.wraiths.length !== 2
    || restored.wanling?.jobs?.filter(j => ['buddha', 'soul'].includes(j.path) && j.stage === 'travel').length !== 2) {
    throw new Error('Production save round-trip lost a focused ghost-targeting dao job');
  }
  mkdirSync(outputDir, { recursive: true });
  const savePath = path.join(outputDir, 'dao-haunts.save.json');
  const metadataPath = path.join(outputDir, 'dao-haunts.metadata.json');
  writeFileSync(savePath, saveText, 'utf8');
  writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), 'utf8');
  return { savePath, metadataPath, metadata };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = writeWanlingScene();
  console.log(JSON.stringify({ savePath: result.savePath, metadataPath: result.metadataPath,
    fixture: result.metadata.fixture, villages: result.metadata.villages,
    daoActors: result.metadata.actors.dao, legalSpawnArea: result.metadata.locations.daoSpawn }, null, 2));
}
