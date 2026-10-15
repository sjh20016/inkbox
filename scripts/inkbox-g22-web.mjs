import assert from 'node:assert/strict';
import { createCombatObserverView } from '../src/inkbox/ui/g2/combat/combatObserverView.js';
import { combatObserverModel, normalizeCombatEvents } from '../src/inkbox/ui/g2/combat/combatObserverModel.js';
import { createCombatObservationRuntime } from '../src/inkbox/g2/combatObservationRuntime.js';
import { buildCharacterViewModel } from '../src/inkbox/g1/characterRuntime.js';
import { PresentationStage } from '../src/inkbox/render/presentationStage.js';
import { serializeWorld, deserializeWorld } from '../src/inkbox/io/save.js';
import { fixture } from './inkbox-g1-fixtures.mjs';

class Element {
  constructor(doc,tag){this.ownerDocument=doc;this.tagName=tag.toUpperCase();this.children=[];this.parentNode=null;this.dataset={};this.attributes={};this.listeners=new Map();this.style={};this._text='';this.scrollTop=0;this.disabled=false;}
  set innerHTML(value){throw Error('HTML insertion is forbidden in the observer');}
  set textContent(value){this.replaceChildren();this._text=String(value);}
  get textContent(){return this._text+this.children.map(e=>e.textContent).join('');}
  get lastChild(){return this.children.at(-1)||null;}
  setAttribute(k,v){this.attributes[k]=String(v);}
  getAttribute(k){return this.attributes[k]??null;}
  append(...nodes){for(const node of nodes){node.remove();node.parentNode=this;this.children.push(node);}}
  replaceChildren(...nodes){for(const node of this.children)node.parentNode=null;this.children=[];this._text='';this.append(...nodes);}
  remove(){if(this.parentNode){const p=this.parentNode;p.children.splice(p.children.indexOf(this),1);this.parentNode=null;}}
  contains(node){for(let p=node;p;p=p.parentNode)if(p===this)return true;return false;}
  closest(selector){for(let p=this;p;p=p.parentNode)if(selector==='[data-combat-key]'&&p.dataset.combatKey)return p;return null;}
  addEventListener(type,fn){if(!this.listeners.has(type))this.listeners.set(type,new Set());this.listeners.get(type).add(fn);}
  removeEventListener(type,fn){this.listeners.get(type)?.delete(fn);}
  click(){if(this.disabled)return;const event={target:this};for(let p=this;p;p=p.parentNode)for(const fn of p.listeners.get('click')||[])fn(event);}
}
class Document {createElement(tag){return new Element(this,tag);}}
const find=(root,fn)=>[root,...root.children.flatMap(e=>find(e,fn))].filter(fn);
let checks=0;
function check(label,fn){fn();checks++;console.log('✓ '+label);}

check('独立网页组件边界：24项去重、未知位面/无效坐标不授权',()=>{
  const rows=Array.from({length:40},(_,n)=>({id:String(n),plane:'mortal',x:1,y:2,canObserve:true}));
  rows.push({...rows.at(-1)});const normalized=normalizeCombatEvents(rows);assert.equal(normalized.length,24);assert.equal(new Set(normalized.map(e=>e.id)).size,24);
  const model=combatObserverModel({enabled:true,events:[{id:'bad',plane:'foreign',x:1,y:2,canObserve:true},{id:'nan',plane:'mortal',x:NaN,y:2,canObserve:true}],focusedCharacter:{combatStatus:'invented'}});
  assert(model.events.every(e=>!e.canObserve));assert.equal(model.status,'当前状态未知');
});

const f=fixture(991),a=f.entity,before=new Set(f.world.entities);
for(let n=0;n<100;n++)if(f.life.spawn(a.x,a.y,'cultivator',1)>0)break;
const b=f.world.entities.find(e=>!before.has(e));assert(b);b.x=a.x+.5;b.y=a.y;
for(const e of [a,b]){e.hp=e.maxHp=2000;e.restUntil=0;e.level=4;}b.name='<img src=x onerror=alert(1)>';
f.life.attack(a,b,.1);
let active=f.world,focus=[],actions=[],runtime;
const doc=new Document(),root=doc.createElement('div'),stage=new PresentationStage();
const view=createCombatObserverView(root,{onAction:action=>{actions.push(action);runtime.handleAction(action);}});
runtime=createCombatObservationRuntime({getWorld:()=>active,getStage:()=>stage,getCharacter:()=>buildCharacterViewModel(active,'mortal:'+b.id),isVisible:()=>true,onFocus:effect=>focus.push(effect),view});
stage.ingestWorlds(active);runtime.refresh({ingestedWorld:active});
const buttons=()=>find(root,e=>!!e.dataset.combatKey),list=()=>find(root,e=>e.tagName==='OL')[0];
check('正式命中接网页组件：真实人物/气血/未知持续状态，恶意名字只作文本',()=>{
  assert.equal(buttons().length,1);assert(root.textContent.includes(b.name));assert(root.textContent.includes('气血：'));assert(!root.textContent.includes('正在交战'));assert(!find(root,e=>e.tagName==='IMG').length);
});
check('组件点击只发意图，宿主采用当前真坐标且每次仅执行一次',()=>{
  b.x+=1;buttons()[0].click();assert.equal(actions.length,1);assert.equal(focus.length,1);assert.equal(focus[0].x,b.x);assert.equal(actions[0].type,'locate-combat');
});
check('反复真实刷新保留DOM、滚动和焦点，无重复监听',()=>{
  const existing=list(),button=buttons()[0];existing.scrollTop=90;doc.activeElement=button;
  for(let n=0;n<20;n++)runtime.refresh();assert.equal(list(),existing);assert.equal(existing.scrollTop,90);assert.equal(doc.activeElement,button);
  buttons()[0].click();assert.equal(focus.length,2);
});
check('读档前旧按钮不作用于新世界，即使组件尚未刷新',()=>{
  const oldButton=buttons()[0];active=deserializeWorld(serializeWorld(active));oldButton.click();assert.equal(focus.length,2);assert.deepEqual(runtime.current().events,[]);assert.equal(buttons().length,0);
});
check('无法定位行禁止点击；destroy幂等、移除监听和旧DOM',()=>{
  view.render({enabled:true,events:[{id:'x',plane:'mortal',x:null,y:null,canObserve:false}],focusedCharacter:{combatStatus:'unknown'}});
  const button=buttons()[0];assert(button.disabled);const count=actions.length;button.click();assert.equal(actions.length,count);
  runtime.destroy();runtime.destroy();assert.equal(root.children.length,0);button.click();assert.equal(actions.length,count);view.render({enabled:true,events:[]});assert.equal(root.children.length,0);
});
console.log(`G22 web: ${checks} groups passed`);
