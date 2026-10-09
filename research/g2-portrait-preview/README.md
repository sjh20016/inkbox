# G2-P 面相工作台

从仓库根目录运行: python -m http.server 8000
打开: http://localhost:8000/research/g2-portrait-preview/index.html

页面可在程序面相、三代遗传、同人多态、本地手绘 PNG 试装四种模式之间切换。
64 人矩阵使用稳定 fixture 身份；三代亲缘来自纯函数；所有受伤/鬼魂/入魔/功法状态是特意写死的可视化输入，并不宣称这些事实来自真实 World。
手绘试装页通过浏览器本地 Object URL 加载 PNG，刷新即失效，不保存、不上传、不改变仓库 Asset Manifest。
画布应为 512×512 透明 PNG，不裁剪，个别纹样覆盖特定槽位。若正式使用，需人工将文件写入 assets/portraits/inkbox-face-v1 并修改 manifest.json。
真浏览器的尺寸/性能/交互仍需实际验收；脚本通过不等于浏览器通过。