import * as THREE from 'three';
import { visibleRift } from '../readers/riftViewModel.js';
import { RENDER_ORDER } from '../shared/RenderOrder.js';
import { INK_COLOR, PAPER, RIFT_GLOW } from './artConfig.js';

// 界缘（boundary skirt）：窗口边界上的"墨墙"。
//
// 几何：每条边界边一个独立 quad，4 个唯一顶点。顶点取自相邻两张网格的边界节点：
//   · 墙脚 = 凡间节点的真实 Y（M）；墙顶 = 目标界节点经 RimField 算出的墙顶 Y（R）。
//   两端因此与地形网格逐位重合，不会漏缝，也不需要任何插值。
// 着色：自写 ShaderMaterial（不依赖场景灯光，墙是"画"出来的而不是"照"出来的）：
//   地层色带 + 皴（干笔飞白）+ 与厚度成正比的地层线 + 两端墨线（毛边）+ 过厚处中段留白成云气
//   + 活跃裂缝处的青色微光与流动断线（与 Canvas 视界 drawRiftBorder 同一套语言）。
// 裂缝开口来自 `riftViewModel.visibleRift`（唯一的半径公式入口），本层不复制任何曲线。

const VERT = /* glsl */`
attribute float aV; attribute float aH; attribute float aBreach;
varying vec3 vW; varying float vV; varying float vH; varying float vB;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vW = wp.xyz; vV = aV; vH = aH; vB = aBreach;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const FRAG = /* glsl */`
uniform sampler2D uCun; uniform sampler2D uRamp; uniform sampler2D uEdge;
uniform vec3 uLight; uniform vec3 uInk; uniform vec3 uPaper; uniform vec3 uGlow;
uniform float uTime;
varying vec3 vW; varying float vV; varying float vH; varying float vB;
void main() {
  vec3 n = normalize(cross(dFdx(vW), dFdy(vW)));
  vec3 V = isOrthographic ? vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]) : normalize(cameraPosition - vW);
  if (dot(n, V) < 0.0) n = -n;
  float lam = clamp(dot(n, normalize(uLight)), 0.0, 1.0);
  float tone = floor(lam * 3.0 + 0.5) / 3.0;

  float s = vW.x + vW.z;                                   // 边界恒为轴对齐网格边：x+z 沿边单调
  float cun = texture2D(uCun, vec2(s * 0.085, vW.y * 0.040)).r;
  vec3 rock = texture2D(uRamp, vec2(clamp(vV, 0.0, 1.0), 0.5)).rgb;

  // 地层线：条数 ∝ 厚度；线位被皴扰动，像手画的而不是尺子划的。
  float bands = max(1.0, floor(vH / 5.0));
  float f = fract(vV * bands + (cun - 0.5) * 0.18);
  float seam = smoothstep(0.0, 0.07, f) * smoothstep(0.0, 0.07, 1.0 - f);
  rock *= mix(0.70, 1.0, seam);
  rock = mix(rock, rock * 0.52, cun * 0.50);               // 干笔
  rock *= 0.60 + 0.55 * tone;                              // 三档明暗

  // 两端墨线（毛边）：目标界一端更重。
  float wob = texture2D(uEdge, vec2(s * 0.055, 0.5)).r;
  float e0 = 0.045 + 0.050 * wob;
  float topInk = 1.0 - smoothstep(0.0, e0, 1.0 - vV);
  float footInk = 1.0 - smoothstep(0.0, e0 * 0.8, vV);
  rock = mix(rock, uInk, clamp(topInk * 0.92 + footInk * 0.70, 0.0, 1.0));

  // 过厚的墙中段化入云气：留白，只剩上下两道墨缘。
  float tall = smoothstep(14.0, 34.0, vH);
  float mid = pow(sin(clamp(vV, 0.0, 1.0) * 3.14159265), 1.4);
  rock = mix(rock, uPaper, tall * mid * (0.50 + 0.38 * (1.0 - cun)));

  // 裂缝：开口处青色微光 + 流动断线；开口外圈一层淡边。
  float open = smoothstep(0.34, 0.52, vB + (cun - 0.5) * 0.22);
  float flow = 0.5 + 0.5 * sin(s * 1.35 - uTime * 1.7);
  float dash = step(0.45, fract(s * 0.42 - uTime * 0.35));
  vec3 glow = uGlow * (0.78 + 0.32 * flow);
  rock = mix(rock, glow, open);
  rock += uGlow * 0.22 * smoothstep(0.20, 0.34, vB) * (1.0 - open) * (0.6 + 0.4 * dash);

  gl_FragColor = vec4(rock, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const tmpColor = new THREE.Color();
const asLinear = (hex) => { tmpColor.set(hex); return new THREE.Vector3(tmpColor.r, tmpColor.g, tmpColor.b); };

export class SkirtLayer {
  constructor({ assets, coordinates, light = new THREE.Vector3(-90, 160, -70) }) {
    this.assets = assets;
    this.coordinates = coordinates;
    this.root = new THREE.Group();
    this.root.name = 'SkirtLayer';
    this.root.visible = false;
    this.edgeCount = 0;
    this.window = null;
    this.uniforms = {
      uCun: { value: assets.get('cun') }, uEdge: { value: assets.get('edge') }, uRamp: { value: assets.get('ramp_upper') },
      uLight: { value: light.clone().normalize() }, uInk: { value: asLinear(INK_COLOR) },
      uPaper: { value: asLinear(PAPER) }, uGlow: { value: asLinear(RIFT_GLOW) }, uTime: { value: 0 },
    };
    this.material = new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: VERT, fragmentShader: FRAG, side: THREE.DoubleSide });
    this.mistMaterial = new THREE.PointsMaterial({
      map: assets.get('mist'), size: 10, sizeAttenuation: false, transparent: true, opacity: 0.55,
      depthWrite: false, color: '#f4efe2',
    });
    this.unsubscribe = assets.onChange(() => this.refreshTextures());
  }

  refreshTextures() {
    const u = this.uniforms, a = this.assets;
    u.uCun.value = a.get('cun'); u.uEdge.value = a.get('edge');
    u.uRamp.value = a.get(this.window?.targetPlane === 'nether' ? 'ramp_nether' : 'ramp_upper');
    this.mistMaterial.map = a.get('mist'); this.mistMaterial.needsUpdate = true;
  }

  /** 窗口（区域 / 目标界 / 数值）变化时调用：重建几何缓冲并填充一次。 */
  setWindow({ mask, rim, mortalField, targetPlane, mortalWorld }) {
    this.window = { mask, rim, mortalField, targetPlane, mortalWorld };
    if (mask.edgeCount !== this.edgeCount || !this.mesh) this.allocate(mask);
    this.refreshTextures();
    this.rebuildBreach();
    this.updateGeometry();
    this.root.visible = true;
  }

  allocate(mask) {
    this.disposeGeometry();
    const E = mask.edgeCount;
    this.edgeCount = E;
    const geometry = new THREE.BufferGeometry();
    const dyn = (arr, n) => new THREE.BufferAttribute(arr, n).setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('position', dyn(new Float32Array(E * 12), 3));
    geometry.setAttribute('aV', dyn(new Float32Array(E * 4), 1));
    geometry.setAttribute('aH', dyn(new Float32Array(E * 4), 1));
    geometry.setAttribute('aBreach', dyn(new Float32Array(E * 4), 1));
    const index = new Uint32Array(E * 6);
    for (let k = 0; k < E; k++) index.set([k * 4, k * 4 + 1, k * 4 + 2, k * 4 + 2, k * 4 + 1, k * 4 + 3], k * 6);
    geometry.setIndex(new THREE.BufferAttribute(index, 1));
    const aV = geometry.attributes.aV.array;
    for (let k = 0; k < E; k++) { aV[k * 4] = 1; aV[k * 4 + 1] = 0; aV[k * 4 + 2] = 1; aV[k * 4 + 3] = 0; }
    this.geometry = geometry;
    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = RENDER_ORDER.realmBoundary;
    this.root.add(this.mesh);

    const nodes = mask.rimNodes, count = Math.ceil(nodes.length / 2);
    const mist = new THREE.BufferGeometry();
    mist.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3).setUsage(THREE.DynamicDrawUsage));
    this.mistNodes = Int32Array.from({ length: count }, (_, i) => nodes[i * 2]);
    this.mistSeed = Float32Array.from({ length: count }, (_, i) => ((i * 2654435761) >>> 0) / 4294967296 * 6.2832);
    this.mistGeometry = mist;
    this.mistPoints = new THREE.Points(mist, this.mistMaterial);
    this.mistPoints.frustumCulled = false;
    this.mistPoints.renderOrder = RENDER_ORDER.fx;
    this.root.add(this.mistPoints);
  }

  /** 活跃裂缝 → 每个边界节点的开口强度。只读 world.rifts；半径一律走 visibleRift。 */
  rebuildBreach() {
    const { mask, targetPlane, mortalWorld } = this.window;
    const size = mask.w * mask.h;
    if (!this.breach || this.breach.length !== size) this.breach = new Float32Array(size);
    else this.breach.fill(0);
    const rifts = mortalWorld?.rifts;
    this.riftSignature = riftSignature(rifts);
    if (!Array.isArray(rifts)) return;
    for (const rift of rifts) {
      if (rift.targetPlane !== targetPlane) continue;
      const v = visibleRift(rift);
      if (!v) continue;
      const reach = v.radius + 0.8;
      for (const n of mask.rimNodes) {
        const d = Math.hypot((n % mask.w) - rift.x, ((n / mask.w) | 0) - rift.y);
        if (d >= reach) continue;
        const b = 1 - d / reach;
        if (b > this.breach[n]) this.breach[n] = b;
      }
    }
  }

  updateGeometry() {
    const { mask, rim, mortalField, mortalWorld } = this.window;
    const { edges } = mask, w = mask.w;
    const pos = this.geometry.attributes.position, aH = this.geometry.attributes.aH, aB = this.geometry.attributes.aBreach;
    const c = this.coordinates;
    for (let k = 0; k < this.edgeCount; k++) {
      for (let end = 0; end < 2; end++) {
        const x = edges[k * 4 + end * 2], y = edges[k * 4 + end * 2 + 1], n = y * w + x;
        const p = c.worldToRender(x, y, 0);
        const top = k * 4 + end * 2, bottom = top + 1;
        pos.setXYZ(top, p.x, rim.rimY[n], p.z);
        pos.setXYZ(bottom, p.x, rim.wallBase[n], p.z);
        aH.setX(top, rim.wallH[n]); aH.setX(bottom, rim.wallH[n]);
        aB.setX(top, this.breach[n]); aB.setX(bottom, this.breach[n]);
      }
    }
    pos.needsUpdate = aH.needsUpdate = aB.needsUpdate = true;
    this.geometry.computeBoundingSphere();

    const mp = this.mistGeometry.attributes.position;
    for (let i = 0; i < this.mistNodes.length; i++) {
      const n = this.mistNodes[i], x = n % w, y = (n / w) | 0;
      const p = c.worldToRender(x, y, 0);
      this.mistBase ||= new Float32Array(this.mistNodes.length);
      this.mistBase[i] = rim.wallBase[n] + (rim.rimY[n] - rim.wallBase[n]) * 0.55;
      mp.setXYZ(i, p.x, this.mistBase[i], p.z);
    }
    mp.needsUpdate = true;
    this.mistGeometry.computeBoundingSphere();
    void mortalField; void mortalWorld;
  }

  /** 每帧：时间、云气漂移与像素尺寸；裂缝列表变了才重算开口。 */
  tick(now, camera, viewportHeight) {
    if (!this.window || !this.root.visible) return;
    this.uniforms.uTime.value = now;
    const sig = riftSignature(this.window.mortalWorld?.rifts);
    if (sig !== this.riftSignature) { this.rebuildBreach(); this.updateGeometry(); }
    const mp = this.mistGeometry.attributes.position;
    for (let i = 0; i < this.mistNodes.length; i++) mp.setY(i, this.mistBase[i] + Math.sin(now * 0.45 + this.mistSeed[i]) * 0.9);
    mp.needsUpdate = true;
    if (camera?.isOrthographicCamera && viewportHeight) {
      const unitsPerPx = (camera.top - camera.bottom) / camera.zoom / viewportHeight;
      this.mistMaterial.size = Math.max(6, 14 / unitsPerPx);
    }
  }

  hide() { this.root.visible = false; this.window = null; }

  disposeGeometry() {
    if (this.mesh) { this.root.remove(this.mesh); this.geometry.dispose(); this.mesh = null; }
    if (this.mistPoints) { this.root.remove(this.mistPoints); this.mistGeometry.dispose(); this.mistPoints = null; }
    this.edgeCount = 0; this.mistBase = null;
  }

  dispose() {
    this.unsubscribe?.();
    this.disposeGeometry();
    this.material.dispose(); this.mistMaterial.dispose();
    this.root.removeFromParent();
  }
}

function riftSignature(rifts) {
  if (!Array.isArray(rifts) || !rifts.length) return '';
  let s = rifts.length + ':';
  for (const r of rifts) s += `${r.id}.${r.age | 0}.${r.closedDay}|`;
  return s;
}
