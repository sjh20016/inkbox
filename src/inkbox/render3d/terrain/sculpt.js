import { recomputeRect } from '../../world/terrain.js';
import { SEA_LEVEL } from '../../core/config.js';

// The only render3d world write boundary. A stamp reads a stable neighbourhood.
//
// ⚠️⚠️ B0.3（§15 / §16）：高程写完之后**必须**走 canonical 重算（`recomputeRect`）。
//    否则 `world.type` / `world.qi` 会留在**旧**高度上，而这在玩家眼里是看得见的：
//    `Render3DAdapter.render()` 的读数面板直接显示 `viewedWorld.type[...]`，
//    所以削平一座山之后，面板会继续说那里是「山峰」。
//
//    审计实测（`scripts/_m2b-sculpt-audit.mjs`，96×72 seed 616161、笔刷 r=8）：
//      · 单笔 raise（190 格）⇒ canonical 重算翻出 **16 格 type / 13 格 qi** 差异
//        （最大 |Δqi| 1.6e-1）；
//      · 一整笔拖动（18 次落笔 / 3260 格次）⇒ **173 格 / 166 格**；
//      · 对照组 `sim/powers.js` 的 canonical sculpt 再重算 ⇒ **0 格**差异
//        （证明重算幂等、差异确实来自「漏调」）。
//
//    ⚠️ 修复纪律（§16）：复用 `world/terrain.js` 的 canonical API（`recomputeRect`，
//    它自己会带 1 格外扩修正坡度并 `world.touch()`）；**不复制**地形分类公式、
//    **不新增 RNG**、**不改 Canvas 规则**、**不改三界概率**、**不改 save schema**。
//
// ⚠️ 表现层纪律（P4）：这里写 `world.height` 是**玩家主动雕刻**这一个动作本身，
//    不是把视觉参数反写模拟。Render3D 的任何 datum / relief / shoulder / wallHeight
//    都**不得**经由此处回流（那属于 S5 的停止条件）。
export function sculpt(world, { x, y, radius = 6, strength = 0.035, mode = 'raise', targetHeight, syncWater = false, accessBounds = null, deferCanonical = false, beforeChange = null }) {
  if (![x, y, radius, strength].every(Number.isFinite) || radius <= 0 || strength < 0) throw new Error('Invalid brush');
  if (!['raise', 'lower', 'flatten', 'smooth', 'ridge', 'basin'].includes(mode)) throw new Error('Unknown sculpt mode');
  if (mode === 'flatten' && !Number.isFinite(targetHeight)) throw new Error('Flatten requires a stroke target');
  const x0 = Math.max(0, Math.ceil(x - radius)), x1 = Math.min(world.w - 1, Math.floor(x + radius));
  const y0 = Math.max(0, Math.ceil(y - radius)), y1 = Math.min(world.h - 1, Math.floor(y + radius));
  const changes = [];
  for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
    const distance = Math.hypot(cx - x, cy - y);
    if (distance >= radius || !brushAccess(accessBounds,cx,cy)) continue;
    const i = cy * world.w + cx, old = world.height[i];
    const falloff = (1 - (distance / radius) ** 2) ** 2;
    let next;
    if (mode === 'raise' || mode === 'lower' || mode === 'ridge' || mode === 'basin') next = old + (mode === 'raise' || mode === 'ridge' ? 1 : -1) * strength * falloff;
    else {
      let target = targetHeight;
      if (mode === 'smooth') {
        let sum = 0, count = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const nx = cx + dx, ny = cy + dy;
          if (nx >= 0 && nx < world.w && ny >= 0 && ny < world.h) { sum += world.height[ny * world.w + nx]; count++; }
        }
        target = sum / count;
      }
      next = old + (target - old) * Math.min(1, strength * 8 * falloff);
    }
    next = Math.fround(Math.max(0, Math.min(1, next)));
    if (next !== old) changes.push([i, next, old]);
  }
  for (const [i, value, old] of changes) {
    beforeChange?.(i,old,world.water?.[i] ?? 0,world.riverBase?.[i] ?? 0);
    if(syncWater && world.water){
      const depth=world.water[i],surface=old+depth;
      world.water[i]=Math.max(value<SEA_LEVEL?SEA_LEVEL-value:0,depth>0?surface-value:0,0);
      // River sources otherwise immediately refill a raised channel in maintainRivers().
      if(world.riverBase && value>old && value>=surface && value>=SEA_LEVEL)world.riverBase[i]=0;
    }
    world.height[i] = value;
  }
  if (!changes.length) return null;
  // canonical 派生量重算：type / qi 必须跟着新高度走（含 world.touch()）。
  if(!deferCanonical)recomputeRect(world, x0, y0, x1, y1);
  return { x0, y0, x1, y1, count: changes.length, changes };
}

/**
 * Undo 的高度还原。
 *
 * ⚠️ 它同样住在「唯一的 render3d 世界写边界」里，理由与 `sculpt` 相同（§16 明确要求
 *    「undo 后派生量也正确恢复」）。实测：只还原高度而不重算，会留下 23 格 type /
 *    20 格 qi 的失真；补一次 canonical 重算即可完全复原——所以这不是玩法问题，
 *    就是漏调 canonical API。
 *
 * @param {object} world
 * @param {Array<[number, number]>} changes `[格索引, 原高度]`（`Render3DAdapter` 的撤销栈）
 * @returns {{x0:number,y0:number,x1:number,y1:number,count:number}|null} 受影响矩形
 */
