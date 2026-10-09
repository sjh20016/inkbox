import { createCombatObserverView } from "../../src/inkbox/ui/g2/combat/combatObserverView.js";
export function mountCombatDemo(root,onAction){
  const view=createCombatObserverView(root,{onAction});
  let serial=0;
  function makeEvents(count){
    return Array.from({length:count},(_,i)=>({
      id:"fixture-combat-"+i,type:"attack",title:"交战迹象 · "+(i+1),
      actor:"修士甲",target:"修士乙",timeLabel:"演示事件",plane:i%3===0?"upper":"mortal",
      x:25+i,y:60-i,canObserve:i%4!==0,detail:"临时表现事件，不推断伤亡与胜负。",
    }));
  }
  view.render({enabled:true,focusedCharacter:{name:"示例修士",combatStatus:"unknown"},events:makeEvents(48),
    summary:{text:"仅用于验证 24 条容量和宿主定位回调。"}});
  return {stress(){
    serial++;
    view.render({enabled:true,focusedCharacter:{name:"示例修士",combatStatus:"fighting"},
      events:makeEvents(60+serial),summary:{text:"第 "+serial+" 次模拟高频刷新"}});
  },destroy:()=>view.destroy()};
}
