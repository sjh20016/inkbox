import { initializeProfile } from './profile.js';
import DAO_SEEDS from './content/daoSeeds.js';
import {emitCommittedFact} from './experiences.js';
export { DAO_SEEDS };
function receipts(p) {
 const l=p.seedLedger ||= {borrowUntil:0,spent:[]};
 if(p.daoSeed?.spent && ['dao_seed_bian_ji','dao_seed_ming_wang'].includes(p.daoSeed.id) && !l.spent.includes(p.daoSeed.id))l.spent.push(p.daoSeed.id);
 return l;
}
/** Borrow an actual equipped manual's page from a nearby living owner. No manual is created. */
export function borrowPage(world,borrower,lender,manualName){
 if(world.wanxiang?.enabled!==true||!world.wanxiang?.experiments?.daoSeeds||borrower===lender||borrower.hp<=0||lender.hp<=0||!world.entities.includes(borrower)||!world.entities.includes(lender)||Math.hypot(borrower.x-lender.x,borrower.y-lender.y)>2)return false;
 const p=initializeProfile(borrower),lp=initializeProfile(lender),manual=(lender.techniques||[]).find(t=>t.name===manualName);
 const ledger=receipts(p);
 if(world.day<ledger.borrowUntil||p.history.some(h=>h.kind==='page-borrow'&&world.day-h.day<360))return false;
 if(!manual||p.daoSeed||lp.pageLoan||borrower.exp<10)return false;
 borrower.exp-=10;ledger.borrowUntil=world.day+360;p.history.push({kind:'page-borrow',day:world.day});p.history=p.history.slice(-128);
 const loan={id:`page:${lender.id}:${manualName}:${world.day}`,borrowerId:borrower.id,lenderId:lender.id,manualName,expiresDay:world.day+180};
 lp.pageLoan=loan;p.daoSeed={id:'dao_seed_juan_shu',loan:{...loan},cultivationBonus:.05};p.revision++;lp.revision++;return true;
}
export function returnPage(world,e){const p=e?.wanxiang,loan=p?.daoSeed?.loan;if(!loan)return false;const lender=world.entities.find(x=>x.id===loan.lenderId);if(lender?.wanxiang?.pageLoan?.id===loan.id){delete lender.wanxiang.pageLoan;lender.wanxiang.revision++;}p.daoSeed=null;p.revision++;return true;}
export function stepDaoSeeds(world){if(world.wanxiang?.enabled!==true)return;
 // The borrower may already have left this plane or the death sweep. Clean
 // the lender's reservation independently of the borrower's continued presence.
 for(const lender of world.entities||[]){
  const loan=lender.wanxiang?.pageLoan;if(!loan)continue;
  const borrower=world.entities.find(e=>e.id===loan.borrowerId),other=borrower?.wanxiang?.daoSeed?.loan;
  if(lender.hp<=0||!borrower||borrower.hp<=0||world.day>=loan.expiresDay||loan.lenderId!==lender.id||!other||['id','borrowerId','lenderId','manualName','expiresDay'].some(k=>other[k]!==loan[k])||!(lender.techniques||[]).some(t=>t.name===loan.manualName)){
   delete lender.wanxiang.pageLoan;lender.wanxiang.revision++;
  }
 }
 for(const e of world.entities||[]){const loan=e.wanxiang?.daoSeed?.loan;if(!loan)continue;const lender=world.entities.find(x=>x.id===loan.lenderId);if(e.hp<=0||!lender||lender.hp<=0||lender.wanxiang?.pageLoan?.id!==loan.id||world.day>=loan.expiresDay||!(lender.techniques||[]).some(t=>t.name===loan.manualName))returnPage(world,e);}
 if(!world.wanxiang.experiments?.daoSeeds)return;
 for(const e of world.entities||[]) stepConditionalSeed(world,e);
 for(const e of world.entities||[]){if(e.hp<=0||e.wanxiang?.daoSeed||e.exp<10)continue;const lender=world.entities.find(l=>l!==e&&l.hp>0&&!l.wanxiang?.pageLoan&&l.techniques?.length&&Math.hypot(e.x-l.x,e.y-l.y)<=2);if(lender)borrowPage(world,e,lender,lender.techniques[0].name);}
}
// Two finite same-rank branches. Their sources are actual treatment receipts,
// and the primary seed retains its spent receipt instead of minting a repeat reward.
function stepConditionalSeed(world,e) {
 const p=e.wanxiang;
 if(!p||e.hp<=0||e._ascended||!(e.level>0))return;
 const day=world.day, seed=p.daoSeed;
 const ledger=receipts(p);
 if(seed?.spent)return;
 const physique=p.physique;
 if(!ledger.spent.includes('dao_seed_bian_ji')&&(!seed||seed.id==='dao_seed_bian_ji')&&['yin_block','yang_block'].includes(physique?.id)&&!(physique.stage>0)&&physique.treatments>=1&&Number.isFinite(physique.lastTreatmentDay)&&day-physique.lastTreatmentDay>=30&&e.hp>=e.maxHp*.9&&e.exp>=20) {
  ledger.spent.push('dao_seed_bian_ji');
  e.exp-=20;e.hp-=e.maxHp*.2;physique.stage=1;
  p.daoSeed={id:'dao_seed_bian_ji',spent:true,source:'paid-meridian-treatment',day,physiqueId:physique.id,costExp:20,costHp:e.maxHp*.2};
  p.history.push({kind:'seed-transformation',day,source:'蜕凡更始真君',physiqueId:physique.id,costExp:20,costHp:e.maxHp*.2});
  p.history=p.history.slice(-128);p.revision++;return;
 }
 if(ledger.spent.includes('dao_seed_ming_wang')||seed&&seed.id!=='dao_seed_ming_wang')return;
 const bond=p.bonds.find(b=>!b.dormant&&b.id.startsWith('gratitude:')&&b.targetKey&&(b.expiresDay==null||b.expiresDay>day));
 const key=bond?.targetKey?.split(':');
 if(!key||key[0]!==String(world.plane||'mortal'))return;
 const target=world.entities.find(x=>x.id===Number(key[1])&&x!==e&&x.hp>0&&!x._ascended);
 if(!target||!(target.maxHp>0)||target.hp>=target.maxHp*.5||Math.hypot(e.x-target.x,e.y-target.y)>2||e.hp<e.maxHp*.8||e.exp<10)return;
 const amount=Math.min(target.maxHp*.1,target.maxHp-target.hp);
 ledger.spent.push('dao_seed_ming_wang');
 e.exp-=10;e.hp-=e.maxHp*.2;target.hp+=amount;
 p.daoSeed={id:'dao_seed_ming_wang',spent:true,source:bond.id,targetKey:bond.targetKey,day,costExp:10,costHp:e.maxHp*.2,healing:amount};
 p.history.push({kind:'seed-repaid',day,source:'织命混沌尊主',targetKey:bond.targetKey,healing:amount,costExp:10,costHp:e.maxHp*.2});
 p.history=p.history.slice(-128);p.revision++;
 emitCommittedFact(world,target,{id:`ming-wang:${world.plane||'mortal'}:${e.id}:${day}`,type:'healed',helperKey:`${world.plane||'mortal'}:${e.id}`,paid:true,amount});
}
export function daoSeedCultivation(e,world){const loan=e.wanxiang?.daoSeed?.loan;return world.wanxiang?.enabled===true&&world.wanxiang?.experiments?.daoSeeds===true&&loan&&loan.expiresDay>world.day&&world.entities.some(x=>x.id===loan.lenderId&&x.hp>0&&x.wanxiang?.pageLoan?.id===loan.id&&x.wanxiang.pageLoan.borrowerId===e.id&&(x.techniques||[]).some(t=>t.name===loan.manualName))?.05:0;}
