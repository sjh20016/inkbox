# M2-C2C 性能与资源报告

2026-10-06。完整23对本地GPU矩阵、600＋6000 product RAF耐久、两个关键祖先与独立干净克隆均通过。[compact acceptance summary](./reports/release/render3d-m2c2c/summary/acceptance-summary.json)记录原始证据SHA和精简数据。
读数只比较同机、同 World、同 camera 的 geography off/on，不能与旧阶段异机帧率直接比较。

## 测量口径

每个正常视角先预热两种表现状态，再各采 120 个实际产品 RAF；分别包装已有 Host.update 和 submit/render，仍只让产品执行一次更新与提交。CPU update/submit、RAF 和 EXT_disjoint_timer_query_webgl2 GPU timer 分列；不可用或 disjoint 的 GPU 查询不填估算值。Shader 程序检查实际 LINK_STATUS 和浏览器 console/runtime error。

## 固定资源与上界

| 项目 | 实际资源协议 |
| --- | --- |
| Site | 256 身份；7 唯一 GLB node；Formation 2048 物理槽，其余各256，共3584 |
| Site matrix | 229376 bytes；共享 Site geometry 35640 bytes；无新 instanceColor |
| Site shared atlas | 借用既有 65536-byte atlas，不复制 texture |
| Leyline | 256 短纹段固定全局 cap；3 shared LOD node，36/12/4 tri |
| Leyline buffer | 三个固定 matrix 共49152 bytes；三个几何共5616 bytes |
| Rift wound | 64 身份×14段=896；单 geometry/material/draw；10752 tri 上限 |
| Rift wound buffer | 仅 Mortal Stage 分配；matrix57344 bytes、geometry840 bytes，实际有伤口后一次分配 color10752 bytes |
| Rift FX | 每 Stage 256 stroke；单 6tri brush geometry/material/draw；1536 tri 上限 |
| Rift FX buffer | 每 Stage matrix16384、color3072、geometry及opacity1300 bytes；三界共62268 bytes |
| Scalar field | Upper qi 和 Nether veg 各一份惰性 R8，1 byte/cell，独立 Stage 所有权 |
| field refresh | 可见、production 和 art 开启才最多4Hz扫描；不变字节不请求上传 |

medium 288×180 每界 scalar cache 为 51840 bytes，两界合计 103680 bytes（不含 WebGL 驱动开销）。small 200×128 两界合计 51200 bytes。Three r186 的局部 texture updateRanges 只支持 RGBA，因此 dirty R8 刷新请求一次有界全图上传；计数是上传请求，GPU 可合并。后续是否增 Bridge dirty 通道应由实测决定。

实际运行类及出货GLB数组的CPU分配审计共440236 bytes固定新增payload；Mortal伤口color分配后为450988 bytes。再加两份medium R8共554668 bytes（约0.529 MiB）；small为502188 bytes。此数是已知上传数据/typed-array负载预算，不能当作驱动实际显存读数。Upper/Nether没有marker层，因此没有额外Site/Leyline/RiftWound池。共享atlas、Three内部缓存、driver对象及对齐开销不计入这项增量。出货environment_library.glb为217348 bytes。

## 正常视角配对

Windows10、Edge154、ANGLE Intel UHD Graphics730 / D3D11、WebGL2、DPR及pixelRatio=1；页面1500×940。正式矩阵每对有120个CPU/RAF样本、121个有效GPU查询，未用帧率推算GPU时间。off/on在同World、advanceState和camera下预热后顺序测量。

