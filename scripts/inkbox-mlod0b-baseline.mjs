import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { nativeApi } from './inkbox-wx-e0-replay.mjs';
import { loadCheckpoint } from './inkbox-mlod0b-inputs.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const base = '3772bea8fa7b7ef753770c3a47877e6b461dd3c8';
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'inkbox-mlod0b-ref-'));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const evidence = { base, node: process.version, dt: 3, days: 30, trials: [], pass: false };
try {
  const archive = path.join(temp, 'baseline.tar');
  execFileSync('git', ['archive','--format=tar','--output='+archive,base,'src','package.json'], {cwd:root});
  execFileSync('tar', ['-xf',archive,'-C',temp]);
  const before = await nativeApi(temp), after = await nativeApi(root);
  for (const age of [100,400]) {
    const {saved, sha256} = loadCheckpoint(age);
    const old = before.restore(saved), current = after.restore(saved);
    const row = { age, inputSha256: sha256, boundaries: [] };
    evidence.trials.push(row);
    for (let i = 0; i <= 10; i++) {
      if (i) { before.advance(old,3); after.advance(current,3); }
      const a = JSON.stringify(before.capture(old)), b = JSON.stringify(after.capture(current));
      const same = a === b;
      row.boundaries.push({day:old.world.day, original:hash(a), candidate:hash(b), same});
      assert(same, 'Default runtime diverged from #74 on day '+old.world.day);
    }
  }
  evidence.pass = true;
} finally {
  const out = path.join(root,'reports/mlod0b/baseline-default.json');
  fs.mkdirSync(path.dirname(out),{recursive:true});
  fs.writeFileSync(out,JSON.stringify(evidence,null,2)+'\n');
  fs.rmSync(temp,{recursive:true,force:true});
}
console.log('Default vs #74: initial state and 10 complete steps matched for each natural checkpoint.');
