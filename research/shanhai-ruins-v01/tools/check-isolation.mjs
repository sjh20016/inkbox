import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const scope = 'research/shanhai-ruins-v01/';
const base = 'dbcd46c33090e6345ee881e92caf2a7fb5de7de9';
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
assert.equal(git('merge-base', base, 'HEAD'), base, 'The checked main must remain the ancestor');
const changed = [...new Set([
  ...git('diff', '--name-only', base).split('\n'),
  ...git('ls-files', '--others', '--exclude-standard').split('\n'),
].filter(Boolean))];
assert(changed.length > 0, 'Expected independent deliverables');
for (const file of changed) assert(file.startsWith(scope), `Out-of-scope edit: ${file}`);
const scan = folder => readdirSync(folder, { withFileTypes: true }).flatMap(entry => {
  const target = path.join(folder, entry.name);
  return entry.isDirectory() ? scan(target) : [target];
});
const sources = scan(path.join(root, scope, 'src')).filter(file => file.endsWith('.js'));
for (const file of sources) {
  const source = readFileSync(file, 'utf8');
  const imports = [...source.matchAll(/(?:from\s+|import\s*\()['"]([^'"]+)/g)].map(match => match[1]);
  for (const specifier of imports) {
    assert(!specifier.includes('src/inkbox'), `Production dependency in ${file}: ${specifier}`);
    assert(specifier.startsWith('.') || specifier.startsWith('three'), `External dependency: ${specifier}`);
  }
  assert(!/\b(?:localStorage|indexedDB)\b/.test(source), 'Preview must not touch game persistence');
}
console.log(`PASS isolation: ${changed.length} paths confined to ${scope}; ${sources.length} source modules independent of production World/Sim/save/render loops; base ${base}`);
