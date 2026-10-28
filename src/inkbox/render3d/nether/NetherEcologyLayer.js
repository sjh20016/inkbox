import * as THREE from 'three';
import { hashString } from '../../core/noise.js';
import { sampleNetherGeography } from '../../world/netherGeography.js';
import { decorationFootprintOwned } from '../environment/RealmDecorationLayer.js';

export const NETHER_MIST_CAPACITY = 24;
/** Fixed, seed-stable samples. Terrain/river/yin dirties reevaluate only these
 * samples; ordinary frames do no terrain scan. Mist is decorative, never harm. */
export function netherMistCandidates(world) {
  const stride = Math.max(8, Math.ceil(Math.sqrt(world.size / 160)));
  const out = [];
  for (let y = 4; y < world.h - 4; y += stride) for (let x = 4; x < world.w - 4; x += stride) {
    const hash = hashString(`${world.seed}|mist:${x},${y}`);
    out.push({ x: Math.min(world.w - 3, x + hash % stride), y: Math.min(world.h - 3, y + (hash >>> 8) % stride), hash });
  }
  return out.sort((a, b) => a.hash - b.hash);
}
export function deriveNetherMist(world, candidates = netherMistCandidates(world)) {
  const out = [];
  for (const c of candidates) {
    const g = sampleNetherGeography(world, c.x, c.y);
    if (g.water > .0015 || g.yin < .30 || g.height > .44 || g.slope > .035) continue;
    out.push({ ...c, strength: Math.min(1, g.yin), width: 8 + c.hash % 7, depth: 5 + (c.hash >>> 5) % 4, rotationY: 0 });
    if (out.length === NETHER_MIST_CAPACITY) break;
  }
  return out;
}
export class NetherEcologyLayer {
  constructor(world, coordinates, elevation) {
    this.world = world; this.coordinates = coordinates; this.elevation = elevation;
    this.candidates = netherMistCandidates(world); this.layout = deriveNetherMist(world, this.candidates);
    this.group = new THREE.Group(); this.group.name = 'NetherValleyMist';
    this.geometry = new THREE.PlaneGeometry(1, 1); this.geometry.rotateX(-Math.PI / 2);
    this.material = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: { time: { value: 0 } },
      vertexShader: `varying vec2 vUv; varying float vStrength; attribute float mistStrength;
        void main(){vUv=uv;vStrength=mistStrength;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.0);}`,
      fragmentShader: `uniform float time;varying vec2 vUv;varying float vStrength;
        void main(){vec2 p=(vUv-.5)*2.;float a=exp(-dot(p,p)*3.)*(1.-smoothstep(.7,1.,length(p)));
        a*=.10+.035*sin(vUv.x*9.+time*.08);gl_FragColor=vec4(.68,.66,.61,a*vStrength);}` });
    this.geometry.setAttribute('mistStrength', new THREE.InstancedBufferAttribute(new Float32Array(NETHER_MIST_CAPACITY), 1));
    this.mesh = new THREE.InstancedMesh(this.geometry, this.material, NETHER_MIST_CAPACITY);
    this.mesh.name = 'NetherMist'; this.mesh.raycast = () => {}; this.mesh.frustumCulled = false;
    this.mesh.userData.presentationOnly = true; this.group.add(this.mesh);
    this.transform = new THREE.Object3D(); this.stats = { instances: 0, capacity: NETHER_MIST_CAPACITY, rebuilds: 0, soulInfluences: 0 };
    this.clock = 0; this.dirty = true; this.write();
  }
  setRegionGeometry(region, inside = true) {
    if (this.region === region && this.inside === !!inside) return;
    this.region = region; this.inside = !!inside; this.dirty = true;
  }
  update(dt = 0, terrainChanged = false) {
    if (terrainChanged) { this.layout = deriveNetherMist(this.world, this.candidates); this.dirty = true; }
    if (!this.group.visible) return;
    this.material.uniforms.time.value += Math.max(0, dt || 0); this.clock += Math.max(0, dt || 0);
    // Existing real souls only affect local mist opacity, at the scenery cadence.
    if (this.clock >= 2) { this.clock = 0; this.dirty = true; }
    if (this.dirty) this.write();
  }
  write() {
    const strength = this.geometry.getAttribute('mistStrength');
    const souls = [];
    for (const e of this.world.entities || []) if (e.soulKind && Number.isFinite(e.x) && Number.isFinite(e.y)) souls.push(e);
    let n = 0, influenced = 0;
    for (const r of this.layout) {
      if (!decorationFootprintOwned(this.world, this.region, this.inside, r)) continue;
      const nearby = souls.reduce((sum, e) => sum + (Math.abs(e.x - r.x) < 10 && Math.abs(e.y - r.y) < 7 ? 1 : 0), 0);
      const p = this.coordinates.worldToRender(r.x, r.y, this.elevation.at(r.x, r.y));
      this.transform.position.set(p.x, p.y + .65, p.z); this.transform.scale.set(r.width, 1, r.depth); this.transform.updateMatrix();
      this.mesh.setMatrixAt(n, this.transform.matrix); strength.setX(n, Math.min(1, r.strength + Math.min(nearby, 6) * .05));
      if (nearby) influenced++; n++;
    }
    this.mesh.count = n; this.mesh.instanceMatrix.needsUpdate = true; strength.needsUpdate = true;
    Object.assign(this.stats, { instances: n, rebuilds: this.stats.rebuilds + 1, soulInfluences: influenced }); this.dirty = false;
  }
  dispose() { this.mesh.dispose(); this.geometry.dispose(); this.material.dispose(); this.group.removeFromParent(); }
}
