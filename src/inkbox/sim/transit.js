import { isAdult, isLivingHuman, isMortalHuman } from '../core/demographics.js';
import { canFly, planTransitRoute, transitGeographyStats, transitGeographyVersion } from '../world/transitGeography.js';
import { ACTIVE, activeJourneyForEntity } from '../world/transitState.js';
import { yieldDaoActivityToTransit } from './daoActivities.js';

export const TRANSIT_LIMITS = Object.freeze({active:12,terminal:24,foodReserve:50,boatFood:24,
  dispatchDays:30,dispatchBoats:2,dispatchPlans:4,waterTilesPerDay:1,airTilesPerDay:5});
const routes = new WeakMap();
const failedPlans = new WeakMap();
const emptyDispatchMonth = new WeakMap();
const live = j => ACTIVE.includes(j.status);
const byId = (world,id) => world?.transit?.journeys?.find(j => j.id === id);
const village = (world,id) => world.villageById?.(id) || world.villages?.find(v => v.id === id);
const entity = (world,id) => world.entities?.find(e => e.id === id);
const validVillage = v => !!v && !Number.isFinite(v.destroyedDay) && (v.hp ?? 100) > 0;
const tile = (world,p) => Math.floor(p.y) * world.w + Math.floor(p.x);
const safeLand = (world,p) => p.x >= 1 && p.y >= 1 && p.x < world.w-1 && p.y < world.h-1
  && world.isWalkable(tile(world,p)) && world.struct[tile(world,p)] !== 3;
