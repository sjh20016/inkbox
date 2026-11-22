import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {loadCheckpoint} from './inkbox-mlod0b-inputs.mjs';

const base = '3772bea8fa7b7ef753770c3a47877e6b461dd3c8';
const root = new URL('../', import.meta.url);
const out = new URL('reports/mlod0b/', root);
const git = args => execFileSync('git', args, {cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024});
const pattern = 'entities|[.](village|faction|pop|followers|lifespan|_ascended)\\b|isPracticingHuman|isMortalHuman|hasMortalResidents|villageSociet|addEntity|stepSects|pickParents|registerBirth|arriveUpper';
const lines = git(['grep','-n','-E',pattern,base,'--','src/inkbox']).trimEnd().split('\n');
const inventory = new Map();
for (const line of lines) {
  const match = /^[^:]+:([^:]+):(\d+):(.*)$/.exec(line);
  if (!match) throw new Error('Unexpected Git match: ' + line);
  const [,file,num] = match;
  if (!inventory.has(file)) inventory.set(file, []);
  inventory.get(file).push(Number(num));
}
const sha = data => createHash('sha256').update(data).digest('hex');
const inputs = [100,400].map(age => {
  const {saved,bytes,sha256} = loadCheckpoint(age);
  return {age,bytes,sha256,version:saved.v,day:saved.day,seed:saved.seed,exact:saved.runtime.exact,
    serializedTerrainGeneration:saved.generation, entities:saved.entities.length, villages:saved.villages.length,
    factions:saved.factions.length, runtimeLife:saved.runtime.life, runtimePlayer:saved.runtime.player,
    runtimeStreams:saved.runtime.streams, advanceClocks:saved.runtime.advance,
    upperClock:saved.runtime.upperLife, runtimeSha256:sha(JSON.stringify(saved.runtime))};
});
const result = {base, pattern, tree:git(['rev-parse',base+'^{tree}']).trim(),
  scope:'Fixed product source tree. Matched source lines include comments and unrelated array pop(); use CONSUMER_MATRIX for interpretation.',
  inputs, sourceFiles:Object.fromEntries(inventory)};
fs.mkdirSync(out,{recursive:true});
fs.writeFileSync(new URL('source-audit.json',out),JSON.stringify(result,null,2)+'\n');
console.log(inventory.size+' matching files, '+lines.length+' source lines; two archived inputs verified.');
