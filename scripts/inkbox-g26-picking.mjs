import assert from 'node:assert/strict';
import * as THREE from 'three';
import { PlanePicker } from '../src/inkbox/render3d/picking/PlanePicker.js';
import { Render3DAdapter } from '../src/inkbox/render3d/Render3DAdapter.js';

const scene=new THREE.Scene();
const camera=new THREE.OrthographicCamera(-10,10,10,-10,.1,100);
camera.position.set(0,20,10);camera.lookAt(0,0,0);camera.updateMatrixWorld(true);
const terrain=new THREE.Mesh(new THREE.PlaneGeometry(20,20).rotateX(-Math.PI/2),new THREE.MeshBasicMaterial());
terrain.updateMatrixWorld(true);
const site=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshBasicMaterial(),1);
site.setMatrixAt(0,new THREE.Matrix4().makeTranslation(0,1,.5));site.count=1;
site.userData.renderSites=[{id:7,x:0,y:.5}];
const markerGroup=new THREE.Group();markerGroup.add(site);
const actor=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshBasicMaterial(),1);
actor.setMatrixAt(0,new THREE.Matrix4().makeTranslation(0,2,1));actor.count=1;
actor.userData.renderEntities=[{id:10,x:0,y:1}];
const actorGroup=new THREE.Group();actorGroup.add(actor);
const water=new THREE.Mesh(new THREE.PlaneGeometry(20,20),new THREE.MeshBasicMaterial());
const world={w:32,h:24,sites:[{id:7,x:0,y:.5}],leylines:[],rifts:[]};
const coordinates={renderToWorld:(x,z)=>({x,y:z}),renderPointToCell:p=>({x:Math.floor(p.x),y:Math.floor(p.z)})};
const stage={plane:'mortal',world,visible:true,root:new THREE.Group(),terrain:{mesh:terrain},
  water:{mesh:water},entities:{group:actorGroup},markers:{group:markerGroup},coordinates,
  contentGeometry:null,contentInside:true,regionGeometry:null,regionInside:true,accessKey:null};
stage.root.add(terrain,markerGroup,actorGroup,water);scene.add(stage.root);
const host={world,scene,cameraRig:{camera},coordinates,stages:new Map([['mortal',stage]]),width:900,height:600,boundary:null};
const picker=new PlanePicker(host);host.picker=picker;
const sign=()=>Render3DAdapter.prototype.hoverSignature.call({renderer:host},450,300);
let signature=sign();
const hover=()=>picker.pick(450,300,900,600,null,{reuseStatic:true,staticKey:signature.staticKey});

assert.equal(hover()?.entityId,10,'front actor wins visible depth');
const firstStatic=picker.stats.staticRaycasts;
actor.setMatrixAt(0,new THREE.Matrix4().makeTranslation(5,2,1));actor.instanceMatrix.needsUpdate=true;
let next=sign();
assert.equal(next.staticKey,signature.staticKey,'moving actor does not invalidate static geometry');
assert.notEqual(next.dynamicKey,signature.dynamicKey,'actor matrix changes dynamic signature');
signature=next;
assert.equal(hover()?.siteId,7,'cached static site beats terrain after actor moves away');
assert.equal(picker.stats.staticRaycasts,firstStatic);
assert(picker.stats.staticCacheHits>0&&picker.stats.dynamicQueries>=2);

actor.userData.renderEntities[0]={id:11,x:0,y:1};
actor.setMatrixAt(0,new THREE.Matrix4().makeTranslation(0,2,1));actor.instanceMatrix.needsUpdate=true;
signature=sign();assert.equal(hover()?.entityId,11,'new moving actor wins over cached site');
const beforeClick=picker.stats.staticRaycasts;
assert.equal(picker.pick(450,300,900,600)?.entityId,11,'default click is fresh');
assert(picker.stats.staticRaycasts>beforeClick);
const beforePlane=picker.stats.staticRaycasts;
assert.equal(picker.pick(450,300,900,600,'mortal')?.kind,'terrain','drag plane remains terrain-only');
assert(picker.stats.staticRaycasts>beforePlane);

const beforeTerrain=sign().staticKey;
terrain.geometry.attributes.position.needsUpdate=true;
assert.notEqual(sign().staticKey,beforeTerrain,'terrain dirty invalidates static key');
const beforeWater=sign().staticKey;
water.geometry.attributes.position.needsUpdate=true;
assert.equal(sign().staticKey,beforeWater,'visual water is not a picking surface and must preserve static intersections');
const beforeRegion=sign().staticKey;
stage.contentGeometry={};
assert.notEqual(sign().staticKey,beforeRegion,'region replacement invalidates static key');
const beforeCamera=sign().staticKey;
camera.zoom=1.2;camera.updateProjectionMatrix();
assert.notEqual(sign().staticKey,beforeCamera,'camera change invalidates static key');
const beforeWorld=sign().staticKey;
host.world={...world};stage.world=host.world;
assert.notEqual(sign().staticKey,beforeWorld,'world replacement invalidates static key');
host.pick=(x,y,options)=>picker.pick(x,y,host.width,host.height,null,options);
const adapter=Object.assign(Object.create(Render3DAdapter.prototype),
  {renderer:host,canvas:{getBoundingClientRect:()=>({left:0,top:0})},hoverCache:null,
    hoverStats:{raycasts:0,cacheHits:0,invalidations:0,lastReason:'initial',staticRaycasts:0,staticCacheHits:0,dynamicQueries:0}});
const adapterHover=()=>Render3DAdapter.prototype.hoverHit.call(adapter,450,300);
assert.equal(adapterHover()?.entityId,11);
const initialStatic=adapter.hoverStats.staticRaycasts;
actor.setMatrixAt(0,new THREE.Matrix4().makeTranslation(5,2,1));actor.instanceMatrix.needsUpdate=true;
assert.equal(adapterHover()?.siteId,7);
assert.equal(adapter.hoverStats.staticRaycasts,initialStatic,'adapter reuses terrain while actor moves');
assert(adapter.hoverStats.dynamicQueries>=2&&adapter.hoverStats.staticCacheHits>=1);
water.geometry.attributes.position.needsUpdate=true;
assert.equal(adapterHover()?.siteId,7);
assert.equal(adapter.hoverStats.staticRaycasts,initialStatic,'water animation cannot trigger another terrain raycast');
host.world.sites.length=0;
assert.equal(adapterHover()?.kind,'terrain','removed Site cannot survive an unchanged hover signature');
picker.clearHoverCache();assert.equal(picker.hoverStatic,null,'lifecycle release clears cached intersections');

// RealmBoundaryLayer.edges is a numeric count, not an object identity.
const boundary = new THREE.Mesh(new THREE.PlaneGeometry(2,2), new THREE.MeshBasicMaterial());
host.boundary = { mesh: boundary, edges: 4 };
let boundaryKey;
assert.doesNotThrow(() => { boundaryKey = sign().staticKey; }, 'an open realm cannot stop the frame loop with a WeakMap key error');
host.boundary.edges = 6;
assert.notEqual(sign().staticKey, boundaryKey, 'boundary edge count participates as a value');
host.boundary = null; boundary.geometry.dispose(); boundary.material.dispose();

terrain.geometry.dispose();terrain.material.dispose();site.geometry.dispose();site.material.dispose();site.dispose();
actor.geometry.dispose();actor.material.dispose();actor.dispose();water.geometry.dispose();water.material.dispose();
console.log('G2.6 picking: static reuse, dynamic depth, fresh click/drag, dirty keys and lifecycle passed');
