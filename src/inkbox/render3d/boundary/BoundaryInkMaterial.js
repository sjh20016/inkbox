import * as THREE from 'three';

const vertexShader = `
attribute float aVertical;
attribute float aSeed;
varying vec3 vWorld;
varying vec3 vColor;
varying float vVertical;
varying float vSeed;
void main() {
  vec4 p = modelMatrix * vec4(position, 1.0);
  vWorld = p.xyz;
  vColor = color;
  vVertical = aVertical;
  vSeed = aSeed;
  gl_Position = projectionMatrix * viewMatrix * p;
}`;

/**
 * M2-C2D P3 · 界缘水墨断面。
 *
 * 几何契约（顶部 = target elevation、底部 = mortal elevation、每条边界边 1 quad、
 * zero-gap、picking 反查）**完全不动**——这里只换材质语言：
 *   · 世界坐标锚定的竖向层理；
 *   · 斧劈式干笔；
 *   · 底部向 atmosphere / paper 消隐；
 *   · 顶缘极窄的纸纤维 / 矿物亮带；
 *   · 少量不规则墨量变化。
 *
 * 顶点色仍由 RealmBoundaryLayer 按位面风格写入；这里只做调制，
 * 并在 `tint` 上保留 ArtPass 的 legacy 颜色通道语义。
 */
const fragmentShader = `
uniform vec3 tint;
uniform vec3 paperColor, atmosphereColor, inkColor, rimColor;
uniform float opacity;
uniform float seed;
uniform float strataStrength, dryBrushStrength, bottomFadeStrength, topBandStrength, inkVariation, boneStrength;
varying vec3 vWorld;
varying vec3 vColor;
varying float vVertical;
varying float vSeed;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1,311.7)) + seed + vSeed * 37.0) * 43758.5453); }
float noise(vec2 p) {
  vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);
}
void main() {
  vec3 color = vColor * tint;
  // 竖向层理：沿高度分层，水平方向只做轻微起伏——像岩层被竖着剖开。
  float layerNoise = noise(vec2(vWorld.y * 0.62 + vSeed * 11.0, (vWorld.x + vWorld.z) * 0.045));
  float strata = smoothstep(0.32, 0.78, layerNoise);
  color *= 1.0 - strata * strataStrength * 0.42;
  // 斧劈式干笔：竖向长笔，横向极窄，稀疏而非铺满。
  float brush = noise(vec2((vWorld.x + vWorld.z) * 0.075 + vSeed * 5.0, vWorld.y * 0.85));
  float dry = smoothstep(0.55, 0.86, brush);
  color = mix(color, inkColor, dry * dryBrushStrength * 0.30);
  // 不规则墨量：整条边一个大尺度起伏，避免每堵墙一个模子。
  float inkN = noise(vec2((vWorld.x - vWorld.z) * 0.021 + vSeed * 2.0, vSeed * 13.0));
  color = mix(color, inkColor, inkN * inkVariation * 0.22);
  // 底部向 atmosphere / paper 消隐：断面下缘不再是刀切边。
  float bottom = 1.0 - smoothstep(0.0, 0.42, vVertical);
  color = mix(color, mix(atmosphereColor, paperColor, 0.45), bottom * bottomFadeStrength);
  // 顶缘极窄的纸纤维 / 矿物亮带。
  float band = smoothstep(0.905, 0.985, vVertical) * (1.0 - smoothstep(0.985, 1.0, vVertical));
  color = mix(color, rimColor, band * topBandStrength);
  // 骨线：只在最深处留极细的浅色走向，避免大面积纯黑无层次。
  float bone = smoothstep(0.86, 0.985, noise(vec2(vWorld.y * 1.35 + vSeed * 7.0, (vWorld.x + vWorld.z) * 0.12)));
  color = mix(color, paperColor, bone * boneStrength * (1.0 - vVertical * 0.55));
  gl_FragColor = vec4(color, opacity);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/** 由 RealmBoundaryLayer 持有；几何 / 拾取属性不在这一层。 */
export function createBoundaryInkMaterial() {
  const material = new THREE.ShaderMaterial({
    vertexShader, fragmentShader,
    transparent: true, depthWrite: true, side: THREE.DoubleSide, vertexColors: true,
    uniforms: {
      tint: { value: new THREE.Color('#ffffff') },
      paperColor: { value: new THREE.Color('#ECE4D2') },
      atmosphereColor: { value: new THREE.Color('#D8CEB8') },
      inkColor: { value: new THREE.Color('#303533') },
      rimColor: { value: new THREE.Color('#F2EADA') },
      opacity: { value: 0.96 },
      seed: { value: 17 },
      strataStrength: { value: 0.30 },
      dryBrushStrength: { value: 0.34 },
      bottomFadeStrength: { value: 0.34 },
      topBandStrength: { value: 0.22 },
      inkVariation: { value: 0.20 },
      boneStrength: { value: 0.10 },
    },
  });
  material.name = 'Inkbox:BoundaryInk';
  // ArtPass 仍按 legacy 语义写 `material.color`；这里让它直接指向 tint uniform。
  material.color = material.uniforms.tint.value;
  return material;
}

/**
 * 把位面风格推给界缘材质。`null`（art=legacy / 关档）只保留极轻调制，
 * 让断面回到接近平板的顶点色，旧证据口径不被偷换。
 */
export function applyBoundaryInkStyle(material, realmStyle = null) {
  if (!material?.uniforms) return;
  const u = material.uniforms;
  if (!realmStyle) {
    u.paperColor.value.set('#ECE4D2'); u.atmosphereColor.value.set('#D8CEB8');
    u.inkColor.value.set('#303533'); u.rimColor.value.set('#F2EADA');
    u.strataStrength.value = 0.10; u.dryBrushStrength.value = 0.10;
    u.bottomFadeStrength.value = 0.12; u.topBandStrength.value = 0.08;
    u.inkVariation.value = 0.06; u.boneStrength.value = 0.02;
    return;
  }
  const ink = realmStyle.boundaryInk || {};
  u.paperColor.value.set(realmStyle.paper.color);
  u.atmosphereColor.value.set(realmStyle.atmosphere.color);
  u.inkColor.value.set(realmStyle.ink.color);
  u.rimColor.value.set(ink.rim || realmStyle.paper.color);
  u.strataStrength.value = ink.strata ?? 0.30;
  u.dryBrushStrength.value = ink.dryBrush ?? 0.34;
  u.bottomFadeStrength.value = ink.bottomFade ?? 0.34;
  u.topBandStrength.value = ink.topBand ?? 0.22;
  u.inkVariation.value = ink.inkVariation ?? 0.20;
  u.boneStrength.value = ink.bone ?? 0.10;
}
