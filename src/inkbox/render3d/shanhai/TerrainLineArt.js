import * as THREE from 'three';
import { heightSampling } from '../art/PigmentTerrainMaterial.js';
import { RENDER_ORDER } from '../shared/RenderOrder.js';
import { adaptiveTopology } from '../terrain/topology.js';

/**
 * V1.3 · 墨骨成山 —— 三维线刻（Freestyle / Line Art 思路的实时高度场版本）。
 *
 * 两类线，全部建立在真实地形之上（深度测试、遮挡、视角随动）：
 *  1) 轮廓 Contour / Silhouette：地形网格的「背面外扩壳」（inverted hull）。
 *     只在**宽域平滑法线**掠射或背向视线处保留 ⇒ 是视角相关的真实外轮廓与遮挡边，
 *     不是三角网格边；镜头转动时自然更新，前山遮挡后山。
 *  2) 结构线 Ridge / Valley / Crease：从高度场（与网格同一份 CPU 顶点高度）提取：
 *     Hessian 主曲率 + 非极大值抑制 ⇒ 1 格细的山脊 / 山谷 / 崖顶折线；
 *     连成笔画链、去短、Chaikin 平滑、按重要度分级。顶点高度在 GPU 上从
 *     heightTexture 采样 ⇒ 雕刻时线条立刻贴着新地形走；拓扑在脏区后节流重建。
 *
 * 成本：轮廓 = 地形顶点再处理一遍（片元几乎全部早 Z 剔除）；结构线 = 一次小 draw（≤数万顶点）。
 * 不新增 Render Target / 全屏 Pass；不读写 World；raycast 为空操作。
 */
const lineNoise = `
float lhash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float lnoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
  return mix(mix(lhash(i),lhash(i+vec2(1,0)),f.x),mix(lhash(i+vec2(0,1)),lhash(i+vec2(1,1)),f.x),f.y);}
`;
const mistFade = `
float farMist(vec3 w){ float far=dot(w.xz-shTarget,shViewXZ)/max(shSpan*0.5,1.0); return smoothstep(0.05,1.1,far)*shAir; }
`;

const hullVertex = `
uniform sampler2D heightTexture;
uniform vec2 mapSize, resolution;
uniform float gpuDisplacement, widthPx, widthVar, brushMode;
varying vec3 vWorld; varying vec3 vN; varying float vVar;
${heightSampling}
${lineNoise}
void main(){
  vec3 local=position;
  if(gpuDisplacement>0.5) local.y=texture2D(heightTexture,uv).g;
  vec4 p=modelMatrix*vec4(local,1.0); vWorld=p.xyz;
  vec2 grid=p.xz+(mapSize-1.0)*0.5;
  const float R=2.0;
  float bl=sampleHeightBroadX(grid-vec2(R,0.0)), br=sampleHeightBroadX(grid+vec2(R,0.0));
  float bd=sampleHeightBroadY(grid-vec2(0.0,R)), bu=sampleHeightBroadY(grid+vec2(0.0,R));
  vec2 g=vec2(br-bl,bu-bd)/(2.0*R);
  vec3 n=normalize(vec3(-g.x,1.0,-g.y)); vN=n;
  vec4 clip=projectionMatrix*viewMatrix*p;
  vec2 d=(viewMatrix*vec4(n,0.0)).xy; float l=length(d); d=l>1e-4?d/l:vec2(0.0);
  // 线宽：随山势高度与低频噪声起伏（提按），屏幕像素恒定。
  vVar=lnoise(grid*0.09)*0.7+lnoise(grid*0.31)*0.3;
  float w=widthPx*(1.0+widthVar*(vVar*2.0-1.0))*(0.75+0.25*smoothstep(2.0,20.0,local.y));
  if(brushMode>0.5) w*=0.66+0.65*lnoise(grid*0.38+vec2(local.y*0.06));
  clip.xy+=d*w*2.0/resolution*clip.w;
  gl_Position=clip;
}`;
const hullFragment = `
uniform vec3 lineColor; uniform float lineAlpha, facingMax, breakup, brushMode;
uniform vec2 shViewXZ, shTarget; uniform float shSpan, shAir; uniform vec3 shMist;
varying vec3 vWorld; varying vec3 vN; varying float vVar;
${lineNoise}
${mistFade}
void main(){
  vec3 V=normalize(cameraPosition-vWorld);
  float facing=dot(normalize(vN),V);
  // 平滑法线仍正对镜头 ⇒ 只是网格小折面，不是轮廓：丢弃（避免碎点）。
  float a=lineAlpha*(1.0-smoothstep(facingMax-0.06,facingMax+0.06,facing));
  if(breakup>0.0){ float n=lnoise(vWorld.xz*0.55+vec2(vWorld.y*0.21,0.0)); a*=mix(1.0,smoothstep(0.28,0.52,n),breakup); }
  if(brushMode>0.5) a*=mix(0.65,1.0,lnoise(vWorld.xz*3.2+vec2(vWorld.y*0.35)));
  float m=farMist(vWorld);
  a*=1.0-m*0.55;
  if(a<0.02) discard;
  gl_FragColor=vec4(mix(lineColor,shMist,m*0.8),a);
}`;

