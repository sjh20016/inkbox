import {createSelectionToken} from '../src/inkbox/g1/characterIdentity.js';
import {emitCommittedFact} from '../src/inkbox/wanxiang/experiences.js';
import assert from 'node:assert/strict';
import {emptyProfile,readProfile,validateProfile} from '../src/inkbox/wanxiang/profile.js';
import {previewChangeSet,commitChangeSet as rawCommitChangeSet} from '../src/inkbox/wanxiang/changes.js';
import {readEffects} from '../src/inkbox/wanxiang/effects.js';
import {serializeWanxiang,restoreWanxiang} from '../src/inkbox/wanxiang/saveState.js';
import {createProfile,migrateProfile,inheritBirthProfile} from '../src/inkbox/wanxiang/inheritance.js';
const e={id:1,hp:100,x:1,y:1,village:1};const world={entities:[e],width:16,height:16,w:16,h:16,day:1,wanxiang:{enabled:true},sites:[]};
const binding=createSelectionToken(world,'mortal:1');
const commitChangeSet=(w,c)=>rawCommitChangeSet(w,c,{token:binding});
const before=JSON.stringify(e);assert.equal(readProfile(e).attributes.bone,50);assert.equal(JSON.stringify(e),before);assert.equal(readEffects(e).cultivation,1);
const command={id:'edit-1',key:'mortal:1',mode:'player',expectedRevision:0,operations:[{op:'set',field:'attributes',value:{bone:80,comprehension:50,perception:50}}]};
const preview=previewChangeSet(world,command);assert.equal(preview.ok,true,preview.reason);assert.equal(JSON.stringify(e),before);
assert.equal(commitChangeSet(world,command).ok,true);assert.equal(e.wanxiang.attributes.bone,80);assert.equal(commitChangeSet(world,command).duplicate,true);assert.equal(e.wanxiang.revision,1);
assert.equal(commitChangeSet(world,{...command,id:'stale'}).reason,'revision-conflict');
const rejected=commitChangeSet(world,{...command,id:'bad',expectedRevision:1,operations:[...command.operations,{op:'set',field:'hp',value:0}]});assert.equal(rejected.ok,false);assert.equal(e.hp,100);assert.equal(e.wanxiang.revision,1);
assert.equal(readEffects(e).hp,1.06);assert.equal(previewChangeSet(world,{...command,id:'natural',mode:'natural',expectedRevision:1}).reason,'permission-denied');
const data=serializeWanxiang(world),restored={entities:[{id:1,hp:1}]};restoreWanxiang(restored,data);assert.deepEqual(restored.entities[0].wanxiang,e.wanxiang);
const bad=structuredClone(data);bad.profiles.push(bad.profiles[0]);assert.throws(()=>restoreWanxiang(restored,bad));assert.throws(()=>restoreWanxiang(restored,{...data,version:2}));
const parent1={id:2,hp:10,village:1,wanxiang:emptyProfile()},parent2={id:3,hp:10,village:1,wanxiang:emptyProfile()};parent1.wanxiang.bloodlines=[{id:'true_dragon',grade:3,purity:50,stable:true,inheritable:true,latent:false}];
const baby={id:4,hp:10,village:1,age:0,birthOrigin:{kind:'village'}};world.entities.push(parent1,parent2,baby);
assert.equal(inheritBirthProfile(world,baby,[parent1,parent2],{rng:()=>0}),true);assert.equal(baby.wanxiang.bloodlines.length,1);assert.equal(baby.wanxiang.bloodlines[0].latent,true);assert.deepEqual(baby.wanxiang.dna.parents,['mortal:2','mortal:3']);assert.equal(inheritBirthProfile(world,baby,[parent1,parent2],{rng:()=>0}),false);
validateProfile(baby.wanxiang);console.log('wanxiang core: passed pure preview, identity/revision, permissions, atomic rejection, receipts, effects, save validation, birth inheritance');


