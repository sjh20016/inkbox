import * as THREE from 'three';
import { TERRAIN_INFO } from '../../core/config.js';

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
uniform vec2 mapSize;
uniform float seed;
uniform vec3 palette[23];
uniform vec3 paperColor;
uniform float pigmentDensity, pigmentSaturation, terrainBoundaryStrength;
uniform float structuralInkStrength, silhouetteInkStrength, inkDensity;
uniform float dryBrushStrength, distanceFade, paperGrainStrength, pixelsPerUnit;
varying vec3 vWorld;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1,311.7)) + seed) * 43758.5453); }
float noise(vec2 p) {
  vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);
}
vec2 uvAt(vec2 p) { return (clamp(floor(p+0.5),vec2(0),mapSize-1.0)+0.5)/mapSize; }
float hAt(vec2 p) { return texture2D(heightTexture,uvAt(p)).g; }
float typeAt(vec2 p) { return floor(texture2D(typeTexture,uvAt(p)).r*255.0+0.5); }
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
  // Ridge / valley are distinct signed structural measurements, not N dot V.
  float ridge=smoothstep(0.16,1.7,-curvature);
  float valley=smoothstep(0.22,2.0,curvature)*0.58;
  float breakInk=smoothstep(1.2,3.8,slope)*smoothstep(0.30,1.8,abs(curvature));
  float nearDetail=smoothstep(0.8,5.5,pixelsPerUnit);
  float distant=mix(1.0,0.30,distanceFade*(1.0-nearDetail));
  float wash=noise(p*0.12+vec2(5.7,9.1));
  float water=1.0-step(3.5,id);
  pigment=mix(pigment,vec3(0.30,0.43,0.46),water*0.22);
  float rock=step(12.5,id)*(1.0-step(16.5,id));
  float forest=step(6.5,id)*(1.0-step(8.5,id));
  float coverage=mix(0.20,0.64,smoothstep(0.25,0.8,wash));
  coverage+=water*0.10+forest*0.12+rock*smoothstep(0.15,1.5,slope)*0.16;
  float density=clamp(pigmentDensity*coverage*distant,0.0,0.85);
  // Absorption rather than a LUT: unpainted areas stay at the chosen paper value.
  vec3 color=paperColor*exp(-density*(vec3(1.0)-pigment)*2.9);
  float boundary=max(abs(id-typeAt(q+vec2(0.38,0))),abs(id-typeAt(q+vec2(0,0.38))));
  float edge=min(1.0,boundary)*terrainBoundaryStrength*0.16*distant;
  float sparse=smoothstep(1.0-inkDensity,1.13-inkDensity,noise(p*0.23+3.0));
  float dry=mix(1.0,smoothstep(0.24,0.58,noise(p*2.1+9.0)),dryBrushStrength*nearDetail);
  float structure=max(max(ridge,valley),breakInk)*smoothstep(0.10,0.65,slope);
  float ink=structure*sparse*dry*structuralInkStrength*distant;
  vec3 normal=normalize(cross(dFdx(vWorld),dFdy(vWorld)));
  float facing=abs(dot(normal,normalize(cameraPosition-vWorld)));
  float silhouette=(1.0-smoothstep(0.04,0.26,facing))*silhouetteInkStrength*nearDetail;
  color*=1.0-clamp(ink*0.72+edge+silhouette*0.4,0.0,0.82);
  // Weak paper stays on the image; all wash / dry brush above stay in world space.
  float grain=hash(floor(gl_FragCoord.xy))-0.5;
  color*=1.0+grain*paperGrainStrength;
  gl_FragColor=vec4(color,1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class PigmentTerrainMaterial extends THREE.ShaderMaterial {
  constructor(data, profile) {
    super({ vertexShader, fragmentShader, side: THREE.DoubleSide, uniforms: {
      heightTexture: { value: data.heightTexture }, typeTexture: { value: data.typeTexture },
      mapSize: { value: new THREE.Vector2(data.world.w, data.world.h) },
      seed: { value: (data.world.seed >>> 0) % 8191 },
      palette: { value: TERRAIN_INFO.map(t => new THREE.Color(`rgb(${t.color.join(',')})`)) },
      paperColor: { value: new THREE.Color(profile.paperColor) }, pixelsPerUnit: { value: 2 },
    } });
    this.name = 'Inkbox:PigmentTerrain'; this.setProfile(profile);
  }
  setProfile(profile) {
    this.uniforms.paperColor.value.set(profile.paperColor);
    for (const key of ['pigmentDensity','pigmentSaturation','terrainBoundaryStrength','structuralInkStrength',
      'silhouetteInkStrength','inkDensity','dryBrushStrength','distanceFade','paperGrainStrength']) {
      if (this.uniforms[key]) this.uniforms[key].value = profile[key];
      else this.uniforms[key] = { value: profile[key] };
    }
  }
}
