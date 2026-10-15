// Shared evidence probe: forwards each live product update/render exactly once.
const SAMPLES=120,WARMUP_RAFS=12;
export function sampleBody(label) {
  return `
    const r=window.inkbox.render3d.renderer,state={updates:[],renders:[],raf:[],gpuMs:[],gpuInvalid:0,gpuSkipped:0,maxPending:0,armed:false};
    const originalUpdate=r.update,originalRender=r.render,gl=r.gpu.getContext(),timer=gl.getExtension('EXT_disjoint_timer_query_webgl2'),pending=[];
    const poll=()=>{
      if(!timer)return;
      const disjoint=gl.getParameter(timer.GPU_DISJOINT_EXT);
      if(disjoint)for(const item of pending)item.disjoint=true;
      for(let i=pending.length-1;i>=0;i--){
        const item=pending[i];if(!gl.getQueryParameter(item.query,gl.QUERY_RESULT_AVAILABLE))continue;
        const ns=gl.getQueryParameter(item.query,gl.QUERY_RESULT);
        if(disjoint||item.disjoint)state.gpuInvalid++;else state.gpuMs.push(ns/1e6);
        gl.deleteQuery(item.query);pending.splice(i,1);
      }
    };
    r.update=function(...args){const start=performance.now();try{return originalUpdate.apply(this,args);}finally{if(state.armed)state.updates.push(performance.now()-start);}};
    r.render=function(...args){
      poll();const start=performance.now();let query=null,active=false;
      if(state.armed&&timer){
        if(pending.length<8){query=gl.createQuery();if(query){try{gl.beginQuery(timer.TIME_ELAPSED_EXT,query);active=true;}catch(error){gl.deleteQuery(query);query=null;throw error;}}
          else state.gpuSkipped++;}
        else state.gpuSkipped++;
      }
      try{
        const result=originalRender.apply(this,args);
        if(active){gl.endQuery(timer.TIME_ELAPSED_EXT);pending.push({query,disjoint:false});query=null;active=false;state.maxPending=Math.max(state.maxPending,pending.length);}
        if(state.armed)state.renders.push({elapsed:performance.now()-start,drawCalls:this.gpu.info.render.calls,
          triangles:this.gpu.info.render.triangles,lod:this.getLODStats()});
        return result;
      }catch(error){
        if(active){try{gl.endQuery(timer.TIME_ELAPSED_EXT);}catch{}active=false;}
        if(query){try{gl.deleteQuery(query);}catch{}query=null;}
        throw error;
      }
    };
    try{
      for(let i=0;i<${WARMUP_RAFS};i++)await new Promise(requestAnimationFrame);
      state.armed=true;let previous=null;
      for(let i=0;i<${SAMPLES}+1;i++){
        const timestamp=await new Promise(requestAnimationFrame);
        if(previous!==null)state.raf.push(timestamp-previous);previous=timestamp;
      }
      state.armed=false;
      for(let i=0;i<180&&pending.length;i++){await new Promise(requestAnimationFrame);poll();}
      poll();
      const digest=await (await import('./src/inkbox/render3d/art/VisualScenarios.js')).snapshotDigest(window.inkbox);
      const hash=async value=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value))))]
        .map(v=>v.toString(16).padStart(2,'0')).join('');
      const worldDigest=await hash(window.inkbox.world),advanceStateDigest=await hash(window.inkbox.advanceState);
      const glError=gl.getError();
      const summarize=values=>{const sorted=values.slice(-${SAMPLES}).sort((a,b)=>a-b);if(sorted.length!==${SAMPLES})throw new Error('expected ${SAMPLES} product samples, got '+sorted.length);
        return {samples:sorted.length,mean:sorted.reduce((s,v)=>s+v,0)/sorted.length,median:sorted[Math.floor(sorted.length*.5)],
          p95:sorted[Math.floor(sorted.length*.95)],max:sorted.at(-1)};};
      if(state.updates.length<${SAMPLES}||state.renders.length<${SAMPLES}||state.raf.length!==${SAMPLES})
        throw new Error('product sample cardinality mismatch: '+JSON.stringify({updates:state.updates.length,renders:state.renders.length,raf:state.raf.length}));
      if(Math.abs(state.updates.length-state.renders.length)>1||Math.abs(state.updates.length-state.raf.length)>1||Math.abs(state.renders.length-state.raf.length)>1)
        throw new Error('product update/render/rAF guard differed by more than one: '+JSON.stringify({updates:state.updates.length,renders:state.renders.length,raf:state.raf.length}));
      if(state.maxPending>8)throw new Error('GPU timer pending query bound exceeded');
      const frames=state.renders.slice(-${SAMPLES}),first=JSON.stringify({drawCalls:frames[0].drawCalls,triangles:frames[0].triangles,lod:frames[0].lod});
      if(frames.some(frame=>JSON.stringify({drawCalls:frame.drawCalls,triangles:frame.triangles,lod:frame.lod})!==first))
        throw new Error('draw/triangle/LOD changed within the 120-frame sample: '+JSON.stringify(frames.filter((x,i)=>i===0||JSON.stringify({drawCalls:x.drawCalls,triangles:x.triangles,lod:x.lod})!==JSON.stringify({drawCalls:frames[i-1].drawCalls,triangles:frames[i-1].triangles,lod:frames[i-1].lod})).slice(0,4)));
      const result={case:${JSON.stringify(label)},sampleMode:'product-loop-only; original update/render each forwarded once',
        cpuUpdateMs:summarize(state.updates),cpuRenderSubmitMs:summarize(state.renders.map(x=>x.elapsed)),rafIntervalMs:summarize(state.raf),
        gpuRenderMs:state.gpuMs.length?(()=>{const x=state.gpuMs.slice().sort((a,b)=>a-b);return {samples:x.length,median:x[Math.floor(x.length*.5)],p95:x[Math.floor(x.length*.95)],max:x.at(-1)};})():null,
        gpuQueryValidSamples:state.gpuMs.length,gpuQueryInvalidSamples:state.gpuInvalid,gpuQuerySkippedSamples:state.gpuSkipped,
        gpuTimerUnavailableReason:timer?null:'EXT_disjoint_timer_query_webgl2 unavailable',maxPendingQueries:state.maxPending,
        productCallCounts:{updates:state.updates.length,renders:state.renders.length,rafIntervals:state.raf.length},
        triangles:frames.at(-1).triangles,drawCalls:frames.at(-1).drawCalls,lod:frames.at(-1).lod,
        digest:digest.value,digestBytes:digest.bytes,worldDigest,advanceStateDigest,glError};
      if(glError!==gl.NO_ERROR)throw new Error('WebGL GL error '+glError);
      return result;
    }finally{
      state.armed=false;
      for(const item of pending){try{gl.deleteQuery(item.query);}catch{}}
      pending.length=0;r.update=originalUpdate;r.render=originalRender;
    }
  `;
}

