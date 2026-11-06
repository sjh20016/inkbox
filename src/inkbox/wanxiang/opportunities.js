import { MANUALS } from '../core/lore.js';
export function opportunityCounter(world,key,n=1) {
 if(world.wanxiang?.enabled!==true||world.wanxiang.wxCEnabled===false)return;
 const state=world.wanxiang.opportunities ||= {version:1,lastSupplyDay:0,counters:{}};
 state.counters[key]=(state.counters[key]||0)+n;
}
export function opportunitySnapshot(world) {
 return structuredClone(world.wanxiang?.opportunities||{version:1,lastSupplyDay:0,counters:{}});
}
export function decisionMoment(world,e,type,detail) {
 if(!e.wanxiang||world.wanxiang?.enabled!==true||world.wanxiang.wxCEnabled===false||!detail?.result||(!detail.reasons?.length&&type!=='报偿恩义'))return;
 opportunityCounter(world,'behavior');
 const history=e.wanxiang.history;
 history.push({kind:'natural-choice',type,day:world.day,actorKey:`${world.plane||'mortal'}:${e.id}`,location:{plane:world.plane||'mortal',x:e.x,y:e.y},status:'committed',targetKey:detail.targetKey||(detail.siteId!=null?`site:${detail.siteId}`:null),...detail});
 if(history.length>128)history.shift();
}
export function encounterDecision(world,e,site) {
 const traits=e.wanxiang?.personality||[];
 const has=id=>traits.some(t=>t.id===`personality_${id}`||t.id===id);
 const distance=Math.hypot(e.x-site.x,e.y-site.y);
 const fearful=e.wanxiang?.traits?.some(t=>t.id==='risk_fear');
 const resolved=e.wanxiang?.traits?.some(t=>t.id==='risk_resolve');
 const timid=has('timid')?-.20:0;
 const sword=has('sword_enthusiast')&&MANUALS.some(m=>m.name===site.inheritanceManual&&m.kind==='sword')?.20:0;
 const risk=fearful?-.20:resolved?.15:0;
 const score=e.hp/e.maxHp+Math.min(e.level,20)/40-distance/24+risk+(world.wanxiang?.wxCEnabled===false?0:timid+sword);
 return {score,willing:score>.12,reasons:[...(timid?['胆小慎行']:[]),...(sword?['剑痴求诀']:[]),...(fearful?['畏险未平']:[]),...(resolved?['险中有定']:[])]};
}

export function aidPreference(world,e,target) {
 const active=world.wanxiang?.enabled===true&&world.wanxiang.wxCEnabled!==false;
 const gratitude=active&&(e.wanxiang?.bonds||[]).some(b=>!b.dormant&&b.id.startsWith('gratitude:')&&b.targetKey===`${world.plane||'mortal'}:${target.id}`&&b.expiresDay>world.day);
 const romantic=active&&(e.wanxiang?.personality||[]).some(t=>t.id==='personality_romantic')&&e.relations?.get?.(target.id)?.type==='lover';
 return {weight:1+(gratitude?.25:0)+(romantic?.2:0),gratitude,romantic};
}