const strokeVertex = `
attribute vec2 aPos; attribute vec2 aOther; attribute float aSide; attribute vec4 aInfo;
uniform sampler2D heightTexture;
uniform vec2 mapSize, resolution;
uniform float widthPx, depthBias, adaptiveDiagonal, brushMode;
uniform vec4 kindWidth;
varying vec3 vWorld; varying float vS, vL, vWeight, vKind, vSide;
${heightSampling}
${lineNoise}
float strokeHeight(vec2 p){
  vec2 c=clamp(p,vec2(0.0),mapSize-1.0);
  if(all(equal(c,floor(c)))) return hAt(c);
  vec2 cell=min(floor(c),mapSize-2.0), f=c-cell, texel=1.0/mapSize;
  vec2 uv=(cell+0.5)*texel;
  vec4 a=texture2D(heightTexture,uv), b=texture2D(heightTexture,uv+vec2(texel.x,0.0));
  vec4 c0=texture2D(heightTexture,uv+vec2(0.0,texel.y)), d=texture2D(heightTexture,uv+texel);
  // R selects the same diagonal as topology.js; G is the Float32 stage height
  // used by TerrainMesh vertices. Historical worlds always retain the BC split.
  bool ad=adaptiveDiagonal>0.5 && abs(a.r-d.r)<abs(b.r-c0.r);
  if(ad) return f.y>=f.x
    ? a.g+f.y*(c0.g-a.g)+f.x*(d.g-c0.g)
    : a.g+f.x*(b.g-a.g)+f.y*(d.g-b.g);
  return f.x+f.y<=1.0
    ? a.g+f.x*(b.g-a.g)+f.y*(c0.g-a.g)
    : d.g+(1.0-f.x)*(c0.g-d.g)+(1.0-f.y)*(b.g-d.g);
}
vec3 toWorld(vec2 c){ return vec3(c.x-(mapSize.x-1.0)*0.5, strokeHeight(c), c.y-(mapSize.y-1.0)*0.5); }
void main(){
  vec3 A=toWorld(aPos), B=toWorld(aOther);
  vec4 wA=modelMatrix*vec4(A,1.0); vWorld=wA.xyz;
  vec4 mA=viewMatrix*wA, mB=viewMatrix*modelMatrix*vec4(B,1.0);
  mA.z+=depthBias;
  vec4 cA=projectionMatrix*mA, cB=projectionMatrix*mB;
  vec2 sA=cA.xy/cA.w*resolution, sB=cB.xy/cB.w*resolution;
  vec2 d=sB-sA; float ld=length(d); d=ld>1e-5?d/ld:vec2(1.0,0.0);
  vec2 nrm=vec2(-d.y,d.x);
  vS=aInfo.x; vL=aInfo.y; vWeight=aInfo.z; vKind=aInfo.w; vSide=aSide;
  float kw=vKind<0.5?kindWidth.x:vKind<1.5?kindWidth.y:vKind<2.5?kindWidth.z:kindWidth.w;
  float taper=smoothstep(0.0,3.0,min(aInfo.x,aInfo.y-aInfo.x));
  float w=widthPx*kw*(0.45+0.80*aInfo.z)*(0.30+0.70*taper);
  if(brushMode>0.5) w*=0.55+0.90*lnoise(vec2(vS*0.22+vKind*7.0,vL*0.08));
  cA.xy+=nrm*aSide*w/resolution*cA.w;
  gl_Position=cA;
}`;
const strokeFragment = `
uniform vec3 lineColor; uniform float lineAlpha, gate, dry, pixelsPerUnit, brushMode;
uniform vec4 kindAlpha;
uniform vec2 shViewXZ, shTarget; uniform float shSpan, shAir; uniform vec3 shMist;
varying vec3 vWorld; varying float vS, vL, vWeight, vKind, vSide;
${lineNoise}
${mistFade}
void main(){
  float ka=vKind<0.5?kindAlpha.x:vKind<1.5?kindAlpha.y:vKind<2.5?kindAlpha.z:kindAlpha.w;
  // 皴笔只属于近景。
  if(vKind>2.5) ka*=smoothstep(2.4,6.0,pixelsPerUnit);
  // 远景收敛：镜头越远，只留越重要的笔画。
  float g=gate+(1.0-gate)*0.55*(1.0-smoothstep(1.6,7.0,pixelsPerUnit));
  float a=lineAlpha*ka*smoothstep(g-0.10,g+0.10,vWeight);
  // 笔锋：两侧柔边；干笔：沿笔画方向断续 + 横向飞白。
  a*=1.0-smoothstep(0.55,1.0,abs(vSide));
  if(dry>0.0){
    // Keep long strokes legible: the old high-frequency threshold turned every
    // ridge into a chain of isolated black dashes at village-scale zoom.
    float n=lnoise(vec2(vS*0.18+vKind*13.0,vL*0.12));
    float f=lnoise(vec2(vS*0.45,vSide*1.7+vWeight*9.0));
    float paper=0.82+0.18*smoothstep(0.22,0.50,n)*smoothstep(0.25,0.55,f);
    a*=mix(1.0,paper,dry);
  }
  if(brushMode>0.5){
    // Ragged sides, pressure and lengthwise paper fibres; the stroke keeps a
    // continuous core instead of becoming a dotted path when zoomed out.
    float rag=0.72+0.20*lnoise(vec2(vS*0.65,vL*0.09));
    a*=1.0-smoothstep(rag-0.18,rag,abs(vSide));
    float fibre=lnoise(vec2(vS*0.65,vSide*13.0+vKind*9.0));
    float dryPaper=smoothstep(0.58,0.77,fibre)*smoothstep(0.1,0.55,abs(vSide));
    a*=1.0-dryPaper*0.72;
  }
  float m=farMist(vWorld);
  a*=1.0-m*0.65;
  if(a<0.02) discard;
  gl_FragColor=vec4(mix(lineColor,shMist,m*0.8),a);
}`;

