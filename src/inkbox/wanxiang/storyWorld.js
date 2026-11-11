// WX-S1: bounded, on-demand projections. No state, random draws or name joins.
import { personRef, compareStoryEvidence } from './storyFacts.js';
const PLANES = ['mortal','upper','nether'];
const planeWorld = (world, plane) => plane === 'mortal' ? world : world?.[plane];
const valid = ref => ref && PLANES.includes(ref.plane) && Number.isSafeInteger(ref.id) && ref.id > 0;
const fact = (source,key,day,type,text,grade='B') => ({source,key,day,type,text,grade});
const ordered = rows => [...new Map(rows.map(row=>[row.key,row])).values()].sort(compareStoryEvidence);
function projection(templateId,ref,title,rows,fields) {
  const evidence=ordered(rows), origin=evidence[0];
  return {key:`${templateId}:${ref.plane}:${ref.kind}:${ref.id}:${origin.key}`,templateId,subjectRef:{...ref},title,
    mode:'retelling',status:'unresolved',originDay:origin.day,lastEvidenceDay:evidence.at(-1).day,
    related:[],nodes:evidence.map(row=>({day:row.day,text:row.text,evidenceKey:row.key})),evidence,
    importance:2,relevance:1,...fields};
}
function artifactStory(world,ref) {
  const matches=[];
  for(const plane of PLANES){const w=planeWorld(world,plane);if(!w)continue;
    for(const a of w.artifacts||[])if(a.id===ref.id)matches.push({a,plane,owner:null});
    for(const owner of w.entities||[])for(const a of owner.artifacts||[])if(a.id===ref.id)matches.push({a,plane,owner});
  }
  if(matches.length!==1)return {cards:[],stats:{rejected:1,reason:matches.length?'原物归属冲突，不能认定当前去向':'原物已消散或记录不足，不能判定是否朽坏'}};
  const {a,plane,owner}=matches[0], labels={forged:'炼成',gained:'所得',inherited:'传承',found:'拾得',lost:'遗落',spirit:'器灵'};
  if(plane!==ref.plane)return {cards:[],stats:{rejected:1,reason:'原物已跨界，原位面引用不能证明当前沿革；请从当前原物检视重新读取'}};
  const rows=ordered((a.history||[]).slice(-10).map((h,sourceOrder)=>({h,sourceOrder})).filter(({h})=>Array.isArray(h)&&Number.isFinite(h[0])&&h[0]>=0&&h[0]<=(world.day??0)&&typeof h[1]==='string')
    .map(({h,sourceOrder})=>({...fact('artifact-history',`artifact:${a.id}:${JSON.stringify(h)}`,h[0],h[1],`据履历所记：${labels[h[1]]||h[1]}${h[2]?` · ${h[2]}（仅为履历姓名）`:''}`),sourceOrder})));
  if(!rows.length)return {cards:[],stats:{rejected:1,reason:'原物没有留存履历'}};
  const coherent=owner ? a.ownerId===owner.id && owner.hp>0 : a.ownerId===0;
  const summary=coherent ? owner ? `「${a.name||'无名原物'}」现由${owner.name||'无名者'}持有；旧主身份仅据原物履历记载。` : `「${a.name||'无名原物'}」现为无主原物，当前位于${plane}（${a.x}, ${a.y}）。` : '当前库存与所有权不一致，去向未能核实。';
  const related=[{...ref,plane,label:a.name||'原物',available:coherent}];
  if(owner&&coherent)related.push({...personRef(plane,owner),label:`现持有者 · ${owner.name||'无名'}`});
  const transfers=rows.filter(row=>['gained','inherited','found'].includes(row.type)).length;
  const lost=rows.findLastIndex(row=>row.type==='lost');
  const recovered=lost>=0&&rows.some((row,i)=>i>lost&&['gained','inherited','found'].includes(row.type));
  const outcome=!coherent?'ownership-unproven':!owner?'current-location':recovered?'loss-and-recovery-attested':transfers?'transfers-attested':rows.some(row=>['forged','spirit'].includes(row.type))?'provenance-known':'current-location';
  const historyPhrase=recovered?'留存履历可证此物曾遗落，后来重新为人取得；未证明原主寻找或寻回。':transfers?`辗转有迹，留存 ${transfers} 次相关取得记录。`:'来历有据；没有可证的遗落及后来重新取得的完整经过。';
  const card=projection('old-object',ref,'旧物寻踪',[...rows,fact('current-artifact',`artifact-current:${a.id}`,world.day??0,'current-location',summary,'C')],{summary:`${historyPhrase}${summary}`,status:coherent?'resolved':'unresolved',outcome,related,
    reason:`履历仅保留最近10条；留存的易主记录${transfers}条，不代表完整换主总数。姓名不能证明旧主身份；现址不能证明当年遗落位置，当前归属可考不代表寻回成功。`});
  return {cards:[card],stats:{qualified:1,facts:rows.length}};
}
function settlementStory(world,ref) {
  const w=planeWorld(world,ref.plane);if(!w)return {cards:[],stats:{rejected:1,reason:'位面不可考'}};
  const ruin=ref.kind==='settlement-ruin';
  const object=(ruin?w.settlementRuins:w.villages)?.find(v=>v.id===ref.id);
  if(!object)return {cards:[],stats:{rejected:1,reason:'地点已湮灭或沿革不再保留'}};
  const eligibleTypes=new Set(['disaster','aid','abandoned','recovered']);
  const rows=ordered((object.history||[]).slice(-16).map((h,sourceOrder)=>({h,sourceOrder})).filter(({h})=>h&&h.settlementId===object.id&&Number.isFinite(h.day)&&h.day>=0&&h.day<=(world.day??0)&&eligibleTypes.has(h.type)&&typeof h.text==='string')
    .map(({h,sourceOrder})=>({...fact('settlement-history',`settlement:${ref.plane}:${object.id}:${JSON.stringify([h.day,h.type,h.text,h.factionId])}`,h.day,h.type,h.text),factionId:h.factionId||0,sourceOrder})));
  if(!rows.length)return {cards:[],stats:{rejected:1,reason:'地方沿革缺少可靠来源，未可考'}};
  const related=[{...ref,label:object.name||'地方'}];
  for(const id of new Set(rows.map(row=>row.factionId).filter(Boolean))){const faction=w.factions?.find(f=>f.id===id);related.push({kind:'faction',plane:ref.plane,id,label:faction?.name||`沿革宗门 #${id}`,available:!!faction&&!(faction.destroyedDay>=0),reason:faction?'宗门当前状态以正式名录为准':'宗门已失考'});}
  // Use committed history order for same-day events. An earlier recovery does
  // not settle a later disaster, even when both share the same world day.
  const latestCrisis=rows.findLastIndex(row=>['disaster','abandoned'].includes(row.type));
  const recovered=rows.some((row,index)=>row.type==='recovered'&&index>latestCrisis);
  const summary=ruin?`「${object.name||'故城'}」现为荒废旧址；沿革所记的援助不能证明它已经重建。`:recovered?`「${object.name||'聚落'}」有正式恢复沿革；重建者身份未有记录则留白。`:`「${object.name||'聚落'}」仍可检视；后续恢复需等正式沿革，当前气血不能代替恢复回执。`;
  return {cards:[projection('old-settlement',ref,'故城余音',rows,{summary,related,status:ruin?'interrupted':recovered?'resolved':'watching',mode:ruin||recovered?'retelling':'watch_hook',outcome:ruin?'abandoned':recovered?'recovered':'unproven',reason:'仅保留最近16条地方沿革。同名、附近新村不构成继承关系；沿革未记载的人物或重建者不作推断。'})],stats:{qualified:1,facts:rows.length}};
}
export function worldObjectStoryCandidates(world,subjectRef) {
  if(!world||!valid(subjectRef))return {cards:[],stats:{rejected:1,reason:'无效对象身份'}};
  if(subjectRef.kind==='artifact')return artifactStory(world,subjectRef);
  if(['settlement','settlement-ruin'].includes(subjectRef.kind))return settlementStory(world,subjectRef);
  return {cards:[],stats:{rejected:1,reason:'此对象没有可核对的旧闻来源'}};
}
