import * as THREE from '../../../vendor/three/build/three.module.js';

// Authored silhouettes, Y-up, ground pivot. Every component is flattened into
// one non-indexed, flat-normal geometry; UVs are semantic 8×8 cell centers.
class Sculpt {
  constructor() { this.p = []; this.uv = []; }
  tri(a, b, c, slot) {
    this.p.push(...a, ...b, ...c);
    for (let i = 0; i < 3; i++) this.uv.push(((slot % 8) + .5) / 8, (Math.floor(slot / 8) + .5) / 8);
  }
  prism(points, depth, slot = 7, center = [0, 0, 0], rotation = 0) {
    let poly = points.map(p => new THREE.Vector2(...p));
    if (THREE.ShapeUtils.isClockWise(poly)) poly.reverse();
    const c = Math.cos(rotation), s = Math.sin(rotation);
    const at = (i, z) => [center[0] + poly[i].x * c + z * s, center[1] + poly[i].y, center[2] - poly[i].x * s + z * c];
    for (const [a, b, d] of THREE.ShapeUtils.triangulateShape(poly, [])) {
      this.tri(at(a, depth / 2), at(b, depth / 2), at(d, depth / 2), slot);
      this.tri(at(d, -depth / 2), at(b, -depth / 2), at(a, -depth / 2), slot);
    }
    for (let i = 0; i < poly.length; i++) {
      const j = (i + 1) % poly.length;
      this.tri(at(i, -depth / 2), at(j, -depth / 2), at(j, depth / 2), slot);
      this.tri(at(i, -depth / 2), at(j, depth / 2), at(i, depth / 2), slot);
    }
  }
  box(x, y, z, w, h, d, slot = 7, rotation = 0) {
    this.prism([[-w / 2, 0], [w / 2, 0], [w / 2, h], [-w / 2, h]], d, slot, [x, y, z], rotation);
  }
  shard(x, y, z, w, h, d, slot = 7, rotation = 0) {
    this.prism([[-w / 2, 0], [w / 2, 0], [w * .21, h]], d, slot, [x, y, z], rotation);
  }
  tetra(x, z, w, h, slot = 7) {
    const a = [x - w / 2, 0, z - w / 2], b = [x + w / 2, 0, z - w / 2], c = [x, 0, z + w / 2], d = [x, h, z];
    this.tri(a, b, c, slot); this.tri(a, d, b, slot); this.tri(b, d, c, slot); this.tri(c, d, a, slot);
  }
  finish(name) {
    const g = new THREE.BufferGeometry(); g.name = name;
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.computeVertexNormals(); g.computeBoundingBox(); g.computeBoundingSphere();
    return g;
  }
}

function gate(g, lod) {
  if (lod === 2) {
    g.tetra(-.76, 0, .5, 3.3); g.tetra(.76, 0, .5, 3.3);
    g.prism([[-1.65, 3.1], [1.65, 3.1], [0, 3.65]], .85, 18); return;
  }
  g.box(-.76, 0, 0, .48, 3.02, .62); g.box(.76, 0, 0, .48, 3.02, .62);
  g.box(0, 2.66, 0, 1.55, .34, .58, 8);
  // Suspended roof: rising ends, deep overhang and a pale slit below the eave.
  g.prism([[-1.75, 3.25], [-1.45, 3.08], [0, 3.42], [1.45, 3.08], [1.75, 3.25], [0, 3.72]], 1.1, 18);
  g.shard(1.45, 0, .22, .34, 2.03, .22, 8, -.2);
  if (lod === 1) return;
  g.box(0, 0, .08, 2.25, .16, 1.4, 8);
  g.box(0, 0, .93, 1.8, .08, .4, 7);
  for (const x of [-.76, .76]) {
    g.box(x, .17, 0, .64, .18, .76, 8);
    g.box(x, 2.47, 0, .62, .13, .72, 14);
  }
  g.box(0, 2.82, .33, .6, .36, .07, 9);
  g.box(0, 2.9, .375, .2, .15, .012, 14);
  g.box(0, 3.56, 0, 2.5, .09, .13, 15);
  g.box(1.46, .4, .34, .032, .9, .015, 14);
  g.shard(-1.3, 0, -.51, .44, .2, .35, 8, .4);
}

