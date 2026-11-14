import assert from 'node:assert/strict';
import { createObserveEchoPanel } from '../src/inkbox/ui/observeEchoPanel.js';
import { createJournalPanel } from '../src/inkbox/ui/journalPanel.js';
import { appendObjectStoryReader, navigateStoryRef } from '../src/inkbox/ui/storyNavigation.js';
import { assertLegacyReadAllowed } from '../src/inkbox/presentation/readView/committedStore.js';
import { registerCommittedWorld, unregisterCommittedWorld } from '../src/inkbox/presentation/readView/committedRegistry.js';

class Element {
  constructor(doc, tag) {
    this.ownerDocument=doc; this.tagName=tag; this.children=[]; this.dataset={}; this.listeners={};
    this.style={}; this.classList={add(){},remove(){}}; this.scrollTop=0; this.hidden=false; this.open=false;
    this.parent=null; this.connected=false; this.innerHTML=''; this.textContent='';
  }
  append(...nodes) { for (const node of nodes) { node.remove(); node.parent=this; this.children.push(node); } }
  after(node) { if (this.parent) this.parent.append(node); }
  remove() { if(this.parent){this.parent.children=this.parent.children.filter(n=>n!==this);this.parent=null;} }
  addEventListener(name,fn) { (this.listeners[name] ||= []).push(fn); }
  fire(name,event={}) { for (const fn of this.listeners[name] || []) fn(event); }
  setAttribute() {}
  getAttribute() { return null; }
  getClientRects() { return this.connected || this.parent ? [this] : []; }
  contains(node) { return node===this || this.children.some(child=>child.contains(node)); }
  closest() { return null; }
  querySelector() { return null; }
  querySelectorAll() { return []; }
  get isConnected() { return this.connected || !!this.parent?.isConnected; }
}

function documentFixture(ids, stage = false) {
  const doc={createElement:tag=>new Element(doc,tag), nodes:new Map(),
    getElementById(id){return this.nodes.get(id)||null;},
    querySelector(selector){return selector==='.stage'&&stage?stage:null;}};
  for(const [id,node] of Object.entries(ids)){node.connected=true;doc.nodes.set(id,node);}
  return doc;
}
const actionEvent=(action,id)=>({target:{closest:selector=>selector==='[data-e0-action]'?{dataset:{e0Action:action,id:String(id),mark:''}}:null}});
const journalEvent=(action,id)=>({target:{closest:selector=>selector==='[data-journal-action]'?{dataset:{journalAction:action,id:String(id)}}:null}});
function actionPanel(doc) {
  const panel=new Element(doc,'div'); panel.connected=true; panel.dataset={};
  const head=new Element(doc,'header'); panel.append(head);
  panel.querySelector=selector=>selector==='.inspect-head'?head:null;
  panel.querySelectorAll=()=>panel.children.filter(n=>n.className==='journal-card-actions'||n.className==='e0-card-actions');
  return panel;
}

const village={id:1,name:'旧村',x:0,y:0,hp:100,pop:20,food:20,age:2,houses:[],history:[]};
const world={day:20,w:2,h:2,size:4,plane:'mortal',mapProgress:{stage:3},villages:[village],settlementRuins:[],entities:[],
  height:new Float32Array(4),water:new Float32Array(4),fire:new Float32Array(4),struct:new Uint8Array(4),over:new Uint8Array(4),
  inside:()=>true,idx:(x,y)=>y*2+x,isWalkable:()=>true,isBuildable:()=>true,villageById:id=>id===1?village:null,factionById:()=>null};
const session={inProgress:false,fault:false,disposed:false};
registerCommittedWorld(world,session,'mortal');
let publications=0;
const sandbox={world,camera:{zoom:1,focusOn(){}},notify(){},inspectPlaneSubject(){},publishCommittedEdit(){publications++;},qol:{markDirty(){}},
  assertLegacyReadAllowed:assertLegacyReadAllowed};
