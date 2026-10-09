import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {dirname,resolve} from "node:path";
import {parseCreationSeed,makeCreationRequest,WORLD_PRESETS,TERRAIN_PRESETS} from "../src/inkbox/ui/g2/creation/creationMenuModel.js";
import {createCreationMenuView} from "../src/inkbox/ui/g2/creation/creationMenuView.js";
import {generatePortraitParts,portraitSvg} from "../src/inkbox/ui/g2/portraits/portraitGenerator.js";
import {createCharacterPortrait} from "../src/inkbox/ui/g2/portraits/characterPortrait.js";
import {normalizeCombatEvents,combatCharacterStatus} from "../src/inkbox/ui/g2/combat/combatObserverModel.js";
import {createCombatObserverView} from "../src/inkbox/ui/g2/combat/combatObserverView.js";
import {normalizeBusanziModel,makeBusanziTaskRequest} from "../src/inkbox/ui/g2/busanzi/busanziBridgeModel.js";
import {createBusanziBridgeView} from "../src/inkbox/ui/g2/busanzi/busanziBridgeView.js";
import {busanziPortraitSvg} from "../src/inkbox/ui/g2/busanzi/busanziPortrait.js";
import {buildRealmEdgeGeometry,geometryToSvgPath} from "../src/inkbox/ui/g2/realm-edge/realmEdgeStyles.js";
import {createRealmEdgePreview} from "../src/inkbox/ui/g2/realm-edge/realmEdgePreview.js";
let assertions=0;
const check=(value,label)=>{assert.ok(value,label);assertions++;};
const config={preset:"medium",terrainPreset:"standard",seed:"0",progressive:true};
check(parseCreationSeed("0")===0,"Seed 0");
check(parseCreationSeed("4294967295")===4294967295,"Seed max");
for(const v of ["","-1","1.2","0x10","4294967296",null]){
  assert.throws(()=>parseCreationSeed(v),RangeError);assertions++;
}
check(makeCreationRequest(config).options.seed===0,"valid creation callback");
check(makeCreationRequest({...config,preset:"expanse",terrainPreset:"wetlands"}).options.preset==="expanse","large creation");
check(WORLD_PRESETS.map(p=>p.id).join(",")==="small,medium,large,expanse","world keys");
check(TERRAIN_PRESETS.map(p=>p.id).join(",")==="standard,mountains,wetlands","terrain keys");
check(JSON.stringify(generatePortraitParts({identityKey:"mortal:12"}))===
  JSON.stringify(generatePortraitParts({identityKey:"mortal:12"})),"portrait reproducibility");
