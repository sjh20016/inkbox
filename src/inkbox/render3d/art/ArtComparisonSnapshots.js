// Development-only historical presentation snapshots. Loaded lazily by ArtPass.
// Generated from the exact source revisions below; no World/simulation modules.
const freeze = value => { if(value && typeof value === "object") { for(const child of Object.values(value)) freeze(child); Object.freeze(value); } return value; };
const styles0 = freeze({
  mortal: {
    name: 'MortalStyleV1',
    plane: 'mortal',
    paper: { color: '#ECE4D2', background: '#ECE4D2', exposure: 1.02 },
    terrain: {
      palette: ['#5B777C','#718F94','#83A6A9','#A5BFC0','#D8CEB8','#A9B77D','#B9BE89','#627A62','#435E50','#B8B68B','#C9AD75','#C9C6B3','#8A937A','#8C9184','#70868A','#58696A','#DDD9CB','#C8AE59','#755F50','#89857D','#A66E49','#AAA08C','#B58A5F'],
      rock: '#70868A', soil: '#B58A5F', slopeStrength: 0.30,
    },
    water: { color: '#8FB5B8', opacity: 0.43 },
    vegetation: { palette: ['#A9B77D','#627A62','#435E50'], tints5: ['#95A36A','#6C8D62','#577E67','#4D7170','#B0A368'], instanceTintWeight: 0.55, distanceFade: 0.24 },
    building: { palette: { wall: '#DED5BE', roof: '#53605C', wood: '#79664F', earth: '#B58A5F', accent: '#B75A49' }, instanceTintWeight: 0.10, distanceFade: 0.24 },
    entity: { palette: { cloth: '#70868A', skin: '#C9B698', accent: '#B75A49' }, atlas12: ['#C9B698','#ECE4D2','#D8CEB8','#303533','#70868A','#627A62','#B58A5F','#B75A49','#8FB5B8','#C8AE59','#846C80','#627A62'], instanceTintWeight: 0.24, distanceFade: 0.20 },
    pilotPalette: { paper: '#ECE4D2', warm: '#DED5BE', ink: '#303533', blue: '#70868A', wood: '#79664F', earth: '#B58A5F', red: '#B75A49', cyan: '#A9B77D', skin: '#C9B698' },
    boundary: { color: '#A59C89', rift: '#70868A' },
    pigment: { density: 0.66, saturation: 0.58, boundaryStrength: 0.14, distanceFade: 0.42 },
    ink: { structure: 0.59, silhouette: 0.18, density: 0.39, dryBrush: 0.31, feibai: 0.13, color: '#303533' },
    contrast: 1.03,
    atmosphere: { color: '#D8CEB8', strength: 0.025, low: -3, high: 15, near: 60, far: 180 },
    accentLimit: 0.05,
  },
  nether: {
    name: 'NetherStyleV1',
    plane: 'nether',
    paper: { color: '#D5D1C7', background: '#D5D1C7', exposure: 0.88 },
    terrain: {
      palette: ['#252C2B','#303A38','#40514E','#566D69','#8B8B84','#666760','#777770','#353A39','#242827','#625D52','#66594D','#8B8B84','#4D554F','#353A39','#252827','#181A19','#D9D3C6','#66594D','#272320','#46423C','#353A39','#45413B','#60584C'],
      rock: '#181A19', soil: '#66594D', slopeStrength: 0.66,
    },
    water: { color: '#354C49', opacity: 0.48 },
    vegetation: { palette: ['#353A39','#566D69','#66594D'], tints5: ['#353A39','#242827','#566D69','#66594D','#8B8B84'], instanceTintWeight: 0.08 },
    building: { palette: { wall: '#8B8B84', roof: '#181A19', wood: '#353A39', earth: '#66594D', accent: '#8E302B' }, instanceTintWeight: 0.04 },
    // Slot 8 is the actual soul_lamp.lamp_glass; slot 7 stays grey for faction robes.
    entity: { palette: { cloth: '#353A39', skin: '#D9D3C6', accent: '#C63A2E' }, atlas12: ['#D9D3C6','#D5D1C7','#8B8B84','#181A19','#566D69','#353A39','#66594D','#353A39','#C63A2E','#8B8B84','#66594D','#353A39'], instanceTintWeight: 0.09 },
    pilotPalette: { paper: '#D9D3C6', warm: '#8B8B84', ink: '#181A19', blue: '#566D69', wood: '#353A39', earth: '#66594D', red: '#8E302B', cyan: '#566D69', skin: '#D9D3C6' },
    boundary: { color: '#484D49', top: '#484D49', base: '#242827', rift: '#8E302B' },
    pigment: { density: 0.77, saturation: 0.52, boundaryStrength: 0.22 },
    ink: { structure: 0.89, silhouette: 0.39, density: 0.72, dryBrush: 0.78, feibai: 0.52, color: '#181A19' },
    contrast: 1.30,
    atmosphere: { color: '#8B8B84', strength: 0.09, low: -25, high: 12, near: 50, far: 145 },
    accentLimit: 0.03,
  },
  upper: {
    name: 'UpperStyleV1',
    plane: 'upper',
    paper: { color: '#E8DEC8', background: '#E8DEC8', exposure: 1.02 },
    terrain: {
      palette: ['#386786','#426F97','#4A878D','#90B3A3','#D5BD85','#B1A370','#B8A66A','#3E8069','#3B6856','#BFA16C','#C6AB72','#E8DCC4','#879B78','#578E7C','#3C648C','#855A40','#E8DCC4','#B89B55','#A66E49','#B08B67','#A55B45','#9B7959','#C8AE7C'],
      rock: '#3C648C', soil: '#A66E49', slopeStrength: 0.44,
    },
    water: { color: '#557D91', opacity: 0.42 },
    vegetation: { palette: ['#6F9877','#557E6A','#B89B55'], tints5: ['#6F9877','#557E6A','#65A39A','#B89B55','#8E9B7A'], instanceTintWeight: 0.10 },
    building: { palette: { wall: '#E4D6B7', roof: '#46392E', wood: '#A66E49', earth: '#C8AE7C', accent: '#B89B55' }, instanceTintWeight: 0.07 },
    entity: { palette: { cloth: '#557D91', skin: '#E4D6B7', accent: '#B73F32' }, atlas12: ['#D6BE9D','#E4D6B7','#C8AE7C','#46392E','#557D91','#6F9877','#A66E49','#B73F32','#65A39A','#B89B55','#A55B45','#6F9877'], instanceTintWeight: 0.15 },
    pilotPalette: { paper: '#E4D6B7', warm: '#C8AE7C', ink: '#46392E', blue: '#557D91', wood: '#A66E49', earth: '#C8AE7C', red: '#B73F32', cyan: '#6F9877', skin: '#D6BE9D' },
    boundary: { color: '#9D9275', top: '#A89878', base: '#756C5B', rift: '#557D91' },
    pigment: { density: 0.71, saturation: 0.84, boundaryStrength: 0.19, colorLayer: 0.90 },
    ink: { structure: 0.68, silhouette: 0.23, density: 0.46, dryBrush: 0.41, feibai: 0.24, color: '#46392E' },
    contrast: 1.09,
    // Low valley wash is attached to upper terrain. It is not an independent cloud surface.
    atmosphere: { color: '#ECE5D6', strength: 0.18, low: 14, high: 40, near: 65, far: 180 },
    accentLimit: 0.08,
  },
});
const snapshot0 = freeze({...{
  "revision": "8b3f2bac761b59bf70f524ff9a00429fa40cc07a",
  "sourceSHA256": {
    "src/inkbox/render3d/art/PigmentTerrainMaterial.js": "fd3eaaf2d15474c27401c07c39e16a37d58ef2e8a2b2adcfe259a1a8232a453e",
    "src/inkbox/render3d/art/RealmStyleProfile.js": "2c0adbb2ae55062fa30979a9ef69f1586c4dc358c483b52c64b06aa213b4f016"
  },
  "shaders": {
    "terrain": {
      "vertexShader": "\nvarying vec3 vWorld;\nvoid main() {\n  vec4 p = modelMatrix * vec4(position, 1.0);\n  vWorld = p.xyz;\n  gl_Position = projectionMatrix * viewMatrix * p;\n}",
      "fragmentShader": "\nuniform sampler2D heightTexture;\nuniform sampler2D typeTexture;\nuniform sampler2D fieldTexture;\nuniform float fieldMode;\nuniform vec3 fieldInkColor, fieldColdColor;\nuniform vec3 fieldMineralBlue, fieldMineralGreen, fieldMineralGold;\nuniform vec2 mapSize;\nuniform float seed;\nuniform vec3 palette[23];\nuniform vec3 paperColor;\nuniform float pigmentDensity, pigmentSaturation, terrainBoundaryStrength;\nuniform float structuralInkStrength, silhouetteInkStrength, inkDensity;\nuniform float dryBrushStrength, distanceFade, paperGrainStrength, pixelsPerUnit;\nuniform float realmStyleEnabled, slopeRampStrength, realmContrast, paperExposure;\nuniform float colorLayerStrength;\nuniform float feibaiStrength, atmosphereStrength, atmosphereLow, atmosphereHigh;\nuniform vec3 slopeRockColor, slopeSoilColor, terrainWaterColor, realmInkColor, atmosphereColor;\nvarying vec3 vWorld;\nfloat hash(vec2 p) { return fract(sin(dot(p, vec2(127.1,311.7)) + seed) * 43758.5453); }\nfloat noise(vec2 p) {\n  vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);\n  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);\n}\nvec2 uvAt(vec2 p) { return (clamp(floor(p+0.5),vec2(0),mapSize-1.0)+0.5)/mapSize; }\nfloat hAt(vec2 p) { return texture2D(heightTexture,uvAt(p)).g; }\nfloat typeAt(vec2 p) { return floor(texture2D(typeTexture,uvAt(p)).r*255.0+0.5); }\nfloat fieldAt(vec2 p) { return texture2D(fieldTexture,(clamp(p,vec2(0),mapSize-1.0)+0.5)/mapSize).r; }\nvoid main() {\n  vec2 p=vWorld.xz+(mapSize-1.0)*0.5;\n  vec2 warp=vec2(noise(p*0.19),noise(p*0.19+17.3))-0.5;\n  vec2 q=p+warp*0.65;\n  float id=typeAt(q);\n  vec3 pigment=palette[int(clamp(id,0.0,22.0))];\n  float lum=dot(pigment,vec3(0.2126,0.7152,0.0722));\n  pigment=mix(vec3(lum),pigment,pigmentSaturation);\n  float h=hAt(p), l=hAt(p-vec2(1,0)), r=hAt(p+vec2(1,0));\n  float d=hAt(p-vec2(0,1)), u=hAt(p+vec2(0,1));\n  float slope=length(vec2(r-l,u-d))*0.5;\n  float curvature=l+r+d+u-4.0*h;\n  // Ridge / valley are distinct signed structural measurements, not N dot V.\n  float ridge=smoothstep(0.16,1.7,-curvature);\n  float valley=smoothstep(0.22,2.0,curvature)*0.58;\n  float breakInk=smoothstep(1.2,3.8,slope)*smoothstep(0.30,1.8,abs(curvature));\n  float nearDetail=smoothstep(0.8,5.5,pixelsPerUnit);\n  float distant=mix(1.0,0.30,distanceFade*(1.0-nearDetail));\n  float wash=noise(p*0.12+vec2(5.7,9.1));\n  float water=1.0-step(3.5,id);\n  // The scalar comes from this Stage's World. Large masses stay attached to\n  // actual river/type/height structure; ghosts do not drive persistent layout.\n  float scalar=0.0;\n  if(fieldMode>0.5)scalar=fieldAt(p)*0.6+fieldAt(p+vec2(3,0))*0.2+fieldAt(p+vec2(0,3))*0.2;\n  pigment=mix(pigment,terrainWaterColor,water*0.22);\n  float rock=step(12.5,id)*(1.0-step(16.5,id));\n  float forest=step(6.5,id)*(1.0-step(8.5,id));\n  if (realmStyleEnabled > 0.5) {\n    pigment=mix(pigment,slopeRockColor,rock*smoothstep(0.18,1.8,slope)*slopeRampStrength);\n    pigment=mix(pigment,slopeSoilColor,(1.0-rock)*(1.0-water)*smoothstep(0.55,2.2,slope)*slopeRampStrength*0.26);\n  }\n  float coverage=mix(0.20,0.64,smoothstep(0.25,0.8,wash));\n  coverage+=water*0.10+forest*0.12+rock*smoothstep(0.15,1.5,slope)*0.16;\n  float density=clamp(pigmentDensity*coverage*distant,0.0,0.85);\n  // Absorption rather than a LUT: unpainted areas stay at the chosen paper value.\n  vec3 color=paperColor*exp(-density*(vec3(1.0)-pigment)*2.9);\n  if (realmStyleEnabled > 0.5 && colorLayerStrength > 0.0) {\n    // A mineral colour layer follows existing terrain pigment coverage. It adds\n    // no topology, texture tap or noise pass; unpainted valleys retain the paper.\n    float colorCoverage=clamp((coverage-0.12)*1.45,0.0,0.85);\n    color=mix(color,pigment,colorLayerStrength*colorCoverage);\n  }\n  float boundary=max(abs(id-typeAt(q+vec2(0.38,0))),abs(id-typeAt(q+vec2(0,0.38))));\n  float edge=min(1.0,boundary)*terrainBoundaryStrength*0.16*distant;\n  float sparse=smoothstep(1.0-inkDensity,1.13-inkDensity,noise(p*0.23+3.0));\n  float dryNoise=noise(p*2.1+9.0);\n  float dry=mix(1.0,smoothstep(0.24,0.58,dryNoise),dryBrushStrength*nearDetail);\n  float structure=max(max(ridge,valley),breakInk)*smoothstep(0.10,0.65,slope);\n  float ink=structure*sparse*dry*structuralInkStrength*distant;\n  vec3 normal=normalize(cross(dFdx(vWorld),dFdy(vWorld)));\n  float facing=abs(dot(normal,normalize(cameraPosition-vWorld)));\n  float silhouette=(1.0-smoothstep(0.04,0.26,facing))*silhouetteInkStrength*nearDetail;\n  float inkAmount=clamp(ink*0.72+edge+silhouette*0.4,0.0,0.82);\n  float clearQi=fieldMode>0.5&&fieldMode<1.5?smoothstep(0.42,0.97,scalar):0.0;\n  inkAmount*=1.0-clearQi*0.35;\n  if (realmStyleEnabled > 0.5) {\n    color=mix(color,realmInkColor,inkAmount);\n    float feibai=smoothstep(0.73,0.91,dryNoise)*feibaiStrength*ink*nearDetail;\n    color=mix(color,paperColor,feibai);\n    float valleyWash=1.0-smoothstep(atmosphereLow,atmosphereHigh,vWorld.y);\n    color=mix(color,atmosphereColor,valleyWash*atmosphereStrength);\n    color=clamp((color-vec3(0.5))*realmContrast+vec3(0.5),0.0,1.0)*paperExposure;\n  } else color*=1.0-inkAmount;\n  if(fieldMode>1.5){\n    // Natural decay can raise an already dense cell. Keep that upper range\n    // responsive instead of flattening every value above 0.90 to one wash.\n    float yin=smoothstep(0.35,1.0,scalar);\n    float empty=(1.0-smoothstep(0.18,0.58,scalar))*(1.0-water);\n    color=mix(color,paperColor,empty*0.46);\n    vec3 coldInk=mix(fieldColdColor,fieldInkColor,0.42+0.18*rock);\n    color=mix(color,coldInk,yin*(0.50-water*0.25));\n    float bone=smoothstep(0.81,0.94,dryNoise)*yin*(0.02+rock*0.07);\n    color=mix(color,paperColor,bone);\n  }else if(fieldMode>0.5){\n    float land=1.0-water;\n    float clean=clearQi*land*(0.18+0.10*(1.0-smoothstep(0.5,2.2,slope)));\n    color=mix(color,paperColor,clean);\n    vec3 mineral=mix(fieldMineralGreen,fieldMineralBlue,rock);\n    color=mix(color,mineral,clearQi*land*(0.07+0.15*rock));\n    color=mix(color,fieldMineralGold,clearQi*ridge*land*0.07);\n  }\n  // Weak paper stays on the image; all wash / dry brush above stay in world space.\n  float grain=hash(floor(gl_FragCoord.xy))-0.5;\n  color*=1.0+grain*paperGrainStrength;\n  gl_FragColor=vec4(color,1.0);\n  #include <tonemapping_fragment>\n  #include <colorspace_fragment>\n}"
    },
    "water": null,
    "boundary": null
  }
}, styles:styles0});
const styles1 = freeze({
  mortal: {
    name: 'MortalStyleV1',
    plane: 'mortal',
    paper: { color: '#ECE4D2', background: '#ECE4D2', exposure: 1.02 },
    terrain: {
      palette: ['#5B777C','#718F94','#83A6A9','#A5BFC0','#D8CEB8','#A9B77D','#B9BE89','#627A62','#435E50','#B8B68B','#C9AD75','#C9C6B3','#8A937A','#8C9184','#70868A','#58696A','#DDD9CB','#C8AE59','#755F50','#89857D','#A66E49','#AAA08C','#B58A5F'],
      rock: '#70868A', soil: '#B58A5F', slopeStrength: 0.30,
    },
    water: { color: '#8FB5B8', opacity: 0.43, paperStrength: 0.55, rippleStrength: 0.60, shoreSoftness: 1.0 },
    vegetation: { palette: ['#A9B77D','#627A62','#435E50'], tints5: ['#95A36A','#6C8D62','#577E67','#4D7170','#B0A368'], instanceTintWeight: 0.55, distanceFade: 0.24 },
    building: { palette: { wall: '#DED5BE', roof: '#53605C', wood: '#79664F', earth: '#B58A5F', accent: '#B75A49' }, instanceTintWeight: 0.10, distanceFade: 0.24 },
    entity: { palette: { cloth: '#70868A', skin: '#C9B698', accent: '#B75A49' }, atlas12: ['#C9B698','#ECE4D2','#D8CEB8','#303533','#70868A','#627A62','#B58A5F','#B75A49','#8FB5B8','#C8AE59','#846C80','#627A62'], instanceTintWeight: 0.24, distanceFade: 0.20 },
    pilotPalette: { paper: '#ECE4D2', warm: '#DED5BE', ink: '#303533', blue: '#70868A', wood: '#79664F', earth: '#B58A5F', red: '#B75A49', cyan: '#A9B77D', skin: '#C9B698' },
    boundary: { color: '#A59C89', rift: '#70868A' },
    boundaryInk: { strata: 0.30, dryBrush: 0.34, bottomFade: 0.34, topBand: 0.22, inkVariation: 0.20, bone: 0.10, rim: '#F2EADA' },
    tone: { massShade: 0.56, deepInk: 0.58, heightWash: 0.05 },
    pigment: { density: 0.66, saturation: 0.58, boundaryStrength: 0.14, distanceFade: 0.42 },
    ink: { structure: 0.59, silhouette: 0.18, density: 0.39, dryBrush: 0.31, feibai: 0.13, color: '#303533' },
    contrast: 1.14,
    atmosphere: { color: '#D8CEB8', strength: 0.025, low: -3, high: 15, near: 60, far: 180 },
    accentLimit: 0.05,
  },
  nether: {
    name: 'NetherStyleV1',
    plane: 'nether',
    paper: { color: '#D5D1C7', background: '#D5D1C7', exposure: 0.88 },
    terrain: {
      palette: ['#252C2B','#303A38','#40514E','#566D69','#8B8B84','#666760','#777770','#353A39','#242827','#625D52','#66594D','#8B8B84','#4D554F','#353A39','#252827','#181A19','#D9D3C6','#66594D','#272320','#46423C','#353A39','#45413B','#60584C'],
      rock: '#181A19', soil: '#66594D', slopeStrength: 0.66,
    },
    water: { color: '#354C49', opacity: 0.48, paperStrength: 0.42, rippleStrength: 0.35, shoreSoftness: 1.0 },
    vegetation: { palette: ['#353A39','#566D69','#66594D'], tints5: ['#353A39','#242827','#566D69','#66594D','#8B8B84'], instanceTintWeight: 0.08 },
    building: { palette: { wall: '#8B8B84', roof: '#181A19', wood: '#353A39', earth: '#66594D', accent: '#8E302B' }, instanceTintWeight: 0.04 },
    // Slot 8 is the actual soul_lamp.lamp_glass; slot 7 stays grey for faction robes.
    entity: { palette: { cloth: '#353A39', skin: '#D9D3C6', accent: '#C63A2E' }, atlas12: ['#D9D3C6','#D5D1C7','#8B8B84','#181A19','#566D69','#353A39','#66594D','#353A39','#C63A2E','#8B8B84','#66594D','#353A39'], instanceTintWeight: 0.09 },
    pilotPalette: { paper: '#D9D3C6', warm: '#8B8B84', ink: '#181A19', blue: '#566D69', wood: '#353A39', earth: '#66594D', red: '#8E302B', cyan: '#566D69', skin: '#D9D3C6' },
    boundary: { color: '#484D49', top: '#484D49', base: '#242827', rift: '#8E302B' },
    boundaryInk: { strata: 0.34, dryBrush: 0.30, bottomFade: 0.46, topBand: 0.16, inkVariation: 0.26, bone: 0.22, rim: '#C9C3B6' },
    tone: { massShade: 0.42, deepInk: 0.44, heightWash: 0.0 },
    pigment: { density: 0.77, saturation: 0.52, boundaryStrength: 0.22 },
    ink: { structure: 0.89, silhouette: 0.39, density: 0.72, dryBrush: 0.78, feibai: 0.52, color: '#181A19' },
    contrast: 1.30,
    atmosphere: { color: '#8B8B84', strength: 0.09, low: -25, high: 12, near: 50, far: 145 },
    accentLimit: 0.03,
  },
  upper: {
    name: 'UpperStyleV1',
    plane: 'upper',
    paper: { color: '#E8DEC8', background: '#E8DEC8', exposure: 1.02 },
    terrain: {
      palette: ['#386786','#426F97','#4A878D','#90B3A3','#D5BD85','#B1A370','#B8A66A','#3E8069','#3B6856','#BFA16C','#C6AB72','#E8DCC4','#879B78','#578E7C','#3C648C','#855A40','#E8DCC4','#B89B55','#A66E49','#B08B67','#A55B45','#9B7959','#C8AE7C'],
      rock: '#3C648C', soil: '#A66E49', slopeStrength: 0.44,
    },
    water: { color: '#557D91', opacity: 0.42, paperStrength: 0.60, rippleStrength: 0.45, shoreSoftness: 1.0 },
    vegetation: { palette: ['#6F9877','#557E6A','#B89B55'], tints5: ['#6F9877','#557E6A','#65A39A','#B89B55','#8E9B7A'], instanceTintWeight: 0.10 },
    building: { palette: { wall: '#E4D6B7', roof: '#46392E', wood: '#A66E49', earth: '#C8AE7C', accent: '#B89B55' }, instanceTintWeight: 0.07 },
    entity: { palette: { cloth: '#557D91', skin: '#E4D6B7', accent: '#B73F32' }, atlas12: ['#D6BE9D','#E4D6B7','#C8AE7C','#46392E','#557D91','#6F9877','#A66E49','#B73F32','#65A39A','#B89B55','#A55B45','#6F9877'], instanceTintWeight: 0.15 },
    pilotPalette: { paper: '#E4D6B7', warm: '#C8AE7C', ink: '#46392E', blue: '#557D91', wood: '#A66E49', earth: '#C8AE7C', red: '#B73F32', cyan: '#6F9877', skin: '#D6BE9D' },
    boundary: { color: '#9D9275', top: '#A89878', base: '#756C5B', rift: '#557D91' },
    boundaryInk: { strata: 0.26, dryBrush: 0.28, bottomFade: 0.40, topBand: 0.30, inkVariation: 0.16, bone: 0.14, rim: '#F6EFDD' },
    tone: { massShade: 0.50, deepInk: 0.52, heightWash: 0.05 },
    pigment: { density: 0.71, saturation: 0.84, boundaryStrength: 0.19, colorLayer: 0.90 },
    ink: { structure: 0.68, silhouette: 0.23, density: 0.46, dryBrush: 0.41, feibai: 0.24, color: '#46392E' },
    contrast: 1.18,
    // Low valley wash is attached to upper terrain. It is not an independent cloud surface.
    atmosphere: { color: '#ECE5D6', strength: 0.18, low: 14, high: 40, near: 65, far: 180 },
    accentLimit: 0.08,
  },
});
const snapshot1 = freeze({...{
  "revision": "ef8b43df91c8dff6f01e241301d3d40a4e724d84",
  "sourceSHA256": {
    "src/inkbox/render3d/art/PigmentTerrainMaterial.js": "d126efa9e650cbf618182f917c245ef3b593985f78aadbf37fdebc1244bca030",
    "src/inkbox/render3d/water/WaterPigmentMaterial.js": "8663672a0044a06b5c05f75d49baf11f26924fab1640dc6439f5b70a554b1e8e",
    "src/inkbox/render3d/boundary/BoundaryInkMaterial.js": "4180ffdec27cc77eb58b3918b7103848fccc35eed4fd308ef03d51532624e909",
    "src/inkbox/render3d/art/RealmStyleProfile.js": "ff4006ea9024b151e021b14800022f1a1e8297219d59c01b3b48417afbab2c01"
  },
  "shaders": {
    "terrain": {
      "vertexShader": "\nvarying vec3 vWorld;\nvoid main() {\n  vec4 p = modelMatrix * vec4(position, 1.0);\n  vWorld = p.xyz;\n  gl_Position = projectionMatrix * viewMatrix * p;\n}",
      "fragmentShader": "\nuniform sampler2D heightTexture;\nuniform sampler2D typeTexture;\nuniform sampler2D fieldTexture;\nuniform float fieldMode;\nuniform sampler2D surfaceTexture;\nuniform float surfaceMode, surfaceDepthRef;\nuniform float massShadeStrength, deepInkStrength, heightWashStrength, broadRadius;\nuniform vec3 fieldInkColor, fieldColdColor;\nuniform vec3 fieldMineralBlue, fieldMineralGreen, fieldMineralGold;\nuniform vec2 mapSize;\nuniform float seed;\nuniform vec3 palette[23];\nuniform vec3 paperColor;\nuniform float pigmentDensity, pigmentSaturation, terrainBoundaryStrength;\nuniform float structuralInkStrength, silhouetteInkStrength, inkDensity;\nuniform float dryBrushStrength, distanceFade, paperGrainStrength, pixelsPerUnit;\nuniform float realmStyleEnabled, slopeRampStrength, realmContrast, paperExposure;\nuniform float colorLayerStrength;\nuniform float feibaiStrength, atmosphereStrength, atmosphereLow, atmosphereHigh;\nuniform vec3 slopeRockColor, slopeSoilColor, terrainWaterColor, realmInkColor, atmosphereColor;\nvarying vec3 vWorld;\nfloat hash(vec2 p) { return fract(sin(dot(p, vec2(127.1,311.7)) + seed) * 43758.5453); }\nfloat noise(vec2 p) {\n  vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);\n  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);\n}\nvec2 uvAt(vec2 p) { return (clamp(floor(p+0.5),vec2(0),mapSize-1.0)+0.5)/mapSize; }\nfloat hAt(vec2 p) { return texture2D(heightTexture,uvAt(p)).g; }\nfloat typeAt(vec2 p) { return floor(texture2D(typeTexture,uvAt(p)).r*255.0+0.5); }\nfloat fieldAt(vec2 p) { return texture2D(fieldTexture,(clamp(p,vec2(0),mapSize-1.0)+0.5)/mapSize).r; }\nvoid main() {\n  vec2 p=vWorld.xz+(mapSize-1.0)*0.5;\n  vec2 warp=vec2(noise(p*0.19),noise(p*0.19+17.3))-0.5;\n  vec2 q=p+warp*0.65;\n  float id=typeAt(q);\n  vec3 pigment=palette[int(clamp(id,0.0,22.0))];\n  float lum=dot(pigment,vec3(0.2126,0.7152,0.0722));\n  pigment=mix(vec3(lum),pigment,pigmentSaturation);\n  float h=hAt(p), l=hAt(p-vec2(1,0)), r=hAt(p+vec2(1,0));\n  float d=hAt(p-vec2(0,1)), u=hAt(p+vec2(0,1));\n  float slope=length(vec2(r-l,u-d))*0.5;\n  float curvature=l+r+d+u-4.0*h;\n  // M2-C2D P2：绘画用低频高度法线——「大山势」只看低频邻域，\n  // 真实高频 slope/curvature 继续留给结构墨、局部皴与飞白（「小笔触」）。\n  // heightTexture .g 已经是舞台高程（世界 Y 单位），格距为 1。\n  float R=max(broadRadius,1.0);\n  float bl=hAt(p-vec2(R,0.0)), br=hAt(p+vec2(R,0.0));\n  float bd=hAt(p-vec2(0.0,R)), bu=hAt(p+vec2(0.0,R));\n  vec3 broadN=normalize(vec3(bl-br,2.0*R,bd-bu));\n  // Ridge / valley are distinct signed structural measurements, not N dot V.\n  float ridge=smoothstep(0.16,1.7,-curvature);\n  float valley=smoothstep(0.22,2.0,curvature)*0.58;\n  float breakInk=smoothstep(1.2,3.8,slope)*smoothstep(0.30,1.8,abs(curvature));\n  float nearDetail=smoothstep(0.8,5.5,pixelsPerUnit);\n  float distant=mix(1.0,0.30,distanceFade*(1.0-nearDetail));\n  float wash=noise(p*0.12+vec2(5.7,9.1));\n  float water=1.0-step(3.5,id);\n  // M2-C2D P1：岸线一带的连续烘染权重。水深是连续标量（线性过滤），\n  // 岸线附近的沙 / 水 / 陆因此不再像三个格子图层叠放。\n  float coastSoft=0.0, wd=0.0;\n  if(surfaceMode>0.5){\n    wd=texture2D(surfaceTexture,(clamp(p,vec2(0.0),mapSize-1.0)+0.5)/mapSize).r*surfaceDepthRef;\n    float aaS=max(fwidth(wd)*1.5,0.004);\n    coastSoft=1.0-smoothstep(0.0,aaS+0.03,wd);\n  }\n  // The scalar comes from this Stage's World. Large masses stay attached to\n  // actual river/type/height structure; ghosts do not drive persistent layout.\n  float scalar=0.0;\n  if(fieldMode>0.5)scalar=fieldAt(p)*0.6+fieldAt(p+vec2(3,0))*0.2+fieldAt(p+vec2(0,3))*0.2;\n  pigment=mix(pigment,terrainWaterColor,water*0.22);\n  float rock=step(12.5,id)*(1.0-step(16.5,id));\n  float forest=step(6.5,id)*(1.0-step(8.5,id));\n  if (realmStyleEnabled > 0.5) {\n    pigment=mix(pigment,slopeRockColor,rock*smoothstep(0.18,1.8,slope)*slopeRampStrength);\n    pigment=mix(pigment,slopeSoilColor,(1.0-rock)*(1.0-water)*smoothstep(0.55,2.2,slope)*slopeRampStrength*0.26);\n  }\n  float coverage=mix(0.20,0.64,smoothstep(0.25,0.8,wash));\n  coverage+=water*0.10+forest*0.12+rock*smoothstep(0.15,1.5,slope)*0.16;\n  float density=clamp(pigmentDensity*coverage*distant,0.0,0.85);\n  // Absorption rather than a LUT: unpainted areas stay at the chosen paper value.\n  vec3 color=paperColor*exp(-density*(vec3(1.0)-pigment)*2.9);\n  if (realmStyleEnabled > 0.5 && colorLayerStrength > 0.0) {\n    // A mineral colour layer follows existing terrain pigment coverage. It adds\n    // no topology, texture tap or noise pass; unpainted valleys retain the paper.\n    float colorCoverage=clamp((coverage-0.12)*1.45,0.0,0.85);\n    color=mix(color,pigment,colorLayerStrength*colorCoverage);\n  }\n  float boundary=max(abs(id-typeAt(q+vec2(0.38,0))),abs(id-typeAt(q+vec2(0,0.38))));\n  float edge=min(1.0,boundary)*terrainBoundaryStrength*0.16*distant*(1.0-coastSoft*0.75);\n  float sparse=smoothstep(1.0-inkDensity,1.13-inkDensity,noise(p*0.23+3.0));\n  float dryNoise=noise(p*2.1+9.0);\n  float dry=mix(1.0,smoothstep(0.24,0.58,dryNoise),dryBrushStrength*nearDetail);\n  float structure=max(max(ridge,valley),breakInk)*smoothstep(0.10,0.65,slope);\n  float ink=structure*sparse*dry*structuralInkStrength*distant;\n  // M2-C2D P2：silhouette / facing 改吃绘画用低频法线（broadN），\n  // 不再直接受真实三角面 dFdx/dFdy 影响 ⇒ 近景不再一片片竖直三角形抢明暗。\n  // ⚠️ 范围要比 legacy 的窄带**放宽**：低频法线是平滑的，若只在「几乎掠射」\n  //    的窄带里入墨，暗端面积会大幅缩水、明度跨度反而变窄。放宽到\n  //    「背向视线的整块形体」，才既能去掉三角面噪点、又撑得住暗端。\n  float facing=abs(dot(broadN,normalize(cameraPosition-vWorld)));\n  float silhouette=smoothstep(0.58,0.05,facing)*silhouetteInkStrength*nearDetail;\n  float inkAmount=clamp(ink*0.72+edge+silhouette*0.4,0.0,0.82);\n  float clearQi=fieldMode>0.5&&fieldMode<1.5?smoothstep(0.42,0.97,scalar):0.0;\n  inkAmount*=1.0-clearQi*0.35;\n  if (realmStyleEnabled > 0.5) {\n    color=mix(color,realmInkColor,inkAmount);\n    // ── M2-C2D P2 明度骨架（低频主光的两面）────────────────────────────\n    // 同一束世界锚定主光，在「绘画用低频法线」上分两面：\n    //   受光面回纸（留白 / 亮部），背光面入墨（大山势 / 暗部）。\n    // 两面都只看低频 ⇒ 近景得到的是大山势的明暗，不是一片片三角面各自\n    // 抢明暗；而且跨度是被「亮部 + 暗部」同时拉开的，不是只把山压黑。\n    // ⚠️ 主光要**斜掠**（水平分量大于垂直分量）：几乎竖直的光会让所有朝上的\n    //    地形都算「受光」，于是只剩回纸、没有暗部，明度跨度反而被压平。\n    //    斜掠光才能在低频法线上真正分出受光面与背光面。\n    // massMask 只让有坡度的位置参与，平地 / 水面不受这层影响。\n    vec3 keyLight=normalize(vec3(-0.62,0.42,-0.66));\n    float keyDot=dot(broadN,keyLight);\n    float massMask=smoothstep(0.06,0.55,slope+length(vec2(br-bl,bd-bu))*0.6);\n    float lit=smoothstep(0.34,0.98,keyDot);\n    float shade=smoothstep(0.30,0.92,-keyDot);\n    color=mix(color,paperColor,clamp(lit*massShadeStrength*massMask*0.55,0.0,0.60));\n    color=mix(color,realmInkColor,clamp(shade*massShadeStrength*massMask*1.10,0.0,0.75));\n    // 深墨集中在山脊 / 沟谷 / 坡折等结构位置，不把整片山体一起压黑。\n    // ⚠️ legacy 的 ridge / valley 阈值是按另一套高程尺度写的；在本项目当前\n    //    高程下（高差约 0–60 世界 Y、格距 1），离散拉普拉斯量级只有 ±0.5\n    //    左右，smoothstep(0.16,1.7,…) 这类判据几乎不触发，于是「深墨」在\n    //    画面上基本是空的。这里按实际曲率量级另标定一条结构暗部，只在\n    //    沟谷 / 坡折处压墨，让深墨真正落下来。\n    float c2dCurv=abs(curvature);\n    float c2dStruct=smoothstep(0.05,0.55,c2dCurv)*smoothstep(0.10,0.65,slope);\n    float deep=structure*structure*deepInkStrength + c2dStruct*deepInkStrength;\n    color=mix(color,realmInkColor,clamp(deep,0.0,0.60));\n    // 高峰按位面风格适度回纸色（幽冥 heightWash = 0，不参与）。\n    float peak=smoothstep(atmosphereHigh,atmosphereHigh+20.0,vWorld.y)*heightWashStrength;\n    color=mix(color,paperColor,peak);\n    // 岸线连续烘染：沙岸 / 水岸 / 陆地之间的弱过渡。\n    color=mix(color,mix(paperColor,terrainWaterColor,0.35),coastSoft*0.20);\n    float feibai=smoothstep(0.73,0.91,dryNoise)*feibaiStrength*ink*nearDetail;\n    color=mix(color,paperColor,feibai);\n    float valleyWash=1.0-smoothstep(atmosphereLow,atmosphereHigh,vWorld.y);\n    color=mix(color,atmosphereColor,valleyWash*atmosphereStrength);\n    color=clamp((color-vec3(0.5))*realmContrast+vec3(0.5),0.0,1.0)*paperExposure;\n  } else color*=1.0-inkAmount;\n  if(fieldMode>1.5){\n    // Natural decay can raise an already dense cell. Keep that upper range\n    // responsive instead of flattening every value above 0.90 to one wash.\n    float yin=smoothstep(0.35,1.0,scalar);\n    float empty=(1.0-smoothstep(0.18,0.58,scalar))*(1.0-water);\n    color=mix(color,paperColor,empty*0.46);\n    vec3 coldInk=mix(fieldColdColor,fieldInkColor,0.42+0.18*rock);\n    color=mix(color,coldInk,yin*(0.50-water*0.25));\n    float bone=smoothstep(0.81,0.94,dryNoise)*yin*(0.02+rock*0.07);\n    color=mix(color,paperColor,bone);\n  }else if(fieldMode>0.5){\n    float land=1.0-water;\n    float clean=clearQi*land*(0.18+0.10*(1.0-smoothstep(0.5,2.2,slope)));\n    color=mix(color,paperColor,clean);\n    vec3 mineral=mix(fieldMineralGreen,fieldMineralBlue,rock);\n    color=mix(color,mineral,clearQi*land*(0.07+0.15*rock));\n    color=mix(color,fieldMineralGold,clearQi*ridge*land*0.07);\n  }\n  // Weak paper stays on the image; all wash / dry brush above stay in world space.\n  float grain=hash(floor(gl_FragCoord.xy))-0.5;\n  color*=1.0+grain*paperGrainStrength;\n  gl_FragColor=vec4(color,1.0);\n  #include <tonemapping_fragment>\n  #include <colorspace_fragment>\n}"
    },
    "water": {
      "vertexShader": "\nvarying vec3 vWorld;\nvoid main() {\n  vec4 p = modelMatrix * vec4(position, 1.0);\n  vWorld = p.xyz;\n  gl_Position = projectionMatrix * viewMatrix * p;\n}",
      "fragmentShader": "\nuniform sampler2D surfaceTexture;\nuniform float surfaceDepthRef;\nuniform vec2 mapSize;\nuniform float seed;\nuniform vec3 paperColor, waterColor, inkColor;\nuniform vec3 tint;\nuniform float opacityDeep, paperStrength, rippleStrength, shoreSoftness;\nvarying vec3 vWorld;\nfloat hash(vec2 p) { return fract(sin(dot(p, vec2(127.1,311.7)) + seed) * 43758.5453); }\nfloat noise(vec2 p) {\n  vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);\n  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);\n}\nvoid main() {\n  vec2 p=vWorld.xz+(mapSize-1.0)*0.5;\n  vec2 uv=(clamp(p,vec2(0.0),mapSize-1.0)+0.5)/mapSize;\n  float depth=texture2D(surfaceTexture,uv).r*surfaceDepthRef;\n  float aa=max(fwidth(depth)*1.5,0.004);\n  // 连续岸线：从干到湿是 smoothstep，不再是格子阶跃。\n  float wet=smoothstep(0.0,aa+0.006*shoreSoftness,depth);\n  if(wet<=0.001)discard;\n  float deep=smoothstep(0.0,surfaceDepthRef*0.7,depth);\n  // 海（湖）主体回纸：越浅越接近纸色，深处也只混极淡花青。\n  vec3 color=mix(paperColor,waterColor,deep*(1.0-paperStrength)+0.10);\n  // 岸线一带再向纸晕开半格，水陆不再像两层格子叠放。\n  color=mix(color,paperColor,(1.0-deep)*paperStrength*0.55);\n  // 稀疏水纹：世界坐标锚定、低频、只取极少数亮/暗笔。\n  float ripple=smoothstep(0.76,0.95,noise(p*0.53+vec2(seed*0.01,3.7)))*smoothstep(0.02,0.10,depth);\n  color=mix(color,inkColor,ripple*rippleStrength*0.14);\n  float glint=smoothstep(0.90,0.995,noise(p*0.21+vec2(9.2,seed*0.02)))*deep;\n  color=mix(color,paperColor,glint*0.10);\n  float alpha=wet*mix(0.30,opacityDeep,deep);\n  gl_FragColor=vec4(color*tint,alpha);\n  #include <tonemapping_fragment>\n  #include <colorspace_fragment>\n}"
    },
    "boundary": {
      "vertexShader": "\nattribute float aVertical;\nattribute float aSeed;\nvarying vec3 vWorld;\nvarying vec3 vColor;\nvarying float vVertical;\nvarying float vSeed;\nvoid main() {\n  vec4 p = modelMatrix * vec4(position, 1.0);\n  vWorld = p.xyz;\n  vColor = color;\n  vVertical = aVertical;\n  vSeed = aSeed;\n  gl_Position = projectionMatrix * viewMatrix * p;\n}",
      "fragmentShader": "\nuniform vec3 tint;\nuniform vec3 paperColor, atmosphereColor, inkColor, rimColor;\nuniform float opacity;\nuniform float seed;\nuniform float strataStrength, dryBrushStrength, bottomFadeStrength, topBandStrength, inkVariation, boneStrength;\nvarying vec3 vWorld;\nvarying vec3 vColor;\nvarying float vVertical;\nvarying float vSeed;\nfloat hash(vec2 p) { return fract(sin(dot(p, vec2(127.1,311.7)) + seed + vSeed * 37.0) * 43758.5453); }\nfloat noise(vec2 p) {\n  vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);\n  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);\n}\nvoid main() {\n  vec3 color = vColor * tint;\n  // 竖向层理：沿高度分层，水平方向只做轻微起伏——像岩层被竖着剖开。\n  float layerNoise = noise(vec2(vWorld.y * 0.62 + vSeed * 11.0, (vWorld.x + vWorld.z) * 0.045));\n  float strata = smoothstep(0.32, 0.78, layerNoise);\n  color *= 1.0 - strata * strataStrength * 0.42;\n  // 斧劈式干笔：竖向长笔，横向极窄，稀疏而非铺满。\n  float brush = noise(vec2((vWorld.x + vWorld.z) * 0.075 + vSeed * 5.0, vWorld.y * 0.85));\n  float dry = smoothstep(0.55, 0.86, brush);\n  color = mix(color, inkColor, dry * dryBrushStrength * 0.30);\n  // 不规则墨量：整条边一个大尺度起伏，避免每堵墙一个模子。\n  float inkN = noise(vec2((vWorld.x - vWorld.z) * 0.021 + vSeed * 2.0, vSeed * 13.0));\n  color = mix(color, inkColor, inkN * inkVariation * 0.22);\n  // 底部向 atmosphere / paper 消隐：断面下缘不再是刀切边。\n  float bottom = 1.0 - smoothstep(0.0, 0.42, vVertical);\n  color = mix(color, mix(atmosphereColor, paperColor, 0.45), bottom * bottomFadeStrength);\n  // 顶缘极窄的纸纤维 / 矿物亮带。\n  float band = smoothstep(0.905, 0.985, vVertical) * (1.0 - smoothstep(0.985, 1.0, vVertical));\n  color = mix(color, rimColor, band * topBandStrength);\n  // 骨线：只在最深处留极细的浅色走向，避免大面积纯黑无层次。\n  float bone = smoothstep(0.86, 0.985, noise(vec2(vWorld.y * 1.35 + vSeed * 7.0, (vWorld.x + vWorld.z) * 0.12)));\n  color = mix(color, paperColor, bone * boneStrength * (1.0 - vVertical * 0.55));\n  gl_FragColor = vec4(color, opacity);\n  #include <tonemapping_fragment>\n  #include <colorspace_fragment>\n}"
    }
  }
}, styles:styles1});
export const ART_COMPARISON_SNAPSHOTS = freeze({"main-style":snapshot0,"c2d-style":snapshot1});
