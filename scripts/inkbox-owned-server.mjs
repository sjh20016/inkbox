import path from 'node:path';
import {spawn} from 'node:child_process';

export async function launchOwnedServer({root,port=0,timeoutMs=15000}) {
  const expectedRoot=path.resolve(root);
  const child=spawn(process.execPath,[path.join(expectedRoot,'scripts/inkbox-server.mjs'),'--port',String(port)],
    {cwd:expectedRoot,stdio:['ignore','ignore','ignore','ipc'],windowsHide:true});
  try {
    const identity=await new Promise((resolve,reject)=>{
      const done=(error,value)=>{clearTimeout(timer);child.off('message',message);child.off('exit',exited);child.off('error',failed);error?reject(error):resolve(value);};
      const exited=(code,signal)=>done(new Error(`Owned server exited before readiness: ${code}/${signal}`));
      const failed=error=>done(error);
      const message=value=>{
        if(value?.type!=='inkbox-server-ready')return;
        if(value.pid!==child.pid||value.root!==expectedRoot||!Number.isInteger(value.port)||value.port<1||value.port>65535)
          return done(new Error('Owned server IPC identity mismatch'));
        done(null,value);
      };
      const timer=setTimeout(()=>done(new Error('Owned server IPC readiness timeout')),timeoutMs);
      child.on('message',message);child.once('exit',exited);child.once('error',failed);
    });
    if(child.exitCode!==null||child.signalCode!==null)throw new Error('Owned server stopped after readiness');
    child.disconnect();
    return {child,url:`http://127.0.0.1:${identity.port}`,identity:{...identity,owned:true,transport:'child IPC after listen'}};
  } catch(error) {
    if(child.exitCode===null&&child.signalCode===null)child.kill();
    // Reject only after the process we launched has exited; never touch a
    // listener merely because it occupies the requested port.
    if(child.exitCode===null&&child.signalCode===null)await new Promise(resolve=>{const timer=setTimeout(resolve,3000);child.once('exit',()=>{clearTimeout(timer);resolve();});});
    throw error;
  }
}
