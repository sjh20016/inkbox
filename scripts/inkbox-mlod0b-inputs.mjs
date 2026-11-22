import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

const fixtures = fileURLToPath(new URL('../tests/fixtures/mlod0b/', import.meta.url));
export const inputHashes = Object.freeze({
  100: '08404e6fa62c4cba154bfe03b0b116cd9eb7e835bd2cd1e69b800fc87b92ad18',
  400: 'd204519759a222d3fac8d5847d9f025329c9a1fa83a20e3835dfbd7ef59666bd'
});
function argument(name) {
  return process.argv.find(value => value.startsWith('--' + name + '='))?.slice(name.length + 3);
}

// A named override can point to renamed JSON or gzip. Verify the original bytes
// before parsing; each caller receives a fresh, independently mutable world input.
export function loadCheckpoint(age) {
  const expected = inputHashes[age];
  assert(expected, 'Only the archived 100- and 400-year checkpoints are defined');
  const explicit = argument('input-' + age) || process.env['MLOD0B_INPUT_' + age];
  const directory = argument('checkpoint-root') || process.env.MLOD0B_CHECKPOINT_ROOT || fixtures;
  const candidates = explicit ? [explicit] : [
    '20260914-' + age + 'y-save.json', age + '.json', age + '.json.gz'
  ].map(name => path.join(directory, name));
  const file = candidates.find(candidate => fs.existsSync(candidate));
  if (!file) throw new Error('Missing natural checkpoint: ' + candidates.join(', '));
  const compressed = fs.readFileSync(file);
  const data = compressed[0] === 0x1f && compressed[1] === 0x8b ? gunzipSync(compressed) : compressed;
  const sha256 = createHash('sha256').update(data).digest('hex');
  assert.equal(sha256, expected, 'Unexpected checkpoint content: ' + file);
  const saved = JSON.parse(data);
  assert.equal(saved.v, 11);
  assert.equal(saved.day, Number(age) * 360);
  assert.equal(saved.runtime?.exact, true);
  return { saved, file: path.resolve(file), sha256, bytes: data.length };
}
