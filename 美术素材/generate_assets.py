# -*- coding: utf-8 -*-
"""
《坐天观井 / Inkbox》美术素材生成器 v2（精修版）

在 v1 基础上升级：
- 更高分辨率（树 24×36 / 人物 24×30 / 建筑 32×32 / 图标·物品 24×24），
  且 billboard 宽高比与 v1 保持一致（树 2:3、人物 4:5），旧 PlaneGeometry 无需改。
- 全部精灵加「墨线描边 + 三色阶明暗 + 地面投影」，贴近水墨低饱和画风。
- 新增类别：地形贴片 / 特效 / 宗门徽记 / 界面九宫格。

约定（必须与渲染管线一致）：
- 全部 RGBA PNG，背景透明（alpha=0）。
- 推荐 NearestFilter；植被/人物 billboard 用 alphaTest≈0.5。
- Canvas 数组 row 0 = 精灵底部（脚/树根）；写盘时垂直翻转，
  使 PNG 显示方向与 Three.DataTexture(flipY=false) 的渲染方向一致（脚贴地）。
- 调色板取自 src/inkbox/core/config.js。

运行：
  python generate_assets.py
"""
import os
import math
import random
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))

# ───────────────────────────── 调色板 ─────────────────────────────
P = {
    "paper":      (233, 224, 205),
    "paperDeep":  (217, 205, 180),
    "paperShade": (198, 184, 158),
    "mist":       (244, 239, 226),
    "ink":        (34, 32, 28),
    "inkMid":     (74, 70, 62),
    "inkLight":   (125, 119, 107),
    "cinnabar":   (168, 73, 60),
    "azurite":    (63, 95, 125),
    "ochre":      (138, 106, 68),
    "malachite":  (77, 107, 82),
    "gold":       (176, 143, 62),
    "pineGreen":  (63, 90, 69),
    "orchid":     (107, 74, 107),
    "rouge":      (156, 74, 92),
    "indigo":     (49, 80, 95),
    "clay":       (169, 122, 82),
    "soulNatural":(77, 107, 82),
    "soulLinger": (63, 95, 125),
    "soulGhost":  (125, 119, 107),
    "soulWraith": (168, 73, 60),
    "soulGone":   (179, 170, 151),
    "upperA":     (168, 182, 189),
    "upperB":     (143, 167, 184),
    "upperC":     (200, 164, 78),
    "upperD":     (143, 176, 216),
}

# ───────────────────────────── 颜色工具 ─────────────────────────────
def _cl(v):
    return max(0, min(255, int(round(v))))

def mix(a, b, t):
    return (_cl(a[0] + (b[0] - a[0]) * t),
            _cl(a[1] + (b[1] - a[1]) * t),
            _cl(a[2] + (b[2] - a[2]) * t))

def lighten(c, t):
    return mix(c, (255, 255, 255), t)

def darken(c, t):
    return mix(c, (0, 0, 0), t)

def ramp(base):
    """三色阶：亮 / 中 / 暗 / 深。"""
    return {
        "light": lighten(base, 0.26),
        "base":  base,
        "dark":  darken(base, 0.28),
        "deep":  darken(base, 0.50),
    }

INK = P["ink"]

# ───────────────────────────── 画布 ─────────────────────────────
class Canvas:
    def __init__(self, w, h):
        self.w = w; self.h = h
        self.buf = [[(0, 0, 0, 0) for _ in range(w)] for _ in range(h)]

    # ---- 基础 ----
    def set(self, x, y, color, a=255):
        x = int(round(x)); y = int(round(y))
        if 0 <= x < self.w and 0 <= y < self.h:
            if a >= 255:
                self.buf[y][x] = (color[0], color[1], color[2], 255)
            else:
                # 与已有像素混合
                r, g, b, oa = self.buf[y][x]
                if oa == 0:
                    self.buf[y][x] = (color[0], color[1], color[2], a)
                else:
                    na = a / 255.0
                    self.buf[y][x] = (_cl(color[0] * na + r * (1 - na)),
                                      _cl(color[1] * na + g * (1 - na)),
                                      _cl(color[2] * na + b * (1 - na)),
                                      max(oa, a))
    def get(self, x, y):
        x = int(round(x)); y = int(round(y))
        if 0 <= x < self.w and 0 <= y < self.h:
            return self.buf[y][x]
        return (0, 0, 0, 0)

    def rect(self, x0, y0, x1, y1, color, a=255):
        for yy in range(int(y0), int(y1) + 1):
            for xx in range(int(x0), int(x1) + 1):
                self.set(xx, yy, color, a)

    def fill(self, x0, y0, w, h, color, a=255):
        self.rect(x0, y0, x0 + w - 1, y0 + h - 1, color, a)

    def hline(self, x0, x1, y, color, a=255):
        for x in range(int(x0), int(x1) + 1):
            self.set(x, y, color, a)

    def vline(self, x, y0, y1, color, a=255, w=1):
        for y in range(int(y0), int(y1) + 1):
            for dx in range(w):
                self.set(x + dx, y, color, a)

    def disc(self, cx, cy, r, color, a=255):
        for yy in range(int(cy - r), int(cy + r) + 1):
            for xx in range(int(cx - r), int(cx + r) + 1):
                if math.hypot(xx - cx, yy - cy) <= r + 0.35:
                    self.set(xx, yy, color, a)

    def ring(self, cx, cy, r, color, a=255, w=1.0):
        for yy in range(int(cy - r - 1), int(cy + r + 2)):
            for xx in range(int(cx - r - 1), int(cx + r + 2)):
                d = math.hypot(xx - cx, yy - cy)
                if r - w / 2 <= d <= r + w / 2:
                    self.set(xx, yy, color, a)

    def ellipse(self, cx, cy, rx, ry, color, a=255):
        for yy in range(int(cy - ry), int(cy + ry) + 1):
            for xx in range(int(cx - rx), int(cx + rx) + 1):
                if ((xx - cx) / max(rx, 0.001)) ** 2 + ((yy - cy) / max(ry, 0.001)) ** 2 <= 1.0:
                    self.set(xx, yy, color, a)

    def noise(self, x0, y0, x1, y1, colors, seed=0, density=0.2):
        rnd = random.Random(seed)
        for yy in range(int(y0), int(y1) + 1):
            for xx in range(int(x0), int(x1) + 1):
                if rnd.random() < density:
                    self.set(xx, yy, rnd.choice(colors), 255)

    # ---- 修饰 ----
    def outline(self, color=INK, a=255, diag=False):
        """给不透明主体（alpha>=200）描一圈墨线；不描半透明阴影。"""
        src = [[self.buf[y][x][3] >= 200 for x in range(self.w)] for y in range(self.h)]
        offs = [(-1, 0), (1, 0), (0, -1), (0, 1)]
        if diag:
            offs += [(-1, -1), (1, -1), (-1, 1), (1, 1)]
        todo = []
        for y in range(self.h):
            for x in range(self.w):
                if src[y][x]:
                    continue
                if self.buf[y][x][3] != 0:
                    continue
                for dx, dy in offs:
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < self.w and 0 <= ny < self.h and src[ny][nx]:
                        todo.append((x, y)); break
        for (x, y) in todo:
            self.buf[y][x] = (color[0], color[1], color[2], a)

    def shadow(self, cx, cy, rx, ry, a=64):
        """地面投影（在描边之前调用）。"""
        for yy in range(int(cy - ry), int(cy + ry) + 1):
            for xx in range(int(cx - rx), int(cx + rx) + 1):
                if ((xx - cx) / max(rx, 0.001)) ** 2 + ((yy - cy) / max(ry, 0.001)) ** 2 <= 1.0:
                    self.set(xx, yy, INK, a)

    # ---- ASCII 模板 ----
    def ascii(self, rows, cmap, ox=0, oy=0):
        """rows 按阅读顺序（第 0 行在视觉顶部）；放置时翻转到 Canvas 坐标。"""
        n = len(rows)
        for i, line in enumerate(rows):
            cy = oy + (n - 1 - i)   # 顶部行 -> 高 y
            for j, ch in enumerate(line):
                if ch in cmap:
                    col = cmap[ch]
                    if col is None:
                        continue
                    self.set(ox + j, cy, col)

    # ---- 输出 ----
    def to_image(self, flip_y=True):
        img = Image.new("RGBA", (self.w, self.h))
        for yy in range(self.h):
            src_y = (self.h - 1 - yy) if flip_y else yy
            for xx in range(self.w):
                img.putpixel((xx, yy), self.buf[src_y][xx])
        return img

    def save(self, path, flip_y=True):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        self.to_image(flip_y).save(path)
        return path


# ═══════════════════════════ 植被 24×36 ═══════════════════════════
# 约定：row 0 = 树根（地面）。视觉高度 = 数组 y 增大方向。
TW, TH = 24, 36

def _tree_base(trunk_c):
    """画树干 + 地面投影，返回 (canvas, 树干色阶)。"""
    c = Canvas(TW, TH)
    R = ramp(trunk_c)
    c.shadow(12, 1, 7, 2, a=58)
    # 树干：底部粗、向上细
    for y in range(0, 13):
        hw = 2.6 - y * 0.09
        c.rect(12 - hw, y, 12 + hw, y, R["base"])
        c.rect(12 - hw, y, 12 - hw + 0.6, y, R["light"])
        c.rect(12 + hw - 0.6, y, 12 + hw, y, R["deep"])
    # 根部外扩
    c.rect(9, 0, 15, 1, R["base"])
    c.rect(9, 0, 10, 1, R["deep"])
    return c, R

def tree_broadleaf():
    c, R = _tree_base(P["ochre"])
    L = ramp(P["malachite"])
    # 冠层：椭圆分层，上亮下暗
    layers = [(20, 10.5, 8.5), (25, 9.0, 7.0), (29, 6.5, 5.0)]
    for (cy, rx, ry) in layers:
        c.ellipse(12, cy, rx, ry, L["base"])
    # 顶部亮面
    c.ellipse(11, 29, 5.0, 3.6, L["light"])
    # 底部暗面
    for y in range(13, 19):
        w = 9 - abs(y - 15) * 0.7
        c.rect(12 - w, y, 12 + w, y, L["dark"])
    # 叶簇纹理
    rnd = random.Random(5)
    for _ in range(70):
        x = rnd.randint(2, 21); y = rnd.randint(14, 34)
        if c.get(x, y)[3] > 0:
            c.set(x, y, L["dark"] if rnd.random() < 0.5 else L["light"])
    c.outline(INK)
    return c

def tree_pine():
    c, R = _tree_base(P["inkMid"])
    L = ramp(P["pineGreen"])
    # 层叠锥形（下宽上窄）
    tiers = [(11, 9.0), (15, 8.0), (19, 6.6), (23, 5.2), (27, 3.8), (30, 2.4)]
    for i, (y0, hw) in enumerate(tiers):
        for y in range(y0, y0 + 3):
            k = 1.0 - (y - y0) * 0.18
            w = hw * k
            c.rect(12 - w, y, 12 + w, y, L["base"])
            c.rect(12 - w, y, 12 - w + 1, y, L["light"])
            c.rect(12 + w - 1, y, 12 + w, y, L["dark"])
    # 顶部亮尖
    c.rect(11, 32, 13, 34, L["light"])
    c.set(12, 35, L["light"])
    c.outline(INK)
    return c

def tree_snowpine():
    c = tree_pine()
    M = ramp(P["mist"])
    # 每层顶缘积雪
    for (y0, hw) in [(11, 9.0), (15, 8.0), (19, 6.6), (23, 5.2), (27, 3.8), (30, 2.4)]:
        for x in range(int(12 - hw), int(12 + hw) + 1):
            if (x + y0) % 4 != 0:
                c.set(x, y0 + 2, M["base"])
        c.rect(12 - hw * 0.7, y0 + 2, 12 + hw * 0.7, y0 + 2, M["light"])
    c.rect(10, 32, 14, 35, M["light"])
    return c

def tree_bamboo():
    c, R = _tree_base(P["pineGreen"])
    L = ramp(P["malachite"])
    for cx in (8, 12, 16):
        c.rect(cx - 1, 0, cx, 27, L["base"])
        c.vline(cx - 1, 0, 27, L["light"])
        c.vline(cx, 0, 27, L["dark"])
        for y in range(4, 28, 5):     # 竹节
            c.rect(cx - 1, y, cx, y, L["deep"])
    # 竹叶（顶部外展）
    leaves = [(-1, 30), (1, 31), (-2, 27), (2, 28), (-3, 33), (3, 32)]
    for (dx, y) in leaves:
        c.rect(12 + dx * 2, y, 12 + dx * 2 + (1 if dx > 0 else -1), y + 1, L["light"])
    for (cx, y0) in [(8, 24), (16, 22)]:
        c.rect(cx - 4 if cx < 12 else cx + 1, y0, cx - 2 if cx < 12 else cx + 3, y0 + 1, L["base"])
    c.outline(INK)
    return c

def tree_willow():
    c, R = _tree_base(P["ochre"])
    L = ramp(P["malachite"])
    c.ellipse(12, 26, 9.0, 7.5, L["base"])
    c.ellipse(11, 28, 6.5, 5.0, L["light"])
    # 垂柳：向下垂的枝条
    for k in range(-7, 8):
        x = 12 + k
        drop = int(20 - abs(k) * 1.5)
        for y in range(drop, drop - 9, -1):
            if 0 <= y < TH and c.get(x, y)[3] > 0:
                c.set(x, y, L["dark"] if (k + y) % 2 else L["base"])
    # 底部飘散
    rnd = random.Random(9)
    for _ in range(40):
        x = rnd.randint(3, 20); y = rnd.randint(14, 24)
        if c.get(x, y)[3] > 0:
            c.set(x, y, L["dark"])
    c.outline(INK)
    return c

