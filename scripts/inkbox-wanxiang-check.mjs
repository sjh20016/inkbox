#!/usr/bin/env node
// 万象拾趣 V0.1 · 定向检查（P1 遗物传闻 / P2 故城旧事 / P3 旧约候选）
//
// 只用真实 World、真实模拟 API 与真实存档代码。夹具只负责摆出特定前置状态
// （委托书 §6 允许），不以夹具故事冒充自然生成——自然触发单独有一条
// 「普通世界自然出现」检查，若样本期内没有触发则如实报告。
//
// 运行：node scripts/inkbox-wanxiang-check.mjs（或 npm run test:wanxiang）

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { World } from '../src/inkbox/world/World.js';
import { WORLD_PRESETS } from '../src/inkbox/core/config.js';
import { mulberry32 } from '../src/inkbox/core/noise.js';
import { generateWorld } from '../src/inkbox/world/worldgen.js';
import { Life } from '../src/inkbox/sim/life.js';
import { advanceWorld, createAdvanceState } from '../src/inkbox/sim/advance.js';
import { forgeArtifact, toGround, giveTo, claimGroundArtifact, ownerLine, liveArtifactCount, describeArtifact, GROUND_DECAY_YEARS } from '../src/inkbox/sim/artifacts.js';
import { artifactClueLine, artifactClueRows, lostEntries, LOST_KIND } from '../src/inkbox/sim/relicRumors.js';
import { settlementInspectCard } from '../src/inkbox/ui/settlementInspector.js';
import { serializeWorld, deserializeWorld } from '../src/inkbox/io/save.js';
import { offerPact, settlePact, duePacts, OLD_PACT_CAP, OLD_PACT_TYPES, OLD_PACT_TERM_DAYS } from '../src/inkbox/sim/oldPacts.js';
import { addRelation } from '../src/inkbox/sim/relations.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let failed = 0;
function check(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (err) {
    failed += 1;
    console.log(`FAIL ${name}\n     ${err.message}`);
  }
}

function actor(world, id, name, opts = {}) {
  const e = {
    id, name, x: opts.x ?? 20, y: opts.y ?? 20, sp: 'human',
    hp: opts.hp ?? 60, maxHp: 100, level: opts.level ?? 8,
    exp: 0, fortune: 60, mind: 60, heartDemon: 0,
    techniques: [], log: [], karma: 0, pollution: 0,
    artifacts: [], age: 20 * 360, lifespan: 120 * 360,
  };
  return e;
}

function worldOf() {
  const world = new World(48, 48, 20261024);
  world.type.fill(5);
  world.height.fill(0.5);
  world.veg.fill(0.3);
  world.qi.fill(0.8);
  world.mapProgress = { stage: 3 };
  return world;
}

// ── P1 遗物传闻 ─────────────────────────────────────────────

check('P1 遗落写进法宝履历：kind、日期正确，且不影响历代主人链', () => {
  const world = worldOf();
  const smith = actor(world, 1, '陆青玄');
  const taker = actor(world, 2, '沈云', { x: 21, y: 21 });
  world.entities.push(smith, taker);
  const rng = mulberry32(7);
  const a = forgeArtifact(world, smith, rng);
  assert.ok(a, '夹具修士应能炼出法宝');
  assert.equal(ownerLine(a).count, 1);
  world.day = 900;
  toGround(world, a, smith.x, smith.y);
  const lost = lostEntries(a);
  assert.equal(lost.length, 1);
  assert.equal(lost[0][1], LOST_KIND);
  assert.equal(lost[0][0], 900);
  // 遗落不是易主：ownerLine 的主人数不变
  assert.equal(ownerLine(a).count, 1);
  assert.equal(a.lostDay, 900);
  assert.equal(a.ownerId, 0);
});

