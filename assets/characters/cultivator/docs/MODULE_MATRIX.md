# 模块与六类修士组合

以下为角色语义，精确 module ID / GLB node / triangle count / socket 以 `../data/cultivator_manifest.json` 为机器可读真源（v2 重建版实测面数由 `scripts/inkbox-characters-check.mjs` 从 GLB 索引 accessor 读取并写入 `../data/structural_validation.json`）。全部角色复用 body_base，普通修士移除所有附件后仍然完整。当前 runtime 资产为 2026-10 v2 重建版，来源与色格语义见 [CULTIVATOR_REBUILD_INTEGRATION.md](CULTIVATOR_REBUILD_INTEGRATION.md)。

| 身份 / role | 发型 | 主色默认 | 武器 | Back | Prop | Tag | 主要识别 |
|---|---|---|---|---|---|---|---|
| 普通修士 / basic | base | 纸白1 | — | — | — | — | 简单交领道袍与发髻 |
| 宗门弟子 / sect_disciple | base | 宗门蓝5，可覆为宗门主色 | sword_01 | — | — | sect_token_01 | 宗门色 + 令牌 |
| 游修 / wanderer | base | 米色2 | — | pack_01 | gourd_01 | — | 旅行包 |
| 高阶修士 / 长老 / elder | elder | 蓝灰4，可覆为宗门主色 | sword_01 | — | — | — | 白发 + 一处极简肩部轮廓 |
| 鬼修 / ghost | ghost | 墨黑3 | — | — | soul_lamp_01 | — | 暗色 + 魂灯，极简破损衣摆 |
| 丹修 / alchemist | base | 药黄9，可覆为宗门主色 | — | — | — | alchemy_tag_01 | 极简丹炉图形标记 |

默认丹修使用丹炉图形标记；`gourd_01` 是可独立换装的备选，换成药葫芦时必须去掉标记。鬼修选择魂灯，不能同时加符纸。游修小包属于 back，小葫芦属于 prop；两个结构服务同一个旅行身份，不再加剑或令牌。

| 共享模块类型 | 数量 | 槽 / 绑定语义 |
|---|---|---|
| BODY_BASE（内含 HEAD / ARM / LEG / HAND / FOOT / SLEEVE / ROBE） | 1 | body；16骨共享人体 |
| HAIR_BASE / HAIR_ELDER / HAIR_GHOST | 3 | hair；head / socket_hair |
| WEAPON_SWORD_01 | 1 | weapon；socket_weapon |
| PROP_PACK_01 | 1 | back；socket_back |
| PROP_GOURD_01 | 1 | prop；socket_waist |
| PROP_SOUL_LAMP_01 | 1 | prop；手部附近的持物语义 |
| PROP_SECT_TOKEN_01 | 1 | tag；腰部身份标记 |
| PROP_ALCHEMY_TAG_01 | 1 | tag；腰部身份标记，替换药葫芦 |
| ELDER_MANTLE / GHOST_TORN_HEM | 2 | robe；一处极简衣服剪影变化，不是新身体 |

v2 重建版实测面数（旧 v1 → 新 v2；完整逐角色核心/附件/全装表见 [CULTIVATOR_REBUILD_INTEGRATION.md](CULTIVATOR_REBUILD_INTEGRATION.md) §3）：

| 模块 | v1 | v2 | 模块 | v1 | v2 |
|---|---:|---:|---|---:|---:|
| body_base | 384 | 342 | pack_traveler | 60 | 60 |
| hair_base | 50 | 86 | gourd_small | 68 | 70 |
| hair_elder | 50 | 82 | soul_lamp | 100 | 60 |
| hair_ghost | 50 | 94 | sect_token | 24 | 38 |
| sword_simple | 36 | 52 | alchemy_tag | 32 | 28 |
| elder_mantle | 12 | 32 | ghost_torn_hem | 16 | 10 |

v2 实测核心剪影（body+hair）：basic/sect_disciple/wanderer/alchemist 428、elder 424、ghost 436；附件合计最大 130（wanderer）、全装最大 558（wanderer）。

初版没有独立 hairband、披风、肩甲、剑穗、动态布料或角色专属身体；v2 新增独立发冠/发带**色格**（cell 10，不是独立模块）。robe 槽只供长老和鬼修的一处轮廓变化。预算自 v2 起拆成两级：核心剪影 body+hair 250–450，附件（robe/weapon/back/prop/tag）单件 ≤100、单角色合计 ≤200、全装 ≤650。**原 v1 的“含 body+hair+robe ≤450”在新资产上会因 elder = 342+82+32 = 456 超 6 而无法保留**；拆分依据与实测表见 [CULTIVATOR_REBUILD_INTEGRATION.md](CULTIVATOR_REBUILD_INTEGRATION.md) §5。白发直接使用 paper_white 色块；附加小道具不烘焙进 body。每个模块在 master 中维护一次，在家族和 scale collections 中用 linked mesh datablock 组装。

`CharacterLibrary.resolveAppearance` 检查槽类型和复杂度，`CharacterBatch` 依据配置选择实际共享实例批次。不能把所有附件塞进一个任意数组。六个身份角色预设的唯一真源是 manifest.roles；后续 AI 新增身份应先修改语义配置，确实需要新识别点时才加低面模块。

实际游戏只读取已有语义：level>0 的修士、faction、dao.path.key=alchemy、高阶 level、ghostCultivator。`state=wander` 只是移动状态，不能据此改成游修职业。六类完整展示在 `cultivator-lab.html`，现有世界不具备的职业信息不会被资产系统制造出来。