def tree_peach():
    c, R = _tree_base(P["clay"])
    L = ramp(P["malachite"])
    F = ramp(P["rouge"])
    c.ellipse(12, 24, 8.5, 7.5, L["base"])
    c.ellipse(11, 26, 6.0, 5.0, L["light"])
    rnd = random.Random(21)
    for _ in range(46):     # 花簇
        x = rnd.randint(3, 20); y = rnd.randint(15, 33)
        if c.get(x, y)[3] > 0:
            c.set(x, y, F["base"])
            if rnd.random() < 0.4:
                c.set(x, y + 1, F["light"])
    c.outline(INK)
    return c

def tree_spirit():
    c, R = _tree_base(P["ink"])
    L = ramp(P["azurite"])
    c.ellipse(12, 25, 8.0, 7.0, L["base"])
    c.ellipse(11, 27, 5.5, 4.5, L["light"])
    # 灵光点（金）
    G = ramp(P["gold"])
    for (x, y) in [(7, 30), (15, 32), (10, 21), (17, 24), (12, 35), (6, 25), (18, 19)]:
        c.set(x, y, G["light"]); c.set(x + 1, y, G["base"]); c.set(x, y + 1, G["base"])
    # 冷光叶缘
    rnd = random.Random(33)
    for _ in range(40):
        x = rnd.randint(4, 19); y = rnd.randint(16, 33)
        if c.get(x, y)[3] > 0:
            c.set(x, y, L["deep"] if rnd.random() < 0.5 else L["light"])
    c.outline(INK)
    return c

def tree_dead():
    c, R = _tree_base(P["inkMid"])
    D = ramp(P["inkMid"])
    # 主干继续向上
    for y in range(13, 24):
        hw = 2.0 - (y - 13) * 0.08
        c.rect(12 - hw, y, 12 + hw, y, D["base"])
        c.rect(12 - hw, y, 12 - hw + 0.5, y, D["light"])
    # 枝桠
    branches = [(20, -1, 6), (17, 1, 6), (23, -1, 4), (22, 1, 5), (26, -1, 3), (25, 1, 3)]
    for (y, dir_, ln) in branches:
        for k in range(ln):
            c.set(12 + dir_ * k, y + int(k * 0.7), D["base"])
            c.set(12 + dir_ * k, y + int(k * 0.7) + 1, D["deep"] if k % 2 else D["base"])
    c.outline(INK)
    return c

def tree_netherwood():
    c, R = _tree_base(P["soulWraith"])
    L = ramp(P["orchid"])
    c.ellipse(12, 24, 8.0, 7.0, L["base"])
    c.ellipse(11, 26, 5.5, 4.5, L["light"])
    W = ramp(P["soulWraith"])
    rnd = random.Random(7)
    for _ in range(50):     # 怨气/枯叶
        x = rnd.randint(4, 19); y = rnd.randint(15, 33)
        if c.get(x, y)[3] > 0:
            c.set(x, y, W["base"] if rnd.random() < 0.55 else L["deep"])
    c.outline(INK)
    return c

def tree_shrub():
    c = Canvas(TW, TH)
    L = ramp(P["pineGreen"])
    c.shadow(12, 1, 8, 2, a=50)
    for (cx, cy, r) in [(8, 5, 4.5), (16, 5, 4.5), (12, 8, 5.0), (10, 11, 3.6), (14, 11, 3.6)]:
        c.disc(cx, cy, r, L["base"])
    c.ellipse(12, 10, 4.5, 3.0, L["light"])
    rnd = random.Random(13)
    for _ in range(40):
        x = rnd.randint(3, 20); y = rnd.randint(1, 13)
        if c.get(x, y)[3] > 0:
            c.set(x, y, L["dark"] if rnd.random() < 0.5 else L["light"])
    c.outline(INK)
    return c

TREES = {
    "tree_broadleaf": tree_broadleaf,
    "tree_pine": tree_pine,
    "tree_snowpine": tree_snowpine,
    "tree_bamboo": tree_bamboo,
    "tree_willow": tree_willow,
    "tree_peach": tree_peach,
    "tree_spirit": tree_spirit,
    "tree_dead": tree_dead,
    "tree_netherwood": tree_netherwood,
    "tree_shrub": tree_shrub,
}

# ═══════════════════════════ 人物 24×30 ═══════════════════════════
CW, CH = 24, 30

def human(robe, opts=None):
    """人形 24×30，脚在 row 0。

    轮廓按行半宽逐层构建（避免「方块堆叠」感）：
      0..11  袍裙（下宽上窄，带弧线裙摆）
      12     腰带
      13..18 上身（肩宽 > 腰）
      19..20 颈
      21..27 头（削角）
      28..29 发/冠
    两侧另加垂手与袖。
    """
    o = opts or {}
    accent = o.get("accent", P["gold"])
    skin = o.get("skin", P["paper"])
    ghost = o.get("ghost", False)
    beard = o.get("beard", False)
    hat = o.get("hat", None)
    # ⚠️ 鬼魂 alpha 不能太低：150 在纸底上会整体发灰、六阶互相分不清。默认 200。
    alpha = o.get("ghostAlpha", 200) if ghost else 255
    R = ramp(robe); S = ramp(skin); A = ramp(accent)
    CX = 12

    c = Canvas(CW, CH)
    c.shadow(CX, 1, 6.0, 1.8, a=44)

    def span(y):
        if y <= 11:   return 6.1 - y * 0.17          # 裙摆 6.1 -> 4.2
        if y <= 13:   return 4.2                     # 腰
        if y <= 18:   return 4.2 + (y - 13) * 0.26   # 上身 4.2 -> 5.5
        if y <= 20:   return 1.3                     # 颈
        if y <= 27:   return 3.1                     # 头
        return 3.5                                   # 发/冠

    # ---- 主体填充 + 左右明暗 ----
    for y in range(0, 21):
        hw = span(y)
        for x in range(int(round(CX - hw)), int(round(CX + hw)) + 1):
            t = (x - (CX - hw)) / max(2 * hw, 0.001)   # 0 左 .. 1 右
            if y == 12:
                col = A["light"] if t < 0.35 else (A["base"] if t < 0.8 else A["dark"])
            elif t < 0.18:
                col = R["dark"]
            elif t < 0.34:
                col = R["base"]
            elif t > 0.88:
                col = R["light"]
            elif t > 0.70:
                col = R["base"]
            else:
                col = R["base"]
            c.set(x, y, col, alpha)

    # ---- 裙摆弧线：底两行收边 ----
    for x in range(int(CX - 6.1), int(CX + 6.1) + 1):
        if abs(x - CX) > 5.2:
            c.set(x, 0, (0, 0, 0), 0); c.set(x, 1, (0, 0, 0), 0)
    c.hline(int(CX - 5), int(CX + 5), 0, R["deep"], alpha)

    # ---- 裙褶（细，只两条） ----
    c.vline(CX - 2, 1, 10, R["dark"], alpha)
    c.vline(CX + 2, 1, 10, R["dark"], alpha)

    # ---- 交领（V 形衣襟） ----
    for k in range(3):
        c.set(CX - 1 - k, 18 - k, R["deep"], alpha)
        c.set(CX + 1 + k, 18 - k, R["deep"], alpha)
    c.set(CX, 16, R["deep"], alpha)

    # ---- 垂手与袖 ----
    for y in range(11, 19):
        hw = span(min(y, 18))
        for dx in (1, 2):
            xl = int(CX - hw) - dx; xr = int(CX + hw) + dx
            c.set(xl, y, R["dark"] if dx == 2 else R["base"], alpha)
            c.set(xr, y, R["light"] if dx == 2 else R["base"], alpha)
    # 手
    for y in (10, 11):
        c.rect(int(CX - span(13)) - 2, y, int(CX - span(13)) - 1, y, S["base"], alpha)
        c.rect(int(CX + span(13)) + 1, y, int(CX + span(13)) + 2, y, S["base"], alpha)

    # ---- 颈 ----
    c.rect(CX - 1, 19, CX, 20, S["dark"], alpha)

    # ---- 头（削角） ----
    for y in range(21, 28):
        hw = 3.1
        if y == 21 or y == 27:
            hw = 2.4
        for x in range(int(round(CX - hw)), int(round(CX + hw)) + 1):
            t = (x - (CX - hw)) / max(2 * hw, 0.001)
            col = S["light"] if t > 0.80 else (S["dark"] if t < 0.24 else S["base"])
            c.set(x, y, col, alpha)
    # 发际阴影（额下压暗）
    for x in range(int(CX - 3), int(CX + 4)):
        c.set(x, 26, S["dark"], alpha)
    # 眼（间距 3px）
    c.set(CX - 2, 24, INK, alpha); c.set(CX - 1, 24, INK, alpha)
    c.set(CX + 1, 24, INK, alpha); c.set(CX + 2, 24, INK, alpha)
    c.set(CX - 2, 25, INK, alpha); c.set(CX + 2, 25, INK, alpha)   # 眼尾下垂
    # 鼻影
    c.set(CX, 23, S["dark"], alpha)
    # 嘴
    c.set(CX, 22, S["dark"], alpha)
    # 腮影
    c.set(CX - 3, 23, S["dark"], alpha); c.set(CX + 3, 23, S["dark"], alpha)

    # ---- 须（自下颌垂至胸前） ----
    if beard:
        for y in range(14, 21):
            w = 2.4 + (20 - y) * 0.22
            c.rect(CX - w, y, CX + w, y, P["mist"], alpha)
        c.set(CX - 4, 20, P["mist"], alpha); c.set(CX + 4, 20, P["mist"], alpha)
        c.set(CX - 4, 19, P["paperShade"], alpha)
        c.set(CX + 4, 19, P["paperShade"], alpha)

    # ---- 发 / 冠 ----
    if hat == "crown":
        c.rect(CX - 3, 28, CX + 3, 28, INK, alpha)
        c.rect(CX - 3, 29, CX + 3, 29, A["base"], alpha)
        c.set(CX, 29, A["light"], alpha)
        c.set(CX - 3, 27, INK, alpha); c.set(CX + 3, 27, INK, alpha)
    elif hat == "topknot":
        c.rect(CX - 3, 28, CX + 3, 28, INK, alpha)
        c.rect(CX - 1, 29, CX + 1, 29, INK, alpha)
        c.set(CX, 28, A["base"], alpha)
    else:
        c.rect(CX - 3, 28, CX + 3, 28, INK, alpha)
        c.set(CX - 3, 27, INK, alpha); c.set(CX + 3, 27, INK, alpha)
        c.set(CX - 4, 26, INK, alpha); c.set(CX + 4, 26, INK, alpha)   # 鬓

    # ---- 仙门徽记（胸口） ----
    c.set(CX, 14, A["light"], alpha)
    c.set(CX - 1, 14, A["base"], alpha); c.set(CX + 1, 14, A["base"], alpha)
    c.set(CX, 15, A["base"], alpha)

    # ---- 描边 ----
    c.outline(INK, a=alpha)
    return c

def make_chars():
    out = {}
    out["char_commoner"] = human(P["clay"], {"accent": P["ochre"]})
    out["char_cultivator_red"] = human(P["cinnabar"], {"accent": P["gold"], "hat": "crown"})
    out["char_cultivator_blue"] = human(P["azurite"], {"accent": P["mist"], "hat": "topknot"})
    out["char_cultivator_gold"] = human(P["gold"], {"accent": P["cinnabar"], "hat": "crown"})
    out["char_cultivator_green"] = human(P["malachite"], {"accent": P["gold"], "hat": "topknot"})
    out["char_immortal"] = human(P["upperA"], {"accent": P["gold"], "skin": P["mist"], "hat": "crown"})
    out["char_elder"] = human(P["paperDeep"], {"accent": P["ochre"], "beard": True, "hat": "crown"})
    out["char_child"] = human(P["rouge"], {"accent": P["mist"]})
    out["char_ghost"] = human(P["soulGhost"], {"accent": P["inkLight"], "ghost": True})
    out["char_wraith"] = human(P["soulWraith"], {"accent": INK, "ghost": True})
    # 孩童矮一点
    ch = out["char_child"]
    for y in range(1, CH):
        for x in range(CW):
            if y > 24:
                ch.buf[y][x] = (0, 0, 0, 0)
    return out

# ═══════════════════════════ 建筑 32×32 ═══════════════════════════
BW, BH = 32, 32

def bld_hut():
    c = Canvas(BW, BH)
    W = ramp(P["paperDeep"]); T = ramp(P["ochre"]); D = ramp(P["ink"])
    c.shadow(16, 1, 11, 2.4, a=54)
    c.rect(5, 2, 26, 15, W["base"])                 # 墙
    c.rect(5, 2, 6, 15, W["dark"])
    c.rect(25, 2, 26, 15, W["light"])
    c.rect(6, 6, 10, 10, D["base"])                 # 窗
    c.rect(21, 6, 25, 10, D["base"])
    c.rect(13, 2, 18, 9, D["deep"])                 # 门
    c.rect(14, 2, 17, 9, D["base"])
    # 茅顶（两坡）
    for k in range(7):
        c.rect(2 + k, 16 + k, 29 - k, 16 + k, T["base"])
    c.rect(2, 16, 29, 17, T["dark"])
    rnd = random.Random(3)
    for _ in range(60):
        x = rnd.randint(3, 28); y = rnd.randint(17, 22)
        if c.get(x, y)[3] > 0:
            c.set(x, y, T["light"] if rnd.random() < 0.5 else T["dark"])
    c.outline(INK)
    return c

