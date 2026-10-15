import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { parseSeed, creationOptions, createSandboxWorld, expandSandboxMap } from '../src/inkbox/ui/worldCreation.js';
import { createMapProgress, accessBounds } from '../src/inkbox/world/mapProgress.js';
import { Camera } from '../src/inkbox/render/camera.js';
import { TerrainLayer } from '../src/inkbox/render/terrainLayer.js';
const checks=[];
function check(name,fn){fn();checks.push(name);console.log('PASS '+name);}
check('seed zero and uint32 boundaries are accepted; invalid input never wraps or randomizes',()=>{
 assert.equal(parseSeed('0'),0);assert.equal(parseSeed('4294967295'),0xffffffff);assert.equal(parseSeed(' 42 '),42);
 for(const v of ['',null,'-1','0.5','4294967296','NaN','1e3','Infinity','abc'])assert.throws(()=>parseSeed(v),RangeError);
});
check('explicit creation configuration produces v2 and v1 remains opt-in compatible',()=>{
 const w=createSandboxWorld({w:32,h:24},0,{generationVersion:2,terrainPreset:'mountains',progressive:true});
 assert.equal(w.seed,0);assert.deepEqual(w.generation,{version:2,terrainPreset:'mountains'});assert.equal(w.mapProgress.stage,0);
 const a=createSandboxWorld({w:32,h:24},0,{generationVersion:1,progressive:false});
 assert.equal(a.generation,undefined);assert.equal(a.mapProgress,undefined);
 assert.deepEqual(creationOptions({terrainPreset:'legacy'}),{generationVersion:1,terrainPreset:'standard',progressive:false});
});
check('Canvas access limits fit, pan, object visibility and reveal without snapping a locked pick',()=>{
 const w={w:100,h:80,reliefScale:10,height:new Float32Array(8000).fill(.4),water:new Float32Array(8000)};
 createMapProgress(w,true);const b=accessBounds(w),c=new Camera();c.setViewport(800,600);c.bind(w);c.fit(w);
 assert.equal(c.x,50);assert.equal(c.y,40);assert.ok(c.zoom>8);c.panBy(100000,100000);c.clamp();assert.equal(c.x,b.x0);assert.equal(c.y,b.y0);
 c.focusOn(1,1,{duration:0});assert.equal(c.x,b.x0);assert.equal(c.y,b.y0);assert.equal(c.canAccess(1,1),false);
 c.relief=false;const pick=c.pick(c.toScreenX(1),c.toScreenY(1),w);assert.deepEqual(pick,{x:1,y:1});assert.equal(c.canAccess(pick.x,pick.y),false);
 const calls=[],ctx={beginPath(){},moveTo(x,y){calls.push([x,y]);},lineTo(x,y){calls.push([x,y]);},closePath(){},clip(){calls.push('clip');}};
 c.clipAccess(ctx);assert.equal(calls.at(-1),'clip');assert.ok(calls.length>100);
 const rect=c.visibleRect(w);assert.ok(rect.x0>=b.x0&&rect.x1<=b.x1&&rect.y0>=b.y0&&rect.y1<=b.y1);
});
check('expansion commits one access change, invalidates Canvas, retains arrays and marks unsaved',()=>{
 const world={w:100,h:80,height:new Float32Array(8000),seed:0};createMapProgress(world,true);const height=world.height,calls=[];
 const sb={world,render3d:{endStroke(){calls.push('finish');}},terrain:{invalidate(){calls.push('invalidate');}},camera:{fit(w){assert.equal(w,world);}},qol:{markDirty(v){calls.push(v);}},notify(){}};
 assert.equal(expandSandboxMap(sb),true);assert.equal(world.mapProgress.stage,1);assert.equal(world.height,height);assert.equal(world.seed,0);assert.equal(sb.dirty,true);
 assert.deepEqual(calls,['finish','invalidate','terrain']);assert.equal(expandSandboxMap(sb,true),true);assert.equal(world.mapProgress.stage,3);assert.equal(expandSandboxMap(sb),false);
});
check('Canvas invalidate is a real cache reset',()=>{const layer=Object.create(TerrainLayer.prototype);layer.lastRender=999;layer.invalidate();assert.equal(layer.lastRender,-Infinity);});
check('main stroke isolation keeps real-time updates but accrues no simulation catch-up',()=>{
 const src=readFileSync(new URL('../src/inkbox/main.js',import.meta.url),'utf8');
 const match=src.match(/\n  update\(dt\) \{([\s\S]*?)\n  \}\r?\n\r?\n  defaultHint\(\)/);assert.ok(match);
 const counts={advance:[],hydro:0,decay:0,presentation:0,camera:0,flush:0,auto:0};
 const update=new Function('TIME','updateFocusPulses','stepHydrology','decayOverlay','flushDirty','return function(dt){'+match[1]+'}')(
 {speeds:[{mult:0},{mult:3}],baseDaysPerSecond:2},()=>{},()=>counts.hydro++,()=>counts.decay++,()=>{});
 const s={world:{},render3d:{stroke:{},flushStroke(){counts.flush++;}},camera:{update(){counts.camera++;}},focusPulses:[],tracePulses:[],clock:0,
 stage:{ingestWorlds(){return this;},update(){counts.presentation++;}},speedIndex:1,hydroAccum:.05,decayAccum:.2,pointer:{painting:false},tool:{mode:'inspect'},
 autoSaveAccum:89.9,uiAccum:0,toastTimer:0,updateHud(){},advanceDays(days){counts.advance.push(days);},autoSave(){counts.auto++;}};
 for(let i=0;i<10;i++)update.call(s,.1);
 assert.deepEqual(counts.advance,[]);assert.equal(counts.hydro,0);assert.equal(counts.decay,0);
 assert.equal(s.hydroAccum,.05);assert.equal(s.decayAccum,.2);assert.equal(counts.auto,0);assert.equal(s.speedIndex,1);
 assert.equal(counts.camera,10);assert.equal(counts.presentation,10);assert.equal(counts.flush,10);
 s.render3d.stroke=null;update.call(s,.1);
 assert.equal(counts.advance.length,1);assert.ok(Math.abs(counts.advance[0]-.6)<1e-10);assert.equal(counts.hydro,0);assert.equal(counts.auto,1);
});
console.log('M2-C2E creation/Canvas contracts: '+checks.length+'/'+checks.length+' passed');
