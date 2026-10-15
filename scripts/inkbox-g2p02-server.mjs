import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {launchOwnedServer} from './inkbox-owned-server.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const servers=[];
try {
  const first=await launchOwnedServer({root});servers.push(first);
  const second=await launchOwnedServer({root});servers.push(second);
  assert.notEqual(first.identity.port,second.identity.port);
  assert.notEqual(first.child.pid,second.child.pid);
  for(const owned of servers){assert.equal(owned.identity.root,root);assert.equal(owned.identity.pid,owned.child.pid);assert((await fetch(owned.url+'/inkbox.html')).ok);}
  await assert.rejects(launchOwnedServer({root,port:first.identity.port}),/exited before readiness/);
  assert.equal(first.child.exitCode,null,'A port collision must not stop the existing server');
  assert((await fetch(first.url+'/inkbox.html')).ok,'The existing server must remain reachable');
  console.log('Owned server: independent IPC identities, ephemeral ports and occupied-port rejection PASS');
} finally {
  for(const {child} of servers){
    if(child.exitCode===null&&child.signalCode===null){child.kill();await new Promise(resolve=>{const timer=setTimeout(resolve,3000);child.once('exit',()=>{clearTimeout(timer);resolve();});});}
    assert(child.exitCode!==null||child.signalCode!==null,'Owned server cleanup failed');
  }
}
