import assert from 'node:assert/strict';
import {canReceiveArtifact, giveTo, dropArtifacts} from '../src/inkbox/sim/artifacts.js';

function fixture(hp=100) {
  const owner={id:1,name:'师父',sp:'cultivator',hp,age:100,lifespan:100,level:8,x:4,y:4,artifacts:[],relations:new Map([[2,{type:'disciple'}]])};
  const heir={id:2,name:'弟子',sp:'cultivator',hp:100,level:4,x:4,y:4,artifacts:[]};
  const artifact={id:11,name:'旧剑',ownerId:1,slot:'武器',tier:1,quality:1,durability:100,history:[]};
  owner.artifacts.push(artifact);
  return {owner,heir,artifact,world:{day:36000,entities:[owner,heir],artifacts:[]}};
}

for(const hp of [100,0]) {
  const {owner,heir,artifact,world}=fixture(hp);
  const result=dropArtifacts(world,owner,()=>0);
  assert.equal(result.length,1);
  assert.equal(result[0].heir,heir,`death inventory transfer with hp=${hp}`);
  assert.deepEqual(owner.artifacts,[]);
  assert.deepEqual(heir.artifacts,[artifact]);
  assert.equal(artifact.ownerId,heir.id);
  assert.equal(world.artifacts.length,0);
  assert.equal(dropArtifacts(world,owner,()=>0).length,0,'repeated death cannot duplicate a reward');
  assert.equal(artifact.history.at(-1)[1],'inherited');
}
{
  const {owner,heir,artifact,world}=fixture();
  owner.age=30;
  assert.equal(canReceiveArtifact(heir,artifact,world),false);
  assert.equal(giveTo(world,heir,artifact,()=>0),false,'living inventory cannot be copied');
  assert.deepEqual(owner.artifacts,[artifact]);
  assert.equal(heir.artifacts.length,0);
  assert.equal(artifact.ownerId,owner.id);
}
{
  const {owner,heir,artifact,world}=fixture();
  const second={...artifact,id:12,history:[]};owner.artifacts.push(second);
  assert.equal(dropArtifacts(world,owner,()=>0).length,2);
  assert.deepEqual(heir.artifacts,[artifact,second],'release retains the full death-transfer list');
}
{
  const {owner,artifact,world}=fixture();world.entities=[owner];
  const result=dropArtifacts(world,owner,()=>0);
  assert.equal(result[0].heir,null);
  assert.deepEqual(world.artifacts,[artifact]);
  assert.equal(artifact.ownerId,0);
  assert.deepEqual(owner.artifacts,[]);
}
console.log('Wanxiang canonical artifact ownership: old-age/killed inheritance, idempotent death and living-owner rejection passed');