// Catalog IDs and executable payloads must be rejected on restore, before any mutation.
for(const patch of [{physique:{id:'missing'}},{states:[{id:'site_wound',expiresDay:-1}]},{traits:[{id:'seal_vow',special:false}]},{cultivation:{primary:null,auxiliary:[],skills:['injected']}}]) {
 const unsafe=structuredClone(data);Object.assign(unsafe.profiles[0].profile,patch);const snapshot=JSON.stringify(restored);assert.throws(()=>restoreWanxiang(restored,unsafe));assert.equal(JSON.stringify(restored),snapshot);
}
const yin={wanxiang:emptyProfile(),dao:{path:{key:'yin'}}};yin.wanxiang.physique={id:'yin_block',stage:1};assert.equal(readEffects(yin).cultivation,1.2);
const migrant={wanxiang:emptyProfile()};migrant.wanxiang.hexagram={id:'hex_01'};migrant.wanxiang.daoSeed={id:'dao_seed_juan_shu',loan:{lenderId:1}};migrant.wanxiang.pageLoan={id:'old'};migrateProfile(migrant,'mortal:1','upper:9');assert.equal(migrant.wanxiang.daoSeed,null);assert.equal(migrant.wanxiang.pageLoan,undefined);assert.equal(migrant.wanxiang.hexagram.id,'hex_01');
const uniqueRoots=new Set();for(let i=0;i<5;i++){const values=[0,0,i/5,0,.9,.9];uniqueRoots.add(createProfile({fresh:true,rng:()=>values.shift()??.9}).root.elements[0]);}assert.equal(uniqueRoots.size,5);
console.log('wanxiang core extended: catalog denial, unsafe state, atomic restore, object dao path, realm binding cleanup, root element variety passed');

// Editing loadout preserves runtime resources, progress and hit receipts.
e.wanxiang.cultivation.combat={mana:4,lastActionDay:1,cooldowns:{yang:8}};
e.wanxiang.cultivation.battle={windowStart:1,grants:1,seen:['0:2'],untilDay:31,bonus:.02,lastDevourDay:-1};
const runtime=structuredClone(e.wanxiang.cultivation);
assert.equal(commitChangeSet(world,{...command,id:'loadout',expectedRevision:e.wanxiang.revision,operations:[{op:'set',field:'cultivation',value:{primary:null,skills:['strike'],auxiliary:[]}}]}).ok,true);
assert.deepEqual(e.wanxiang.cultivation.combat,runtime.combat);assert.deepEqual(e.wanxiang.cultivation.battle,runtime.battle);
const snapshot=JSON.stringify(e);
assert.equal(commitChangeSet(world,{...command,id:'reset',expectedRevision:e.wanxiang.revision,operations:[{op:'set',field:'cultivation',value:{primary:null,skills:['strike'],battle:{}}}]}).ok,false);assert.equal(JSON.stringify(e),snapshot);
for(const patch of [{primary:'missing'}, {battle:{...runtime.battle,bonus:2}}, {battle:{...runtime.battle,seen:['forged']}}]){const unsafe=readProfile(e);Object.assign(unsafe.cultivation,patch);assert.throws(()=>validateProfile(unsafe));}
console.log('wanxiang core runtime state: loadout edits preserve battle/cooldowns, unknown practice and forged battle rejected');

// Cross-plane migrations reset local receipts; plane clocks survive save and legacy recovery.
const traveler={id:11,hp:100,maxHp:100,wanxiang:emptyProfile()};
traveler.wanxiang.experienceLedger={seen:[],cooldowns:{},siteFailures:{},permanentGrants:0,records:[],lastSequence:900};
migrateProfile(traveler,'mortal:11','upper:11');assert.equal(traveler.wanxiang.experienceLedger.lastSequence,undefined);
const upper={day:1,seed:42,plane:'upper',entities:[traveler],wanxiang:{version:1,enabled:true,factSequence:0}},realms={entities:[],wanxiang:{version:1,enabled:true,factSequence:900},upper};
assert.equal(emitCommittedFact(upper,traveler,{id:'upper-first',type:'page-return'}),true);assert.equal(traveler.wanxiang.experienceLedger.lastSequence,1);
const savedPlanes=serializeWanxiang(realms);assert.equal(savedPlanes.planeStates.upper.factSequence,1);
const resumed={entities:[],upper:{day:400,seed:42,plane:'upper',entities:[{id:11,hp:100,maxHp:100}]}};
restoreWanxiang(resumed,savedPlanes);assert.equal(emitCommittedFact(resumed.upper,resumed.upper.entities[0],{id:'upper-second',type:'combat-victory'}),true);assert.equal(resumed.upper.wanxiang.factSequence,2);
const legacyPlanes=structuredClone(savedPlanes);delete legacyPlanes.planeStates;restoreWanxiang(resumed,legacyPlanes);assert.equal(resumed.upper.wanxiang.factSequence,1);assert.equal(emitCommittedFact(resumed.upper,resumed.upper.entities[0],{id:'legacy-next',type:'combat-victory'}),true);
for(const badPlane of [{other:{enabled:true}},{upper:{enabled:true,factSequence:-1}},{upper:{enabled:true,factSequence:0}}]){const badBlock={...savedPlanes,planeStates:badPlane};const stable=JSON.stringify(resumed);assert.throws(()=>restoreWanxiang(resumed,badBlock));assert.equal(JSON.stringify(resumed),stable);}
console.log('wanxiang plane clocks: migration, committed fact resume, legacy watermark recovery and atomic rejection passed');
