import * as THREE from 'three';
import { realmEnvironmentPalette, realmStyleFor } from '../art/RealmStyleProfile.js';

const PALETTE_SIZE = 28;
const colorUniforms = () => Array.from({ length: PALETTE_SIZE }, () => new THREE.Color(0xffffff));
const paletteLookup = Array.from({ length: PALETTE_SIZE }, (_, index) => `  if (slot == ${index}) resolved = uEnvironmentPalette[${index}];`).join('\n');

const VERTEX_SHADER = /* glsl */`
  varying vec2 vEnvironmentUv;
  varying vec3 vEnvironmentNormal;
  void main() {
    vec3 localPosition = position;
    vec3 worldNormal = normal;
    #ifdef USE_INSTANCING
      vec3 c0 = instanceMatrix[0].xyz;
      vec3 c1 = instanceMatrix[1].xyz;
      vec3 c2 = instanceMatrix[2].xyz;
      vec3 inverseScaleSquared = vec3(dot(c0,c0), dot(c1,c1), dot(c2,c2));
      vec3 correctedNormal = normal / max(inverseScaleSquared, vec3(0.000001));
      localPosition = (instanceMatrix * vec4(position, 1.0)).xyz;
      worldNormal = mat3(instanceMatrix) * correctedNormal;
    #endif
    vec4 viewPosition = modelViewMatrix * vec4(localPosition, 1.0);
    vEnvironmentUv = uv;
    vEnvironmentNormal = normalize(mat3(modelMatrix) * worldNormal);
    gl_Position = projectionMatrix * viewPosition;
  }
`;

const FRAGMENT_SHADER = /* glsl */`
  uniform sampler2D uEnvironmentAtlas;
  uniform vec3 uEnvironmentPalette[28];
  varying vec2 vEnvironmentUv;
  varying vec3 vEnvironmentNormal;
  void main() {
    float redByte = floor(texture2D(uEnvironmentAtlas, vEnvironmentUv).r * 255.0 + 0.5);
    int slot = int(clamp(redByte - 1.0, 0.0, 27.0));
    vec3 resolved = uEnvironmentPalette[0];
${paletteLookup}
    vec3 lightDirection = normalize(vec3(-0.35, 0.82, 0.44));
    float brushLight = 0.92 + 0.08 * max(dot(normalize(vEnvironmentNormal), lightDirection), 0.0);
    gl_FragColor = vec4(resolved * brushLight, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

function paletteFor(profile, plane) {
  const style = profile?.realmStyle || (profile?.building?.palette ? profile : null) || realmStyleFor(plane);
  const palette = realmEnvironmentPalette(style);
  if (palette.length !== PALETTE_SIZE) throw new Error('Environment realm palette must contain 28 slots');
  return palette;
}

/** One opaque atlas-index material per PlaneStage. */
export function createEnvironmentMaterial(library, plane) {
  if (!library?.texture || library.disposed) throw new Error('Environment material requires a live library atlas');
  const material = new THREE.ShaderMaterial({
    name: `environment_${plane}_palette`,
    uniforms: {
      uEnvironmentAtlas: { value: library.texture },
      uEnvironmentPalette: { value: colorUniforms() },
    },
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    side: THREE.FrontSide,
    transparent: false,
    opacity: 1,
    depthWrite: true,
    depthTest: true,
    toneMapped: true,
  });
  material.userData.environmentPlane = plane;
  material.userData.environmentProfile = null;
  material.userData.environmentView = null;
  material.customProgramCacheKey = () => 'inkbox_environment_index_palette_v1';
  setEnvironmentMaterialProfile(material, null);
  return material;
}

/** Change colors through RealmStyleProfile uniforms without recompiling. */
export function setEnvironmentMaterialProfile(material, profile) {
  if (!material?.uniforms?.uEnvironmentPalette) return material;
  const palette = paletteFor(profile, material.userData.environmentPlane);
  const uniforms = material.uniforms.uEnvironmentPalette.value;
  for (let i = 0; i < PALETTE_SIZE; i++) uniforms[i].set(palette[i]);
  material.userData.environmentProfile = profile || null;
  return material;
}

/** Keep the presentation view available for stage diagnostics; palette is shared. */
export function setEnvironmentMaterialView(material, view) {
  if (!material?.uniforms?.uEnvironmentPalette) return material;
  material.userData.environmentView = view ?? null;
  return material;
}
