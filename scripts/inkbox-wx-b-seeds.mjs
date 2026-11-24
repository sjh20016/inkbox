import assert from 'node:assert/strict';
import {World} from '../src/inkbox/world/World.js';
import {Life} from '../src/inkbox/sim/life.js';
import {DAO_BY_KEY} from '../src/inkbox/core/cultivation.js';
import {initializeProfile} from '../src/inkbox/wanxiang/profile.js';
import {stepDaoActivities,stepDaoTravel} from '../src/inkbox/sim/daoActivities.js';
import {stepDaoSeeds} from '../src/inkbox/wanxiang/daoSeeds.js';
import {serializeWorld,deserializeWorld} from '../src/inkbox/io/save.js';
function scene(){const w=new World(40,32,718);w.day=30;w.wanxiang={enabled:true,experiments:{daoSeeds:true}};const life=new Life(w,()=>.5);const healer=w.addEntity({sp:'cultivator',x:10.5,y:10.5,hp:100,maxHp:100,level:8,exp:0,artifacts:[],dao:{path:DAO_BY_KEY.alchemy,stage:0,progress:0}});const patient=w.addEntity({sp:'cultivator',x:10.7,y:10.5,hp:89,maxHp:100,level:8,exp:30,techniques:[]});initializeProfile(patient);return {w,life,healer,patient};}
function heal(s){assert.equal(stepDaoActivities(s.w,s.life),1);assert(stepDaoTravel(s.w,s.life,s.healer,1));}
{
 const s=scene();s.patient.wanxiang.physique={id:'yin_block',stage:0};heal(s);assert.equal(s.patient.wanxiang.physique.treatments,1);s.w.day=59;stepDaoSeeds(s.w);assert.equal(s.patient.wanxiang.daoSeed,null);s.w.day=60;s.w.wanxiang.experiments.daoSeeds=false;stepDaoSeeds(s.w);assert.equal(s.patient.wanxiang.physique.stage,0);s.w.wanxiang.experiments.daoSeeds=true;stepDaoSeeds(s.w);assert.equal(s.patient.wanxiang.physique.stage,1);assert.equal(s.patient.exp,10);assert.equal(s.patient.hp,80);assert.equal(s.patient.wanxiang.daoSeed.id,'dao_seed_bian_ji');
 const saved=serializeWorld(s.w),copy=deserializeWorld(saved);stepDaoSeeds(copy);const p=copy.entities.find(e=>e.id===s.patient.id);assert.equal(p.exp,10);assert.equal(p.hp,80);assert(p.wanxiang.daoSeed.spent);
 p.wanxiang.daoSeed=null;p.wanxiang.physique.stage=0;p.exp=100;p.hp=100;
 stepDaoSeeds(copy);
 assert.equal(p.wanxiang.physique.stage,0,'editing the visible seed cannot reset its lifetime receipt');
 assert.equal(p.exp,100);
}
{
 const s=scene();heal(s);assert(s.patient.wanxiang.bonds.some(b=>b.targetKey==='mortal:'+s.healer.id));s.healer.hp=20;s.patient.x=20;stepDaoSeeds(s.w);assert.equal(s.healer.hp,20);s.patient.x=10.7;s.w.wanxiang.experiments.daoSeeds=false;stepDaoSeeds(s.w);assert.equal(s.healer.hp,20);s.w.wanxiang.experiments.daoSeeds=true;stepDaoSeeds(s.w);assert.equal(s.healer.hp,30);assert.equal(s.patient.hp,80);assert.equal(s.patient.exp,20);assert.equal(s.patient.wanxiang.daoSeed.id,'dao_seed_ming_wang');
 const copy=deserializeWorld(serializeWorld(s.w));copy.day+=30;stepDaoSeeds(copy);assert.equal(copy.entities.find(e=>e.id===s.healer.id).hp,30);assert.equal(copy.entities.find(e=>e.id===s.patient.id).exp,20);
}
const absent=scene();absent.healer.hp=20;absent.patient.hp=100;stepDaoSeeds(absent.w);assert.equal(absent.healer.hp,20,'no fabricated gratitude qualification');
console.log('WX-B conditional Ming-wang repayment and Bian-ji treatment conversion: native source, costs, distance, disabled state and save/replay passed');
