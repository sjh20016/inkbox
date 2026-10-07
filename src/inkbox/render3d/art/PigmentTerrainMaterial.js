import * as THREE from 'three';
import { TERRAIN_INFO } from '../../core/config.js';
import { realmStyleFor } from './RealmStyleProfile.js';

// Shared exact and visual sampling. The fragment keeps exact cell reads for
// Structure; Mass samples this continuous field once per existing grid vertex.
const heightSampling = `
vec2 uvAt(vec2 p) { return (clamp(floor(p+0.5),vec2(0),mapSize-1.0)+0.5)/mapSize; }
float hAt(vec2 p) { return texture2D(heightTexture,uvAt(p)).g; }
float sampleHeightContinuous(vec2 p) {
  vec2 c=clamp(p,vec2(0.0),mapSize-1.0), i=floor(c), f=fract(c);
  vec2 texel=1.0/mapSize, uv=(i+0.5)*texel;
  float a=texture2D(heightTexture,uv).g;
  // Grid vertices with an axis-aligned broad offset have one exact zero
  // weight. Skip only that unused row/column; arbitrary fractional probes
  // still use all four texels. No epsilon or nearest-sampling fallback.
  if(f.y==0.0){
    if(f.x==0.0)return a;
    return mix(a,texture2D(heightTexture,uv+vec2(texel.x,0.0)).g,f.x);
  }
  if(f.x==0.0)return mix(a,texture2D(heightTexture,uv+vec2(0.0,texel.y)).g,f.y);
  float b=texture2D(heightTexture,uv+vec2(texel.x,0.0)).g;
  float c0=texture2D(heightTexture,uv+vec2(0.0,texel.y)).g, d0=texture2D(heightTexture,uv+texel).g;
  return mix(mix(a,b,f.x),mix(c0,d0,f.x),f.y);
}
float sampleHeightBroad(vec2 p) { return sampleHeightContinuous(p); }
// These two-fetch helpers are only valid for integer grid vertices sampled at
// an axis-aligned offset: the orthogonal coordinate must remain integral.
// Keep arbitrary 2D fractional probes on sampleHeightContinuous instead.
float sampleHeightBroadX(vec2 p) {
  vec2 c=clamp(p,vec2(0.0),mapSize-1.0), i=floor(c), texel=1.0/mapSize;
  vec2 uv=(i+0.5)*texel, uvNext=(min(i+vec2(1.0,0.0),mapSize-1.0)+0.5)*texel;
  return mix(texture2D(heightTexture,uv).g,texture2D(heightTexture,uvNext).g,fract(c.x));
}
float sampleHeightBroadY(vec2 p) {
  vec2 c=clamp(p,vec2(0.0),mapSize-1.0), i=floor(c), texel=1.0/mapSize;
  vec2 uv=(i+0.5)*texel, uvNext=(min(i+vec2(0.0,1.0),mapSize-1.0)+0.5)*texel;
  return mix(texture2D(heightTexture,uv).g,texture2D(heightTexture,uvNext).g,fract(c.y));
}
`;

const vertexShader = `
uniform sampler2D heightTexture;
uniform vec2 mapSize;
uniform float broadRadius;
uniform float packedBroadRadius;
varying vec3 vWorld;
varying vec2 vBroadGradient;
${heightSampling}
void main() {
  vec4 p = modelMatrix * vec4(position, 1.0);
  vWorld = p.xyz;
  vec2 grid=p.xz+(mapSize-1.0)*0.5;
  float R=clamp(broadRadius,2.0,4.0);
  gl_Position = projectionMatrix * viewMatrix * p;
  // TerrainDataTextures owns B/A at exactly this radius. Manual textures and
  // dynamically retuned radii retain the axis-continuous fallback below.
  if(packedBroadRadius>0.0 && R==packedBroadRadius){
    vBroadGradient=texture2D(heightTexture,uvAt(grid)).ba;
    return;
  }
  float bl=sampleHeightBroadX(grid-vec2(R,0.0)), br=sampleHeightBroadX(grid+vec2(R,0.0));
  float bd=sampleHeightBroadY(grid-vec2(0.0,R)), bu=sampleHeightBroadY(grid+vec2(0.0,R));
  vBroadGradient=vec2(br-bl,bu-bd)/(2.0*R);
}`;