// ─────────────────────────── CPU：高度场结构线提取 ───────────────────────────
function* blur5Steps(src, w, h) {
  // 可分离 [1 4 6 4 1]/16；内部格无分支，边缘夹取。
  const t = new Float32Array(src.length), out = new Float32Array(src.length);
  const at = (r, x) => src[r + (x < 0 ? 0 : x >= w ? w - 1 : x)];
  for (let y = 0; y < h; y++) {
    const r = y * w;
    for (let x = 0; x < w; x++) {
      if (x >= 2 && x < w - 2) t[r + x] = (src[r + x - 2] + src[r + x + 2] + 4 * (src[r + x - 1] + src[r + x + 1]) + 6 * src[r + x]) / 16;
      else t[r + x] = (at(r, x - 2) + at(r, x + 2) + 4 * (at(r, x - 1) + at(r, x + 1)) + 6 * src[r + x]) / 16;
    }
    yield;
  }
  for (let y = 0; y < h; y++) {
    const ym2 = Math.max(0, y - 2) * w, ym1 = Math.max(0, y - 1) * w, yp1 = Math.min(h - 1, y + 1) * w, yp2 = Math.min(h - 1, y + 2) * w, r = y * w;
    for (let x = 0; x < w; x++) out[r + x] = (t[ym2 + x] + t[yp2 + x] + 4 * (t[ym1 + x] + t[yp1 + x]) + 6 * t[r + x]) / 16;
    yield;
  }
  return out;
}
function* boxBlurSteps(src, w, h, r) {
  const I = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) { let row = 0; for (let x = 0; x < w; x++) { row += src[y * w + x]; I[(y + 1) * (w + 1) + x + 1] = I[y * (w + 1) + x + 1] + row; } yield; }
  const out = new Float32Array(src.length);
  for (let y = 0; y < h; y++) { for (let x = 0; x < w; x++) {
    const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1), y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
    out[y * w + x] = (I[y1 * (w + 1) + x1] - I[y0 * (w + 1) + x1] - I[y1 * (w + 1) + x0] + I[y0 * (w + 1) + x0]) / ((x1 - x0) * (y1 - y0));
  } yield; }
  return out;
}
function bilin(S, w, h, x, y) {
  x = Math.min(w - 1.001, Math.max(0, x)); y = Math.min(h - 1.001, Math.max(0, y));
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy, i = iy * w + ix;
  return (S[i] * (1 - fx) + S[i + 1] * fx) * (1 - fy) + (S[i + w] * (1 - fx) + S[i + w + 1] * fx) * fy;
}
const NB = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
const NBL = NB.map(([x, y]) => Math.hypot(x, y));

/** 点集（强度 + 切向）→ 笔画链。每点沿切向两侧各接一个最佳邻点；邻接用 8 向位掩码（无 Map/Set）。 */
function* linkChainsSteps(str, tx, ty, w, h) {
  const N = w * h, mask = new Uint8Array(N), pts = [];
  for (let i = 0; i < N; i++) { if (str[i] > 0) pts.push(i); if ((i & 2047) === 2047) yield; }
  yield;
  let visited = 0;
  for (const i of pts) {
    const x = i % w, y = (i - x) / w;
    for (let sgn = 1; sgn >= -1; sgn -= 2) {
      let best = -1, bestDot = 0.5;
      for (let d = 0; d < 8; d++) {
        const nx = x + NB[d][0], ny = y + NB[d][1]; if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        if (!(str[ny * w + nx] > 0)) continue;
        const dot = sgn * (NB[d][0] * tx[i] + NB[d][1] * ty[i]) / NBL[d];
        if (dot > bestDot) { bestDot = dot; best = d; }
      }
      if (best >= 0) { const j = i + NB[best][1] * w + NB[best][0]; mask[i] |= 1 << best; mask[j] |= 1 << ((best + 4) & 7); }
    }
    if ((++visited & 255) === 0) yield;
  }
  const deg = m => { let c = 0; while (m) { c += m & 1; m >>= 1; } return c; };
  const chains = [];
  const take = (i, d) => { mask[i] &= ~(1 << d); const j = i + NB[d][1] * w + NB[d][0]; mask[j] &= ~(1 << ((d + 4) & 7)); return j; };
  const firstDir = m => { for (let d = 0; d < 8; d++) if (m & (1 << d)) return d; return -1; };
  const walk = function* (start, d) {
    const path = [start]; let cur = take(start, d);
    for (;;) { path.push(cur); if ((path.length & 255) === 0) yield; if (deg(mask[cur]) !== 1 || origDeg[cur] !== 2) break; cur = take(cur, firstDir(mask[cur])); }
    return path;
  };
  const origDeg = new Uint8Array(N); visited = 0;
  for (const i of pts) { origDeg[i] = deg(mask[i]); if ((++visited & 511) === 0) yield; }
  visited = 0;
  for (const i of pts) { if (origDeg[i] !== 2) while (mask[i]) chains.push(yield* walk(i, firstDir(mask[i]))); if ((++visited & 255) === 0) yield; }
  visited = 0;
  for (const i of pts) { while (mask[i]) chains.push(yield* walk(i, firstDir(mask[i]))); if ((++visited & 255) === 0) yield; }
  return chains;
}

