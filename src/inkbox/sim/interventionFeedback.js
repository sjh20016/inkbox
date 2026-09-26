// 四种代表性干预共用的轻量结果协议。具体效果仍由既有工具执行，
// 这里只把执行结果整理成玩家看得懂、能写进编年的反馈。

export const CAUSAL_TOOL_IDS = Object.freeze(['raise', 'rain', 'crisis', 'root']);

export function measureChangedCells(world, before) {
  const out = { changedTiles: 0, heightDelta: 0, vegetationDelta: 0, fireReduced: 0 };
  if (!world || !(before instanceof Map)) return out;
  for (const [i, old] of before) {
    const height = world.height[i];
    const water = world.water[i];
    const overlay = world.over[i];
    const type = world.type[i];
    const structure = world.struct[i];
    const vegetation = world.veg[i];
    const fire = world.fire[i];
    if (height !== old.h || water !== old.w || overlay !== old.o || type !== old.t
      || structure !== old.s || vegetation !== old.v || fire !== old.f) {
      out.changedTiles += 1;
    }
    out.heightDelta += height - old.h;
    out.vegetationDelta += vegetation - old.v;
    out.fireReduced += Math.max(0, old.f - fire);
  }
  return out;
}

const signed = (value) => `${value >= 0 ? '+' : ''}${value.toFixed(2)}`;

export function createInterventionOutcome({
  toolId, action, x, y, rawResult = '', metrics = null, event = null,
} = {}) {
  const location = `坐标 (${Math.floor(x || 0) + 1}, ${Math.floor(y || 0) + 1})`;
  const outcome = {
    toolId,
    action: action || toolId || '干预',
    target: location,
    status: 'failed',
    immediateChange: '',
    worldEvent: '',
    lastingImpact: '',
    failureReason: '',
  };

  if (toolId === 'raise') {
    const changed = metrics?.changedTiles || 0;
    const height = metrics?.heightDelta || 0;
    if (changed && height > 0) {
      outcome.status = 'success';
      outcome.immediateChange = `地势抬高 ${signed(height)}，影响 ${changed} 格`;
      outcome.worldEvent = '地貌已重算并写入编年';
      outcome.lastingImpact = '新地势会持续影响坡度、水流与周边生态';
    } else {
      outcome.failureReason = '所选区域没有发生地势变化（可能已到高程上限）';
    }
  } else if (toolId === 'rain') {
    const changed = metrics?.changedTiles || 0;
    if (changed) {
      outcome.status = 'success';
      outcome.immediateChange = `润泽或灭火，影响 ${changed} 格`
        + (metrics.fireReduced > 0 ? `，火势减少 ${metrics.fireReduced.toFixed(1)}` : '')
        + (metrics.vegetationDelta > 0 ? `，植被增量 ${metrics.vegetationDelta.toFixed(1)}` : '');
      outcome.worldEvent = '地表变化已写入编年';
      outcome.lastingImpact = '植被与火势会继续参与后续生态演化';
    } else {
      outcome.failureReason = '这片区域没有需要灭火、润养或复绿的地块';
    }
  } else if (toolId === 'crisis') {
    if (event?.status === 'active') {
      const years = Math.max(1, Math.round((event.durationDays || 0) / 360));
      outcome.status = 'success';
      outcome.target = event.villageName ? `聚落「${event.villageName}」` : location;
      outcome.immediateChange = `已创建持续事件 #${event.id}「${event.name}」`;
      outcome.worldEvent = '灾祸已记入大事记';
      outcome.lastingImpact = `预计持续 ${years} 年，期间会损耗聚落元气与粮食，结束时记录成败`;
    } else if (event?.status === 'cancelled') {
      outcome.status = 'cancelled';
      outcome.failureReason = event.outcome || '附近没有聚落，灾祸未进入活动状态';
      outcome.worldEvent = `取消结果已记入事件历史 #${event.id}`;
    } else {
      outcome.failureReason = rawResult || '事件没有创建；可能已有两场灾祸正在进行';
    }
  } else if (toolId === 'root') {
    const match = /^点化\s+(\d+)\s*人/.exec(String(rawResult));
    if (match && Number(match[1]) > 0) {
      outcome.status = 'success';
      outcome.target = `附近凡人 · ${location}`;
      outcome.immediateChange = `点化 ${match[1]} 人，灵根已开`;
      outcome.worldEvent = '觉醒已记入人物经历与编年';
      outcome.lastingImpact = '新修士会继续修行，并可能立宗或飞升';
    } else {
      outcome.failureReason = rawResult || '范围内没有可点化的凡人';
    }
  } else {
    outcome.failureReason = rawResult || '没有产生可观察的变化';
  }

  outcome.message = outcome.status === 'success'
    ? `${outcome.action}成功 · ${outcome.target} · ${outcome.immediateChange}；${outcome.worldEvent}；后续：${outcome.lastingImpact}。`
    : `${outcome.action}未执行 · ${outcome.target} · 原因：${outcome.failureReason}`
      + (outcome.worldEvent ? `；${outcome.worldEvent}` : '') + '。';
  return outcome;
}