const fragmentShader = `
uniform sampler2D heightTexture;
uniform sampler2D typeTexture;
uniform sampler2D fieldTexture;
uniform float fieldMode;
#if INKBOX_ART_DEBUG
uniform float artDebugMode;
#else
#define artDebugMode 0.0
#endif
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
varying vec2 vBroadGradient;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1,311.7)) + seed) * 43758.5453); }
float noise(vec2 p) {
  vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);
}
${heightSampling}
float typeAt(vec2 p) { return floor(texture2D(typeTexture,uvAt(p)).r*255.0+0.5); }
float fieldAt(vec2 p) { return texture2D(fieldTexture,(clamp(p,vec2(0),mapSize-1.0)+0.5)/mapSize).r; }
float surfaceDepthAt(vec2 p) {
  return texture2D(surfaceTexture,(clamp(p,vec2(0.0),mapSize-1.0)+0.5)/mapSize).r*surfaceDepthRef;
}
float shorelineMaskValues(float centerDepth,float left,float right,float down,float up) {
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
// Production terrain vertices and fragments lie in the closed map domain.
// Packed Linear neighbours are equivalent to shifted R reads there.
float shorelineMaskInside(vec2 p,vec4 packedDepth) {
  float up=surfaceDepthAt(p+vec2(0.0,1.0));
  return shorelineMaskValues(packedDepth.r,packedDepth.g,packedDepth.b,packedDepth.a,up);
}
// Diagnostic/general helper retains shifted-coordinate clamp for synthetic
// probes outside the map. It is never on the production fragment path.
float shorelineMask(vec2 p,vec4 packedDepth) {
  if(any(lessThan(p,vec2(0.0))) || any(greaterThan(p,mapSize-1.0))){
    return shorelineMaskValues(packedDepth.r,
      surfaceDepthAt(p-vec2(1.0,0.0)),surfaceDepthAt(p+vec2(1.0,0.0)),
      surfaceDepthAt(p-vec2(0.0,1.0)),surfaceDepthAt(p+vec2(0.0,1.0)));
  }
  return shorelineMaskInside(p,packedDepth);
}
void outputColor(vec3 color) {
  gl_FragColor=vec4(color,1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
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
  vec2 fineGradient=vec2(r-l,u-d)*0.5;
  float fineSlope2=dot(fineGradient,fineGradient);
  float fineSlope=sqrt(fineSlope2);
  float slope=fineSlope;
  float curvature=l+r+d+u-4.0*h;
  // Interpolate the unnormalised gradient over the existing shared grid, then
  // derive both Mass inputs here. This is a continuous triangle-linear visual
  // reconstruction, not identical to a per-fragment bilinear derivative.
  float broadSlope2=dot(vBroadGradient,vBroadGradient);
  vec3 broadN=normalize(vec3(-vBroadGradient.x,1.0,-vBroadGradient.y));
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
    // The packed neighbours interpolate exactly like four shifted R samples
    // while p lies inside the map. Up is the only second texture fetch.
    vec4 packedDepth=texture2D(surfaceTexture,(clamp(p,vec2(0.0),mapSize-1.0)+0.5)/mapSize)*surfaceDepthRef;
    wd=packedDepth.r;
    coastSoft=shorelineMaskInside(p,packedDepth);
  }
  if(artDebugMode>=1.5&&artDebugMode<2.5){
    outputColor(mix(paperColor,terrainWaterColor,coastSoft*0.90));
    return;
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
  if(artDebugMode>0.5&&artDebugMode<1.5){
    outputColor(color);
    return;
  }
  if(artDebugMode>=2.5&&artDebugMode<3.5){
    vec3 massColor=paperColor;
    if(realmStyleEnabled>0.5){
      vec3 keyLight=normalize(vec3(-0.45,0.76,-0.47));
      float keyDot=dot(broadN,keyLight);
      // Squared-slope response keeps Mass continuous without a separate
      // broad-slope sqrt. It is softer on shallow slopes than the former wash.
      float massMask=smoothstep(0.01,0.7225,broadSlope2);
      float shade=1.0-smoothstep(0.10,0.60,keyDot);
      float massInk=clamp(shade*massShadeStrength*massMask*0.65,0.0,0.24);
      massColor=mix(paperColor,realmInkColor,massInk);
    }
    outputColor(massColor);
    return;
  }
  float boundary=max(abs(id-typeAt(q+vec2(0.38,0))),abs(id-typeAt(q+vec2(0,0.38))));
  float edge=min(1.0,boundary)*terrainBoundaryStrength*0.16*distant*(1.0-coastSoft*0.75);
  // The existing low-frequency warp also supplies sparse brush placement;
  // marks now correlate mildly with type warp, avoiding a second four-hash
  // value-noise evaluation per fragment.
  float sparse=smoothstep(1.0-inkDensity,1.13-inkDensity,warp.x+0.5);
  float dryNoise=noise(p*2.1+9.0);
  float dry=mix(1.0,smoothstep(0.24,0.58,dryNoise),dryBrushStrength*nearDetail);
  float brushGate=sparse*dry;
  float structure=max(max(ridge,valley),breakInk)*smoothstep(0.10,0.65,slope);
  float ink=structure*brushGate*structuralInkStrength*distant;
  // Facing reads the continuous broad field, never triangle derivatives.
  float facing=abs(dot(broadN,normalize(cameraPosition-vWorld)));
  float silhouette=(1.0-smoothstep(0.06,0.28,facing))*silhouetteInkStrength*nearDetail;
  float inkAmount=clamp(ink*0.72+edge+silhouette*0.4,0.0,0.82);
  float clearQi=fieldMode>0.5&&fieldMode<1.5?smoothstep(0.42,0.97,scalar):0.0;
  inkAmount*=1.0-clearQi*0.35;
  if (realmStyleEnabled > 0.5) {
    color=mix(color,realmInkColor,inkAmount);
    // Mass establishes a soft volume. Its mask has no fineSlope, curvature,
    // sparse ink or brush noise; those belong to the small structural marks.
    vec3 keyLight=normalize(vec3(-0.45,0.76,-0.47));
    float keyDot=dot(broadN,keyLight);
    float massMask=smoothstep(0.01,0.7225,broadSlope2);
    float lit=smoothstep(0.68,0.98,keyDot);
    float shade=1.0-smoothstep(0.10,0.60,keyDot);
    float massInk=clamp(shade*massShadeStrength*massMask*0.65,0.0,0.24);
    color=mix(color,paperColor,clamp(lit*massShadeStrength*massMask*0.30,0.0,0.16));
    color=mix(color,realmInkColor,massInk);
    // Structure owns the deepest terrain marks. Curvature supplies location;
    // existing sparse/dry masks and slope direction keep it from filling faces.
    // Reuse the fine slope for direction instead of a second normalize.
    // Near-zero slopes are already rejected by Structure gates.
    float strokeDirection=0.55+0.45*abs(dot(fineGradient,vec2(0.78,-0.6258)))/max(fineSlope,0.0001);
    float c2dStruct=smoothstep(0.12,0.50,abs(curvature))*smoothstep(0.35,1.60,fineSlope);
    float deep=(structure*structure*deepInkStrength+c2dStruct*deepInkStrength)*brushGate*strokeDirection*nearDetail*distant;
    deep=clamp(deep,0.0,0.22);
    if(artDebugMode>=3.5&&artDebugMode<4.5){
      float structureInk=clamp(ink*0.72+edge,0.0,0.82)*(1.0-clearQi*0.35);
      outputColor(mix(mix(paperColor,realmInkColor,structureInk),realmInkColor,deep));
      return;
    }
    color=mix(color,realmInkColor,deep);
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
  } else {
    color*=1.0-inkAmount;
    if(artDebugMode>=3.5&&artDebugMode<4.5){
      float structureInk=clamp(ink*0.72+edge,0.0,0.82)*(1.0-clearQi*0.35);
      outputColor(mix(paperColor,realmInkColor,structureInk));
      return;
    }
  }
  if(fieldMode>1.5){
    // Natural decay can raise an already dense cell. Keep that upper range
    // responsive instead of flattening every value above 0.90 to one wash.
    float yin=smoothstep(0.35,1.0,scalar);
    float empty=(1.0-smoothstep(0.18,0.58,scalar))*(1.0-water);
    color=mix(color,paperColor,empty*0.46);
    // Dense yin remains geographically readable as magnetic-blue midtone.
    // Its darkest cues are the sparse Structure marks, not a filled black face.
    vec3 coldInk=mix(fieldColdColor,fieldInkColor,0.25+0.10*rock);
    color=mix(color,coldInk,yin*(0.28-water*0.12));
    float bone=smoothstep(0.86,0.97,dryNoise)*yin*(0.025+rock*0.08);
    color=mix(color,paperColor,bone);
  }else if(fieldMode>0.5){
    float land=1.0-water;
    float clean=clearQi*land*(0.18+0.10*(1.0-smoothstep(0.5,2.2,slope)));
    color=mix(color,paperColor,clean);
    vec3 mineral=mix(fieldMineralGreen,fieldMineralBlue,rock);
    color=mix(color,mineral,clearQi*land*(0.06+0.08*rock));
    color=mix(color,fieldMineralGold,clearQi*ridge*land*0.04);
  }
  // Weak paper stays on the image; all wash / dry brush above stay in world space.
  float grain=hash(floor(gl_FragCoord.xy))-0.5;
  if(artDebugMode>=4.5){
    outputColor(mix(paperColor,atmosphereColor,(1.0-smoothstep(atmosphereLow,atmosphereHigh,vWorld.y))*atmosphereStrength)*(1.0+grain*paperGrainStrength));
    return;
  }
  color*=1.0+grain*paperGrainStrength;
  outputColor(color);
}`;

