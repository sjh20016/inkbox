# WX-D 命途消费者

`aidIntent` 是关系帮助候选排序的有界乘数：师卦偏好同宗，同人卦偏好师徒，临卦偏好低境目标。只在准备付费的合法目标候选上计算；不更改帮助资格、资源或结果。卦失效、休眠时无收益。复用既有卦字段，不新增持久状态。

`node scripts/inkbox-wx-d-destiny.mjs` 覆盖条件、期限、休眠、正式候选排序及下述受控命途和 v11 存档。

受控集成验证：`node scripts/inkbox-wx-d-destiny.mjs` 用正式 `stepDaoActivities` 比较三卦激活与休眠时两个合法候选的实际选择；目标选择差异不代表自然样本发生率。另以确定种子与预置已到达的合法参与者调用正式 `enterSite`，失败产生畏险，丹修付费疗伤使赴事决策从暂缓变为愿意；经 `serializeWorld` / `deserializeWorld` v11 往返后再次进入同一地点并成功，畏险转为险中有定。此夹具未模拟前往该地点的行程，结果不代表自然发生率。`node scripts/inkbox-wx-d-social.mjs` 单独覆盖真实疗伤、恩义、付费回助和护关。
