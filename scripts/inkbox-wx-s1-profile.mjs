// Read and profile WX-S1 stories from the real WX-D checkpoints. --extend=400
// resumes the existing 100y checkpoint with its saved native RNG/clock state.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { deserializeWorld, serializeWorld } from '../src/inkbox/io/save.js';
import { Life } from '../src/inkbox/sim/life.js';
import { advanceWorld, createAdvanceState } from '../src/inkbox/sim/advance.js';
import { rngStream } from '../src/inkbox/core/noise.js';
import { captureRuntimeState, restoreRuntimeState } from '../src/inkbox/sim/runtimeState.js';
import { readWorldStories } from '../src/inkbox/wanxiang/storyReading.js';
import { personStoryCandidates } from '../src/inkbox/wanxiang/storyPeople.js';
import { worldObjectStoryCandidates } from '../src/inkbox/wanxiang/storyWorld.js';
import { personRef } from '../src/inkbox/wanxiang/storyFacts.js';

const arg = name => process.argv.find(x => x.startsWith(`--${name}=`))?.slice(name.length + 3);
const root = process.cwd();
const dataDir = path.resolve(arg('data') || 'reports/local/wx-s1/natural');
const outDir = path.resolve(arg('out') || 'reports/local/wx-s1/profile');
const extend = Number(arg('extend') || 0);
fs.mkdirSync(outDir, { recursive:true });
const sha = execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const sourceFiles = ['wanxiang/storyFacts.js','wanxiang/storySelection.js','wanxiang/storyPeople.js','wanxiang/storyWorld.js','wanxiang/storyReading.js','sim/advance.js','sim/life.js'];
const hashes = Object.fromEntries(sourceFiles.map(file => [file,createHash('sha256').update(fs.readFileSync(`src/inkbox/${file}`)).digest('hex')]));
const proofs = {};
for (const seed of [20260914,73101,61003]) {
  const filename = path.join(dataDir,`${seed}-100y-save.json`);
  if (!fs.existsSync(filename)) throw Error(`missing natural checkpoint: ${filename}`);
  proofs[seed] = JSON.parse(fs.readFileSync(filename,'utf8'));
}
const maturePath=path.join(dataDir,'20260914-400y-save.json');
if(!extend&&fs.existsSync(maturePath))proofs['20260914-400y']=JSON.parse(fs.readFileSync(maturePath,'utf8'));