/**
 * 从「格点显示高程」提取结构线。返回链：{pts:[[x,y],...], kind, weight}。
 * kind: 0 山脊 · 1 山谷 · 2 崖顶折线（凸形坡折）· 3 皴笔（陡坡背光面的顺坡短笔）。
 */
export function* extractTerrainStructureSteps(E, w, h, { ridge = true, valley = false, cliff = false, hatch = false, brush = false, minLen = 6, inside = null, sun = [-0.45, 0.80, -0.40] } = {}) {
  const S = yield* blur5Steps(E, w, h), B = yield* boxBlurSteps(S, w, h, 7), N = w * h;
  const kinds = []; if (ridge) kinds.push(0); if (valley) kinds.push(1); if (cliff) kinds.push(2);
  const str = kinds.map(() => new Float32Array(N)), tx = kinds.map(() => new Float32Array(N)), ty = kinds.map(() => new Float32Array(N));
  const kp = cliff ? new Float32Array(N) : null, gxA = new Float32Array(N), gyA = new Float32Array(N);
  const jR = kinds.indexOf(0), jV = kinds.indexOf(1), jC = kinds.indexOf(2);
  const sR = str[jR], xR = tx[jR], yR = ty[jR], sV = str[jV], xV = tx[jV], yV = ty[jV], sC = str[jC], xC = tx[jC], yC = ty[jC];
  const nearest = (x, y, dx, dy) => S[(y + Math.round(dy)) * w + x + Math.round(dx)];
  for (let y = 2; y < h - 2; y++) { for (let x = 2; x < w - 2; x++) {
    const i = y * w + x;
    const s = S[i], hxx = S[i + 1] - 2 * s + S[i - 1], hyy = S[i + w] - 2 * s + S[i - w];
    const hxy = (S[i + w + 1] - S[i + w - 1] - S[i - w + 1] + S[i - w - 1]) / 4;
    const gx = (S[i + 1] - S[i - 1]) / 2, gy = (S[i + w] - S[i - w]) / 2; gxA[i] = gx; gyA[i] = gy;
    if (inside && !inside(x, y)) continue;
    const tr = (hxx + hyy) / 2, disc = Math.sqrt(((hxx - hyy) / 2) ** 2 + hxy * hxy), l1 = tr - disc, l2 = tr + disc;
    let cx, cy;
    if (Math.abs(hxy) > 1e-7) { cx = l1 - hyy; cy = hxy; } else if (hxx < hyy) { cx = 1; cy = 0; } else { cx = 0; cy = 1; }
    const cl = Math.hypot(cx, cy) || 1; cx /= cl; cy /= cl;
    if (ridge) {
      const k = -l1 - Math.max(0, l2) * 0.3, rel = s - B[i];
      if (k >= 0.16 && rel >= 0.6 && s >= nearest(x, y, cx, cy) && s >= nearest(x, y, -cx, -cy)) {
        sR[i] = k * Math.min(1, rel / 8); xR[i] = -cy; yR[i] = cx;
      }
    }
    if (valley) {
      const k = l2 - Math.max(0, -l1) * 0.3;
      if (k >= 0.18) {
        const wall = (Math.abs(nearest(x, y, -2 * cy, 2 * cx) - s) + Math.abs(nearest(x, y, 2 * cy, -2 * cx) - s)) / 4;
        if (wall >= 0.9 && s <= nearest(x, y, -cy, cx) && s <= nearest(x, y, cy, -cx)) {
          sV[i] = k * Math.min(1, wall / 3); xV[i] = cx; yV[i] = cy;
        }
      }
    }
    if (cliff) {
      const gm = Math.hypot(gx, gy);
      if (gm >= 1.1) {
        const c = (gx * gx * hxx + 2 * gx * gy * hxy + gy * gy * hyy) / (gm * gm); kp[i] = c;
        if (c < -0.35) { sC[i] = -c * Math.min(1, gm / 3); xC[i] = -gy / gm; yC[i] = gx / gm; }
      }
    }
  } yield; }
  if (cliff) {
    // 非极大值抑制：沿坡度方向只留坡折最尖锐的一格。
    for (let y = 2; y < h - 2; y++) { for (let x = 2; x < w - 2; x++) {
      const i = y * w + x; if (!(sC[i] > 0)) continue;
      const dx = Math.round(yC[i]), dy = Math.round(-xC[i]), o = dy * w + dx;
      if (kp[i] > kp[i + o] || kp[i] > kp[i - o]) sC[i] = 0;
    } yield; }
  }
  const out = [];
  for (let j = 0; j < kinds.length; j++) {
    const kind = kinds[j];
    for (const chain of yield* linkChainsSteps(str[j], tx[j], ty[j], w, h)) {
      let len = 0, sum = 0;
      for (let k = 0; k < chain.length; k++) { sum += str[j][chain[k]]; if (k) { const a = chain[k - 1], b = chain[k]; len += Math.hypot(a % w - b % w, (a - a % w) / w - (b - b % w) / w); } if ((k & 255) === 255) yield; }
      if (len < minLen) continue;
      let pts = [];
      for (let k = 0; k < chain.length; k++) {
        const i = chain[k]; pts.push([i % w, (i - i % w) / w]);
        if ((k & 255) === 255) yield;
      }
      for (let it = 0; it < 2; it++) {
        const q = [pts[0]];
        for (let k = 0; k < pts.length - 1; k++) { const a = pts[k], b = pts[k + 1]; q.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]); if ((k & 255) === 255) yield; }
        q.push(pts[pts.length - 1]); pts = q;
      }
      out.push({ pts, kind, importance: (sum / chain.length) * Math.min(1.6, Math.sqrt(len / 10)) });
      yield;
    }
  }
  // 重要度按类内分位归一：主脊 ≈ 1，细小支脉 → 0。
  for (const kind of kinds) {
    const list = out.filter(c => c.kind === kind).map(c => c.importance).sort((a, b) => a - b);
    const ref = list[Math.floor(list.length * 0.85)] || 1;
    let n = 0;
    for (const c of out) { if (c.kind === kind) c.weight = Math.min(1, c.importance / ref); if ((++n & 255) === 0) yield; }
  }
  if (hatch) {
    // 皴笔：陡坡、背光面上按确定性抖动网格落笔，顺坡（梯度方向）向下拖 1.5–3 格。
    // 落在竖墙上即成竖向披麻；坡度与受光变化时自然稀疏 / 消失。完全由地形决定，无 RNG。
    const sl = Math.hypot(sun[0], sun[1], sun[2]), lx = sun[0] / sl, ly = sun[1] / sl, lz = sun[2] / sl;
    const hsh = (x, y, k) => { const v = Math.sin(x * 127.1 + y * 311.7 + k * 74.7) * 43758.5453; return v - Math.floor(v); };
    const stride = brush ? 3 : 2;
    for (let y = 3; y < h - 3; y += stride) { for (let x = 3; x < w - 3; x += stride) {
      const jx = x + Math.floor(hsh(x, y, 1) * 2), jy = y + Math.floor(hsh(x, y, 2) * 2), i = jy * w + jx;
      if (inside && !inside(jx, jy)) continue;
      const gx = gxA[i], gy = gyA[i], gm = Math.hypot(gx, gy);
      if (gm < (brush ? 0.55 : 1.3)) continue;
      const nl = Math.hypot(gx, 1, gy), ndl = (-gx * lx + ly - gy * lz) / nl;
      const shade = Math.min(1, Math.max(0, (0.55 - ndl) / 0.45));
      const steep = Math.min(1, (gm - (brush ? 0.55 : 1.3)) / (brush ? 1.8 : 2.5));
      if (hsh(jx, jy, 3) > 0.25 + 0.65 * shade * (0.4 + 0.6 * steep)) continue;
      let px = jx + hsh(jx, jy, 4) - 0.5, py = jy + hsh(jx, jy, 5) - 0.5;
      const pts = [[px, py]], L = brush ? 2.5 + 4.5 * hsh(jx, jy, 6) : 1.4 + 1.6 * hsh(jx, jy, 6), steps = brush ? 6 : 3;
      for (let t = 0; t < steps; t++) {
        const ci = Math.round(py) * w + Math.round(px), qx = gxA[ci], qy = gyA[ci], qm = Math.hypot(qx, qy) || 1;
        px -= qx / qm * L / steps; py -= qy / qm * L / steps;
        if (px < 1 || py < 1 || px > w - 2 || py > h - 2) break;
        if (brush && inside && !inside(Math.round(px), Math.round(py))) break;
        pts.push([px, py]);
      }
      if (pts.length > 2) out.push({ pts, kind: 3, weight: 0.35 + 0.65 * shade * steep });
    } yield; }
  }
  return out;
}

