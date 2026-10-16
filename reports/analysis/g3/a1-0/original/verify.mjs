// G3-PERF-A0R 独立复算：只读取原始 JSON，不导入任何产品模块。
// 1) 复算 RFC 引用的聚合值；2) 确定性：两次 census 计数与状态哈希逐步一致；
// 3) 交叉：census 与 eps_contract（不同脚本）状态哈希链一致；4) 与最初 A0 census.json 的计数一致。
import fs from 'node:fs';
const D = process.env.DIR || '/data/exp/a0r';
const J = f => JSON.parse(fs.readFileSync(`${D}/${f}`, 'utf8'));
const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };
const COUNT_KEYS = ['hc', 'wc', 'tc', 'wetdry', 'bandX', 'diagFlip', 'vegElig', 'staleType', 'treesSame', 'trees'];
let fail = 0; const check = (name, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + name); if (!ok) fail++; };
const census = J('census.json'), rerun = fs.existsSync(`${D}/census_rerun.json`) ? J('census_rerun.json') : null;
const eps = J('eps_contract.json'), wi = J('water_index.json');
for (const r of census.runs) {
  const R = r.rows, q = (f, p) => pct(R.map(f), p);
  console.log(`\n[census ${r.label}] steps ${R.length}`);
  for (const k of ['hc', 'wc', 'tc', 'wetdry', 'diagFlip', 'vegElig']) console.log(`  ${k} p50 ${q(x => x[k], .5)} p95 ${q(x => x[k], .95)}`);
  [0, 1, 2].forEach(e => console.log(`  visT[${e}] p50 ${q(x => x.visT[e], .5)}  visW[${e}] p50 ${q(x => x.visW[e], .5)} p95 ${q(x => x.visW[e], .95)}`));
  r.rows[0].chunk.forEach((c, j) => console.log(`  chunk${c.s} anyH p50 ${q(x => x.chunk[j].anyH, .5).toFixed(3)} anyW p50 ${q(x => x.chunk[j].anyW, .5).toFixed(3)} vis.02 p50 ${q(x => x.chunk[j].vis, .5).toFixed(3)}`));
  console.log(`  trees identical ${R.filter(x => x.treesSame).length}/${R.length}`);
  if (rerun) { const b = rerun.runs.find(x => x.label === r.label);
    check(`determinism ${r.label}: counts identical across two runs`, R.every((x, i) => COUNT_KEYS.every(k => x[k] === b.rows[i][k]) && JSON.stringify(x.visT) === JSON.stringify(b.rows[i].visT)));
    check(`determinism ${r.label}: state hash chain identical`, R.every((x, i) => JSON.stringify(x.stateHash) === JSON.stringify(b.rows[i].stateHash))); }
  const e = eps.runs.find(x => x.label === r.label);
  check(`cross-script ${r.label}: census vs eps_contract state hashes`, e.hashes.every((h, i) => h.height === R[i].stateHash.height && h.water === R[i].stateHash.water && h.type === R[i].stateHash.type));
}
if (fs.existsSync(`${D}/../census.json`)) { const old = J('../census.json');
  for (const o of old) { const n = census.runs.find(x => x.label === o.label);
    check(`original A0 census (${o.label}) reproduced: count fields`, o.rows.every((x, i) => COUNT_KEYS.every(k => x[k] === n.rows[i][k]))); } }
for (const r of eps.runs) { const R = r.rows; console.log(`\n[eps ${r.label}] strengths ${JSON.stringify(r.strengths)} TMAX ${r.tmax}`);
  console.log(`  depth-byte cells p50 ${pct(R.map(x => x.byteCells), .5)} texels p50 ${pct(R.map(x => x.texelCells), .5)} shoreline quads p50 ${pct(R.map(x => x.partial), .5)}`);
  R[0].per.forEach((p, j) => { const g = f => pct(R.map(x => f(x.per[j])), .5);
    console.log(`  eps ${p.eps}: terrain p50 ${g(v => v.terrainCells)} water p50 ${g(v => v.waterCells)} shade8 p99.9 p50 ${g(v => v.all8P999).toFixed(2)} max p95 ${pct(R.map(x => x.per[j].all8Max), .95).toFixed(2)} >2lv p95 ${pct(R.map(x => x.per[j].over2), .95)}`); }); }
for (const r of wi.runs) { const R = r.rows, q = (k, p) => pct(R.map(x => x[k]), p);
  console.log(`\n[water index ${r.map}] overflow ${JSON.stringify(r.overflowEvents)}`);
  for (const k of ['changed', 'byMask', 'byDiagOnly', 'drawnCompact', 'drawnFixed', 'compactFull', 'compactSuffix', 'fixedSlot', 'block32_s0.1', 'drawn_block32_s0.1', 'block16_s0.1', 'drawn_block16_s0.1'])
    console.log(`  ${k} p50 ${q(k, .5)} p95 ${q(k, .95)} max ${Math.max(...R.map(x => x[k]))} nonzero ${R.filter(x => x[k]).length}/${R.length}`); }
for (const f of ['replay_real.json', 'replay_typeonly.json']) { if (!fs.existsSync(`${D}/${f}`)) continue; const rp = J(f);
  for (const r of rp.runs) { const R = r.rows, tot = R.map(x => Object.values(x.up).reduce((s, v) => s + v, 0));
    console.log(`\n[${f} ${r.map}] art ${r.art} clipped ${r.waterClipped}`);
    for (const k of ['total', 'bridgeScanMs', 'terrainUpdateMs', 'waterUpdateMs', 'vegetationUpdateMs']) console.log(`  ${k} p50 ${pct(R.map(x => x[k] || 0), .5).toFixed(2)} p95 ${pct(R.map(x => x[k] || 0), .95).toFixed(2)}  (timing: reference only)`);
    console.log(`  queued bytes/step p50 ${pct(tot, .5)} max ${Math.max(...tot)}`);
    const keys = [...new Set(R.flatMap(x => Object.keys(x.up)))]; for (const k of keys) { const v = R.map(x => x.up[k] || 0); console.log(`    ${k}: steps ${v.filter(Boolean).length}/${R.length} p50 ${pct(v, .5)}`); } } }
console.log(`\n${fail ? 'VERIFY FAILED: ' + fail : 'VERIFY OK'}`); process.exit(fail ? 1 : 0);