function ruin(g, lod, state) {
  const abandoned = state === 'abandoned';
  if (lod === 2) {
    g.prism([[-1.4, 0], [1.4, 0], [1.4, .33], [.2, .48], [-.4, abandoned ? .72 : 1.5], [-1.4, abandoned ? .96 : 1.85]], .16, 7, [0, 0, -.65]);
    return;
  }
  g.box(0, 0, 0, 3.25, .15, 2.3, 8);
  g.prism([[-1.4, 0], [-.35, 0], [-.35, abandoned ? .45 : 1.3], [-.66, 1.16], [-.9, 1.9], [-1.4, 1.78]], .16, 0, [0, .15, -.8]);
  g.prism([[-.75, 0], [.75, 0], [.75, .64], [.3, .8], [-.12, abandoned ? 1.3 : 1.85], [-.75, 1.62]], .18, 7, [-1.34, .15, -.05], Math.PI / 2);
  g.box(.55, .15, -.8, .18, abandoned ? .65 : 1.8, .2, 10);
  if (!abandoned) g.prism([[-1.6, 1.88], [-.8, 2.47], [-.3, 2.1], [-.2, 1.9]], 1.45, 18, [0, 0, -.3]);
  else g.shard(.5, .15, .35, 1.25, .35, .65, 18, -.5);
  if (lod === 1) return;
  g.box(.15, .16, .81, 2.55, .18, .18, 8);
  g.box(-1.29, 1.25, -.15, .1, .48, .11, 10);
  g.box(-.57, .16, .3, .13, .13, 1.8, 10, -.62);
  g.shard(.85, .15, -.2, .61, .38, .5, 7, .7);
  g.shard(1.2, .15, .6, .48, .24, .38, 8, -.3);
  g.shard(-.3, .15, 1, .54, .18, .28, 7, .25);
  g.box(-1.22, 1, -.035, .04, .32, .5, 9);
  g.box(-.9, .15, -.63, .12, .7, .12, 10);
  g.shard(.4, .15, -.55, .3, .35, .25, 11);
  if (!abandoned) g.box(-.3, 1.84, -.3, .1, .1, 1.6, 9);
}

function altar(g, lod, state) {
  const depleted = state === 'depleted';
  if (lod === 2) {
    for (let i = 0; i < 3; i++) {
      const a = .65 + i * 2;
      g.tetra(Math.cos(a) * 1.32, Math.sin(a) * 1.32, .45, .18 + (depleted ? .55 : 1.1 + i * .16), 8);
    }
    g.tetra(0, 0, 1.2, depleted ? .25 : .44, 7); return;
  }
  // Interrupted radial stone ring. Missing sector is deliberate negative space.
  const count = lod === 0 ? 8 : 4;
  for (let i = 0; i < count; i++) {
    const a = .4 + i * (Math.PI * 1.62 / count), r = 1.34;
    g.box(Math.cos(a) * r, 0, Math.sin(a) * r, .77, .18, .32, 8, -a + Math.PI / 2);
  }
  g.box(0, 0, 0, 1.04, depleted ? .25 : .44, 1.04, 7, Math.PI / 4);
  for (let i = 0; i < 3; i++) {
    const a = .65 + i * 2;
    g.shard(Math.cos(a) * 1.32, .18, Math.sin(a) * 1.32, .31, depleted ? .55 : 1.1 + i * .16, .26, 7, -a);
    if (lod === 0) g.box(Math.cos(a) * .69, .19, Math.sin(a) * .69, .055, .025, .55, depleted ? 8 : 14, -a + Math.PI / 2);
  }
  if (lod === 1) return;
  g.box(0, depleted ? .25 : .44, 0, .58, .025, .58, depleted ? 8 : 15, Math.PI / 4);
  g.shard(1.06, 0, -.8, .34, .22, .4, 7);
}

function nether(g, lod) {
  if (lod === 2) {
    g.tetra(-.8, 0, .65, 3.7, 24); g.tetra(.75, 0, .55, 2.7, 24);
    g.shard(-.39, 3.1, 0, 1.8, .44, .25, 25); return;
  }
  g.prism([[-.35, 0], [.25, 0], [.12, 2.5], [-.06, 3.65], [-.4, 3.82]], .35, 24, [-.8, 0, -.07]);
  g.prism([[-.28, 0], [.3, 0], [.46, 1.8], [.18, 2.88], [-.1, 2.53]], .32, 24, [.8, 0, .07]);
  g.prism([[-1.18, 3.45], [-.15, 3.1], [.21, 3.25], [-.18, 3.6]], .32, 25);
  g.shard(1.05, 2.67, .08, .9, .53, .33, 25);
  if (lod === 1) return;
  g.box(0, 0, 0, 2.7, .1, 1.5, 8);
  g.box(-.83, .25, .13, .025, 2.45, .025, 27);
  g.box(.87, .22, .245, .025, 1.7, .025, 6);
  g.shard(-1.45, 0, .35, .33, 1.3, .15, 25, .35);
  g.shard(.19, .1, -.6, .6, .32, .3, 8);
  g.box(-.15, .105, .47, 1.6, .02, .025, 25);
  g.box(-.8, .105, .03, .025, .02, .86, 25);
  g.shard(1.25, .1, -.3, .42, .25, .38, 24);
  g.box(-.85, 2.94, .13, .25, .025, .025, 6);
}

export function buildGeometry(id, lod, state) {
  const g = new Sculpt();
  if (id === 'shanhai.sect.gate') gate(g, lod);
  else if (id === 'shanhai.settlement.ruin') ruin(g, lod, state);
  else if (id === 'shanhai.leyline.altar') altar(g, lod, state);
  else if (id === 'shanhai.nether.remnant') nether(g, lod);
  else throw new Error(`Unknown ruins asset: ${id}`);
  return g.finish(`${id}:${state}:lod${lod}`);
}