| # / view | draw off→on | tri off→on | CPU update med/p95 ms | CPU submit med/p95 ms | GPU med/p95 ms |
| --- | --- | --- | --- | --- | --- |
| 1 mortal/overview | 25→25 | 159320→159036 | 0.800/3.900→0.800/3.800 | 1.400/2.500→1.300/2.100 | 7.270/8.372→6.676/7.217 |
| 2 mortal/secret | 32→33 | 307036→309084 | 0.500/2.600→0.700/3.700 | 1.500/3.200→1.500/2.600 | 6.542/7.953→6.713/7.281 |
| 3 mortal/cave | 34→35 | 308992→311040 | 0.400/2.100→0.700/2.700 | 0.600/2.100→0.400/0.700 | 7.105/8.776→6.210/7.206 |
| 4 mortal/formation | 35→36 | 307736→309784 | 0.500/2.400→0.500/2.300 | 0.500/1.300→0.400/0.700 | 5.774/6.523→6.003/6.850 |
| 5 mortal/ruin | 31→32 | 290534→292582 | 0.500/1.800→0.500/2.000 | 0.400/1.300→0.500/2.500 | 7.712/8.587→7.886/9.217 |
| 6 mortal/leyline | 33→34 | 235875→237887 | 0.400/1.700→0.400/1.900 | 0.500/0.700→0.500/1.000 | 7.192/7.895→7.568/8.651 |
| 7 mortal/site-village | 32→33 | 289712→291760 | 0.500/2.000→0.500/2.100 | 0.500/0.900→0.400/1.000 | 6.432/7.472→7.501/9.088 |
| 8 upper/overview | 10→10 | 106024→106024 | 0.800/1.200→0.900/1.200 | 0.200/0.400→0.300/0.600 | 6.475/7.275→7.150/7.925 |
| 9 upper/high | 7→7 | 104288→104288 | 0.800/1.400→0.900/1.300 | 0.300/0.400→0.300/0.500 | 8.005/9.005→5.335/6.991 |
| 10 upper/low | 7→7 | 105044→105044 | 0.700/1.200→0.700/1.200 | 0.300/1.200→0.300/1.300 | 9.734/16.852→6.562/11.679 |
| 11 upper/entity | 11→11 | 109078→109078 | 0.800/1.100→0.700/1.200 | 0.300/0.900→0.300/1.200 | 5.268/10.563→5.849/10.771 |
| 12 upper/cross-window | 30→29 | 254085→254365 | 1.400/2.800→1.400/2.900 | 0.600/1.900→0.500/2.000 | 12.460/16.837→8.829/17.023 |
| 13 nether/overview | 9→9 | 105836→105836 | 0.700/1.100→0.800/1.400 | 0.200/0.800→0.300/1.000 | 5.483/11.255→6.339/10.886 |
| 14 nether/high | 9→9 | 106154→106154 | 0.900/1.200→1.300/3.200 | 0.300/0.600→0.500/1.900 | 3.712/4.910→3.414/5.084 |
| 15 nether/low | 8→8 | 105944→105944 | 1.000/1.700→1.000/1.900 | 0.400/1.200→0.200/0.600 | 2.488/3.153→2.699/2.817 |
| 16 nether/cluster | 7→7 | 107258→107258 | 0.900/1.500→0.900/1.400 | 0.200/0.500→0.200/0.400 | 4.513/5.915→4.323/5.273 |
| 17 nether/old-decay-trace | 8→8 | 107300→107300 | 0.800/1.300→0.800/1.200 | 0.200/0.300→0.200/0.400 | 4.073/7.242→6.655/7.526 |
| 18 nether/cross-window | 29→28 | 253831→254111 | 2.000/6.000→1.900/3.900 | 0.700/3.300→0.600/1.800 | 9.190/15.210→9.326/13.692 |
| 19 upper/rift | 41→40 | 485152→485432 | 1.300/2.000→1.400/2.100 | 0.500/0.700→0.400/0.700 | 8.354/9.543→7.330/7.670 |
| 20 nether/rift | 42→41 | 480356→480636 | 1.300/2.300→1.400/2.800 | 0.500/1.900→0.500/0.700 | 7.712/10.525→8.291/8.824 |
| 21 upper/cross-rift-fx | 34→32 | 448793→448293 | 1.300/2.000→1.300/1.900 | 0.500/0.700→0.500/0.600 | 7.183/7.924→5.943/6.672 |
| 22 nether/cross-rift-fx | 37→35 | 448459→447947 | 1.400/2.200→1.300/2.200 | 0.500/0.700→0.500/0.600 | 6.909/7.114→7.201/7.471 |
| 23 nether/breach-near | 32→31 | 389848→390128 | 1.300/2.100→1.300/2.100 | 0.500/0.600→0.500/0.600 | 8.388/8.531→7.499/8.103 |


