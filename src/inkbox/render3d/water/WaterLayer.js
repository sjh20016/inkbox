import * as THREE from 'three';
import { diagonalAD, adaptiveTopology } from '../terrain/topology.js';
import { gridGeometry } from '../terrain/TerrainMesh.js';
import { ElevationField } from '../terrain/ElevationField.js';
import { applyQuadMask } from '../region/quadMask.js';
import { RENDER_ORDER } from '../shared/RenderOrder.js';
import { WaterPigmentMaterial } from './WaterPigmentMaterial.js';
const BC_ORDER=Object.freeze([0,2,1,1,2,3]),AD_ORDER=Object.freeze([0,2,3,0,3,1]);
function writeNode(out,o,i,xy,heights){const p=i*3;out[o]=xy[p];out[o+1]=heights[i];out[o+2]=xy[p+2];}


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
    this.clipNodes=new Int32Array(4);this.clipPolygon=new Float64Array(12);
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
    if(!region)return;
    if(this.clipped){this.legacyStale=true;this.updateClipped(region);return;}
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
    if(adaptiveTopology(w)){
      let changed=false;const full=this.fullIndices,qw=w.w-1;
      for(let y=Math.max(0,region.y0-1);y<=Math.min(w.h-2,region.y1);y++)for(let x=Math.max(0,region.x0-1);x<=Math.min(w.w-2,region.x1);x++){
        const a=y*w.w+x,b=a+1,c=a+w.w,d=c+1,o=(y*qw+x)*6,ad=diagonalAD(w,x,y);
        if(full[o+2]===(ad?d:b))continue;
        full[o]=a;full[o+1]=c;full[o+2]=ad?d:b;full[o+3]=ad?a:b;full[o+4]=ad?d:c;full[o+5]=ad?b:d;changed=true;
      }
      if(changed)this.legacyMaskStale=true;
    }
    if(this.legacyMaskStale){this.applyLegacyMask();this.legacyMaskStale=false;}
  }
  /** 与 TerrainMesh 同款：按 Region 保留 / 排除 quad（§19 的唯一判据链）。 */
  setRegionGeometry(geometry, inside = true) {
    if (this.regionGeometry === geometry && this.regionInside === !!inside) return;
    this.regionGeometry = geometry || null;
    this.regionInside = !!inside;
    this.legacyMaskStale=true;
    if(this.clipped){this.clipIndexDirty=true;this.applyClipMask();}
    else {this.applyLegacyMask();this.legacyMaskStale=false;}
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
        this.waterNodeHeights=new Float64Array(w.size);this.clipIndexDirty=true;
        // Cache immutable coordinates at their original JS precision, including custom coordinate scales.
        this.clipXY=new Float64Array(w.size*3);
        for(let y=0;y<w.h;y++)for(let x=0;x<w.w;x++){const p=this.coordinates.cellToRender(x,y),i=(y*w.w+x)*3;this.clipXY[i]=p.x;this.clipXY[i+2]=p.z;}
        this.clipGeometry.boundingBox=this.legacyGeometry.boundingBox.clone();
        this.clipGeometry.boundingSphere=this.legacyGeometry.boundingSphere.clone();
      }
      this.updateClipped({x0:0,y0:0,x1:this.world.w-1,y1:this.world.h-1});
    }
    if(!enabled&&this.legacyMaskStale&&!this.legacyStale){this.applyLegacyMask();this.legacyMaskStale=false;}
    if(!enabled&&this.legacyStale){
      this.update({x0:0,y0:0,x1:this.world.w-1,y1:this.world.h-1});this.legacyStale=false;
    }
    this.geometry=enabled?this.clipGeometry:this.legacyGeometry;this.mesh.geometry=this.geometry;
  }
  updateClipped(region){
    const w=this.world,attr=this.clipGeometry.attributes.position,out=attr.array,xy=this.clipXY,
      heights=this.waterNodeHeights,nodes=this.clipNodes,poly=this.clipPolygon,qw=w.w-1,threshold=.0015;
    // Each affected nodal height is sampled once; all triangles and shoreline edges reuse that exact value.
    for(let y=region.y0;y<=region.y1;y++)for(let x=region.x0;x<=region.x1;x++){
      const i=y*w.w+x;heights[i]=Math.fround(this.elevation.nodeForHeight(w.height[i]+w.water[i],x,y))+.04;
    }
    const x0=Math.max(0,region.x0-1),x1=Math.min(w.w-2,region.x1),y0=Math.max(0,region.y0-1),y1=Math.min(w.h-2,region.y1);
    let wrote=false;
    for(let y=y0;y<=y1;y++){
      let rowWrote=false;
      for(let x=x0;x<=x1;x++){
        const a=y*w.w+x,q=y*qw+x,o=q*36;nodes[0]=a;nodes[1]=a+1;nodes[2]=a+w.w;nodes[3]=a+w.w+1;
        let wet=0;for(let k=0;k<4;k++)if(w.water[nodes[k]]>threshold)wet|=1<<k;
        let count=0;
        if(wet){
          const order=diagonalAD(w,x,y)?AD_ORDER:BC_ORDER;
          if(wet===15){
            for(let k=0;k<6;k++)writeNode(out,o+k*3,nodes[order[k]],xy,heights);count=6;
          }else for(let t=0;t<6;t+=3){
            const ia=nodes[order[t]],ib=nodes[order[t+1]],ic=nodes[order[t+2]],
              wa=w.water[ia]>threshold,wb=w.water[ib]>threshold,wc=w.water[ic]>threshold;
            if(!wa&&!wb&&!wc)continue;
            if(wa&&wb&&wc){writeNode(out,o+count++*3,ia,xy,heights);writeNode(out,o+count++*3,ib,xy,heights);writeNode(out,o+count++*3,ic,xy,heights);continue;}
            let n=0;
            for(let k=0;k<3;k++){
              const ai=nodes[order[t+k]],bi=nodes[order[t+(k+1)%3]],ap=ai*3,bp=bi*3,ad=w.water[ai]-threshold,bd=w.water[bi]-threshold;
              if(ad>0){poly[n++]=xy[ap];poly[n++]=heights[ai];poly[n++]=xy[ap+2];}
              if((ad>0)!==(bd>0)){
                const f=ad/(ad-bd);poly[n++]=xy[ap]+f*(xy[bp]-xy[ap]);poly[n++]=heights[ai]+f*(heights[bi]-heights[ai]);poly[n++]=xy[ap+2]+f*(xy[bp+2]-xy[ap+2]);
              }
            }
            for(let k=3;k<n-3;k+=3){
              let p=o+count*3;out[p++]=poly[0];out[p++]=poly[1];out[p++]=poly[2];
              out[p++]=poly[k];out[p++]=poly[k+1];out[p++]=poly[k+2];
              out[p++]=poly[k+3];out[p++]=poly[k+4];out[p]=poly[k+5];count+=3;
            }
          }
          rowWrote=true;
        }
        if(this.clipCounts[q]!==count){this.clipCounts[q]=count;this.clipIndexDirty=true;}
      }
      if(rowWrote){attr.addUpdateRange((y*qw+x0)*36,(x1-x0+1)*36);wrote=true;}
    }
    if(this.updateWaterRim(region))wrote=true;
    if(wrote)attr.needsUpdate=true;
    if(this.clipIndexDirty)this.applyClipMask();
  }
  /** Continuous wet edge joins water surface to the terrain at the true world perimeter. */
  updateWaterRim(region){
    const w=this.world,attr=this.clipGeometry.attributes.position,out=attr.array,xy=this.clipXY,
      heights=this.waterNodeHeights,base=(w.w-1)*(w.h-1)*36;let wrote=false;
    for(let k=0;k<this.rimEdges.length;k++){
      const edge=this.rimEdges[k],ax=edge[0],ay=edge[1],bx=edge[2],by=edge[3];
      if(region&&(Math.max(ax,bx)<region.x0||Math.min(ax,bx)>region.x1||Math.max(ay,by)<region.y0||Math.min(ay,by)>region.y1))continue;
      const ai=ay*w.w+ax,bi=by*w.w+bx,ad=w.water[ai]-.0015,bd=w.water[bi]-.0015,count=ad<=0&&bd<=0?0:6;
      if(this.rimCounts[k]!==count){this.rimCounts[k]=count;this.clipIndexDirty=true;}
      if(!count)continue;
      let px=xy[ai*3],pz=xy[ai*3+2],ph=heights[ai],pg=Math.fround(this.elevation.node(ax,ay)),
        qx=xy[bi*3],qz=xy[bi*3+2],qh=heights[bi],qg=Math.fround(this.elevation.node(bx,by));
      if((ad>0)!==(bd>0)){
        const f=ad/(ad-bd),x=px+f*(qx-px),z=pz+f*(qz-pz),h=ph+f*(qh-ph),g=pg+f*(qg-pg);
        if(ad<=0){px=x;pz=z;ph=h;pg=g;}else{qx=x;qz=z;qh=h;qg=g;}
      }
      const o=base+k*18;
      out[o]=px;out[o+1]=pg;out[o+2]=pz;out[o+3]=px;out[o+4]=ph;out[o+5]=pz;
      out[o+6]=qx;out[o+7]=qh;out[o+8]=qz;out[o+9]=px;out[o+10]=pg;out[o+11]=pz;
      out[o+12]=qx;out[o+13]=qh;out[o+14]=qz;out[o+15]=qx;out[o+16]=qg;out[o+17]=qz;wrote=true;
    }
    if(wrote)attr.addUpdateRange(base,this.rimEdges.length*18);return wrote;
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
    index.needsUpdate=true;this.clipIndexDirty=false;this.clipGeometry.setDrawRange(0,n);this.clippedQuads=quads;
  }
  dispose() { this.clipGeometry?.dispose();this.legacyGeometry.dispose(); this.material.dispose(); this.inkMaterial?.dispose(); }
}
