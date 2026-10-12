// Standalone component contract tests. Run with node scripts/inkbox-g1-web-check.mjs
import { createCharacterCardView } from "../src/inkbox/ui/g1/presentation/characterCardView.js";
import { cultivationProgress, statusLabel } from "../src/inkbox/ui/g1/presentation/characterCardFormat.js";
import { createWorldProgressView } from "../src/inkbox/ui/g1/presentation/worldProgressView.js";
import { createWorldCreationInfoView, formatWorldCreationInfo } from "../src/inkbox/ui/g1/presentation/worldCreationInfo.js";

let checks = 0;
function ok(condition, explanation) {
  if (!condition) throw new Error("G1-W failed: " + explanation);
  checks++;
}
function eq(actual, expected, explanation) { ok(actual === expected, explanation + " (" + actual + " vs " + expected + ")"); }
function clone(value) { return JSON.parse(JSON.stringify(value)); }
class Element {
  constructor(doc, tag) {
    this.ownerDocument = doc; this.tagName = tag.toUpperCase(); this.children = [];
    this.parentNode = null; this.dataset = {}; this.style = {}; this.attributes = {};
    this.listeners = new Map(); this.hidden = false; this.disabled = false;
    this.className = ""; this._text = ""; this.scrollTop = 0;
  }
  set textContent(value) {
    for (const item of this.children) item.parentNode = null;
    this.children = []; this._text = String(value);
  }
  get textContent() { return this._text + this.children.map(x => x.textContent).join(""); }
  get lastChild() { return this.children.at(-1) || null; }
  setAttribute(k,v) { this.attributes[k] = String(v); }
  getAttribute(k) { return this.attributes[k] ?? null; }
  append(...items) {
    for (const item of items) { if (item.parentNode) item.remove(); item.parentNode = this; this.children.push(item); }
  }
  replaceChildren(...items) {
    for (const child of this.children) child.parentNode = null;
    this.children = []; this._text = ""; this.append(...items);
  }
  remove() {
    if (!this.parentNode) return;
    const group = this.parentNode.children;
    const index = group.indexOf(this);
    if (index >= 0) group.splice(index,1);
    this.parentNode = null;
  }
  contains(other) { for (let p = other; p; p = p.parentNode) if (p === this) return true; return false; }
  closest(selector) {
    for (let p = this; p; p = p.parentNode)
      if (selector === "button[data-g1-action]" && p.tagName === "BUTTON" && p.dataset.g1Action) return p;
    return null;
  }
  addEventListener(k,listener) {
    if (!this.listeners.has(k)) this.listeners.set(k,new Set());
    this.listeners.get(k).add(listener);
  }
  removeEventListener(k,listener) { this.listeners.get(k)?.delete(listener); }
  focus() { this.ownerDocument.activeElement = this; }
  click() { this.dispatch("click"); }
  dispatch(kind,key) {
    if (this.disabled) return;
    const event = {target:this, key, prevented:false, preventDefault(){ this.prevented = true; }};
    for(let p=this;p;p=p.parentNode) for(const f of p.listeners.get(kind)||[]) f(event);
    return event;
  }
}
class Document { createElement(tag) { return new Element(this,tag); } }
function match(root,predicate) {
  const result = [];
  function walk(x) { if(predicate(x)) result.push(x); for(const child of x.children) walk(child); }
  walk(root); return result;
}
function actions(root,type) {return match(root,x=>x.dataset?.g1Action===type);}
function person() {
 return {
  schemaVersion:1, permissions:{canWatch:true,canFocus:true,canExport:true,canShowRelations:true},
  identity:{key:"mortal:123",id:123,plane:"mortal",status:"alive",name:"林照溪",canFocus:true},
  header:{realm:"炼气四层",ageText:"23 岁",affiliation:"青云门",stateText:"修行中"},
  cultivation:{exp:80,required:128,percent:62.5,rateText:"每日修为 0.2",stateText:"积累修为"},
  overview:[{label:"灵根",value:"木灵根"}],
  cultivationRows:[{label:"气运",value:"62"}],
  history:[{day:720,kind:"sect",text:"拜入青云门"}],
  relations:[{label:"道友",value:"王甲"}],
  edicts:[{id:"cultivation",title:"灌顶",description:"增加真实修为",enabled:true},
    {id:"luck",title:"拨运",description:"改变气运",enabled:false,disabledReason:"命数不足"}],
  watched:false,
 };
}
const doc=new Document(), root=doc.createElement("div"), log=[];
const card=createCharacterCardView(root,{onAction:event=>log.push(event)});
const base=person(); card.render(base);
eq(root.children.length,1,"mount");
eq(match(root,x=>x.getAttribute("role")==="tab").length,4,"four tabs");
ok(root.textContent.includes("林照溪")&&root.textContent.includes("炼气四层"),"name and realm");
eq(match(root,x=>x.getAttribute("role")==="progressbar")[0].getAttribute("aria-valuenow"),"62.5","real progress");
const buttons=actions(root,"tab");
buttons[1].click();
eq(buttons[1].getAttribute("aria-selected"),"true","switch tab");
const body=match(root,x=>x.className==="g1-character__body")[0];
body.scrollTop=90;
card.render(clone(base));
eq(body.scrollTop,90,"scroll stable");
ok(body===match(root,x=>x.className==="g1-character__body")[0],"DOM stable");
const full=clone(base); full.cultivation.percent=100; full.cultivation.exp=128;
card.render(full);
ok(root.textContent.includes("修为已满"),"full bar state");
const cap=clone(base); cap.cultivation.atRealmCap=true; card.render(cap);
ok(root.textContent.includes("已至境界上限"),"cap state");
const mortal=clone(base); mortal.header.realm="凡人"; mortal.cultivation={unawakened:true};
card.render(mortal);
ok(root.textContent.includes("尚未启灵"),"unawakened state");
actions(root,"watch")[0].click();
eq(log.at(-1).type,"watch","watch action");
eq(log.at(-1).targetKey,"mortal:123","watch key");
eq(base.watched,false,"watch does not mutate");
actions(root,"focus")[0].click(); eq(log.at(-1).type,"focus","focus action");
actions(root,"export")[0].click(); eq(log.at(-1).type,"export","export action");
buttons[2].click();
const edictButtons=actions(root,"edict");
eq(edictButtons.length,2,"edict count");
ok(edictButtons[1].disabled,"disabled edict");
const n=log.length;
edictButtons[1].click(); eq(log.length,n,"disabled action protected");
edictButtons[0].click();
eq(log.at(-1).edictId,"cultivation","edict ID");
eq(log.at(-1).targetKey,"mortal:123","edict target");
const changed=clone(base); changed.identity.key="mortal:999";
changed.identity.name="<img src=x onerror=alert(1)> 很长很长很长很长很长很长很长很长很长很长很长";
changed.edicts=[{id:"luck",title:"<script>unsafe</script>",enabled:true}];
changed.history=Array.from({length:500},(_,i)=>({day:i+1,text:"所历 "+i}));
card.render(changed);
eq(buttons[0].getAttribute("aria-selected"),"true","reset on character switch");
ok(root.textContent.includes("<img src")&&root.textContent.includes("<script>unsafe</script>"),"HTML characters literal");
eq(match(root,x=>x.tagName==="IMG"||x.tagName==="SCRIPT").length,0,"no element injection");
eq(match(root,x=>x.className==="g1-character__event").length,500,"long history");
buttons[2].click(); actions(root,"edict")[0].click();
eq(log.at(-1).targetKey,"mortal:999","never stale key");
const empty=clone(changed); empty.history=[];empty.relations=[];card.render(empty);
ok(root.textContent.includes("此人生平尚无可考之事"),"empty events");
for(const status of ["dead","ascended","missing","unknown"]){
 const v=clone(base);v.identity.status=status;v.permissions.canWatch=false;v.permissions.canFocus=false;v.edicts.forEach(e=>e.enabled=false);card.render(v);
 ok(actions(root,"watch")[0].disabled&&actions(root,"focus")[0].hidden,"readonly permission "+status);
 ok(actions(root,"edict")[0].disabled,"no edict "+status);
 ok(root.textContent.includes(statusLabel(status)),"status label "+status);
}
const noKey=clone(base);noKey.identity.key="";card.render(noKey);
ok(actions(root,"export")[0].hidden,"uncertain identity no action");
card.render(base);buttons[3].click();
actions(root,"show-relations")[0].click();
eq(log.at(-1).type,"show-relations","relations request");
buttons[2].focus();
const keyEvent=buttons[2].dispatch("keydown","ArrowRight");
ok(keyEvent.prevented&&buttons[3].getAttribute("aria-selected")==="true","keyboard tabs");
card.destroy();card.destroy();eq(root.children.length,0,"destroy idempotent");
const oldLog=log.length;buttons[0].click();eq(log.length,oldLog,"events removed");
const again=createCharacterCardView(root,{onAction:event=>log.push(event)});
again.render(base);eq(root.children.length,1,"remount");again.destroy();
eq(root.children.length,0,"remount destroy");
eq(cultivationProgress({exp:200,required:100,percent:200}).percent,100,"percentage capped");
eq(cultivationProgress({exp:-1,required:100,percent:-1}).percent,0,"percentage clamped");
const info=formatWorldCreationInfo({seed:"0",terrainName:"群山",mapSize:{width:384,height:240},
 gradualAccess:true,openedRangeText:"西南一隅"});
