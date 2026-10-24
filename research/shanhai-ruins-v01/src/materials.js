import * as THREE from '../../../vendor/three/build/three.module.js';

// Exact ordered slot semantics of the existing environment contract. This
// research library owns its restrained mineral swatches, with no runtime link.
export const SEMANTIC_SLOTS = Object.freeze(['paper', 'paperDeep', 'paperShade', 'mist', 'ink', 'inkMid', 'inkLight', 'stone', 'stoneDark', 'wood', 'woodDark', 'clay', 'cinnabar', 'rouge', 'gold', 'azurite', 'indigo', 'malachite', 'pineGreen', 'orchid', 'upperA', 'upperB', 'upperC', 'upperD', 'nether', 'netherMid', 'soulFlame', 'snow']);
const PALETTES = {
  mortal: ['e2d6ba','d2c6aa','c4b799','d9ddd0','353b35','545a4c','879084','bab8a0','797d68','786b4e','514c3e','ab9973','975e46','a27665','c5a667','688c85','576b78','708772','486c61','91828a','adc0b2','9cae9b','cbd1b6','eee5ca','3d4842','77877a','b08c6b','eee6d1'],
  upper: ['eee8d3','ddd9bd','c8c8b1','e1e9dc','45584f','678478','92a99a','c6cfbb','8faaa0','819781','587d70','b2b69a','ae816a','be9880','c5b779','7faaa5','698c9f','9bb996','668e80','aea2b2','b4d1c3','bdd7ca','d5dec5','f4edd9','657e72','99b5a2','b2d0be','f6f0dc'],
  nether: ['c5c8b8','aeb7a7','909d90','b7c3b6','273a35','40564c','73867a','899e8d','4b6358','5a6c5b','354b40','788875','925e4c','986c5f','a29870','729c91','516e76','688879','3f6356','7e7a86','8aa99b','a3bdac','b9c8b3','d1d7be','2d433b','607e6b','bd8b65','d8dac3'],
};
export const REALMS = Object.freeze(Object.keys(PALETTES));
export const STYLES = Object.freeze(['flat', 'toon', 'solid', 'ink']);
export function makeMaterial(realm, style, light) {
  if (!REALMS.includes(realm) || !STYLES.includes(style) || ![0, 1, 2].includes(light)) throw new Error('Invalid realm/style/light preset');
  const lookup = PALETTES[realm].map((_, i) => `if (slot == ${i}) pigment = palette[${i}];`).join('\n');
  const material = new THREE.ShaderMaterial({
    name: `ruins:${realm}:${style}:${light}`,
    polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
    uniforms: { palette: { value: PALETTES[realm].map(c => new THREE.Color(`#${c}`)) }, style: { value: STYLES.indexOf(style) }, keyLight: { value: new THREE.Vector3(...[[.3,.85,.45],[-.7,.45,.2],[.1,.4,-.9]][light]).normalize() } },
    vertexShader: `varying vec2 vUv; varying vec3 vN;
      void main() { vUv = uv; vec3 p = position; vec3 n = normal;
      #ifdef USE_INSTANCING
      vec3 scale2=vec3(dot(instanceMatrix[0].xyz,instanceMatrix[0].xyz),dot(instanceMatrix[1].xyz,instanceMatrix[1].xyz),dot(instanceMatrix[2].xyz,instanceMatrix[2].xyz));
      n=mat3(instanceMatrix)*(n/max(scale2,vec3(.000001))); p=(instanceMatrix*vec4(p,1.)).xyz;
      #endif
      vN=normalize(mat3(modelMatrix)*n); gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.); }`,
    fragmentShader: `uniform vec3 palette[28]; uniform int style; uniform vec3 keyLight; varying vec2 vUv; varying vec3 vN;
      void main(){ int slot=int(floor(vUv.y*8.))*8+int(floor(vUv.x*8.)); vec3 pigment=palette[7]; ${lookup}
      float d=dot(normalize(vN),keyLight); float shade=1.;
      if(style==1) shade=d>.55?1.05:(d>-.08?.82:.59);
      if(style==2) { pigment=palette[7]; shade=.7+.3*max(d,0.); }
      if(style==3) { pigment=(slot==8 || slot==25 || slot==4)?palette[4]:palette[27]; shade=d>0.?1.:.91; }
      gl_FragColor=vec4(pigment*shade,1.);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      }`,
  });
  material.userData = { realm, style, light, paletteSlots: 28 };
  return material;
}
