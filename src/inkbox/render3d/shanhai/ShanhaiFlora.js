import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * V1.1 · 山海成卷 — 图形化林木母版与三渲二林木材质（纯表现）。
 *
 * 母版：每个 LOD 几何里同时放「阔叶（点叶团簇）」与「松（层叠松针盘）」两套形体，
 * 顶点属性 `aSpecies` 标记归属；顶点着色器按实例世界位置的稳定哈希 + 海拔选择其一，
 * 另一套退化为零面积。因此沿用 VegetationLayer 既有的 3 个 LOD 批次、实例数、
 * 拾取 / Region / LOD 预算全部不变。
 *
 * 材质：两条受光笔边（受光 / 中间 / 背光）的平涂；树冠颜色由世界坐标的低频
 * 斑块决定（中远景形成成片色块，而非逐棵噪点）；同一材质的 BackSide 外壳负责
 * 有粗细的墨线轮廓，并随屏幕尺度淡出。
 */
const tmpColor = new THREE.Color();
function tag(geometry, species, part, color) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  for (const key of Object.keys(g.attributes)) if (!['position', 'normal'].includes(key)) g.deleteAttribute(key);
  const n = g.attributes.position.count;
  g.setAttribute('aSpecies', new THREE.Float32BufferAttribute(new Float32Array(n).fill(species), 1));
  g.setAttribute('aPart', new THREE.Float32BufferAttribute(new Float32Array(n).fill(part), 1));
  tmpColor.set(color);
  const c = new Float32Array(n * 3); for (let i = 0; i < n; i++) c.set([tmpColor.r, tmpColor.g, tmpColor.b], i * 3);
  g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
  return g;
}
const at = (g, x, y, z, sx = 1, sy = 1, sz = 1, ry = 0, rz = 0) => {
  g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, rz)), new THREE.Vector3(sx, sy, sz)));
  return g;
};
// Lumpy clump: icosphere whose radius wobbles; flattened bottom like a painted 点叶 mass.
function clump(r, detail, seed) {
  const g = new THREE.IcosahedronGeometry(r, detail), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 1 + 0.10 * Math.sin(x * 9.1 + seed) * Math.cos(z * 7.3 + seed * 1.7);
    p.setXYZ(i, x * k, (y < 0 ? y * 0.45 : y) * k, z * k);
  }
  // Spherical normals: smooth toon bands over the clump instead of faceted triangles.
  const nrm = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) { const v = new THREE.Vector3(p.getX(i), p.getY(i) * 1.4, p.getZ(i)).normalize(); nrm.set([v.x, v.y, v.z], i * 3); }
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3)); return g;
}
// Drooping pine tier: shallow 7-sided cone with sagging rim (松针盘).
function tier(r, h, sides = 7) {
  const g = new THREE.ConeGeometry(r, h, sides, 1, false), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) if (p.getY(i) < 0) p.setY(i, p.getY(i) - r * 0.18 * (0.6 + 0.4 * Math.sin(i * 2.3)));
  g.computeVertexNormals(); return g;
}
const TRUNK = '#5B4A3A', LEAF_A = '#7FA06A', LEAF_B = '#4E7A63';

function broadleaf(lod) {
  const L = [];
  if (lod === 2) { L.push(tag(at(clump(0.55, 1, 2), 0, 1.0, 0, 1.0, 0.85, 1.0), 0, 1, LEAF_A)); return L; }
  L.push(tag(at(new THREE.CylinderGeometry(0.035, 0.07, 0.95, 5), 0.02, 0.47, 0, 1, 1, 1, 0, -0.08), 0, 0, TRUNK));
  if (lod === 0) {
    L.push(tag(at(new THREE.CylinderGeometry(0.018, 0.03, 0.42, 4), 0.16, 0.86, 0, 1, 1, 1, 0, -0.9), 0, 0, TRUNK));
    for (const [x, y, z, r, s] of [[-0.20, 0.98, 0.04, 0.36, 1], [0.24, 1.06, -0.02, 0.33, 2], [0.02, 1.30, 0.02, 0.32, 3], [0.05, 0.92, -0.24, 0.26, 4]])
      L.push(tag(at(clump(r, 1, s), x, y, z, 1.08, 0.80, 1.0), 0, 1, s === 3 ? LEAF_A : LEAF_B));
  } else {
    L.push(tag(at(clump(0.48, 1, 1), 0.0, 1.08, 0, 1.05, 0.78, 1.0), 0, 1, LEAF_A));
  }
  return L;
}
function pine(lod) {
  const L = [];
  if (lod === 2) { L.push(tag(at(new THREE.ConeGeometry(0.42, 1.25, 5), 0, 1.02, 0), 1, 1, LEAF_B)); return L; }
  L.push(tag(at(new THREE.CylinderGeometry(0.03, 0.065, 1.35, 5), 0, 0.67, 0, 1, 1, 1, 0, 0.05), 1, 0, TRUNK));
  const tiers = lod === 0 ? [[0.74, 0.50, 0.24], [1.02, 0.42, 0.20], [1.26, 0.33, 0.17], [1.46, 0.22, 0.14]] : [[0.86, 0.48, 0.30], [1.24, 0.30, 0.26]];
  tiers.forEach(([y, r, h], i) => L.push(tag(at(tier(r, h, lod === 0 ? 8 : 6), (i % 2 ? 0.05 : -0.04), y, (i % 2 ? -0.03 : 0.03), 1.25, 1, 1.0, i * 0.7), 1, 1, i % 2 ? LEAF_B : LEAF_A)));
  return L;
}
/** Three LOD geometries, each holding both species. */
export function createShanhaiTreeLODs() {
  return [0, 1, 2].map(lod => {
    const g = mergeGeometries([...broadleaf(lod), ...pine(lod)], false);
    g.name = `ShanhaiTree:LOD${lod}`; g.computeBoundingBox(); g.computeBoundingSphere();
    g.userData.triangles = g.attributes.position.count / 3;
    return g;
  });
}