function countBy(rows, key) { return rows.reduce((o,x) => { const v=key(x); o[v]=(o[v]||0)+1; return o; },{}); }
function profile(seed, saved) {
  const world = deserializeWorld(saved);
  const start=performance.now(); const first=readWorldStories(world); const firstMs=performance.now()-start;
  const before=JSON.stringify(serializeWorld(world)); const beforeDay=world.day;
  for(let i=0;i<100;i++)readWorldStories(world);
  const after=JSON.stringify(serializeWorld(world));
  const all=readWorldStories(world,{limit:Infinity});
  const raw=[];
  const rejectedReasons={};
  const collect=result=>{raw.push(...result.cards);if(result.stats.reason)rejectedReasons[result.stats.reason]=(rejectedReasons[result.stats.reason]||0)+1;};
  for (const plane of ['mortal','upper','nether']) {
    const w=plane==='mortal'?world:world[plane]; if(!w)continue;
    for(const e of w.entities||[])if(e.wanxiang)collect(personStoryCandidates(world,personRef(plane,e)));
    const seen=new Set();
    for(const a of [...(w.artifacts||[]),...(w.entities||[]).flatMap(e=>e.artifacts||[])])if(a?.id&&!seen.has(a.id)){seen.add(a.id);collect(worldObjectStoryCandidates(world,{kind:'artifact',plane,id:a.id}));}
    for(const [kind,objects] of [['settlement',w.villages],['settlement-ruin',w.settlementRuins]])for(const o of objects||[])collect(worldObjectStoryCandidates(world,{kind,plane,id:o.id}));
  }
  const chosen=all.cards.filter(c=>c.nodes?.length>=2&&new Set(c.nodes.map(n=>n.day)).size>=2)
    .sort((a,b)=>b.nodes.length-a.nodes.length||a.originDay-b.originDay||a.key.localeCompare(b.key)).slice(0,3);
  return {seed,day:world.day,saveBytes:Buffer.byteLength(JSON.stringify(saved)),cardCount:first.cards.length,
    facts:first.stats.facts,rejectedReasons,selection:first.stats,byTemplate:countBy(all.cards,c=>c.templateId),byStatus:countBy(all.cards,c=>c.status),
    duration: {firstQueryMs:firstMs,
      repeat100ElapsedMs:(()=>{const t=performance.now();for(let i=0;i<100;i++)readWorldStories(world);return performance.now()-t;})()},
    observationPure:before===after&&world.day===beforeDay,stories:chosen.map(c=>({key:c.key,title:c.title,templateId:c.templateId,status:c.status,
      originDay:c.originDay,lastEvidenceDay:c.lastEvidenceDay,summary:c.summary,outcome:c.outcome,
      nodes:c.nodes.map(n=>({day:n.day,text:n.text,source:n.evidenceKey})),
      evidence:c.evidence.map(e=>({key:e.key,grade:e.grade,day:e.day,type:e.type,text:e.text})),
      related:c.related.map(r=>({kind:r.kind,plane:r.plane,id:r.id,incarnation:r.incarnation,label:r.label,available:r.available}))})),
    allCards:all.cards,rawCards:raw,world};
}
const results=Object.entries(proofs).map(([,saved])=>profile(saved.seed,saved));
const cards=results.flatMap(r=>r.allCards.map(c=>({...c,seed:r.seed})));
const complete=cards.filter(c=>c.nodes.some(n=>n.day!==c.originDay));
const chosen=[];
for (const family of ['grateful-return','defeat-return','old-object','old-settlement']) {
  const found=family==='grateful-return' ? complete.find(c=>c.templateId===family&&c.seed===20260914&&c.actorRef?.id===40&&c.evidence.some(e=>e.day===23229))
    || complete.find(c=>c.templateId===family) : complete.find(c=>c.templateId===family&&!chosen.some(x=>x.key===c.key));
  if(found)chosen.push(found);
}
if(chosen.length<3)throw Error('fewer than three verifiable natural excerpts; do not substitute fixtures');
let extension=null;
if(extend){
  if(!Number.isInteger(extend)||extend<=100||extend>800)throw Error('extend must be an integer from 101 to 800 years');
  const saved=proofs[20260914], world=deserializeWorld(saved);
  if (!saved.runtime.upperLife) { delete world.upper; delete world.nether; }
  if(!saved.runtime?.life)throw Error('checkpoint has no native runtime state');
  const life=new Life(world,rngStream(world.seed^0xa5a5a5a5)), state=createAdvanceState(), player=rngStream(world.seed^0x504c4159);
  restoreRuntimeState(saved.runtime,{world,life,advanceState:state,playerRng:player});
  const endDay=extend*360, started=performance.now(), checkpointPath=path.join(dataDir,`20260914-${extend}y-save.json`);
  let next=world.day+360*10;
  while(world.day<endDay){advanceWorld(world,Math.min(3,endDay-world.day),{life,state});if(world.day>=next){console.log(`extend ${world.day/360}y`);next+=360*10;}}
  const mature=serializeWorld(world,{}, {runtime:captureRuntimeState({world,life,advanceState:state,playerRng:player})});
  fs.writeFileSync(checkpointPath,JSON.stringify(mature));
  const read=readWorldStories(world); const t=performance.now();
  for(let i=0;i<100;i++)readWorldStories(world);
  extension={seed:20260914,fromDay:saved.day,toDay:world.day,years:extend,elapsedMs:performance.now()-started,
    checkpoint:checkpointPath,bytes:Buffer.byteLength(JSON.stringify(mature)),cards:read.cards.length,query100Ms:performance.now()-t};
}
const report={generatedAt:new Date().toISOString(),sha,dirty:!!execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim(),node:process.version,cpu:os.cpus()[0]?.model,
  sourceHashes:hashes,method:'Read-only query of three real WX-D 100-year native checkpoints; no world mutation, RNG draws, or story persistence. Optional extension restores native runtime and advances in 3-day steps.',
  equivalence:{checkpoints:results.map(r=>({seed:r.seed,pass:r.observationPure,day:r.day,saveBytes:r.saveBytes})),advanceStoryHooks:0,renderStoryHooks:0,storySaveBytes:0},
  worlds:results.map(({world,allCards,rawCards,...r})=>{
    const sources=[...new Map(rawCards.flatMap(c=>c.evidence.filter(e=>['A','B'].includes(e.grade)).map(e=>[`${c.subjectRef.plane}:${e.source}:${e.key}`,e]))).values()];
    return {...r,rawFamilyCandidates:countBy(rawCards,c=>c.templateId),rawCandidateCount:rawCards.length,selectedFamilyCount:countBy(allCards,c=>c.templateId),
      rawFamilyOutcomes:Object.fromEntries(['grateful-return','defeat-return','old-object','old-settlement'].map(f=>[f,countBy(rawCards.filter(c=>c.templateId===f),c=>c.outcome||c.status)])),
      verifiableRetainedStorySources:sources.length,retainedSourcesByType:countBy(sources,e=>e.type),retainedEvidenceByGrade:countBy(sources,e=>e.grade)};
  }),naturalExcerpts:chosen,extension};
