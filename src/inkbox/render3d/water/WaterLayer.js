import * as THREE from 'three';
import { quadIndices, dirtyQuads, adaptiveTopology } from '../terrain/topology.js';
import { gridGeometry } from '../terrain/TerrainMesh.js';
import { ElevationField } from '../terrain/ElevationField.js';
import { applyQuadMask } from '../region/quadMask.js';
import { RENDER_ORDER } from '../shared/RenderOrder.js';
import { WaterPigmentMaterial } from './WaterPigmentMaterial.js';

/**
 * 水面网格。
 *
 * M2-B §8：高度改问 `stage.elevation`。注意水面要的是「**高程 + 水深**」的高度，
 * 所以走 `nodeForHeight(value, x, y)`（按高度值求格点高度）而不是 `node(x, y)`
 * （只按世界格的高程求）。两者在 RAW 下逐位一致，但语义不同，别混用。
 *
 * M2-B §21：凡间水**只保留窗外**（窗内交给目标位面）。遮罩与地形共用
 * `applyQuadMask` ⇒ 判据只有 RegionGeometry 一条（§19）。
 * ⚠️ **不要**为了结构对称自动给上界 / 幽冥造凡间式蓝色水——它们现在
 * `water: false`，那位面有没有「水」这个视觉语义**尚未论证**（§21 / §27）。
 */
