import assert from 'node:assert/strict';
import {selectVisibleStoryNodes,createStory} from '../src/inkbox/wanxiang/storyFacts.js';
import {renderStoryCards} from '../src/inkbox/ui/storyCardsView.js';
import {personStoryCandidates} from '../src/inkbox/wanxiang/storyPeople.js';
import {worldObjectStoryCandidates} from '../src/inkbox/wanxiang/storyWorld.js';
import {emptyProfile} from '../src/inkbox/wanxiang/profile.js';
import {forgeArtifact,toGround,claimGroundArtifact} from '../src/inkbox/sim/artifacts.js';
import {World} from '../src/inkbox/world/World.js';

const makeCard=(count,{decisiveAt=-1,lastType='note',sameDay=false}={})=>{
  const evidence=Array.from({length:count},(_,i)=>({key:`e${i+1}`,source:'settlement-history',sourceOrder:sameDay?i:undefined,grade:(i===decisiveAt||i===count-1)?'B':'C',day:sameDay?1:i+1,type:i===decisiveAt?'recovered':i===count-1?lastType:'disaster',text:`节点${i+1}`}));
  return {key:'controlled-card',lastEvidenceDay:count, status:'resolved',evidence,nodes:evidence.map(e=>({day:e.day,text:e.text,evidenceKey:e.key}))};
};
for(const n of [1,2,12,13,16,24]){
  const c=makeCard(n,{decisiveAt:n-1,lastType:'recovered'}),r=selectVisibleStoryNodes(c);
  assert.equal(r.nodes.length,Math.min(n,12));assert.equal(r.nodes[0].evidenceKey,'e1');assert.equal(r.nodes.at(-1).evidenceKey,`e${n}`);assert.equal(r.foldedCount,Math.max(0,n-12));
}
for(const limit of [1,2,3,12]){const r=selectVisibleStoryNodes(makeCard(24,{decisiveAt:23,lastType:'recovered'}),limit);assert.equal(r.nodes.length,limit);assert.equal(r.nodes.at(-1).evidenceKey,'e24');}
let c=makeCard(16,{decisiveAt:15,lastType:'recovered'});assert(selectVisibleStoryNodes(c).nodes.some(n=>n.evidenceKey==='e16'));
c=makeCard(16,{decisiveAt:14,lastType:'disaster'});let r=selectVisibleStoryNodes(c);assert(r.nodes.some(n=>n.evidenceKey==='e15'));assert(r.nodes.some(n=>n.evidenceKey==='e16'));
c=makeCard(24,{decisiveAt:3,lastType:'site-success'});c.evidence[3].type='site-failure';c.nodes[3].text='首次正式失败';r=selectVisibleStoryNodes(c);assert(r.nodes.some(n=>n.evidenceKey==='e4'));assert(r.nodes.some(n=>n.evidenceKey==='e24'));
c=makeCard(24,{decisiveAt:0,lastType:'site-success'});r=selectVisibleStoryNodes(c);assert(r.nodes.some(n=>n.evidenceKey==='e1'));assert(r.nodes.some(n=>n.evidenceKey==='e24'));
c=makeCard(24,{sameDay:true,decisiveAt:2});assert.equal(selectVisibleStoryNodes(c).sameDayOrderUnproven,false,'formal sourceOrder establishes order');
c=makeCard(24,{sameDay:true,decisiveAt:2});c.evidence.forEach(e=>delete e.sourceOrder);assert.equal(selectVisibleStoryNodes(c).sameDayOrderUnproven,true);
c=makeCard(4);c.nodes.reverse();c.nodes.push({...c.nodes[0]});c.nodes.push({day:999,text:'unproven',evidenceKey:'missing'});r=selectVisibleStoryNodes(c);assert.deepEqual(r.nodes.map(n=>n.evidenceKey),['e1','e2','e3','e4']);
c=makeCard(25,{decisiveAt:24,lastType:'recovered'});r=selectVisibleStoryNodes(c);assert(r.nodes.every(n=>Number(n.evidenceKey.slice(1))<=24),'never bypass the 24 evidence ceiling');
c=makeCard(24,{decisiveAt:3,lastType:'site-success'});const snapshot=JSON.stringify(c),stable=selectVisibleStoryNodes(c);for(let i=0;i<100;i++)assert.deepEqual(selectVisibleStoryNodes(c),stable);assert.equal(JSON.stringify(c),snapshot);
const overflow=makeCard(30,{decisiveAt:29,lastType:'site-success'});overflow.evidence[0].grade='B';
const bounded=createStory('defeat-return',{kind:'person',plane:'mortal',id:1,incarnation:1},overflow.evidence[0],{evidence:overflow.evidence,nodes:overflow.nodes,status:'resolved',outcome:'success'});
assert.equal(bounded.evidence.length,24);assert.equal(bounded.nodes.length,24);
assert.equal(bounded.evidence[0].key,'e1');assert.equal(bounded.evidence.at(-1).key,'e30');
assert(selectVisibleStoryNodes(bounded).nodes.some(n=>n.evidenceKey==='e30'),'bounded construction retains the decisive A/B ending before rendering');

