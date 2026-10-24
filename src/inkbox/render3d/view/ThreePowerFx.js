import * as THREE from 'three';
import { decorationFootprintOwned } from '../environment/RealmDecorationLayer.js';
import { RENDER_ORDER } from '../shared/RenderOrder.js';

export const POWER_EVENT_CAP = 24;
export const POWER_INSTANCE_CAP = Object.freeze({ stroke: 288, leaf: 192, ring: 48 });
const INK = Object.freeze({ green: 0x71947a, pale: 0xb0b790, soil: 0x8d755c,
  rain: 0x839da7, water: 0x5c8996, fire: 0xb76e4b, ash: 0x484943,
  gold: 0xb29c65, thunder: 0xd3c8a4, spirit: 0x86a8a2, snow: 0xb9c5c3 });
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/** Three presentation only: fixed shared meshes, no world mutations or queue drains. */
export class ThreePowerFx {
  constructor({ plane, coordinates, elevation }) {
    this.plane = plane; this.coordinates = coordinates; this.elevation = elevation;
    this.root = new THREE.Group(); this.root.name = `PowerFx:${plane}`;
    this.batches = {};
    const forms = {
      stroke: new THREE.CylinderGeometry(.5, .5, 1, 4, 1),
      leaf: new THREE.ConeGeometry(.5, 1, 4, 1),
      ring: new THREE.TorusGeometry(1, .035, 3, 24),
    };
    forms.ring.rotateX(-Math.PI / 2);
    for (const [kind, geometry] of Object.entries(forms)) {
      const material = new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: false,
        transparent: true, opacity: kind === 'ring' ? .74 : .86,
        side: THREE.DoubleSide, depthTest: true, depthWrite: false });
      const mesh = new THREE.InstancedMesh(geometry, material, POWER_INSTANCE_CAP[kind]);
      mesh.name = `PowerFx:${plane}:${kind}`; mesh.count = 0; mesh.visible = false;
      mesh.frustumCulled = false; mesh.renderOrder = RENDER_ORDER.fx;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.userData.presentationOnly = true; mesh.raycast = () => {};
      this.batches[kind] = { mesh, geometry, material }; this.root.add(mesh);
    }
    this.object = new THREE.Object3D(); this.start = new THREE.Vector3(); this.end = new THREE.Vector3();
    this.delta = new THREE.Vector3(); this.mid = new THREE.Vector3(); this.cameraPoint = new THREE.Vector3();
    this.color = new THREE.Color();
    this.footprint = { x: 0, y: 0, width: 0, depth: 0, rotationY: 0 };
    this.stats = { active: 0, drawCalls: 0, triangles: 0, caps: { ...POWER_INSTANCE_CAP, events: POWER_EVENT_CAP },
      truncated: 0, regionRejected: 0, instances: { stroke: 0, leaf: 0, ring: 0 } };
  }

  clear() {
    for (const batch of Object.values(this.batches)) { batch.mesh.count = 0; batch.mesh.visible = false; }
    this.stats.active = this.stats.drawCalls = this.stats.triangles = this.stats.truncated = this.stats.regionRejected = 0;
    for (const kind of Object.keys(POWER_INSTANCE_CAP)) this.stats.instances[kind] = 0;
  }

  owned(world, region, inside, x, y, reach = .25) {
    const f = this.footprint; f.x = x; f.y = y; f.width = f.depth = reach * 2; f.rotationY = 0;
    if (decorationFootprintOwned(world, region, inside, f)) return true;
    this.stats.regionRejected++; return false;
  }

  ownedStroke(ax, ay, bx, by, width) {
    const f = this.footprint;
    f.x = (ax + bx) * .5; f.y = (ay + by) * .5;
    // CylinderGeometry's horizontal radius is width/2. The full axis-aligned
    // box conservatively covers both ends and every point between them.
    f.width = Math.abs(ax - bx) + width;
    f.depth = Math.abs(ay - by) + width;
    f.rotationY = 0;
    if (decorationFootprintOwned(this.clipWorld, this.clipRegion, this.clipInside, f)) return true;
    this.stats.regionRejected++; return false;
  }

  point(x, y, lift = 0) {
    const ground = this.elevation.at(x, y);
    if (!Number.isFinite(ground)) return null;
    return this.coordinates.worldToRender(x, y, ground + lift);
  }

  place(kind, x, y, height, sx, sy, sz, color, angle = 0) {
    const b = this.batches[kind]; if (b.mesh.count >= POWER_INSTANCE_CAP[kind]) { this.stats.truncated++; return; }
    // Check the actual submitted primitive, not only its event center. Torus
    // tube adds 3.5% beyond ring radius; cone base adds half its scale.
    const reach = kind === 'ring' ? Math.max(sx, sz) * 1.035
      : Math.max(sx, sz) * .5;
    if (!this.owned(this.clipWorld, this.clipRegion, this.clipInside, x, y, reach)) return;
    const p = this.point(x, y, height); if (!p || ![p.x, p.y, p.z].every(Number.isFinite)) return;
    this.object.position.set(p.x, p.y, p.z); this.object.rotation.set(0, angle, 0);
    this.object.scale.set(sx, sy, sz); this.object.updateMatrix();
    const i = b.mesh.count++; b.mesh.setMatrixAt(i, this.object.matrix); b.mesh.setColorAt(i, this.color.setHex(color));
  }

  stroke(ax, ay, ah, bx, by, bh, width, color) {
    const b = this.batches.stroke; if (b.mesh.count >= POWER_INSTANCE_CAP.stroke) { this.stats.truncated++; return; }
    if (!this.ownedStroke(ax, ay, bx, by, width)) return;
    const a = this.point(ax, ay, ah), z = this.point(bx, by, bh);
    if (!a || !z) return;
    this.start.set(a.x, a.y, a.z); this.end.set(z.x, z.y, z.z);
    this.delta.subVectors(this.end, this.start); const len = this.delta.length(); if (len < .01) return;
    this.object.position.copy(this.mid.addVectors(this.start, this.end).multiplyScalar(.5));
    this.object.quaternion.setFromUnitVectors(Y_AXIS, this.delta.multiplyScalar(1 / len));
    this.object.scale.set(width, len, width); this.object.updateMatrix();
    const i = b.mesh.count++; b.mesh.setMatrixAt(i, this.object.matrix); b.mesh.setColorAt(i, this.color.setHex(color));
  }

  update(items, world, region = null, inside = true, { camera = null } = {}) {
    this.clear();
    if (this.disposed || !world || !Array.isArray(items) || !this.coordinates || !this.elevation) return;
    this.clipWorld = world; this.clipRegion = region; this.clipInside = inside;
    for (const item of items) {
      if (item.kind !== 'power' || item.plane !== this.plane || ![item.x, item.y, item.age, item.ttl].every(Number.isFinite)
        || !(item.ttl > 0) || item.age < 0 || item.age >= item.ttl) continue;
      if (this.stats.active >= POWER_EVENT_CAP) { this.stats.truncated++; continue; }
      const x = item.x, y = item.y, radius = clamp(Number(item.data?.radius) || 1, .7, 7);
      if (!this.owned(world, region, inside, x, y)) continue;
      const p = item.age / item.ttl, tool = item.data?.tool, seed = Number.isFinite(item.seed) ? item.seed : 0;
      const point = this.point(x, y, 0);
      const distance = camera?.position && point
        ? camera.position.distanceTo(this.cameraPoint.set(point.x, point.y, point.z)) : 0;
      const screenDistance = camera?.isOrthographicCamera ? distance / Math.max(1, camera.zoom) : distance;
      const detail = screenDistance > 130 ? 3 : screenDistance > 65 ? 6 : 10;
      this.drawPower(tool, item, world, region, inside, x, y, radius, p, seed, detail);
      this.stats.active++;
    }
    for (const [kind, b] of Object.entries(this.batches)) {
      const n = b.mesh.count; b.mesh.visible = n > 0; this.stats.instances[kind] = n;
      if (n) { b.mesh.instanceMatrix.needsUpdate = true; b.mesh.instanceColor.needsUpdate = true;
        this.stats.drawCalls++; this.stats.triangles += n * (b.geometry.index?.count ?? b.geometry.attributes.position.count) / 3; }
    }
  }

  drawPower(tool, item, world, region, inside, x, y, r, p, seed, detail) {
    const ring = (radius, color, lift = .12) => this.place('ring', x, y, lift, radius, 1, radius, color);
    const spoke = (i, n, inner, outer, h0, h1, width, color) => {
      const a = i * Math.PI * 2 / n + seed * 6.28, ca = Math.cos(a), sa = Math.sin(a);
      const mx = x + (inner + outer) * .5 * ca, my = y + (inner + outer) * .5 * sa;
      if (this.owned(world, region, inside, mx, my, .18)) this.stroke(x + inner * ca, y + inner * sa, h0,
        x + outer * ca, y + outer * sa, h1, width, color);
    };
    switch (tool) {
      case 'forest': {
        const count = Math.max(2, Math.ceil(detail * clamp(p * 2, .1, 1)));
        for (let i = 0; i < count; i++) {
          const a = i * 2.4 + seed * 6.28, d = r * Math.sqrt((i + .4) / (detail + .5)) * .8;
          const xx = x + Math.cos(a) * d, yy = y + Math.sin(a) * d;
          if (!this.owned(world, region, inside, xx, yy, .28)) continue;
          const grow = clamp((p * 1.7 - i / (detail * 1.5)) * 2, .05, 1);
          this.stroke(xx, yy, .12, xx, yy, .12 + grow * 1.25, .09, INK.soil);
          this.place('leaf', xx, yy, .38 + grow * 1.05, .55, grow * 1.35, .55, INK.green, a);
        }
        break;
      }
      case 'fertile':
        ring(r * (.35 + p * .55), INK.green);
        for (let i = 0; i < detail; i++) spoke(i, detail, .2, r * .75, .13, .13, .055, i % 2 ? INK.soil : INK.pale);
        break;
      case 'rain':
        // Broken cloud strokes gather first; later rings read as wet ground.
        for (let i = 0; i < Math.min(detail, 7); i++) {
          const a = i * 2.4 + seed * 6.28, d = r * Math.sqrt((i + .5) / detail) * .55;
          const xx = x + Math.cos(a) * d, yy = y + Math.sin(a) * d;
          if (this.owned(world, region, inside, xx, yy, .22))
            this.stroke(xx - .34, yy, 3.1 + .15 * Math.sin(i), xx + .34, yy + .08, 3.1 + .15 * Math.sin(i), .15, INK.rain);
        }
        ring(r * .65, INK.rain, 3.1);
        for (let i = 0; i < detail; i++) {
          const a = i * 2.4 + seed * 6.28, d = r * Math.sqrt(i / detail) * .8;
          const xx = x + Math.cos(a) * d, yy = y + Math.sin(a) * d;
          if (this.owned(world, region, inside, xx, yy, .15)) this.stroke(xx, yy, 1.9 + (1-p)*1.4,
            xx + .12, yy + .08, .2 + (1-p)*1.4, .045, INK.rain);
        }
        ring(r * p * .8 + .2, INK.water); break;
      case 'burn': case 'lava':
        ring(r * .7, INK.ash);
        for (let i = 0; i < detail; i++) {
          const a = i * 2.4 + seed * 6.28, d = r * Math.sqrt(i / detail) * .7;
          const xx = x + Math.cos(a)*d, yy = y + Math.sin(a)*d;
          if (this.owned(world, region, inside, xx, yy, .2)) this.stroke(xx, yy, .12, xx+.12, yy, .3 + (1-p)*1.6*(i%3+1)/3,
            .09, p > .65 ? INK.ash : INK.fire);
        } break;
      case 'leyline':
        for (let i = 0; i < detail; i++) spoke(i, detail, .15, r * (.35 + p * .6), .14, .2 + .3 * Math.sin(i), .085,
          i % 3 ? INK.spirit : INK.gold);
        ring(.45 + r * .18, INK.gold, .25); break;
      case 'root': case 'cultivator':
        for (let i = 0; i < detail; i++) spoke(i, detail, .35, 1.2 + .3 * Math.sin(p*6+i), .12,
          .75 + 1.2 * clamp(p*2,0,1), .055, i%3 ? INK.spirit : INK.gold);
        ring(.5 + p*.9, INK.spirit, .75 + p*.8); break;
      case 'lightning': case 'tribulation':
        if (p < .22) { ring(.5 + p * r * 2, INK.thunder, 3.5); break; }
        if (p < .67) {
          this.stroke(x-.2,y,6.4,x+.28,y,4.2,.25,INK.thunder);
          this.stroke(x+.28,y,4.2,x-.2,y,2.3,.24,INK.thunder);
          this.stroke(x-.2,y,2.3,x,y,.16,.3,INK.thunder);
          for (let i=0;i<4;i++) spoke(i,4,.1,r*.65,1.7,.4,.07,INK.thunder);
        } else { ring(r*.4, INK.ash); for (let i=0;i<4;i++) spoke(i,4,.2,r*.5,.15,.4,.06,INK.fire); }
        break;
      case 'meteor':
        if (p < .38) {
          this.place('leaf',x,y,6.5-p*14,1.2,1.8,1.2,INK.fire);
          this.stroke(x-r*.5,y-r*.3,9,x,y,6.5-p*14,.15,INK.ash);
        } else if (p < .72) {
          ring(r*(p-.3)*1.8, INK.fire);
          for (let i=0;i<detail;i++) spoke(i,detail,.3,r*.8,.2,.3+(1-p)*3,.13,INK.soil);
        } else { ring(r*.64,INK.ash); for (let i=0;i<5;i++) spoke(i,5,r*.4,r*.65,.2,.36,.07,INK.fire); }
        break;
      case 'quake':
        for (let i=0;i<detail;i++) spoke(i,detail,.15,r*(.35+p*.6),.14,.15+(1-p)*.8,.11,INK.ash);
        if (p < .7) for(let i=0;i<Math.min(detail,6);i++) {
          const a=i*2.4,d=r*.5,xx=x+Math.cos(a)*d,yy=y+Math.sin(a)*d;
          if(this.owned(world,region,inside,xx,yy,.2))this.place('leaf',xx,yy,.4+(1-p)*1.6,.32,.4,.32,INK.soil,a);
        } break;
      case 'water-response': case 'flood': case 'water': case 'drain': {
        const recede = item.data?.phase === 'recede' || tool === 'drain';
        // This is a brief read-only echo of a settled water edit. The real
        // water mesh already shows the final depth and remains authoritative.
        const flow = recede ? 1-p : p;
        ring(.3+r*.75*flow,INK.water,.2);
        for(let i=0;i<detail;i++) spoke(i,detail,r*.15,r*(.3+.65*flow),.22,.3+(i%3)*.12,.07,
          i%3?INK.water:INK.rain);
        if(p>.2&&p<.8) for(let i=0;i<3;i++) spoke(i,3,r*.4,r*.55,.4,.05,.12,INK.water);
        break;
      }
      case 'raise': case 'lower': case 'flatten': case 'roughen':
        for(let i=0;i<detail;i++) spoke(i,detail,.12,r*.7,.1,.2+(tool==='raise'?p*1.4:tool==='lower'?(1-p)*.7:.2),.1,INK.soil);
        break;
      case 'sand': case 'snow': case 'road':
        for(let i=0;i<detail;i++) spoke(i,detail,.1,r*.7,.13,.13,.065,
          tool==='snow'?INK.snow:tool==='sand'?INK.soil:INK.ash);
        break;
      default:
        // Remaining formal life/dao tools get a restrained, legible sigil.
        ring(.5 + r*.3*p, tool==='plague'||tool==='erase'?INK.ash:INK.gold, .2);
        for(let i=0;i<Math.min(5,detail);i++) spoke(i,5,.15,r*.45,.13,.7*(1-p)+.13,.06,INK.spirit);
    }
  }

  dispose() {
    if (this.disposed) return; this.disposed = true; this.clear();
    for (const b of Object.values(this.batches)) { b.mesh.removeFromParent(); b.mesh.dispose(); b.geometry.dispose(); b.material.dispose(); }
    this.root.removeFromParent();
  }
}