export class WaterLayer {
  constructor(world, coordinates, elevation = new ElevationField(world)) {
    this.world = world; this.coordinates = coordinates; this.elevation = elevation;
    this.geometry = gridGeometry(world, coordinates);
    this.legacyGeometry=this.geometry;this.clipGeometry=null;this.clipped=false;
    this.material = new THREE.MeshBasicMaterial({ color: '#718f92', transparent: true, opacity: 0.68, depthWrite: false });
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.renderOrder = RENDER_ORDER.water;
    this.fullIndices = this.geometry.index.array.slice();
    this.geometry.index.setUsage(THREE.DynamicDrawUsage);
    this.regionGeometry = null;
    this.regionInside = true;
    this.keptQuads = (world.w - 1) * (world.h - 1);
    this.inkMaterial = null;
    this.surfaceField = null;
    this.update({ x0: 0, y0: 0, x1: world.w - 1, y1: world.h - 1 });
  }
  /**
   * M2-C2D P1：realm-style 艺术档案把水面材质换成连续绘画水面；
   * `null` 恢复 legacy MeshBasicMaterial（art=legacy / pilot 等路径不变）。
   * realm-style 同时启用湿域裁切与世界外缘水体侧面；Region 判据和 dirty 来源保持同源，水面及侧面仍共用一次 draw call。
   */
  setArtProfile(profile) {
    this.setClipped(!!profile?.realmStyle);
    if (profile?.realmStyle) {
      if (!this.inkMaterial) this.inkMaterial = new WaterPigmentMaterial(this.world, this.surfaceField, profile);
      else this.inkMaterial.setProfile(profile);
      this.mesh.material = this.inkMaterial;
    } else {
      this.mesh.material = this.material;
    }
  }
  get inkActive() { return this.mesh.material === this.inkMaterial && !!this.inkMaterial; }
  /** Field ownership stays with PlaneStage; the water mesh only borrows it. */
  setSurfaceField(field) {
    this.surfaceField = field || null;
    this.inkMaterial?.setSurfaceField(this.surfaceField);
  }
  update(region) {
    const w = this.world, attr = this.legacyGeometry.attributes.position;
    for (let y = region.y0; y <= region.y1; y++) {
      for (let x = region.x0; x <= region.x1; x++) {
        const i = y * w.w + x;
        // Dry surface lies just below terrain. Wet surface uses the existing water depth.
        attr.setY(i, w.water[i] > 0.0015
          ? this.elevation.nodeForHeight(w.height[i] + w.water[i], x, y) + 0.04
          : this.elevation.nodeForHeight(w.height[i], x, y) - 0.08);
      }
      attr.addUpdateRange((y * w.w + region.x0) * 3, (region.x1 - region.x0 + 1) * 3);
    }
    attr.needsUpdate = true;
    if(adaptiveTopology(w)){dirtyQuads(w,region,(x,y)=>this.fullIndices.set(quadIndices(w,x,y),(y*(w.w-1)+x)*6));this.applyLegacyMask();}
    if(this.clipped)this.updateClipped(region);
  }
  /** 与 TerrainMesh 同款：按 Region 保留 / 排除 quad（§19 的唯一判据链）。 */
  setRegionGeometry(geometry, inside = true) {
    if (this.regionGeometry === geometry && this.regionInside === !!inside) return;
    this.regionGeometry = geometry || null;
    this.regionInside = !!inside;
    this.applyLegacyMask();
    if(this.clipped)this.applyClipMask();
  }
  applyLegacyMask(){
    this.keptQuads = applyQuadMask({
      geometry: this.legacyGeometry, fullIndices: this.fullIndices, regionGeometry: this.regionGeometry,
      inside: this.regionInside, quadW: this.world.w - 1, quadH: this.world.h - 1,
    });
  }
  setClipped(enabled){
    if(this.clipped===enabled)return;
    this.clipped=enabled;
    if(enabled){
      if(!this.clipGeometry){
        const w=this.world,count=(w.w-1)*(w.h-1);
        this.rimEdges=[];
        for(let x=0;x<w.w-1;x++){this.rimEdges.push([x,0,x+1,0,x,0]);this.rimEdges.push([x+1,w.h-1,x,w.h-1,x,w.h-2]);}
        for(let y=0;y<w.h-1;y++){this.rimEdges.push([0,y+1,0,y,0,y]);this.rimEdges.push([w.w-1,y,w.w-1,y+1,w.w-2,y]);}
        this.rimCounts=new Uint8Array(this.rimEdges.length);
        this.clipGeometry=new THREE.BufferGeometry();
        this.clipGeometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(count*36+this.rimEdges.length*18),3).setUsage(THREE.DynamicDrawUsage));
        this.clipGeometry.setIndex(new THREE.BufferAttribute(new Uint32Array(count*12+this.rimEdges.length*6),1).setUsage(THREE.DynamicDrawUsage));
        this.clipCounts=new Uint8Array(count);
        this.clipGeometry.boundingBox=this.legacyGeometry.boundingBox.clone();
        this.clipGeometry.boundingSphere=this.legacyGeometry.boundingSphere.clone();
      }
      this.updateClipped({x0:0,y0:0,x1:this.world.w-1,y1:this.world.h-1});
    }
    this.geometry=enabled?this.clipGeometry:this.legacyGeometry;this.mesh.geometry=this.geometry;
  }
  updateClipped(region){
    const w=this.world,attr=this.clipGeometry.attributes.position,threshold=0.0015;
    dirtyQuads(w,region,(x,y)=>{
      const q=y*(w.w-1)+x,indices=quadIndices(w,x,y);let count=0;
      for(let t=0;t<6;t+=3){
        const triangle=indices.slice(t,t+3).map(i=>{
          const cx=i%w.w,cy=Math.floor(i/w.w),p=this.coordinates.cellToRender(cx,cy);
          return {x:p.x,z:p.z,h:Math.fround(this.elevation.nodeForHeight(w.height[i]+w.water[i],cx,cy))+0.04,d:w.water[i]-threshold};
        });
        const polygon=[];
        for(let k=0;k<3;k++){
          const a=triangle[k],b=triangle[(k+1)%3];if(a.d>0)polygon.push(a);
          if((a.d>0)!==(b.d>0)){const f=a.d/(a.d-b.d);polygon.push({x:a.x+f*(b.x-a.x),z:a.z+f*(b.z-a.z),h:a.h+f*(b.h-a.h)});}
        }
        for(let k=1;k<polygon.length-1;k++)for(const p of [polygon[0],polygon[k],polygon[k+1]]){
          attr.array.set([p.x,p.h,p.z],q*36+count*3);count++;
        }
      }
      this.clipCounts[q]=count;attr.addUpdateRange(q*36,36);
    });
    this.updateWaterRim(region);
    attr.needsUpdate=true;this.applyClipMask();
  }
  /** Continuous wet edge joins water surface to the terrain at the true world perimeter. */
  updateWaterRim(region){
    const w=this.world,attr=this.clipGeometry.attributes.position,base=(w.w-1)*(w.h-1)*36;
    this.rimEdges.forEach(([ax,ay,bx,by],k)=>{
      if(region&&(Math.max(ax,bx)<region.x0||Math.min(ax,bx)>region.x1||Math.max(ay,by)<region.y0||Math.min(ay,by)>region.y1))return;
      const node=(x,y)=>{const i=y*w.w+x,p=this.coordinates.cellToRender(x,y);return {x:p.x,z:p.z,ground:Math.fround(this.elevation.node(x,y)),h:Math.fround(this.elevation.nodeForHeight(w.height[i]+w.water[i],x,y))+.04,d:w.water[i]-.0015};};
      let a=node(ax,ay),b=node(bx,by);this.rimCounts[k]=0;if(a.d<=0&&b.d<=0)return;
      if((a.d>0)!==(b.d>0)){
        const f=a.d/(a.d-b.d),p={x:a.x+f*(b.x-a.x),z:a.z+f*(b.z-a.z),ground:a.ground+f*(b.ground-a.ground),h:a.h+f*(b.h-a.h)};
        if(a.d<=0)a=p;else b=p;
      }
      const o=base+k*18;
      attr.array.set([a.x,a.ground,a.z,a.x,a.h,a.z,b.x,b.h,b.z,a.x,a.ground,a.z,b.x,b.h,b.z,b.x,b.ground,b.z],o);
      attr.addUpdateRange(o,18);this.rimCounts[k]=6;
    });
  }
  applyClipMask(){
    const w=this.world,index=this.clipGeometry.index;let n=0,quads=0;
    for(let y=0;y<w.h-1;y++)for(let x=0;x<w.w-1;x++){
      if(this.regionGeometry&&!this.regionGeometry.allInside&&this.regionGeometry.isInsideQuad(x,y)!==this.regionInside)continue;
      const q=y*(w.w-1)+x,count=this.clipCounts[q];if(count)quads++;
      for(let k=0;k<count;k++)index.array[n++]=q*12+k;
    }
    const base=(w.w-1)*(w.h-1)*12;
    this.rimEdges.forEach((edge,k)=>{
      if(this.regionGeometry&&!this.regionGeometry.allInside&&this.regionGeometry.isInsideQuad(edge[4],edge[5])!==this.regionInside)return;
      for(let j=0;j<this.rimCounts[k];j++)index.array[n++]=base+k*6+j;
    });
    index.needsUpdate=true;this.clipGeometry.setDrawRange(0,n);this.clippedQuads=quads;
  }
  dispose() { this.clipGeometry?.dispose();this.legacyGeometry.dispose(); this.material.dispose(); this.inkMaterial?.dispose(); }
}