class Element {
  constructor(doc,tag){this.ownerDocument=doc;this.tagName=tag;this.children=[];this.dataset={};this.attrs={};this.textContent='';}
  append(...nodes){for(const n of nodes){n.parent=this;this.children.push(n);}}
  replaceChildren(...nodes){this.children=[];this.append(...nodes);}
  setAttribute(k,v){this.attrs[k]=v;}
  addEventListener(){}
  set className(v){this._className=v;}
}
const doc={createElement:tag=>new Element(doc,tag)};
const flatten=root=>[root,...root.children.flatMap(flatten)];
const root=doc.createElement('div');c=makeCard(24,{decisiveAt:3,lastType:'site-success'});c.summary='受控中文摘要';c.key='story:mortal:201-private-key';c.evidence[0].identityKey='mortal:201';c.related=[{kind:'person',id:201,label:'旧日施助者，身份未可考',available:false,reason:'身份尚未核验'}];
renderStoryCards(root,{day:24,cards:[c]});const els=flatten(root),allText=els.map(e=>e.textContent).join(' ');
assert.match(allText,/中间另有 12 条/);assert.match(allText,/节点24/);assert.match(allText,/旧日施助者，身份未可考/);assert.doesNotMatch(els.find(e=>e.tagName==='article').children.filter(e=>e.tagName!=='details').flatMap(flatten).map(e=>e.textContent).join(' '),/mortal:201/,'debug identity stays in evidence details');
assert(els.some(e=>e.tagName==='code'&&e.textContent==='mortal:201'),'evidence details expose stable identity key');