check('P1 地上线索：遗落之年、躺了多久、临近朽坏如实提示', () => {
  const world = worldOf();
  const a = { id: 1, name: '星坠剑胎', slot: '武器', tier: 2, quality: 2,
    durability: 100, maxDurability: 100, scars: 0, forgedDay: 0,
    ownerId: 0, ownerName: null, heldSince: 0, spirit: null,
    history: [[0, 'forged', '陆青玄'], [300, 'gained', '沈云'], [720, 'lost', null]],
    lostDay: 720, x: 20.5, y: 20.5 };
  world.day = 720 + 3 * 360;
  const line = artifactClueLine(world, a);
  assert.ok(line.includes('第3年遗落于'), `线索应带遗落年份：${line}`);
  assert.ok(line.includes('已躺 3 年'), `线索应带躺了多久：${line}`);
  assert.ok(!line.includes('恐将朽坏'), '躺得不久不应提示朽坏');
  // 临近朽坏地平线（GROUND_DECAY_YEARS 的七成）
  a.lostDay = 720;
  world.day = 720 + Math.floor(GROUND_DECAY_YEARS * 360 * 0.8);
  const old = artifactClueLine(world, a);
  assert.ok(old.includes('恐将朽坏'), `临近朽坏应提示：${old}`);
  const rows = artifactClueRows(world, a);
  const labels = rows.map(r => r[0]);
  for (const need of ['来历', '遗落', '现状']) assert.ok(labels.includes(need), `3D 卡应有「${need}」行：${labels}`);
});

check('P1 在手旧闻：曾失落的法宝带年份线索，且不虚构失落地点', () => {
  const world = worldOf();
  const smith = actor(world, 1, '陆青玄', { x: 5, y: 5 });
  const taker = actor(world, 2, '沈云', { x: 30, y: 30 });
  world.entities.push(smith, taker);
  const a = { id: 2, name: '太虚镜残片', slot: '法宝', tier: 2, quality: 2,
    durability: 100, maxDurability: 100, scars: 0, forgedDay: 0,
    ownerId: 1, ownerName: '陆青玄', heldSince: 0, spirit: null,
    history: [[0, 'forged', '陆青玄'], [600, 'lost', null], [720, 'found', '沈云']],
    lostDay: -1, x: 30, y: 30 };
  smith.artifacts = [];
  taker.artifacts = [a];
  world.day = 1000;
  const line = artifactClueLine(world, a);
  assert.ok(line.includes('据第2年所记'), `旧闻应带时间戳（第600日=第2年）：${line}`);
  assert.ok(line.includes('曾一度失落人间'), `旧闻应说明失落：${line}`);
  // 失落地点履历里没有——不得拿持宝人现坐标冒充当年的失落处
  assert.ok(!line.includes('遗落于'), `不得虚构失落地点：${line}`);
});

check('P1 拾取闭环：toGround → giveTo 后履历依次为 lost、found，旧闻线索成立', () => {
  const world = worldOf();
  const smith = actor(world, 1, '陆青玄');
  const taker = actor(world, 2, '沈云', { x: 21, y: 21 });
  world.entities.push(smith, taker);
  const a = forgeArtifact(world, smith, mulberry32(11));
  world.day = 400;
  toGround(world, a, 20.5, 20.5);
  world.day = 800;
  assert.ok(giveTo(world, taker, a, mulberry32(13), 'found'));
  const kinds = a.history.map(h => h[1]);
  assert.ok(kinds.includes('lost') && kinds.includes('found'), `履历应含 lost 与 found：${kinds}`);
  assert.equal(lostEntries(a).length, 1);
  const heldClue = artifactClueLine(world, a);
  assert.ok(heldClue.includes('据第') && heldClue.includes('曾一度失落'), `在手法宝应报旧闻而非地上线索：${heldClue}`);
  assert.ok(!heldClue.includes('遗落于'), `不得拿持宝人坐标冒充失落处：${heldClue}`);
});

