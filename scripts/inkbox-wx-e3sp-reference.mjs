import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

export const REFERENCE_SHA='37e3b1a64aedc921012fadb2b92668787d0fd3ac';
export const REFERENCE_TREE='4eea90e4e35b9a69cf0afd3f1b6423477a98eb72';
const fixture=fileURLToPath(new URL('../tests/fixtures/wx-e3sp-b-reference/',import.meta.url));
const manifestBytes=fs.readFileSync(path.join(fixture,'MANIFEST.json'));
const manifest=JSON.parse(manifestBytes);
const hash=(algorithm,bytes)=>createHash(algorithm).update(bytes).digest('hex');
export function referenceRoot(override) {
  assert.equal(hash('sha256',manifestBytes),'593dd009ec2b53f52e5f1eaf4e4585f29f662547e08f79f6fd56f449a76d6f87','frozen manifest identity');
  const requested=override??process.argv.find(s=>s.startsWith('--reference-root='))?.slice('--reference-root='.length);
  const root=requested?path.resolve(requested):fixture;
  assert.equal(manifest.baseSHA,REFERENCE_SHA);assert.equal(manifest.tree,REFERENCE_TREE);
  assert.equal(manifest.sourceFiles,284);assert.equal(manifest.files.length,285);
  const expected=new Set();
  for(const row of manifest.files){
    assert(!expected.has(row.path),'duplicate oracle manifest path');expected.add(row.path);
    assert(row.path==='package.json'||row.path.startsWith('src/'),'invalid oracle path');
    const bytes=fs.readFileSync(path.join(root,row.path));
    assert.equal(bytes.length,row.bytes,row.path+' oracle bytes');
    assert.equal(hash('sha256',bytes),row.sha256,row.path+' oracle SHA256');
    assert.equal(hash('sha1',Buffer.concat([Buffer.from('blob '+bytes.length+'\0'),bytes])),row.gitBlob,row.path+' oracle Git blob');
  }
  const walk=(dir,prefix='src')=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name),prefix+'/'+e.name):[prefix+'/'+e.name]);
  assert.deepEqual(walk(path.join(root,'src')).sort(),[...expected].filter(p=>p.startsWith('src/')).sort(),'complete frozen source path set');
  return root;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  console.log(JSON.stringify({pass:true,root:referenceRoot(),baseSHA:REFERENCE_SHA,tree:REFERENCE_TREE,files:manifest.files.length}));
}
