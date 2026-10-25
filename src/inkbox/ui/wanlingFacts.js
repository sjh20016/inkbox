import { WANLING_BY_KEY } from '../core/wanlingCatalog.js';
import { wanlingVillageInfluence, wanlingResonanceAt } from '../world/wanlingInfluence.js';
export function wanlingStateLabel(u) {
  return ({settled:'栖居',forage:'觅食',grazing:'啮草',flee:'逃离威胁',hunting:'追猎',hunt:'追猎',
    guard:'守护',guarding:'守护',rooted:'依林生息',anchored:'依附地貌',weak:'失栖衰弱',weakening:'失栖衰弱',
    migrating:'寻找新栖地',dissipated:'已消散',calm:'受音律安抚',resonating:'灵脉共鸣',disguised:'化作人形',
    building:'衔石筑岸',scorching:'留下枯痕',bonded:'相伴结缘',wandering:'游走',wander:'游走',rest:'休息',
    shore:'水岸守护',swimming:'水中栖游',prowling:'地方巡猎',gone:'已离去',raiding:'袭扰村边',
    chasing:'驱逐威胁',blessing:'祥瑞护村',affable:'亲近村落'})[u.state]||'正在活动';
}
export function wanlingInspectCard(world,u) {
  if(!u) return null;
  const info=WANLING_BY_KEY.get(u.form);
  const villages=(world.villages||[]).map(v=>({v,impact:wanlingVillageInfluence(world,v)}))
    .filter(({impact})=>impact.sources.some(s=>s.id===u.id));
  const bonded=world.entities.find(e=>e.id===u.bondedBy&&e.hp>0&&!e._ascended&&Math.hypot(e.x-u.x,e.y-u.y)<=10);
  return {head:`${info?.name||u.form} · #${Math.abs(u.id)}`,rows:[
    ['类别',info?.category==='herd'?'聚合种群':info?.category==='spirit'?'地貌依附地灵':'山海异兽 · 真实个体'],
    ['所在','凡界 · '+u.x.toFixed(1)+', '+u.y.toFixed(1)],
    ['当前',wanlingStateLabel(u)+(u.reason?` · ${u.reason}`:'')],
    ['气血',`${Math.ceil(u.hp)} / ${Math.ceil(u.maxHp)}`],
    ['数量',`${u.count??1}${info?.category==='herd'?' · 画面仅为代表影':''}`],
    ['生态角色',info?.role||''],
    ['实际影响',villages.length?villages.map(({v,impact})=>`${v.name}（粮产×${impact.yieldScale.toFixed(2)}，灾损×${impact.damageScale.toFixed(2)}）`).join('；'):'当前没有影响村庄'],
    ...(u.targetId?[['当前目标',String(u.targetId)]]:[]),
    ...(u.mask?[['伪装',`${u.mask==='human'?'人形':'狐形'} · 真身仍为九尾狐`]]:[]),
    ...(bonded&&u.bondUntilDay>world.day?[['结缘',`${bonded.name} · 局部修炼+4% · 至第${Math.floor(u.bondUntilDay)}日`]]:[]),
    ...(u.form==='dijiang'?[['修士共鸣',`当前附近${world.entities.filter(e=>e.level>0&&e.hp>0&&wanlingResonanceAt(world,e.x,e.y)>0).length}名修士获局部修炼增益（不改永久灵气层）`]]:[]),
    ['反制与边界',info?.counter||''],
  ]};
}