export function extractTerrainStructure(E, w, h, options) {
  const steps = extractTerrainStructureSteps(E, w, h, options);
  let next;
  do { next = steps.next(); } while (!next.done);
  return next.value;
}

// Pack away from live attributes. The visible stroke remains complete until the
// entire new topology is ready; only the final copy/upload is atomic to a frame.
function* packStrokeGeometrySteps(chains) {
  let segs = 0; for (const c of chains) segs += c.pts.length - 1;
  const pos = new Float32Array(segs * 8), oth = new Float32Array(segs * 8);
  const side = new Float32Array(segs * 4), info = new Float32Array(segs * 16), index = new Uint32Array(segs * 6);
  let s = 0;
  for (const c of chains) {
    let L = 0; const acc = [0];
    for (let k = 1; k < c.pts.length; k++) {
      L += Math.hypot(c.pts[k][0] - c.pts[k - 1][0], c.pts[k][1] - c.pts[k - 1][1]); acc.push(L);
      if ((k & 255) === 0) yield;
    }
    for (let k = 0; k < c.pts.length - 1; k++, s++) {
      const a = c.pts[k], b = c.pts[k + 1], v = s * 4;
      const ends = [[a, b, -1, acc[k]], [a, b, 1, acc[k]], [b, a, 1, acc[k + 1]], [b, a, -1, acc[k + 1]]];
      ends.forEach(([p, o, sd, along], e) => {
        pos.set(p, (v + e) * 2); oth.set(o, (v + e) * 2); side[v + e] = sd;
        info.set([along, L, c.weight, c.kind], (v + e) * 4);
      });
      index.set([v, v + 1, v + 2, v + 2, v + 1, v + 3], s * 6);
      if ((s & 255) === 255) yield;
    }
    yield;
  }
  return { segs, pos, oth, side, info, index };
}

