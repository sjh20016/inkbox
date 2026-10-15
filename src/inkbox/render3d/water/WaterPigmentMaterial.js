import * as THREE from 'three';

const vertexShader = `
varying vec3 vWorld;
void main() {
  vec4 p = modelMatrix * vec4(position, 1.0);
  vWorld = p.xyz;
  gl_Position = projectionMatrix * viewMatrix * p;
}`;

/**
 * M2-C2D P1 · 连续绘画水面。
 *
 * 几何 / 网格拓扑 / Region 遮罩完全沿用 WaterLayer 现状；这里只替换材质语言：
 *   · 水深来自 Stage 的 SurfaceVisualFieldTexture（连续标量，LinearFilter）；
 *   · 海面主体向纸色靠拢，只混极淡花青；浅水更贴近纸；
 *   · 岸线透明度 / 颜色走 smoothstep + fwidth 抗锯齿，不出硬格边；
 *   · 水纹只取世界坐标程序化稀疏笔触，绝不把海面重新填满；
 *   · 干燥格（水网藏在地形下的部分）alpha = 0，不改变任何可见关系。
 */
const fragmentShader = `
uniform sampler2D surfaceTexture;
uniform float surfaceDepthRef;
uniform vec2 mapSize;
uniform float seed;
uniform float artDebugMode;
uniform vec3 paperColor, waterColor, inkColor;
uniform vec3 tint;
uniform float opacityDeep, paperStrength, rippleStrength, shoreSoftness;
uniform float pixelsPerUnit;
varying vec3 vWorld;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1,311.7)) + seed) * 43758.5453); }
float noise(vec2 p) {
  vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);
}
void main() {
  vec2 p=vWorld.xz+(mapSize-1.0)*0.5;
  vec2 uv=(clamp(p,vec2(0.0),mapSize-1.0)+0.5)/mapSize;
  float depth=texture2D(surfaceTexture,uv).r*surfaceDepthRef;
  float aa=max(fwidth(depth)*1.5,0.004);
  // 连续岸线：从干到湿是 smoothstep，不再是格子阶跃。
  float wet=smoothstep(0.0,aa+0.006*shoreSoftness,depth);
  if(wet<=0.001)discard;
  float deep=smoothstep(0.0,surfaceDepthRef*0.7,depth);
  // A negative form still has a readable body: paper with 20–35% hua-qing
  // in deep water; the shallow edge approaches paper with a lower opacity.
  float deepMix=clamp((1.0-paperStrength)*0.60,0.20,0.35);
  vec3 color=mix(paperColor,waterColor,mix(0.07,deepMix,deep));
  // Long broken horizontal marks in world X, with a slow Z warp. Screen-space
  // derivatives antialias the narrow line; projected scale only fades detail.
  float warp=noise(p*0.075+vec2(3.7,seed*0.01));
  float phase=p.y*1.35+warp*0.85;
  float line=1.0-smoothstep(0.025,0.025+max(fwidth(phase)*0.7,0.028),abs(fract(phase)-0.5));
  float broken=smoothstep(0.64,0.84,noise(vec2(p.x*0.10,p.y*0.35)+9.2));
  float detail=smoothstep(4.5,11.0,pixelsPerUnit);
  float ripple=line*broken*detail*smoothstep(0.02,0.10,depth);
  color=mix(color,inkColor,ripple*rippleStrength*0.10);
  // Paper-like water must cover the sea-floor marks rather than reveal a
  // second grey terrain. Shallowness lightens both pigment and coverage.
  float alpha=wet*mix(opacityDeep*0.75,opacityDeep,deep);
  if(artDebugMode>0.5&&abs(artDebugMode-2.0)>0.1)color=paperColor;
  gl_FragColor=vec4(color*tint,alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class WaterPigmentMaterial extends THREE.ShaderMaterial {
  constructor(world, surfaceField, profile) {
    super({ vertexShader, fragmentShader, transparent: true, depthWrite: false, side: THREE.FrontSide, uniforms: {
      surfaceTexture: { value: surfaceField?.texture ?? null },
      surfaceDepthRef: { value: surfaceField?.depthReference ?? 0.5 },
      mapSize: { value: new THREE.Vector2(world.w, world.h) },
      seed: { value: (world.seed >>> 0) % 8191 },
      artDebugMode: { value: 0 },
      paperColor: { value: new THREE.Color('#ECE4D2') },
      waterColor: { value: new THREE.Color('#8FB5B8') },
      inkColor: { value: new THREE.Color('#303533') },
      tint: { value: new THREE.Color('#ffffff') },
      opacityDeep: { value: 0.43 },
      paperStrength: { value: 0.5 },
      rippleStrength: { value: 0.6 },
      shoreSoftness: { value: 1.0 },
      pixelsPerUnit: { value: 2 },
    } });
    this.name = 'Inkbox:WaterPigment';
    // 与 legacy MeshBasicMaterial 同名通道：外部只按 .color / .opacity 读写。
    this.color = this.uniforms.tint.value;
    if (profile) this.setProfile(profile);
  }
  setSurfaceField(field) {
    this.uniforms.surfaceTexture.value = field?.texture ?? null;
    this.uniforms.surfaceDepthRef.value = field?.depthReference ?? 0.5;
  }
  setProfile(profile) {
    const style = profile.realmStyle, u = this.uniforms;
    u.paperColor.value.set(profile.paperColor ?? style?.paper.color ?? '#ECE4D2');
    if (style) {
      u.waterColor.value.set(style.water.color);
      u.inkColor.value.set(style.ink.color);
      u.opacityDeep.value = style.water.opacity;
      u.paperStrength.value = style.water.paperStrength ?? 0.5;
      u.rippleStrength.value = style.water.rippleStrength ?? 0.6;
      u.shoreSoftness.value = style.water.shoreSoftness ?? 1.0;
    }
  }
}
