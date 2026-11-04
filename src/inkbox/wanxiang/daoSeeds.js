import { initializeProfile } from './profile.js';
import DAO_SEEDS from './content/daoSeeds.js';
export { DAO_SEEDS };
/** Borrow an actual equipped manual's page from a nearby living owner. No manual is created. */
export function borrowPage(world,borrower,lender,manualName){
 if(world.wanxiang?.enabled!==true||!world.wanxiang?.experiments?.daoSeeds||borrower===lender||borrower.hp<=0||lender.hp<=0||!world.entities.includes(borrower)||!world.entities.includes(lender)||Math.hypot(borrower.x-lender.x,borrower.y-lender.y)>2)return false;
 const p=initializeProfile(borrower),lp=initializeProfile(lender),manual=(lender.techniques||[]).find(t=>t.name===manualName);
 if(p.history.some(h=>h.kind==='page-borrow'&&world.day-h.day<360))return false;
 if(!manual||p.daoSeed||lp.pageLoan||borrower.exp<10)return false;
 borrower.exp-=10;p.history.push({kind:'page-borrow',day:world.day});p.history=p.history.slice(-128);
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
 for(const e of world.entities||[]){if(e.hp<=0||e.wanxiang?.daoSeed||e.exp<10)continue;const lender=world.entities.find(l=>l!==e&&l.hp>0&&!l.wanxiang?.pageLoan&&l.techniques?.length&&Math.hypot(e.x-l.x,e.y-l.y)<=2);if(lender)borrowPage(world,e,lender,lender.techniques[0].name);}
}
export function daoSeedCultivation(e,world){const loan=e.wanxiang?.daoSeed?.loan;return world.wanxiang?.enabled===true&&world.wanxiang?.experiments?.daoSeeds===true&&loan&&loan.expiresDay>world.day&&world.entities.some(x=>x.id===loan.lenderId&&x.hp>0&&x.wanxiang?.pageLoan?.id===loan.id&&x.wanxiang.pageLoan.borrowerId===e.id&&(x.techniques||[]).some(t=>t.name===loan.manualName))?.05:0;}
