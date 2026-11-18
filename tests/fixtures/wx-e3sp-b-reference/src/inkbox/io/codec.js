// 水墨沙盒 · 存档编解码
//
// 这一层只做一件事：把「序列化后的存档字符串」压小，读档时原样还原。
// 它是**纯函数**——不碰 localStorage、不 import 本目录以外的任何东西。
// 「不碰 localStorage」是刻意的：这样它能在 Node 里被直接测，而存档格式的
// 回归判据必须能进脚本跑，不能靠开浏览器点两下。读写 localStorage 是 save.js 的事。
//
// ── 为什么必须有这一层 ────────────────────────────────────
// localStorage 单 origin 配额实测 **5,242,877 个 UTF-16 码元**（per-origin 共享，
// 中文与 ASCII 同价）。实测存档体积（seed=20260914 · scatter=true · 演化 150 年）：
//   · 中堂 288×180：2,797,948 字符（53.4%）
//   · 长卷 384×240：3,788,047 字符（72.3%）
// 「三界并存」（凡间 / 幽冥界 / 上界三张同尺寸地图全量进存档）不压缩的话，
// 长卷是 6,000,060 字符 = **114.4%**，真实浏览器里直接抛 QuotaExceededError——
// 也就是说压缩不是优化项，是「这个功能能不能存在」的前置条件。
//
// 压缩比有**两个口径，引用时必须写清是哪一个**（长卷整档实测）：
//   · 原字符 ÷ gzip 字节   = 3,788,047 / 967,621   = **3.91×**
//   · 原字符 ÷ base64 字符 = 3,788,047 / 1,290,171 = **2.94×**  ← 落盘的是这个
// 只有 base64 之后的那串字符会写进 localStorage（3,788,047 → 1,290,171 = 24.6% 配额）。
// 拿 3.91× 去估「存档还剩多少余量」会**偏乐观 33%**（3.91/2.94 = 1.33），
// 而那个方向恰好是「以为还塞得下、实际已经超了」。判配额一律用 payloadSize()。
//
// 以上数字的唯一来源是 scripts/_codecprobe.mjs（常驻诊断探针）。
// 改了 save.js 或本文件之后重跑它，逐条比对读数——数字与探针必须成对存在。
//
// ── 两条不能省的约束 ──────────────────────────────────────
//
// 一、**必须同时认新旧两种格式。** 老玩家 localStorage 里躺着的是明文 JSON 存档。
//     读档认不出来 = 几百年的修行当场报废。判别靠魔术前缀，理由见 CODEC_MAGIC。
//
// 二、**中文必须走 UTF-8 字节，绝不能在含中文的字符串上直接调 btoa。**
//     `btoa('中文')` 直接抛 InvalidCharacterError——这条容易发现。
//     真正危险的是「先想办法绕过它」的那些做法：一旦中文被当成 latin1 截断，
//     它**不报错**，只是悄悄变成乱码，读回来是另一段文字。
//     唯一正确的路径：
//       存：TextEncoder.encode(text) → gzip → 字节 → base64
//       读：base64 → 字节 → gunzip → TextDecoder.decode()
//     两边都必须经过字节，任何「直接对字符串做 base64」的捷径都是错的。
//
// ── 与浏览器/Node 的关系 ─────────────────────────────────
// CompressionStream / DecompressionStream 是 WHATWG 标准，Node 18+ 与所有现代
// 浏览器都有；本机实测 Node v22.22.2 与 Edge 的 gzip 输出**逐字节相同**
// （同一个 zlib），所以这里一份实现同时跑测试脚本与游戏，不需要写两套、
// 也不需要为「两边输出不一致」做兼容。
// 耗时实测（浏览器，长卷整档）：gzip 81.3 ms + base64 11.9 ms + gunzip 34 ms ≈ 127 ms。