const center = v => ({x:v.x+0.5,y:v.y+0.5});
function state(world) {
  return world.transit ||= {v:1,nextId:1,dispatchDay:Math.floor(world.day/30)*30,
    ledger:{loaded:0,delivered:0,lost:0,returned:0},journeys:[]};
}
function routeMap(world) { let map=routes.get(world); if(!map){map=new Map();routes.set(world,map);} return map; }
function failureMap(world) { let map=failedPlans.get(world); if(!map){map=new Map();failedPlans.set(world,map);} return map; }
function trim(s) {
  const terminal=s.journeys.filter(j=>!live(j));
  if(terminal.length>TRANSIT_LIMITS.terminal) {
    const discard=new Set(terminal.slice(0,terminal.length-TRANSIT_LIMITS.terminal).map(j=>j.id));
    s.journeys=s.journeys.filter(j=>!discard.has(j.id));
  }
}
function coordinates(route) {
  const out=[];
  for(const leg of route.legs) for(const p of leg.points) {
    const q={x:p.x+0.5,y:p.y+0.5,mode:leg.mode};
    if(!out.length || out.at(-1).x!==q.x || out.at(-1).y!==q.y) out.push(q);
  }
  return out;
}
function pathLength(points) {
  let d=0;for(let i=1;i<points.length;i++)d+=Math.hypot(points[i].x-points[i-1].x,points[i].y-points[i-1].y);
  return d;
}
function cacheRoute(world,j,route) {
  const points=coordinates(route);
  if(!points.length) return {ok:false,reason:'empty_route'};
  const first={...j.position,mode:j.legMode};
  if(Math.hypot(points[0].x-first.x,points[0].y-first.y)>0.01) points.unshift(first);
  const distance=pathLength(points);
  const stats=transitGeographyStats(world);
  routeMap(world).set(j.id,{points,cursor:0,distance,builds:stats.builds});
  j.distance=distance;j.progress=0;
  j.etaDay=world.day+distance/(j.mode==='air'?TRANSIT_LIMITS.airTilesPerDay:TRANSIT_LIMITS.waterTilesPerDay);
  return {ok:true};
}
function plan(world,j,actor) {
  const target=village(world,j.toVillageId);
  if(!validVillage(target)) return {ok:false,reason:'destination_lost'};
  if(j.kind==='cargo' && !j.goal.sourceReached) {
    const source=village(world,j.fromVillageId);
    if(!validVillage(source))return {ok:false,reason:'source_lost'};
    const access=planTransitRoute(world,j.position,center(source),{mode:'land'});
    if(!access.ok)return access;
    const sailing=planTransitRoute(world,center(source),center(target),{mode:'water',actor});
    if(!sailing.ok)return sailing;
    return cacheRoute(world,j,{...sailing,legs:[...access.legs,...sailing.legs]});
  }
  const from={...j.position,atSea:j.legMode==='water'};
  const route=planTransitRoute(world,from,center(target),{mode:j.mode,actor});
  return route.ok?cacheRoute(world,j,route):route;
}
function finish(world,j,status,reason) {
  const s=state(world),food=j.cargo.food;
  if(food) {
    if(status==='arrived') {
      const target=village(world,j.toVillageId);
      if(validVillage(target)) {target.food+=food;s.ledger.delivered+=food;}
      else {s.ledger.lost+=food;status='lost';reason='destination_lost';}
    } else if(reason==='cancelled_at_source') {
      const source=village(world,j.fromVillageId);
      if(validVillage(source)) {source.food+=food;s.ledger.returned+=food;}
      else s.ledger.lost+=food;
    } else s.ledger.lost+=food;
    j.cargo.food=0;
  }
  j.status=status;j.reason=reason;j.updatedDay=world.day;
  routeMap(world).delete(j.id);failureMap(world).delete(j.id);trim(s);
}
function eligibleCargoActors(world,from,actorId) {
  const people=actorId==null?world.entities.filter(e=>e.village===from.id).sort((a,b)=>a.id-b.id):[entity(world,actorId)];
  return people.filter(e=>e && e.village===from.id && isLivingHuman(e) && isMortalHuman(e)
    && isAdult(e) && !activeJourneyForEntity(world,e.id)
    && Math.hypot(e.x-from.x,e.y-from.y)<=16)
    .sort((a,b)=>Math.hypot(a.x-from.x,a.y-from.y)-Math.hypot(b.x-from.x,b.y-from.y)||a.id-b.id);
}
function begin(world,{kind,mode,actor,from,to,food=0,route}) {
  const s=state(world);
  const j={id:s.nextId++,kind,mode,status:'active',reason:null,actorId:actor.id,
    vehicleId:kind==='cargo'?`boat-${s.nextId-1}`:null,fromVillageId:from.id,toVillageId:to.id,
    cargo:{food,amount:food},position:{x:actor.x,y:actor.y},departDay:world.day,updatedDay:world.day,
    etaDay:world.day+route.distance/(mode==='air'?TRANSIT_LIMITS.airTilesPerDay:TRANSIT_LIMITS.waterTilesPerDay),
    goal:{villageId:to.id,cancelRequested:false,
      sourceReached:kind!=='cargo'||Math.hypot(actor.x-from.x-0.5,actor.y-from.y-0.5)<0.01},
    progress:0,distance:route.distance,legMode:'land'};
  s.journeys.push(j);
  yieldDaoActivityToTransit(world,actor.id);
  if(food) {from.food-=food;s.ledger.loaded+=food;}
  cacheRoute(world,j,route);
  return {ok:true,journey:j};
}
function requestCargoCore(world,{fromVillageId,toVillageId,actorId,food,mode='water'}={},budget=null) {
  if(mode!=='water') return {ok:false,reason:'unsupported_mode'};
  const from=village(world,fromVillageId),to=village(world,toVillageId);
  if(!validVillage(from)||!validVillage(to)||from.id===to.id) return {ok:false,reason:'invalid_village'};
  if((world.transit?.journeys.filter(live).length||0)>=TRANSIT_LIMITS.active) return {ok:false,reason:'capacity'};
  const actors=eligibleCargoActors(world,from,actorId);
  if(!actors.length) return {ok:false,reason:'no_sailor'};
  const amount=food==null?Math.min(12,Math.floor(from.food-TRANSIT_LIMITS.foodReserve)) : food;
  if(!Number.isSafeInteger(amount)||amount<=0||amount>TRANSIT_LIMITS.boatFood
    ||from.food-amount<TRANSIT_LIMITS.foodReserve) return {ok:false,reason:'insufficient_food'};
  let access=null,actor=null;
  for(const candidate of actors) {
    if(budget && budget.remaining<=0)return {ok:false,reason:'route_budget'};
    if(budget)budget.remaining--;
    const route=planTransitRoute(world,{x:candidate.x,y:candidate.y},center(from),{mode:'land'});
    if(route.ok) {access=route;actor=candidate;break;}
  }
  if(!actor)return {ok:false,reason:'no_source_access'};
  if(budget && budget.remaining<=0)return {ok:false,reason:'route_budget'};
  if(budget)budget.remaining--;
  const sailing=planTransitRoute(world,center(from),center(to),{mode,actor});
  if(!sailing.ok) return {ok:false,reason:sailing.reason};
  const route={...sailing,legs:[...access.legs,...sailing.legs],distance:access.distance+sailing.distance};
  return begin(world,{kind:'cargo',mode,actor,from,to,food:amount,route});
}
export function requestCargoJourney(world,options={}) {return requestCargoCore(world,options);}
export function requestPersonJourney(world,{actorId,toVillageId,mode='air'}={}) {
  if(mode!=='air') return {ok:false,reason:'unsupported_mode'};
  const actor=entity(world,actorId),to=village(world,toVillageId);
  if(!actor||!canFly(actor)||!isLivingHuman(actor)||!validVillage(to))
    return {ok:false,reason:'invalid_person_or_village'};
  if(activeJourneyForEntity(world,actorId)) return {ok:false,reason:'already_travelling'};
  if(Math.hypot(actor.x-to.x-0.5,actor.y-to.y-0.5)<1)
    return {ok:false,reason:'already_at_destination'};
  const from=world.villages.filter(validVillage).slice()
    .sort((a,b)=>Math.hypot(actor.x-a.x-0.5,actor.y-a.y-0.5)
      -Math.hypot(actor.x-b.x-0.5,actor.y-b.y-0.5)||a.id-b.id)[0];
  if((world.transit?.journeys.filter(live).length||0)>=TRANSIT_LIMITS.active)return {ok:false,reason:'capacity'};
  const route=planTransitRoute(world,{x:actor.x,y:actor.y},center(to),{mode,actor});
  if(!route.ok) return {ok:false,reason:route.reason};
  return begin(world,{kind:'person',mode,actor,from,to,route});
}
function advanceAlong(world,j,actor,elapsed) {
  const cache=routeMap(world).get(j.id),points=cache.points;
  let distance=elapsed*(j.mode==='air'?TRANSIT_LIMITS.airTilesPerDay:TRANSIT_LIMITS.waterTilesPerDay);
  while(distance>0 && cache.cursor<points.length-1) {
    const next=points[cache.cursor+1],step=Math.hypot(next.x-j.position.x,next.y-j.position.y);
    if(step<=distance+1e-9) {
      j.position={x:next.x,y:next.y};j.legMode=next.mode;cache.cursor++;j.progress+=step;distance-=step;
    } else {
      const t=distance/step;
      j.position={x:j.position.x+(next.x-j.position.x)*t,y:j.position.y+(next.y-j.position.y)*t};
      j.legMode=next.mode;j.progress+=distance;distance=0;
    }
    if(j.kind==='cargo'&&!j.goal.sourceReached) {
      const source=village(world,j.fromVillageId);
      if(source&&Math.hypot(j.position.x-source.x-0.5,j.position.y-source.y-0.5)<0.01)
        j.goal.sourceReached=true;
    }
  }
  actor.x=j.position.x;actor.y=j.position.y;
  return cache.cursor>=points.length-1;
}
export function stepTransit(world) {
  let s=world.transit;let changed=false,arrived=0,blocked=0;
  for(const j of (s?.journeys||[]).slice()) {
    if(!live(j))continue;
    const actor=entity(world,j.actorId);
    if(!actor||!isLivingHuman(actor)) {finish(world,j,'lost','actor_dead');changed=true;continue;}
    if(j.kind==='person'&&!canFly(actor)) {
      if(!safeLand(world,j.position)) actor.hp=0;
      finish(world,j,'lost','flight_lost');changed=true;continue;
    }
    if(!validVillage(village(world,j.toVillageId))) {
      // There is no legal landing destination. Ending the journey at sea or in
      // midair must not let the ground AI teleport the passenger next tick.
      if(!safeLand(world,j.position)) {actor.hp=0;actor.diedOf='lost';}
      finish(world,j,'lost','destination_lost');changed=true;continue;
    }
    if(j.kind==='cargo'&&!j.goal.sourceReached&&!validVillage(village(world,j.fromVillageId))) {
      if(!safeLand(world,j.position)) {actor.hp=0;actor.diedOf='lost';}
      finish(world,j,'lost','source_lost');changed=true;continue;
    }
    if(j.kind==='cargo'&&!j.vehicleId) {finish(world,j,'lost','vehicle_lost');changed=true;continue;}
    const stats=transitGeographyStats(world),cache=routeMap(world).get(j.id);
    if(!cache||stats.dirty||cache.builds!==stats.builds||j.status==='blocked') {
      const failed=failureMap(world).get(j.id),version=transitGeographyVersion(world);
      if(j.status==='blocked' && failed && failed.version===version && world.day<failed.retryDay) {
        blocked++;continue;
      }
      const result=plan(world,j,actor);
      if(!result.ok) {
        failureMap(world).set(j.id,{version:transitGeographyVersion(world),retryDay:world.day+1});
        if(j.status!=='blocked'||j.reason!==result.reason)changed=true;
        j.status='blocked';j.reason=result.reason;j.updatedDay=world.day;blocked++;continue;
      }
      failureMap(world).delete(j.id);
      if(j.status==='blocked') j.updatedDay=world.day;
      j.status=j.goal.cancelRequested?'landing':'active';j.reason=null;changed=true;
    }
    const elapsed=Math.max(0,world.day-j.updatedDay);
    if(elapsed<=0)continue;
    const done=advanceAlong(world,j,actor,elapsed);
    j.updatedDay=world.day;changed=true;
    if(done) {
      if(!safeLand(world,j.position)) {j.status='blocked';j.reason='unsafe_landing';blocked++;continue;}
      if(j.goal.cancelRequested) finish(world,j,'cancelled','cancelled_at_destination');
      else finish(world,j,'arrived',null);
      arrived++;
    } else j.etaDay=world.day+Math.max(0,routeMap(world).get(j.id).distance-j.progress)
      /(j.mode==='air'?TRANSIT_LIMITS.airTilesPerDay:TRANSIT_LIMITS.waterTilesPerDay);
  }
  const month=Math.floor(world.day/TRANSIT_LIMITS.dispatchDays);
  const dispatchDue=s ? world.day>=s.dispatchDay+TRANSIT_LIMITS.dispatchDays
    : month>=1 && emptyDispatchMonth.get(world)!==month;
  if(dispatchDue) {
    if(s) {s.dispatchDay=month*TRANSIT_LIMITS.dispatchDays;changed=true;}
    else emptyDispatchMonth.set(world,month);
    const villages=world.villages.filter(validVillage).slice().sort((a,b)=>a.id-b.id);
    let pairs=0,boats=0;const budget={remaining:TRANSIT_LIMITS.dispatchPlans};
    for(const from of villages) {
      if(boats>=TRANSIT_LIMITS.dispatchBoats||pairs>=TRANSIT_LIMITS.dispatchPlans||budget.remaining<=0)break;
      if(from.food<=TRANSIT_LIMITS.foodReserve+8)continue;
      for(const to of villages) {
        if(boats>=TRANSIT_LIMITS.dispatchBoats||pairs>=TRANSIT_LIMITS.dispatchPlans||budget.remaining<=0)break;
        if(to.id===from.id||to.food>=30||s?.journeys.some(j=>live(j)&&j.toVillageId===to.id&&j.kind==='cargo'))continue;
        pairs++;
        if(requestCargoCore(world,{fromVillageId:from.id,toVillageId:to.id},budget).ok) {
          s=world.transit;boats++;changed=true;break;
        }
      }
    }
  }
  return {changed,arrived,blocked};
}
export function cancelJourney(world,id) {
  const j=byId(world,id);if(!j||!live(j))return {ok:false,reason:'not_active'};
  if(j.kind==='cargo'&&!j.goal.sourceReached) {
    const actor=entity(world,j.actorId);
    if(actor&&!safeLand(world,j.position)) {actor.hp=0;actor.diedOf='lost';}
    finish(world,j,'cancelled',validVillage(village(world,j.fromVillageId))
      ?'cancelled_at_source':'source_lost');
    return {ok:true,journey:j};
  }
  if(j.kind==='person'&&!safeLand(world,j.position)) {
    j.goal.cancelRequested=true;j.status='landing';j.reason='cancel_requested';return {ok:true,journey:j};
  }
  if(j.kind==='cargo'&&j.legMode==='water'&&!safeLand(world,j.position)) {
    const actor=entity(world,j.actorId);if(actor){actor.hp=0;actor.diedOf='lost';}
    finish(world,j,'cancelled','abandoned_at_sea');return {ok:true,journey:j};
  }
  const atSource=Math.hypot(j.position.x-village(world,j.fromVillageId)?.x-0.5,
    j.position.y-village(world,j.fromVillageId)?.y-0.5)<2;
  finish(world,j,'cancelled',atSource?'cancelled_at_source':'abandoned_on_land');
  return {ok:true,journey:j};
}
export function destroyJourneyVehicle(world,id) {
  const j=byId(world,id);if(!j||!live(j)||j.kind!=='cargo')return {ok:false,reason:'no_vehicle'};
  const actor=entity(world,j.actorId);
  if(actor&&!safeLand(world,j.position)){actor.hp=0;actor.diedOf='lost';}
  j.vehicleId=null;finish(world,j,'lost','vehicle_destroyed');return {ok:true,journey:j};
}
