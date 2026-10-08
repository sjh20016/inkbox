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