export function restoreHeights(world, changes) {
  if (!Array.isArray(changes) || changes.length === 0) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [i, value] of changes) {
    world.height[i] = value;
    const x = i % world.w, y = (i - x) / world.w;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  recomputeRect(world, x0, y0, x1, y1);
  return { x0, y0, x1, y1, count: changes.length };
}

export function strokeSamples(from, to, radius) {
  const count = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / Math.max(0.5, radius * 0.25)));
  return Array.from({ length: count }, (_, i) => ({ x: from.x + (to.x - from.x) * (i + 1) / count, y: from.y + (to.y - from.y) * (i + 1) / count }));
}

function brushAccess(bounds,x,y){
  return !bounds || (typeof bounds==='function'?bounds(x,y):x>=bounds.x0&&y>=bounds.y0&&x<=bounds.x1&&y<=bounds.y1);
}
function mergeBrushRegion(a,b){
  if(!a)return b?{x0:b.x0,y0:b.y0,x1:b.x1,y1:b.y1}:null;
  if(!b)return a;
  return {x0:Math.min(a.x0,b.x0),y0:Math.min(a.y0,b.y0),x1:Math.max(a.x1,b.x1),y1:Math.max(a.y1,b.y1)};
}
/** A session-only edit transaction; simulation advances must not interleave its commands. */
export class TerrainStroke {
  constructor(world,firstPoint,options={}){
    if(!firstPoint || ![firstPoint.x,firstPoint.y].every(Number.isFinite))throw new Error('Invalid stroke point');
    this.world=world;this.plane='mortal';this.before=new Map();this.region=null;this.pending=null;this.closed=false;
    this.options={radius:6,strength:.035,mode:'raise',syncWater:true,...options};
    const x=Math.max(0,Math.min(world.w-1,Math.round(firstPoint.x))),y=Math.max(0,Math.min(world.h-1,Math.round(firstPoint.y)));
    if(this.options.mode==='flatten')this.options.targetHeight=Number.isFinite(options.targetHeight)?options.targetHeight:world.height[y*world.w+x];
    this.spacing=Math.max(.5,this.options.radius*.25);this.remainder=0;
    this.last={x:firstPoint.x,y:firstPoint.y};this.lastStamp=this.last;this.stats={stamps:0,canonicalFlushes:0};
    this.stamp(firstPoint);
  }
  stamp(point){
    const region=sculpt(this.world,{...this.options,...point,deferCanonical:true,
      beforeChange:(i,h,w,r)=>{if(!this.before.has(i))this.before.set(i,[h,w,r]);}});
    this.stats.stamps++;this.lastStamp={x:point.x,y:point.y};
    this.region=mergeBrushRegion(this.region,region);this.pending=mergeBrushRegion(this.pending,region);
  }
  sample(point){
    if(this.closed)return false;
    if(!point || ![point.x,point.y].every(Number.isFinite))return false;
    if(!this.last){this.resume(point);return true;}
    const from=this.last,dx=point.x-from.x,dy=point.y-from.y,length=Math.hypot(dx,dy);
    if(length<1e-10)return false;
    let distance=this.spacing-this.remainder;
    while(distance<=length+1e-10){
      const f=Math.min(1,distance/length);
      // Quantize only the input trajectory to remove floating summation drift across pointer-event segments.
      this.stamp({x:Math.round((from.x+dx*f)*1e9)/1e9,y:Math.round((from.y+dy*f)*1e9)/1e9});
      distance+=this.spacing;
    }
    this.remainder=(this.remainder+length)%this.spacing;
    if(this.remainder<1e-9||this.spacing-this.remainder<1e-9)this.remainder=0;
    this.last={x:point.x,y:point.y};return true;
  }
  breakPath(){this.last=null;this.remainder=0;}
  resume(point){this.last={x:point.x,y:point.y};this.remainder=0;this.stamp(point);}
  flush(){
    if(!this.pending)return null;
    const region=this.pending;this.pending=null;
    recomputeRect(this.world,region.x0,region.y0,region.x1,region.y1);this.stats.canonicalFlushes++;return region;
  }
  finish(){
    if(this.closed)return this.result;
    if(this.last&&Math.hypot(this.last.x-this.lastStamp.x,this.last.y-this.lastStamp.y)>1e-9)this.stamp(this.last);
    this.flush();this.closed=true;
    const records=[];
    for(const [i,before] of this.before){const after=[this.world.height[i],this.world.water?.[i]??0,this.world.riverBase?.[i]??0];
      if(before.some((v,k)=>v!==after[k]))records.push([i,...before,...after]);}
    this.result=records.length?{plane:'mortal',world:this.world,region:this.region,records,
      changes:records.map(([i,h])=>[i,h]),bytes:records.length*128,stats:{...this.stats,cells:records.length}}:null;
    return this.result;
  }
}
/** Undo and redo restore all mutable stamp channels before one canonical rebuild. */
export function restoreTerrainStroke(world,entry,side='before'){
  if(entry?.world!==world || !entry.records?.length)return null;
  const offset=side==='after'?4:1,expected=side==='after'?1:4;
  // Validate every touched cell before any write: later simulation owns its new values.
  for(const record of entry.records){const i=record[0];
    if(world.height[i]!==record[expected] || (world.water?.[i]??0)!==record[expected+1]
      || (world.riverBase?.[i]??0)!==record[expected+2])return null;
  }
  for(const record of entry.records){const i=record[0];world.height[i]=record[offset];
    if(world.water)world.water[i]=record[offset+1];if(world.riverBase)world.riverBase[i]=record[offset+2];}
  const r=entry.region;recomputeRect(world,r.x0,r.y0,r.x1,r.y1);return {...r,count:entry.records.length};
}
