// 水墨沙盒 · 全局常量、地形定义与水墨调色板
//
// 设计原则：整张世界的底层数据是「高程图 + 水位 + 类型层」，
// 玩家与自然模拟都只改写这些 TypedArray，渲染层再把它画成山水画。

export const APP = Object.freeze({
  id: 'inkbox',
  title: '水墨沙盒',
  subtitle: '坐天观井 · 世界盒子',
  version: '1.0.0',
  saveKey: 'inkbox_sandbox_v1',
});

export const WORLD_PRESETS = Object.freeze({
  small: { key: 'small', w: 200, h: 128, label: '小景 · 200×128' },
  medium: { key: 'medium', w: 288, h: 180, label: '中堂 · 288×180' },
  large: { key: 'large', w: 384, h: 240, label: '长卷 · 384×240' },
  expanse: { key: 'expanse', w: 512, h: 320, label: '广境 · 512×320' },
});

export const SEA_LEVEL = 0.3;

/**
 * 幽冥实体的「永不消散」截止日哨兵。
 * Number.MAX_SAFE_INTEGER 是正的有限整数，远超模拟所用时间，并可精确 JSON 往返。
 */
export const NEVER_DECAY_DAY = Number.MAX_SAFE_INTEGER;

/**
 * 立体视图的抬升比例：1 个高程单位 = 多少格垂直偏移。
 * 按画幅高度取比例（而不是固定像素），这样小景与长卷的立体感一致。
 */
export const RELIEF_RATIO = 0.075;

export function reliefScaleFor(worldHeight) {
  return Math.max(5, Math.round(worldHeight * RELIEF_RATIO));
}

export const TERRAIN = Object.freeze({
  DEEP: 0,
  OCEAN: 1,
  SEA: 2,
  SHALLOW: 3,
  SAND: 4,
  GRASS: 5,
  MEADOW: 6,
  FOREST: 7,
  JUNGLE: 8,
  SAVANNA: 9,
  DESERT: 10,
  TUNDRA: 11,
  SWAMP: 12,
  ROCK: 13,
  MOUNTAIN: 14,
  PEAK: 15,
  SNOW: 16,
  FARMLAND: 17,
  SCORCHED: 18,
  ASH: 19,
  LAVA: 20,
  RUINS: 21,
  ROAD: 22,
});

// water: 是否算水域；fertility: 生灵可耕作程度；walk: 小人能否行走；build: 能否建屋
export const TERRAIN_INFO = Object.freeze([
  { key: 'DEEP', name: '渊', color: [66, 80, 92], water: true, fertility: 0, walk: false, build: false },
  { key: 'OCEAN', name: '海', color: [88, 102, 113], water: true, fertility: 0, walk: false, build: false },
  { key: 'SEA', name: '泽', color: [116, 128, 137], water: true, fertility: 0, walk: false, build: false },
  { key: 'SHALLOW', name: '浅滩', color: [152, 162, 167], water: true, fertility: 0.05, walk: false, build: false },
  { key: 'SAND', name: '汀', color: [214, 205, 178], water: false, fertility: 0.18, walk: true, build: true },
  { key: 'GRASS', name: '草原', color: [160, 168, 132], water: false, fertility: 0.72, walk: true, build: true },
  { key: 'MEADOW', name: '芳甸', color: [176, 182, 146], water: false, fertility: 0.85, walk: true, build: true },
  { key: 'FOREST', name: '林', color: [104, 126, 96], water: false, fertility: 0.7, walk: true, build: true },
  { key: 'JUNGLE', name: '密林', color: [68, 92, 70], water: false, fertility: 0.66, walk: true, build: true },
  { key: 'SAVANNA', name: '疏林', color: [189, 178, 130], water: false, fertility: 0.42, walk: true, build: true },
  { key: 'DESERT', name: '荒漠', color: [222, 178, 116], water: false, fertility: 0.05, walk: true, build: true },
  { key: 'TUNDRA', name: '冻原', color: [198, 195, 178], water: false, fertility: 0.12, walk: true, build: true },
  { key: 'SWAMP', name: '泽薮', color: [116, 121, 94], water: false, fertility: 0.4, walk: true, build: false },
  { key: 'ROCK', name: '石', color: [152, 147, 136], water: false, fertility: 0.05, walk: true, build: false },
  { key: 'MOUNTAIN', name: '山', color: [124, 120, 111], water: false, fertility: 0, walk: false, build: false },
  { key: 'PEAK', name: '峻岭', color: [102, 99, 92], water: false, fertility: 0, walk: false, build: false },
  { key: 'SNOW', name: '雪峰', color: [240, 236, 224], water: false, fertility: 0, walk: false, build: false },
  { key: 'FARMLAND', name: '田', color: [201, 184, 120], water: false, fertility: 1, walk: true, build: false },
  { key: 'SCORCHED', name: '焦土', color: [75, 65, 55], water: false, fertility: 0.02, walk: true, build: true },
  { key: 'ASH', name: '烬', color: [88, 84, 78], water: false, fertility: 0.15, walk: true, build: true },
  { key: 'LAVA', name: '熔岩', color: [193, 87, 59], water: false, fertility: 0, walk: false, build: false },
  { key: 'RUINS', name: '废墟', color: [142, 135, 120], water: false, fertility: 0.25, walk: true, build: true },
  { key: 'ROAD', name: '径', color: [188, 174, 144], water: false, fertility: 0.3, walk: true, build: false },
]);

/** 建筑层（与地形分离，便于自由改地形时保留聚落痕迹） */
export const STRUCT = Object.freeze({
  NONE: 0,
  HOUSE: 1,
  HALL: 2,
  WALL: 3,
  TOWER: 4,
  RUIN: 5,
});