const VERT = /* glsl */`
  attribute float aSpecies; attribute float aPart;
  uniform float uOutline, uOutlineWidth, uPixels, uPineLevel;
  varying vec3 vColor; varying vec3 vN; varying vec3 vW; varying float vPart; varying float vOutlineFade; varying vec3 vTint;
  float h21(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 15731.743); }
  void main() {
    vec4 local = vec4(position, 1.0); vec3 n = normal;
    vec3 origin = vec3(0.0); float scale = 1.0;
    #ifdef USE_INSTANCING
      origin = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
      scale = length(instanceMatrix[1].xyz);
    #endif
    // Species: stable world-position hash biased toward pines on high ground.
    float pineChance = clamp(0.22 + smoothstep(uPineLevel - 6.0, uPineLevel + 10.0, origin.y) * 0.62, 0.0, 0.9);
    float isPine = step(h21(floor(origin.xz * 3.0) + 0.5), pineChance);
    float keep = 1.0 - abs(aSpecies - isPine);
    float px = uPixels * scale;
    vOutlineFade = smoothstep(5.0, 18.0, px);
    if (uOutline > 0.5) {
      // Constant-ish screen width; thicker on the crown than on the trunk.
      float w = uOutlineWidth * mix(0.55, 1.0, aPart) * clamp(26.0 / max(px, 1.0), 0.35, 1.6);
      local.xyz += normalize(n) * w;
    }
    local.xyz *= keep;
    vec4 wp = vec4(0.0);
    #ifdef USE_INSTANCING
      wp = modelMatrix * instanceMatrix * local;
      mat3 im = mat3(instanceMatrix);
      n = im * (n / max(vec3(1e-6), vec3(dot(im[0], im[0]), dot(im[1], im[1]), dot(im[2], im[2]))));
    #else
      wp = modelMatrix * local;
    #endif
    vW = wp.xyz; vN = normalize(mat3(modelMatrix) * n); vPart = aPart; vColor = color;
    vTint = vec3(1.0);
    #ifdef USE_INSTANCING_COLOR
      vTint = instanceColor;
    #endif
    // Forest patches: neighbouring trees share a low-frequency hue so masses read as 色块.
    gl_Position = projectionMatrix * viewMatrix * wp;
  }`;