// Controlled retained-history fixtures for paid reciprocity.
const personWorld=()=>({day:500,entities:[{id:1,name:'同名修士',hp:100,incarnation:1,wanxiang:emptyProfile()},{id:2,name:'受助者',hp:100,incarnation:1,wanxiang:emptyProfile()}],dead:[],sites:[],arrivedLog:[],wanxiang:{enabled:true}});
const actorRef={kind:'person',plane:'mortal',id:2,incarnation:1};
{
  const w=personWorld();w.entities[0].hp=0;w.entities[0].name='当前同号亡者姓名';
  w.entities[1].wanxiang.experienceLedger={records:[{id:'historical-help',day:10,type:'healed',helperKey:'mortal:1'}]};
  const card=personStoryCandidates(w,actorRef).cards[0];
  assert.doesNotMatch(card.reason,/恩人已离世|恩人已飞升|当前同号亡者姓名/,'an unproven incarnation cannot inherit the current same-ID record status or name');
  assert.match(card.related[0].reason,/不能.*断定旧人去向/);
  assert.equal(card.related[0].available,false);
}
{
  const w=personWorld(),actor=w.entities[1];
  actor.wanxiang.experienceLedger={records:[{id:'retained-help',day:10,type:'healed',helperKey:'mortal:1'}]};
  actor.wanxiang.history=Array.from({length:140},(_,i)=>({kind:'natural-choice',type:'报偿恩义',actorKey:'mortal:2',targetKey:'mortal:1',day:20+i,status:'committed',cost:{kind:'actor-hp',amount:1},result:'正式回助'}));
  const card=personStoryCandidates(w,actorRef).cards[0];
  assert.deepEqual(card.evidence.filter(e=>e.type==='paid-reciprocity').map(e=>e.day),[32,157,158,159]);
  assert.match(card.reason,/当前保留来源中至少有 128 次/);assert.doesNotMatch(card.reason,/此生累计|一生总数/);
  w.entities=w.entities.filter(e=>e.id!==1);
  const historical=personStoryCandidates(w,actorRef).cards[0];
  assert.equal(historical.status,'resolved','missing helper does not revoke retained paid history');
  assert.equal(historical.related[0].available,false);
}
for(const n of [5,7,12]){
  const w=personWorld(),actor=w.entities[1];actor.wanxiang.experienceLedger={records:[{id:'help',day:10,type:'healed',helperKey:'mortal:1'}]};
  actor.wanxiang.history=[{kind:'natural',type:'aid-bond',actorKey:'mortal:2',targetKey:'mortal:1',source:'bond',day:10}];
  const payments=Array.from({length:n},(_,i)=>({kind:'natural-choice',type:'报偿恩义',actorKey:'mortal:2',targetKey:'mortal:1',day:20+i,status:'committed',cost:{kind:'actor-hp',amount:i+1},result:`正式回助${i+1}`}));actor.wanxiang.history.push(...payments);
  const original=JSON.stringify(actor.wanxiang);let card=personStoryCandidates(w,actorRef).cards.find(x=>x.templateId==='grateful-return');assert.equal(JSON.stringify(actor.wanxiang),original,'projection does not mutate controlled history');
  let returns=card.nodes.filter(node=>node.evidenceKey.startsWith('repayment:'));assert.equal(returns.length,4);assert.match(returns[0].text,/首次有证回助/);
  assert.deepEqual(returns.slice(-3).map(node=>node.text.match(/正式回助\d+/)?.[0]),payments.slice(-3).map(p=>p.result));assert.equal(card.lastEvidenceDay,19+n);assert.match(card.reason,/不等于目标突破成功/);
  actor.wanxiang.history.reverse();assert.deepEqual(personStoryCandidates(w,actorRef).cards.find(x=>x.templateId==='grateful-return'),card);
  actor.wanxiang.history.push(structuredClone(payments.at(-1)));assert.deepEqual(personStoryCandidates(w,actorRef).cards.find(x=>x.templateId==='grateful-return'),card,'identical same-key receipts dedupe');
}
{
  const w=personWorld(),actor=w.entities[1];actor.wanxiang.experienceLedger={records:[{id:'help',day:10,type:'healed',helperKey:'mortal:1'}]};
  actor.wanxiang.history=[{kind:'natural',type:'aid-bond',actorKey:'mortal:2',targetKey:'mortal:1',source:'bond',day:10},
    {kind:'natural-choice',type:'报偿恩义',actorKey:'mortal:2',targetKey:'mortal:1',day:20,status:'committed',cost:{kind:'actor-hp',amount:1},result:'同日甲'},
    {kind:'natural-choice',type:'报偿恩义',actorKey:'mortal:2',targetKey:'mortal:1',day:20,status:'committed',cost:{kind:'sect-spirit-stone',amount:2},result:'同日乙'},
    {kind:'natural-choice',type:'报偿恩义',actorKey:'mortal:2',targetKey:'mortal:1',day:21,status:'committed',cost:{kind:'actor-hp',amount:0},result:'零支付'},
    {kind:'natural-choice',type:'报偿恩义',actorKey:'mortal:2',targetKey:'mortal:1',day:22,status:'committed',cost:{kind:'actor-hp',amount:2},result:''}];
  let card=personStoryCandidates(w,actorRef).cards.find(x=>x.templateId==='grateful-return');assert.equal(card.nodes.filter(n=>n.evidenceKey.startsWith('repayment:')).length,2);assert.equal(card.lastEvidenceDay,20);
  w.entities[0].hp=0;const dead=personStoryCandidates(w,actorRef).cards.find(x=>x.templateId==='grateful-return');assert.equal(dead.status,'resolved');assert.match(dead.related[0].label,/本世身份未可考/);
  w.entities[0].hp=100;w.entities[0].possessedBy={day:15};card=personStoryCandidates(w,actorRef).cards.find(x=>x.templateId==='grateful-return');assert.equal(card.status,'interrupted');assert.equal(card.lastEvidenceDay,10);assert.equal(card.outcome,'target-identity-unproven');
  w.entities[0].possessedBy={day:30};card=personStoryCandidates(w,actorRef).cards.find(x=>x.templateId==='grateful-return');assert.equal(card.status,'resolved');assert.equal(personStoryCandidates(w,{...actorRef,id:99}).cards.length,0);
}

