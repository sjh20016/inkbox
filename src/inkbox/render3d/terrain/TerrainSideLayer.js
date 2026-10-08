import * as THREE from 'three';
/** Only the world perimeter is a physical outside wall; realm windows never create walls here. */
export class TerrainSideLayer {
  constructor(world,coordinates,elevation) {
    this.world=world;this.coordinates=coordinates;this.elevation=elevation;this.edges=[];
    for(let x=0;x<world.w-1;x++){this.edges.push([x,0,x+1,0,x,0]);this.edges.push([x+1,world.h-1,x,world.h-1,x,world.h-2]);}
    for(let y=0;y<world.h-1;y++){this.edges.push([0,y+1,0,y,0,y]);this.edges.push([world.w-1,y,world.w-1,y+1,world.w-2,y]);}
    this.geometry=new THREE.BufferGeometry();
    this.geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(this.edges.length*18),3).setUsage(THREE.DynamicDrawUsage));
    // Exterior walls are vertical: their outward normal depends only on immutable XZ edges.
    const normals=new Float32Array(this.edges.length*18);
    this.edges.forEach(([ax,ay,bx,by],i)=>{for(let k=0;k<6;k++)normals.set([by-ay,0,ax-bx],i*18+k*3);});
    this.geometry.setAttribute('normal',new THREE.BufferAttribute(normals,3));
    this.geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(this.edges.length*6),1));
    this.material=new THREE.MeshLambertMaterial({color:'#555343',flatShading:true,side:THREE.DoubleSide});
    this.mesh=new THREE.Mesh(this.geometry,this.material);this.mesh.name='WorldOuterSides';
    this.update();this.setRegionGeometry(null,true);
  }
  update(region=null) {
    const attr=this.geometry.attributes.position;
    // The base is a presentation datum below the minimum legal raw elevation, transformed by this Stage profile.
    const p=this.elevation.profile;
    const floor=Math.min(-30,p.datum+p.relief*this.elevation.baseNodeForHeight(0)-6);
    this.edges.forEach(([ax,ay,bx,by],i)=>{
      if(region && (Math.max(ax,bx)<region.x0 || Math.min(ax,bx)>region.x1 || Math.max(ay,by)<region.y0 || Math.min(ay,by)>region.y1))return;
      const a=this.coordinates.cellToRender(ax,ay),b=this.coordinates.cellToRender(bx,by);
      const ah=this.elevation.at(ax,ay),bh=this.elevation.at(bx,by),o=i*18;
      attr.array.set([a.x,ah,a.z,b.x,bh,b.z,a.x,floor,a.z,b.x,bh,b.z,b.x,floor,b.z,a.x,floor,a.z],o);
      attr.addUpdateRange(o,18);
    });attr.needsUpdate=true;this.geometry.computeBoundingSphere();
  }
  setRegionGeometry(region,inside=true){
    if(this.regionGeometry===region&&this.regionInside===inside)return;
    this.regionGeometry=region;this.regionInside=inside;let n=0;
    this.edges.forEach((edge,i)=>{if(region&&!region.allInside&&region.isInsideQuad(edge[4],edge[5])!==inside)return;
      for(let k=0;k<6;k++)this.geometry.index.array[n++]=i*6+k;});
    this.geometry.index.needsUpdate=true;this.geometry.setDrawRange(0,n);
  }
  dispose(){this.geometry.dispose();this.material.dispose();}
}
