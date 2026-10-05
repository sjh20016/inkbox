// CPU test harness. Geometry is the shipped GLB; this is not GPU evidence.
import * as THREE from 'three';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Render3DHost } from '../src/inkbox/render3d/Render3DHost.js';
import { readEnvironmentLibrary } from './inkbox-environment-glb-reader.mjs';

export function makeTestHost(world, options={}) {
  const camera=new THREE.OrthographicCamera(-50,50,40,-40,.1,2000);
  camera.position.set(0,100,100);camera.lookAt(0,0,0);camera.updateMatrixWorld(true);
  const gpu={info:{memory:{geometries:0,textures:0},render:{calls:0,triangles:0}},
    setPixelRatio(){},setClearColor(){},setSize(){},render(){},dispose(){}};
  const cameraRig={camera,update(){},resize(){},setDimensions(){},dispose(){},focusOn(){}};
  const library=options.environmentLibrary || readEnvironmentLibrary(path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'));
  const host=new Render3DHost({},world,{gpu,cameraRig,characters:false,environment:false,
    environmentLibrary:library,productionAssets:true,lodEnabled:true,...options});
  if(!options.environmentLibrary){const dispose=host.dispose.bind(host);host.dispose=()=>{dispose();library.dispose();};}
  host.resize(900,600);return host;
}
