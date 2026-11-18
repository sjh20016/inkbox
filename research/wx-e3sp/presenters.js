import * as THREE from 'three';
import { Camera } from '../../src/inkbox/render/camera.js';
import { UnitsLayer } from '../../src/inkbox/render/unitsLayer.js';
import { EntityLayer } from '../../src/inkbox/render3d/entities/EntityLayer.js';
import { deriveCommittedEntities } from '../../src/inkbox/render3d/entities/deriveEntities.js';
import { createCoordinates } from '../../src/inkbox/render3d/coordinates.js';
import { ElevationField } from '../../src/inkbox/render3d/terrain/ElevationField.js';
import { quadIndices } from '../../src/inkbox/render3d/terrain/topology.js';

// A presenter owns only committed primitive facts. This is not a World and has
// no mutation methods, controller, relation Map or access to private authority.
function facade(frame) {
  const g=frame.geometry;
  return Object.freeze({...g,size:g.w*g.h,generation:g.generation||frame.generation,entities:frame.entities,
    idx:(x,y)=>y*g.w+x});
}
function size(canvas){const r=canvas.getBoundingClientRect();return {w:Math.max(1,Math.round(r.width)),h:Math.max(1,Math.round(r.height))};}
export function createCanvasPresenter(canvas, first) {
  const ctx=canvas.getContext('2d'),camera=new Camera(),units=new UnitsLayer();camera.relief=false;
  let frame=first,world=facade(first),terrain=null,terrainLayers=null;
  function resize(){const {w,h}=size(canvas);canvas.width=w;canvas.height=h;camera.setViewport(w,h);camera.bind(world);camera.fit(world);}
  resize();
  function setFrame(next){if(next===frame)return;const resized=next.geometry.w!==world.w||next.geometry.h!==world.h;frame=next;world=facade(next);camera.bind(world);if(resized)resize();}
  function render(clock,dt=0){const s=size(canvas);if(canvas.width!==s.w||canvas.height!==s.h)resize();camera.update(dt);
    if(terrainLayers?.height!==world.height||terrainLayers?.water!==world.water){terrain=document.createElement('canvas');terrain.width=world.w;terrain.height=world.h;const t=terrain.getContext('2d'),image=t.createImageData(world.w,world.h);for(let i=0;i<world.size;i++){const wet=world.water[i]>.001||world.height[i]<.32;image.data.set(wet?[126,151,153,255]:[181+Math.floor(world.height[i]*30),181,139,255],i*4);}t.putImageData(image,0,0);terrainLayers=frame.geometry.layers;}
    ctx.fillStyle='#e9e0cd';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.imageSmoothingEnabled=false;ctx.drawImage(terrain,camera.toScreenX(0),camera.toScreenY(0),world.w*camera.zoom,world.h*camera.zoom);units.drawEntities(ctx,camera,world,clock,frame);
  }
  return {kind:'canvas',camera,setFrame,render,pick:(x,y)=>camera.pick(x,y,world),pan:(x,y)=>camera.panBy(x,y),zoom:(factor,x,y)=>camera.zoomAt(x,y,factor),dispose(){terrain=null;},get frame(){return frame;}};
}
export function createThreePresenter(canvas, first) {
  const renderer=new THREE.WebGLRenderer({canvas,antialias:true});renderer.setPixelRatio(1);renderer.setClearColor('#e9e0cd');
  const scene=new THREE.Scene();scene.add(new THREE.HemisphereLight(0xffffff,0x726750,2));const light=new THREE.DirectionalLight(0xffffff,2);light.position.set(40,80,40);scene.add(light);
  let frame=first,world=facade(first),coordinates=createCoordinates(world),elevation=new ElevationField(world),terrainLayers=null,terrain;
  const camera=new THREE.PerspectiveCamera(45,1,.1,3000),extent=Math.max(world.w,world.h);camera.position.set(0,extent*.95,extent*.85);camera.lookAt(0,0,0);
  const entities=new EntityLayer(world,coordinates,elevation,{derive:()=>deriveCommittedEntities(frame)});scene.add(entities.group);
  const raycaster=new THREE.Raycaster(),mouse=new THREE.Vector2();
  function setFrame(next){if(next===frame)return;const resized=next.geometry.w!==world.w||next.geometry.h!==world.h;frame=next;world=facade(next);elevation=new ElevationField(world);entities.world=world;entities.elevation=elevation;if(resized){coordinates=createCoordinates(world);entities.coordinates=coordinates;const extent=Math.max(world.w,world.h);camera.position.set(0,extent*.95,extent*.85);camera.lookAt(0,0,0);}}
  function ground(){if(terrainLayers===world.height)return;const geometry=new THREE.BufferGeometry(),vertices=[],indices=[];
    for(let y=0;y<world.h;y++)for(let x=0;x<world.w;x++){const p=coordinates.worldToRender(x,y,elevation.at(x,y));vertices.push(p.x,p.y,p.z);}
    for(let y=0;y<world.h-1;y++)for(let x=0;x<world.w-1;x++)indices.push(...quadIndices(world,x,y));
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.setIndex(indices);geometry.computeVertexNormals();
    const next=new THREE.Mesh(geometry,new THREE.MeshLambertMaterial({color:'#c3bd91',side:THREE.DoubleSide}));if(terrain){scene.remove(terrain);terrain.geometry.dispose();terrain.material.dispose();}terrain=next;scene.add(terrain);terrainLayers=world.height;
  }
  function render(clock,dt=0){const {w,h}=size(canvas);if(canvas.width!==w||canvas.height!==h){renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();}ground();entities.update(dt,world,{heightChanged:entities.lastFrame!==frame});entities.lastFrame=frame;renderer.render(scene,camera);}
  function pick(x,y){mouse.set(x/canvas.clientWidth*2-1,1-y/canvas.clientHeight*2);raycaster.setFromCamera(mouse,camera);const hit=terrain&&raycaster.intersectObject(terrain)[0];return hit?coordinates.renderPointToCell(hit.point):{x:Math.floor(world.w/2),y:Math.floor(world.h/2)};}
  return {kind:'3d',renderer,scene,camera,entities,setFrame,render,pick,pan(x,y){camera.position.x+=x*.05;camera.position.z+=y*.05;camera.lookAt(0,0,0);},zoom(factor){camera.position.multiplyScalar(1/factor);},get frame(){return frame;},dispose(){entities.dispose();terrain?.geometry.dispose();terrain?.material.dispose();renderer.dispose();renderer.forceContextLoss();}};
}
