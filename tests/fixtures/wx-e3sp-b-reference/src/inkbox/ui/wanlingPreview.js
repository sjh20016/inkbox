// Imported only when the player opens a model preview. One model/context, no simulation.
import * as THREE from 'three';
import { loadCreatureLibrary } from '../render3d/creatures/CreatureLibrary.js';
export async function showWanlingPreview(holder,form) {
  const library=await loadCreatureLibrary({ids:[form]});
  let renderer;
  try {
    renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.setSize(360,260);
    const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(35,360/260,.01,100);
    const species=library.species.get(form),mesh=new THREE.Mesh(species.geometry,library.material);scene.add(mesh);
    const box=new THREE.Box3().setFromObject(mesh),size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3()),extent=Math.max(size.x,size.y,size.z,.2);
    mesh.position.sub(center);camera.position.set(extent*1.7,extent*.7,extent*2.5);camera.lookAt(0,0,0);
    scene.add(new THREE.AmbientLight(0xffffff,2));const light=new THREE.DirectionalLight(0xffffff,2);light.position.set(2,3,4);scene.add(light);
    const turn=document.createElement('button');turn.type='button';turn.textContent='转看';turn.addEventListener('click',()=>{mesh.rotation.y+=Math.PI/4;renderer.render(scene,camera);});
    holder.replaceChildren(renderer.domElement,turn);renderer.render(scene,camera);
    return()=>{renderer.dispose();library.dispose();holder.replaceChildren();};
  }catch(error){renderer?.dispose();library.dispose();throw error;}
}