eq(info[0].value,"0","seed zero");
eq(info[2].value,"384 × 240","size");
eq(info[4].value,"西南一隅","runtime boundaries");
const creationRoot=doc.createElement("div"), creation=createWorldCreationInfoView(creationRoot);
creation.render({seed:"<b>not html</b>",gradualAccess:false});
ok(creationRoot.textContent.includes("<b>not html</b>"),"creation safe text");
creation.destroy();eq(creationRoot.children.length,0,"creation cleanup");
const progressRoot=doc.createElement("div"), worldEvents=[];
const world=createWorldProgressView(progressRoot,{onAction:event=>worldEvents.push(event)});
world.render({stage:40,openedPercent:40,boundaryText:"西南",canRequestExpand:true});
eq(match(progressRoot,x=>x.tagName==="H3")[0].textContent,"初开天眼","stage 40");
const expand=match(progressRoot,x=>x.tagName==="BUTTON")[0];
expand.click();eq(worldEvents.at(-1).type,"request-map-expansion","expansion request");
eq(worldEvents.at(-1).stage,40,"stage from runtime");
world.render({stage:60,openedPercent:60,canRequestExpand:false,disabledReason:"未达条件"});
const before=worldEvents.length;expand.click();eq(worldEvents.length,before,"disabled map action");
ok(progressRoot.textContent.includes("未达条件"),"map disabled reason");
world.render({stage:100,openedPercent:100,canRequestExpand:true});
ok(expand.hidden,"100 no expansion button");expand.click();
eq(worldEvents.length,before,"completed expansion prevented");
world.render({stage:999,openedPercent:null,canRequestExpand:true});
ok(expand.disabled,"unrecognized stage cannot expand");
world.destroy();eq(progressRoot.children.length,0,"world cleanup");
console.log("G1-W checks passed: "+checks);
