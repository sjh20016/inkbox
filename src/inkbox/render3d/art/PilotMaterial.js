import * as THREE from 'three';

export function createPilotMaterial(profile = {}, height = 1, { opacity = 1 } = {}) {
  const material = new THREE.ShaderMaterial({
    vertexColors: true,
    uniforms: {
      paperColor: { value: new THREE.Color('#f5f2ea') },
      pigmentSaturation: { value: 0.10 }, silhouetteInkStrength: { value: 0.25 },
      distanceFade: { value: 0.35 }, dryBrushStrength: { value: 0.15 },
      projectedPixels: { value: 32 }, baseHeight: { value: height },
      pilotOpacity: { value: opacity },
    },
    vertexShader: `
      varying vec3 vPigment; varying vec3 vWorld; varying vec3 vNormal;
      varying float vPixels;
      uniform float projectedPixels; uniform float baseHeight;
      void main() {
        vec4 p = vec4(position, 1.0); vec3 n = normal; float scale = 1.0;
        #ifdef USE_INSTANCING
          p = instanceMatrix * p;
          mat3 im = mat3(instanceMatrix);
          n /= max(vec3(0.000001), vec3(dot(im[0], im[0]), dot(im[1], im[1]), dot(im[2], im[2])));
          n = im * n;
          scale = length(instanceMatrix[1].xyz);
        #endif
        vec4 w = modelMatrix * p;
        vWorld = w.xyz; vNormal = normalize(mat3(modelMatrix) * n);
        vPigment = color;
        #ifdef USE_INSTANCING_COLOR
          // A subtle tint retains faction/state semantics without coloring paper walls.
          float semanticWeight = dot(color, vec3(1.0)) > 2.99 ? 1.0 : 0.08;
          vPigment *= mix(vec3(1.0), instanceColor, semanticWeight);
        #endif
        vPixels = projectedPixels * baseHeight * scale;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: `
      varying vec3 vPigment; varying vec3 vWorld; varying vec3 vNormal;
      varying float vPixels;
      uniform vec3 paperColor; uniform float pigmentSaturation;
      uniform float silhouetteInkStrength; uniform float distanceFade; uniform float dryBrushStrength;
      uniform float pilotOpacity;
      float patchHash(vec3 p) {
        return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
      }
      float pigmentPatch(vec3 p) {
        vec3 cell = floor(p); vec3 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        float low = mix(mix(patchHash(cell), patchHash(cell + vec3(1, 0, 0)), f.x),
          mix(patchHash(cell + vec3(0, 1, 0)), patchHash(cell + vec3(1, 1, 0)), f.x), f.y);
        float high = mix(mix(patchHash(cell + vec3(0, 0, 1)), patchHash(cell + vec3(1, 0, 1)), f.x),
          mix(patchHash(cell + vec3(0, 1, 1)), patchHash(cell + vec3(1, 1, 1)), f.x), f.y);
        return mix(low, high, f.z);
      }
      void main() {
        float detail = smoothstep(3.0, 22.0, vPixels);
        float lum = dot(vPigment, vec3(0.299, 0.587, 0.114));
        vec3 pigment = mix(vec3(lum), vPigment, pigmentSaturation);
        vec3 normalDirection = normalize(vNormal);
        float silhouette = 1.0 - abs(dot(normalDirection, normalize(cameraPosition - vWorld)));
        float ink = smoothstep(0.60, 0.98, silhouette) * silhouetteInkStrength * detail;
        // Broad, smooth 3D pigment patches preserve the tree/robe/wall color masses.
        // Maximum release is 12% of dryBrushStrength, never high-frequency white speckles.
        float brushPatchValue = pigmentPatch(vWorld * 0.38);
        float dry = smoothstep(0.72, 0.92, brushPatchValue) * dryBrushStrength * 0.12 * detail;
        // A fixed brush-light direction models planes with at most 8% darkening; no PBR.
        float facing = max(0.0, dot(normalDirection, normalize(vec3(-0.45, 0.82, 0.35))));
        pigment *= 0.92 + 0.08 * facing;
        vec3 col = mix(pigment, vec3(0.022, 0.025, 0.026), ink);
        col = mix(col, paperColor, dry);
        col = mix(col, paperColor, (1.0 - detail) * distanceFade);
        gl_FragColor = vec4(col, pilotOpacity);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  material.name = 'Pilot:SharedPalette';
  material.transparent = opacity < 1;
  material.depthWrite = opacity >= 1;
  updatePilotMaterial(material, profile);
  return material;
}

export function updatePilotMaterial(material, profile = {}) {
  material.uniforms.paperColor.value.set(profile.paperColor || '#f5f2ea');
  for (const [key, fallback] of Object.entries({ pigmentSaturation: 0.10, silhouetteInkStrength: 0.25, distanceFade: 0.35, dryBrushStrength: 0.15 })) {
    material.uniforms[key].value = Number.isFinite(profile[key]) ? Math.max(0, Math.min(1, profile[key])) : fallback;
  }
}

export function setPilotView(material, { pixelsPerUnit } = {}) {
  if (Number.isFinite(pixelsPerUnit)) material.uniforms.projectedPixels.value = Math.max(0, pixelsPerUnit);
}
