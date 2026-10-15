export const cultivator = {
  schemaVersion: 1,
  identity: { key: "mortal:123", id: 123, plane: "mortal", status: "alive",
    name: "林照溪", canFocus: true },
  header: { realm: "炼气四层", ageText: "23 岁", affiliation: "青云门", stateText: "山中修炼" },
  cultivation: { exp: 80, required: 128, percent: 62.5, rateText: "每日修为 0.2",
    stateText: "积累修为" },
  overview: [{ label: "灵根", value: "木灵根" }, { label: "道途", value: "剑道" }],
  cultivationRows: [{ label: "气运", value: "62" }, { label: "功法", value: "青霄经" }],
  history: [{ day: 720, kind: "sect", text: "拜入青云门" }],
  relations: [{ label: "所属宗门", value: "青云门" }],
  edicts: [
    { id: "cultivation", title: "灌顶", description: "增加真实修为", enabled: true, disabledReason: "" },
    { id: "luck", title: "拨运", description: "扰动此人气运", enabled: false, disabledReason: "敕令尚未开放" },
  ],
  watched: false,
};

export const creationFixture = {
  seed: "602412", terrainName: "群山水泽", mapSize: { width: 384, height: 240 },
  gradualAccess: true, openedRangeText: "凡界西南 · 已开放四成",
};
export const progressionFixture = {
  stage: 40, openedPercent: 40, boundaryText: "天眼初开",
  canRequestExpand: true, disabledReason: "",
};

export const fixtureVariants = {
  mortal: { ...cultivator, identity: { ...cultivator.identity, key: "mortal:2", name: "许子桑" },
    header: { realm: "凡人", ageText: "18 岁", stateText: "采药" },
    cultivation: { unawakened: true, stateText: "尚未启灵" }, history: [], edicts: [] },
  dead: { ...cultivator, identity: { ...cultivator.identity, status: "dead", key:"mortal:3", name:"故人林舟" },
    header: { ...cultivator.header, stateText:"已故" } },
  unknown: { ...cultivator, identity: { ...cultivator.identity, key:"mortal:4", status:"unknown",
    name:"<无名氏>" }, relations: [], history: [] },
  full: { ...cultivator, cultivation: { ...cultivator.cultivation, exp:128, percent:100, stateText:"修为已满" } },
};
