import assert from 'node:assert/strict';
import {renderStoryCards} from '../src/inkbox/ui/storyCardsView.js';
import {createMingpuView} from '../src/inkbox/ui/g1/presentation/mingpuView.js';
import {appendObjectStoryReader} from '../src/inkbox/ui/storyNavigation.js';

// Minimal DOM for exercising async ownership and text-only presentation without
// adding a dependency. Screenshots/layout remain a separate browser check.
class Element {
 constructor(doc,tag){this.ownerDocument=doc;this.tagName=tag;this.children=[];this.dataset={};this.listeners={};this.attributes={};this.classList={add(){},remove(){}};this.textContent='';}
 append(...nodes){for(const node of nodes){node.remove();node.parent=this;this.children.push(node);}}
 replaceChildren(...nodes){for(const child of this.children)child.parent=null;this.children=[];this.append(...nodes);}
 remove(){if(this.parent){this.parent.children=this.parent.children.filter(n=>n!==this);this.parent=null;}}
 setAttribute(k,v){this.attributes[k]=v;}
 addEventListener(k,fn){this.listeners[k]=fn;}
 async click(){if(!this.disabled)await this.listeners.click?.();}
 get isConnected(){return !!this.connected || !!this.parent?.isConnected;}
}
const doc={createElement:tag=>new Element(doc,tag)};
const all=root=>[root,...root.children.flatMap(all)];
const text=root=>all(root).map(n=>n.textContent).join(' ');
const button=(root,label)=>all(root).find(n=>n.tagName==='button'&&n.textContent===label);
const fixture=()=>({day:25,coverage:'仅保留事实',cards:[{key:'one',title:'<img onerror=boom>',status:'watching',mode:'watch_hook',summary:'未有回助回执',originDay:1,lastEvidenceDay:25,related:[{kind:'person',id:2,plane:'mortal',label:'恩人',available:false,reason:'已离世'}],nodes:[{day:1,text:'真实受助'}],evidence:[{key:'origin',grade:'A',source:'committed-fact',day:1,type:'healed',text:'<script>boom</script>'}]}]});
const reader=doc.createElement('div');let navigated=0;
renderStoryCards(reader,fixture(),{onNavigate:()=>navigated++});
assert.match(text(reader),/<img onerror=boom>/);
assert.equal(all(reader).some(n=>n.tagName==='img'||n.tagName==='script'),false,'untrusted fact text stays text');
await button(reader,'恩人').click();assert.equal(navigated,0,'unavailable identity cannot navigate');
const many=fixture();many.cards=Array.from({length:100},(_,i)=>({...many.cards[0],key:String(i)}));
renderStoryCards(reader,many);assert.equal(all(reader).filter(n=>n.tagName==='article').length,3,'bounded reader');
renderStoryCards(reader,{});assert.match(text(reader),/尚无足够来源/);

const root=doc.createElement('div'),calls=[];let resolve;
const view=createMingpuView(root,{request:action=>{calls.push(action);return new Promise(done=>{resolve=done;});}});
const model=key=>({identity:{key,name:key},mingpu:{enabled:false,day:25,profile:{}}});
view.render(model('mortal:1'));view.open();
assert.equal(calls.length,0,'opening and painting do not automatically extract');
const pending=button(root,'因果拾章 · 读取 / 刷新').click();
assert.equal(calls.length,1);assert.equal(calls[0].type,'stories');
view.render(model('mortal:2'));view.open();resolve({ok:true,stories:fixture()});await pending;
assert.doesNotMatch(text(root),/未有回助回执/,'late response cannot paint another identity');
const second=button(root,'因果拾章 · 读取 / 刷新').click();resolve({ok:true,stories:fixture()});await second;
assert.match(text(root),/未有回助回执/);
for(let i=0;i<100;i++)view.render(model('mortal:2'));
assert.equal(calls.length,2,'HUD render cannot re-extract or issue commands');
view.render({...model('mortal:2'),identity:{key:'mortal:2',name:'同名新世',incarnation:2}});view.open();
assert.doesNotMatch(text(root),/未有回助回执/,'same numeric ID in a new incarnation clears the snapshot');
view.destroy();

// A running settlement inspector rebuilds its DOM for food/population updates.
// The same explicitly read snapshot must survive without a fresh story query.
const panel=doc.createElement('div');panel.connected=true;
const village={id:7,name:'故村',hp:50,x:4,y:4,history:[{day:10,type:'disaster',text:'正式灾害',settlementId:7,factionId:0}]};
const world={day:100,w:10,h:10,villages:[village],entities:[],factions:[],settlementRuins:[]};
let navigationCount=0;const sb={world,inspectPlaneSubject(){navigationCount++;return {};}};
const place={kind:'settlement',plane:'mortal',id:7};
appendObjectStoryReader(sb,panel,place);await button(panel,'因果拾章 · 旧闻').click();
const displayed=text(panel),section=panel.children[0],target=button(panel,'故村');assert(target&&!target.disabled);
world.day=200;panel.replaceChildren();appendObjectStoryReader(sb,panel,place);
assert.equal(panel.children[0],section,'HUD reattaches one existing snapshot');
assert.equal(text(panel),displayed,'HUD does not recompile a snapshot at the new day');
sb.world={...world,villages:[{...village,name:'新世界同号村'}]};
await target.click();assert.equal(navigationCount,0,'old DOM cannot navigate the same ID in a replacement world');
appendObjectStoryReader(sb,panel,place);assert.notEqual(panel.children.at(-1),section,'world change creates a fresh reader');
console.log('WX-S1 UI: bounded text-only cards, unavailable navigation, async identity isolation and 100 refreshes passed');
