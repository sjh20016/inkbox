# 坐天观井 · Inkbox 1.0.0

当前唯一活跃主线是 `src/inkbox`：一张会自行演化的水墨山河，玩家可以改地形、施神力、观察众生修行与灾祸结果。

## 启动

需要 Node.js 18 或更新版本。项目没有第三方运行时依赖。

```bash
npm run dev
```

随后打开 `http://127.0.0.1:4180/`。Windows 也可以运行 `启动水墨沙盒.bat` 或 `启动游戏.bat`。唯一游戏页面是 [`inkbox.html`](./inkbox.html)；根目录 `index.html` 和 `game.html` 都会转到它。

## 检查与测试

```bash
npm test                    # 快速 Inkbox 核心检查、入口 HTTP 检查
npm run test:regression     # 四类干预、灾祸生命周期与存读档回归
npm run test:three-realms   # 三界生态不变量回归（时间 / 世界身份 / id 空间 / 上界 / 幽冥 / 存读档 / 裂隙 / 跨界）
npm run test:save-equivalence  # 存读档分叉等价
npm run test:browser        # 浏览器交互检查，需要本机 Edge 或 Chrome
npm run test:simulation     # 范围较大的旧 smoke，仅按需运行
npm run build               # 生成仅含活跃主线的 dist 项目包
```

测试分类和各旧探针的位置见 [`tests/README.md`](./tests/README.md)。

## 工程状态

- 当前阶段：D6-3 视界与跨界生态（工程包 A **裂隙跨界框架 + 凡人跌入幽冥** ✅、工程包 B **鬼进入凡间** ✅、工程包 C **幽冥物品泄漏** ✅、工程包 D **跨位面夺舍** ✅、工程包 E **回归扩展** ✅ —— **六包齐，A–E 全部完成**）。
  D6-2 三界生态闭环（A–F 六包齐）已完成并通过全套验收。
- 三界规则（代码必须遵守的约束表）：[`THREE_REALMS.md`](./THREE_REALMS.md)
- 当前状态与已知问题：[`STATUS.md`](./STATUS.md)
- 有效待办与暂停研究：[`BACKLOG.md`](./BACKLOG.md)
- 玩家指南：[`PLAYER_GUIDE.md`](./PLAYER_GUIDE.md)

`src/main.js`、`demo/`、`剧情文案素材/`、`scripts/v*` 和旧研究报告是冻结历史材料，不属于当前主线。完整开发仓库把 V4 发布文档与旧入口归档到 `reports/archive/v4-docs/`；干净项目包不会带入这些历史材料。
