import assert from 'node:assert/strict';
import {personStoryCandidates as read} from '../src/inkbox/wanxiang/storyPeople.js';
import {emptyProfile} from '../src/inkbox/wanxiang/profile.js';
import {stepDaoActivities,stepDaoTravel} from '../src/inkbox/sim/daoActivities.js';
import {wanlingState} from '../src/inkbox/world/wanlingState.js';
import {rememberDead} from '../src/inkbox/sim/necrology.js';
const ref={kind:'person',plane:'mortal',id:2,incarnation:1};
function fixture(){const people=[1,2].map(id=>({id,name:'同名修士',hp:100,maxHp:100,incarnation:1,sp:'cultivator',level:5,exp:0,x:id+2,y:3,relations:new Map(),wanxiang:emptyProfile(),dao:{path:{key:id===1?'alchemy':'body'}}}));
return {day:100,plane:'mortal',w:10,h:10,size:100,entities:people,sites:[{id:8,name:'旧府'}],villages:[],ruins:[],artifacts:[],factions:[],wraiths:[],struct:new Uint8Array(100),water:new Float32Array(100),wanxiang:{enabled:true,wxCEnabled:true},isWalkable:i=>i>=0&&i<100,record(){}};}
const facts=w=>w.entities[1].wanxiang.experienceLedger={records:[{id:'loss-1',day:10,type:'site-failure',siteId:8}],seen:[],cooldowns:{},siteFailures:{},permanentGrants:0};
let w=fixture();facts(w);
assert.equal(read(w,ref).cards[0].status,'watching');
w.entities[1].wanxiang.history.push({kind:'natural-choice',status:'committed',actorKey:'mortal:2',type:'谨慎退避',day:20,siteId:8,result:'暂缓赴事'});
assert.equal(read(w,ref).cards[0].status,'watching');
w.entities[1].wanxiang.experienceLedger.records.push({id:'win-1',day:30,type:'site-success',siteId:8});
assert.equal(read(w,ref).cards[0].outcome,'success');
const forward=read(w,ref);w.entities[1].wanxiang.experienceLedger.records.reverse();assert.deepEqual(read(w,ref),forward);
w.entities[1].wanxiang.experienceLedger.records.push({...w.entities[1].wanxiang.experienceLedger.records[0]});assert.equal(read(w,ref).stats.deduplicated,1);
w=fixture();facts(w);w.sites=[];assert.equal(read(w,ref).cards[0].outcome,'site-gone');
assert.equal(read(w,{...ref,incarnation:2}).cards.length,0);
w=fixture();facts(w);const dead=w.entities.pop();dead.hp=0;dead.died=90;w.dead=[dead];assert.equal(read(w,ref).cards[0].status,'interrupted');
w=fixture();const patient=w.entities[1];
patient.wanxiang.bonds=[{id:'gratitude:mortal:1',targetKey:'mortal:1',expiresDay:1000}];
assert.equal(read(w,ref).cards.length,0,'relations cannot invent a source event');
patient.wanxiang.history=[{kind:'natural',type:'aid-bond',actorKey:'mortal:2',targetKey:'mortal:1',source:'heal-1',day:10,result:{healed:12}}];
assert.equal(read(w,ref).cards[0].status,'watching');
patient.wanxiang.history.push({kind:'natural-choice',type:'报偿恩义',actorKey:'mortal:2',targetKey:'mortal:1',day:30,status:'committed',cost:{kind:'actor-hp',amount:1},result:'付费护关，下一次正式突破可获助益'});
assert.equal(read(w,ref).cards[0].status,'resolved');assert.match(read(w,ref).cards[0].reason,/不等于目标突破成功/);
patient.wanxiang.history.at(-1).cost.amount=0;assert.equal(read(w,ref).cards[0].status,'watching');
patient.wanxiang.history.at(-1).cost.amount=1;patient.wanxiang.history.at(-1).targetKey='mortal:3';assert.equal(read(w,ref).cards[0].status,'watching');
patient.wanxiang.history[0].pastLife=true;assert.equal(read(w,ref).cards.length,0);
// Actual native payment + aid + post-commit history, not only constructed history.
w=fixture();w.day=30;w.entities[1].hp=60;const life={moveTowards(){}};wanlingState(w).lastPathDay=0;
assert.equal(stepDaoActivities(w,life),1);assert.equal(stepDaoTravel(w,life,w.entities[0],1),true);
w.day=60;w.entities[0].hp=70;assert.equal(stepDaoActivities(w,life),1);assert.equal(stepDaoTravel(w,life,w.entities[1],1),true);
assert.equal(read(w,ref).cards.find(c=>c.templateId==='grateful-return').status,'resolved');
const snapshot=JSON.stringify(w);for(let i=0;i<100;i++)read(w,ref);assert.equal(JSON.stringify(w),snapshot);
const restored=JSON.parse(snapshot);assert.deepEqual(read(restored,ref),read(w,ref));
w.wanxiang.enabled=false;assert.ok(read(w,ref).cards.length,'disabled feature preserves readable existing facts');
delete w.entities[1].wanxiang;assert.equal(read(w,ref).cards.length,0);
// A second failure is a later node, never another overlapping equivalent story.
w=fixture();facts(w);w.entities[1].wanxiang.experienceLedger.records.push({id:'loss-2',day:20,type:'site-failure',siteId:8},{id:'win-2',day:30,type:'site-success',siteId:8});
assert.equal(read(w,ref).cards.length,1);assert.equal(read(w,ref).cards[0].status,'resolved');
let before=read(w,ref);w.entities[1].wanxiang.experienceLedger.records.reverse();assert.deepEqual(read(w,ref),before);
// Death after a recorded result cannot undo that result.
let old=w.entities.pop();old.hp=0;old.died=90;w.dead=[old];assert.equal(read(w,ref).cards[0].status,'resolved');
w=fixture();facts(w);w.entities[1].wanxiang.experienceLedger.records.push({id:'heal-1',day:12,type:'healed',helperKey:'mortal:1'},{id:'heal-2',day:14,type:'healed',helperKey:'mortal:1'});
let received=w.entities[1];received.wanxiang.history.push({kind:'natural-choice',type:'报偿恩义',actorKey:'mortal:2',targetKey:'mortal:1',day:30,status:'committed',cost:{kind:'actor-hp',amount:1},result:'真实回助'});
let gratitude=read(w,ref).cards.filter(c=>c.templateId==='grateful-return');assert.equal(gratitude.length,1);assert.match(gratitude[0].evidence[0].text,/不据治疗本身推定结恩/);assert.equal(gratitude[0].evidence.filter(p=>p.type==='paid-reciprocity').length,1);
before=read(w,ref);received.wanxiang.experienceLedger.records.reverse();received.wanxiang.history.reverse();assert.deepEqual(read(w,ref),before);
// Official cross-plane resolution retains the original actor ID and completed
// pre-arrival history, while upper-plane ledger events cannot extend it.
old=w.entities.pop();old.id=99;old.hp=100;w.upper={plane:'upper',entities:[old],dead:[],arrivedLog:[{id:99,fromKey:'mortal:2',day:50}]};
old.wanxiang.experienceLedger.records.push({id:'upper-failure',type:'site-failure',siteId:9,day:70});
gratitude=read(w,ref).cards.filter(c=>c.templateId==='grateful-return');
assert.equal(gratitude[0].status,'resolved');assert.equal(gratitude[0].actorRef.id,2);
assert.ok(!read(w,ref).cards.some(c=>c.evidence.some(p=>p.key==='upper-failure')));
const upperRef={kind:'person',plane:'upper',id:99,incarnation:1};w.upper.sites=[{id:8,name:'同号异界洞府'}];
old.wanxiang.experienceLedger.records.push({id:'arrival-day-unproven',type:'site-failure',siteId:8,day:50});
assert.ok(read(w,upperRef).cards.every(c=>c.originDay>50));
assert.ok(!read(w,upperRef).cards.some(c=>c.evidence.some(p=>['loss-1','heal-1','heal-2','arrival-day-unproven'].includes(p.key))));
assert.ok(!read(w,ref).cards.some(c=>c.evidence.some(p=>p.key==='arrival-day-unproven')));
// Possession preserves a body ledger in production. It is not the new soul's
// own history; even same-day facts lack an ordering proof and remain unproven.
w=fixture();facts(w);received=w.entities[1];received.possessedBy={day:50,name:'新魂'};
received.wanxiang.experienceLedger.records.push({id:'possession-same-day',type:'site-failure',siteId:8,day:50});
received.wanxiang.history.push({kind:'natural',type:'aid-bond',actorKey:'mortal:2',targetKey:'mortal:1',source:'old-body-aid',day:40},{kind:'natural',type:'aid-bond',actorKey:'mortal:2',targetKey:'mortal:1',source:'same-day-aid',day:50});
assert.equal(read(w,ref).cards.length,0);
assert.equal(read(w,{...ref,identitySince:null}).cards.length,0);
received.wanxiang.experienceLedger.records.push({id:'new-soul-failure',type:'site-failure',siteId:8,day:51});
assert.equal(read(w,ref).cards[0].evidence[0].key,'new-soul-failure');
// More than the presentation limits must remain stable on opposite input order.
received.wanxiang.history.push({kind:'natural',type:'aid-bond',actorKey:'mortal:2',targetKey:'mortal:1',source:'new-aid',day:52});
for(let i=0;i<8;i++)received.wanxiang.history.push({kind:'natural-choice',type:'报偿恩义',actorKey:'mortal:2',targetKey:'mortal:1',day:60+i,status:'committed',cost:{kind:'actor-hp',amount:1},result:'正式回助'});
before=read(w,ref);received.wanxiang.history.reverse();assert.deepEqual(read(w,ref),before);
received.wanxiang.history.push(structuredClone(received.wanxiang.history[0]));assert.equal(read(w,ref).cards.find(c=>c.templateId==='grateful-return').evidence.length,5);
assert.match(read(w,ref).cards.find(c=>c.templateId==='grateful-return').nodes.at(-1).text,/付出气血 1/);
// Actual death snapshots omit wanxiang. The honest fallback is an empty
// projection, not reconstruction of the fake snapshot used above for branches.
w=fixture();facts(w);old=w.entities[1];old.hp=0;old.age=100;w.idx=()=>0;w.inside=()=>true;w.villageById=()=>null;w.factionById=()=>null;w.height=new Float32Array(100);w.veg=new Float32Array(100);w.qi=new Float32Array(100);
w.riverBase=new Float32Array(100);rememberDead(w,old);w.entities.pop();assert.equal(read(w,ref).cards.length,0);
console.log('WX-S1 additional grouping and completed-history branches passed');
console.log('WX-S1 people: strict sources, failure branches, identity, native paid return, order, restore and 100-read purity passed');
