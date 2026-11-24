import assert from 'node:assert/strict';
import {emptyProfile,readProfile,validateProfile} from '../src/inkbox/wanxiang/profile.js';
import {createChangeDraft,previewChangeSet,commitChangeSet as rawCommitChangeSet} from '../src/inkbox/wanxiang/changes.js';
import {createCharacterController} from '../src/inkbox/g1/characterRuntime.js';
import {createSelectionToken} from '../src/inkbox/g1/characterIdentity.js';
import {serializeWanxiang,restoreWanxiang} from '../src/inkbox/wanxiang/saveState.js';
const entity={id:1,hp:100,x:1,y:1,wanxiang:emptyProfile()};
const world={day:1,w:16,h:16,width:16,height:16,entities:[entity],sites:[],wanxiang:{enabled:true}};
const token=createSelectionToken(world,'mortal:1');
const commitChangeSet=(w,c,options={})=>rawCommitChangeSet(w,c,{token,...options});
const cmd=(id,operations,mode='player')=>({id,key:'mortal:1',expectedRevision:entity.wanxiang.revision,mode,operations});
const set=(field,value)=>({op:'set',field,value});
entity.wanxiang.physique={id:'yin_block',stage:0,treatments:1,lastTreatmentDay:1};
entity.wanxiang.states=[{id:'sword_blight'}];
for(const op of [set('physique',{id:'yin_block',stage:1}),set('physique',{id:'yin_block',treatments:3}),{op:'remove',field:'states',id:'sword_blight'},set('states',[{id:'alchemy_guard'}]),set('bloodlines',[{id:'true_dragon',grade:9,purity:100,inheritable:true}]),set('bonds',[{id:'gratitude:mortal:2',targetKey:'mortal:2'}]),set('daoSeed',{id:'dao_seed_juan_shu'}),set('permanent',{bone:100,comprehension:100,perception:100})]) {
 const before=JSON.stringify(entity);assert.equal(commitChangeSet(world,cmd('bypass',[op])).ok,false);assert.equal(JSON.stringify(entity),before);
}
// Trusted draft merges unrelated natural facts into the latest profile.
const proof=createChangeDraft(world,'mortal:1',token);
const edit=cmd('concurrent-root',[set('root',{elements:['water'],purity:70})]);
entity.wanxiang.states.push({id:'site_wound',expiresDay:30});entity.wanxiang.permanent.bone=2;entity.wanxiang.seedLedger={borrowUntil:0,spent:['dao_seed_bian_ji']};entity.wanxiang.revision++;
assert.equal(commitChangeSet(world,edit,{token,draftProof:proof}).ok,true);
assert.equal(entity.wanxiang.states.length,2);assert.equal(entity.wanxiang.permanent.bone,2);assert.deepEqual(entity.wanxiang.seedLedger.spent,['dao_seed_bian_ji']);
const decreeProof=createChangeDraft(world,'mortal:1',token);
const decree=cmd('open',[{op:'decree',action:'open_meridians'}],'decree');
entity.wanxiang.physique.stage=1;entity.wanxiang.physique.treatments=3;entity.wanxiang.revision++;
assert.equal(commitChangeSet(world,decree,{token,draftProof:decreeProof}).reason,'field-conflict:physique');
assert.equal(commitChangeSet(world,cmd('erase',[{op:'decree',action:'remove_state',id:'sword_blight'}],'decree')).ok,true);
assert.equal(entity.wanxiang.history.at(-1).mode,'decree');assert.equal(entity.wanxiang.physique.treatments,3);
assert.equal(commitChangeSet(world,cmd('replace',[set('physique',{id:'yang_block'})])).ok,true);assert.equal(entity.wanxiang.physique.stage,0);assert.equal(entity.wanxiang.physique.treatments,undefined);
const deadProof=createChangeDraft(world,'mortal:1',token),deadCommand=cmd('death',[set('hexagram',{id:'hex_01'})]);entity.hp=0;
assert.equal(commitChangeSet(world,deadCommand,{token,draftProof:deadProof}).ok,false);entity.hp=100;
assert.equal(commitChangeSet({...world},deadCommand,{token,draftProof:deadProof}).ok,false);
const replacement={...entity,wanxiang:readProfile(entity)};world.entities=[replacement];assert.equal(commitChangeSet(world,deadCommand,{token,draftProof:deadProof}).ok,false);world.entities=[entity];
const first=cmd('window-0',[set('hexagram',{id:'hex_01'})]);assert.equal(commitChangeSet(world,first).ok,true);assert.equal(commitChangeSet(world,first).duplicate,true);
for(let i=1;i<145;i++)assert.equal(commitChangeSet(world,cmd('window-'+i,[set('hexagram',{id:i%2?'hex_01':'hex_02'})])).ok,true);
assert.equal(commitChangeSet(world,first).reason,'revision-conflict');
const saved=serializeWanxiang(world),restored={entities:[{id:1,hp:100,x:1,y:1}]};restoreWanxiang(restored,saved);validateProfile(restored.entities[0].wanxiang);assert.equal(commitChangeSet(restored,first).ok,false);
assert.equal(previewChangeSet(world,cmd('natural',[set('physique',{id:'yin_block',stage:1})],'natural')).ok,false);
console.log('WX-C authority: bypass denial, semantic merge, treatment conflict, decree provenance, body/world/death guards, >128 and restore replay passed');

