// Inkbox 人物局部关系图（D7-F）· 纯几何 + 纯 SVG 字符串
//
// 只做「**当前选中人物的一跳关系**」——不做全世界社会网络（那会变成蜘蛛网）。
// 中心是本人，周围最多 `RELATION_GRAPH_MAX` 个有直接关系的人。
//
// ⚠️ 本模块**零 import、零副作用、零 RNG**：它只吃「已经解析好的邻居列表」，
//    吐一个几何对象 / 一段 SVG 字符串。世界怎么查、点谁跳到哪，全在 `main.js`。
//    这样它能在 node 里被断言（`scripts/inkbox-presentation.mjs`），也绝不反向依赖模拟。
//
// 视觉纪律（照 D7-F 规格）：**不用巨大彩虹色**，主要靠**线型 / 线粗 / 少量色差 / 标签**
//   师徒 = 实线 · 道侣 = 双线 · 宿敌 = 断裂线（虚线）· 仇怨 = 锯齿 · 已死亡关系 = 淡线。

/** 关系类型 → 画法。`dash` 为 null 表示实线；`zigzag` 走折线；`double` 画两条平行线。 */
export const RELATION_STYLE = Object.freeze({
  lover: { color: '#7a4f8f', width: 1.6, dash: null, double: true, label: '道侣' },
  mentor: { color: '#2f4f4f', width: 2, dash: null, label: '师徒' },
  disciple: { color: '#2f4f4f', width: 2, dash: null, label: '师徒' },
  former_mentor: { color: '#8a8a8a', width: 1.2, dash: '3 3', label: '旧师' },
  former_disciple: { color: '#8a8a8a', width: 1.2, dash: '3 3', label: '旧徒' },
  rival: { color: '#4a4a4a', width: 1.6, dash: '6 4', label: '宿敌' },
  enmity: { color: '#b23a2e', width: 1.8, zigzag: true, label: '仇怨' },
  kin: { color: '#5a3a2a', width: 2.4, dash: null, label: '亲缘' },
  comrade: { color: '#6a6a6a', width: 1.1, dash: null, label: '同袍' },
  peer: { color: '#6a6a6a', width: 1.1, dash: '2 4', label: '同道' },
  benefactor: { color: '#3a6a5a', width: 1.2, dash: '4 3', label: '施恩' },
  gratitude: { color: '#3a6a5a', width: 1.2, dash: '4 3', label: '受恩' },
});

/** 外圈最多画几个。再多就按 score 绝对值 + 类型优先级裁剪（见 `pickNeighbors`）。 */
export const RELATION_GRAPH_MAX = 10;

/** 类型优先级（越小越优先保留）。与 D7-F 规格的排序一致。 */
export const RELATION_PRIORITY = Object.freeze([
  'lover', 'mentor', 'disciple', 'rival', 'enmity', 'kin',
  'comrade', 'peer', 'former_mentor', 'former_disciple', 'benefactor', 'gratitude',
]);

/**
 * 裁剪邻居：先按类型优先级、再按 `|score|` 降序，取前 `max` 个。
 * **纯函数**——不读世界、不改输入。
 * @param {Array<{id:number,type:string,score:number,name?:string,state?:string}>} neighbors
 */
export function pickNeighbors(neighbors, max = RELATION_GRAPH_MAX) {
  const rank = (t) => {
    const i = RELATION_PRIORITY.indexOf(t);
    return i < 0 ? RELATION_PRIORITY.length : i;
  };
  return (Array.isArray(neighbors) ? neighbors.slice() : [])
    .sort((a, b) => {
      const ra = rank(a.type);
      const rb = rank(b.type);
      if (ra !== rb) return ra - rb;
      return Math.abs(b.score || 0) - Math.abs(a.score || 0);
    })
    .slice(0, Math.max(0, max));
}

/**
 * 布局：中心 + 一圈邻居。
 * @returns {{size:number,cx:number,cy:number,r:number,
 *   nodes:Array<{id,name,type,score,state,x,y}>, edges:Array<{type,from,to}>}}
 */
export function buildRelationGraph(center, neighbors, opts = {}) {
  const size = Math.max(120, Number(opts.size) || 260);
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 34;
  const picked = pickNeighbors(neighbors, opts.max || RELATION_GRAPH_MAX);
  const n = picked.length;
  const nodes = picked.map((nb, i) => {
    // 从正上方起顺时针排布；单个邻居也放正上方（避免只画一个时角度抖动）。
    const angle = n === 0 ? 0 : (-Math.PI / 2) + (i * 2 * Math.PI) / n;
    return {
      id: nb.id,
      name: nb.name || '无名',
      type: nb.type,
      score: nb.score || 0,
      state: nb.state || 'live',
      x: cx + Math.cos(angle) * r,
      y: cy + Math.sin(angle) * r,
    };
  });
  const edges = nodes.map((node) => ({
    type: node.type,
    from: { x: cx, y: cy },
    to: { x: node.x, y: node.y },
  }));
  return { size, cx, cy, r, nodes, edges };
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** 一条锯齿折线（仇怨）的 path 数据。纯几何。 */
function zigzagPath(from, to, amp = 3, seg = 6) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  let d = `M ${from.x.toFixed(1)} ${from.y.toFixed(1)}`;
  for (let i = 1; i <= seg; i += 1) {
    const t = i / seg;
    const sign = (i % 2 === 0) ? 0 : 1;
    const off = sign * amp;
    const x = from.x + dx * t + nx * off;
    const y = from.y + dy * t + ny * off;
    d += ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
  }
  return d;
}