const FRAG = /* glsl */`
  uniform float uOutline, uTintWeight, uOpacity;
  uniform vec3 uLeafLight, uLeafMid, uLeafDark, uLeafAccent, uTrunk, uInk, uPaper, uShadowCool, uFogColor;
  uniform float uFogNear, uFogFar, uFogStrength, uAccentAmt;
  varying vec3 vColor; varying vec3 vN; varying vec3 vW; varying float vPart; varying float vOutlineFade; varying vec3 vTint;
  float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
    return mix(mix(h21(i),h21(i+vec2(1,0)),f.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x),f.y); }
  void main() {
    if (uOutline > 0.5) {
      if (vOutlineFade < 0.02) discard;
      gl_FragColor = vec4(mix(uFogColor, uInk, vOutlineFade * 0.92), 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      return;
    }
    vec3 N = normalize(vN);
    vec3 L = normalize(vec3(-0.45, 0.82, -0.36));
    float ndl = dot(N, L);
    float patchN = vnoise(vW.xz * 0.075 + 3.0);
    float patch2 = vnoise(vW.xz * 0.19 + 11.0);
    vec3 leaf = mix(uLeafMid, uLeafLight, smoothstep(0.35, 0.70, patchN));
    leaf = mix(leaf, uLeafDark, smoothstep(0.62, 0.85, patch2) * 0.55);
    leaf = mix(leaf, uLeafAccent, smoothstep(0.84, 0.95, patchN * 0.6 + patch2 * 0.4) * uAccentAmt);
    leaf = mix(leaf, vTint, uTintWeight);
    leaf = mix(leaf, vColor * dot(leaf, vec3(0.333)) / max(dot(vColor, vec3(0.333)), 0.01), 0.18);
    vec3 base = mix(uTrunk, leaf, vPart);
    // Two brush edges: 受光 / 中间 / 背光.
    float lit = smoothstep(0.42, 0.50, ndl), mid = smoothstep(-0.05, 0.05, ndl);
    vec3 shadow = mix(base * 0.62, uShadowCool, 0.22);
    vec3 col = mix(shadow, base * 0.86, mid);
    col = mix(col, mix(base, uPaper, 0.10), lit);
    float fog = smoothstep(uFogNear, uFogFar, distance(cameraPosition, vW)) * uFogStrength;
    col = mix(col, uFogColor, fog);
    gl_FragColor = vec4(col, uOpacity);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

export const FLORA_PALETTES = Object.freeze({
  mortal: { light: '#A7BE78', mid: '#6E9864', dark: '#3F6656', accent: '#C9925A', trunk: '#5B4A3A', ink: '#2B2925', paper: '#EDE5D1', cool: '#36505A', fog: '#E9E2D0', accentAmt: 0.55, tint: 0.25, pine: 14, outline: 0.030 },
  upper: { light: '#8CB394', mid: '#4C8A6E', dark: '#2C6A6C', accent: '#C3A25B', trunk: '#6B523C', ink: '#24333A', paper: '#F0E8D4', cool: '#2C5466', fog: '#F2ECDD', accentAmt: 0.75, tint: 0.0, pine: 10, outline: 0.030 },
  nether: { light: '#BDB7AA', mid: '#5A5650', dark: '#151413', accent: '#9C3A2E', trunk: '#151413', ink: '#0B0A09', paper: '#ECE6DA', cool: '#141312', fog: '#E4DED2', accentAmt: 0.18, tint: 0.0, pine: -40, outline: 0.040 },
});

export function createShanhaiTreeMaterial(plane = 'mortal', { outline = false } = {}) {
  const pal = FLORA_PALETTES[plane] || FLORA_PALETTES.mortal;
  const material = new THREE.ShaderMaterial({
    vertexColors: true,
    uniforms: {
      uOutline: { value: outline ? 1 : 0 }, uOutlineWidth: { value: pal.outline }, uPixels: { value: 30 }, uPineLevel: { value: pal.pine },
      uTintWeight: { value: pal.tint }, uOpacity: { value: 1 },
      uLeafLight: { value: new THREE.Color(pal.light) }, uLeafMid: { value: new THREE.Color(pal.mid) }, uLeafDark: { value: new THREE.Color(pal.dark) },
      uLeafAccent: { value: new THREE.Color(pal.accent) }, uTrunk: { value: new THREE.Color(pal.trunk) }, uInk: { value: new THREE.Color(pal.ink) },
      uPaper: { value: new THREE.Color(pal.paper) }, uShadowCool: { value: new THREE.Color(pal.cool) }, uFogColor: { value: new THREE.Color(pal.fog) },
      uFogNear: { value: 400 }, uFogFar: { value: 1400 }, uFogStrength: { value: 0.16 }, uAccentAmt: { value: pal.accentAmt },
    },
    vertexShader: VERT, fragmentShader: FRAG,
    side: outline ? THREE.BackSide : THREE.FrontSide,
  });
  material.name = outline ? `ShanhaiTreeInk:${plane}` : `ShanhaiTree:${plane}`;
  material.userData.plane = plane;
  return material;
}
export function setShanhaiTreeView(material, view = {}) {
  if (!material) return;
  if (Number.isFinite(view.pixelsPerUnit)) material.uniforms.uPixels.value = view.pixelsPerUnit * 1.5;
  const cam = view.camera;
  if (cam?.isOrthographicCamera) {
    // Orthographic: fog keyed to distance along the view, scaled to the scene span.
    const span = (cam.top - cam.bottom) / Math.max(1e-3, cam.zoom);
    const d = cam.position.length();
    material.uniforms.uFogNear.value = d - span * 0.1; material.uniforms.uFogFar.value = d + span * 1.4;
  }
}
