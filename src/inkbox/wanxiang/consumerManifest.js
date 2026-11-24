// Executable consumer references, checked by inkbox-wx-c-effects.mjs.
export const WX_C_CONSUMERS=Object.freeze([
 {entryId:'hex_34',axis:'physical_power',callsite:'wanxiang/skills.js#chooseSkillAction',testId:'wx-c-effects:34',status:'B',limitations:'Equipped physical skill; ordinary fallback attacks unchanged'},
 {entryId:'hex_43',axis:'physical_power',callsite:'wanxiang/skills.js#chooseSkillAction',testId:'wx-c-effects:43',status:'B',limitations:'Equipped physical skill; target HP strictly below 30 percent'},
 {entryId:'hex_60',axis:'spell_cost',callsite:'wanxiang/skills.js#chooseSkillAction',testId:'wx-c-effects:60',status:'B',limitations:'Every equipped skill actual mana payment (spell, physical, healing); no resource refund'}
]);

export const WX_D_CONSUMERS=Object.freeze([
 {entryId:'hex_07',axis:'aidIntent',callsite:'sim/daoActivities.js#socialTarget',condition:'social_sect_aid',status:'B'},
 {entryId:'hex_13',axis:'aidIntent',callsite:'sim/daoActivities.js#socialTarget',condition:'social_mentor_aid',status:'B'},
 {entryId:'hex_19',axis:'aidIntent',callsite:'sim/daoActivities.js#socialTarget',condition:'social_junior_aid',status:'B'}
]);
