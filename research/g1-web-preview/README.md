# G1-W presentation 交接

本目录可通过项目现有开发服务器打开 research/g1-web-preview/index.html。
其中的人物、世界信息来自 fixture.js，仅供预览，**不能代替真实模拟**。

## 原生 ESM 出口

- createCharacterCardView(root, {onAction}) -> {render(viewModel),destroy()}
- createWorldCreationInfoView(root) -> {render(model),destroy()}
- formatWorldCreationInfo(model) -> [{label,value}]
- createWorldProgressView(root,{onAction}) -> {render(model),destroy()}

CSS 独立加载：src/inkbox/ui/g1/presentation/characterCard.css
和 src/inkbox/ui/g1/presentation/worldProgress.css。

人物模型必须是 schemaVersion:1，identity.key 是真实的稳定非空字符串。
render 可连续刷新，人物 key 改变时回到命簿第一页。
概况、修行、生平和敕令均只展示 Codex Runtime 提供的数据，不计算、采样、存储游戏事实。
可选的 cultivation.unawakened:true 与 cultivation.atRealmCap:true 仅展示后端提供的事实。

## 人物动作

- {type:"close",targetKey}：无选中对象时 targetKey 为 null
- {type:"watch",targetKey,watched:boolean}：watched 是拟议的新状态
- {type:"focus",targetKey}
- {type:"export",targetKey}
- {type:"edict",targetKey,edictId}
- {type:"show-relations",targetKey}

focus 需要 alive 与 canFocus===true；edict 需要 alive 与 edicts[].enabled===true。
按钮 disabled 状态只是展示，Codex 在接到请求时仍需重新核对身份和权限。
死亡、飞升、失踪、不可考人物不可施令，仍可导出生平。

## 创世与地图模型

创世: {seed,terrainName,mapSize:{width,height},gradualAccess,openedRangeText}
地图: {stage:40|60|80|100,openedPercent,boundaryText,canRequestExpand,disabledReason}

地图按钮只发出 {type:"request-map-expansion",stage}，
不计算或修改地图许可，也不把阶段中文标题当成解锁条件。

## 检查和正式接线

运行 node scripts/inkbox-g1-web-check.mjs 进行独立组件逻辑检查。
本检查不代表 GPU 或正式游戏浏览器整体验收。

Codex 待办：注入三个模型；引入 CSS；创建容器，管理 destroy 生命周期；
消费并鉴权 onAction；在真实游戏中做视界、人物切换、存档回归。
确认 BASE_SHA 与 Codex 分支相同后再集成，暂不合并主轴。