def bld_hall():
    c = Canvas(BW, BH)
    R = ramp(P["cinnabar"]); D = ramp(P["inkMid"]); G = ramp(P["gold"])
    c.shadow(16, 1, 13, 2.4, a=54)
    # 台基
    c.rect(4, 2, 27, 4, P["paperShade"])
    c.rect(4, 2, 27, 2, P["paperDeep"])
    # 殿身
    c.rect(6, 5, 25, 20, R["base"])
    c.rect(6, 5, 7, 20, R["dark"])
    c.rect(24, 5, 25, 20, R["light"])
    # 柱
    for x in (8, 12, 19, 23):
        c.vline(x, 5, 20, R["deep"])
    # 门
    c.rect(13, 5, 18, 14, D["deep"])
    c.rect(14, 5, 17, 14, D["base"])
    # 窗
    c.rect(9, 10, 11, 14, G["base"]); c.rect(20, 10, 22, 14, G["base"])
    # 檐（多层翘角）
    for k in range(4):
        c.rect(2 + k, 21 + k, 29 - k, 21 + k, D["base"])
    c.rect(2, 21, 29, 22, D["deep"])
    # 翘角
    c.set(1, 24, D["base"]); c.set(0, 25, D["base"])
    c.set(30, 24, D["base"]); c.set(31, 25, D["base"])
    # 匾
    c.rect(13, 17, 18, 19, G["base"])
    c.rect(14, 18, 17, 18, G["light"])
    c.outline(INK)
    return c

