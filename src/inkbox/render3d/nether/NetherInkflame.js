import * as THREE from 'three';

export const LEGACY_INKFLAME = Object.freeze({ tone: 'legacy', soulfire: 'off', cliffInk: 'off', lowMist: false });
export function normalizeInkflame(options = {}) {
  return { tone: options.tone === 'inkflame' ? 'inkflame' : 'legacy',
    soulfire: ['static','flow'].includes(options.soulfire) ? options.soulfire : 'off',
    cliffInk: ['light','full'].includes(options.cliffInk) ? options.cliffInk : 'off', lowMist: !!options.lowMist };
}
export const inkflameEnabled = o => o.tone === 'inkflame' || o.soulfire !== 'off' || o.cliffInk !== 'off' || o.lowMist;
export function inkflameUniforms(fallback, world) {
  return { nfField: {value: fallback}, nfMapSize: {value: new THREE.Vector2(world.w,world.h)},
    nfBand: {value:new THREE.Vector2(-8,50)},
    nfOptions: {value: new THREE.Vector4()}, nfClock: {value: 0} };
}

// Classification only. The authoritative surface and all interpolation remain
// in ElevationField/topology. R/G/B/A = upper/middle/lower/seep, not elevations.
const clamp = x => Math.min(1,Math.max(0,x));
const smooth = (a,b,x) => {const t=clamp((x-a)/(b-a));return t*t*(3-2*t);};
export function deriveInkflameField(world, elevation) {
  const {w,h,size}=world, heights=new Float32Array(size), bytes=new Uint8Array(size*4);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++)heights[y*w+x]=elevation.node(x,y);
  const sorted=heights.slice().sort(), lo=sorted[Math.floor(size*.04)], hi=sorted[Math.floor(size*.97)];
  const span=Math.max(12,hi-lo), radius=Math.max(5,Math.round(Math.min(w,h)*.045));
  const at=(x,y)=>heights[Math.max(0,Math.min(h-1,y))*w+Math.max(0,Math.min(w-1,x))];
  const wet=(x,y)=>(world.water[Math.max(0,Math.min(h-1,y))*w+Math.max(0,Math.min(w-1,x))]||0)>.0015?1:0;
  const totals=[0,0,0,0], counts=[0,0,0,0];
  let foot=null, footScore=-1;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++) {
    const i=y*w+x, e=heights[i], t=clamp((e-lo)/span);
    const a=at(x-radius,y),b=at(x+radius,y),c=at(x,y-radius),d=at(x,y+radius);
    const hollow=clamp((Math.max(a,b,c,d)-e)/(span*.62));
    const convex=clamp((e-(a+b+c+d)*.25)/(span*.30));
    const yin=clamp(world.veg?.[i]||0);
    const river=Math.max(wet(x,y),wet(x-3,y),wet(x+3,y),wet(x,y-3),wet(x,y+3));
    const upper=smooth(.38,.79,t)*(.82+.18*convex);
    const lower=clamp(Math.max((1-smooth(.13,.43,t))*.88,hollow*(1-smooth(.42,.70,t)))
      *(.66+.22*yin+.12*river));
    const mid=Math.max(0,1-upper-lower), sum=Math.max(.001,upper+mid+lower);
    const slope=Math.hypot(at(x+1,y)-at(x-1,y),at(x,y+1)-at(x,y-1))*.5;
    const seep=lower*smooth(.04,.54,hollow)*(.45+.55*Math.max(smooth(.20,2.0,slope),river*.7));
    const values=[upper/sum,mid/sum,lower/sum,seep];
    values.forEach((v,k)=>{const byte=Math.round(clamp(v)*255);bytes[i*4+k]=byte;totals[k]+=byte/255;if(byte>127)counts[k]++;});
    // A real low rim/foot point with space for the close-up. No invented entity.
    const score=seep*(.3+.7*(1-smooth(.1,.7,t)));
    if(x>8&&y>8&&x<w-8&&y<h-8&&world.water[i]<=.0015&&score>footScore){footScore=score;foot={kind:'foot',x,y,label:'崖脚阴焰'};}
  }
  return {bytes,heights,band:[lo,hi],foot,
    stats:{nodes:size,bytes:bytes.byteLength,upper:counts[0],middle:counts[1],lower:counts[2],seep:counts[3],
      mean:totals.map(n=>n/size),band:[lo,hi]}};
}

// Shared by terrain, cliff ink, line art and the tiny plume batch. All marks
// are anchored in world coordinates. No screen noise or surface displacement.
export const INKFLAME_GLSL = `
uniform sampler2D nfField;
uniform vec2 nfMapSize;
uniform vec2 nfBand;
uniform vec4 nfOptions;
uniform float nfClock;
float nfHash(vec2 p){p=fract(p*vec2(.1031,.11369));p+=dot(p,p.yx+19.19);return fract(p.x*p.y*(p.x+p.y));}
float nfNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
return mix(mix(nfHash(i),nfHash(i+vec2(1,0)),f.x),mix(nfHash(i+vec2(0,1)),nfHash(i+1.0),f.x),f.y);}
vec4 nfMasks(vec3 world){vec2 p=world.xz+(nfMapSize-1.0)*.5;
vec4 m=texture2D(nfField,(clamp(p,vec2(0),nfMapSize-1.0)+.5)/nfMapSize);
// Use actual interpolated world Y for the continuous register. The read-only
// field contributes basin/yin/wet context, without bilinear height artefacts.
float t=clamp((world.y-nfBand.x)/max(12.,nfBand.y-nfBand.x),0.,1.);
float upper=mix(smoothstep(.38,.79,t),m.r,.10);
float lower=mix(1.-smoothstep(.13,.43,t),m.b,.18);
float middle=max(0.,1.-upper-lower),sum=max(.001,upper+middle+lower);
return vec4(vec3(upper,middle,lower)/sum,m.a);}
float nfLineAlpha(vec3 world){if(nfOptions.x<.5)return 1.0;vec4 m=nfMasks(world);
return (1.0-m.b*.88)*(1.0+m.r*.12);}
float nfBreath(vec3 w){float t=nfOptions.z>1.5?nfClock*.055:0.0;
float lean=nfNoise(w.xz*.10)*1.6;
return nfNoise(vec2(w.x*.21+w.z*.13+lean,w.y*.25-t));}
vec3 nfTerrain(vec3 color,vec3 w,float face,float shade,vec3 bone,vec3 ink){
vec4 m=nfMasks(w);vec3 white=mix(bone,vec3(.94,.958,.95),.82);
if(nfOptions.x>.5){
  float broken=nfNoise(w.xz*.115+vec2(w.y*.025,0));
  vec3 upper=mix(bone,ink,clamp(.10+face*(.67+.13*shade)*(.84+.16*broken)+broken*.07,0.,.95));
  float rubbed=smoothstep(.70,.88,nfNoise(vec2(w.x*.08+w.z*.06,w.y*.25)));
  upper=mix(upper,bone,rubbed*.18*face);
  vec3 middle=mix(bone,ink,.18+face*(.30+.15*shade));
  vec3 low=mix(white,mix(bone,ink,.12),.24+broken*.22);
  color=upper*m.r+middle*m.g+low*m.b;
}
if(nfOptions.y>.5){float pool=m.b*(.22+.18*nfNoise(w.xz*.075));color=mix(color,white,pool);}
if(nfOptions.z>.5&&m.b+m.a>.025){float breath=nfBreath(w),tongue=smoothstep(.36,.72,breath);
  float fire=clamp(m.b*(.04+.37*tongue)+m.a*tongue*.28,0.,.63);
  color=mix(color,white,fire);
}
return color;
}`;