/** 一条边的 `<path>`（含双线 / 虚线 / 锯齿 / 淡线）。 */
function edgePath(edge, opts) {
  const st = RELATION_STYLE[edge.type] || { color: '#6a6a6a', width: 1.1, label: edge.type };
  const dim = opts.dim;                 // 已死亡关系 → 淡线
  const opacity = dim ? 0.28 : (opts.opacity ?? 0.9);
  const common = `stroke="${st.color}" stroke-width="${st.width}" `
    + `stroke-opacity="${opacity}" fill="none" stroke-linecap="round"`;
  const dash = st.dash ? ` stroke-dasharray="${st.dash}"` : '';

  if (st.zigzag) {
    return `<path d="${zigzagPath(edge.from, edge.to)}" ${common}/>`;
  }
  if (st.double) {
    // 道侣：两条平行细线（更柔）。
    const dx = edge.to.x - edge.from.x;
    const dy = edge.to.y - edge.from.y;
    const len = Math.hypot(dx, dy) || 1;
    const ox = (-dy / len) * 2.4;
    const oy = (dx / len) * 2.4;
    const a = `<path d="M ${(edge.from.x + ox).toFixed(1)} ${(edge.from.y + oy).toFixed(1)} L ${(edge.to.x + ox).toFixed(1)} ${(edge.to.y + oy).toFixed(1)}" ${common} stroke-width="${(st.width * 0.7).toFixed(2)}"/>`;
    const b = `<path d="M ${(edge.from.x - ox).toFixed(1)} ${(edge.from.y - oy).toFixed(1)} L ${(edge.to.x - ox).toFixed(1)} ${(edge.to.y - oy).toFixed(1)}" ${common} stroke-width="${(st.width * 0.7).toFixed(2)}"/>`;
    return a + b;
  }
  return `<path d="M ${edge.from.x.toFixed(1)} ${edge.from.y.toFixed(1)} L ${edge.to.x.toFixed(1)} ${edge.to.y.toFixed(1)}" ${common}${dash}/>`;
}

/**
 * 把关系图渲染成一段 **inline SVG 字符串**（直接塞进人物卡）。
 * `centerName` 是中心人物名；`opts.centerState` 可为 'dead' 之类（中心画淡）。
 * **纯函数**——同输入同输出，可断言。
 */
export function relationGraphSvg(center, neighbors, opts = {}) {
  const g = buildRelationGraph(center, neighbors, opts);
  const { size, cx, cy, nodes, edges } = g;
  const centerName = (center && center.name) || '此人';

  const edgeSvg = edges.map((e, i) => edgePath(e, {
    dim: nodes[i].state === 'dead' || nodes[i].state === 'unknown',
  })).join('');

  const nodeSvg = nodes.map((node) => {
    const st = RELATION_STYLE[node.type] || { label: node.type };
    const dim = node.state === 'dead' || node.state === 'unknown';
    const label = `${node.name}·${st.label}`;
    const anchor = node.x >= cx - 0.5 ? 'start' : 'end';
    const tx = node.x + (anchor === 'start' ? 9 : -9);
    return `<g class="rg-node" data-goto="${esc(node.id)}" data-state="${esc(node.state)}" style="cursor:pointer">`
      + `<circle cx="${node.x.toFixed(1)}" cy="${node.y.toFixed(1)}" r="6" `
      + `fill="${dim ? '#cfc7ba' : '#f3ede1'}" stroke="${st.color}" stroke-width="1.6"/>`
      + `<text x="${tx.toFixed(1)}" y="${(node.y + 3.5).toFixed(1)}" text-anchor="${anchor}" `
      + `font-size="10.5" fill="${dim ? '#9a9287' : '#3a352d'}">${esc(label)}</text>`
      + '</g>';
  }).join('');

  const empty = nodes.length === 0
    ? `<text x="${cx}" y="${cy + 30}" text-anchor="middle" font-size="11" fill="#9a9287">尚无已知的人际关系</text>`
    : '';

  return `<svg class="relation-graph" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" `
    + `role="img" aria-label="${esc(centerName)}的关系图">`
    + `<circle cx="${cx}" cy="${cy}" r="20" fill="#f3ede1" stroke="#3a352d" stroke-width="1.8"/>`
    + `<text x="${cx}" y="${cy + 3.5}" text-anchor="middle" font-size="11" fill="#3a352d">${esc(centerName)}</text>`
    + edgeSvg + nodeSvg + empty
    + '</svg>';
}
