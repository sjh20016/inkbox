import { SKIRT } from './artConfig.js';

/**
 * 界缘的数值核心（纯函数，无 THREE）：给定掩码、凡间高程场、目标界高程场，算出
 *   · 每个边界节点的墙高 H 与墙顶 R；
 *   · 肩部：窗内 0<dist<K 的节点向墙顶混合的权重。
 *
 *   g(n) = sign · (T(n) − M(n))             T 为目标界 datum 之后的高程，M 为凡间真实高程；g>0 = 站在叙事正确的一侧
 *   H(n) = hMin + hCap · tanh( max(g,0)/hCap )   恒 ≥ hMin、对 g 单调、软饱和
 *   R(n) = M(n) + sign · H(n)                    墙顶；上界在凡间之上，幽冥在凡间之下
 *   T'(i) = lerp(R(near(i)), T(i), smoothstep(dist/K))   肩部
 *
 * 凡间一侧不动（M 就是凡间节点的真实 Y）；墙的两端因此恒与两张网格的边界节点精确重合。
 */
export function computeRim({ mask, mortalField, targetField, sign, cfg = SKIRT }) {
  const size = mask.w * mask.h;
  const rimY = new Float32Array(size);
  const rimW = new Float32Array(size).fill(1);
  const wallH = new Float32Array(size);        // 仅边界节点有意义
  const wallBase = new Float32Array(size);     // M(n)：墙脚高程
  const { hMin, hCap } = cfg;
  let wrongSide = 0;
  for (const n of mask.rimNodes) {
    const M = mortalField.base(n);
    const T = targetField.base(n);
    const g = sign * (T - M);
    if (g <= 0) wrongSide++;
    const H = hMin + hCap * Math.tanh(Math.max(g, 0) / hCap);
    wallBase[n] = M;
    wallH[n] = H;
    rimY[n] = M + sign * H;
    rimW[n] = 0;
  }
  const K = mask.K;
  for (const i of mask.bandNodes) {
    const t = mask.dist[i] / K;
    rimY[i] = rimY[mask.near[i]];
    rimW[i] = t * t * (3 - 2 * t);
  }
  return { rimY, rimW, wallH, wallBase, wrongSide, rimCount: mask.rimNodes.length };
}
