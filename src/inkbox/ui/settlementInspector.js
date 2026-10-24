// A read-only card shared by Canvas terrain picks and exact Three identities.
import { settlementCondition } from '../world/settlementState.js';
import { villageSociety } from '../sim/sectEconomy.js';

const LEVELS = ['', '村落', '集镇', '城池', '王都'];
const STATUS = { normal: '正常', damaged: '受灾', disaster: '受灾', recovering: '恢复中', declining: '衰弱', ruin: '遗址', ruins: '遗址' };

/** 旧地重逢的判定半径：与「predecessors 同址隐藏」的既定口径一致（< 2 格）。 */
const SAME_SITE_RADIUS = 2;

function date(day) {
  if (!Number.isFinite(day) || day < 0) return '未知';
  return `第 ${Math.floor(day / 360) + 1} 年 · ${Math.floor((day % 360) / 30) + 1} 月`;
}

/**
 * 故城旧事（万象拾趣 V0.1 · P2）：遗址卡上的同宗故城。
 *
 * 一处遗址原属何宗已经写在卡上；这里再把**同一位旧主名下、离得最近的几处**
 * 其他废墟接成一条可走的链——玩家从一座故城能走到下一座，宗门兴衰留在
 * 地图上的痕迹于是能被一处处走读。纯只读派生（`world.settlementRuins`
 * 本来就有上限 `SETTLEMENT_RUINS_LIMIT`），不新增状态、不新增对象。
 */
function sameSectRuins(world, ruin) {
  if (!ruin.lastFactionId) return [];
  return (world.settlementRuins || [])
    .filter(other => other && other.id !== ruin.id && other.lastFactionId === ruin.lastFactionId)
    .sort((a, b) => Math.hypot(a.x - ruin.x, a.y - ruin.y) - Math.hypot(b.x - ruin.x, b.y - ruin.y))
    .slice(0, 3);
}

/** 旧址之上是否已立新村（同一地点身份重逢；只读现查，不落存档）。 */
function liveSuccessor(world, ruin) {
  return (world.villages || []).find(v => v && Math.hypot(v.x - ruin.x, v.y - ruin.y) < SAME_SITE_RADIUS) || null;
}

export function settlementInspectCard(world, village, isRuin = false) {
  const factionId = isRuin ? village.lastFactionId : village.faction;
  const faction = world.factions?.find(item => item.id === factionId);
  const factionName = faction?.name || (isRuin ? village.lastFactionName : null);
  const history = (village.history || []).filter(event => event && event.text);
  const rows = [];
  if (isRuin) {
    rows.push(['现状', '遗址'], ['原归属宗门', factionName || '无已知庇护'],
      ['荒废', date(village.destroyedDay)], ['主要原因', village.reason || '未留下确切记载']);
    if (village.lastAidDay >= 0) rows.push(['曾获援助', `${village.lastAidFactionName || '未知宗门'} · ${date(village.lastAidDay)}`]);
    // 故城旧事（P2）：旧址之上若已重建新村，如实指认——
    // 「这处遗址从何而来」之外，再给一句「它如今是什么」。
    const successor = liveSuccessor(world, village);
    if (successor) rows.push(['旧址之上', `${successor.name} 重建于此（${date(successor.foundedDay)} 立村）`]);
  } else {
    const condition = settlementCondition(world, village);
    const society = Array.isArray(world.entities) ? villageSociety(world, village) : null;
    rows.push(['现状', STATUS[condition.status] || condition.status || '未知'],
      ['人口', society ? `${society.humans} 人 · 凡人 ${society.mortals} / 修士 ${society.practitioners}` : '人口实体记录不可考'],
      ['成年劳力', society ? `${society.mortalAdults} 名成年凡人（满十八岁）` : '不可考'],
      ['存粮', Number.isFinite(village.food) ? String(Math.round(village.food)) : '未知'],
      ['粮食余缺', !society ? '不可考' : society.surplusFood > 0 ? `保村后富余 ${society.surplusFood.toFixed(1)}`
        : society.reserveFood > (village.food || 0) ? `距保村储备尚缺 ${(society.reserveFood - (village.food || 0)).toFixed(1)}`
          : '达到保村储备，暂无富余'],
      ['屋舍', `可用 ${condition.liveHouses} · 损毁 ${condition.ruinedHouses}`],
      ['主要瓶颈', condition.reasons?.[0] || (village.hp < 100 ? '已具备自然恢复条件，仍需时间' : '未见恢复阻碍')],
      ['最近转折', history.length ? `${date(history.at(-1).day)} · ${history.at(-1).text}` : '暂无留存的转折记录'],
      ['归属宗门', factionName || '无'],
      ['完整度', Number.isFinite(village.hp) ? `${Math.round(village.hp)} / 100` : '未知']);
    if (condition.reasons?.length > 1) rows.push(['其他处境', condition.reasons.slice(1).join('；')]);
    if (condition.lastAidDay >= 0) {
      rows.push(['最近援助', `${village.lastAidFactionName || '未知宗门'} · ${date(condition.lastAidDay)}`],
        ['援助累计', `粮草 ${Math.round(condition.aidSpentProvisions || 0)} · 灵石 ${Math.round(condition.aidSpentSpiritStone || 0)}`]);
    } else rows.push(['真实援助', '尚无援助记录，原因未查明']);
  }
  rows.push(['建设等级', LEVELS[village.level] || '未知'], ['成立', date(village.foundedDay)]);
  rows.push(['@section', '地方沿革']);
  if (!history.length) rows.push(['@history', '尚无留存的地方沿革']);
  for (const event of history.slice(-5)) rows.push(['@history', `${date(event.day)}　${event.text}`]);
  // Rebuilding on an old site creates a new village identity. The old place is
  // still reachable even though its overlapping map marker is hidden.
  // 活村接「同址旧址」；遗址接「同宗故城」（万象拾趣 P2）——
  // 从一座废墟走到下一位旧主名下的废墟，故城旧事才是一条走得动的链。
  const predecessors = isRuin
    ? sameSectRuins(world, village)
    : (world.settlementRuins || []).filter(ruin => ruin.id !== village.id
      && Math.hypot(ruin.x - village.x, ruin.y - village.y) < SAME_SITE_RADIUS).slice(-3);
  return { head: `${village.name || '无名聚落'}${isRuin ? '遗址' : ''}`, rows,
    factionId: faction?.id ?? null, settlementId: village.id,
    predecessors: predecessors.map(ruin => ({ id: ruin.id, name: ruin.name })) };
}
