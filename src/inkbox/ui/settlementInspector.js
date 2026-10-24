// A read-only card shared by Canvas terrain picks and exact Three identities.
import { settlementCondition } from '../world/settlementState.js';

const LEVELS = ['', '村落', '集镇', '城池', '王都'];
const STATUS = { normal: '正常', damaged: '受灾', disaster: '受灾', recovering: '恢复中', declining: '衰弱', ruin: '遗址', ruins: '遗址' };

function date(day) {
  if (!Number.isFinite(day) || day < 0) return '未知';
  return `第 ${Math.floor(day / 360) + 1} 年 · ${Math.floor((day % 360) / 30) + 1} 月`;
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
  } else {
    const condition = settlementCondition(world, village);
    rows.push(['现状', STATUS[condition.status] || condition.status || '未知'],
      ['人口', Number.isFinite(village.pop) ? String(village.pop) : '未知'],
      ['存粮', Number.isFinite(village.food) ? String(Math.round(village.food)) : '未知'],
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
  const predecessors = isRuin ? [] : (world.settlementRuins || []).filter(ruin => ruin.id !== village.id
    && Math.hypot(ruin.x - village.x, ruin.y - village.y) < 2).slice(-3);
  return { head: `${village.name || '无名聚落'}${isRuin ? '遗址' : ''}`, rows,
    factionId: faction?.id ?? null, settlementId: village.id,
    predecessors: predecessors.map(ruin => ({ id: ruin.id, name: ruin.name })) };
}