def bld_pagoda():
    c = Canvas(BW, BH)
    W = ramp(P["paperDeep"]); D = ramp(P["inkMid"]); G = ramp(P["gold"])
    c.shadow(16, 1, 9, 2.2, a=54)
    tiers = [(2, 13), (11, 11), (20, 8)]
    for (y0, w) in tiers:
        c.rect(16 - w // 2, y0, 16 + w // 2, y0 + 7, W["base"])
        c.rect(16 - w // 2, y0, 16 - w // 2 + 1, y0 + 7, W["dark"])
        c.rect(16 - 1, y0 + 1, 16 + 1, y0 + 7, D["base"])     # 门洞
        # 檐
        c.rect(16 - w // 2 - 2, y0 + 8, 16 + w // 2 + 2, y0 + 8, D["base"])
        c.rect(16 - w // 2 - 3, y0 + 8, 16 + w // 2 + 3, y0 + 8, D["deep"])
    # 顶刹
    c.rect(14, 29, 17, 30, G["base"])
    c.rect(15, 31, 16, 31, G["light"])
    c.outline(INK)
    return c

def bld_archway():
    c = Canvas(BW, BH)
    D = ramp(P["inkMid"]); R = ramp(P["cinnabar"]); G = ramp(P["gold"])
    c.shadow(16, 1, 13, 2.2, a=50)
    # 立柱
    for x in (5, 24):
        c.rect(x, 2, x + 2, 24, D["base"])
        c.rect(x, 2, x, 24, D["light"])
        c.rect(x + 2, 2, x + 2, 24, D["deep"])
    # 额枋
    c.rect(3, 25, 28, 29, R["base"])
    c.rect(3, 25, 28, 26, R["dark"])
    c.rect(3, 29, 28, 29, R["light"])
    # 匾
    c.rect(11, 26, 20, 28, G["base"])
    c.rect(12, 27, 19, 27, G["light"])
    # 檐角
    c.set(2, 30, D["base"]); c.set(29, 30, D["base"])
    c.outline(INK)
    return c

def bld_stele():
    c = Canvas(BW, BH)
    S = ramp(P["inkLight"]); B = ramp(P["inkMid"]); W = ramp(P["soulWraith"])
    c.shadow(16, 1, 9, 2.2, a=56)
    c.rect(9, 3, 22, 6, B["base"])                 # 基座
    c.rect(9, 3, 22, 4, B["dark"])
    c.rect(13, 7, 18, 27, S["base"])               # 碑身
    c.rect(13, 7, 14, 27, S["light"])
    c.rect(18, 7, 18, 27, S["dark"])
    c.rect(11, 27, 20, 28, S["deep"])              # 碑首
    rnd = random.Random(17)
    for _ in range(60):                            # 裂纹
        x = rnd.randint(13, 18); y = rnd.randint(8, 26)
        c.set(x, y, S["dark"] if rnd.random() < 0.6 else S["deep"])
    c.rect(15, 12, 16, 22, W["base"])              # 刻痕/怨气
    c.set(15, 10, W["light"]); c.set(16, 24, W["dark"])
    c.outline(INK)
    return c

def bld_bridge():
    c = Canvas(BW, BH)
    W = ramp(P["paperDeep"]); D = ramp(P["inkMid"])
    c.shadow(16, 1, 15, 2.0, a=48)
    # 桥面（缓拱）：deck 由左到右
    for k in range(26):
        x = 3 + k
        y = 8 + int(3.2 * math.sin(math.pi * k / 25))
        c.rect(x, y, x, y + 1, W["base"])
        c.set(x, y, W["light"]); c.set(x, y + 2, W["dark"])
    # 栏杆立柱
    for k in range(0, 26, 3):
        x = 3 + k
        y = 8 + int(3.2 * math.sin(math.pi * k / 25))
        c.rect(x, y + 3, x, y + 5, D["base"])
    c.rect(3, 13, 28, 14, D["base"])            # 栏杆横杆
    # 拱券（桥洞）
    for k in range(14):
        x = 9 + k
        y = 3 + int(4.5 * math.sin(math.pi * k / 13))
        c.set(x, y, D["deep"]); c.set(x, y + 1, D["dark"])
    # 桥墩
    c.rect(4, 2, 8, 9, W["base"])
    c.rect(4, 2, 8, 2, W["dark"])
    c.rect(23, 2, 27, 9, W["base"])
    c.rect(23, 2, 27, 2, W["dark"])
    c.outline(INK)
    return c

def bld_wall():
    c = Canvas(BW, BH)
    W = ramp(P["paperShade"]); D = ramp(P["inkMid"])
    c.shadow(16, 1, 15, 2.0, a=48)
    c.rect(0, 2, 31, 12, W["base"])                # 墙身
    c.rect(0, 2, 31, 3, W["dark"])
    for x in range(0, 32, 6):                      # 砖缝
        c.vline(x, 3, 12, W["dark"])
    for y in (6, 9):
        c.hline(0, 31, y, W["dark"])
    for x in range(2, 30, 6):                      # 垛口
        c.rect(x, 13, x + 3, 15, W["base"])
        c.rect(x, 15, x + 3, 15, W["light"])
    c.outline(INK)
    return c

def bld_altar():
    c = Canvas(BW, BH)
    S = ramp(P["paperDeep"]); D = ramp(P["inkMid"]); G = ramp(P["gold"]); C = ramp(P["cinnabar"])
    c.shadow(16, 1, 12, 2.4, a=54)
    c.rect(5, 2, 26, 5, S["base"])                 # 底座
    c.rect(5, 2, 26, 2, S["dark"])
    c.rect(8, 6, 23, 11, S["base"])
    c.rect(8, 6, 8, 11, S["light"])
    c.rect(12, 12, 19, 17, S["base"])              # 中层
    c.rect(12, 12, 12, 17, S["light"])
    c.rect(14, 18, 17, 21, D["base"])              # 台面
    # 香炉 + 灵光
    c.rect(14, 22, 17, 24, C["base"])
    c.set(15, 26, G["light"]); c.set(16, 27, G["base"]); c.set(15, 28, G["light"])
    c.rect(12, 25, 19, 25, G["base"])
    c.outline(INK)
    return c

BUILDINGS = {
    "bld_hut": bld_hut, "bld_hall": bld_hall, "bld_pagoda": bld_pagoda,
    "bld_archway": bld_archway, "bld_stele": bld_stele, "bld_bridge": bld_bridge,
    "bld_wall": bld_wall, "bld_altar": bld_altar,
}

# ═══════════════════════════ 图标 24×24 ═══════════════════════════
IW, IH = 24, 24

def icon_base():
    c = Canvas(IW, IH)
    # 圆角纸底 + 细墨边
    c.rect(2, 2, 21, 21, P["paper"])
    for (x, y) in [(2, 2), (21, 2), (2, 21), (21, 21)]:
        c.set(x, y, (0, 0, 0), 0)
    c.outline(P["inkLight"])
    return c

def _pixel_outline(c):
    c.outline(P["ink"])

def icon_inspect():
    c = icon_base()
    c.ring(12, 13, 6.0, P["ink"], w=1.6)
    c.disc(12, 13, 2.6, P["cinnabar"])
    c.set(11, 11, P["mist"])
    c.rect(4, 7, 8, 8, P["paper"])
    return c

def icon_raise():
    c = icon_base()
    c.rect(4, 15, 19, 19, ramp(P["malachite"])["base"])
    c.rect(4, 15, 19, 15, ramp(P["malachite"])["light"])
    for k in range(5):
        c.rect(12 - k, 14 - k, 12 + k, 14 - k, ramp(P["pineGreen"])["base"])
    G = ramp(P["gold"])
    c.rect(11, 4, 12, 9, G["base"])
    c.rect(9, 6, 14, 7, G["base"])
    c.set(11, 9, G["light"]); c.set(12, 9, G["light"])
    return c

def icon_lower():
    c = icon_base()
    c.rect(4, 16, 19, 19, ramp(P["azurite"])["base"])
    c.rect(4, 16, 19, 16, ramp(P["azurite"])["light"])
    for k in range(5):
        c.rect(12 - k, 15 - k, 12 + k, 15 - k, ramp(P["indigo"])["base"])
    G = ramp(P["gold"])
    c.rect(11, 11, 12, 16, G["base"])
    c.rect(9, 13, 14, 14, G["base"])
    c.set(11, 11, G["light"]); c.set(12, 11, G["light"])
    return c

def icon_flatten():
    c = icon_base()
    c.rect(4, 13, 19, 16, ramp(P["ochre"])["base"])
    c.rect(4, 13, 19, 13, ramp(P["ochre"])["light"])
    c.rect(4, 17, 19, 19, ramp(P["clay"])["base"])
    G = ramp(P["gold"])
    c.rect(4, 9, 19, 10, G["base"])
    c.set(6, 8, G["light"]); c.set(17, 8, G["light"])
    return c

def icon_smooth():
    c = icon_base()
    c.rect(4, 15, 19, 19, ramp(P["malachite"])["base"])
    for x in range(4, 20):
        y = 13 - int(3.2 * math.sin((x - 4) / 15 * math.pi))
        c.set(x, y, ramp(P["pineGreen"])["base"])
        c.set(x, y - 1, ramp(P["pineGreen"])["light"])
    return c

def icon_undo():
    c = icon_base()
    c.ring(12, 13, 6.0, P["ink"], w=1.6)
    c.rect(11, 8, 12, 13, P["ink"])
    c.set(9, 8, P["ink"]); c.set(10, 7, P["ink"])
    c.set(9, 9, P["ink"])
    c.set(16, 13, P["cinnabar"])
    return c

def icon_focus():
    c = icon_base()
    C = ramp(P["cinnabar"])["base"]
    c.rect(4, 5, 6, 6, C); c.rect(17, 5, 19, 6, C)
    c.rect(4, 18, 6, 19, C); c.rect(17, 18, 19, 19, C)
    c.rect(11, 11, 12, 12, C)
    c.ring(12, 12, 4.0, C, w=1.0)
    return c

def icon_watch():
    """记挂：眼 + 心"""
    c = icon_base()
    c.ring(11, 12, 5.0, P["ink"], w=1.5)
    c.disc(11, 12, 2.0, P["azurite"])
    R = ramp(P["cinnabar"])["base"]
    c.rect(16, 8, 18, 9, R); c.rect(20, 8, 22, 9, R)
    c.rect(16, 9, 22, 10, R)
    c.rect(17, 10, 21, 11, R)
    c.rect(18, 11, 20, 12, R)
    c.set(19, 12, R)
    return c

def icon_realm():
    """三界：三重同心方"""
    c = icon_base()
    c.rect(4, 4, 19, 19, ramp(P["upperA"])["base"])
    c.rect(7, 7, 16, 16, ramp(P["soulGhost"])["base"])
    c.rect(10, 10, 13, 13, ramp(P["malachite"])["base"])
    return c

def icon_water():
    c = icon_base()
    A = ramp(P["azurite"])
    for row, y0 in enumerate((8, 12, 16)):
        for x in range(5, 20):
            yy = y0 + (1 if (x + row * 3) % 6 < 3 else 0)
            c.set(x, yy, A["base"])
            c.set(x, yy + 1, A["dark"])
            c.set(x, yy - 1, A["light"])
    return c

def icon_pause():
    c = icon_base()
    c.rect(8, 7, 10, 17, P["ink"])
    c.rect(14, 7, 16, 17, P["ink"])
    return c

def icon_play():
    c = icon_base()
    for k in range(10):
        y0 = 7 + k; y1 = 17 - k
        if y0 <= y1:
            c.rect(8 + k, y0, 8 + k, y1, P["ink"])
    return c

ICONS = {
    "icon_inspect": icon_inspect, "icon_raise": icon_raise, "icon_lower": icon_lower,
    "icon_flatten": icon_flatten, "icon_smooth": icon_smooth, "icon_undo": icon_undo,
    "icon_focus": icon_focus, "icon_watch": icon_watch, "icon_realm": icon_realm,
    "icon_water": icon_water, "icon_pause": icon_pause, "icon_play": icon_play,
}

# ═══════════════════════════ 物品 24×24 ═══════════════════════════
def item_base():
    return Canvas(IW, IH)

def item_sword():
    c = item_base()
    B = ramp(P["mist"]); G = ramp(P["gold"]); R = ramp(P["cinnabar"])
    for k in range(13):                       # 剑身（斜向）
        x = 5 + k; y = 19 - k
        c.rect(x, y, x + 1, y, B["base"])
        c.set(x, y, B["light"]); c.set(x + 1, y, B["dark"])
    c.rect(16, 2, 18, 4, B["light"])          # 剑尖
    c.rect(4, 18, 7, 21, G["base"])           # 护手
    c.rect(3, 20, 5, 23, G["dark"])
    c.rect(4, 21, 6, 23, R["base"])           # 穗
    c.outline(P["ink"])
    return c

def item_furnace():
    c = item_base()
    D = ramp(P["inkMid"]); O = ramp(P["ochre"]); F = ramp(P["cinnabar"]); G = ramp(P["gold"])
    c.rect(5, 4, 18, 16, D["base"])           # 炉身
    c.rect(5, 4, 6, 16, D["light"])
    c.rect(17, 4, 18, 16, D["deep"])
    c.rect(3, 14, 20, 17, O["base"])          # 顶沿
    c.rect(3, 14, 20, 14, O["light"])
    c.rect(9, 17, 14, 20, F["base"])          # 火
    c.rect(10, 18, 13, 21, F["light"])
    c.set(11, 21, G["light"]); c.set(12, 22, G["base"])
    c.outline(P["ink"])
    return c

def item_jade():
    c = item_base()
    M = ramp(P["malachite"]); G = ramp(P["gold"])
    c.rect(7, 2, 16, 21, M["base"])
    c.rect(7, 2, 8, 21, M["light"])
    c.rect(15, 2, 16, 21, M["deep"])
    c.vline(10, 3, 20, M["dark"]); c.vline(13, 3, 20, M["dark"])
    c.rect(7, 2, 16, 3, M["light"])
    c.set(9, 6, G["light"]); c.set(12, 12, G["base"]); c.set(14, 17, G["light"])
    c.outline(P["ink"])
    return c

def item_lingzhi():
    c = item_base()
    O = ramp(P["ochre"]); R = ramp(P["rouge"]); C = ramp(P["cinnabar"]); G = ramp(P["gold"])
    c.rect(11, 4, 12, 15, O["base"])          # 柄
    c.rect(11, 4, 11, 15, O["light"])
    c.ellipse(12, 15, 8, 4.5, R["base"])      # 芝盖
    c.ellipse(11, 16, 6, 3.2, C["base"])
    c.ellipse(10, 17, 3.5, 1.8, C["light"])
    for (x, y) in [(7, 14), (16, 14), (12, 18)]:
        c.set(x, y, G["base"])
    c.outline(P["ink"])
    return c

def item_talisman():
    c = item_base()
    Y = ramp(P["gold"]); R = ramp(P["cinnabar"])
    c.rect(8, 1, 15, 22, Y["base"])
    c.rect(8, 1, 9, 22, Y["light"])
    c.rect(14, 1, 15, 22, Y["dark"])
    c.rect(10, 3, 13, 20, R["base"])
    for y in range(4, 20, 2):                 # 符文
        c.rect(11, y, 12, y, Y["light"])
    c.outline(P["ink"])
    return c

def item_gourd():
    c = item_base()
    C = ramp(P["ochre"]); G = ramp(P["gold"])
    c.disc(12, 7, 4.0, C["base"])             # 下腹
    c.disc(12, 15, 5.0, C["base"])            # 上腹
    c.ellipse(10, 15, 2.5, 3.0, C["light"])
    c.rect(10, 19, 13, 21, C["dark"])         # 塞
    c.set(12, 4, G["base"]); c.set(11, 11, G["base"])
    c.outline(P["ink"])
    return c

def item_mirror():
    c = item_base()
    M = ramp(P["inkLight"]); G = ramp(P["gold"])
    c.disc(12, 15, 7.0, M["base"])
    c.ring(12, 15, 7.0, G["base"], w=1.2)
    c.disc(11, 16, 4.0, M["light"])
    c.set(10, 17, P["mist"]); c.set(11, 18, P["mist"])
    c.rect(11, 2, 12, 8, G["dark"])           # 柄
    c.outline(P["ink"])
    return c

def item_cauldron():
    c = item_base()
    D = ramp(P["inkMid"]); G = ramp(P["gold"]); A = ramp(P["azurite"])
    c.rect(4, 6, 19, 18, D["base"])
    c.rect(4, 6, 5, 18, D["light"])
    c.rect(18, 6, 19, 18, D["deep"])
    c.rect(2, 5, 21, 7, D["base"]); c.rect(2, 5, 21, 5, D["light"])   # 口沿
    c.rect(2, 4, 4, 5, D["base"]); c.rect(19, 4, 21, 5, D["base"])    # 双耳
    for x in (7, 12, 16):
        c.rect(x, 2, x + 1, 4, A["base"])     # 三足/烟
    c.rect(9, 9, 14, 12, G["base"])
    c.outline(P["ink"])
    return c

ITEMS = {
    "item_sword": item_sword, "item_furnace": item_furnace, "item_jade": item_jade,
    "item_lingzhi": item_lingzhi, "item_talisman": item_talisman, "item_gourd": item_gourd,
    "item_mirror": item_mirror, "item_cauldron": item_cauldron,
}

# ═══════════════════════════ 地形贴片 32×32 ═══════════════════════════
GW, GH = 32, 32

def terrain_tile(base, accents, seed, speckle=0.16, pattern="noise"):
    c = Canvas(GW, GH)
    R = ramp(base)
    c.rect(0, 0, GW - 1, GH - 1, R["base"])
    rnd = random.Random(seed)
    for y in range(GH):
        for x in range(GW):
            r = rnd.random()
            if r < speckle:
                c.set(x, y, rnd.choice([R["light"], R["dark"]]))
    if pattern == "tuft":                     # 草丛短线
        for _ in range(26):
            x = rnd.randint(1, GW - 2); y = rnd.randint(1, GH - 2)
            c.set(x, y, R["dark"]); c.set(x, y + 1, R["dark"])
            c.set(x, y - 1, R["light"])
    elif pattern == "rock":                   # 碎石块
        for _ in range(14):
            x = rnd.randint(2, GW - 4); y = rnd.randint(2, GH - 4)
            w = rnd.randint(2, 4); h = rnd.randint(2, 3)
            c.rect(x, y, x + w, y + h, R["dark"])
            c.rect(x, y, x + w, y, R["light"])
    elif pattern == "wave":                   # 水波
        for y in range(2, GH - 2, 5):
            for x in range(GW):
                if (x + y) % 7 < 4:
                    c.set(x, y, R["light"])
                    c.set(x, y + 1, R["dark"])
    elif pattern == "crack":                  # 焦土裂纹
        for _ in range(8):
            x = rnd.randint(2, GW - 3); y = rnd.randint(2, GH - 3)
            for k in range(rnd.randint(4, 9)):
                c.set(x + k, y + int(k * 0.5) % 3, R["deep"])
    for col in accents:
        for _ in range(5):
            x = rnd.randint(1, GW - 2); y = rnd.randint(1, GH - 2)
            c.set(x, y, col)
    return c

def make_terrain():
    return {
        "terr_grass":     terrain_tile(P["malachite"], [P["gold"]], 101, 0.18, "tuft"),
        "terr_forest":    terrain_tile(P["pineGreen"], [P["malachite"]], 102, 0.22, "tuft"),
        "terr_rock":      terrain_tile(P["inkLight"], [P["inkMid"]], 103, 0.18, "rock"),
        "terr_sand":      terrain_tile(P["clay"], [P["paperDeep"]], 104, 0.14, "noise"),
        "terr_snow":      terrain_tile(P["paperDeep"], [P["mist"]], 105, 0.12, "noise"),
        "terr_marsh":     terrain_tile(P["indigo"], [P["malachite"]], 106, 0.20, "wave"),
        "terr_scorched":  terrain_tile(P["inkMid"], [P["cinnabar"]], 107, 0.16, "crack"),
        "terr_nether":    terrain_tile(P["orchid"], [P["soulWraith"]], 108, 0.20, "crack"),
        "terr_water":     terrain_tile(P["azurite"], [P["mist"]], 109, 0.10, "wave"),
        "terr_upper":     terrain_tile(P["upperB"], [P["gold"]], 110, 0.14, "noise"),
    }

# ═══════════════════════════ 特效 32×32 ═══════════════════════════
FXW, FXH = 32, 32

def fx_qi():
    c = Canvas(FXW, FXH)
    A = ramp(P["azurite"]); G = ramp(P["gold"])
    for (cx, cy, r) in [(16, 16, 3.0), (16, 16, 6.0)]:
        c.ring(cx, cy, r, A["light"], a=170, w=1.2)
    c.disc(16, 16, 2.0, A["base"])
    c.disc(16, 16, 1.0, P["mist"])
    for (x, y) in [(16, 27), (16, 5), (5, 16), (27, 16)]:
        c.set(x, y, G["light"])
    return c

def fx_swordflash():
    c = Canvas(FXW, FXH)
    B = ramp(P["mist"]); G = ramp(P["gold"])
    # 主刃（斜向 45°）
    for k in range(19):
        x = 5 + k; y = 26 - k
        c.set(x, y, B["light"])
        c.set(x, y + 1, B["base"], a=170)
        c.set(x, y - 1, B["base"], a=170)
        c.set(x + 1, y, B["dark"], a=110)
    # 刃尖光晕
    for (dx, dy) in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
        c.set(24 + dx, 7 + dy, B["light"], a=200)
    c.set(25, 6, B["light"], a=150)
    # 柄
    for k in range(5):
        c.set(3 - k, 28 + k, G["base"])
    return c

def fx_rift():
    c = Canvas(FXW, FXH)
    D = ramp(P["orchid"]); W = ramp(P["soulWraith"]); G = ramp(P["gold"])
    # 主裂隙：暗核 + 两侧紫晕 + 亮缘
    for y in range(0, 32):
        x = 16 + int(3.0 * math.sin(y * 0.48))
        c.set(x, y, P["ink"], 235)
        c.set(x - 1, y, D["deep"], 200)
        c.set(x + 1, y, D["deep"], 200)
        if y % 3 == 0:
            c.set(x - 2, y, D["base"], 150)
            c.set(x + 2, y, D["base"], 150)
        if y % 5 == 0:
            c.set(x - 3, y, W["light"], 170)
            c.set(x + 3, y, W["light"], 170)
    # 上下端点闪光
    c.set(16, 31, G["light"], 220); c.set(16, 0, G["light"], 220)
    c.set(15, 30, G["base"], 170); c.set(17, 1, G["base"], 170)
    return c

def fx_mist():
    c = Canvas(FXW, FXH)
    M = ramp(P["mist"])
    rnd = random.Random(77)
    for _ in range(7):
        cx = rnd.randint(8, 24); cy = rnd.randint(9, 23); r = rnd.randint(4, 7)
        c.ellipse(cx, cy, r, r * 0.5, M["base"], a=110)
        c.ellipse(cx - 1, cy + 1, r * 0.6, r * 0.3, M["light"], a=90)
    return c

def fx_impact():
    c = Canvas(FXW, FXH)
    W = ramp(P["mist"]); R = ramp(P["cinnabar"])
    c.ring(16, 16, 11.0, W["light"], a=190, w=1.6)
    c.ring(16, 16, 7.0, R["base"], a=150, w=1.2)
    for (x, y) in [(16, 3), (16, 29), (3, 16), (29, 16)]:
        c.set(x, y, W["light"])
    return c

def fx_yinwisp():
    c = Canvas(FXW, FXH)
    S = ramp(P["soulGhost"]); P2 = ramp(P["orchid"])
    for k in range(5):
        y = 6 + k * 5
        x = 16 + int(3 * math.sin(k * 1.2))
        r = 4.5 - k * 0.6
        c.ellipse(x, y, r, r * 0.8, S["base"], a=150)
        c.ellipse(x, y, r * 0.5, r * 0.4, S["light"], a=120)
    c.set(16, 30, P2["light"], 190)
    return c

def fx_heal():
    c = Canvas(FXW, FXH)
    L = ramp(P["malachite"]); G = ramp(P["gold"])
    c.rect(13, 6, 18, 25, L["base"], a=200)
    c.rect(9, 11, 22, 15, L["base"], a=200)
    c.rect(13, 6, 18, 25, L["light"], a=90)
    c.rect(9, 11, 22, 15, L["light"], a=90)
    for (x, y) in [(16, 16), (10, 8), (22, 8), (10, 24), (22, 24)]:
        c.set(x, y, G["light"])
    return c

def fx_dust():
    c = Canvas(FXW, FXH)
    O = ramp(P["ochre"])
    rnd = random.Random(91)
    for _ in range(34):
        x = rnd.randint(4, 27); y = rnd.randint(2, 20)
        r = rnd.choice([1, 1, 1.6, 2.2])
        c.disc(x, y, r, O["base"] if rnd.random() < 0.6 else O["light"], a=rnd.randint(90, 190))
    return c

def make_fx():
    return {
        "fx_qi": fx_qi, "fx_swordflash": fx_swordflash, "fx_rift": fx_rift,
        "fx_mist": fx_mist, "fx_impact": fx_impact, "fx_yinwisp": fx_yinwisp,
        "fx_heal": fx_heal, "fx_dust": fx_dust,
    }

# ═══════════════════════════ 宗门徽记 24×24 ═══════════════════════════
def emblem(base, accent, motif):
    c = Canvas(IW, IH)
    B = ramp(base); A = ramp(accent)
    c.ring(12, 12, 10.0, B["base"], w=1.6)
    c.disc(12, 12, 8.6, B["dark"])
    c.disc(12, 12, 8.0, B["base"])
    if motif == "sun":
        c.disc(12, 13, 3.6, A["base"])
        for k in range(6):
            ang = k * math.pi / 3
            c.set(12 + 6 * math.cos(ang), 13 + 6 * math.sin(ang), A["light"])
    elif motif == "wave":
        for y in (9, 12, 15):
            for x in range(6, 19):
                if (x + y) % 4 < 3:
                    c.set(x, y, A["base"])
    elif motif == "peak":
        for k in range(7):
            c.rect(12 - k, 8 + k, 12 + k, 8 + k, A["base"])
        c.set(12, 8, A["light"])
    elif motif == "leaf":
        c.ellipse(12, 12, 3.0, 5.5, A["base"])
        c.vline(12, 7, 17, A["light"])
        c.set(10, 9, A["light"]); c.set(14, 14, A["light"])
    elif motif == "moon":
        c.disc(12, 12, 5.0, A["base"])
        c.disc(14, 13, 4.2, B["base"])
    else:  # dot
        c.disc(12, 12, 3.0, A["base"])
    c.outline(P["ink"])
    return c

def make_emblems():
    return {
        "emblem_zhu":  emblem(P["cinnabar"], P["gold"], "sun"),
        "emblem_dian": emblem(P["azurite"], P["mist"], "wave"),
        "emblem_teng": emblem(P["gold"], P["cinnabar"], "peak"),
        "emblem_song": emblem(P["malachite"], P["gold"], "leaf"),
        "emblem_zi":   emblem(P["orchid"], P["mist"], "moon"),
        "emblem_mortal": emblem(P["clay"], P["ochre"], "dot"),
        "emblem_upper":  emblem(P["upperB"], P["gold"], "sun"),
        "emblem_nether": emblem(P["orchid"], P["soulWraith"], "moon"),
    }

# ═══════════════════════════ 界面 九宫格 ═══════════════════════════
def panel_nineslice():
    """48×48 九宫格面板：四角 16px 固定，边可拉伸。"""
    c = Canvas(48, 48)
    B = P["paper"]; D = P["paperDeep"]; S = P["paperShade"]; I = P["inkLight"]
    c.rect(0, 0, 47, 47, B)
    # 内阴影
    c.rect(2, 2, 45, 45, D)
    c.rect(4, 4, 43, 43, B)
    # 边线
    for x in range(48):
        c.set(x, 0, I); c.set(x, 47, I)
    for y in range(48):
        c.set(0, y, I); c.set(47, y, I)
    # 内描边
    for x in range(4, 44):
        c.set(x, 3, S); c.set(x, 44, S)
    for y in range(4, 44):
        c.set(3, y, S); c.set(44, y, S)
    # 四角装饰（回纹）
    for (ox, oy) in [(0, 0), (48 - 8, 0), (0, 48 - 8), (48 - 8, 48 - 8)]:
        c.rect(ox + 1, oy + 1, ox + 6, oy + 1, P["inkMid"])
        c.rect(ox + 1, oy + 1, ox + 1, oy + 6, P["inkMid"])
        c.rect(ox + 3, oy + 3, ox + 4, oy + 4, P["cinnabar"])
    return c

def button_base():
    c = Canvas(32, 16)
    B = ramp(P["paperDeep"]); I = P["inkLight"]
    c.rect(0, 0, 31, 15, B["base"])
    c.rect(1, 1, 30, 1, B["light"])
    c.rect(1, 14, 30, 14, B["dark"])
    c.rect(1, 1, 1, 14, B["light"])
    c.rect(30, 1, 30, 14, B["dark"])
    c.outline(I)
    return c

def divider():
    c = Canvas(48, 8)
    I = P["inkLight"]
    for x in range(48):
        c.set(x, 4, I)
    c.rect(0, 3, 3, 5, P["inkMid"])
    c.rect(44, 3, 47, 5, P["inkMid"])
    c.set(23, 3, P["cinnabar"]); c.set(24, 3, P["cinnabar"])
    c.set(23, 5, P["cinnabar"]); c.set(24, 5, P["cinnabar"])
    return c

def scroll_header():
    c = Canvas(48, 20)
    B = ramp(P["paperDeep"]); R = ramp(P["cinnabar"]); G = ramp(P["gold"])
    c.rect(4, 4, 43, 15, B["base"])
    c.rect(4, 4, 43, 4, B["light"])
    c.rect(4, 15, 43, 15, B["dark"])
    for (x0, x1) in [(2, 5), (42, 45)]:
        c.rect(x0, 2, x1, 17, R["base"])
        c.rect(x0, 2, x1, 2, R["light"])
    c.rect(20, 8, 27, 11, G["base"])
    c.outline(P["ink"])
    return c

def make_ui():
    return {
        "ui_panel_9slice": panel_nineslice,
        "ui_button": button_base,
        "ui_divider": divider,
        "ui_scroll_header": scroll_header,
    }

# ═══════════════════════════ 纹理 ═══════════════════════════
def tex_paper():
    W = H = 256
    c = Canvas(W, H)
    rnd = random.Random(42)
    base = P["paper"]
    for y in range(H):
        for x in range(W):
            n = rnd.randint(-13, 13)
            c.buf[y][x] = (_cl(base[0] + n), _cl(base[1] + n), _cl(base[2] + n), 255)
    for _ in range(700):                       # 纤维斑
        x, y = rnd.randint(0, W - 1), rnd.randint(0, H - 1)
        c.disc(x, y, rnd.choice([1, 1, 1, 2, 2, 3]), P["paperShade"], a=rnd.randint(60, 140))
    for _ in range(120):                       # 深纤维
        x, y = rnd.randint(0, W - 1), rnd.randint(0, H - 1)
        c.disc(x, y, 1, P["inkMid"], a=rnd.randint(40, 90))
    for _ in range(10):                        # 水渍
        x, y = rnd.randint(20, W - 20), rnd.randint(20, H - 20)
        c.ring(x, y, rnd.randint(8, 22), P["paperShade"], a=40, w=2.0)
    return c

def tex_inksplat():
    W = H = 96
    c = Canvas(W, H)
    rnd = random.Random(11)
    cx, cy = W // 2, H // 2
    for _ in range(2600):
        ang = rnd.uniform(0, 2 * math.pi)
        rad = (rnd.random() ** 1.5) * 40
        x = cx + math.cos(ang) * rad
        y = cy + math.sin(ang) * rad * 0.82
        a = 255 if rnd.random() > 0.28 else rnd.randint(150, 230)
        c.set(x, y, P["ink"], a)
    for _ in range(60):                        # 飞溅点
        ang = rnd.uniform(0, 2 * math.pi)
        rad = 40 + rnd.random() * 8
        c.disc(cx + math.cos(ang) * rad, cy + math.sin(ang) * rad * 0.82,
               rnd.choice([1, 1, 2]), P["ink"], a=rnd.randint(120, 220))
    return c

def make_textures():
    return {"tex_paper": tex_paper, "tex_inksplat": tex_inksplat}

# ══════════ 地形贴片 · 23 种（逐字对应 config.js TERRAIN_INFO） ══════════
# ⭐ 颜色直接取自 src/inkbox/core/config.js 的 TERRAIN_INFO，保证与模拟层完全一致。
#    将来 3D 地形按 world.type[] 取贴片时是 1:1 映射，不需要再调色。
TERRAIN_PAL = [
    ("DEEP",     "渊",   (66, 80, 92),    "wave"),
    ("OCEAN",    "海",   (88, 102, 113),  "wave"),
    ("SEA",      "泽",   (116, 128, 137), "wave"),
    ("SHALLOW",  "浅滩", (152, 162, 167), "wave"),
    ("SAND",     "汀",   (214, 205, 178), "grain"),
    ("GRASS",    "草原", (160, 168, 132), "tuft"),
    ("MEADOW",   "芳甸", (176, 182, 146), "tuft"),
    ("FOREST",   "林",   (104, 126, 96),  "tuft"),
    ("JUNGLE",   "密林", (68, 92, 70),    "tuft"),
    ("SAVANNA",  "疏林", (189, 178, 130), "tuft"),
    ("DESERT",   "荒漠", (222, 178, 116), "dune"),
    ("TUNDRA",   "冻原", (198, 195, 178), "grain"),
    ("SWAMP",    "泽薮", (116, 121, 94),  "marsh"),
    ("ROCK",     "石",   (152, 147, 136), "rock"),
    ("MOUNTAIN", "山",   (124, 120, 111), "rock"),
    ("PEAK",     "峻岭", (102, 99, 92),   "rock"),
    ("SNOW",     "雪峰", (240, 236, 224), "grain"),
    ("FARMLAND", "田",   (201, 184, 120), "field"),
    ("SCORCHED", "焦土", (75, 65, 55),    "crack"),
    ("ASH",      "烬",   (88, 84, 78),    "crack"),
    ("LAVA",     "熔岩", (193, 87, 59),   "lava"),
    ("RUINS",    "废墟", (142, 135, 120), "rubble"),
    ("ROAD",     "径",   (188, 174, 144), "grain"),
]

def terrain_tile_v2(base, seed, pattern):
    """32×32 可平铺地形贴片。base 用 TERRAIN_INFO 原色，明暗由 ramp 派生。"""
    c = Canvas(GW, GH)
    R = ramp(base)
    c.rect(0, 0, GW - 1, GH - 1, R["base"])
    rnd = random.Random(seed)
    # 基础颗粒
    for y in range(GH):
        for x in range(GW):
            r = rnd.random()
            if r < 0.17:
                c.set(x, y, R["light"] if r < 0.085 else R["dark"])
    if pattern == "wave":
        for y in range(3, GH - 2, 6):
            for x in range(GW):
                if (x + y) % 8 < 5:
                    c.set(x, y, R["light"]); c.set(x, y + 1, R["dark"])
        for _ in range(6):
            x, y = rnd.randint(1, GW - 4), rnd.randint(1, GH - 2)
            c.rect(x, y, x + 2, y, R["light"])
    elif pattern == "tuft":
        for _ in range(30):
            x, y = rnd.randint(1, GW - 2), rnd.randint(2, GH - 2)
            c.set(x, y, R["dark"]); c.set(x, y + 1, R["dark"])
            c.set(x, y - 1, R["light"])
            if rnd.random() < 0.4:
                c.set(x + 1, y - 2, R["light"])
    elif pattern == "dune":
        for y in range(2, GH - 2, 7):
            for x in range(GW):
                yy = y + int(1.6 * math.sin(x * 0.45))
                c.set(x, yy, R["light"]); c.set(x, yy + 1, R["dark"])
    elif pattern == "grain":
        for _ in range(40):
            x, y = rnd.randint(1, GW - 2), rnd.randint(1, GH - 2)
            c.set(x, y, R["light"] if rnd.random() < 0.5 else R["dark"])
    elif pattern == "marsh":
        for _ in range(9):
            x, y = rnd.randint(2, GW - 6), rnd.randint(2, GH - 6)
            c.ellipse(x, y, rnd.randint(3, 5), rnd.randint(2, 3), R["dark"])
            c.ellipse(x, y - 1, rnd.randint(2, 3), 1, R["light"])
    elif pattern == "rock":
        for _ in range(16):
            x, y = rnd.randint(2, GW - 5), rnd.randint(2, GH - 5)
            w, h = rnd.randint(3, 5), rnd.randint(2, 4)
            c.rect(x, y, x + w, y + h, R["dark"])
            c.rect(x, y, x + w, y, R["light"])
            c.set(x, y + h, R["deep"])
    elif pattern == "field":
        for y in range(1, GH - 1, 4):                 # 田垄
            c.hline(0, GW - 1, y, R["dark"])
            c.hline(0, GW - 1, y + 1, R["light"])
        for x in range(0, GW, 8):
            c.vline(x, 0, GH - 1, R["deep"])
    elif pattern == "crack":
        for _ in range(9):
            x, y = rnd.randint(2, GW - 3), rnd.randint(2, GH - 3)
            for k in range(rnd.randint(5, 11)):
                c.set(x + k, y + int(k * 0.5) % 4, R["deep"])
    elif pattern == "lava":
        for _ in range(7):                            # 裂缝里的亮浆
            x, y = rnd.randint(2, GW - 8), rnd.randint(2, GH - 6)
            for k in range(rnd.randint(6, 12)):
                yy = y + int(2 * math.sin(k * 0.6))
                c.set(x + k, yy, lighten(base, 0.45))
                c.set(x + k, yy + 1, lighten(base, 0.22))
                c.set(x + k, yy - 1, R["deep"])
        for _ in range(10):
            x, y = rnd.randint(2, GW - 4), rnd.randint(2, GH - 4)
            c.rect(x, y, x + 2, y + 2, darken(base, 0.42))
    elif pattern == "rubble":
        for _ in range(18):
            x, y = rnd.randint(2, GW - 5), rnd.randint(2, GH - 5)
            w, h = rnd.randint(2, 4), rnd.randint(2, 3)
            c.rect(x, y, x + w, y + h, R["light"])
            c.rect(x, y + h, x + w, y + h, R["deep"])
    return c

def make_terrain_full():
    out = {}
    for i, (key, _name, col, pat) in enumerate(TERRAIN_PAL):
        out["terr_" + key.lower()] = (lambda c=col, s=i, p=pat: terrain_tile_v2(c, 200 + s, p))
    return out

# ══════════ 人物 · 七境界（炼气→大乘，对应 core/cultivation.js REALMS） ══════════
# 境界色取自 core/cultivation.js 的 REALMS[].color，保证与面板/图例一致。
REALM_STYLE = [
    ("lianqi",  "炼气", (111, 122, 99),  None,        False),
    ("zhuji",   "筑基", (93, 122, 114),  "topknot",   False),
    ("jindan",  "金丹", (176, 143, 62),  "crown",     False),
    ("yuanying", "元婴", (107, 74, 107), "crown",     True),
    ("huashen", "化神", (63, 95, 125),   "crown",     True),
    ("heti",    "合体", (49, 80, 95),    "crown",     True),
    # 大乘：上界境界。⚠️ 不能用 upperA(168,182,189)——与纸底(233,224,205)太近，人物会「消失」。
    # 改用 upperB 并给更强金环。
    ("dacheng", "大乘", (143, 167, 184), "crown",     True),
]

def make_realm_chars():
    out = {}
    for (key, name, col, hat, halo) in REALM_STYLE:
        skin = P["mist"] if key == "dacheng" else P["paper"]
        cv = human(col, {"accent": P["gold"], "hat": hat, "skin": skin})
        if halo:
            # 灵光：头顶光环 + 身周灵气点（越高阶越亮）
            G = ramp(P["gold"] if key in ("jindan", "dacheng") else col)
            c = cv
            # 大乘：更强金环 + 云气
            if key == "dacheng":
                c.ring(12, 31, 6.2, P["gold"], a=220, w=1.4)
                c.ring(12, 31, 4.6, P["mist"], a=190, w=1.0)
            else:
                c.ring(12, 31, 5.0, G["light"], a=150, w=1.0)
            for (x, y) in [(4, 18), (20, 18), (3, 9), (21, 9), (12, 33)]:
                c.set(x, y, G["light"], 190)
                c.set(x, y + 1, G["base"], 140)
        out["char_realm_" + key] = cv
    return out

# ══════════ 幽冥 · 鬼修六阶（游魂→鬼帝，对应 06 册设定） ══════════
GHOST_STYLE = [
    # key, 名, 袍色, 冠, 阶（0..5）
    # ⚠️ 游魂原用 (179,170,151) 太浅，与纸底几乎同色 ⇒ 改用 soulGhost。
    ("youhun",   "游魂", (125, 119, 107), None,     0),
    ("yuanling", "怨灵", (63, 95, 125),   None,     1),
    ("ligui",    "厉鬼", (168, 73, 60),   None,     2),
    ("guijiang", "鬼将", (156, 74, 92),   "topknot", 3),
    ("guiwang",  "鬼王", (107, 74, 107),  "crown",  4),
    ("guidi",    "鬼帝", (34, 32, 28),    "crown",  5),
]

def make_ghost_tiers():
    out = {}
    for (key, name, col, hat, tier) in GHOST_STYLE:
        cv = human(col, {"accent": P["soulWraith"] if tier >= 2 else P["inkLight"],
                         "hat": hat, "ghost": True, "ghostAlpha": 200})
        # 阴气：越高阶越浓（底部拖尾 + 怨气点）
        rnd = random.Random(400 + tier)
        for k in range(tier + 1):
            y = 0 + k
            for x in range(8 - k, 17 + k):
                if 0 <= y < CH:
                    cv.set(x, y, col, 70 - k * 9)
        for _ in range(tier * 4):
            x, y = rnd.randint(6, 18), rnd.randint(1, 28)
            cv.set(x, y, P["soulWraith"] if tier >= 3 else P["soulGhost"], 150)
        out["ghost_" + key] = cv
    return out

# ══════════ 建筑 · STRUCT 五件 + 宗门扩展 ══════════
def bld_struct_house():
    return bld_hut()

def bld_struct_hall():
    return bld_hall()

def bld_struct_wall():
    return bld_wall()

def bld_struct_tower():
    c = Canvas(BW, BH)
    W = ramp(P["paperDeep"]); D = ramp(P["inkMid"]); R = ramp(P["cinnabar"])
    c.shadow(16, 1, 8, 2.0, a=52)
    c.rect(11, 2, 21, 22, W["base"])                 # 塔身
    c.rect(11, 2, 12, 22, W["dark"])
    c.rect(20, 2, 21, 22, W["light"])
    for y in (6, 11, 16):                            # 箭窗
        c.rect(15, y, 17, y + 2, D["deep"])
    for k in range(4):                               # 顶檐
        c.rect(8 + k, 23 + k, 24 - k, 23 + k, D["base"])
    c.rect(8, 23, 24, 24, D["deep"])
    c.rect(14, 27, 18, 28, R["base"])                # 顶灯
    c.set(16, 29, P["gold"])
    c.outline(INK)
    return c

def bld_struct_ruin():
    c = Canvas(BW, BH)
    S = ramp(P["inkLight"]); D = ramp(P["inkMid"])
    c.shadow(16, 1, 12, 2.2, a=48)
    # 残墙：高低不齐
    heights = [(4, 9), (7, 13), (11, 6), (14, 16), (18, 10), (21, 14), (25, 7)]
    for (x, h) in heights:
        c.rect(x, 2, x + 2, h, S["base"])
        c.rect(x, 2, x, h, S["light"])
        c.rect(x + 2, 2, x + 2, h, S["dark"])
    c.rect(4, 2, 27, 3, D["deep"])
    rnd = random.Random(55)                          # 散落碎石
    for _ in range(14):
        x, y = rnd.randint(3, 28), rnd.randint(4, 9)
        c.rect(x, y, x + rnd.randint(1, 2), y, S["dark"])
    c.outline(INK)
    return c

def bld_sect_gate():
    """山门：双柱 + 三层檐 + 匾"""
    c = Canvas(BW, BH)
    D = ramp(P["inkMid"]); R = ramp(P["cinnabar"]); G = ramp(P["gold"])
    c.shadow(16, 1, 13, 2.2, a=52)
    for x in (5, 24):
        c.rect(x, 2, x + 2, 26, D["base"])
        c.rect(x, 2, x, 26, D["light"])
        c.rect(x + 2, 2, x + 2, 26, D["deep"])
    for (y, inset) in [(27, 0), (30, 2)]:
        c.rect(3 + inset, y, 28 - inset, y + 1, D["base"])
        c.rect(3 + inset, y + 1, 28 - inset, y + 1, D["deep"])
    c.rect(4, 24, 27, 26, R["base"])
    c.rect(4, 24, 27, 24, R["dark"])
    c.rect(12, 25, 19, 26, G["base"])
    c.outline(INK)
    return c

def bld_sect_library():
    """藏经阁：多层 + 书卷纹"""
    c = Canvas(BW, BH)
    W = ramp(P["paperDeep"]); D = ramp(P["inkMid"]); G = ramp(P["gold"])
    c.shadow(16, 1, 10, 2.2, a=52)
    for (y0, w) in [(2, 16), (12, 14), (22, 11)]:
        c.rect(16 - w // 2, y0, 16 + w // 2, y0 + 8, W["base"])
        c.rect(16 - w // 2, y0, 16 - w // 2 + 1, y0 + 8, W["dark"])
        c.rect(16 - w // 2 + 2, y0 + 3, 16 + w // 2 - 2, y0 + 4, G["base"])
        c.rect(16 - w // 2 - 1, y0 + 9, 16 + w // 2 + 1, y0 + 9, D["base"])
    c.rect(14, 30, 17, 31, G["light"])
    c.outline(INK)
    return c

def bld_sect_alchemy():
    """炼丹房：矮屋 + 烟囱 + 丹烟"""
    c = Canvas(BW, BH)
    W = ramp(P["paperDeep"]); T = ramp(P["ochre"]); D = ramp(P["inkMid"])
    c.shadow(16, 1, 12, 2.2, a=52)
    c.rect(5, 2, 26, 15, W["base"])
    c.rect(5, 2, 6, 15, W["dark"])
    c.rect(13, 2, 18, 9, D["deep"])
    for k in range(6):
        c.rect(2 + k, 16 + k, 29 - k, 16 + k, T["base"])
    c.rect(21, 20, 24, 26, T["dark"])               # 烟囱
    for k, (x, y) in enumerate([(22, 28), (23, 30), (21, 31)]):   # 丹烟
        c.disc(x, y, 1.6 - k * 0.3, P["mist"], a=150 - k * 30)
    c.outline(INK)
    return c

def bld_sect_arena():
    """练功场：圆台 + 木桩"""
    c = Canvas(BW, BH)
    S = ramp(P["paperShade"]); D = ramp(P["inkMid"]); O = ramp(P["ochre"])
    c.shadow(16, 1, 13, 2.2, a=50)
    c.ellipse(16, 6, 13, 5.0, S["base"])
    c.ellipse(16, 7, 11, 4.0, S["light"])
    c.ellipse(16, 5, 13, 3.4, S["dark"])
    for (x, h) in [(6, 12), (11, 15), (16, 13), (21, 16), (25, 11)]:   # 木桩
        c.rect(x, 8, x + 1, h, O["base"])
        c.set(x, h + 1, O["light"])
        c.rect(x, 12, x + 1, 12, O["deep"])
    c.outline(INK)
    return c

def bld_sect_field():
    """灵田：垄 + 灵苗"""
    c = Canvas(BW, BH)
    F = ramp(P["clay"]); L = ramp(P["malachite"]); G = ramp(P["gold"])
    c.rect(0, 0, BW - 1, 12, F["base"])
    for y in range(1, 12, 3):
        c.hline(0, BW - 1, y, F["dark"])
        c.hline(0, BW - 1, y + 1, F["light"])
    rnd = random.Random(66)
    for _ in range(16):                              # 灵苗
        x = rnd.randint(1, BW - 2); y = rnd.randint(1, 10)
        c.set(x, y + 2, L["base"]); c.set(x, y + 1, L["light"])
        if rnd.random() < 0.3:
            c.set(x, y + 3, G["base"])
    c.outline(INK)
    return c

def bld_sect_array():
    """护山大阵：石柱 + 阵纹光圈"""
    c = Canvas(BW, BH)
    S = ramp(P["paperShade"]); A = ramp(P["azurite"]); G = ramp(P["gold"])
    c.rect(2, 2, 29, 4, S["base"])
    c.rect(2, 2, 29, 2, S["dark"])
    for x in (4, 11, 20, 27):                        # 石柱
        c.rect(x, 5, x + 2, 18, S["base"])
        c.rect(x, 5, x, 18, S["light"])
        c.rect(x + 2, 5, x + 2, 18, S["dark"])
    for (cx, cy, r) in [(16, 20, 9.0), (16, 20, 6.0)]:   # 阵纹
        c.ring(cx, cy, r, A["light"], a=200, w=1.0)
    c.rect(15, 19, 16, 21, G["base"])
    for (x, y) in [(7, 22), (25, 22), (16, 28)]:
        c.set(x, y, G["light"])
    c.outline(INK)
    return c

STRUCTS = {
    "struct_house": bld_struct_house, "struct_hall": bld_struct_hall,
    "struct_wall": bld_struct_wall, "struct_tower": bld_struct_tower,
    "struct_ruin": bld_struct_ruin,
    "bld_sect_gate": bld_sect_gate, "bld_sect_library": bld_sect_library,
    "bld_sect_alchemy": bld_sect_alchemy, "bld_sect_arena": bld_sect_arena,
    "bld_sect_field": bld_sect_field, "bld_sect_array": bld_sect_array,
}

# ══════════ 浮空岛（M0 明确列为「后续阶段」） ══════════
def isle(size, seed, ruined=False):
    """浮空岛：上表面 + 倒锥基座 + 底部云气。size: 1/2/3"""
    W, H = 48, 40
    c = Canvas(W, H)
    R = ramp(P["rock"] if "rock" in P else P["inkLight"])
    L = ramp(P["malachite"] if not ruined else P["ochre"])
    top_w = {1: 14, 2: 22, 3: 30}[size]
    top_y = 26
    # 上表面（草/岩）
    c.ellipse(W // 2, top_y, top_w, top_w * 0.34, L["base"])
    c.ellipse(W // 2, top_y + 1, top_w * 0.9, top_w * 0.28, L["light"])
    if ruined:
        rnd = random.Random(seed)
        for _ in range(20):
            x = rnd.randint(W // 2 - top_w, W // 2 + top_w)
            y = rnd.randint(top_y - 4, top_y + 3)
            c.set(x, y, P["inkMid"])
    # 倒锥基座
    for k in range(top_w * 2 + 1):
        depth = int((1 - abs(k - top_w) / top_w) * 18)
        x = W // 2 - top_w + k
        for y in range(top_y - 1, top_y - 1 - depth, -1):
            if y < 0:
                break
            t = (top_y - 1 - y) / max(depth, 1)
            c.set(x, y, R["dark"] if t < 0.5 else R["deep"])
    # 底部云气
    rnd = random.Random(seed + 9)
    for _ in range(9):
        x = rnd.randint(W // 2 - top_w, W // 2 + top_w)
        y = rnd.randint(2, 8)
        c.ellipse(x, y, rnd.randint(4, 7), rnd.randint(2, 3), P["mist"], a=110)
    c.outline(INK)
    return c

def make_isles():
    return {
        "isle_small":  lambda: isle(1, 71),
        "isle_medium": lambda: isle(2, 72),
        "isle_large":  lambda: isle(3, 73),
        "isle_ruin":   lambda: isle(2, 74, ruined=True),   # 文案 G02-05「半截断山」
        "isle_bridge": lambda: isle_bridge(),
    }

def isle_bridge():
    """仙桥：连接两座浮空岛"""
    c = Canvas(48, 24)
    W = ramp(P["paperDeep"]); G = ramp(P["gold"])
    c.shadow(24, 2, 20, 2.0, a=40)
    for k in range(40):
        x = 4 + k
        y = 6 + int(2.6 * math.sin(math.pi * k / 39))
        c.set(x, y, W["base"]); c.set(x, y + 1, W["dark"])
    for k in range(0, 40, 5):                        # 栏杆
        x = 4 + k
        y = 6 + int(2.6 * math.sin(math.pi * k / 39))
        c.set(x, y + 2, G["base"]); c.set(x, y + 3, G["dark"])
    c.rect(4, 9, 43, 10, G["base"])
    c.outline(INK)
    return c

# ══════════ 上界 · 紫霄风物 ══════════
def up_palace():
    """仙宫：白/青玉色，云纹，比凡间殿宇更瘦更高"""
    c = Canvas(BW, BH)
    W = ramp(P["upperA"]); C = ramp(P["upperB"]); G = ramp(P["gold"])
    c.shadow(16, 1, 12, 2.2, a=44)
    c.rect(7, 2, 24, 20, W["base"])
    c.rect(7, 2, 8, 20, W["light"])
    c.rect(23, 2, 24, 20, C["dark"])
    for x in (10, 15, 21):
        c.vline(x, 5, 20, C["base"])
    c.rect(13, 2, 18, 13, C["deep"])
    for k in range(5):                               # 瘦高檐
        c.rect(4 + k, 21 + k, 27 - k, 21 + k, W["light"])
    c.rect(4, 21, 27, 22, C["base"])
    c.set(3, 26, C["base"]); c.set(28, 26, C["base"])
    c.rect(12, 17, 19, 19, G["base"])                # 匾
    c.rect(15, 25, 16, 27, G["light"])               # 顶饰
    c.outline(INK)
    return c

def up_terrace():
    """云台 / 听云坪：圆形平台 + 云气"""
    c = Canvas(BW, BH)
    W = ramp(P["upperA"]); C = ramp(P["upperB"])
    c.ellipse(16, 8, 14, 6.0, W["base"])
    c.ellipse(16, 9, 12, 4.6, W["light"])
    c.ellipse(16, 7, 14, 3.6, C["base"])
    for (x, y) in [(4, 16), (26, 18), (16, 22), (9, 20), (23, 14)]:   # 云气
        c.ellipse(x, y, 5, 2.4, P["mist"], a=130)
    c.ellipse(16, 3, 13, 2.6, W["dark"])
    c.outline(INK)
    return c

def up_ladder():
    """天梯：自云下伸上来的长阶"""
    c = Canvas(BW, BH)
    W = ramp(P["upperA"]); C = ramp(P["upperB"]); G = ramp(P["gold"])
    for k in range(16):
        y = 2 + k * 1.9
        w = 5 + k * 0.5
        c.rect(16 - w, y, 16 + w, y + 1, W["base"])
        c.rect(16 - w, y + 1, 16 + w, y + 1, C["dark"])
    for k in range(0, 16, 3):
        y = 2 + k * 1.9
        w = 5 + k * 0.5
        c.set(16 - w - 1, y, G["base"]); c.set(16 + w + 1, y, G["base"])
    c.ellipse(16, 3, 9, 2.0, P["mist"], a=140)
    c.outline(INK)
    return c

def up_crane():
    """仙鹤"""
    c = Canvas(32, 32)
    W = ramp(P["mist"]); R = ramp(P["cinnabar"]); K = ramp(P["ink"])
    c.ellipse(17, 16, 7.0, 4.2, W["base"])           # 身
    c.ellipse(17, 17, 5.5, 3.0, W["light"])
    c.ellipse(10, 21, 3.2, 3.0, W["base"])           # 颈/头
    c.disc(9, 24, 1.8, W["light"])
    c.set(8, 24, K["base"])                          # 眼
    c.rect(7, 23, 8, 24, R["base"])                  # 丹顶
    for k in range(6):                               # 翅
        c.set(19 + k, 20 + int(k * 0.4), W["base"])
        c.set(19 + k, 19 + int(k * 0.4), W["dark"])
    for k in range(5):                               # 腿
        c.set(15 + k, 12 - k, K["base"])
        c.set(19 + k, 11 - k, K["base"])
    c.outline(INK)
    return c

def up_peak():
    """浮峰：云海里的尖峰"""
    c = Canvas(BW, BH)
    R = ramp(P["upperB"]); W = ramp(P["upperA"]); M = ramp(P["mist"])
    for k in range(15):
        c.rect(16 - k, 6 + k, 16 + k, 6 + k, R["base"])
        c.rect(16 - k, 6 + k, 16 - k, 6 + k, W["light"])
    c.rect(12, 6, 20, 7, W["light"])                 # 雪顶
    for (x, y) in [(6, 22), (26, 24), (16, 26)]:
        c.ellipse(x, y, 6, 2.4, M["base"], a=120)
    c.outline(INK)
    return c

UPPER_PROPS = {
    "upper_palace": up_palace, "upper_terrace": up_terrace, "upper_ladder": up_ladder,
    "upper_crane": up_crane, "upper_peak": up_peak,
}

# ══════════ 幽冥 · 冥河风物 ══════════
def ne_gate():
    """鬼门关：黑石巨门 + 阴气"""
    c = Canvas(BW, BH)
    D = ramp(P["inkMid"]); S = ramp(P["soulGhost"]); W = ramp(P["soulWraith"])
    c.shadow(16, 1, 13, 2.2, a=56)
    c.rect(4, 2, 27, 5, D["deep"])
    for x in (5, 24):                                # 门柱
        c.rect(x, 5, x + 3, 24, D["base"])
        c.rect(x, 5, x, 24, D["light"])
        c.rect(x + 3, 5, x + 3, 24, D["deep"])
    c.rect(6, 25, 25, 28, D["base"])                 # 门楣
    c.rect(6, 28, 25, 29, D["deep"])
    c.rect(11, 26, 20, 27, S["dark"])                # 匾
    c.rect(14, 26, 17, 27, W["base"])
    # 门内的阴气
    for k in range(5):
        c.ellipse(16, 8 + k * 3, 5 - k * 0.5, 1.6, S["base"], a=90 - k * 10)
    c.outline(INK)
    return c

def ne_bridge():
    """奈何桥：窄石拱桥，桥下冥河"""
    c = Canvas(BW, BH)
    S = ramp(P["soulGhost"]); D = ramp(P["inkMid"]); R = ramp(P["indigo"])
    c.rect(0, 2, BW - 1, 7, R["deep"])               # 冥河
    for y in range(2, 8, 3):
        for x in range(BW):
            if (x + y) % 7 < 4:
                c.set(x, y, R["base"])
    for k in range(24):                              # 桥拱
        x = 4 + k
        y = 9 + int(4.5 * math.sin(math.pi * k / 23))
        c.set(x, y, S["base"]); c.set(x, y + 1, S["dark"])
    for k in range(0, 24, 4):                        # 栏杆
        x = 4 + k
        y = 9 + int(4.5 * math.sin(math.pi * k / 23))
        c.set(x, y + 2, D["base"])
    c.outline(INK)
    return c

def ne_river():
    """冥河贴片：横向水流（可平铺）"""
    c = Canvas(GW, GH)
    R = ramp(P["indigo"]); S = ramp(P["soulGhost"])
    c.rect(0, 0, GW - 1, GH - 1, R["deep"])
    rnd = random.Random(88)
    for y in range(1, GH - 1, 4):
        for x in range(GW):
            if (x + y) % 9 < 6:
                c.set(x, y, R["base"])
                c.set(x, y + 1, R["light"])
    for _ in range(22):                              # 幽光
        x, y = rnd.randint(1, GW - 2), rnd.randint(1, GH - 2)
        c.set(x, y, S["light"], 170)
    return c

def ne_city():
    """鬼城：密集灰黑屋群"""
    c = Canvas(BW, BH)
    D = ramp(P["inkMid"]); S = ramp(P["soulGhost"]); W = ramp(P["soulWraith"])
    c.shadow(16, 1, 15, 2.2, a=54)
    blocks = [(3, 2, 6, 10), (10, 2, 5, 16), (16, 2, 6, 12), (23, 2, 6, 8),
              (6, 13, 5, 12), (12, 17, 6, 14), (19, 11, 5, 10)]
    for (x, y, w, h) in blocks:
        c.rect(x, y, x + w - 1, y + h - 1, D["base"])
        c.rect(x, y, x, y + h - 1, D["light"])
        c.rect(x + w - 1, y, x + w - 1, y + h - 1, D["deep"])
        for yy in range(y + 2, y + h - 1, 4):        # 幽火窗
            c.set(x + 2, yy, W["base"]); c.set(x + w - 3, yy, S["light"])
    c.outline(INK)
    return c

def ne_pool():
    """魂池：一圈石栏围着的光池"""
    c = Canvas(BW, BH)
    S = ramp(P["soulGhost"]); A = ramp(P["azurite"]); M = ramp(P["mist"])
    c.ellipse(16, 8, 13, 6.5, S["dark"])
    c.ellipse(16, 9, 11, 5.2, A["base"])
    c.ellipse(16, 10, 8, 3.6, M["base"], a=170)
    for k in range(10):                              # 石栏
        ang = k * math.pi * 2 / 10
        c.rect(16 + 12 * math.cos(ang), 8 + 5.4 * math.sin(ang),
               16 + 12 * math.cos(ang) + 1, 8 + 5.4 * math.sin(ang) + 1, S["base"])
    c.outline(INK)
    return c

def ne_lotus():
    """轮回莲：幽冥三物之一"""
    c = Canvas(32, 32)
    P2 = ramp(P["orchid"]); G = ramp(P["gold"]); M = ramp(P["mist"])
    c.ellipse(16, 12, 10, 4.0, P2["dark"])
    for k in range(7):                               # 花瓣
        ang = math.pi + k * math.pi / 6
        for r in range(2, 9):
            x = 16 + r * math.cos(ang) * 1.5
            y = 12 + r * math.sin(ang) * 0.8
            c.set(x, y, P2["base"] if r < 6 else P2["light"])
    c.disc(16, 13, 3.2, G["base"])
    c.disc(16, 14, 2.0, G["light"])
    c.set(16, 12, M["light"])
    for k in range(6):                               # 莲茎/光
        c.set(16, 4 + k, P2["deep"] if k % 2 else P2["base"])
    c.outline(INK)
    return c

def ne_talisman(kind):
    """幽冥符：聚阴符 / 驱鬼符"""
    c = Canvas(IW, IH)
    Y = ramp(P["paperDeep"]); R = ramp(P["cinnabar"])
    base = P["orchid"] if kind == "yin" else P["gold"]
    B = ramp(base)
    c.rect(8, 1, 15, 22, Y["base"])
    c.rect(8, 1, 9, 22, Y["light"])
    c.rect(14, 1, 15, 22, Y["dark"])
    c.rect(10, 3, 13, 20, B["base"])
    if kind == "yin":                                # 聚阴：向内的纹
        for y in range(5, 19, 3):
            c.rect(11, y, 12, y, B["light"])
        c.ring(12, 12, 3.0, B["light"], w=1.0)
    else:                                            # 驱鬼：向外的纹
        for y in range(5, 19, 3):
            c.rect(11, y, 12, y, R["base"])
        c.rect(12, 6, 12, 18, R["light"])
    c.outline(INK)
    return c

NETHER_PROPS = {
    "nether_gate": ne_gate, "nether_bridge": ne_bridge, "nether_river": ne_river,
    "nether_city": ne_city, "nether_pool": ne_pool, "nether_lotus": ne_lotus,
    "nether_talisman_yin": lambda: ne_talisman("yin"),
    "nether_talisman_qu": lambda: ne_talisman("qu"),
}

# ══════════ 特效扩展：渡劫 / 飞升 / 夺舍 / 妖潮 ══════════
def fx_thunder():
    """天雷：自上而下的折线雷"""
    c = Canvas(FXW, FXH)
    W = ramp(P["mist"]); A = ramp(P["azurite"])
    x = 16
    for y in range(31, 1, -1):
        x += random.Random(y * 7).choice([-1, 0, 0, 1])
        x = max(6, min(25, x))
        c.set(x, y, W["light"], 240)
        c.set(x - 1, y, A["light"], 170)
        c.set(x + 1, y, A["light"], 170)
    c.disc(16, 3, 4.0, W["base"], 190)
    return c

def fx_ascend():
    """飞升光柱：向上的金色光带 + 天雷余晖"""
    c = Canvas(FXW, FXH)
    G = ramp(P["gold"]); M = ramp(P["mist"])
    for y in range(0, 32):
        w = 6 - abs(y - 16) * 0.10
        for x in range(int(16 - w), int(16 + w) + 1):
            c.set(x, y, G["base"], 120)
        c.set(16, y, M["light"], 230)
        c.set(15, y, G["light"], 180); c.set(17, y, G["light"], 180)
    for (x, y) in [(10, 6), (22, 9), (12, 25), (20, 27)]:
        c.set(x, y, M["light"], 200)
    return c

def fx_tribulation_cloud():
    """劫云：厚重的暗云 + 内闪"""
    c = Canvas(FXW, FXH)
    D = ramp(P["inkMid"]); A = ramp(P["azurite"])
    rnd = random.Random(99)
    for _ in range(9):
        cx, cy = rnd.randint(8, 24), rnd.randint(16, 27)
        c.ellipse(cx, cy, rnd.randint(6, 10), rnd.randint(3, 5), D["base"], a=210)
        c.ellipse(cx, cy + 1, rnd.randint(4, 7), rnd.randint(2, 3), D["deep"], a=180)
    for (x, y) in [(12, 20), (19, 23), (16, 18)]:
        c.set(x, y, A["light"], 220)
        c.set(x, y - 1, P["mist"], 190)
    return c

def fx_possession():
    """夺舍：鬼影扑入人形"""
    c = Canvas(FXW, FXH)
    S = ramp(P["soulWraith"]); D = ramp(P["inkMid"])
    # 人形轮廓（被附身者）
    c.rect(13, 2, 18, 12, D["base"], 200)
    c.rect(14, 13, 17, 16, D["base"], 200)
    c.disc(16, 20, 3.0, D["base"], 200)
    # 扑入的鬼影
    for k in range(6):
        c.ellipse(16 + k, 26 - k, 5 - k * 0.5, 3 - k * 0.3, S["base"], 200 - k * 20)
    for (x, y) in [(9, 28), (23, 27), (16, 30)]:
        c.set(x, y, S["light"], 220)
    return c

def fx_beast_tide():
    """妖潮：多道兽影 + 尘土"""
    c = Canvas(FXW, FXH)
    O = ramp(P["ochre"]); R = ramp(P["cinnabar"])
    rnd = random.Random(123)
    for k in range(5):
        x = 4 + k * 6
        y = 6 + (k % 2) * 3
        c.ellipse(x + 2, y + 3, 3.0, 2.0, O["base"], 220)   # 身
        c.disc(x + 4, y + 5, 1.6, O["dark"], 220)           # 头
        c.set(x + 4, y + 6, R["base"], 230)                 # 眼
        for lx in (0, 2):                                   # 腿
            c.set(x + lx, y + 1, O["deep"], 210)
    for _ in range(20):                                     # 扬尘
        x, y = rnd.randint(2, 29), rnd.randint(1, 8)
        c.disc(x, y, rnd.choice([1, 1.6]), O["light"], a=rnd.randint(90, 170))
    return c

FX_MORE = {
    "fx_thunder": fx_thunder, "fx_ascend": fx_ascend,
    "fx_tribulation_cloud": fx_tribulation_cloud,
    "fx_possession": fx_possession, "fx_beast_tide": fx_beast_tide,
}

# ══════════ 水文（M0 P1 遗留：复杂局部水面） ══════════
def water_shore(direction):
    """岸线贴片 32×32：水陆交界。direction: 'n'/'s'/'e'/'w'"""
    c = Canvas(GW, GH)
    Wa = ramp(P["azurite"]); La = ramp(P["clay"])
    c.rect(0, 0, GW - 1, GH - 1, Wa["base"])
    edge = 16
    for k in range(GW):
        y = edge + int(2.4 * math.sin(k * 0.5))
        if direction in ("n", "w"):
            c.rect(k, y, k, GH - 1, La["base"])
            c.set(k, y, La["light"]); c.set(k, y - 1, P["paperDeep"])
        else:
            c.rect(k, 0, k, y, La["base"])
            c.set(k, y, La["dark"]); c.set(k, y + 1, P["paperDeep"])
    for y in range(2, GH - 2, 5):                            # 波纹
        for x in range(GW):
            if (x + y) % 7 < 4:
                c.set(x, y, Wa["light"])
    return c

def water_fall():
    """瀑布 32×32"""
    c = Canvas(GW, GH)
    W = ramp(P["azurite"]); M = ramp(P["mist"])
    for y in range(GH):
        w = 9 - abs(y - 16) * 0.06
        for x in range(int(16 - w), int(16 + w) + 1):
            c.set(x, y, W["base"])
        c.rect(int(16 - w), y, int(16 - w) + 1, y, W["light"])
        c.rect(int(16 + w) - 1, y, int(16 + w), y, W["deep"])
    rnd = random.Random(140)
    for _ in range(60):                                      # 水花
        x, y = rnd.randint(7, 24), rnd.randint(0, GH - 1)
        c.set(x, y, M["base"], rnd.randint(120, 220))
    c.ellipse(16, 2, 11, 2.6, M["light"], a=200)             # 落水水花
    return c

def water_rapids():
    """急流 32×32（可平铺）"""
    c = Canvas(GW, GH)
    W = ramp(P["azurite"])
    c.rect(0, 0, GW - 1, GH - 1, W["base"])
    rnd = random.Random(151)
    for y in range(1, GH - 1, 3):
        for x in range(GW):
            if (x * 2 + y) % 8 < 5:
                c.set(x, y, W["light"])
                c.set(x + 1, y + 1, W["deep"])
    for _ in range(26):
        x, y = rnd.randint(1, GW - 3), rnd.randint(1, GH - 2)
        c.rect(x, y, x + 2, y, P["mist"], )
    return c

def water_lake():
    """湖心 32×32（平静水面）"""
    c = Canvas(GW, GH)
    W = ramp(P["azurite"]); M = ramp(P["mist"])
    c.rect(0, 0, GW - 1, GH - 1, W["deep"])
    for y in range(2, GH - 2, 4):
        for x in range(GW):
            if (x + y) % 11 < 6:
                c.set(x, y, W["base"])
                c.set(x, y + 1, W["light"])
    for _ in range(12):                                      # 高光
        x, y = random.Random(xy_seed := 160 + _).randint(2, GW - 5), random.Random(200 + _).randint(2, GH - 4)
        c.rect(x, y, x + 2, y, M["base"], )
    return c

WATER = {
    "water_shore_n": lambda: water_shore("n"),
    "water_shore_s": lambda: water_shore("s"),
    "water_shore_e": lambda: water_shore("e"),
    "water_shore_w": lambda: water_shore("w"),
    "water_fall": water_fall, "water_rapids": water_rapids, "water_lake": water_lake,
}

# ══════════ 界面扩展（三界视窗 / 标签 / 滑条 / 提示 / 徽章） ══════════
def ui_realm_frame(accent, key):
    """三界视界窗边框 48×48 九宫格，accent 区分凡/上/幽"""
    c = Canvas(48, 48)
    A = ramp(accent); B = ramp(P["paperDeep"])
    c.rect(0, 0, 47, 47, (0, 0, 0), 0)
    for k in range(3):                                       # 双层边框
        col = A["base"] if k == 0 else A["light"]
        for x in range(3 - k, 45 + k):
            c.set(x, 3 - k, col); c.set(x, 44 + k, col)
        for y in range(3 - k, 45 + k):
            c.set(3 - k, y, col); c.set(44 + k, y, col)
    for (ox, oy) in [(0, 0), (40, 0), (0, 40), (40, 40)]:    # 角饰
        c.rect(ox + 1, oy + 1, ox + 6, oy + 2, A["base"])
        c.rect(ox + 1, oy + 1, ox + 2, oy + 6, A["base"])
        c.set(ox + 4, oy + 4, P["gold"])
    return c

def ui_tab(active):
    c = Canvas(48, 18)
    B = ramp(P["paperDeep"] if not active else P["paper"])
    I = P["inkLight"]
    c.rect(1, 1, 46, 17, B["base"])
    c.rect(1, 1, 46, 2, B["light"])
    if active:
        c.rect(1, 15, 46, 17, P["cinnabar"])
        c.rect(1, 14, 46, 14, P["gold"])
    c.outline(I)
    return c

def ui_slider():
    c = Canvas(48, 12)
    c.rect(2, 5, 45, 6, P["paperShade"])
    c.rect(2, 5, 45, 5, P["paperDeep"])
    c.rect(2, 4, 22, 7, P["azurite"])
    c.rect(2, 4, 22, 4, P["upperD"])
    c.disc(23, 5, 3.0, P["paper"])
    c.ring(23, 5, 3.0, P["ink"], w=1.0)
    return c

def ui_tooltip():
    c = Canvas(48, 24)
    B = ramp(P["paperDeep"]); I = P["inkLight"]
    c.rect(1, 1, 46, 22, B["base"])
    c.rect(1, 1, 46, 1, B["light"])
    c.rect(1, 22, 46, 22, B["dark"])
    for x in range(6, 42, 5):
        c.rect(x, 7, x + 3, 7, P["inkLight"])
    for x in range(6, 34, 5):
        c.rect(x, 12, x + 3, 12, P["paperShade"])
    c.outline(I)
    return c

def ui_badge(col):
    """状态徽章：小圆牌，用于境界/魂路标记"""
    c = Canvas(IW, IH)
    A = ramp(col); G = ramp(P["gold"])
    c.disc(12, 12, 10.0, P["ink"])
    c.disc(12, 12, 9.0, A["base"])
    c.disc(12, 11, 7.5, A["light"])
    c.ring(12, 12, 9.5, G["base"], w=1.0)
    return c

UI_MORE = {
    "ui_realm_frame_mortal": lambda: ui_realm_frame(P["malachite"], "mortal"),
    "ui_realm_frame_upper":  lambda: ui_realm_frame(P["upperB"], "upper"),
    "ui_realm_frame_nether": lambda: ui_realm_frame(P["orchid"], "nether"),
    "ui_tab": lambda: ui_tab(False),
    "ui_tab_active": lambda: ui_tab(True),
    "ui_slider": ui_slider, "ui_tooltip": ui_tooltip,
    "ui_badge_realm": lambda: ui_badge(P["gold"]),
    "ui_badge_soul":  lambda: ui_badge(P["soulGhost"]),
    "ui_badge_ghost": lambda: ui_badge(P["soulWraith"]),
}

# ═══════════════════════════ 调色板 ═══════════════════════════
def make_palette_sheet():
    keys = list(P.keys())
    cw, ch = 30, 24
    cols = 7
    w = cols * cw; h = math.ceil(len(keys) / cols) * ch
    c = Canvas(w, h)
    for i, k in enumerate(keys):
        x = (i % cols) * cw; y = (i // cols) * ch
        c.fill(x, y, cw - 2, ch - 6, P[k])
    return c, keys

# ═══════════════════════════ 汇总输出 ═══════════════════════════
GROUPS = [
    # ── v2 原有 ──
    ("植被", TREES),
    ("人物", make_chars()),
    ("建筑", BUILDINGS),
    ("图标", ICONS),
    ("物品", ITEMS),
    ("特效", make_fx()),
    ("徽记", make_emblems()),
    ("界面", make_ui()),
    ("纹理", make_textures()),
    # ── v3 新增（对齐 M0 后续迁移目标）──
    ("地形·23种", make_terrain_full()),     # 逐字对应 TERRAIN_INFO
    ("境界·七阶", make_realm_chars()),      # 炼气→大乘
    ("鬼修·六阶", make_ghost_tiers()),      # 游魂→鬼帝
    ("建筑·结构层", STRUCTS),                # STRUCT 五件 + 宗门扩展
    ("浮空岛", make_isles()),                # M0 明列的后续阶段
    ("上界·紫霄", UPPER_PROPS),
    ("幽冥·冥河", NETHER_PROPS),
    ("特效·渡劫", FX_MORE),
    ("水文", WATER),
    ("界面·视窗", UI_MORE),
]

def build_all():
    """返回 [(group, name, Canvas)]；组内值可以是 Canvas 或返回 Canvas 的函数。"""
    items = []
    for gname, d in GROUPS:
        for name, v in d.items():
            cv = v() if callable(v) else v
            items.append((gname, name, cv))
    return items

def _render_group_block(g, arr, col_w, pad=12, label_h=20, max_cell_h=140):
    """把一组渲染成独立图块（供双栏拼版）。"""
    from PIL import ImageDraw
    maxch = max(c.h for _, c in arr)
    maxcw = max(c.w for _, c in arr)
    s = max(1, min(3, max_cell_h // max(maxch, maxcw, 1)))
    cellw = maxcw * s + 8
    per_row = max(1, (col_w - pad) // cellw)
    rows_n = math.ceil(len(arr) / per_row)
    h = label_h + rows_n * (maxch * s + 10) + 8
    blk = Image.new("RGBA", (col_w, h), (233, 224, 205, 255))
    dr = ImageDraw.Draw(blk)
    dr.text((pad, 2), "%s (%d)" % (g, len(arr)), fill=(34, 32, 28, 255))
    for i, (n, cv) in enumerate(arr):
        col = i % per_row; row = i // per_row
        big = cv.to_image(flip_y=True).resize((cv.w * s, cv.h * s), Image.NEAREST)
        ox = pad + col * cellw + (cellw - big.width) // 2
        oy = label_h + row * (maxch * s + 10) + (maxch * s - big.height) // 2
        blk.paste(big, (ox, oy), big)
    return blk

def make_contact_sheet(items):
    """总览图：双栏拼版（按高度贪心装箱），避免超长竖条。"""
    by_group = {}
    for (g, n, c) in items:
        by_group.setdefault(g, []).append((n, c))
    col_w = 560
    blocks = [(g, _render_group_block(g, arr, col_w)) for g, arr in by_group.items()]
    # 贪心：高度较矮的一栏先放
    col_a, col_b = [], []
    ha = hb = 0
    for (g, blk) in blocks:
        if ha <= hb:
            col_a.append(blk); ha += blk.height
        else:
            col_b.append(blk); hb += blk.height
    total_h = max(ha, hb) + 16
    img = Image.new("RGBA", (col_w * 2 + 24, total_h), (233, 224, 205, 255))
    y = 8
    for blk in col_a:
        img.paste(blk, (8, y), blk); y += blk.height
    y = 8
    for blk in col_b:
        img.paste(blk, (col_w + 16, y), blk); y += blk.height
    os.makedirs(os.path.join(HERE, "预览"), exist_ok=True)
    p = os.path.join(HERE, "预览", "contact_sheet.png")
    img.save(p)
    return p

def main():
    items = build_all()
    paths = []
    for (g, n, c) in items:
        p = os.path.join(HERE, g, n + ".png")
        c.save(p)
        paths.append(p)
    pal, keys = make_palette_sheet()
    pp = os.path.join(HERE, "调色板", "palette.png")
    pal.save(pp); paths.append(pp)
    sheet = make_contact_sheet(items)
    print("生成素材 %d 张：" % len(paths))
    by_group = {}
    for (g, n, c) in items:
        by_group.setdefault(g, []).append(n)
    for g, arr in by_group.items():
        print("  %s(%d): %s" % (g, len(arr), ", ".join(arr)))
    print("调色板：", os.path.relpath(pp, HERE))
    print("总览：", os.path.relpath(sheet, HERE))

if __name__ == "__main__":
    main()
