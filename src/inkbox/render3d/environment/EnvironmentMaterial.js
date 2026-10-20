import * as THREE from 'three';
import { realmEnvironmentPalette, realmStyleFor } from '../art/RealmStyleProfile.js';

const PALETTE_SIZE = 28;
const OUTLINE_BATCHES = 'environmentOutlineBatches';
const colorUniforms = () => Array.from({ length: PALETTE_SIZE }, () => new THREE.Color(0xffffff));
const paletteLookup = Array.from({ length: PALETTE_SIZE }, (_, index) => `  if (slot == ${index}) resolved = uEnvironmentPalette[${index}];`).join('\n');

const VERTEX_SHADER = /* glsl */`
  varying vec2 vEnvironmentUv;
  varying vec3 vEnvironmentNormal;
  varying vec3 vEnvironmentWorld;
  varying float vInkFade;
  uniform float uOutline, uOutlineWidth;
  void main() {
    vInkFade = 1.0;
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
    if (uOutline > 0.5) {
      // V1.1 inverted-hull ink line: offset in instance-local space before the instance transform.
      // Flat-shaded GLB faces carry split normals; blend with the radial direction so the hull stays closed.
      vec3 radial = position - vec3(0.0, 0.42, 0.0);
      vec3 grown = position + normalize(normalize(normal) * 0.35 + normalize(radial + vec3(1e-4))) * uOutlineWidth;
      #ifdef USE_INSTANCING
        localPosition = (instanceMatrix * vec4(grown, 1.0)).xyz;
      #else
        localPosition = grown;
      #endif
    }
    vec4 viewPosition = modelViewMatrix * vec4(localPosition, 1.0);
    if (uOutline > 0.5) {
      // V1.2：墨线按屏幕尺寸淡出——远景的小屋不再各自描一圈黑边。
      float instScale = 1.0;
      #ifdef USE_INSTANCING
        instScale = length(instanceMatrix[1].xyz);
      #endif
      vec4 clipC = projectionMatrix * viewPosition;
      float px = abs(projectionMatrix[1][1]) * 450.0 * instScale / max(abs(clipC.w), 1e-4);
      vInkFade = smoothstep(9.0, 26.0, px);
    }
    vEnvironmentWorld = (modelMatrix * vec4(localPosition, 1.0)).xyz;
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
  varying vec3 vEnvironmentWorld;
  uniform float uToon, uOutline;
  uniform vec3 uInkColor, uShadowCool, uPaperTone;
  varying float vInkFade;
  void main() {
    if (uOutline > 0.5) {
      if (uToon < 0.5 || vInkFade < 0.02) discard;
      gl_FragColor = vec4(mix(uPaperTone * 0.82, uInkColor, vInkFade * 0.88), 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      return;
    }
    float redByte = floor(texture2D(uEnvironmentAtlas, vEnvironmentUv).r * 255.0 + 0.5);
    int slot = int(clamp(redByte - 1.0, 0.0, 27.0));
    vec3 resolved = uEnvironmentPalette[0];
${paletteLookup}
    vec3 lightDirection = normalize(vec3(-0.35, 0.82, 0.44));
    float brushLight = 0.92 + 0.08 * max(dot(normalize(vEnvironmentNormal), lightDirection), 0.0);
    vec3 shaded = resolved * brushLight;
    if (uToon > 0.5) {
      // V1.1 三渲二：受光 / 中间 / 背光三档平涂，背光偏冷，受光略透纸色。
      vec3 n = normalize(vEnvironmentNormal);
      float ndl = dot(n, normalize(vec3(-0.45, 0.80, -0.38)));
      float lit = smoothstep(0.30, 0.50, ndl), mid = smoothstep(-0.16, 0.04, ndl);
      vec3 shadow = mix(resolved * 0.82, uShadowCool, 0.10);
      shaded = mix(shadow, resolved * 0.94, mid);
      shaded = mix(shaded, mix(resolved, uPaperTone, 0.06), lit);
    }
    gl_FragColor = vec4(shaded, 1.0);
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
      uToon: { value: 0 }, uOutline: { value: 0 }, uOutlineWidth: { value: 0.035 },
      uInkColor: { value: new THREE.Color('#2B2925') }, uShadowCool: { value: new THREE.Color('#3A4E58') }, uPaperTone: { value: new THREE.Color('#F2ECDD') },
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
  // V1.1 · ink outline twin: same program family, BackSide hull. Owned by (and disposed with) the material.
  const outline = material.clone();
  outline.name = `environment_${plane}_ink`; outline.side = THREE.BackSide;
  outline.uniforms = THREE.UniformsUtils.clone(material.uniforms);
  outline.uniforms.uEnvironmentAtlas.value = library.texture; outline.uniforms.uOutline.value = 1;
  outline.customProgramCacheKey = () => 'inkbox_environment_index_palette_v1_ink';
  material.userData.outlineMaterial = outline;
  const baseDispose = material.dispose.bind(material);
  material.dispose = () => {
    material.userData[OUTLINE_BATCHES]?.clear();
    outline.dispose(); baseDispose();
  };
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
  const sh = !!profile?.realmStyle?.shanhai, plane = material.userData.environmentPlane;
  material.uniforms.uToon.value = sh ? 1 : 0;
  material.userData.toonOutline = sh;
  for (const batch of material.userData[OUTLINE_BATCHES] || []) batch.syncOutlineVisibility();
  const outline = material.userData.outlineMaterial;
  if (outline) {
    outline.uniforms.uToon.value = sh ? 1 : 0;
    outline.uniforms.uInkColor.value.set(plane === 'nether' ? '#0E0D0C' : plane === 'upper' ? '#3E4A5A' : '#3A3732');
    outline.uniforms.uOutlineWidth.value = plane === 'nether' ? 0.07 : 0.05;
  }
  material.uniforms.uShadowCool.value.set(plane === 'nether' ? '#141312' : plane === 'upper' ? '#5E6886' : '#55625F');
  return material;
}

/** Register live batches so profile switches update existing outline instances immediately. */
export function registerEnvironmentOutlineBatch(material, batch) {
  if (!material?.isMaterial || !batch) return;
  (material.userData[OUTLINE_BATCHES] ||= new Set()).add(batch);
}

/** Remove a batch from the material-owned profile update set. */
export function unregisterEnvironmentOutlineBatch(material, batch) {
  material?.userData?.[OUTLINE_BATCHES]?.delete(batch);
}

/** Keep the presentation view available for stage diagnostics; palette is shared. */
export function setEnvironmentMaterialView(material, view) {
  if (!material?.uniforms?.uEnvironmentPalette) return material;
  material.userData.environmentView = view ?? null;
  return material;
}