check('P1 展示零成本：派生不写世界、不占法宝、不动随机流（同种子双世界逐字节一致）', () => {
  const build = () => {
    const world = generateWorld({ preset: WORLD_PRESETS.small, seed: 42, scatter: false });
    const life = new Life(world, mulberry32(world.seed ^ 0x11));
    return { world, life, state: createAdvanceState() };
  };
  const left = build();
  const right = build();
  for (let i = 0; i < 20; i += 1) {
    advanceWorld(left.world, 30, { life: left.life, state: left.state, riftActive: false, nether: false });
    advanceWorld(right.world, 30, { life: right.life, state: right.state, riftActive: false, nether: false });
    // 左边在每个 tick 上把全部线索函数跑一遍——纯读，不该留下任何痕迹
    for (const e of left.world.entities) {
      for (const a of e.artifacts || []) { artifactClueLine(left.world, a); artifactClueRows(left.world, a); }
    }
    for (const a of left.world.artifacts || []) { artifactClueLine(left.world, a); artifactClueRows(left.world, a); }
  }
  assert.equal(JSON.stringify(left.world.chronicle), JSON.stringify(right.world.chronicle));
  assert.equal(left.world.day, right.world.day);
  assert.equal(liveArtifactCount(left.world), liveArtifactCount(right.world));
  assert.equal(JSON.stringify(left.world.artifactLog), JSON.stringify(right.world.artifactLog));
  assert.equal(left.world.nextArtifactId, right.world.nextArtifactId);
});

check('P1 存读档：履历（含 lost）与线索逐字一致，物件身份不变', () => {
  const world = worldOf();
  const smith = actor(world, 1, '陆青玄');
  world.entities.push(smith);
  const a = forgeArtifact(world, smith, mulberry32(17));
  world.day = 500;
  toGround(world, a, 20.5, 20.5);
  const before = { line: artifactClueLine(world, a), hist: JSON.stringify(a.history), id: a.id };
  const restored = deserializeWorld(JSON.parse(JSON.stringify(serializeWorld(world))));
  const ground = restored.artifacts.find(x => x.id === a.id);
  assert.ok(ground, '读档后地上法宝应还在');
  const after = { line: artifactClueLine(restored, ground), hist: JSON.stringify(ground.history), id: ground.id };
  assert.equal(before.id, after.id);
  assert.equal(before.hist, after.hist);
  assert.equal(before.line, after.line);
});

check('P1 同名陷阱：履历只有名字可用，线索模块不读关系网、不造人物关联', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src/inkbox/sim/relicRumors.js'), 'utf8');
  assert.ok(!src.includes('relations'), '遗物线索模块不得读关系网（同名匹配会造假关系）');
  assert.ok(!src.includes('record('), '遗物线索模块不得写编年史');
  const world = worldOf();
  const one = actor(world, 1, '陆青玄');
  const two = actor(world, 2, '陆青玄', { x: 30, y: 30 });
  world.entities.push(one, two);
  const a = { id: 9, name: '星坠剑胎', slot: '武器', tier: 2, quality: 2,
    durability: 100, maxDurability: 100, scars: 0, forgedDay: 0,
    ownerId: 0, ownerName: null, heldSince: 0, spirit: null,
    history: [[0, 'forged', '陆青玄'], [100, 'gained', '沈云'], [200, 'gained', '陆青玄'], [300, 'lost', null]],
    lostDay: 300, x: 20, y: 20 };
  world.day = 400;
  // 两个同名人的名字都只是展示字：履历按条目如实记（同名先后两主不相并、不相连），
  // 线索模块自己更不会拿名字去反查活人。
  const line = artifactClueLine(world, a);
  assert.ok(line.includes('遗落'));
  assert.equal(ownerLine(a).count, 3, '履历三条按条目如实计数');
  assert.equal((ownerLine(a).text.match(/陆青玄/g) || []).length, 2, '同名先后两主各占一位，不相并也不误连');
});

