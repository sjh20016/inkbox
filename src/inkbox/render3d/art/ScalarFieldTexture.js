import * as THREE from 'three';

/** Stage-owned, read-only scalar cache. R8 requests are coalesced at at most 4Hz.
 * r186 only supports partial updateRanges for RGBA, so changed RED data uploads
 * one bounded grid. Unchanged quantized bytes never request a GPU upload.
 */
export class ScalarFieldTexture {
  constructor(world,key,mode){
    this.world=world;this.key=key;this.mode=mode;this.enabled=false;this.valid=false;
    this.texture=null;this.bytes=null;this.clock=Infinity;this.interval=.25;this.disposed=false;
    this.stats={field:key,mode,format:'R8',enabled:false,bytes:0,scans:0,uploads:0,uploadBytes:0,changedCells:0,scanMs:0};
  }
  setEnabled(enabled){
    if(this.disposed||this.enabled===!!enabled)return;
    this.enabled=!!enabled;this.stats.enabled=this.enabled;
    if(this.enabled){this.clock=Infinity;this.update(0);}
  }
  update(dt){
    if(this.disposed||!this.enabled)return false;
    this.clock+=Number.isFinite(dt)&&dt>0?dt:0;
    if(this.clock<this.interval)return false;
    this.clock=0;const started=performance.now(),values=this.world?.[this.key];
    this.valid=ArrayBuffer.isView(values)&&values.length===this.world.size;
    if(!this.valid)return false;
    let initial=false;
    if(!this.texture){
      this.bytes=new Uint8Array(this.world.size);initial=true;
      this.texture=new THREE.DataTexture(this.bytes,this.world.w,this.world.h,THREE.RedFormat,THREE.UnsignedByteType);
      this.texture.internalFormat='R8';this.texture.minFilter=this.texture.magFilter=THREE.LinearFilter;
      this.texture.generateMipmaps=false;this.texture.flipY=false;this.texture.unpackAlignment=1;
      this.texture.colorSpace=THREE.NoColorSpace;this.texture.name=`Inkbox:${this.world.plane}:${this.key}:R8`;
      this.stats.bytes=this.bytes.byteLength;
    }
    let changed=0;
    for(let i=0;i<values.length;i++){
      const value=Number.isFinite(values[i])?Math.min(1,Math.max(0,values[i])):0;
      const byte=Math.round(value*255);
      if(initial||this.bytes[i]!==byte){this.bytes[i]=byte;changed++;}
    }
    this.stats.scans++;this.stats.scanMs+=performance.now()-started;
    this.stats.changedCells+=changed;
    if(!changed)return false;
    this.texture.needsUpdate=true;this.stats.uploads++;this.stats.uploadBytes+=this.bytes.byteLength;
    return true;
  }
  dispose(){
    if(this.disposed)return;this.disposed=true;this.texture?.dispose();
    this.texture=null;this.bytes=null;this.world=null;this.enabled=false;this.stats.enabled=false;
  }
}
