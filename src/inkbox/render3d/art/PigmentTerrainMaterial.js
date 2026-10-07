import * as THREE from 'three';
import { TERRAIN_INFO } from '../../core/config.js';
import { realmStyleFor } from './RealmStyleProfile.js';

const vertexShader = `
varying vec3 vWorld;
void main() {
  vec4 p = modelMatrix * vec4(position, 1.0);
  vWorld = p.xyz;
  gl_Position = projectionMatrix * viewMatrix * p;
}`;

const fragmentShader = `
uniform sampler2D heightTexture;
uniform sampler2D typeTexture;
uniform sampler2D fieldTexture;
uniform float fieldMode;
uniform float artDebugMode;
uniform sampler2D surfaceTexture;
uniform float surfaceMode, surfaceDepthRef;
uniform float massShadeStrength, deepInkStrength, heightWashStrength, broadRadius;
uniform vec3 fieldInkColor, fieldColdColor;
uniform vec3 fieldMineralBlue, fieldMineralGreen, fieldMineralGold;
uniform vec2 mapSize;
uniform float seed;
uniform vec3 palette[23];
uniform vec3 paperColor;
uniform float pigmentDensity, pigmentSaturation, terrainBoundaryStrength;
uniform float structuralInkStrength, silhouetteInkStrength, inkDensity;
uniform float dryBrushStrength, distanceFade, paperGrainStrength, pixelsPerUnit;
uniform float realmStyleEnabled, slopeRampStrength, realmContrast, paperExposure;
uniform float colorLayerStrength;
uniform float feibaiStrength, atmosphereStrength, atmosphereLow, atmosphereHigh;
uniform vec3 slopeRockColor, slopeSoilColor, terrainWaterColor, realmInkColor, atmosphereColor;
varying vec3 vWorld;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1,311.7)) + seed) * 43758.5453); }
float noise(vec2 p) {
  vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);
}
vec2 uvAt(vec2 p) { return (clamp(floor(p+0.5),vec2(0),mapSize-1.0)+0.5)/mapSize; }
float hAt(vec2 p) { return texture2D(heightTexture,uvAt(p)).g; }
float typeAt(vec2 p) { return floor(texture2D(typeTexture,uvAt(p)).r*255.0+0.5); }
float fieldAt(vec2 p) { return texture2D(fieldTexture,(clamp(p,vec2(0),mapSize-1.0)+0.5)/mapSize).r; }
float surfaceDepthAt(vec2 p) {
  return texture2D(surfaceTexture,(clamp(p,vec2(0.0),mapSize-1.0)+0.5)/mapSize).r*surfaceDepthRef;
}
float shorelineMask(vec2 p,float centerDepth) {
  float left=surfaceDepthAt(p-vec2(1.0,0.0)), right=surfaceDepthAt(p+vec2(1.0,0.0));
  float down=surfaceDepthAt(p-vec2(0.0,1.0)), up=surfaceDepthAt(p+vec2(0.0,1.0));
  float minDepth=min(centerDepth,min(min(left,right),min(down,up)));
  float maxDepth=max(centerDepth,max(max(left,right),max(down,up)));
  // A shoreline requires wet AND dry samples AND a local transition. A dry
  // plain, a dry mountain and a uniformly shallow pool all have zero weight.
  float hasWet=smoothstep(0.002,0.016,maxDepth);
  float hasDry=1.0-smoothstep(0.001,0.006,minDepth);
  float gradient=smoothstep(0.003,0.016,maxDepth-minDepth);
  float centerWet=smoothstep(0.002,0.016,centerDepth);
  float shallow=1.0-smoothstep(0.06,0.22,centerDepth);
  return hasWet*hasDry*gradient*mix(1.0,shallow,centerWet);
}
void main() {
  vec2 p=vWorld.xz+(mapSize-1.0)*0.5;
  vec2 warp=vec2(noise(p*0.19),noise(p*0.19+17.3))-0.5;
  vec2 q=p+warp*0.65;
  float id=typeAt(q);
  vec3 pigment=palette[int(clamp(id,0.0,22.0))];
  float lum=dot(pigment,vec3(0.2126,0.7152,0.0722));
  pigment=mix(vec3(lum),pigment,pigmentSaturation);
  float h=hAt(p), l=hAt(p-vec2(1,0)), r=hAt(p+vec2(1,0));
  float d=hAt(p-vec2(0,1)), u=hAt(p+vec2(0,1));
  float slope=length(vec2(r-l,u-d))*0.5;
  float curvature=l+r+d+u-4.0*h;
  // M2-C2D P2：绘画用低频高度法线——「大山势」只看低频邻域，
  // 真实高频 slope/curvature 继续留给结构墨、局部皴与飞白（「小笔触」）。
  // heightTexture .g 已经是舞台高程（世界 Y 单位），格距为 1。
  float R=max(broadRadius,1.0);
  float bl=hAt(p-vec2(R,0.0)), br=hAt(p+vec2(R,0.0));
  float bd=hAt(p-vec2(0.0,R)), bu=hAt(p+vec2(0.0,R));
  vec3 broadN=normalize(vec3(bl-br,2.0*R,bd-bu));
  // Ridge / valley are distinct signed structural measurements, not N dot V.
  float ridge=smoothstep(0.16,1.7,-curvature);
  float valley=smoothstep(0.22,2.0,curvature)*0.58;
  float breakInk=smoothstep(1.2,3.8,slope)*smoothstep(0.30,1.8,abs(curvature));
  float nearDetail=smoothstep(0.8,5.5,pixelsPerUnit);
  float distant=mix(1.0,0.30,distanceFade*(1.0-nearDetail));
  float wash=noise(p*0.12+vec2(5.7,9.1));
  float water=1.0-step(3.5,id);
  // The Stage-owned depth field stays continuous; only wet/dry transitions
  // receive coast wash. Zero depth by itself does not imply a coastline.
  float coastSoft=0.0, wd=0.0;
  if(surfaceMode>0.5){
    wd=surfaceDepthAt(p);
    coastSoft=shorelineMask(p,wd);
  }
  // The scalar comes from this Stage's World. Large masses stay attached to
  // actual river/type/height structure; ghosts do not drive persistent layout.
  float scalar=0.0;
  if(fieldMode>0.5)scalar=fieldAt(p)*0.6+fieldAt(p+vec2(3,0))*0.2+fieldAt(p+vec2(0,3))*0.2;
  pigment=mix(pigment,terrainWaterColor,water*0.22);
  float rock=step(12.5,id)*(1.0-step(16.5,id));
  float forest=step(6.5,id)*(1.0-step(8.5,id));
  if (realmStyleEnabled > 0.5) {
    pigment=mix(pigment,slopeRockColor,rock*smoothstep(0.18,1.8,slope)*slopeRampStrength);
    pigment=mix(pigment,slopeSoilColor,(1.0-rock)*(1.0-water)*smoothstep(0.55,2.2,slope)*slopeRampStrength*0.26);
  }
  float coverage=mix(0.20,0.64,smoothstep(0.25,0.8,wash));
  coverage+=water*0.10+forest*0.12+rock*smoothstep(0.15,1.5,slope)*0.16;
  float density=clamp(pigmentDensity*coverage*distant,0.0,0.85);
  // Absorption rather than a LUT: unpainted areas stay at the chosen paper value.
  vec3 color=paperColor*exp(-density*(vec3(1.0)-pigment)*2.9);
  if (realmStyleEnabled > 0.5 && colorLayerStrength > 0.0) {
    // A mineral colour layer follows existing terrain pigment coverage. It adds
    // no topology, texture tap or noise pass; unpainted valleys retain the paper.
    float colorCoverage=clamp((coverage-0.12)*1.45,0.0,0.85);
    color=mix(color,pigment,colorLayerStrength*colorCoverage);
  }
  vec3 debugBase=color;
  vec3 debugMass=paperColor;
  float debugDeep=0.0;
  float boundary=max(abs(id-typeAt(q+vec2(0.38,0))),abs(id-typeAt(q+vec2(0,0.38))));
  float edge=min(1.0,boundary)*terrainBoundaryStrength*0.16*distant*(1.0-coastSoft*0.75);
  float sparse=smoothstep(1.0-inkDensity,1.13-inkDensity,noise(p*0.23+3.0));
  float dryNoise=noise(p*2.1+9.0);
  float dry=mix(1.0,smoothstep(0.24,0.58,dryNoise),dryBrushStrength*nearDetail);
  float structure=max(max(ridge,valley),breakInk)*smoothstep(0.10,0.65,slope);
  float ink=structure*sparse*dry*structuralInkStrength*distant;
  // M2-C2D P2：silhouette / facing 改吃绘画用低频法线（broadN），
  // 不再直接受真实三角面 dFdx/dFdy 影响 ⇒ 近景不再一片片竖直三角形抢明暗。
  // ⚠️ 范围要比 legacy 的窄带**放宽**：低频法线是平滑的，若只在「几乎掠射」
  //    的窄带里入墨，暗端面积会大幅缩水、明度跨度反而变窄。放宽到
  //    「背向视线的整块形体」，才既能去掉三角面噪点、又撑得住暗端。
  float facing=abs(dot(broadN,normalize(cameraPosition-vWorld)));
  float silhouette=smoothstep(0.58,0.05,facing)*silhouetteInkStrength*nearDetail;
  float inkAmount=clamp(ink*0.72+edge+silhouette*0.4,0.0,0.82);
  float clearQi=fieldMode>0.5&&fieldMode<1.5?smoothstep(0.42,0.97,scalar):0.0;
  inkAmount*=1.0-clearQi*0.35;
  if (realmStyleEnabled > 0.5) {
    color=mix(color,realmInkColor,inkAmount);
    // ── M2-C2D P2 明度骨架（低频主光的两面）────────────────────────────
    // 同一束世界锚定主光，在「绘画用低频法线」上分两面：
    //   受光面回纸（留白 / 亮部），背光面入墨（大山势 / 暗部）。
    // 两面都只看低频 ⇒ 近景得到的是大山势的明暗，不是一片片三角面各自
    // 抢明暗；而且跨度是被「亮部 + 暗部」同时拉开的，不是只把山压黑。
    // ⚠️ 主光要**斜掠**（水平分量大于垂直分量）：几乎竖直的光会让所有朝上的
    //    地形都算「受光」，于是只剩回纸、没有暗部，明度跨度反而被压平。
    //    斜掠光才能在低频法线上真正分出受光面与背光面。
    // massMask 只让有坡度的位置参与，平地 / 水面不受这层影响。
    vec3 keyLight=normalize(vec3(-0.62,0.42,-0.66));
    float keyDot=dot(broadN,keyLight);
    float massMask=smoothstep(0.06,0.55,slope+length(vec2(br-bl,bd-bu))*0.6);
    float lit=smoothstep(0.34,0.98,keyDot);
    float shade=smoothstep(0.30,0.92,-keyDot);
    debugMass=mix(paperColor,realmInkColor,clamp(shade*massShadeStrength*massMask*1.10,0.0,0.75));
    color=mix(color,paperColor,clamp(lit*massShadeStrength*massMask*0.55,0.0,0.60));
    color=mix(color,realmInkColor,clamp(shade*massShadeStrength*massMask*1.10,0.0,0.75));
    // 深墨集中在山脊 / 沟谷 / 坡折等结构位置，不把整片山体一起压黑。
    // ⚠️ legacy 的 ridge / valley 阈值是按另一套高程尺度写的；在本项目当前
    //    高程下（高差约 0–60 世界 Y、格距 1），离散拉普拉斯量级只有 ±0.5
    //    左右，smoothstep(0.16,1.7,…) 这类判据几乎不触发，于是「深墨」在
    //    画面上基本是空的。这里按实际曲率量级另标定一条结构暗部，只在
    //    沟谷 / 坡折处压墨，让深墨真正落下来。
    float c2dCurv=abs(curvature);
    float c2dStruct=smoothstep(0.05,0.55,c2dCurv)*smoothstep(0.10,0.65,slope);
    float deep=structure*structure*deepInkStrength + c2dStruct*deepInkStrength;
    debugDeep=deep;
    color=mix(color,realmInkColor,clamp(deep,0.0,0.60));
    // 高峰按位面风格适度回纸色（幽冥 heightWash = 0，不参与）。
    float peak=smoothstep(atmosphereHigh,atmosphereHigh+20.0,vWorld.y)*heightWashStrength;
    color=mix(color,paperColor,peak);
    // 岸线连续烘染：沙岸 / 水岸 / 陆地之间的弱过渡。
    color=mix(color,mix(paperColor,terrainWaterColor,0.35),coastSoft*0.07);
    float feibai=smoothstep(0.73,0.91,dryNoise)*feibaiStrength*ink*nearDetail;
    color=mix(color,paperColor,feibai);
    float valleyWash=1.0-smoothstep(atmosphereLow,atmosphereHigh,vWorld.y);
    color=mix(color,atmosphereColor,valleyWash*atmosphereStrength);
    color=clamp((color-vec3(0.5))*realmContrast+vec3(0.5),0.0,1.0)*paperExposure;
  } else color*=1.0-inkAmount;
  if(fieldMode>1.5){
    // Natural decay can raise an already dense cell. Keep that upper range
    // responsive instead of flattening every value above 0.90 to one wash.
    float yin=smoothstep(0.35,1.0,scalar);
    float empty=(1.0-smoothstep(0.18,0.58,scalar))*(1.0-water);
    color=mix(color,paperColor,empty*0.46);
    vec3 coldInk=mix(fieldColdColor,fieldInkColor,0.42+0.18*rock);
    color=mix(color,coldInk,yin*(0.50-water*0.25));
    float bone=smoothstep(0.81,0.94,dryNoise)*yin*(0.02+rock*0.07);
    color=mix(color,paperColor,bone);
  }else if(fieldMode>0.5){
    float land=1.0-water;
    float clean=clearQi*land*(0.18+0.10*(1.0-smoothstep(0.5,2.2,slope)));
    color=mix(color,paperColor,clean);
    vec3 mineral=mix(fieldMineralGreen,fieldMineralBlue,rock);
    color=mix(color,mineral,clearQi*land*(0.07+0.15*rock));
    color=mix(color,fieldMineralGold,clearQi*ridge*land*0.07);
  }
  // Weak paper stays on the image; all wash / dry brush above stay in world space.
  float grain=hash(floor(gl_FragCoord.xy))-0.5;
  color*=1.0+grain*paperGrainStrength;
  // Uniform-only local diagnostics; zero follows the unchanged final path.
  if(artDebugMode>0.5){
    if(artDebugMode<1.5)color=debugBase;
    else if(artDebugMode<2.5){
      color=mix(paperColor,terrainWaterColor,coastSoft*0.90);
    }else if(artDebugMode<3.5)color=debugMass;
    else if(artDebugMode<4.5)color=mix(paperColor,realmInkColor,clamp(ink*0.72+edge+debugDeep,0.0,0.82));
    else color=mix(paperColor,atmosphereColor,(1.0-smoothstep(atmosphereLow,atmosphereHigh,vWorld.y))*atmosphereStrength)*(1.0+grain*paperGrainStrength);
  }
  gl_FragColor=vec4(color,1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class PigmentTerrainMaterial extends THREE.ShaderMaterial {
  constructor(data, profile) {
    const basePalette = TERRAIN_INFO.map(t => new THREE.Color(`rgb(${t.color.join(',')})`));
    super({ vertexShader, fragmentShader, side: THREE.DoubleSide, uniforms: {
      heightTexture: { value: data.heightTexture }, typeTexture: { value: data.typeTexture },
      fieldTexture: { value: data.typeTexture },fieldMode:{value:0},
      artDebugMode: { value: 0 },
      // PlaneStage may bind its continuous surface field before the terrain is rendered.
      // Keep the no-field fallback valid for legacy profiles and test-created stages.
      surfaceTexture: { value: data.typeTexture }, surfaceMode: { value: 0 }, surfaceDepthRef: { value: 0.5 },
      massShadeStrength: { value: 0 }, deepInkStrength: { value: 0 }, heightWashStrength: { value: 0 }, broadRadius: { value: 2.5 },
      fieldInkColor:{value:new THREE.Color(realmStyleFor('nether').ink.color)},
      fieldColdColor:{value:new THREE.Color(realmStyleFor('nether').pilotPalette.blue)},
      fieldMineralBlue:{value:new THREE.Color(realmStyleFor('upper').terrain.rock)},
      fieldMineralGreen:{value:new THREE.Color(realmStyleFor('upper').terrain.palette[13])},
      fieldMineralGold:{value:new THREE.Color(realmStyleFor('upper').pilotPalette.warm)},
      mapSize: { value: new THREE.Vector2(data.world.w, data.world.h) },
      seed: { value: (data.world.seed >>> 0) % 8191 },
      palette: { value: basePalette.map(color => color.clone()) },
      paperColor: { value: new THREE.Color(profile.paperColor) }, pixelsPerUnit: { value: 2 },
      realmStyleEnabled: { value: 0 }, slopeRampStrength: { value: 0 }, realmContrast: { value: 1 }, paperExposure: { value: 1 },
      colorLayerStrength: { value: 0 },
      feibaiStrength: { value: 0 }, atmosphereStrength: { value: 0 }, atmosphereLow: { value: -1 }, atmosphereHigh: { value: 1 },
      slopeRockColor: { value: new THREE.Color('#808080') }, slopeSoilColor: { value: new THREE.Color('#808080') },
      terrainWaterColor: { value: new THREE.Color().setRGB(0.30, 0.43, 0.46) },
      realmInkColor: { value: new THREE.Color('#202020') }, atmosphereColor: { value: new THREE.Color('#ffffff') },
    } });
    this.basePalette = basePalette;
    this.name = 'Inkbox:PigmentTerrain'; this.setProfile(profile);
  }
  setProfile(profile) {
    const style = profile.realmStyle;
    const u = this.uniforms;
    u.realmStyleEnabled.value = style ? 1 : 0;
    u.colorLayerStrength.value = style?.pigment.colorLayer || 0;
    const palette = style?.terrain.palette;
    for (let i = 0; i < 23; i++) {
      if (palette) u.palette.value[i].set(palette[i]);
      else u.palette.value[i].copy(this.basePalette[i]);
    }
    if (style) {
      u.slopeRockColor.value.set(style.terrain.rock);
      u.slopeSoilColor.value.set(style.terrain.soil);
      u.slopeRampStrength.value = style.terrain.slopeStrength;
      u.terrainWaterColor.value.set(style.water.color);
      u.realmInkColor.value.set(style.ink.color);
      u.feibaiStrength.value = style.ink.feibai;
      u.realmContrast.value = style.contrast;
      u.paperExposure.value = style.paper.exposure;
      u.atmosphereColor.value.set(style.atmosphere.color);
      u.atmosphereStrength.value = style.atmosphere.strength;
      u.atmosphereLow.value = style.atmosphere.low;
      u.atmosphereHigh.value = style.atmosphere.high;
    } else {
      u.terrainWaterColor.value.setRGB(0.30, 0.43, 0.46);
    }
    this.uniforms.paperColor.value.set(profile.paperColor);
    for (const key of ['massShadeStrength','deepInkStrength','heightWashStrength']) if (this.uniforms[key]) this.uniforms[key].value = profile[key] ?? 0;
    for (const key of ['pigmentDensity','pigmentSaturation','terrainBoundaryStrength','structuralInkStrength',
      'silhouetteInkStrength','inkDensity','dryBrushStrength','distanceFade','paperGrainStrength']) {
      if (this.uniforms[key]) this.uniforms[key].value = profile[key];
      else this.uniforms[key] = { value: profile[key] };
    }
  }
}
