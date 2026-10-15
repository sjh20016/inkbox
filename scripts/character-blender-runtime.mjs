import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const version = '4.5.14';
const folder = path.join(root, '.workbuddy-ai', 'tools', 'blender');
const filename = `blender-${version}-windows-x64.zip`;
const executable = path.join(folder, `blender-${version}-windows-x64`, 'blender.exe');
fs.mkdirSync(folder, {recursive: true});
if (fs.existsSync(executable)) { console.log(executable); process.exit(0); }
const base = 'https://download.blender.org/release/Blender4.5/';
const checksResponse = await fetch(`${base}blender-${version}.sha256`);
if (!checksResponse.ok) throw new Error(`Official checksum: ${checksResponse.status}`);
const checks = await checksResponse.text();
const expected = checks.split(/\r?\n/).find(line => line.includes(filename))?.match(/^[a-fA-F0-9]{64}/)?.[0]?.toLowerCase();
if (!expected) throw new Error('No official Windows x64 SHA256');
const archive = path.join(folder, filename);
if (!fs.existsSync(archive)) {
  const response = await fetch(base + filename);
  if (!response.ok || Number(response.headers.get('content-length')) > 500_000_000) throw new Error(`Download ${response.status}`);
  console.log(`Downloading official Blender ${version} portable`);
  await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(archive + '.part'));
  fs.renameSync(archive + '.part', archive);
}
const hash = crypto.createHash('sha256');
for await (const chunk of fs.createReadStream(archive)) hash.update(chunk);
const actual = hash.digest('hex');
if (actual !== expected) throw new Error(`Official archive checksum mismatch: ${actual}`);
const python = process.env.CHARACTER_PYTHON || path.join(process.env.USERPROFILE, '.cache', 'codex-runtimes', 'codex-primary-runtime', 'dependencies', 'python', 'python.exe');
const code = `import sys,zipfile,os\narchive,target=sys.argv[1:]\nwith zipfile.ZipFile(archive) as z:\n for item in z.infolist():\n  resolved=os.path.abspath(os.path.join(target,item.filename))\n  if os.path.commonpath([resolved,os.path.abspath(target)]) != os.path.abspath(target): raise ValueError('unsafe zip path')\n z.extractall(target)\n`;
const result = spawnSync(python, ['-c', code, archive, folder], {windowsHide: true, encoding: 'utf8', timeout: 180000});
if (result.status !== 0 || !fs.existsSync(executable)) throw new Error(result.stderr || 'Blender extraction failed');
fs.writeFileSync(path.join(folder, 'runtime-source.json'), JSON.stringify({version,url:base+filename,sha256:actual}, null, 2));
console.log(executable);
