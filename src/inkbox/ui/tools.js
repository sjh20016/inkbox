// 水墨沙盒 · 神格工具表
//
// 每个工具就是一个「对世界做一件事」的函数，UI 只负责把点击/拖拽翻译成
// apply(ctx) 调用。这样新增一个神力只需要在这里加一条。

import { SPECIES, TERRAIN } from '../core/config.js';
import { OVER } from '../world/terrain.js';
import * as P from '../sim/powers.js';
import * as D from '../sim/divine.js';

const T = (id, name, icon, group, hint, extra) => ({ id, name, icon, group, hint, ...extra });

export const TOOL_GROUPS = Object.freeze([
  { key: 'terrain', label: '山形', color: '#8a6a44' },
  { key: 'water', label: '水土', color: '#3f5f7d' },
  { key: 'nature', label: '生机', color: '#4d6b52' },
  { key: 'disaster', label: '天灾', color: '#a8493c' },
  { key: 'life', label: '生灵', color: '#6b4a6b' },
  { key: 'dao', label: '仙道', color: '#5a4a7a' },
  { key: 'view', label: '观察', color: '#31505f' },
]);

export const TOOLS = Object.freeze([
  // ── 山形 ──────────────────────────────────────────────
  T('raise', '抬山', '⛰', 'terrain', '隆起地脉，反复涂抹可堆出高峰', {
    mode: 'drag', amount: 0.026,
    apply: (c) => P.sculpt(c.world, c.x, c.y, c.radius, c.amount, c.history),
  }),
  T('lower', '沉陆', '🕳', 'terrain', '下陷地层，一直按可以凿出深谷与海盆', {
    mode: 'drag', amount: -0.026,
    apply: (c) => P.sculpt(c.world, c.x, c.y, c.radius, c.amount, c.history),
  }),
  T('flatten', '平整', '▭', 'terrain', '向落点高程看齐，用来修台地、修路、修城基', {
    mode: 'drag', amount: 0.16,
    apply: (c) => P.flatten(c.world, c.x, c.y, c.radius, c.amount, c.history),
  }),
  T('roughen', '皴石', '⋀', 'terrain', '叠加山石噪声，让坡面出现岩石肌理', {
    mode: 'drag', amount: 0.02,
    apply: (c) => P.roughen(c.world, c.x, c.y, c.radius, c.amount, c.history),
  }),

  // ── 水土 ──────────────────────────────────────────────
  T('water', '注水', '💧', 'water', '抬高水面，水会自己流进低洼处汇成湖泽', {
    mode: 'drag', amount: 0.02,
    apply: (c) => P.addWater(c.world, c.x, c.y, c.radius, c.amount, c.history),
  }),
  T('drain', '抽水', '🫗', 'water', '抽走积水，可以把海抽干，露出海床', {
    mode: 'drag', amount: 0.03,
    apply: (c) => P.removeWater(c.world, c.x, c.y, c.radius, c.amount, c.history),
  }),
  T('rain', '甘霖', '🌧', 'water', '降雨灭火、滋润草木，也能救回烧焦的林地', {
    mode: 'drag',
    apply: (c) => P.rain(c.world, c.x, c.y, c.radius, c.history),
  }),

  // ── 生机 ──────────────────────────────────────────────
  T('forest', '植林', '🌲', 'nature', '种出一片林子，鸟兽与人都会来', {
    mode: 'drag', amount: 0.92,
    apply: (c) => P.paintVegetation(c.world, c.x, c.y, c.radius, c.amount, c.history),
  }),
  T('burn', '焚林', '🔥', 'nature', '点着草木，火会自己顺着风势蔓延', {
    mode: 'drag',
    apply: (c) => P.burnForest(c.world, c.x, c.y, c.radius, c.history),
  }),
  T('fertile', '沃野', '🌾', 'nature', '催肥土地，把焦土与荒漠重新养成可耕之地', {
    mode: 'drag',
    apply: (c) => P.fertilize(c.world, c.x, c.y, c.radius, c.history),
  }),
  T('sand', '荒漠', '🏜', 'nature', '沙化地表', {
    mode: 'drag', overlay: OVER.SAND,
    apply: (c) => P.paintOverlay(c.world, c.x, c.y, c.radius, OVER.SAND, c.history),
  }),
  T('snow', '雪原', '❄', 'nature', '覆上积雪', {
    mode: 'drag', overlay: OVER.SNOW,
    apply: (c) => P.paintOverlay(c.world, c.x, c.y, c.radius, OVER.SNOW, c.history),
  }),
  T('lava', '熔岩', '🌋', 'nature', '灌下岩浆，会慢慢冷却成黑石', {
    mode: 'drag',
    apply: (c) => P.pourLava(c.world, c.x, c.y, c.radius, c.history),
  }),
  T('road', '铺径', '═', 'nature', '铺出小路，生灵走得快，聚落更容易连成一片', {
    mode: 'drag',
    apply: (c) => P.paveRoad(c.world, c.x, c.y, c.radius, c.history),
  }),

  // ── 天灾 ──────────────────────────────────────────────
  T('lightning', '雷霆', '⚡', 'disaster', '一击落地：点燃草木，抹掉一圈生灵', {
    mode: 'click',
    apply: (c) => P.lightning(c.world, c.x, c.y, c.history),
  }),
  T('meteor', '陨石', '☄', 'disaster', '砸出环形坑，坑心化为熔岩', {
    mode: 'click',
    apply: (c) => P.meteor(c.world, c.x, c.y, c.radius, c.history),
  }),
  T('quake', '地动', '〰', 'disaster', '地层错动，房屋倒塌成残垣', {
    mode: 'click',
    apply: (c) => P.earthquake(c.world, c.x, c.y, c.radius, c.history),
  }),
  T('flood', '洪水', '🌊', 'disaster', '瞬间淹掉一片低地，城郭尽没', {
    mode: 'click',
    apply: (c) => P.flood(c.world, c.x, c.y, c.radius, c.history),
  }),
  T('plague', '瘟疫', '☠', 'disaster', '无声无息地取走大半生灵', {
    mode: 'click',
    apply: (c) => P.plague(c.world, c.x, c.y, c.radius),
  }),
  // 与上面四个「一下按到底」的即时天灾不同：这一手是**持续过程**——
  // 灾会一天天扣村子的血与粮，几年后才结算「熬过了 / 没能撑过」，
  // 而结局会写进大事记。玩家于是能看见自己那一手**后来**发生了什么。
  // （在此之前 `worldEvents.triggerCrisis` 全库无调用方，玩家没有降灾的手段。）
  T('crisis', '降灾', '🌪', 'disaster', '让一处聚落陷入经年灾祸：撑不撑得住，过几年才见分晓', {
    mode: 'click',
    apply: (c) => P.triggerCrisis(c.world, c.events, c.x, c.y),
  }),

  // ── 生灵 ──────────────────────────────────────────────
  T('human', '凡人', '🧍', 'life', '撒下一群凡人，他们会自己结庐成村', {
    mode: 'click', species: SPECIES.HUMAN, count: 8,
    apply: (c) => P.paintLife(c.life, c.x, c.y, c.radius, SPECIES.HUMAN, 8),
  }),
  T('cultivator', '修士', '🧙', 'life', '引来修士，寿命长、战力高，能立宗建国', {
    mode: 'click', species: SPECIES.CULTIVATOR, count: 5,
    apply: (c) => P.paintLife(c.life, c.x, c.y, c.radius, SPECIES.CULTIVATOR, 5),
  }),
  T('beast', '灵兽', '🐾', 'life', '放出灵兽，它们会猎食凡人', {
    mode: 'click', species: SPECIES.BEAST, count: 6,
    apply: (c) => P.paintLife(c.life, c.x, c.y, c.radius, SPECIES.BEAST, 6),
  }),
  T('spirit', '山精', '🌫', 'life', '点化山精，游荡于林泉之间', {
    mode: 'click', species: SPECIES.SPIRIT, count: 4,
    apply: (c) => P.paintLife(c.life, c.x, c.y, c.radius, SPECIES.SPIRIT, 4),
  }),
  T('erase', '抹除', '⌫', 'life', '范围内生灵消散，村落会因此荒废', {
    mode: 'click',
    apply: (c) => P.eraseLife(c.world, c.x, c.y, c.radius),
  }),

  // ── 仙道 ──────────────────────────────────────────────
  // 这些工具改的不是山水，是修行。世界本来会自己慢慢演化出宗门与飞升，
  // 但那是几百年尺度的事；玩家想当场看点热闹，得有能立刻拨动它的手段。
  T('root', '赐灵根', '❖', 'dao', '点化凡人，当场开灵根、入炼气', {
    mode: 'click',
    apply: (c) => D.grantRoot(c.world, c.x, c.y, c.radius, c.rng),
  }),
  T('leyline', '引灵脉', '≋', 'dao', '凭空引出一道灵脉：灵气厚，宗门会来争', {
    mode: 'click',
    apply: (c) => D.placeLeyline(c.world, c.x, c.y, c.rng),
  }),
  T('secret', '播秘境', '✦', 'dao', '落一处秘境，修士会自己寻来', {
    mode: 'click',
    apply: (c) => D.placeSecret(c.world, c.x, c.y, c.rng),
  }),
  T('cave', '埋洞府', '⌂', 'dao', '埋一处前人遗泽，等后人来取', {
    mode: 'click',
    apply: (c) => D.placeCave(c.world, c.x, c.y, c.rng),
  }),
  T('tribulation', '降天劫', '☈', 'dao', '逼范围内的修士当场冲瓶颈：成则破境，败则倒退', {
    mode: 'click',
    apply: (c) => D.sendTribulation(c.world, c.x, c.y, c.radius, c.rng),
  }),
  T('manual', '传功法', '📜', 'dao', '天授典籍，让此地修士各得一门功法', {
    mode: 'click',
    apply: (c) => D.grantManual(c.world, c.x, c.y, c.radius, c.rng),
  }),
  T('forbidden', '降禁术', '🩸', 'dao', '把禁术塞给此地最强的修士，从此为正道所不容', {
    mode: 'click',
    apply: (c) => D.grantForbidden(c.world, c.x, c.y, c.radius, c.rng),
  }),
  T('ascend', '点化飞升', '☁', 'dao', '把此地境界最高的人送往上界，留洞府于人间', {
    mode: 'click',
    apply: (c) => D.ascendChosen(c.world, c.x, c.y, c.radius, c.rng),
  }),
  T('found', '立宗', '⛩', 'dao', '命附近筑基以上的散修就地开山立派', {
    mode: 'click',
    apply: (c) => D.foundSectAt(c.world, c.x, c.y, c.radius, c.rng),
  }),

  // ── 观察 ──────────────────────────────────────────────
  T('inspect', '检视', '🔍', 'view', '查看一格的山水与人烟，不改动世界', {
    mode: 'click', readonly: true,
    apply: () => 0,
  }),
  // 上界视界：划选一块矩形，从那块地方往里看**另一界**（画中画）。
  //
  // 为什么是第三种 mode（'select'）而不是复用现成的两种：
  //   · 复用 'drag' 会在主循环的限速里被反复调用（每 0.075 秒一次），
  //     而「开一扇视界」是**一次成型的动作**——划完才算，反复调用会不断重开；
  //   · 复用 'click' 只有「一个点 + 半径」，选出来的是圆，不是玩家要的矩形区域。
  // 所以 'select' 的三段逻辑（按下 → 拖动 → 抬起）写在 main.js 的指针事件里。
  //
  // ⚠️ readonly 必须是 false。它不改地形，但会留下副作用（下一阶段：划选的四边
  //    会裂开细缝）。标成 true 会让光标变成 help、提示语也变成「不改动世界」，
  //    玩家就会以为它只是看——而裂缝是实打实的。提示语里已经写明「会裂开细缝」。
  T('viewUpper', '上界视界', '☯', 'view',
    '划选一片山河，自裂缝中窥见上界；视界边缘会裂开细缝', {
      mode: 'select',
      readonly: false,
      // 本轮 apply 只做一件事：把划选矩形交出去（commitSelection）。
      // ⚠️ 矩形是 **UI 状态，不进世界存档**——存档是给「世界」的，不是给「屏幕」的
      //    （规格 §6.2）。所以它不挂 world，走 ctx 上的一次性接收器。
      // ⚠️ 开缝已接在 `main.js` 的 `commitSelection`（pointerup 唯一提交点），
      //    本文件**不需要**知道 `openRifts`——那是一次成型、只能由 pointerup 调一次
      //    的动作，接在提交点天然满足这个约束，也免得工具表反过来依赖主程序。
      apply: (c) => { c.commitSelection(c.rect); return 0; },
    }),
]);

