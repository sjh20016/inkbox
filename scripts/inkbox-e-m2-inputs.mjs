import assert from 'node:assert/strict';
import {sleep} from './cdp.mjs';
import {distribution} from './inkbox-e-m2-common.mjs';

// Native mouse/key delivery and actual product applyTool/History boundaries.
// Date.now shares the local OS clock between the controller and Edge. Results
// include CDP transport and a next-rAF visibility upper bound, explicitly.
export async function probeInputs(b,page,renderer,previewFile){
 const result={method:'Native Edge/CDP mouse and touchCancel; node-issued Date.now to next browser rAF after real preview/terrain change. Includes transport and paint scheduling, not isolated handler CPU.',receipts:[]};
 result.cancelMethod=renderer==='canvas'?'Native CDP touchCancel -> pointercancel':'Native mouseDown, browser releasePointerCapture -> trusted lostpointercapture';
 try {
 const target=await page(`const k=inkbox,w=k.world,{accessBounds}=await import('./src/inkbox/world/mapProgress.js'),a=accessBounds(w),p={x:Math.floor((a.x0+a.x1)/2),y:Math.floor((a.y0+a.y1)/2)};k.selectTool('raise');k.brushRadius=1;window.__em2Point=p;if(k.render3d?.active){k.render3d.setTool('raise');k.render3d.radius=1;k.render3d.renderer.focusOn(p.x,p.y,{duration:0},'mortal');}else{k.camera.relief=false;k.camera.focusOn(p.x,p.y,{zoom:7.2,duration:0});}return p;`);
 await sleep(250);
 const screen=()=>page(`const k=inkbox,p=window.__em2Point;if(k.render3d?.active){const r=k.render3d.renderer,T=await import('three'),s=r.stages.get('mortal'),q=r.coordinates.worldToRender(p.x,p.y,s.elevation.at(p.x,p.y));r.cameraRig.camera.updateMatrixWorld();const v=new T.Vector3(q.x,q.y,q.z).project(r.cameraRig.camera),rect=k.render3d.canvas.getBoundingClientRect();return {x:rect.left+(v.x+1)*rect.width/2,y:rect.top+(1-v.y)*rect.height/2};}const rect=k.canvas.getBoundingClientRect();return {x:rect.left+k.camera.toScreenX(p.x),y:rect.top+k.camera.toScreenY(p.y)};`);
 await page(`inkbox.setSpeed(0);window.__em2Heights=Array.from(inkbox.world.height);window.__em2CancelTerrain=Object.fromEntries(['height','water','type','veg','fire'].map(k=>[k,Array.from(inkbox.world[k])]));document.addEventListener('pointerdown',e=>{window.__em2PointerId=e.pointerId;},{capture:true,once:true});document.addEventListener('lostpointercapture',e=>{window.__em2LostTrusted=e.isTrusted;},{capture:true,once:true});return true;`);
 let p=await screen();
 if(renderer==='canvas'){await b.cdp.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});await b.cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:p.x,y:p.y,id:1,radiusX:1,radiusY:1}]});}
 else{await b.mouseMove(p.x,p.y);await b.mouseDown(p.x,p.y);}
 await sleep(110);
 result.cancelBefore=await page(`const k=inkbox;return {pending:k.render3d?.active?!!k.render3d.stroke:k.pointer.down&&k.pointer.actionKind==='drag'&&k.pointer.strokePoints?.length>0,strokeOpen:!!k.render3d?.stroke,points:k.pointer.strokePoints?.length||0,pointerId:window.__em2PointerId};`);assert.equal(result.cancelBefore.pending,true,'cancellation starts from an actual pending stroke');
 if(previewFile){await b.screenshot(previewFile);result.previewScreenshot=previewFile;}
 if(renderer==='canvas'){await b.cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});await b.cdp.send('Emulation.setTouchEmulationEnabled',{enabled:false});}
 else{await page(`inkbox.render3d.canvas.releasePointerCapture(window.__em2PointerId);return true;`);await b.mouseMove(p.x+1,p.y);await b.mouseUp(p.x+1,p.y);}
 await sleep(100);
 result.cancel=await page(`const k=inkbox;return {layerChanges:Object.fromEntries(Object.entries(window.__em2CancelTerrain).map(([key,a])=>[key,k.world[key].reduce((n,v,i)=>n+(v!==a[i]),0)])),strokeOpen:!!k.render3d?.stroke,pointerDown:k.pointer.down,lostPointerCaptureTrusted:window.__em2LostTrusted};`);assert(Object.values(result.cancel.layerChanges).every(n=>n===0),'cancellation restores all five terrain layers');assert.equal(result.cancel.strokeOpen,false);if(renderer==='3d')assert.equal(result.cancel.lostPointerCaptureTrusted,true,'browser trusted lost-capture reaches real Three cancel handler');
 for(let i=0;i<8;i++){
  await page(`inkbox.selectTool('raise');if(inkbox.render3d?.active)inkbox.render3d.setTool('raise');window.__em2Heights=Array.from(inkbox.world.height);window.__em2Input={};document.addEventListener('pointerdown',e=>{const r=window.__em2Input;r.deliveredAt=Date.now();r.eventTimestamp=e.timeStamp;requestAnimationFrame(()=>{r.localFeedbackAt=Date.now();r.previewPending=inkbox.render3d?.active?!!inkbox.render3d.stroke:inkbox.pointer.down&&inkbox.pointer.actionKind==='drag'&&inkbox.pointer.strokePoints?.length>0;r.pointerDown=!!inkbox.pointer.down;r.tool=inkbox.toolId;});},{capture:true,once:true});document.addEventListener('pointerup',()=>{const r=window.__em2Input;r.upDeliveredAt=Date.now();requestAnimationFrame(()=>{r.authorityVisibleAt=Date.now();r.changed=inkbox.world.height.reduce((n,v,j)=>n+(v!==window.__em2Heights[j]),0);r.historyEntries=inkbox.render3d?.active?inkbox.render3d.undoStack.length:inkbox.history.stack.length;});},{capture:true,once:true});inkbox.setSpeed(2);return true;`);
  p=await screen();await b.mouseMove(p.x,p.y);const downIssuedAt=Date.now();await b.mouseDown(p.x,p.y);await sleep(110);const upIssuedAt=Date.now();await b.mouseUp(p.x,p.y);
  assert(await b.waitFor('return !!window.__em2Input.authorityVisibleAt',{timeoutMs:15000}),'real command visible receipt');
  const receipt=await page(`inkbox.setSpeed(0);return window.__em2Input;`);Object.assign(receipt,{downIssuedAt,upIssuedAt,localFeedbackMs:receipt.localFeedbackAt-downIssuedAt,gestureToAuthorityMs:receipt.authorityVisibleAt-downIssuedAt,releaseToAuthorityMs:receipt.authorityVisibleAt-upIssuedAt});assert.equal(receipt.previewPending,true,'real pending preview exists at local feedback rAF');assert(receipt.changed>0,'native admitted raise must change terrain');assert(receipt.historyEntries>0);result.receipts.push(receipt);
  const undo=await page(`const k=inkbox,r=k.render3d?.active?k.render3d.undo():k.undo();return {result:r,remaining:k.world.height.reduce((n,v,j)=>n+(v!==window.__em2Heights[j]),0)};`);assert.equal(undo.remaining,0,'official undo restores complete terrain');
 }
 result.localFeedbackMs=distribution(result.receipts.map(r=>r.localFeedbackMs));result.gestureToAuthorityMs=distribution(result.receipts.map(r=>r.gestureToAuthorityMs));result.releaseToAuthorityMs=distribution(result.receipts.map(r=>r.releaseToAuthorityMs));result.target=target;result.renderer=renderer;
 await page(`inkbox.setSpeed(0);delete window.__em2Input;delete window.__em2Heights;delete window.__em2Point;return true;`);return result;
 } catch(error) { error.inputEvidence=result; throw error; }
}