check('P1 普通世界自然出现：无人干预推进后，世上确有带遗落履历的法宝', () => {
  const world = generateWorld({ preset: WORLD_PRESETS.small, seed: 90125, scatter: true });
  const life = new Life(world, mulberry32(world.seed ^ 0x99));
  const state = createAdvanceState();
  const years = 120;
  for (let i = 0; i < years * 12; i += 1) {
    advanceWorld(world, 30, { life, state, riftActive: false, nether: false });
  }
  let withLost = 0;
  let withChain = 0;
  const examine = (a) => {
    if (!a || !Array.isArray(a.history)) return;
    if (a.history.some(h => h[1] === 'lost')) withLost += 1;
    if (ownerLine(a).count >= 2) withChain += 1;
  };
  for (const e of world.entities) for (const a of e.artifacts || []) examine(a);
  for (const a of world.artifacts || []) examine(a);
  console.log(`     自然样本（seed 90125 · ${years} 年）：带「遗落」履历 ${withLost} 件 · 换过主人 ${withChain} 件 · 在世法宝 ${liveArtifactCount(world)} 件`);
  assert.ok(withLost > 0, `${years} 年内应有法宝自然遗落（实测 ${withLost} 件）——若为 0 说明 lost 事实没有真实发生`);
});

// ── P2 故城旧事 ─────────────────────────────────────────────

function villageOf(world, id, name, x, y, factionId, factionName) {
  const v = {
    id, name, x, y, faction: factionId, pop: 12, food: 100, houses: [
      { x, y, type: 1 }, { x: x + 1, y, type: 1 },
    ],
    fields: 0, level: 1, hp: 100, foundedDay: 360, history: [], fieldTiles: [],
    lastAidMonth: 0, lastAidDay: -1, aidSpentProvisions: 6, aidSpentSpiritStone: 2,
    lastFactionId: factionId, lastFactionName: factionName,
  };
  world.villages.push(v);
  return v;
}

check('P2 遗址卡：从何而来、曾属何宗、荒废缘由如实成行', () => {
  const world = worldOf();
  world.factions.push({ id: 3, name: '青虚剑宗', pop: 40, villages: [1], color: '#369', capitalX: 10, capitalY: 10, war: new Map(), destroyedDay: -1, stability: 60 });
  const v = villageOf(world, 1, '青溪村', 10, 10, 3, '青虚剑宗');
  v.history.push({ day: 360, type: 'founded', text: '青溪村立村', settlementId: 1, factionId: 3, factionName: '青虚剑宗' });
  v.history.push({ day: 1800, type: 'aid', text: '青虚剑宗调拨物资援助', settlementId: 1, factionId: 3, factionName: '青虚剑宗' });
  v.lastAidDay = 1800;
  v.lastAidFactionName = '青虚剑宗';
  world.day = 4000;
  v.destroyedDay = 3900;
  v.reason = '长期衰败';
  world.settlementRuins.push(v);
  world.villages = [];
  const card = settlementInspectCard(world, v, true);
  const rowMap = new Map(card.rows.filter(r => r[0] !== '@history' && r[0] !== '@section').map(r => [r[0], r[1]]));
  assert.equal(rowMap.get('现状'), '遗址');
  assert.equal(rowMap.get('原归属宗门'), '青虚剑宗');
  assert.ok(rowMap.get('荒废').startsWith('第 '), '荒废行应带日期');
  assert.ok(rowMap.get('曾获援助').includes('青虚剑宗'), '受援史应可见');
});