// Controller path uses its own immutable baseline rather than the client draft payload.
const controller=createCharacterController({getWorld:()=>world});assert.equal(controller.select('mortal:1').ok,true);
const draft=controller.handleMingpu({type:'begin',targetKey:'mortal:1'}).draft;
entity.wanxiang.permanent.perception=3;entity.wanxiang.revision++;
draft.profile.permanent.perception=100;
const result=controller.handleMingpu({type:'commit',targetKey:'mortal:1',draft,operations:[set('attributes',{bone:65,comprehension:50,perception:50})]});
assert.equal(result.ok,true,result.reason);assert.equal(entity.wanxiang.permanent.perception,3);
assert.equal(controller.handleMingpu({type:'commit',targetKey:'mortal:1',draft,operations:[set('hexagram',{id:'hex_02'})]}).ok,false);
controller.destroy();console.log('WX-C controller immutable draft baseline and repeated click passed');
import {World} from '../src/inkbox/world/World.js';
import {Life} from '../src/inkbox/sim/life.js';
import {DAO_BY_KEY} from '../src/inkbox/core/cultivation.js';
import {stepDaoActivities,stepDaoTravel} from '../src/inkbox/sim/daoActivities.js';
import {stepDaoSeeds} from '../src/inkbox/wanxiang/daoSeeds.js';
import {emitCommittedFact} from '../src/inkbox/wanxiang/experiences.js';
import {serializeWorld,deserializeWorld} from '../src/inkbox/io/save.js';
// D is a controlled initial scene. All healing, gratitude and seed costs below use
// native activity/seed entry points; breakthrough is explicitly a committed-fact
// boundary test, not a claim of a naturally rolled successful breakthrough.
{
 const w=new World(40,32,718);w.day=30;w.wanxiang={enabled:true,experiments:{daoSeeds:true}};
 const life=new Life(w,()=>.5);
 const healer=()=>w.addEntity({sp:'cultivator',x:10.5,y:10.5,hp:100,maxHp:100,level:8,exp:0,artifacts:[],dao:{path:DAO_BY_KEY.alchemy,stage:0,progress:0}});
 const h1=healer(),p=w.addEntity({sp:'cultivator',x:10.7,y:10.5,hp:89,maxHp:100,level:8,exp:30,techniques:[],wanxiang:emptyProfile()});
 p.wanxiang.physique={id:'yin_block',stage:0};
 const key='mortal:'+p.id,controller=createCharacterController({getWorld:()=>w});assert(controller.select(key).ok);
 const firstDraft=controller.handleMingpu({type:'begin',targetKey:key}).draft;
 assert.equal(stepDaoActivities(w,life),1);assert(stepDaoTravel(w,life,h1,1));
 assert.equal(p.wanxiang.physique.treatments,1);assert.equal(p.wanxiang.physique.lastTreatmentDay,30);
 assert(p.wanxiang.bonds.some(b=>b.id==='gratitude:mortal:'+h1.id));
 const healingLedger=structuredClone(p.wanxiang.experienceLedger),healingBonds=structuredClone(p.wanxiang.bonds);
 const operations=[set('root',{elements:['wood'],purity:78})];
 assert.equal(controller.handleMingpu({type:'preview',targetKey:key,draft:firstDraft,operations}).ok,true);
 assert.equal(controller.handleMingpu({type:'commit',targetKey:key,draft:firstDraft,operations}).ok,true);
 assert.deepEqual(p.wanxiang.experienceLedger,healingLedger);assert.deepEqual(p.wanxiang.bonds,healingBonds);
 assert.equal(p.wanxiang.physique.treatments,1);assert.equal(p.wanxiang.physique.lastTreatmentDay,30);
 const seedDraft=controller.handleMingpu({type:'begin',targetKey:key}).draft;
 w.day=60;stepDaoSeeds(w);assert.equal(p.wanxiang.physique.stage,1);assert.equal(p.exp,10);assert.equal(p.hp,80);
 assert(p.wanxiang.seedLedger.spent.includes('dao_seed_bian_ji'));
 assert.equal(controller.handleMingpu({type:'commit',targetKey:key,draft:seedDraft,operations:[set('hexagram',{id:'hex_01'})]}).ok,true);
 assert.equal(p.exp,10);assert.equal(p.wanxiang.physique.stage,1);assert(p.wanxiang.seedLedger.spent.includes('dao_seed_bian_ji'));
 // A second patient opens through two native paid treatments while a stage decree
 // remains pending; the old decree must not overwrite that natural result.
 p.hp=100;const patient2=w.addEntity({sp:'cultivator',x:10.8,y:10.5,hp:89,maxHp:100,level:8,exp:0,techniques:[],wanxiang:emptyProfile()});
 patient2.wanxiang.physique={id:'yin_block',stage:0};
 const key2='mortal:'+patient2.id;controller.select(key2);
 w.day=120;const h2=healer();stepDaoActivities(w,life);assert(stepDaoTravel(w,life,h2,1));
 assert.equal(patient2.wanxiang.physique.treatments,1);
 const stageDraft=controller.handleMingpu({type:'begin',targetKey:key2}).draft;
 const stageOps=[{op:'decree',action:'set_physique_stage',stage:0}];
 assert(controller.handleMingpu({type:'preview',targetKey:key2,draft:stageDraft,authority:'decree',operations:stageOps}).ok);
 w.day=240;patient2.hp=89;const h3=healer();stepDaoActivities(w,life);assert(stepDaoTravel(w,life,h3,1));
 assert.equal(patient2.wanxiang.physique.stage,1);assert.equal(patient2.wanxiang.physique.treatments,2);assert.equal(patient2.wanxiang.physique.lastTreatmentDay,240);
 const latest=structuredClone(patient2.wanxiang);
 assert.equal(controller.handleMingpu({type:'commit',targetKey:key2,draft:stageDraft,authority:'decree',operations:stageOps}).reason,'field-conflict:physique');
 assert.deepEqual(patient2.wanxiang,latest);
 // A new explicit decree coexists with the retained natural healing receipts.
 const decreeDraft=controller.handleMingpu({type:'begin',targetKey:key2}).draft;
 emitCommittedFact(w,patient2,{id:'controlled-boundary-breakthrough',type:'breakthrough-success',targetLevel:9});
 const receipt=structuredClone(patient2.wanxiang.experienceLedger);
 assert(controller.handleMingpu({type:'commit',targetKey:key2,draft:decreeDraft,authority:'decree',operations:[{op:'decree',action:'grant_bloodline',id:'true_dragon',grade:2,purity:40}]}).ok);
 assert.deepEqual(patient2.wanxiang.experienceLedger,receipt);assert.equal(patient2.wanxiang.experienceLedger.highWater,9);
 assert.equal(patient2.wanxiang.physique.treatments,2);assert.equal(patient2.wanxiang.history.at(-1).mode,'decree');
 const copy=deserializeWorld(serializeWorld(w));const recovered=copy.entities.find(e=>e.id===patient2.id);
 assert.equal(recovered.wanxiang.physique.stage,1);assert.equal(recovered.wanxiang.physique.treatments,2);assert.equal(recovered.wanxiang.physique.lastTreatmentDay,240);
 assert.deepEqual(recovered.wanxiang.experienceLedger,receipt);controller.destroy();
 console.log('WX-C path D controlled native paid treatments/gratitude, natural opening conflict, one-use seed costs and committed breakthrough fact survive fate/decree and v11 restoration');
}


{
 const a={...world,entities:[{id:1,hp:100,x:1,y:1,wanxiang:emptyProfile()}]};
 const b={...world,entities:[{id:1,hp:100,x:1,y:1,wanxiang:emptyProfile()}]};
 const stale={id:'same-zero-revision',key:'mortal:1',mode:'player',expectedRevision:0,operations:[set('hexagram',{id:'hex_01'})]};
 const originalToken=createSelectionToken(a,'mortal:1');
 assert.equal(previewChangeSet(a,stale).ok,true);
 assert.equal(rawCommitChangeSet(b,stale).reason,'identity-binding-required');
 assert.equal(rawCommitChangeSet(b,stale,{token:originalToken}).ok,false);
 const previous=a.entities[0];a.entities=[{...previous,wanxiang:emptyProfile()}];
 assert.equal(rawCommitChangeSet(a,stale,{token:originalToken}).ok,false);
 assert.equal(a.entities[0].wanxiang.revision,0);assert.equal(b.entities[0].wanxiang.revision,0);
 console.log('WX-C unbound command denied; revision-0 cross-world and replacement-body replay denied with original binding');
}