try {
  const shelf=new Element(null,'aside'),stage=new Element(null,'main'); stage.connected=true;
  const observeDoc=documentFixture({inkObserveEcho:shelf},stage);
  const observe=createObserveEchoPanel(sandbox,observeDoc); observe.refresh();
  const observeCard=actionPanel(observeDoc); observe.appendCardActions(observeCard,1);

  const journalRoot=new Element(null,'details'),journalContent=new Element(null,'div'); journalRoot.open=true;
  const journalDoc=documentFixture({inkJournal:journalRoot,inkJournalContent:journalContent});
  const journal=createJournalPanel(sandbox,journalDoc); journal.refresh();
  const vowCard=actionPanel(journalDoc); journal.appendSettlementActions(vowCard,1);

  const storyPanel=actionPanel(observeDoc), storyRef={kind:'site',plane:'mortal',id:77};
  appendObjectStoryReader(sandbox,storyPanel,storyRef);
  const storySection=storyPanel.children.at(-1), storyButton=storySection.children[0], storyContent=storySection.children[1];

  session.inProgress=true;
  assert.doesNotThrow(()=>observe.refresh()); assert.doesNotThrow(()=>observe.project());
  assert.equal(observe.focusId(),null,'busy ObserveEcho read returns safely');
  shelf.fire('click',actionEvent('watch',1)); shelf.fire('click',actionEvent('clear',1));
  observeCard.children[1].fire('click',actionEvent('watch',1));
  assert.equal(world.observeEcho,undefined,'busy ObserveEcho card/toolbar do not initialize or write metadata');

  assert.doesNotThrow(()=>journal.refresh()); assert.doesNotThrow(()=>journal.open());
  journalContent.fire('click',journalEvent('abandon',1)); vowCard.children[1].children[0].fire('click');
  assert.equal(world.journal,undefined,'busy Journal actions do not initialize or write journal');
  assert.equal(publications,0,'busy observation actions do not publish');

  assert.doesNotThrow(()=>storyButton.fire('click'));
  assert.equal(storyContent.innerHTML,'','busy story reader does not extract/render legacy World facts');
  assert.equal(navigateStoryRef(sandbox,storyRef).ok,false,'busy story navigation is rejected');
  session.inProgress=false;

  // The existing action remains available after completion and each committed
  // observation write publishes exactly once after its model operation.
  shelf.fire('click',actionEvent('watch',1));
  assert.equal(world.observeEcho.focus.settlementId,1); assert.equal(publications,1);
  session.inProgress=true;
  const focused=JSON.stringify(world.observeEcho.focus);
  shelf.fire('click',actionEvent('clear',1)); observeCard.children[1].fire('click',actionEvent('watch',1));
  assert.equal(JSON.stringify(world.observeEcho.focus),focused,'busy clear/watch keep committed focus intact');
  assert.equal(publications,1);
  session.inProgress=false;
  shelf.fire('click',actionEvent('clear',1));
  assert.equal(world.observeEcho.focus,null); assert.equal(publications,2);

  // Create and abandon retain their original order/behavior, publish only after
  // each successful journal mutation, and reject captured cards during a step.
  session.inProgress=true;
  const beforeJournal=JSON.stringify(world.journal);
  vowCard.children[1].children[0].fire('click');
  assert.equal(JSON.stringify(world.journal),beforeJournal); assert.equal(publications,2);
  session.inProgress=false;
  vowCard.children[1].children[0].fire('click');
  assert.equal(world.journal.vows.active.length,1); assert.equal(publications,3);
  const vowId=world.journal.vows.active[0].id;
  session.inProgress=true;
  journalContent.fire('click',journalEvent('abandon',vowId));
  assert.equal(world.journal.vows.active.length,1); assert.equal(publications,3);
  session.inProgress=false;
  journalContent.fire('click',journalEvent('abandon',vowId));
  assert.equal(world.journal.vows.active.length,0); assert.equal(world.journal.vows.archive.at(-1).status,'abandoned');
  assert.equal(publications,4);

  session.fault=true;
  const faultJournal=JSON.stringify(world.journal);
  assert.doesNotThrow(()=>observe.refresh()); assert.doesNotThrow(()=>observe.project());
  assert.doesNotThrow(()=>journal.refresh()); assert.doesNotThrow(()=>storyButton.fire('click'));
  shelf.fire('click',actionEvent('watch',1)); vowCard.children[1].children[0].fire('click');
  assert.equal(JSON.stringify(world.journal),faultJournal,'faulted legacy panels do not mutate World');
  assert.equal(world.observeEcho.focus,null); assert.equal(publications,4);
  session.fault=false;

  // Captured readers cannot inspect an old or tombstoned World after its owner changes.
  const replacement={...world}; sandbox.world=replacement;
  storyButton.fire('click');
  assert.equal(storyContent.innerHTML,'','old-world story button stays stale');
  session.disposed=true;
  assert.doesNotThrow(()=>storyButton.fire('click'));
  assert.equal(storyContent.innerHTML,'','disposed tombstone is denied');
  assert.equal(publications,4);
} finally {
  unregisterCommittedWorld(world);
}
console.log('WX-E2R-a.2 panels: step/dispose fail-closed, captured readers guarded, successful ObserveEcho/Journal edits publish once');