export class PigmentTerrainMaterial extends THREE.ShaderMaterial {
  constructor(data, profile) {
    const basePalette = TERRAIN_INFO.map(t => new THREE.Color(`rgb(${t.color.join(',')})`));
    super({ vertexShader, fragmentShader, side: THREE.DoubleSide, defines: { INKBOX_ART_DEBUG: 0 }, uniforms: {
      heightTexture: { value: data.heightTexture }, typeTexture: { value: data.typeTexture },
      fieldTexture: { value: data.typeTexture },fieldMode:{value:0},
      artDebugMode: { value: 0 },
      // PlaneStage may bind its continuous surface field before the terrain is rendered.
      // Keep the no-field fallback valid for legacy profiles and test-created stages.
      surfaceTexture: { value: data.typeTexture }, surfaceMode: { value: 0 }, surfaceDepthRef: { value: 0.5 },
      massShadeStrength: { value: 0 }, deepInkStrength: { value: 0 }, heightWashStrength: { value: 0 }, broadRadius: { value: 2.5 },
      packedBroadRadius: { value: data.packedBroadGradient ? data.packedBroadRadius : 0 },
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
  setArtDebugMode(mode = 0) {
    this.uniforms.artDebugMode.value = mode;
    const next = mode > 0 ? 1 : 0;
    if (this.defines.INKBOX_ART_DEBUG !== next) {
      this.dispose(); // release the previous renderer program before reusing this material
      this.defines.INKBOX_ART_DEBUG = next;
      this.needsUpdate = true;
    }
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