check('P2 同宗故城链：同宗废墟互相可达，异宗不混入，无旧主则链为空', () => {
  const world = worldOf();
  const mk = (id, name, x, y, fid, fname) => {
    const r = villageOf(world, id, name, x, y, fid, fname);
    r.destroyedDay = 2000 + id;
    r.reason = '长期衰败';
    world.settlementRuins.push(r);
    return r;
  };
  world.villages = [];
  const q1 = mk(1, '青溪村', 10, 10, 3, '青虚剑宗');
  const q0 = mk(6, '青井村', 11, 10, 3, '青虚剑宗');
  const q2 = mk(2, '青崖村', 14, 12, 3, '青虚剑宗');
  const q3 = mk(3, '青石村', 12, 11, 3, '青虚剑宗');
  const q4 = mk(7, '青云集', 30, 30, 3, '青虚剑宗');
  const other = mk(4, '赤火村', 11, 11, 7, '赤炎门');
  const orphan = mk(5, '无名村', 20, 20, 0, null);
  const linkOf = (r) => settlementInspectCard(world, r, true).predecessors.map(p => p.id);
  assert.ok(linkOf(q1).includes(2), '最近的同宗废墟应在链上');
  assert.equal(linkOf(q1).includes(4), false, '异宗废墟不得混入');
  assert.equal(linkOf(q1).includes(7), false, '只取最近三处，更远的同宗从下一站继续走');
  assert.equal(linkOf(q1).length, 3, '链长以三为限');
  assert.deepEqual(linkOf(orphan), [], '无旧主的遗址没有故城链，也不该编一条');
  assert.ok(linkOf(q2).includes(1), '链是双向可走的');
});

check('P2 旧址之上：重建的新村如实指认；未重建则不编', () => {
  const world = worldOf();
  const ruin = villageOf(world, 1, '青溪村', 10, 10, 3, '青虚剑宗');
  ruin.destroyedDay = 2400; ruin.reason = '洪水';
  world.settlementRuins.push(ruin);
  world.villages = [];
  assert.equal(settlementInspectCard(world, ruin, true).rows.some(r => r[0] === '旧址之上'), false, '没有新村就不该有这一行');
  const rebuilt = villageOf(world, 9, '新青溪', 10.5, 10.5, 3, '青虚剑宗');
  rebuilt.foundedDay = 3000;
  world.villages = [rebuilt];
  const row = settlementInspectCard(world, ruin, true).rows.find(r => r[0] === '旧址之上');
  assert.ok(row, '旧址重建后应有一行指认');
  assert.ok(row[1].includes('新青溪'), `应点名新村：${row[1]}`);
  assert.ok(row[1].includes('立村'), `应带立村时间：${row[1]}`);
});

check('P2 活村旧径回归：同址旧址仍可从新村卡走到（不回归原行为）', () => {
  const world = worldOf();
  const ruin = villageOf(world, 1, '青溪村', 10, 10, 3, '青虚剑宗');
  ruin.destroyedDay = 2400; ruin.reason = '洪水';
  world.settlementRuins.push(ruin);
  world.villages = [];
  const live = villageOf(world, 9, '新青溪', 10, 10, 3, '青虚剑宗');
  const preds = settlementInspectCard(world, live, false).predecessors.map(p => p.id);
  assert.ok(preds.includes(1), '活村卡的旧址按钮必须保留');
});

// ── P3 人物旧约（候选，未接线）───────────────────────────────

function pactPair(world, type = 'lover') {
  const a = actor(world, 1, '沈云', { x: 20, y: 20 });
  const b = actor(world, 2, '顾白', { x: 21, y: 20 });
  world.entities.push(a, b);
  addRelation(a, b, type, 60);
  return { a, b };
}

check('P3 候选·立约守卫：只认真实双向关系，拒绝同体、亡者与陌生类型', () => {
  const world = worldOf();
  const { a, b } = pactPair(world);
  const ok = offerPact(world, a, b, 'lover');
  assert.ok(ok, '真实道侣应能立约');
  assert.equal(ok.aId, 1); assert.equal(ok.bId, 2);
  assert.equal(ok.dueDay, Math.floor(world.day) + OLD_PACT_TERM_DAYS);
  assert.equal(offerPact(world, a, a, 'lover'), null, '不得与自己立约');
  assert.equal(offerPact(world, a, b, 'rival'), null, '陌生类型不得立约');
  const stranger = actor(world, 3, '路人');
  world.entities.push(stranger);
  assert.equal(offerPact(world, a, stranger, 'lover'), null, '没有真实关系不得立约');
  b.hp = 0;
  assert.equal(offerPact(world, a, b, 'lover'), null, '亡者不得立约');
});