function buildStrokeGeometry(chains, geometry, packed = null) {
  let segs = 0; for (const c of chains) segs += c.pts.length - 1;
  const oldCapacity = geometry.userData.segmentCapacity || 0;
  if (segs > oldCapacity) {
    // Replacing an uploaded BufferAttribute alone leaves its old WebGL buffer owned by
    // the renderer. Dispose this owned geometry while it still references every old
    // attribute; three will register/upload the same geometry again on the next draw.
    if (oldCapacity) geometry.dispose();
    const capacity = Math.max(segs, oldCapacity ? Math.ceil(oldCapacity * 1.5) : 4);
    const dynamic = (array, size) => new THREE.BufferAttribute(array, size).setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('aPos', dynamic(new Float32Array(capacity * 8), 2));
    geometry.setAttribute('aOther', dynamic(new Float32Array(capacity * 8), 2));
    geometry.setAttribute('aSide', dynamic(new Float32Array(capacity * 4), 1));
    geometry.setAttribute('aInfo', dynamic(new Float32Array(capacity * 16), 4));
    // three uses position for vertex count; the shader reconstructs real positions.
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(capacity * 12), 3));
    geometry.setIndex(dynamic(new Uint32Array(capacity * 6), 1));
    geometry.userData.segmentCapacity = capacity;
  }
  const posAttr = geometry.getAttribute('aPos'), othAttr = geometry.getAttribute('aOther');
  const sideAttr = geometry.getAttribute('aSide'), infoAttr = geometry.getAttribute('aInfo');
  const pos = posAttr?.array, oth = othAttr?.array, side = sideAttr?.array, info = infoAttr?.array;
  const indexAttr = geometry.getIndex(), index = indexAttr?.array;
  let s = 0;
  if (packed && segs) {
    pos.set(packed.pos); oth.set(packed.oth); side.set(packed.side); info.set(packed.info); index.set(packed.index);
  } else for (const c of chains) {
    let L = 0; const acc = [0];
    for (let k = 1; k < c.pts.length; k++) { L += Math.hypot(c.pts[k][0] - c.pts[k - 1][0], c.pts[k][1] - c.pts[k - 1][1]); acc.push(L); }
    for (let k = 0; k < c.pts.length - 1; k++, s++) {
      const a = c.pts[k], b = c.pts[k + 1], v = s * 4;
      const ends = [[a, b, -1, acc[k]], [a, b, 1, acc[k]], [b, a, 1, acc[k + 1]], [b, a, -1, acc[k + 1]]];
      ends.forEach(([p, o, sd, along], e) => {
        pos.set(p, (v + e) * 2); oth.set(o, (v + e) * 2); side[v + e] = sd;
        info.set([along, L, c.weight, c.kind], (v + e) * 4);
      });
      index.set([v, v + 1, v + 2, v + 2, v + 1, v + 3], s * 6);
    }
  }
  if (segs) {
    for (const [attribute, count] of [[posAttr, segs * 8], [othAttr, segs * 8], [sideAttr, segs * 4], [infoAttr, segs * 16], [indexAttr, segs * 6]]) {
      attribute.clearUpdateRanges();
      attribute.addUpdateRange(0, count);
      attribute.needsUpdate = true;
    }
  }
  geometry.setDrawRange(0, segs * 6);
  return segs;
}

function* buildLineSteps(terrain, style, regionGeometry, regionInside) {
  const w = terrain.world.w, h = terrain.world.h, pos = terrain.geometry.attributes.position.array;
  const E = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) { const i = y * w + x; E[i] = pos[i * 3 + 1]; }
    yield;
  }
  yield 'snapshotReady';
  const inside = regionGeometry && !regionGeometry.allInside
    ? (x, y) => regionGeometry.isInsideQuad(Math.min(x, w - 2), Math.min(y, h - 2)) === regionInside : null;
  const chains = yield* extractTerrainStructureSteps(E, w, h, {
    ridge: (style.ridge ?? 1) > 0, valley: (style.valley ?? 0) > 0,
    cliff: (style.cliff ?? 0) > 0, hatch: (style.hatch ?? 0) > 0,
    brush: !!style.brush,
    minLen: style.minLen ?? 6, inside,
  });
  return { chains, packed: yield* packStrokeGeometrySteps(chains) };
}