fs.writeFileSync(path.join(outDir,'extraction.json'),JSON.stringify(report,null,2));
const lines=['# WX-S1 自然拾章样本','',`取证运行 HEAD：${sha}；${report.dirty?'此时工作树包含待提交修改':'工作树干净'}。精确故事模块、模拟核心哈希及最终候选复跑 SHA 见 reports/local/wx-s1/profile/extraction.json；本文保留生成时快照。`,
  '三个样本均由 WX-D 正式小景创世、原生 advanceWorld 三日步长生成的 100 年检查点提取；无注入人物、资源、行动或结局。',
  '读取按玩家主动查询执行，不写回世界，也不抽取随机流。100 次查询后的序列化世界与查询前一致；故事层没有推进/渲染钩子，纯投影存档增长为 0。', '',
  '| 种子 | 世界日 | 入选卡 | 故事类型 | 未结 / 已结 | 查询 100 次 |', '|---|---:|---:|---|---|---:|'];
for(const r of results)lines.push(`| ${r.seed} | ${r.day} | ${r.cardCount} | ${Object.entries(r.byTemplate).map(([k,v])=>`${k} ${v}`).join('、')||'无'} | ${Object.entries(r.byStatus).map(([k,v])=>`${k} ${v}`).join('、')||'无'} | ${r.duration.repeat100ElapsedMs.toFixed(1)} ms |`);
lines.push('','## 自然故事摘录');
for(const c of chosen){lines.push('',`### ${c.title}（${c.templateId}，种子 ${c.seed}，${c.status}）`,`来源键：${c.key}`,`起点第 ${c.originDay} 日；最近留存证据第 ${c.lastEvidenceDay} 日。`,...(c.actorRef?[`本世人物：${c.actorRef.label||'无名'}（${c.actorRef.plane}:${c.actorRef.id} · 第 ${c.actorRef.incarnation} 世）`]:[]),`相关身份：${c.related.map(r=>`${r.label||'不可考'}（${r.plane||'未知'}:${r.id??'?' }${r.incarnation?` · 第 ${r.incarnation} 世`:''}）`).join('；')||'无可靠关联身份'}`,c.summary||'（无摘要）','');for(const n of c.nodes){const source=n.evidenceKey||n.source;if(!source||!c.evidence.some(e=>e.key===source))throw Error('natural node missing verifiable source');lines.push(`- 第 ${n.day} 日：${n.text}（${source}）`);}}
lines.push('','## 可见来源与候选统计','','以下为本轮存档中仍保留且能支持四家族的唯一 A/B 来源，不代表该世界曾发生事件总数。各来源类型、拒绝原因、原始候选与结局分布见 extraction.json。');
for(const w of report.worlds)lines.push(`- 种子 ${w.seed} / 第 ${w.day/360} 年：可证来源 ${w.verifiableRetainedStorySources}；类型 ${JSON.stringify(w.retainedSourcesByType)}；四家族原始候选 ${JSON.stringify(w.rawFamilyCandidates)}；选择去重 ${w.selection.deduplicated}、每人预算拒绝 ${w.selection.perPerson}、容量拒绝 ${w.selection.capacity}。`);
lines.push('','## 口径与限制','','查询候选统计来自 `storySelection`，原始候选统计独立于展示预算。三种子各有不同的有限留存范围，卡片缺少来源时显示未可考/失考。自然摘录与受控边界测试分开，不以夹具补数。',
  '',`查询后纯度：${results.every(r=>r.observationPure)?'三个世界均逐字相同':'存在差异，见 JSON'}。`);
if(extension)lines.push('',`400 年续跑：${extension.fromDay} → ${extension.toDay} 日，${extension.elapsedMs.toFixed(0)} ms，存档 ${extension.bytes} bytes。`);
if(arg('write-doc')!=='0')fs.writeFileSync('docs/development/WX_S1_NATURAL_STORIES.md',lines.join('\n')+'\n');
console.log(`WX-S1 profile written to ${path.join(outDir,'extraction.json')}`);