/**
 * 编解码器的格式标识。**换实现时改这里**，存档靠它区分新旧格式。
 *
 * 为什么用魔术前缀而不是「parse 成对象后看有没有某个键」：
 *   存档本身就是 JSON，任何「靠字段名判别」的方案都会踩到「某个字段恰好叫
 *   这个名字」——而那种误判不会报错，只会把一份压缩数据当成世界来解析。
 *   前缀判别只做一次 `startsWith`，不需要先 JSON.parse，也没有歧义。
 *
 * 为什么明文存档**不加**前缀：明文路径是「老浏览器上存档仍然可用」的保命通道，
 * 它产出的东西必须与 codec 存在之前的存档**逐字符一致**——加了前缀，老版本游戏
 *   读新版本写的档就会 JSON.parse 失败。代价是「明文」与「老档」在字节上无法区分，
 *   这正好是我们要的：它们本来就是一回事。
 *   「这一次到底用了压缩没有」改由 lastCodecUsed() 显式回答，见那里。
 *
 * 尾部的 `1` 是**格式版本**，不是压缩算法版本：将来若把 gzip 换成别的算法，
 * 新格式用新前缀（如 `INKGZ2:`），decodeSave 按前缀逐个匹配，能同时认两种。
 */
export const CODEC_MAGIC = 'INKGZ1:';

// ── 字节 ⇄ base64 ────────────────────────────────────────
// 与 save.js 里那两个私有助手同一套写法（这里**重写一份**而不是 import：
// codec 要自包含，这正是「可替换」的意思——将来整个换掉 save.js 的存储方式，
// 这个文件不该跟着一起坏）。
//
// 必须分块：`String.fromCharCode.apply(null, bytes)` 的参数个数上限各引擎约在
// 65535~125000 之间，而真实存档的 gzip 结果是 96 万字节——一次 apply 整个数组
// 会抛 RangeError: Maximum call stack size exceeded。
// 注意那是**编码阶段**就炸：玩家点保存，直接失败，而不是读档时才出问题。
const B64_CHUNK = 0x8000;

function bytesToBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += B64_CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(bytes.length, i + B64_CHUNK)));
  }
  return btoa(binary);
}