export const TOOL_BY_ID = Object.freeze(
  Object.fromEntries(TOOLS.map((tool) => [tool.id, tool])),
);

/** 工具光标颜色，用来提示这个神力「偏暖还是偏冷」 */
export const TOOL_CURSOR = Object.freeze({
  raise: '#8a6a44',
  lower: '#4a463e',
  flatten: '#b08f3e',
  roughen: '#7d776b',
  water: '#3f5f7d',
  drain: '#31505f',
  rain: '#5d7a72',
  forest: '#4d6b52',
  burn: '#a8493c',
  fertile: '#8a8033',
  sand: '#b8912f',
  snow: '#e9e0cd',
  lava: '#c1573b',
  road: '#a97a52',
  lightning: '#b08f3e',
  meteor: '#a8493c',
  quake: '#8a6a44',
  flood: '#3b5a78',
  plague: '#6b4a6b',
  crisis: '#6b6b7a',
  human: '#3c3830',
  cultivator: '#7a5a3a',
  beast: '#6b6152',
  spirit: '#5d7a72',
  erase: '#9c4a5c',
  root: '#7a5a9a',
  leyline: '#4a8a8a',
  secret: '#8a6ab0',
  cave: '#6a5a7a',
  tribulation: '#8a4a7a',
  manual: '#6a6a9a',
  forbidden: '#9c3a4c',
  ascend: '#7a8ab0',
  found: '#8a7a4a',
  inspect: '#31505f',
  // 比同组的检视稍亮、稍青一点：它同属「看」，但会留下东西（裂缝）
  viewUpper: '#4a7a8a',
});

export { TERRAIN, OVER, SPECIES };
