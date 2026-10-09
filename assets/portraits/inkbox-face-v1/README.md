# Inkbox 手绘面相包 v1（素材待填充）

这里故意只存资源清单，不存生成式头像；程序化资产由 v2 代码提供。

1. 绘画画布 1024×1024，导出 512×512 完整透明 PNG，不裁剪透明边缘。
2. 用相同画布原点与锚点绘制，面相最终映射到 100×100 逻辑坐标。
3. 每一个槽位单独导出透明图；不包含其余部件或不属于自己的阴影。
4. 在 manifest.json 的 slots 中追加映射，例如 eyes: {calm-01: eyes/calm-01.png}（必须使用合法 JSON 字符串语法）。
5. 画完一张替换一张。没有素材时自动用程序化组件；加载失败也回退到程序组件。
6. 不重用旧的部件 ID 表达新的形状，避免历史角色因更新素材突然换脸。
7. 素材只引用包内相对 .png 路径，不允许网络 URL、绝对路径或父级目录。
8. 状态素材可按 effect ID 覆盖，如 skinMarks.scar、skinMarks.age-lines、effects.ghost。

固定底到顶图层：background / backHair / robe / neck / face / ears / eyes / brows / nose / mouth / cheeks / skinMarks / frontHair / ornament / effects / frame。
原稿 PSD/KRA/CLIP 由作者自行保存；运行包只需要 PNG + manifest。