const portraits=new Set(Array.from({length:64},(_,i)=>portraitSvg({identityKey:"fixture:"+i})));
check(portraits.size>=52,"distinct portraits");
check(portraitSvg({identityKey:"empty",appearance:null}).includes("<svg"),"empty appearance");
const events=Array.from({length:1000},(_,i)=>({id:"fx:"+i,type:"attack",plane:"mortal",x:i,y:6,canObserve:true}));
check(normalizeCombatEvents(events).length===24,"bounded events");
check(combatCharacterStatus(null)==="当前状态未知","no inferred fighting");
check(!("kills" in normalizeCombatEvents([{type:"attack",kills:500}])[0]),"no inferred kills");
check(normalizeCombatEvents([]).length===0,"empty events");
const opts={taskRequests:true,allowedTaskKinds:["investigate-site"]};
check(makeBusanziTaskRequest("investigate-site",{kind:"site",id:5},{...opts,taskRequests:false})===null,"disabled task");
check(makeBusanziTaskRequest("investigate-site",{kind:"site",id:5},opts).type==="request-busanzi-task","request only");
check(normalizeBusanziModel({}).canRequestTask===false,"default task closed");
check(busanziPortraitSvg().includes('rect x="47" y="73"'),"six line Li hexagram");
check(busanziPortraitSvg({wind:true})!==busanziPortraitSvg({wind:false}),"wind glimpse");
check(geometryToSvgPath(buildRealmEdgeGeometry([{x:0,y:0},{x:30,y:9}])).startsWith("M"),"edge sample");
// Minimal DOM event double. Layout, accessibility and GPU are NOT covered.
class NodeDouble {
  constructor(doc,tag){
    this.ownerDocument=doc;this.tagName=tag.toUpperCase();this.children=[];
    this.parentNode=null;this.className="";this.dataset={};this.attributes=new Map();
    this.handlers=new Map();this._text="";this.value="";this.checked=false;this.disabled=false;this.hidden=false;this.scrollTop=0;
  }
  get textContent(){return this._text+this.children.map(n=>n.textContent).join("");}
  set textContent(s){this.replaceChildren();this._text=String(s??"");}
  get lastChild(){return this.children.at(-1)||null;}
  append(...nodes){for(const n of nodes){
    if(n.parentNode)n.remove();n.parentNode=this;this.children.push(n);
    if(this.tagName==="SELECT"&&n.tagName==="OPTION"&&this.children.length===1)this.value=n.value;
  }}
  replaceChildren(...nodes){this.children.forEach(n=>n.parentNode=null);this.children=[];this._text="";this.append(...nodes);}
  remove(){if(this.parentNode){const a=this.parentNode.children,i=a.indexOf(this);if(i>=0)a.splice(i,1);this.parentNode=null;}}
  contains(n){for(let p=n;p;p=p.parentNode)if(p===this)return true;return false;}
  setAttribute(k,v){this.attributes.set(k,String(v));}
  removeAttribute(k){this.attributes.delete(k);}
  getAttribute(k){return this.attributes.get(k);}
  focus(){this.ownerDocument.activeElement=this;}
  addEventListener(k,fn){const a=this.handlers.get(k)||[];a.push(fn);this.handlers.set(k,a);}
  removeEventListener(k,fn){this.handlers.set(k,(this.handlers.get(k)||[]).filter(f=>f!==fn));}
  fire(k,target=this){for(const fn of this.handlers.get(k)||[])fn({target,preventDefault(){}});}
  matches(s){
    if(s==="button"||s==="h2")return this.tagName===s.toUpperCase();
    if(s[0]===".")return this.className.split(" ").includes(s.slice(1));
    const m=s.match(/^\[data-([\w-]+)(?:="([^"]+)")?\]$/);
    if(!m)return false;
    const k=m[1].replace(/-([a-z])/g,(_,v)=>v.toUpperCase());
    return this.dataset[k]!==undefined&&(m[2]===undefined||this.dataset[k]===m[2]);
  }
  closest(s){for(let p=this;p;p=p.parentNode)if(p.matches(s))return p;return null;}
  querySelector(s){for(const n of this.children){if(n.matches(s))return n;const hit=n.querySelector(s);if(hit)return hit;}return null;}
}
const root=()=>{const doc={activeElement:null,createElement(t){return new NodeDouble(this,t);},
  createElementNS(ns,t){return new NodeDouble(this,t);}};return doc.createElement("main");};
let r=root(),actions=[],view=createCreationMenuView(r,{onAction:a=>actions.push(a)});
view.render({seed:0,canContinue:false,slots:[]});view.render({seed:0,canContinue:false,slots:[]});
const frame=r.children[0],form=frame.querySelector(".g2-creation__form");
check((form.handlers.get("submit")||[]).length===1,"creation listener singleton");
frame.querySelector(".g2-creation__input").value="0";
form.fire("submit");check(actions.at(-1)?.type==="create-world","creation action");
const before=actions.length;view.destroy();form.fire("submit");
check(actions.length===before,"creation destroyed");
r=root();view=createCharacterPortrait(r);
view.render({identityKey:"x",status:"alive"});const img=r.children[0].children[0],url=img.src;
view.render({identityKey:"x",status:"dead"});check(url===img.src,"same face with death border");view.destroy();
r=root();actions=[];view=createCombatObserverView(r,{onAction:a=>actions.push(a)});
view.render({enabled:true,events});view.render({enabled:true,events});
const frameC=r.children[0],rows=frameC.querySelector(".g2-combat__list");
check(rows.children.length===24,"combat DOM cap");
check((frameC.handlers.get("click")||[]).length===1,"combat listener singleton");
const watch=rows.children.at(-1).children[1];
frameC.fire("click",watch);check(actions.at(-1)?.type==="locate-combat","combat locates");
const cBefore=actions.length;view.destroy();frameC.fire("click",watch);
check(actions.length===cBefore,"combat destroyed");
r=root();actions=[];view=createBusanziBridgeView(r,{onAction:a=>actions.push(a)});
view.render({tasks:[],capabilities:{taskRequests:false}});
const frameD=r.children[0],disabled=frameD.querySelector(".g2-busanzi__request");
check(disabled.disabled,"no task permission");
view.render({tasks:[{id:"t",state:"traveling"}],capabilities:{
  taskRequests:true,allowedTaskKinds:["investigate-site"],
  targets:{"investigate-site":{kind:"site",id:1}}}});
const task=frameD.querySelector('[data-task-type="investigate-site"]');
check(!task.disabled,"capability enables task");
frameD.fire("click",task);check(actions.at(-1)?.type==="request-busanzi-task","busanzi emits request");
check((frameD.handlers.get("click")||[]).length===1,"busanzi listener singleton");
const dBefore=actions.length;view.destroy();frameD.fire("click",task);
check(actions.length===dBefore,"busanzi destroyed");
r=root();view=createRealmEdgePreview(r);view.render({scale:1.5});view.destroy();
check(r.children.length===0,"edge preview lifecycle");
const preview=readFileSync(resolve(dirname(fileURLToPath(import.meta.url)),"..","research/g2-web-preview/index.html"),"utf8");
for(const mode of ["creation","portraits","combat","busanzi","edge"])check(preview.includes('data-mode="'+mode+'"'),"preview: "+mode);
for(const source of [
 "../src/inkbox/ui/g2/creation/creationMenuView.js",
 "../src/inkbox/ui/g2/portraits/characterPortrait.js",
 "../src/inkbox/ui/g2/combat/combatObserverView.js",
 "../src/inkbox/ui/g2/busanzi/busanziBridgeView.js",
 "../src/inkbox/ui/g2/realm-edge/realmEdgeStyles.js"]){
  check(!/from\s*["'][^"']*(\/sim\/|\/world\/|\/io\/save|\/render3d\/)/.test(
    readFileSync(resolve(dirname(fileURLToPath(import.meta.url)),source),"utf8")),"pure presentation");
}
console.log("G2-W Node checks PASS · "+assertions+" assertions (DOM double; not browser)");