// Controlled artifact histories distinguish provenance from recovery.
const artifactWorld=history=>({day:200,entities:[{id:1,name:'持有者',hp:100,incarnation:1,artifacts:[{id:9,name:'旧器',ownerId:1,x:2,y:3,history}]}],artifacts:[]});
const artifactRef={kind:'artifact',plane:'mortal',id:9};
let artifact=worldObjectStoryCandidates(artifactWorld([[1,'forged','匠人'],[2,'spirit','器灵初醒']]),artifactRef).cards[0];assert.equal(artifact.outcome,'provenance-known');
artifact=worldObjectStoryCandidates(artifactWorld([[1,'forged','匠人'],[2,'lost','遗落'],[3,'found','拾得']]),artifactRef).cards[0];assert.equal(artifact.outcome,'loss-and-recovery-attested');
artifact=worldObjectStoryCandidates(artifactWorld([[1,'forged','匠人'],[2,'found','地上拾得']]),artifactRef).cards[0];assert.equal(artifact.outcome,'transfers-attested');
artifact=worldObjectStoryCandidates(artifactWorld([[1,'lost','旧失落'],...Array.from({length:10},(_,i)=>[2+i,'spirit',`履历${i}`]),[20,'found','截断后拾得']]),artifactRef).cards[0];assert.equal(artifact.outcome,'transfers-attested','lost outside retained ten entries cannot attest recovery');
artifact=worldObjectStoryCandidates(artifactWorld([[1,'forged','匠人'],[2,'found','取得'],[201,'lost','未来遗落']]),artifactRef).cards[0];assert.equal(artifact.outcome,'transfers-attested','future loss is ignored');
{
  const w=new World(32,32,73101);w.day=30;const owner={id:1,name:'原主',sp:'cultivator',level:8,hp:100,x:4,y:4,artifacts:[],relations:new Map()},taker={...owner,id:2,name:'拾得者',artifacts:[]};w.entities.push(owner,taker);
  const a=forgeArtifact(w,owner,()=>.6,{slot:'武器'});assert(a);toGround(w,a,4,4);w.day=60;assert(claimGroundArtifact(w,taker,a.id,()=>.6));
  const card=worldObjectStoryCandidates(w,{kind:'artifact',plane:'mortal',id:a.id}).cards[0];assert.equal(card.outcome,'transfers-attested','actual ground then claim without lost never claims loss and recovery');
}
console.log('WX-S1.1 controlled proofreading: bounded causal selection, terminal facts, same-day proof, purity and text-only evidence UI passed');