check('P3 候选·兑现：双方健在、关系如旧则兑现；重复推进幂等', () => {
  const world = worldOf();
  const { a, b } = pactPair(world);
  const pact = offerPact(world, a, b, 'lover');
  world.day = pact.dueDay + 1;
  const first = settlePact(world, pact);
  assert.equal(first.status, 'kept');
  assert.ok(first.text.includes('沈云') && first.text.includes('顾白'), `文本应点名双方：${first.text}`);
  assert.equal(pact.settledDay, Math.floor(world.day));
  const again = settlePact(world, pact);
  assert.equal(again.status, 'noop', '重复结算必须是无操作');
  assert.equal(pact.settledDay, Math.floor(world.day), '盖章不得移动');
  assert.deepEqual(duePacts([pact], world), [], '已结之约不再进入到期队列');
});

check('P3 候选·落空与缘尽：一方亡故如实落空；情分散尽如实作罢', () => {
  const world = worldOf();
  const dead = worldOf();
  const p1 = pactPair(dead);
  const pact1 = offerPact(dead, p1.a, p1.b, 'lover');
  dead.day = pact1.dueDay + 5;
  dead.entities = dead.entities.filter(e => e.id !== p1.b.id);   // 死者已被移出世界
  const r1 = settlePact(dead, pact1);
  assert.equal(r1.status, 'void');
  assert.ok(r1.text.includes('已不在人世'), `落空文本：${r1.text}`);

  const w2 = worldOf();
  const p2 = pactPair(w2);
  const pact2 = offerPact(w2, p2.a, p2.b, 'lover');
  w2.entities[0].relations.delete(2);
  w2.entities[1].relations.delete(1);
  w2.day = pact2.dueDay + 5;
  const r2 = settlePact(w2, pact2);
  assert.equal(r2.status, 'estranged');
  assert.ok(r2.text.includes('作罢'), `缘尽文本：${r2.text}`);
  // 不伪装行为：文本不得宣称没有模拟支撑的「当场」情节
  for (const text of [r1.text, r2.text]) {
    assert.ok(!text.includes('当场'), '不得虚构当场情节');
    assert.ok(!text.includes('赶往'), '不得虚构旅行情节');
  }
});

check('P3 候选·未接线：游戏路径没有 import，存档里没有 pacts 键', () => {
  const srcDir = path.join(ROOT, 'src/inkbox');
  const offenders = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.js')) {
        const text = fs.readFileSync(full, 'utf8');
        if (text.includes('oldPacts')) offenders.push(path.relative(ROOT, full));
      }
    }
  };
  walk(srcDir);
  assert.deepEqual(offenders.filter(f => !f.endsWith('oldPacts.js')), [],
    '只有候选模块自身可提及 oldPacts；游戏路径（main/sim/ui/io/world）一律不得 import');
  const saveSrc = fs.readFileSync(path.join(ROOT, 'src/inkbox/io/save.js'), 'utf8');
  assert.ok(!saveSrc.includes('pacts'), 'P3 未接线：save.js 不应有 pacts 键');
  assert.equal(Object.keys(OLD_PACT_TYPES).length, 2);
  assert.ok(OLD_PACT_CAP >= 1);
});

// ── 汇总 ─────────────────────────────────────────────────────

if (failed > 0) {
  console.log(`\n万象拾趣 V0.1 检查：${failed} 项未通过`);
  process.exit(1);
}
console.log('\n万象拾趣 V0.1 检查：全部通过（P1 遗物传闻 / P2 故城旧事 / P3 旧约候选）');
