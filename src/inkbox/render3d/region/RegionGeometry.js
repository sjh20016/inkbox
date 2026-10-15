/**
 * M2-B B0.2 · Render3D 专用的区域派生结构（§10–§14）。
 *
 * 输入只有一样：`RegionMask`（`ui/RegionMask.js`，区域**逻辑真相**）。
 * 输出是 3D 侧要用的几何事实：哪些 quad 在窗内、边界有向边、边界节点、
 * 以及边界附近的距离场（B2 的 shoulder 用）。
 *
 * ⚠️ 它**不是**第二个 selection，也**不存**屏幕多边形（§11）：
 *    · 屏幕鼠标轨迹只在 B3 用于**采样**，最终 Region 一律由 world x/y 构成；
 *    · 这里只有世界格坐标，相机怎么转都不影响。
 *
 * ⚠️ 边界提取**不做闭环追踪**（§13 / §14）：
 *    从「inside quad ↔ outside quad」的相邻关系**直接**得到有向边即可。
 *    不实现 polygon tracing / triangulation / GIS 拓扑——棋盘接触（度 4）那种
 *    一节点四边的情形，独立边天然处理得了，闭环追踪反而要处理歧义。
 *    每条边只由**窗内那一侧**的 quad 发出 ⇒ 结构上不可能重复（§14）。
 *
 * ⚠️ 构建时机（§12 / §85）：只在 **Region identity 变化**时重建。
 *    一个时刻只有一扇窗（V1），所以 Host 只需持有一份 `activeRegionGeometry`；
 *    不要为「以后可能多窗」预先搭 Map / LRU / 资源缓存。
 *
 * ⚠️ **输入契约**：`region.contains(x, y)` 必须在 `[x0,x1] × [y0,y1]` 包围盒**之外**
 *    恒为 `false`。`RegionMask` 天然满足（多边形整体落在包围盒内；退化兜底分支本身
 *    就是包围盒判定）。这条契约是「只扫包围盒外扩 1 格」这个省算的前提——
 *    违反它会让盒外的窗内格被漏判。T1 有一组专门钉这条前提。
 */

/** 距离场里「超出计算范围 / 未计算」的哨兵值。 */
export const DISTANCE_UNKNOWN = 255;

/** 距离场默认覆盖带宽（格）。§35 的 shoulder K ≈ 5 cells，留一点余量。 */
export const DEFAULT_DISTANCE_BAND = 8;

/**
 * 区域几何。
 *
 * quad 的定义与 `TerrainMesh.gridGeometry()` 的索引完全一致：
 * quad `(x, y)` 的四个角是格点 `(x,y)`、`(x+1,y)`、`(x,y+1)`、`(x+1,y+1)`，
 * 即 `x ∈ [0, w-2]`、`y ∈ [0, h-2]`。**判定用 quad 中心 `(x+0.5, y+0.5)`**，
 * 与 M2-A 的 TerrainMesh / EntityLayer 口径逐字相同（不能改成角点，否则边界会整体挪半格）。
 */
export class RegionGeometry {
  /**
   * @param {object} world 世界（需要 `w` / `h`）
   * @param {object|null} region `RegionMask`（有 `contains(x,y)` 与包围盒）；`null` = 无窗
   * @param {{distanceBand?: number}} [options]
   */
  constructor(world, region = null, options = {}) {
    if (!world) throw new Error('RegionGeometry: world is required');
    this.world = world;
    this.region = region || null;
    this.allInside = !this.region;
    this.quadW = Math.max(0, world.w - 1);
    this.quadH = Math.max(0, world.h - 1);
    this.distanceBand = Math.max(1, options.distanceBand ?? DEFAULT_DISTANCE_BAND);

    const total = this.quadW * this.quadH;
    this.quadInside = new Uint8Array(total);
    this.distanceQuad = new Uint8Array(total).fill(DISTANCE_UNKNOWN);

    if (this.allInside) {
      this.quadInside.fill(1);
      this.insideQuadCount = total;
      this.outsideQuadCount = 0;
      this.edges = new Int32Array(0);
      this.edgeCount = 0;
      this.boundaryNodes = [];
      this.nodeCount = 0;
      return;
    }

    this.#classify();
    this.#extractEdges();
    this.#buildDistanceField();
  }

