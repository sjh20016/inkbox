# M2-C2C 性能与资源报告

2026-10-06。正式配对矩阵与稳定性运行进行中，最终值待填。
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

待正式 23 对 Browser 完成后写入完整 draws/tri、CPU update/submit、GPU timer、resource counts 与场上传请求表。

凡界 overview 目标约15–24 draws；跨界逐层包含两侧 terrain/water、既有实体/建筑/装饰、界缘、持久 Rift 和短命 FX，新增层的成本不能用不同 World 或删除树木抵消。

## 生命周期与内存

待正式 600 + 6000 product RAF Soak 完成后填入预热、末值和峰值。资源按同一已预热状态精确比较 geometries/textures/programs、material references、field bytes/uploadRequests；6000帧分20段，每段300实帧，30帧一资源采样。GC后heap/DOM/listener有明确固定基线和容差，切换等待不记作一个单帧时长。

## 包与 Git 证据

精确 e0a851c 包基线：300文件，8175787 bytes，ZIP2563944 bytes。待最终 clean clone 与 build/audit 写入新文件数、目录/ZIP增量，以及本轮 Git tree 差分字节。

运行包保留源码、运行 GLB、manifest、契约、测试及 compact summary；排除 environment source、角色 .blend、preview、research、全量矩阵、proof、PNG和日志。新阶段 Golden 最多8张，只进开发仓库。

## 已知边界

各短段独立采地保持表面接触；地形/Region不合适的 Site 或纹段会fallback而不改 World。低矮 Formation 由实帧遮挡诊断发现整块贴地埋入山坡，现改成各阵点分别贴地，增加的是固定物理实例槽，身份cap与draw family没有增加。场扫描暂采用4Hz有界cadence；本次不改变模拟/Bridge dirty分类。
