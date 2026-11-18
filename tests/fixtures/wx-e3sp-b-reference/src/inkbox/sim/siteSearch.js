// Read-only planning query. Existing arrival, rewards and expiry own all writes.
import {siteHasContent} from './sites.js';
import {workMetricsEnabled,startWorkMetric,endWorkMetric,countWorkMetric} from './workMetrics.js';

export function nearestSeekSite(world,x,y,radius=30,measuring=workMetricsEnabled(world)) {
  if(!world || !Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(radius) || radius<0)return null;
  const sites=world.sites||[],r2=radius*radius;
  const started=measuring?startWorkMetric(world):null;
  let best=null,best2=r2,bestDistance=Infinity,raw=null,raw2=Infinity,inRadius=0,contentChecks=0,dormant=0,formations=0;
  for(let i=0;i<sites.length;i++){
    const site=sites[i],dx=site.x-x,dy=site.y-y,d2=dx*dx+dy*dy;
    if(!(d2<=r2))continue;
    if(measuring){inRadius++;if(d2<raw2){raw=site;raw2=d2;}}
    // Stable ties retain the existing sites-array order, like sitesNear.sort.
    if(best && d2>=best2)continue;
    const distance=Math.sqrt(d2);
    if(best && distance>=bestDistance)continue;
    if(site.kind==='formation'){if(measuring)formations++;continue;}
    if(site.kind==='cave'){
      if(measuring)contentChecks++;
      if(!siteHasContent(site,world)){if(measuring)dormant++;continue;}
    }
    best=site;best2=d2;bestDistance=distance;
  }
  if(measuring){
    countWorkMetric(world,'seek.queries');countWorkMetric(world,'seek.checked',sites.length);
    countWorkMetric(world,'seek.in-radius',inRadius);countWorkMetric(world,'seek.sort-rows',0);
    countWorkMetric(world,'seek.content-checks',contentChecks);
    countWorkMetric(world,'seek.rejected-dormant',dormant);countWorkMetric(world,'seek.rejected-formation',formations);
    if(raw){
      countWorkMetric(world,'seek.nearest-distance',Math.sqrt(raw2));
      if(raw.kind==='formation')countWorkMetric(world,'seek.nearest-formation');
      if(raw.kind==='cave'&&!siteHasContent(raw,world))countWorkMetric(world,'seek.nearest-dormant');
    }
    if(best){countWorkMetric(world,'seek.selected');countWorkMetric(world,'seek.selected-distance',Math.sqrt(best2));}
    endWorkMetric(world,'seek.query',started);
  }
  return best;
}
