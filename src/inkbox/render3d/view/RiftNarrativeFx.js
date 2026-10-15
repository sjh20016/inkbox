import * as THREE from 'three';
import { realmStyleFor } from '../art/RealmStyleProfile.js';
import { decorationFootprintOwned } from '../environment/RealmDecorationLayer.js';
import { RENDER_ORDER } from '../shared/RenderOrder.js';

export const RIFT_FX_EVENT_CAP = 64;
export const RIFT_FX_SEGMENTS = 4;
export const RIFT_FX_CAPACITY = RIFT_FX_EVENT_CAP * RIFT_FX_SEGMENTS;
export const RIFT_FX_KINDS = Object.freeze(['rift', 'riftcross', 'possession', 'ascension']);
const KINDS = new Set(RIFT_FX_KINDS);
export const isRiftNarrativeItem = item => KINDS.has(item?.kind);

function brushGeometry() {
  // Three torn trapezoids, shared by every event. Gaps are actual flying-white.
  const positions = [], uvs = [], indices = [];
  for (const [a, b, left, right] of [[-.5,-.12,.38,.48],[-.075,.17,.5,.35],[.2,.5,.43,.12]]) {
    const offset = positions.length / 3;
    positions.push(a,-left,0, b,-right,0, b,right,0, a,left,0);
    uvs.push(a+.5,0, b+.5,0, b+.5,1, a+.5,1);
    indices.push(offset,offset+1,offset+2, offset,offset+2,offset+3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.setAttribute('inkOpacity', new THREE.InstancedBufferAttribute(new Float32Array(RIFT_FX_CAPACITY), 1).setUsage(THREE.DynamicDrawUsage));
  return geometry;
}

/** Fixed brush pool, reading only already consumed immutable FX snapshots. */
export class RiftNarrativeFx {
  constructor({ plane, coordinates, elevation }) {
    this.plane = plane;
    this.coordinates = coordinates;
    this.elevation = elevation;
    this.geometry = brushGeometry();
    this.material = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, depthTest: true, side: THREE.DoubleSide,
      vertexShader: `attribute float inkOpacity;
        varying vec3 vInk; varying float vOpacity; varying vec2 vUv;
        void main(){
          vInk = vec3(1.0);
          #ifdef USE_INSTANCING_COLOR
          vInk = instanceColor;
          #endif
          vOpacity = inkOpacity; vUv = uv;
          vec4 point = vec4(position,1.0);
          #ifdef USE_INSTANCING
          point = instanceMatrix * point;
          #endif
          gl_Position = projectionMatrix * modelViewMatrix * point;
        }`,
      fragmentShader: `varying vec3 vInk; varying float vOpacity; varying vec2 vUv;
        void main(){
          if(vOpacity < .002) discard;
          float edge = 1.0 - smoothstep(.36,.5,abs(vUv.y-.5));
          gl_FragColor = vec4(vInk,vOpacity*edge);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.mesh = new THREE.InstancedMesh(this.geometry, this.material, RIFT_FX_CAPACITY);
    this.mesh.name = `RiftNarrativeFx:${plane}`;
    this.mesh.count = 0;
    this.mesh.visible = false;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = RENDER_ORDER.fx;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    // Allocate the shared instance color buffer once, never on event arrival.
    this.mesh.setColorAt(RIFT_FX_CAPACITY - 1, new THREE.Color());
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.opacity = this.geometry.getAttribute('inkOpacity');
    this.matrix = new THREE.Matrix4();
    this.axis = new THREE.Vector3(); this.widthAxis = new THREE.Vector3(); this.normal = new THREE.Vector3();
    this.color = new THREE.Color();
    const style = realmStyleFor(plane), upper = realmStyleFor('upper'), nether = realmStyleFor('nether');
    this.colors = {
      ink: new THREE.Color(style.ink.color), paper: new THREE.Color(style.paper.color),
      blue: new THREE.Color(upper.pilotPalette.blue), gold: new THREE.Color(upper.entity.atlas12[9]),
      red: new THREE.Color(nether.pilotPalette.red),
    };
    this.footprint = { x:0,y:0,width:0,depth:0,rotationY:0 };
    this.stats = { active:0,events:0,capacity:RIFT_FX_CAPACITY,eventCapacity:RIFT_FX_EVENT_CAP,
      overflow:0,overflowFrames:0,triangles:0,drawCalls:0,regionRejected:0,genericDirections:0 };
  }

  clear() {
    this.mesh.count = 0; this.mesh.visible = false;
    Object.assign(this.stats, {active:0,events:0,overflow:0,triangles:0,drawCalls:0,regionRejected:0,genericDirections:0});
  }

  update(items, world, region = null, inside = true) {
    this.clear();
    if (!world || !Array.isArray(items)) return;
    this.world = world; this.region = region; this.inside = inside;
    let events = 0, overflow = 0;
    for (const item of items) {
      if (!isRiftNarrativeItem(item) || item.plane !== this.plane
        || !Number.isFinite(item.x) || !Number.isFinite(item.y)
        || !(item.ttl > 0) || !Number.isFinite(item.age) || item.age < 0 || item.age >= item.ttl) continue;
      if (item.x < 0 || item.y < 0 || item.x > world.w-1 || item.y > world.h-1) continue;
      if (events >= RIFT_FX_EVENT_CAP) { overflow++; continue; }
      const progress = Math.min(1, item.age / item.ttl), fade = (1-progress)*.85;
      const seed = Number.isFinite(item.seed) ? item.seed-Math.floor(item.seed) : 0;
      const angle = seed * Math.PI * 2;
      const before = this.mesh.count;
      if (item.kind === 'ascension') {
        const base = this.elevation.at(item.x,item.y) + .15;
        for (let i=0;i<4;i++) {
          const a=angle+i*Math.PI*.5, x=item.x+Math.cos(a)*.23, y=item.y+Math.sin(a)*.23;
          const rise=progress*(1.6+seed*.6)+i*.15;
          this.color.copy(i===0?this.colors.gold:i===1?this.colors.blue:this.colors.paper);
          this.stroke(x,y,x,y,.045,fade,this.color,base+rise,base+rise+.45+(1-progress)*.55,a);
        }
      } else if (item.kind === 'possession') {
        for (let i=0;i<2;i++) {
          const a=angle+i*Math.PI, span=.25+.75*(1-progress),c=Math.cos(a),s=Math.sin(a);
          this.stroke(item.x+c*span,item.y+s*span,item.x+c*.10,item.y+s*.10,.045,fade,this.colors.red);
        }
      } else if (item.kind === 'riftcross' && this.crossDirection(item)) {
        const data=item.data, dx=data.toX-data.fromX,dy=data.toY-data.fromY,distance=Math.hypot(dx,dy);
        const span=Math.min(6,Math.max(.45,distance*.15))*(.45+.55*progress),c=dx/distance,s=dy/distance;
        const arrive=data.phase==='arrive';
        for(let i=0;i<2;i++) {
          const side=(i-.5)*.13;
          const ax=item.x-s*side-(arrive?c*span:0),ay=item.y+c*side-(arrive?s*span:0);
          const bx=item.x-s*side+(arrive?0:c*span),by=item.y+c*side+(arrive?0:s*span);
          this.stroke(ax,ay,bx,by,
            i===0?.09:.04,fade,i===0?this.colors.ink:this.colors.paper);
        }
      } else {
        if(item.kind==='riftcross')this.stats.genericDirections++;
        // No direction or target subtype is inferred from a rift-open payload.
        for(let i=0;i<4;i++) {
          const a=angle+i*Math.PI*.5,c=Math.cos(a),s=Math.sin(a),span=.55+progress*.8;
          this.stroke(item.x+c*.13,item.y+s*.13,item.x+c*span,item.y+s*span,.07,fade,
            i===0?this.colors.paper:this.colors.ink);
        }
      }
      if(this.mesh.count>before)events++;
    }
    this.mesh.visible = this.mesh.count>0;
    if(this.mesh.count){this.mesh.instanceMatrix.needsUpdate=true;this.mesh.instanceColor.needsUpdate=true;this.opacity.needsUpdate=true;}
    if(overflow)this.stats.overflowFrames++;
    Object.assign(this.stats,{active:this.mesh.count,events,overflow,triangles:this.mesh.count*6,drawCalls:this.mesh.count?1:0});
    this.world=null;this.region=null;
  }

  crossDirection(item) {
    const d=item.data;
    if(!d||!['mortal','upper','nether'].includes(d.fromPlane)||!['mortal','upper','nether'].includes(d.toPlane)
      ||d.fromPlane===d.toPlane||![d.fromX,d.fromY,d.toX,d.toY].every(Number.isFinite)
      ||(d.phase!=='depart'&&d.phase!=='arrive')
      ||item.plane!==(d.phase==='depart'?d.fromPlane:d.toPlane))return false;
    return Math.hypot(d.toX-d.fromX,d.toY-d.fromY)>1e-6;
  }

  stroke(ax,ay,bx,by,width,opacity,color,az=null,bz=null,widthAngle=0) {
    if(this.mesh.count>=RIFT_FX_CAPACITY)return;
    // Conservative complete footprint ownership; a brush cannot leak into the
    // other plane's Region even when its event centre lies on the proper side.
    const f=this.footprint;
    f.x=(ax+bx)/2;f.y=(ay+by)/2;f.width=Math.abs(bx-ax)+width*2;f.depth=Math.abs(by-ay)+width*2;
    if(!decorationFootprintOwned(this.world,this.region,this.inside,f)){this.stats.regionRejected++;return;}
    az ??= this.elevation.at(ax,ay)+.13; bz ??= this.elevation.at(bx,by)+.13;
    this.axis.set(bx-ax,bz-az,by-ay);
    if(this.axis.lengthSq()<1e-10)return;
    if(Math.hypot(bx-ax,by-ay)>1e-6)this.widthAxis.set(-(by-ay),0,bx-ax).normalize().multiplyScalar(width);
    else this.widthAxis.set(Math.cos(widthAngle)*width,0,Math.sin(widthAngle)*width);
    this.normal.crossVectors(this.axis,this.widthAxis).normalize();
    this.matrix.makeBasis(this.axis,this.widthAxis,this.normal);
    const point=this.coordinates.worldToRender(f.x,f.y,(az+bz)/2);
    this.matrix.setPosition(point.x,point.y,point.z);
    const i=this.mesh.count++;
    this.mesh.setMatrixAt(i,this.matrix);this.mesh.setColorAt(i,color);this.opacity.setX(i,opacity);
  }

  dispose() {
    if(this.disposed)return;this.disposed=true;
    this.mesh.removeFromParent();this.mesh.dispose();this.geometry.dispose();this.material.dispose();
    this.world=null;this.region=null;
  }
}
