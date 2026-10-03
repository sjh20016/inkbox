// 世界格坐标 Region → 渲染用的区域表（M2-B D2：谓词只在这里算一次）。
//
// 输入是 `ui/RegionMask`（世界格坐标、冻结）；输出是一次性算好的整数表：
//   inside[qy*qw+qx]   1 = 该 quad 在窗内（谓词与 TerrainMesh / EntityLayer 完全相同：pointInRegion(x+.5, y+.5)）
//   edges              边界边（节点到节点），每条 [x0,y0,x1,y1]；恒为网格边 ⇒ 墙顶点就是网格节点
//   rimNodes           边界上的唯一节点（界缘墙的两端、肩部的起点）
//   dist / near        节点到最近边界节点的格距（≤ K，其余 255）及该边界节点的索引
//   bandNodes          0 < dist < K 的窗内节点（肩部要改写 Y 的节点）
//   bbox               受影响节点的闭区间包围盒（含 K 外扩），供 markTerrainDirty
//
// ⚠️ 纯函数、不读 world、不写任何东西。同一 Region 身份 + 同一尺寸 + 同一 K ⇒ 同一张表（WeakMap 缓存）。

const cache = new WeakMap();

export function getRegionMask3D(region, w, h, shoulder = 5) {
  if (!region) return null;
  let bySize = cache.get(region);
  if (!bySize) { bySize = new Map(); cache.set(region, bySize); }
  const key = `${w}x${h}:${shoulder}`;
  let mask = bySize.get(key);
  if (!mask) { mask = buildRegionMask3D(region, w, h, shoulder); bySize.set(key, mask); }
  return mask;
}

export function buildRegionMask3D(region, w, h, K = 5) {
  const qw = w - 1, qh = h - 1;
  const inside = new Uint8Array(qw * qh);
  let insideCount = 0;
  for (let y = 0; y < qh; y++) {
    for (let x = 0; x < qw; x++) {
      if (region.contains(x + 0.5, y + 0.5)) { inside[y * qw + x] = 1; insideCount++; }
    }
  }
  const inQ = (x, y) => x >= 0 && y >= 0 && x < qw && y < qh && inside[y * qw + x] === 1;

  const edgeList = [];
  const rimSet = new Set();
  const nodeIndex = (x, y) => y * w + x;
  const push = (x0, y0, x1, y1) => {
    edgeList.push(x0, y0, x1, y1);
    rimSet.add(nodeIndex(x0, y0)); rimSet.add(nodeIndex(x1, y1));
  };
  for (let y = 0; y < qh; y++) {
    for (let x = 0; x < qw; x++) {
      if (!inside[y * qw + x]) continue;
      if (!inQ(x, y - 1)) push(x, y, x + 1, y);
      if (!inQ(x, y + 1)) push(x, y + 1, x + 1, y + 1);
      if (!inQ(x - 1, y)) push(x, y, x, y + 1);
      if (!inQ(x + 1, y)) push(x + 1, y, x + 1, y + 1);
    }
  }
  const edges = Int32Array.from(edgeList);
  const rimNodes = Int32Array.from(rimSet);

  // 多源 BFS：只向"至少接触一个窗内 quad"的节点扩散，最多 K 格。
  const size = w * h;
  const dist = new Uint8Array(size).fill(255);
  const near = new Int32Array(size).fill(-1);
  const touchesInside = (x, y) => inQ(x, y) || inQ(x - 1, y) || inQ(x, y - 1) || inQ(x - 1, y - 1);
  const queue = [];
  for (const n of rimNodes) { dist[n] = 0; near[n] = n; queue.push(n); }
  const bandNodes = [];
  for (let head = 0; head < queue.length; head++) {
    const n = queue[head], d = dist[n];
    if (d >= K) continue;
    const x = n % w, y = (n / w) | 0;
    for (let k = 0; k < 4; k++) {
      const nx = x + (k === 0) - (k === 1), ny = y + (k === 2) - (k === 3);
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const m = nodeIndex(nx, ny);
      if (dist[m] !== 255 || !touchesInside(nx, ny)) continue;
      dist[m] = d + 1; near[m] = near[n]; queue.push(m); bandNodes.push(m);
    }
  }

  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (const n of queue) {
    const x = n % w, y = (n / w) | 0;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  const bbox = x1 < 0 ? null : { x0: Math.max(0, x0 - 1), y0: Math.max(0, y0 - 1), x1: Math.min(w - 1, x1 + 1), y1: Math.min(h - 1, y1 + 1) };

  return {
    w, h, qw, qh, K, region, inside, insideCount, edges, edgeCount: edges.length / 4,
    rimNodes, dist, near, bandNodes: Int32Array.from(bandNodes), bbox,
    /** 世界格 (cx, cy) 的 quad 是否在窗内；与实体 / 植被 / 聚落的"所在格"判据同一口径。 */
    cellInside(cx, cy) { return inQ(cx | 0, cy | 0); },
  };
}

/** 用掩码表压缩一份"全 quad 索引"的 drawRange（水面等和地形同构的层用）。 */
export function applyQuadMask(geometry, fullIndices, mask, keepInside) {
  if (!mask) {
    geometry.index.array.set(fullIndices);
    geometry.index.needsUpdate = true;
    geometry.setDrawRange(0, fullIndices.length);
    return fullIndices.length;
  }
  const { qw, qh, inside } = mask;
  const kept = geometry.index.array;
  let count = 0;
  for (let y = 0; y < qh; y++) {
    for (let x = 0; x < qw; x++) {
      if ((inside[y * qw + x] === 1) !== keepInside) continue;
      const i = (y * qw + x) * 6;
      for (let k = 0; k < 6; k++) kept[count++] = fullIndices[i + k];
    }
  }
  geometry.index.needsUpdate = true;
  geometry.setDrawRange(0, count);
  return count;
}
