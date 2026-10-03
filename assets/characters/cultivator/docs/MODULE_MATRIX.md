# 模块与六类修士组合

以下为角色语义，精确 module ID / GLB node / triangle count / socket 以 `../data/cultivator_manifest.json` 为机器可读真源。全部角色复用 body_base，普通修士移除所有附件后仍然完整。

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

初版没有独立 hairband、披风、肩甲、剑穗、动态布料或角色专属身体。robe 槽只供长老和鬼修的一处轮廓变化，含 body+hair+robe 仍须不超过450面。白发直接使用 paper_white 色块；附加小道具不烘焙进 body。每个模块在 master 中维护一次，在家族和 scale collections 中用 linked mesh datablock 组装。

`CharacterLibrary.resolveAppearance` 检查槽类型和复杂度，`CharacterBatch` 依据配置选择实际共享实例批次。不能把所有附件塞进一个任意数组。六个身份角色预设的唯一真源是 manifest.roles；后续 AI 新增身份应先修改语义配置，确实需要新识别点时才加低面模块。

实际游戏只读取已有语义：level>0 的修士、faction、dao.path.key=alchemy、高阶 level、ghostCultivator。`state=wander` 只是移动状态，不能据此改成游修职业。六类完整展示在 `cultivator-lab.html`，现有世界不具备的职业信息不会被资产系统制造出来。
