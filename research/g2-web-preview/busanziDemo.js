import { createBusanziBridgeView } from "../../src/inkbox/ui/g2/busanzi/busanziBridgeView.js";
export function mountBusanziDemo(root,onAction){
  const view=createBusanziBridgeView(root,{onAction});
  const fixtures=[
    {character:{displayName:"卜算子",state:"井边守候",location:"未载"},
     affinity:{label:"离卦旧识",percent:35},wind:"still",
     dialogue:[{text:"小爷我姓甚名谁？不重要。你叫我卜算子便是。"},
       {text:"话说得玄些，是怕你把这天地看得太简单。"}],
     guide:{available:true,text:"先看山河自己如何演化，再轻轻拨动一道因果。"},
     capabilities:{help:true,taskRequests:false,allowedTaskKinds:[]},tasks:[]},
    {character:{displayName:"卜算子",state:"寻访路上",location:"山南古道"},
     affinity:{label:"共观山河",percent:65},wind:"breeze",
     dialogue:[{text:"风起了。别看，小爷我的脸可比天机难算。"}],
     guide:{available:false},capabilities:{help:true,taskRequests:true,allowedTaskKinds:["investigate-site"],
       targets:{"investigate-site":{kind:"site",id:123}}},
     tasks:[{id:"preview1",title:"调查秘境",state:"traveling",targetLabel:"南山旧洞"},
       {id:"preview2",title:"寻访天才",state:"blocked",targetLabel:"云岭"}]},
  ];
  let index=0;view.render(fixtures[index]);
  return {cycle(){index=(index+1)%fixtures.length;view.render(fixtures[index]);},
    destroy(){view.destroy()}};
}