  // ── 分类 ────────────────────────────────────────────────────────────────

  /**
   * 逐 quad 判定 inside / outside。
   *
   * 只扫 Region 包围盒**外扩 1 格**的范围：多边形与矩形兜底都不可能让这个范围
   * 之外的 quad 中心命中（§85「只在 Region 改变时构建」之外再加一层省算）。
   * 省算不影响正确性——超范围的 quad 一律 outside，T1 会用**暴力全图比对**钉死这点。
   */
  #classify() {
    const { world, region, quadW, quadH, quadInside } = this;
    const x0 = clampInt(Math.floor(region.x0) - 1, 0, quadW - 1);
    const x1 = clampInt(Math.ceil(region.x1) + 1, 0, quadW - 1);
    const y0 = clampInt(Math.floor(region.y0) - 1, 0, quadH - 1);
    const y1 = clampInt(Math.ceil(region.y1) + 1, 0, quadH - 1);
    this.scanBounds = { x0, y0, x1, y1 };
    let inside = 0;
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        // 与 M2-A 的 TerrainMesh.setRegionMask / EntityLayer.write 同款：quad 中心判定。
        if (region.contains(x + 0.5, y + 0.5)) { quadInside[y * quadW + x] = 1; inside += 1; }
      }
    }
    this.insideQuadCount = inside;
    this.outsideQuadCount = quadW * quadH - inside;
  }

  // ── 边界有向边 ──────────────────────────────────────────────────────────

  /**
   * 每条边界边发出一个**有向**线段，方向约定：**窗内侧在左**（世界 XY，x 向右、y 向上）。
   *
   * quad `(x,y)` 的四条边按逆时针走（从 `(x,y)` 起）：
   *   · 下边 `(x,y) → (x+1,y)`     —— 邻居 quad `(x, y-1)`
   *   · 右边 `(x+1,y) → (x+1,y+1)` —— 邻居 quad `(x+1, y)`
   *   · 上边 `(x+1,y+1) → (x,y+1)` —— 邻居 quad `(x, y+1)`
   *   · 左边 `(x,y+1) → (x,y)`     —— 邻居 quad `(x-1, y)`
   *
   * 邻居越界（贴地图边缘）或为 outside 时发出该边。**只有窗内 quad 发边**
   * ⇒ 同一条边不会被两侧各发一次（§14「边界没有重复 quad」）。
   */
  #extractEdges() {
    const { quadW, quadH, quadInside } = this;
    const out = [];
    const interior = (x, y) => x >= 0 && y >= 0 && x < quadW && y < quadH && quadInside[y * quadW + x] === 1;
    const push = (ax, ay, bx, by) => { out.push(ax, ay, bx, by); };
    for (let y = 0; y < quadH; y += 1) {
      for (let x = 0; x < quadW; x += 1) {
        if (quadInside[y * quadW + x] !== 1) continue;
        if (!interior(x, y - 1)) push(x, y, x + 1, y);
        if (!interior(x + 1, y)) push(x + 1, y, x + 1, y + 1);
        if (!interior(x, y + 1)) push(x + 1, y + 1, x, y + 1);
        if (!interior(x - 1, y)) push(x, y + 1, x, y);
      }
    }
    this.edges = Int32Array.from(out);
    this.edgeCount = out.length / 4;
    this.#collectBoundaryNodes();
  }

  /** 边界经过的**格点**去重表（B2 画墙时按节点取两侧高程）。 */
  #collectBoundaryNodes() {
    const seen = new Set();
    const nodes = [];
    const edges = this.edges;
    for (let e = 0; e < edges.length; e += 4) {
      for (const [nx, ny] of [[edges[e], edges[e + 1]], [edges[e + 2], edges[e + 3]]]) {
        const key = ny * this.world.w + nx;
        if (seen.has(key)) continue;
        seen.add(key);
        nodes.push([nx, ny]);
      }
    }
    this.boundaryNodes = nodes;
    this.nodeCount = nodes.length;
  }

  // ── 距离场 ──────────────────────────────────────────────────────────────

  /**
   * 边界距离场（单位：quad 步数），**只在构建时算一次**（§38：不要每帧重算）。
   *
   * 距离 0 = 紧贴边界的 quad（内外两侧都算）；向外 BFS 到 `distanceBand` 为止，
   * 超出范围或未触及一律 `DISTANCE_UNKNOWN`。
   */
  #buildDistanceField() {
    const { quadW, quadH, edges, distanceQuad } = this;
    if (!edges.length) return;
    const queue = [];
    const mark = (x, y) => {
      if (x < 0 || y < 0 || x >= quadW || y >= quadH) return;
      const index = y * quadW + x;
      if (distanceQuad[index] !== DISTANCE_UNKNOWN) return;
      distanceQuad[index] = 0;
      queue.push(index);
    };
    for (let e = 0; e < edges.length; e += 4) {
      // 边两端节点 (ax,ay)-(bx,by)：两侧 quad 由节点坐标反推。
      const ax = edges[e], ay = edges[e + 1], bx = edges[e + 2], by = edges[e + 3];
      const minX = Math.min(ax, bx), maxX = Math.max(ax, bx);
      const minY = Math.min(ay, by), maxY = Math.max(ay, by);
      for (let x = minX - 1; x <= maxX; x += 1) {
        for (let y = minY - 1; y <= maxY; y += 1) mark(x, y);
      }
    }
    let head = 0;
    while (head < queue.length) {
      const index = queue[head++];
      const d = distanceQuad[index];
      if (d >= this.distanceBand) continue;
      const x = index % quadW, y = (index - x) / quadW;
      const next = d + 1;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= quadW || ny >= quadH) continue;
        const neighbour = ny * quadW + nx;
        if (distanceQuad[neighbour] !== DISTANCE_UNKNOWN) continue;
        distanceQuad[neighbour] = next;
        queue.push(neighbour);
      }
    }
    this.distanceFilled = queue.length;
  }

  // ── 查询 ────────────────────────────────────────────────────────────────

  /** quad 是否在窗内（越界 = false）。 */
  isInsideQuad(qx, qy) {
    if (qx < 0 || qy < 0 || qx >= this.quadW || qy >= this.quadH) return false;
    return this.quadInside[qy * this.quadW + qx] === 1;
  }

  /**
   * 世界坐标点是否在窗内。**格子归属用 quad 中心口径**：
   * 传入的 `(x, y)` 先落到它所属的 quad（`Math.floor`），与实体 / 建筑 / 标记
   * 在 M2-A 里的归属规则一致。
   */
  isInsideCell(x, y) {
    return this.isInsideQuad(Math.floor(x), Math.floor(y));
  }

  /**
   * 该 quad 到边界的距离（quad 步数）。
   * @returns {number} `0` = 紧贴边界；`DISTANCE_UNKNOWN` = 超出带宽或未计算。
   */
  distanceToBoundary(qx, qy) {
    if (qx < 0 || qy < 0 || qx >= this.quadW || qy >= this.quadH) return DISTANCE_UNKNOWN;
    return this.distanceQuad[qy * this.quadW + qx];
  }

  /** 有界距离：超出带宽时返回 `band`（smoothstep 过渡直接用得上）。 */
  distanceToBoundaryClamped(qx, qy, band = this.distanceBand) {
    const d = this.distanceToBoundary(qx, qy);
    return d === DISTANCE_UNKNOWN || d > band ? band : d;
  }

  /** 遍历边界边（每条 4 个整数：ax, ay, bx, by）。 */
  *boundaryEdges() {
    const edges = this.edges;
    for (let e = 0; e < edges.length; e += 4) {
      yield { ax: edges[e], ay: edges[e + 1], bx: edges[e + 2], by: edges[e + 3] };
    }
  }

  /** 供统计 / 报告用的规模读数。 */
  stats() {
    return {
      quads: this.quadW * this.quadH,
      insideQuads: this.insideQuadCount,
      outsideQuads: this.outsideQuadCount,
      boundaryEdges: this.edgeCount,
      boundaryNodes: this.nodeCount,
      distanceBand: this.distanceBand,
    };
  }
}

function clampInt(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.trunc(value)));
}