export const STRUCT_INFO = Object.freeze([
  { key: 'NONE', name: '' },
  { key: 'HOUSE', name: '屋舍' },
  { key: 'HALL', name: '宗祠' },
  { key: 'WALL', name: '垣墙' },
  { key: 'TOWER', name: '望楼' },
  { key: 'RUIN', name: '残垣' },
]);

/** 水墨调色板：以宣纸、松烟墨、花青、赭石、朱砂为主 */
export const INK = Object.freeze({
  paper: '#e9e0cd',
  paperDeep: '#d9cdb4',
  paperShade: '#c6b89e',
  mist: '#f4efe2',
  ink: '#22201c',
  inkMid: '#4a463e',
  inkLight: '#7d776b',
  cinnabar: '#a8493c',
  azurite: '#3f5f7d',
  ochre: '#8a6a44',
  malachite: '#4d6b52',
  gold: '#b08f3e',
  pineGreen: '#3f5a45',
  orchid: '#6b4a6b',
  rouge: '#9c4a5c',
  indigo: '#31505f',
  clay: '#a97a52',
});

/** 势力配色（同样走低饱和水墨路线） */
export const FACTION_COLORS = Object.freeze([
  { name: '朱明', color: '#a8493c', accent: '#d98a72' },
  { name: '靛蓝', color: '#3b5a78', accent: '#7ea3c2' },
  { name: '藤黄', color: '#b8912f', accent: '#ddc271' },
  { name: '松绿', color: '#4a6b52', accent: '#8fae90' },
  { name: '紫檀', color: '#6b4a6b', accent: '#a882a8' },
  { name: '赭石', color: '#8a6a4a', accent: '#bf9c74' },
  { name: '墨青', color: '#35505a', accent: '#7a9aa5' },
  { name: '胭脂', color: '#9c4a5c', accent: '#cf8494' },
  { name: '苍碧', color: '#4a7a76', accent: '#8dbbb4' },
  { name: '秋香', color: '#8a8033', accent: '#c0b667' },
]);

/** 生灵种类 */
export const SPECIES = Object.freeze({
  HUMAN: 'human',
  CULTIVATOR: 'cultivator',
  BEAST: 'beast',
  SPIRIT: 'spirit',
  // 幽冥鬼魂 / 鬼修（契约 reports/d5/BATCH2-DESIGN.md §七）。
  // ⚠️ 必须显式登记：`render/unitsLayer.js` 的 `SPECIES_INFO[e.sp] || SPECIES_INFO.human`
  //    与 `SPRITES[species] || SPRITES[SPECIES.HUMAN]` 两处兜底会让**未注册的 sp
  //    静默长成凡人**——不报错、不崩溃，只是幽冥里的鬼看起来全是活人。
  GHOST: 'ghost',
});

export const SPECIES_INFO = Object.freeze({
  human: { name: '凡人', speed: 1.0, hp: 100, lifespan: 4200, power: 1, diet: 1, canBuild: true, color: '#3c3830' },
  cultivator: { name: '修士', speed: 1.25, hp: 220, lifespan: 9000, power: 4, diet: 0.6, canBuild: true, color: '#7a5a3a' },
  beast: { name: '灵兽', speed: 0.85, hp: 150, lifespan: 6000, power: 3, diet: 0, canBuild: false, color: '#6b6152' },
  spirit: { name: '山精', speed: 0.7, hp: 80, lifespan: 12000, power: 2, diet: 0, canBuild: false, color: '#5d7a72' },
  // 鬼魂（普通鬼魂与鬼修共用这一档；鬼修靠 `level > 0` 另叠束带/灵光，零渲染改动）。
  //   · `lifespan` 取得极大（≈278 年）是**刻意**的：鬼魂的消散由 `ghostDecayDay`
  //     控制（契约 §六 第 2 条），**不走**凡间那套 `age >= lifespan`。若给一个正常
  //     寿元，鬼魂会按凡间规则被误判寿终、从幽冥里被清掉，而那条路径**不报错**。
  //   · `diet: 0` / `canBuild: false`：幽冥不跑凡间的繁衍与建造，鬼魂不吃口粮、不起屋。
  //   · `speed` 比凡人慢（幽魂飘忽）、`hp` 偏低（契约 §六 有消散与逐出两重淘汰）。
  //   · `color` 取幽墨冷灰蓝，与凡人的暖墨（#3c3830）一眼可分。
  ghost: { name: '鬼魂', speed: 0.5, hp: 60, lifespan: 100000, power: 1, diet: 0, canBuild: false, color: '#4a4f5c' },
});

/** 时间：1 游戏年 = 360 天；每个 tick 推进的天数由倍速决定 */
export const TIME = Object.freeze({
  daysPerYear: 360,
  speeds: [
    { key: 'pause', label: '停', mult: 0 },
    { key: 'x1', label: '缓', mult: 1 },
    { key: 'x2', label: '常', mult: 2 },
    { key: 'x4', label: '疾', mult: 4 },
    { key: 'x8', label: '迅', mult: 8 },
    { key: 'x20', label: '飞', mult: 20 },
  ],
  /** 每秒推进的游戏天数（倍速 1 时） */
  baseDaysPerSecond: 3,
});

export const LIMITS = Object.freeze({
  maxEntities: 3000,
  maxVillages: 220,
  maxFactions: 10,
  brushSizes: [1, 2, 4, 7, 12, 20, 32],
  defaultBrush: 4,
  maxUndo: 24,
  minZoom: 1,
  maxZoom: 14,
});