这些短段不是性能优劣排名：GPU频率、调度及顺序采样会有噪声，尤其高低场视角与历史技术视角；不把某个负增量宣称为优化。全部开关配对包含Site和Leyline，不把整帧差分都归因给Site。

正式近景Site层45身份、52物理实例、4draw/3780tri；overview为48实例、3draw/1632tri。overview整帧25→25draw、159320→159036tri，旧资产基线已为25，较15–24建议值多1；本轮没有新增overview draw或删除世界对象以达到建议值。灵脉同一3身份：远纹23段/92tri、中纹23段/276tri；全局cap仍256。跨界包括两侧terrain、Mortal water/树/聚落/标记、目标实体/装饰、界缘与Rift，Upper概览10draw、Nether9draw，窗口29/28draw；Rift高倍率视角40/41draw。每种新增层最多按实际有实例的共享node提交，未为每种kind复制全套LOD batch。

| # / view | 驻留g/t/p | Site身份/实例/tri | Ley身份/段/tri | decoration U/N | U场scan/request/bytes | N场scan/request/bytes | FX U/N/overflow |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 mortal/overview | 24/3/7 | 45/48/1632 | 3/23/92 | 93/96 | 2/1/25600 | 2/1/25600 | 0/0/0 |
| 3 mortal/cave | 53/4/10 | 45/52/3780 | 3/23/276 | 93/96 | 6/1/25600 | 6/1/25600 | 0/0/0 |
| 6 mortal/leyline | 54/4/10 | 45/52/3744 | 3/23/276 | 93/96 | 12/1/25600 | 12/1/25600 | 0/0/0 |
| 8 upper/overview | 54/10/10 | 1/1/6 | 6/65/260 | 160/2 | 20/1/51840 | 5/3/155520 | 0/0/0 |
| 12 upper/cross-window | 68/10/13 | 0/0/0 | 0/0/0 | 55/2 | 84/1/51840 | 9/3/155520 | 0/0/0 |
| 13 nether/overview | 69/10/13 | 1/1/6 | 6/65/260 | 55/96 | 97/1/51840 | 13/3/155520 | 0/0/0 |
| 18 nether/cross-window | 75/10/13 | 0/0/0 | 0/0/0 | 55/28 | 102/1/51840 | 107/3/155520 | 0/0/0 |
| 21 upper/cross-rift-fx | 95/10/15 | 1/1/84 | 6/65/780 | 1/2 | 125/1/51840 | 140/3/155520 | 2/0/0 |
| 22 nether/cross-rift-fx | 97/10/15 | 1/1/84 | 6/64/768 | 1/2 | 137/1/51840 | 144/3/155520 | 0/2/0 |

驻留表为该正常视角预热后的累计资源；隐藏Stage保留缓存，装饰统计可保留最近提交值，实际draw只计可见Stage。不同首次模块/World/视角间的资源数不是泄漏比较；精确稳定性由下述全部预热后同状态的6000帧门禁判断。场计数是刷新扫描/上传请求/累计请求字节，区别于实际WebGL合并上传。完整每视角、每Stage的draw/cap/拒绝/LOD/场/FX数据在compact summary。两种实际深冻结cross事件各输出2stroke、12tri、1draw、overflow0；CPU另测256池上限，不宣称这轮自然事件填满了池。

凡界 overview 目标约15–24 draws；跨界逐层包含两侧 terrain/water、既有实体/建筑/装饰、界缘、持久 Rift 和短命 FX，新增层的成本不能用不同 World 或删除树木抵消。

## 生命周期与内存

