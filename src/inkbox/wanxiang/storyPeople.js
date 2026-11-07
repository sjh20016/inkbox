// On-demand projections of retained official records. Never writes or draws RNG.
import { resolveCharacter, parseCharacterKey, planeWorld } from '../g1/characterIdentity.js';
import { createStory, personRef as currentPersonRef, personIdentitySince } from './storyFacts.js';

const finiteDay = value => Number.isFinite(value) && value >= 0;
const stable = value => JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)
  ? Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])) : item);
const order = (a,b) => a.day-b.day || String(a.key).localeCompare(String(b.key),'en');
const personRef = (plane,e,id=e.id,incarnation=e.incarnation??1) => ({...currentPersonRef(plane,e),id,incarnation,label:e.name||'无名'});
function proof(source,key,day,type,text,grade='B') { return {source,key,day,type,text,grade}; }
function card(templateId,ref,origin,fields) {
  return createStory(templateId,ref,origin,{actorRef:ref,
    title:templateId==='defeat-return'?'败后问途':'恩义有回',originDay:origin.day,
    lastEvidenceDay:origin.day,mode:'watch_hook',status:'watching',outcome:'unproven',
    evidence:[origin],nodes:[{day:origin.day,text:origin.text,evidenceKey:origin.key}],related:[],
    importance:2,relevance:1,...fields});
}
function append(story,row) {
  if(story.evidence.some(x=>x.key===row.key))return;
  story.evidence.push(row);story.nodes.push({day:row.day,text:row.text,evidenceKey:row.key});
  story.lastEvidenceDay=Math.max(story.lastEvidenceDay,row.day);
}
function resolvedTarget(world,key) {
  const parsed=parseCharacterKey(key);if(!parsed)return null;
  const found=resolveCharacter(world,key);
  return {...parsed,kind:'person',incarnation:null,
    label:'旧日施助者（本世身份未可考）',available:false,identityChangedDay:personIdentitySince(found.entity),
    status:found.status,reason:'历史未保留对方本世身份，不能授权定位或据当前同号名录断定旧人去向'};
}
function terminal(story,status,siteGone=false) {
  if(story.status==='resolved')return;
  if(status!=='alive') {
    story.status='interrupted';story.outcome=status;
    story.reason=status==='dead'?'人物已离世，未有可证后续':status==='ascended'?'人物已飞升，原位面后续未能续考':status==='nether'?'人物已入幽冥，原身故事至此中断':'人物身份去向未能续考';
  } else if(siteGone) {story.status='interrupted';story.outcome='site-gone';story.reason='原洞府已消散，未有可证再赴';}
  else story.reason='留存记录中尚无可证后续；不据当前关系或恢复状态推定行动';
}
/** At most 24 candidates per family, from the selected life only. */
export function personStoryCandidates(world,actorRef) {
  const stats={checked:0,rejected:0,deduplicated:0,candidates:0};const cards=[];
  const key=`${actorRef?.plane}:${actorRef?.id}`;
  if(!parseCharacterKey(key))return {cards,stats};
  const r=resolveCharacter(world,key),e=r.entity;
  if(!r.ok||!e||!e.wanxiang||(actorRef.incarnation!=null&&actorRef.incarnation!==(e.incarnation??1)))return {cards,stats};
  if(Object.hasOwn(actorRef,'identitySince')&&actorRef.identitySince!==(finiteDay(e.possessedBy?.day)?e.possessedBy.day:null))return {cards,stats};
  const ownerWorld=planeWorld(world,actorRef.plane),ref=personRef(actorRef.plane,e,actorRef.id,actorRef.incarnation??e.incarnation??1);
  const arrival=ownerWorld?.arrivedLog?.find(row=>row.id===actorRef.id&&finiteDay(row.day));
  const identityAfter=Math.max(finiteDay(arrival?.day)?arrival.day:-1,
    finiteDay(e.possessedBy?.day)?e.possessedBy.day:-1);
  // Migrated records belong to their original actor, not this body's new key.
  const historySeen=new Set();
  const history=(e.wanxiang.history||[]).slice(-128).filter(h=>{
    stats.checked++;const ok=h&&!h.pastLife&&finiteDay(h.day)&&h.day>identityAfter&&h.day<=world.day&&h.actorKey===key;
    if(!ok)stats.rejected++;return ok;
  }).sort((a,b)=>a.day-b.day||stable(a).localeCompare(stable(b),'en')).filter(h=>{
    const source=stable(h);if(historySeen.has(source)){stats.deduplicated++;return false;}historySeen.add(source);return true;
  });
  // Ledger rows lack actorKey. After migration only the part preceding the
  // official arrival can be attributed to the old plane/body.
  const migrated=r.currentPlane&&r.currentPlane!==actorRef.plane;
  const ledgerThrough=migrated
    ? (Number.isFinite(r.arrival?.day)?r.arrival.day:-1) : world.day;
  const records=(e.wanxiang.experienceLedger?.records||[]).slice(-24).filter(x=>x&&typeof x.id==='string'&&finiteDay(x.day)&&x.day>identityAfter&&(migrated?x.day<ledgerThrough:x.day<=ledgerThrough));
  const seen=new Set();
  const facts=records.filter(row=>{stats.checked++;if(seen.has(row.id)){stats.deduplicated++;return false;}seen.add(row.id);return true;})
    .map(row=>({...row,key:row.id})).sort(order);
  const failures=new Map();
  for(const row of facts.filter(x=>x.type==='site-failure'&&Number.isSafeInteger(x.siteId)&&x.siteId>0)){
    if(failures.has(row.siteId))stats.deduplicated++;else failures.set(row.siteId,row);
  }
  for(const origin of [...failures.values()].slice(0,24)) {
    const site=ownerWorld?.sites?.find(s=>s.id===origin.siteId);
    const initial=proof('experience-ledger',origin.id,origin.day,origin.type,`正式经历记载：探府失败（地点 #${origin.siteId}）`);
    const story=card('defeat-return',ref,initial,{summary:'一次探府失利之后，后来的选择仍须由实际到达与结果证明。',related:[{kind:'site',plane:actorRef.plane,id:origin.siteId,label:site?.name||`原洞府 #${origin.siteId}`,available:!!site,reason:site?'':'原洞府已不在当前地点名录'}]});
    const laterFacts=facts.filter(x=>x.siteId===origin.siteId&&x.day>origin.day&&['site-success','site-failure'].includes(x.type));
    const later=laterFacts.at(-1);
    if(later) {
      for(const result of laterFacts)append(story,proof('experience-ledger',result.id,result.day,result.type,`再次实际探府，${result.type==='site-success'?'成功':'失败'}（地点 #${result.siteId}）`));
      story.mode='retelling';story.status='resolved';story.outcome=later.type==='site-success'?'success':'failure';
      story.reason='后续正式探府结果证明再次到达；不推断未记载的行程';
    }
    for(const h of history.filter(h=>h.day>=origin.day&&h.siteId===origin.siteId&&h.type==='谨慎退避').slice(-2))append(story,proof('wanxiang-history',`choice:${key}:${h.day}:${h.type}:${h.siteId}`,h.day,h.type,'正式选择记录：谨慎退避；这不等于再赴洞府'));
    for(const h of history.filter(h=>h.kind==='natural'&&h.type==='risk-resolved'&&h.result?.siteId===origin.siteId&&h.day>origin.day&&typeof h.source==='string').slice(-2))
      append(story,proof('wanxiang-history',`risk-resolved:${key}:${h.source}`,h.day,h.type,'正式经历：畏险转为险中有定；转换由原正式探府结果触发'));
    if(!migrated&&r.status==='alive'&&(e.wanxiang.traits||[]).some(t=>t.id==='risk_fear'&&!t.dormant&&(t.expiresDay==null||t.expiresDay>world.day)))
      append(story,proof('current-profile',`risk-fear:${key}:${world.day}`,world.day,'risk_fear','当前仍有畏险特质；这不证明后来已经赴事','C'));
    terminal(story,r.status,!site);cards.push(story);
  }
  const origins=new Map();
  for(const row of facts.filter(x=>x.type==='healed'&&parseCharacterKey(x.helperKey))) origins.set(row.id,{key:row.id,day:row.day,helperKey:row.helperKey,source:'experience-ledger'});
  for(const h of history.filter(h=>h.kind==='natural'&&h.type==='aid-bond'&&typeof h.source==='string'&&parseCharacterKey(h.targetKey))) origins.set(h.source,{key:h.source,day:h.day,helperKey:h.targetKey,source:'wanxiang-history',bondProven:true});
  const helpers=new Map();
  for(const origin of [...origins.values()].sort(order)){
    if(helpers.has(origin.helperKey)){helpers.get(origin.helperKey).push(origin);stats.deduplicated++;}
    else helpers.set(origin.helperKey,[origin]);
  }
  for(const group of [...helpers.values()].slice(0,24)) {
    const origin=group[0];
    const target=resolvedTarget(world,origin.helperKey);if(!target||origin.helperKey===key)continue;
    const initial={...proof(origin.source,origin.key,origin.day,'healed',`当年受助：旧日施助者给予治疗${origin.bondProven?'，正式留有结恩记录':'；不据治疗本身推定结恩'}`),identityKey:origin.helperKey};
    const story=card('grateful-return',ref,initial,{summary:'曾受援手；关系尚存只能说明有恩，回助须有真实支付与事务回执。',related:[target]});
    for(const additional of group.slice(1,5))append(story,{...proof(additional.source,additional.key,additional.day,'healed',`后来又获旧日施助者治疗${additional.bondProven?'，正式留有结恩记录':'；未推定新增恩义'}`),identityKey:additional.helperKey});
    const targetChanged=target.identityChangedDay!=null&&origin.day<=target.identityChangedDay;
    const returns=[...new Map(history.filter(h=>h.kind==='natural-choice'&&h.status==='committed'&&h.type==='报偿恩义'&&h.targetKey===origin.helperKey&&h.day>origin.day&&(!targetChanged||h.day<target.identityChangedDay)&&h.cost&&['actor-hp','sect-spirit-stone'].includes(h.cost.kind)&&Number.isFinite(h.cost.amount)&&h.cost.amount>0&&typeof h.result==='string'&&h.result.trim())
      .map(h=>{const row=proof('wanxiang-history',`repayment:${key}:${h.day}:${h.targetKey}:${stable(h.cost)}:${h.result}`,h.day,'paid-reciprocity',`${h.result}；付出${h.cost.kind==='actor-hp'?'气血':'宗门灵石'} ${h.cost.amount}`,'A');return [row.key,row];})).values()].sort(order);
    // The official post-commit receipt is itself sufficient; its text is quoted,
    // never parsed into an invented healing / breakthrough completion.
    const selectedReturns=returns.length>4?[returns[0],...returns.slice(-3)]:returns;
    for(const row of selectedReturns)append(story,{...row,text:`${row===returns[0]?'首次有证回助':'后来仍有回助'}：${row.text}`});
    if(returns.length){story.mode='retelling';story.status='resolved';story.outcome='paid-reciprocity';story.reason=`正式完成后的有代价回助回执；护关不等于目标突破成功。${returns.length>4?`当前保留来源中至少有 ${returns.length} 次正式回助；此处展示首次和最近三次。`:''}当时受助与已经完成的回助仍有记录；旧施助者本世身份不足以授权当前定位。`;}
    terminal(story,r.status);
    if(story.status!=='resolved'&&target.status!=='alive'){story.status='interrupted';story.reason='旧施助者本世身份不足，后续身份去向未能续考；未据当前同号名录或关系延续推定报偿';}
    if(targetChanged&&!returns.length){story.status='interrupted';story.reason='对方身体已有换主记录；旧来源未保存其本世身份，不能把后来对同一身体的帮助认作报答原施助者';story.outcome='target-identity-unproven';}
    cards.push(story);
  }
  for(const c of cards){
    // A real return/result is a stronger reading signal than an unproven hook.
    // This score selects presentation only; it never affects action weights.
    c.importance=c.status==='resolved'?4:c.status==='interrupted'?2:1;
    c.relevance=c.evidence.filter(e=>e.grade==='A').length+c.nodes.length/100;
    c.evidence.sort(order);
    if(c.evidence.length>24)c.evidence=[c.evidence[0],...c.evidence.slice(1).slice(-23)];
    const retained=new Set(c.evidence.map(e=>e.key));c.nodes=c.nodes.filter(n=>retained.has(n.evidenceKey));
    c.nodes.sort((a,b)=>a.day-b.day||a.evidenceKey.localeCompare(b.evidenceKey,'en'));
  }
  cards.sort((a,b)=>a.originDay-b.originDay||a.key.localeCompare(b.key,'en'));stats.candidates=cards.length;
  return {cards,stats};
}
