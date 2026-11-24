import {writeFile,mkdir} from 'node:fs/promises';
import {WX_C_CONSUMERS} from '../src/inkbox/wanxiang/consumerManifest.js';
import {getCatalogEntry} from '../src/inkbox/wanxiang/catalog.js';
const lines=['# WX-C 新增消费者覆盖附表','','本表由 `node scripts/inkbox-wx-c-coverage.mjs` 从机器清单生成。仅列本轮新增消费者；原设计与既有手工覆盖矩阵继续保留。B 表示存在下游消费者与定向验证，不表示完整自然人生或全部64卦完成。','','| 条目 | 消费轴 | 正式入口 | 定向测试 | 状态 | 限制 |','|---|---|---|---|---|---|'];
for(const row of WX_C_CONSUMERS)lines.push(`| ${getCatalogEntry(row.entryId)?.name||row.entryId} / ${row.entryId} | ${row.axis} | ${row.callsite} | ${row.testId} | ${row.status} | ${row.limitations} |`);
lines.push('','验证命令：`node scripts/inkbox-wx-c-effects.mjs`。清单驱动已装配技能的真实正反行动与法力支付断言；保存恢复、同日健康/目标/休眠/期限另有定向检查。画像不代替行动测试。','');
await writeFile('docs/development/WX_C_COVERAGE.md',lines.join('\n'));await mkdir('reports/local/wanxiang-c',{recursive:true});await writeFile('reports/local/wanxiang-c/coverage.json',JSON.stringify(WX_C_CONSUMERS,null,2));console.log('Generated WX_C_COVERAGE.md and reports/local/wanxiang-c/coverage.json');