function base64ToBytes(text) {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// ── 流 ⇄ 字节 ────────────────────────────────────────────
async function readAll(stream) {
  const reader = stream.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.length;
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (let i = 0; i < chunks.length; i += 1) {
    out.set(chunks[i], offset);
    offset += chunks[i].length;
  }
  return out;
}

/**
 * 把 bytes 灌进一个 TransformStream，取出全部输出。
 *
 * ⚠️ 读与写必须**并发**开始。TransformStream 的内部队列有高水位，一次 write
 * 96 万字节远超它，`write()` 的 promise 要等读者把数据取走才 resolve。
 * 所以写成
 *     await writer.write(bytes);          // ← 卡死在这
 *     const out = await readAll(...);
 * 是死锁。而且它在几百字节的玩具字符串上完全正常，只在真实存档上挂住——
 * 这类错会被「小样本测试全绿」完美掩盖。
 */
async function throughTransform(transform, bytes) {
  const writer = transform.writable.getWriter();
  const feeding = writer.write(bytes).then(() => writer.close());
  const [out] = await Promise.all([readAll(transform.readable), feeding]);
  return out;
}

const gzipBytes = (bytes) => throughTransform(new CompressionStream('gzip'), bytes);
const gunzipBytes = (bytes) => throughTransform(new DecompressionStream('gzip'), bytes);

// ── 编解码器注册表 ───────────────────────────────────────
// 「换算法只改一处」的落点。decodeSave 会遍历整张表，所以新增一种算法
// 不会让老格式读不出来——这是向后兼容的结构性保证，不靠人记得改分支。
const CODECS = [
  {
    key: 'gzip',
    magic: CODEC_MAGIC,
    // 字符串 → 字符串。入参出参都是普通 JS 字符串，中文与代理对都按 UTF-8 走。
    async compress(text) {
      return bytesToBase64(await gzipBytes(new TextEncoder().encode(text)));
    },
    async decompress(body) {
      return new TextDecoder().decode(await gunzipBytes(base64ToBytes(body)));
    },
  },
];

// 匹配顺序按 magic 长度降序。现在只有一个前缀，看起来多余；但将来同时存在
// `INKGZ1:` 与 `INKGZ12:` 这种「一个前缀是另一个的前缀」时，顺序错了就会
// 用错的解码器去解，而那种错通常表现为「解出来是乱码」而不是异常。
const CODECS_BY_MAGIC_LENGTH = CODECS.slice().sort((a, b) => b.magic.length - a.magic.length);

/**
 * 写入时用哪一种。**换算法只改这一行**——读取侧靠全表匹配，不受影响，
 * 所以换完之后老档仍然读得出来（这是注册表存在的全部意义）。
 * 不用 `CODECS[0]`：那样「换算法」与「调顺序」会变成同一件事，
 * 某天有人为了让匹配顺序好看一点而重排数组，就会连带把写档格式也换掉。
 */
const DEFAULT_CODEC = CODECS.find((c) => c.key === 'gzip');

/** 找出这个 payload 该用哪个编解码器；明文（无任何 magic）返回 null。 */
function codecFor(payload) {
  for (let i = 0; i < CODECS_BY_MAGIC_LENGTH.length; i += 1) {
    const codec = CODECS_BY_MAGIC_LENGTH[i];
    if (payload.startsWith(codec.magic)) return codec;
  }
  return null;
}

/** 这个 payload 是不是压缩过的。给存档列表/体积面板这类只想看不想解的地方用。 */
export function isCompressed(payload) {
  return typeof payload === 'string' && codecFor(payload) !== null;
}

// ── 退回明文的显式信号 ───────────────────────────────────
// ⚠️ **静默退回是禁止的。** 一旦静默，以下两种情况在调用方看来完全一样：
//     (a) 浏览器不支持 CompressionStream，存档照常能存（明文，只是大）；
//     (b) 压缩坏了/抛异常，存档也「照常」能存（明文，大）。
//   (b) 会让长卷存档超配额、玩家存不上档，而日志里一个错都没有——
//   这个项目最怕的就是这种「长得像正常」的失效。所以：
//     · encodeSave 退回明文时**一定**写一条 console.warn（只写第一次，避免刷屏）；
//     · lastCodecUsed() / lastFallbackReason() 让调用方能主动查、能显示在界面上。
// 状态是模块级的，只反映**最近一次** encodeSave；调用方必须在调用后立刻读，
// 不要跨多次编码缓存它。
let lastCodec = null;
let fallbackReason = null;
let warnedFallback = false;

/** 最近一次 encodeSave 用的编码器：'gzip' | 'plain'；还没调用过则为 null。 */
export function lastCodecUsed() {
  return lastCodec;
}

/** 最近一次 encodeSave 退回明文的原因；没退回则为 null。 */
export function lastFallbackReason() {
  return fallbackReason;
}

/**
 * 当前环境能不能压缩。
 *
 * ⚠️ 每次都重新探测，**不要在模块加载时缓存结果**。缓存会让一次瞬时失败
 * （比如某个 polyfill 还没装好）被永久固化成「这台机器不支持压缩」，
 * 而那是不可恢复的——之后所有存档都是明文，直到刷新页面为止。
 * 顺带地，不缓存也让探针里「临时删掉 CompressionStream」那一步能真的生效。
 *
 * 同时要求 TextEncoder/TextDecoder：没有它们就没法把中文转成 UTF-8 字节，
 * 此时宁可退回明文（明文路径不需要它们），也不要走到编码中途才抛异常。
 */
export function compressionAvailable() {
  if (typeof CompressionStream !== 'function') return false;
  if (typeof DecompressionStream !== 'function') return false;
  if (typeof TextEncoder !== 'function' || typeof TextDecoder !== 'function') return false;
  // 光看构造器在不在不够：个别实现存在但 `new CompressionStream('gzip')` 会抛
  // （不支持这个 format）。宁可在这里失败一次，也不要等到存档那一刻才发现。
  try {
    new CompressionStream('gzip');
    new DecompressionStream('gzip');
    return true;
  } catch {
    return false;
  }
}

/**
 * 存档字符串 → 可写进 localStorage 的字符串。
 *
 * 成功时返回 `CODEC_MAGIC + base64(gzip(utf8(text)))`；
 * 环境不支持压缩（或压缩中途抛异常）时**退回返回 text 本身**，
 * 并通过 lastCodecUsed() / lastFallbackReason() / console.warn 让调用方察觉。
 *
 * 绝不因为压缩失败而让存档失败：存下一份大一点的明文，永远好过存不上。
 */
export async function encodeSave(text) {
  lastCodec = 'plain';
  fallbackReason = null;

  if (!compressionAvailable()) {
    fallbackReason = 'compression-unavailable';
    warnFallbackOnce('当前环境不支持 CompressionStream，存档将以明文写入（体积约为压缩后的 3~4 倍）');
    return text;
  }

  try {
    const payload = DEFAULT_CODEC.magic + (await DEFAULT_CODEC.compress(text));
    lastCodec = DEFAULT_CODEC.key;
    return payload;
  } catch (error) {
    // 压缩中途炸了（内存不足、实现有 bug）。同样退回明文，但**必须留痕**：
    // 这条路径上的失效正是「存档变大了但没人知道」的源头。
    fallbackReason = `compress-failed: ${error && error.message ? error.message : error}`;
    warnFallbackOnce(`存档压缩失败，已退回明文写入：${fallbackReason}`);
    return text;
  }
}

/**
 * 可写进 localStorage 的字符串 → 存档字符串。**同时认新旧两种格式。**
 *
 * · 无 magic 前缀 → 判定为明文，**原样返回**（老档路径，逐字符不变）；
 * · 有 magic 前缀 → 按对应编解码器解压还原。
 *
 * 前缀命中但解压失败时**抛错**，不退回「原样返回」。理由：原样返回一份压缩数据，
 * 后面 JSON.parse 必然失败，而错误信息会变成一句与真实原因无关的
 * 「Unexpected token 'I'」——真正的原因（存档被截断/损坏）被盖掉了。
 * 抛错让 save.js 现有的 try/catch 打出「存档损坏」，那条路本来就在。
 */
export async function decodeSave(payload) {
  if (typeof payload !== 'string') {
    // localStorage.getItem 在键不存在时返回 null。在这里挡一下，
    // 免得错误信息变成 "Cannot read properties of null" 这种查不出所以然的东西。
    throw new TypeError(`[inkbox] decodeSave 需要一个字符串，收到 ${payload === null ? 'null' : typeof payload}`);
  }
  const codec = codecFor(payload);
  if (!codec) return payload;
  try {
    return await codec.decompress(payload.slice(codec.magic.length));
  } catch (error) {
    throw new Error(
      `[inkbox] 存档解压失败（格式 ${codec.key}）：${error && error.message ? error.message : error}`,
    );
  }
}

/**
 * 这个 payload 占多少码元。**就是 .length。**
 *
 * 单位说明（文档里一直误写成「5 MB 字节」）：localStorage 的配额按
 * **UTF-16 码元**计，per-origin 共享，中文与 ASCII 同价，实测上限 5,242,877。
 * 所以判「这个档还塞不塞得下」必须用 `.length`，不是 UTF-8 字节数——
 * 用字节数判会高估中文存档的体积（中文 1 码元 = 3 字节），
 * 于是本该能存的档被判成存不下。
 */
export function payloadSize(payload) {
  return payload.length;
}

function warnFallbackOnce(message) {
  if (warnedFallback) return;
  warnedFallback = true;
  if (typeof console !== 'undefined' && console.warn) console.warn(`[inkbox/codec] ${message}`);
}