正式通过：600 lifecycle实际update/render各600；6000帧为20×300实际产品调用，200次分段检查，所有状态与预热基线精确一致：114 geometries、10 textures、16 programs，GL error=0。预热涵盖20生产状态、5旧资产视角和实际冻结FX在assets-off的回退；额外鬼修材质证明使用当前真实鬼修焦点，随后恢复原高场/窗口/FX构图。Mortal Site dense、两界高场、两种窗口、LOD、production/style、resize/pan/rotate均覆盖。

GC后heap 24035768→24304508 bytes，峰值24645756，增量268740；容差上界38433318。DOM 1453→1453、峰值1457；listener 80→80。21次强制GC采样通过。atlas/GLB/角色库各一次加载，material引用、场cache字节及上传请求计数不漂移，完整World/advanceState SHA保持一致。最后300帧实际冻结FX消费300次，每30帧确认池中2stroke、1draw且无overflow；最终预热的读数另记，不充当测量帧内证据。

资源按同一已预热状态精确比较 geometries/textures/programs、material references、field bytes/uploadRequests；6000帧分20段，每段300实帧，30帧一资源采样。GC后heap/DOM/listener有明确固定基线和容差，切换等待不记作一个单帧时长。

## 包与 Git 证据

精确 e0a851c 包基线：300文件，8175787 bytes，ZIP2563944 bytes。干净克隆ccac961经npm ci及16项安装/CPU/祖先资产/build命令全部通过；11×600日纯度full SHA与主工作区一致，save keys=49。候选包333文件，目录8753296 bytes、ZIP2729439 bytes；最终报告更新后的尺寸以交付构建为准。最终规模约8.8 MB目录、2.7 MB ZIP，较基线约+0.6 MB/+0.2 MB；精确末包字节与SHA留ignored packaging.json，避免把ZIP自身字节写进包内形成自引用。

冻结验收提交45ab058c4603c28e55eca4cbd2711cecf7107aca相对e0a851c：Git tree 1105→1148文件，新增43、修改34、删除0；blob净增7861268 bytes，其中8张Golden为7206282 bytes。该历史范围引入293个对象（17commit/131tree/145blob），原始payload合计10715169 bytes，逐对象zlib松散估算8226347 bytes；这不是实际pack或网络传输字节。精确可复查统计在ignored git-delta-45ab058.json，后续本段审计文字提交与最终package/Git尺寸另由ignored packaging.json记录，不把用户移走的旧素材/文档误算作本轮删除。

运行包保留源码、运行 GLB、manifest、契约、测试及 compact summary；排除 environment source、角色 .blend、preview、research、全量矩阵、proof、PNG和日志。新阶段 Golden 最多8张，只进开发仓库。

## 已知边界

完整23对表格与600＋6000 Soak记录原验收运行层471ccbe；后续冷启动预检不计入GPU帧。426412d修复首次main Push暴露的旧dirty契约：heightChanged保持原分类，只有活跃生产Site/Leyline独立失效type准入缓存。旧36断言、新8组契约与完整Fast26命令通过；类型未变化的帧路径经独立审查。修复后case1/4两对GPU诊断使用同一自然save、World和相机，Site/Leyline提交统计与原对应视角相同，配对纯度通过。独立浏览器导入的transient advanceState及整帧draw/triangle不要求跨运行相同；两次场景顺序也不同，因此该两对不加入上表，不作新的性能或Soak结论。修复及原始来源SHA均记入compact summary。

各短段独立采地保持表面接触；地形/Region不合适的 Site 或纹段会fallback而不改 World。低矮 Formation 由实帧遮挡诊断发现整块贴地埋入山坡，现改成各阵点分别贴地，增加的是固定物理实例槽，身份cap与draw family没有增加。场扫描暂采用4Hz有界cadence；本次不改变模拟/Bridge dirty分类。

冷启动缓存自然生成发生在GPU启动与计时前，不计作渲染帧；两配方重生成后save/World/advance/history SHA与原正式输入相同。独立d9ca78b克隆的1/4两对冷诊断完成，只检查重建、前景和点击，不加入上表23对计时样本或耐久数据。默认及显式缓存采用完整模拟源码与Node/V8校验；8个坏输入拒绝检查通过。