export class TerrainLineArt {
  constructor(terrain) {
    this.terrain = terrain;
    this.group = new THREE.Group(); this.group.name = 'TerrainLineArt';
    this.group.userData.presentationOnly = true;
    this.style = null; this.dirty = true; this.lastBuild = -1e9; this.buildTask = null;
    this.stats = { builds: 0, segments: 0, lastBuildMs: 0, lastWallMs: 0, lastMaxSliceMs: 0 };
  }
  ensure() {
    const t = this.terrain;
    if (this.hull || !t.artData || !t.inkMaterial) return !!this.hull;
    const tu = t.inkMaterial.uniforms;
    const shared = { heightTexture: tu.heightTexture, mapSize: tu.mapSize, gpuDisplacement: tu.gpuDisplacement,
      shViewXZ: tu.shViewXZ, shTarget: tu.shTarget, shSpan: tu.shSpan, shAir: tu.shAir, shMist: tu.shMist };
    this.resolution = { value: new THREE.Vector2(1440, 900) };
    this.hullMaterial = new THREE.ShaderMaterial({ vertexShader: hullVertex, fragmentShader: hullFragment, side: THREE.BackSide,
      transparent: true, depthWrite: false, uniforms: { ...shared, resolution: this.resolution,
        widthPx: { value: 2 }, widthVar: { value: 0.3 }, lineColor: { value: new THREE.Color('#141311') }, lineAlpha: { value: 1 },
        facingMax: { value: 0.22 }, breakup: { value: 0 }, brushMode: { value: 0 } } });
    this.hullMaterial.name = 'TerrainLineArtHull';
    this.hull = new THREE.Mesh(t.geometry, this.hullMaterial);
    this.hull.name = 'TerrainLineArt:contour'; this.hull.raycast = () => {}; this.hull.frustumCulled = false;
    this.hull.renderOrder = RENDER_ORDER.terrain;
    this.strokeGeometry = new THREE.BufferGeometry();
    this.strokeGeometry.setDrawRange(0, 0);
    // 笔画四边形在屏幕空间展开，绕序随笔画方向而变 ⇒ 双面。
    this.strokeMaterial = new THREE.ShaderMaterial({ vertexShader: strokeVertex, fragmentShader: strokeFragment, side: THREE.DoubleSide,
      transparent: true, depthWrite: false, uniforms: { ...shared, resolution: this.resolution,
        widthPx: { value: 2 }, depthBias: { value: 1.6 }, adaptiveDiagonal: { value: adaptiveTopology(t.world) ? 1 : 0 },
        kindWidth: { value: new THREE.Vector4(1, 0.7, 0.85, 0.6) },
        kindAlpha: { value: new THREE.Vector4(1, 0.6, 0.8, 0) }, lineColor: { value: new THREE.Color('#141311') }, lineAlpha: { value: 1 },
        gate: { value: 0 }, dry: { value: 0 }, pixelsPerUnit: { value: 4 }, brushMode: { value: 0 } } });
    this.strokeMaterial.name = 'TerrainLineArtStrokes';
    this.strokes = new THREE.Mesh(this.strokeGeometry, this.strokeMaterial);
    this.strokes.visible = false;
    this.strokes.name = 'TerrainLineArt:structure'; this.strokes.raycast = () => {}; this.strokes.frustumCulled = false;
    this.strokes.renderOrder = RENDER_ORDER.terrain;
    this.group.add(this.hull, this.strokes);
    return true;
  }
  /** style = 风格档案里的 `lines`；null ⇒ 整组关闭（零成本回退）。 */
  setStyle(style) {
    this.style = style || null;
    if (!this.style) { this.cancelBuild(); this.dirty = true; this.group.visible = false; return; }
    if (!this.ensure()) { this.group.visible = false; return; }
    const s = this.style, hu = this.hullMaterial.uniforms, su = this.strokeMaterial.uniforms;
    hu.brushMode.value = su.brushMode.value = s.brush ? 1 : 0;
    const hull = s.contour || null;
    this.hull.visible = !!hull;
    if (hull) {
      hu.widthPx.value = hull.width ?? 2; hu.widthVar.value = hull.widthVar ?? 0.3; hu.lineColor.value.set(hull.color || s.color || '#141311');
      hu.lineAlpha.value = hull.alpha ?? 1; hu.facingMax.value = hull.facing ?? 0.22; hu.breakup.value = hull.breakup ?? 0;
    }
    su.widthPx.value = s.width ?? 2; su.lineColor.value.set(s.color || '#141311'); su.lineAlpha.value = s.alpha ?? 1;
    // Hatching remains as sparse slope texture, while ridge/cliff strokes keep
    // their profile values. Dense line-c hatching previously read as a second,
    // unrelated layer of black dotted paths over the terrain.
    su.kindAlpha.value.set(s.ridge ?? 1, s.valley ?? 0, s.cliff ?? 0, (s.hatch ?? 0) * (s.brush ? 0.65 : 0.28));
    su.kindWidth.value.set(...[1, 0.7, 0.85, 0.6].map((d, i) => s.kindWidth?.[i] ?? d));
    su.gate.value = s.gate ?? 0; su.dry.value = s.dry ?? 0;
    this.group.visible = true;
    const key = JSON.stringify([s.ridge > 0, s.valley > 0, s.cliff > 0, s.hatch > 0, s.minLen, !!s.brush]);
    if (key !== this.styleKey) { this.cancelBuild(); this.styleKey = key; this.dirty = true; }
  }
  markDirty() {
    // A copy interrupted by a mesh update would contain rows from two terrain
    // states. Once copied, let the current result finish while queuing one refresh.
    if (this.buildTask && !this.buildTask.snapshotReady) this.cancelBuild();
    this.dirty = true;
    this.lastDirtyAt = globalThis.performance?.now?.() ?? Date.now();
  }
  setRegionGeometry(geometry, inside) {
    if (this.regionGeometry === (geometry || null) && this.regionInside === !!inside) return;
    this.cancelBuild();
    // Structure strokes have no region mask in the shader. Hide the previous
    // region's complete geometry until a build for the new region commits.
    if (this.strokes) this.strokes.visible = false;
    this.regionGeometry = geometry || null; this.regionInside = !!inside; this.dirty = true;
  }
  cancelBuild() {
    this.buildTask?.steps.return();
    this.buildTask = null;
  }
  startBuild(now = globalThis.performance?.now?.() ?? Date.now()) {
    if (!this.style || !this.strokeGeometry) return;
    const world = this.terrain.world;
    this.buildTask = { steps: buildLineSteps(this.terrain, this.style, this.regionGeometry, this.regionInside),
      world, generation: world.generation, version: world.generation?.version,
      region: this.regionGeometry, inside: this.regionInside, styleKey: this.styleKey,
      startedAt: now, cpuMs: 0, maxSliceMs: 0, snapshotReady: false };
    this.dirty = false;
  }
  /** Advances bounded numerical work; returns true only after a current result commits. */
  advanceBuild(budgetMs = 3) {
    const task = this.buildTask;
    if (!task) return false;
    const clock = () => globalThis.performance?.now?.() ?? Date.now();
    const started = clock();
    let next;
    do {
      const before = clock();
      next = task.steps.next();
      const stepMs = clock() - before;
      task.cpuMs += stepMs;
      if (next.value === 'snapshotReady') task.snapshotReady = true;
    } while (!next.done && clock() - started < budgetMs);
    task.maxSliceMs = Math.max(task.maxSliceMs, clock() - started);
    if (!next.done) return false;
    this.buildTask = null;
    const world = this.terrain?.world;
    if (!this.strokeGeometry || !this.style || world !== task.world || world.generation !== task.generation ||
        world.generation?.version !== task.version || this.regionGeometry !== task.region ||
        this.regionInside !== task.inside || this.styleKey !== task.styleKey) {
      this.dirty = true;
      return false;
    }
    const beforeCommit = clock();
    this.stats.segments = buildStrokeGeometry(next.value.chains, this.strokeGeometry, next.value.packed);
    this.strokes.visible = true;
    this.stats.chains = next.value.chains.length;
    this.stats.builds++;
    this.stats.lastBuildMs = task.cpuMs + clock() - beforeCommit;
    this.stats.lastWallMs = clock() - task.startedAt;
    this.stats.lastMaxSliceMs = Math.max(task.maxSliceMs, clock() - started);
    this.lastBuild = clock();
    return true;
  }
  rebuild() {
    this.cancelBuild();
    this.startBuild();
    return this.advanceBuild(Infinity);
  }
  /** 每帧：视图参数 + 脏区节流重建。 */
  frame(view) {
    if (!this.style || !this.hull) return;
    this.resolution.value.set(view.width || 1440, view.height || 900);
    const ppu = view.pixelsPerUnit || 4;
    this.strokeMaterial.uniforms.pixelsPerUnit.value = ppu;
    // 近景提按更明显，远景线条收细。
    const zoomK = 0.62 + 0.38 * Math.min(1, Math.max(0, (ppu - 1.2) / 6));
    this.hullMaterial.uniforms.widthPx.value = (this.style.contour?.width ?? 2) * zoomK;
    this.strokeMaterial.uniforms.widthPx.value = (this.style.width ?? 2) * zoomK;
    const now = globalThis.performance?.now?.() ?? Date.now();
    // 雕刻进行中不重建拓扑（顶点高度已在 GPU 上逐帧跟随）；停笔 180 ms 后重建一次，
    // 长时间连续拖动时最多每 1.2 s 追一次，避免每帧 CPU 提取造成长帧。
    if (this.buildTask && (this.terrain.world !== this.buildTask.world ||
        this.terrain.world.generation !== this.buildTask.generation ||
        this.terrain.world.generation?.version !== this.buildTask.version)) {
      this.cancelBuild(); this.dirty = true;
    }
    if (!this.buildTask && this.dirty &&
        (now - (this.lastDirtyAt ?? -1e9) > 180 || now - this.lastBuild > 1200)) this.startBuild(now);
    if (this.buildTask) this.advanceBuild(3);
  }
  dispose() {
    this.cancelBuild();
    this.strokeGeometry?.dispose(); this.strokeMaterial?.dispose(); this.hullMaterial?.dispose();
    this.group.removeFromParent(); this.group.clear(); this.group.visible = false;
    this.hull = this.strokes = this.strokeGeometry = this.strokeMaterial = this.hullMaterial = null;
    this.resolution = this.style = this.styleKey = null; this.dirty = true;
  }
}
