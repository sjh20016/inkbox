# -*- coding: utf-8 -*-
"""
《坐天观井 / Inkbox》实验建筑资产 · 几何定义（纯 Python，无第三方依赖）

输出面向 Blender：顶点表 + 多边形面（以 quad 为主）+ 每面颜色名。
Blender 侧负责焊点、UV 取色、材质与导出。

尺度：1 单位 ≈ 1 世界格。建筑占 1 格左右，高 0.8–1.7。Y 向上，基座落在 y=0。
复杂度预算：单件 20–200 面（对齐参考包 Kenney gate 76 / column 208 / wall 372）。

范围（按用户指令收窄）：建筑 + 特殊地形细节。不含植被 / 人物 / 道具。
"""
import math


class Mesh:
    """多边形网格：按坐标焊点，面携带颜色名。"""

    def __init__(self):
        self.verts = []
        self._map = {}
        self.faces = []          # list[(tuple(index...), color)]

    def v(self, p):
        key = (round(p[0], 5), round(p[1], 5), round(p[2], 5))
        i = self._map.get(key)
        if i is None:
            i = len(self.verts)
            self.verts.append(key)
            self._map[key] = i
        return i

    def poly(self, pts, color):
        idx = tuple(self.v(p) for p in pts)
        if len(set(idx)) < 3:
            return
        self.faces.append((idx, color))

    def tri(self, a, b, c, color):
        self.poly([a, b, c], color)

    def quad(self, a, b, c, d, color):
        self.poly([a, b, c, d], color)

    def bounds(self):
        xs = [p[0] for p in self.verts]
        ys = [p[1] for p in self.verts]
        zs = [p[2] for p in self.verts]
        return (min(xs), min(ys), min(zs)), (max(xs), max(ys), max(zs))


# ───────────────────────── 原语 ─────────────────────────

def box(m, x0, x1, y0, y1, z0, z1, color, top=None, bottom=None,
        front=None, back=None, left=None, right=None):
    """轴对齐立方体。默认 -Z 为「正面」。"""
    top = top or color; bottom = bottom or color
    front = front or color; back = back or color
    left = left or color; right = right or color
    A = (x0, y0, z0); B = (x1, y0, z0); C = (x1, y1, z0); D = (x0, y1, z0)
    E = (x0, y0, z1); F = (x1, y0, z1); G = (x1, y1, z1); H = (x0, y1, z1)
    m.quad(A, D, C, B, front)
    m.quad(E, F, G, H, back)
    m.quad(A, E, H, D, left)
    m.quad(B, C, G, F, right)
    m.quad(A, B, F, E, bottom)
    m.quad(D, H, G, C, top)


def gable(m, x0, x1, y0, y1, z0, z1, slope, end=None, ridge=None):
    """双坡硬山顶（屋脊沿 X）。y0=檐口，y1=脊高。"""
    end = end or slope; ridge = ridge or slope
    zm = (z0 + z1) * 0.5
    m.quad((x0, y0, z0), (x0, y1, zm), (x1, y1, zm), (x1, y0, z0), slope)
    m.quad((x0, y0, z1), (x1, y0, z1), (x1, y1, zm), (x0, y1, zm), slope)
    m.tri((x0, y0, z0), (x0, y0, z1), (x0, y1, zm), end)
    m.tri((x1, y0, z0), (x1, y1, zm), (x1, y0, z1), end)
    m.quad((x0, y1, zm - 0.012), (x1, y1, zm - 0.012),
           (x1, y1, zm + 0.012), (x0, y1, zm + 0.012), ridge)


def hip(m, x0, x1, y0, y1, z0, z1, color, inset=0.18, end=None, ridge=None):
    """四坡庑殿顶（屋脊沿 X，两端内收）。"""
    end = end or color; ridge = ridge or color
    zm = (z0 + z1) * 0.5
    rx0 = x0 + (x1 - x0) * inset
    rx1 = x1 - (x1 - x0) * inset
    m.quad((x0, y0, z0), (rx0, y1, zm), (rx1, y1, zm), (x1, y0, z0), color)
    m.quad((x1, y0, z1), (rx1, y1, zm), (rx0, y1, zm), (x0, y0, z1), color)
    m.tri((x0, y0, z0), (x0, y0, z1), (rx0, y1, zm), end)
    m.tri((x1, y0, z1), (x1, y0, z0), (rx1, y1, zm), end)
    m.quad((rx0, y1, zm - 0.012), (rx1, y1, zm - 0.012),
           (rx1, y1, zm + 0.012), (rx0, y1, zm + 0.012), ridge)


def pyramid(m, cx, cz, y0, y1, hx, hz, color):
    A = (cx - hx, y0, cz - hz); B = (cx + hx, y0, cz - hz)
    C = (cx + hx, y0, cz + hz); D = (cx - hx, y0, cz + hz)
    T = (cx, y1, cz)
    m.tri(A, T, B, color); m.tri(B, T, C, color)
    m.tri(C, T, D, color); m.tri(D, T, A, color)


def wedge(m, x0, x1, y0, y1, z0, z1, color, top=None):
    """楔形：z0 侧满高 y1，向 z1 侧降至 y0。"""
    top = top or color
    A = (x0, y0, z0); B = (x1, y0, z0); C = (x1, y0, z1); D = (x0, y0, z1)
    E = (x0, y1, z0); F = (x1, y1, z0)
    m.quad(A, B, C, D, color)
    m.quad(A, E, F, B, color)
    m.quad(E, D, C, F, top)
    m.tri(E, A, D, color)
    m.tri(F, C, B, color)


def arch_ring(m, cx, y_base, z0, z1, r_out, r_in, seg=7, color="stone", inner=None):
    """半圆石拱：XY 平面成拱，沿 Z 挤出。"""
    inner = inner or color
    for i in range(seg):
        a0 = math.pi * i / seg
        a1 = math.pi * (i + 1) / seg
        o0 = (cx + r_out * math.cos(a0), y_base + r_out * math.sin(a0))
        o1 = (cx + r_out * math.cos(a1), y_base + r_out * math.sin(a1))
        i0 = (cx + r_in * math.cos(a0), y_base + r_in * math.sin(a0))
        i1 = (cx + r_in * math.cos(a1), y_base + r_in * math.sin(a1))
        m.quad((o0[0], o0[1], z0), (o1[0], o1[1], z0),
               (o1[0], o1[1], z1), (o0[0], o0[1], z1), color)
        m.quad((i0[0], i0[1], z1), (i1[0], i1[1], z1),
               (i1[0], i1[1], z0), (i0[0], i0[1], z0), inner)
        m.quad((o0[0], o0[1], z0), (i0[0], i0[1], z0),
               (i1[0], i1[1], z0), (o1[0], o1[1], z0), color)
        m.quad((o1[0], o1[1], z1), (i1[0], i1[1], z1),
               (i0[0], i0[1], z1), (o0[0], o0[1], z1), color)


def stairs(m, x0, x1, z0, z1, y0, rise, n, color="stone", top=None):
    """石阶：自 z0（低）向 z1（高）逐级抬升。"""
    top = top or color
    dz = (z1 - z0) / n
    dy = rise / n
    for i in range(n):
        box(m, x0, x1, y0, y0 + dy * (i + 1), z0 + dz * i, z0 + dz * (i + 1),
            color, top=top)


# ═════════════════════ 建筑 ═════════════════════

def bld_house():
    """民居：墙 + 硬山屋顶 + 门 + 极简基座。纸白墙 + 墨屋顶 + 极少木色。"""
    m = Mesh()
    box(m, -0.42, 0.42, 0.0, 0.08, -0.38, 0.38, "stone", top="stoneDark")
    box(m, -0.36, 0.36, 0.08, 0.56, -0.32, 0.32, "paper",
        top="paperDeep", left="paperDeep", right="paperDeep")
    box(m, -0.10, 0.10, 0.08, 0.38, -0.345, -0.315, "ink")
    box(m, 0.18, 0.30, 0.20, 0.34, -0.345, -0.325, "woodDark")
    gable(m, -0.46, 0.46, 0.56, 0.86, -0.42, 0.42,
          slope="inkMid", end="paperShade", ridge="ink")
    for sx in (-0.42, 0.36):
        box(m, sx, sx + 0.06, 0.08, 0.56, -0.38, -0.32, "wood", top="woodDark")
    return m


def bld_hall():
    """宗祠 / 大殿：台基 + 台阶 + 庑殿顶 + 朱柱。朱砂柱承担礼制语义。"""
    m = Mesh()
    box(m, -0.62, 0.62, 0.0, 0.12, -0.52, 0.52, "stone", top="stoneDark")
    stairs(m, -0.22, 0.22, -0.64, -0.52, 0.0, 0.12, 2, "stone", top="stoneDark")
    box(m, -0.54, 0.54, 0.12, 0.66, -0.44, 0.44, "paper",
        top="paperDeep", left="paperDeep", right="paperDeep")
    for sx in (-0.50, 0.44):
        for sz in (-0.40, 0.34):
            box(m, sx, sx + 0.07, 0.12, 0.70, sz, sz + 0.07, "cinnabar", top="rouge")
    box(m, -0.16, 0.16, 0.12, 0.46, -0.465, -0.435, "ink")
    hip(m, -0.66, 0.66, 0.66, 1.00, -0.58, 0.58,
        "inkMid", inset=0.20, end="ink", ridge="ink")
    return m


def bld_tower():
    """望楼 / 塔：三层递减 + 出檐 + 攒尖顶。"""
    m = Mesh()
    box(m, -0.36, 0.36, 0.0, 0.10, -0.36, 0.36, "stone", top="stoneDark")
    for (x0, x1, y0, y1) in ((-0.30, 0.30, 0.10, 0.52),
                             (-0.24, 0.24, 0.56, 0.94),
                             (-0.17, 0.17, 0.98, 1.30)):
        box(m, x0, x1, y0, y1, x0, x1, "paper",
            top="paperDeep", left="paperDeep", right="paperDeep")
        e = 0.055
        box(m, x0 - e, x1 + e, y1, y1 + 0.055, x0 - e, x1 + e, "inkMid", top="ink")
        box(m, x0 + 0.10, x1 - 0.10, y0 + 0.12, y0 + 0.28, x0 - 0.012, x0, "ink")
    pyramid(m, 0.0, 0.0, 1.355, 1.62, 0.22, 0.22, "inkMid")
    box(m, -0.02, 0.02, 1.62, 1.72, -0.02, 0.02, "gold")
    return m


def bld_gate():
    """牌坊 / 山门：两柱 + 两横枋 + 小屋顶。识别符号优先，不做斗拱。"""
    m = Mesh()
    for sx in (-0.46, 0.46):
        box(m, sx - 0.055, sx + 0.055, 0.0, 0.90, -0.06, 0.06, "wood",
            top="woodDark", front="woodDark", back="woodDark")
        box(m, sx - 0.09, sx + 0.09, 0.0, 0.07, -0.09, 0.09, "stone", top="stoneDark")
    box(m, -0.60, 0.60, 0.72, 0.80, -0.07, 0.07, "cinnabar", top="rouge")
    box(m, -0.66, 0.66, 0.94, 1.00, -0.07, 0.07, "cinnabar", top="rouge")
    box(m, -0.10, 0.10, 0.80, 0.94, -0.075, -0.055, "gold")
    gable(m, -0.74, 0.74, 1.00, 1.20, -0.14, 0.14,
          slope="inkMid", end="paperShade", ridge="ink")
    return m


def bld_wall():
    """垣墙模块：墙身 + 压顶。可沿轴平铺。"""
    m = Mesh()
    box(m, -0.50, 0.50, 0.0, 0.52, -0.10, 0.10, "paper",
        top="paperDeep", front="paperDeep", back="paperDeep",
        left="paperShade", right="paperShade")
    box(m, -0.52, 0.52, 0.52, 0.60, -0.13, 0.13, "inkMid", top="ink")
    return m


def bld_ruin():
    """残垣：墙身 + 断裂顶部（阶梯式残口）。"""
    m = Mesh()
    box(m, -0.50, 0.50, 0.0, 0.42, -0.10, 0.10, "paper",
        top="paperDeep", front="paperShade", back="paperShade")
    for (a, b, y0, y1) in ((-0.50, -0.24, 0.42, 0.62), (-0.24, -0.02, 0.42, 0.50),
                           (-0.02, 0.20, 0.42, 0.66), (0.20, 0.38, 0.42, 0.48),
                           (0.38, 0.50, 0.42, 0.58)):
        box(m, a, b, y0, y1, -0.095, 0.095, "paperShade", top="paperDeep")
    box(m, -0.14, 0.02, 0.0, 0.30, -0.115, -0.085, "ink")
    return m


def bld_altar():
    """祭坛 / 法台：双层石台 + 中央石碑 + 顶上一抹灵气色。"""
    m = Mesh()
    box(m, -0.44, 0.44, 0.0, 0.10, -0.44, 0.44, "stone", top="stoneDark")
    box(m, -0.30, 0.30, 0.10, 0.20, -0.30, 0.30, "stoneDark", top="stone")
    box(m, -0.09, 0.09, 0.20, 0.72, -0.06, 0.06, "inkLight",
        top="inkMid", front="inkMid", back="inkMid")
    box(m, -0.13, 0.13, 0.72, 0.80, -0.09, 0.09, "inkMid", top="ink")
    box(m, -0.035, 0.035, 0.80, 0.90, -0.035, 0.035, "soulFlame")
    return m


def bld_bridge():
    """石拱桥：半圆拱 + 桥面 + 栏板。"""
    m = Mesh()
    arch_ring(m, 0.0, 0.30, -0.30, 0.30, r_out=0.34, r_in=0.24, seg=7,
              color="stone", inner="stoneDark")
    box(m, -0.52, 0.52, 0.62, 0.72, -0.30, 0.30, "stone", top="stoneDark")
    for sz in (-0.30, 0.26):
        box(m, -0.52, 0.52, 0.72, 0.84, sz, sz + 0.04, "stoneDark", top="inkLight")
    return m


# ═════════════════════ 特殊地形细节 ═════════════════════

def terr_cave():
    """洞府入口：岩体 + 内凹门洞 + 门楣 + 门前石阶。"""
    m = Mesh()
    box(m, -0.52, 0.52, 0.0, 0.64, -0.52, 0.52, "stone", top="stoneDark")
    pyramid(m, 0.0, 0.0, 0.64, 1.02, 0.52, 0.52, "stoneDark")
    box(m, -0.24, 0.24, 0.10, 0.56, -0.58, -0.46, "ink")           # 门洞外框
    box(m, -0.16, 0.16, 0.10, 0.44, -0.66, -0.58, "ink")           # 洞内
    box(m, -0.28, 0.28, 0.56, 0.66, -0.62, -0.44, "stoneDark")     # 门楣
    stairs(m, -0.22, 0.22, -0.86, -0.66, 0.0, 0.10, 2, "stone", top="stoneDark")
    return m


def terr_arch():
    """天然石门：两腿 + 拱顶，略带错落的自然感。"""
    m = Mesh()
    for sx in (-0.40, 0.32):
        box(m, sx, sx + 0.16, 0.0, 0.62, -0.13, 0.13, "stone", top="stoneDark")
    arch_ring(m, 0.0, 0.42, -0.13, 0.13, r_out=0.54, r_in=0.40, seg=6,
              color="stone", inner="stoneDark")
    box(m, -0.14, 0.14, 0.86, 0.96, -0.13, 0.13, "stoneDark")      # 顶部压石
    return m


def terr_pillar():
    """石林：三根错落石柱。"""
    m = Mesh()
    for (cx, cz, h, w) in ((-0.30, 0.10, 1.15, 0.11),
                           (0.06, -0.16, 0.80, 0.09),
                           (0.30, 0.22, 0.55, 0.08)):
        box(m, cx - w, cx + w, 0.0, h, cz - w, cz + w, "stone",
            top="stoneDark", front="stoneDark", back="stoneDark")
        pyramid(m, cx, cz, h, h + 0.13, w, w, "stoneDark")
    return m


def terr_cliff():
    """断崖：崖面 + 顶面收窄 + 横向岩层带。"""
    m = Mesh()
    box(m, -0.50, 0.50, 0.0, 0.52, -0.50, 0.30, "stone", top="stoneDark")
    box(m, -0.50, 0.50, 0.52, 0.56, -0.50, 0.30, "inkLight")       # 岩层带
    box(m, -0.50, 0.50, 0.56, 1.14, -0.50, 0.30, "stone", top="stoneDark")
    box(m, -0.50, 0.50, 1.14, 1.18, -0.50, 0.30, "inkLight")
    wedge(m, -0.50, 0.50, 0.0, 1.18, 0.30, 0.50, "stone", top="stoneDark")
    box(m, -0.44, 0.34, 1.18, 1.30, -0.46, 0.24, "stoneDark", top="stone")
    return m


def terr_rock():
    """岩壁块：错落石块，可 InstancedMesh 拼山。"""
    m = Mesh()
    box(m, -0.46, 0.46, 0.0, 0.34, -0.46, 0.46, "stone", top="stoneDark")
    box(m, -0.34, 0.22, 0.34, 0.58, -0.30, 0.34, "stoneDark", top="stone")
    box(m, 0.02, 0.30, 0.34, 0.46, -0.44, -0.16, "stone", top="stoneDark")
    pyramid(m, -0.06, 0.02, 0.58, 0.72, 0.20, 0.20, "stoneDark")
    return m


def terr_terrace():
    """层台：三级石台（通用台地，非农田）。"""
    m = Mesh()
    box(m, -0.50, 0.50, 0.0, 0.18, -0.50, 0.50, "stone", top="stoneDark")
    box(m, -0.42, 0.42, 0.18, 0.36, -0.42, 0.42, "stoneDark", top="stone")
    box(m, -0.32, 0.32, 0.36, 0.54, -0.32, 0.32, "stone", top="stoneDark")
    return m


def terr_stairs():
    """石阶：五级。"""
    m = Mesh()
    stairs(m, -0.30, 0.30, -0.50, 0.50, 0.0, 0.50, 5, "stone", top="stoneDark")
    return m


def terr_slab():
    """石台：平整石基，供建筑落座或作法坛。"""
    m = Mesh()
    box(m, -0.50, 0.50, 0.0, 0.10, -0.50, 0.50, "stone", top="stoneDark")
    box(m, -0.46, 0.46, 0.10, 0.16, -0.46, 0.46, "stoneDark", top="stone")
    box(m, -0.10, 0.10, 0.16, 0.20, -0.50, 0.50, "inkLight")       # 中线刻痕
    return m


# ═════════════════════ 宗门宅院 ═════════════════════
# 主题：修仙世界的人居与宗门功能建筑。每件只认一个「识别符号」，
# 不做建筑学还原，只取可辨的形。色板沿用共享颜色词典，不新增颜色。

def bld_manor():
    """富户宅院：台基 + 院墙围合 + 门楼 + 正房庑殿顶 + 两侧厢房。
    识别符号 = 朱门 + 金门饰（礼制低于宗祠，体量繁于民居）。"""
    m = Mesh()
    # 台基（整院一块）
    box(m, -0.60, 0.60, 0.0, 0.08, -0.60, 0.60, "stone", top="stoneDark")
    # 院墙：左右两道 + 前墙两段（中留门洞）
    for (x0, x1) in ((-0.60, -0.53), (0.53, 0.60)):
        box(m, x0, x1, 0.08, 0.40, -0.60, 0.46, "paper", top="paperDeep",
            front="paperDeep", back="paperDeep", left="paperShade", right="paperShade")
    for (x0, x1) in ((-0.60, -0.20), (0.20, 0.60)):
        box(m, x0, x1, 0.08, 0.40, -0.60, -0.53, "paper", top="paperDeep")
    # 正房 + 庑殿顶
    box(m, -0.42, 0.42, 0.08, 0.52, -0.14, 0.46, "paper",
        top="paperDeep", left="paperDeep", right="paperDeep")
    hip(m, -0.48, 0.48, 0.52, 0.88, -0.20, 0.52, "inkMid", inset=0.20,
        end="ink", ridge="ink")
    # 朱门 + 金门饰（两条竖金线，读「金钉」）
    box(m, -0.15, 0.15, 0.08, 0.42, -0.155, -0.125, "cinnabar", top="rouge")
    for gx in (-0.115, 0.095):
        box(m, gx, gx + 0.02, 0.16, 0.40, -0.16, -0.15, "gold")
    # 两侧厢房（矮，硬山）
    for (x0, x1) in ((-0.52, -0.30), (0.30, 0.52)):
        box(m, x0, x1, 0.08, 0.32, -0.48, -0.18, "paperShade", top="paper")
        gable(m, x0 - 0.03, x1 + 0.03, 0.32, 0.48, -0.51, -0.15,
              slope="inkMid", end="paperShade", ridge="ink")
    # 门楼：两柱夹门洞 + 小硬山顶
    for (x0, x1) in ((-0.27, -0.21), (0.21, 0.27)):
        box(m, x0, x1, 0.08, 0.58, -0.605, -0.525, "wood",
            top="woodDark", front="woodDark", back="woodDark")
    gable(m, -0.32, 0.32, 0.58, 0.80, -0.63, -0.50,
          slope="inkMid", end="paperShade", ridge="ink")
    return m


def bld_dorm():
    """外门弟子房：三间联排，共用一面长墙与连续硬山顶。
    识别符号 = 重复的门洞 + 分隔柱（读出「间数」而非装饰）。"""
    m = Mesh()
    box(m, -0.60, 0.60, 0.0, 0.05, -0.26, 0.26, "stone", top="stoneDark")
    box(m, -0.56, 0.56, 0.05, 0.42, -0.22, 0.22, "paper",
        top="paperDeep", left="paperShade", right="paperShade")
    gable(m, -0.60, 0.60, 0.42, 0.68, -0.28, 0.28,
          slope="inkMid", end="paperShade", ridge="ink")
    for cx in (-0.34, 0.0, 0.34):
        box(m, cx - 0.075, cx + 0.075, 0.05, 0.30, -0.235, -0.215, "ink")
    for sx in (-0.50, -0.17, 0.17, 0.50):
        box(m, sx - 0.02, sx + 0.02, 0.05, 0.42, -0.245, -0.215, "wood", top="woodDark")
    return m


def bld_alchemy():
    """丹房：药庐 + 穿顶出烟口 + 门前丹炉（朱炉口、金顶珠）+ 一缕丹烟。
    识别符号 = 丹炉与丹烟。"""
    m = Mesh()
    box(m, -0.42, 0.42, 0.0, 0.08, -0.38, 0.38, "stone", top="stoneDark")
    box(m, -0.36, 0.36, 0.08, 0.50, -0.32, 0.30, "paperShade",
        top="paperDeep", left="paperShade", right="paperShade")
    gable(m, -0.42, 0.42, 0.50, 0.76, -0.38, 0.36,
          slope="inkMid", end="paperShade", ridge="ink")
    # 出烟口
    box(m, 0.14, 0.28, 0.76, 1.02, -0.05, 0.09, "stoneDark", top="ink")
    box(m, 0.12, 0.30, 1.02, 1.08, -0.07, 0.11, "ink")
    box(m, 0.16, 0.26, 1.08, 1.26, -0.02, 0.06, "mist")            # 丹烟
    # 门
    box(m, -0.10, 0.10, 0.08, 0.36, -0.345, -0.315, "ink")
    # 门前丹炉
    box(m, -0.17, 0.17, 0.0, 0.05, -0.62, -0.34, "stoneDark", top="stone")
    box(m, -0.12, 0.12, 0.05, 0.30, -0.56, -0.40, "stone",
        top="stoneDark", front="stoneDark", back="stoneDark")
    box(m, -0.06, 0.06, 0.13, 0.23, -0.585, -0.555, "cinnabar")     # 炉口
    pyramid(m, 0.0, -0.48, 0.30, 0.42, 0.13, 0.10, "inkMid")        # 炉盖
    box(m, -0.025, 0.025, 0.42, 0.47, -0.505, -0.455, "gold")       # 顶珠
    return m


def bld_scripture():
    """藏经阁：三层递减楼阁，层层腰檐，攒尖顶 + 金宝顶，正面悬金匾。
    识别符号 = 层层腰檐 + 金匾（比望楼更方、更庄重）。"""
    m = Mesh()
    box(m, -0.44, 0.44, 0.0, 0.10, -0.44, 0.44, "stone", top="stoneDark")
    for (x0, x1, y0, y1) in ((-0.36, 0.36, 0.10, 0.52),
                             (-0.30, 0.30, 0.58, 0.94),
                             (-0.24, 0.24, 1.00, 1.34)):
        box(m, x0, x1, y0, y1, x0, x1, "paper",
            top="paperDeep", left="paperDeep", right="paperDeep")
        e = 0.07
        box(m, x0 - e, x1 + e, y1, y1 + 0.06, x0 - e, x1 + e, "inkMid", top="ink")
    pyramid(m, 0.0, 0.0, 1.40, 1.70, 0.30, 0.30, "inkMid")
    box(m, -0.03, 0.03, 1.70, 1.82, -0.03, 0.03, "gold")
    # 正面朱门 + 金匾（匾下移，避开腰檐遮挡）
    box(m, -0.11, 0.11, 0.10, 0.32, -0.375, -0.345, "cinnabar", top="rouge")
    box(m, -0.20, 0.20, 0.34, 0.44, -0.385, -0.365, "gold")
    return m


def bld_forge():
    """炼器房：石砌工坊 + 高烟囱穿顶 + 正面炉膛火口 + 屋外矿石堆。
    识别符号 = 高烟囱与炉火（比丹房更粗犷、更「工」）。"""
    m = Mesh()
    box(m, -0.48, 0.48, 0.0, 0.08, -0.44, 0.40, "stone", top="stoneDark")
    box(m, -0.42, 0.42, 0.08, 0.52, -0.38, 0.34, "paperShade",
        top="paperDeep", left="stone", right="stone")
    gable(m, -0.48, 0.48, 0.52, 0.80, -0.44, 0.40,
          slope="inkMid", end="stoneDark", ridge="ink")
    # 烟囱（穿过屋脊）
    box(m, 0.14, 0.34, 0.52, 1.30, -0.10, 0.10, "stoneDark", top="ink")
    box(m, 0.12, 0.36, 1.30, 1.36, -0.12, 0.12, "ink")
    box(m, 0.17, 0.31, 1.36, 1.56, -0.07, 0.07, "mist")            # 烟
    # 炉膛（正面左）+ 门（正面右）
    box(m, -0.32, -0.08, 0.08, 0.34, -0.42, -0.36, "ink")
    box(m, -0.28, -0.12, 0.12, 0.28, -0.44, -0.42, "cinnabar")
    box(m, 0.04, 0.22, 0.08, 0.40, -0.405, -0.375, "ink")
    # 屋外矿石堆
    box(m, -0.46, -0.26, 0.0, 0.16, -0.64, -0.44, "stone", top="stoneDark")
    box(m, -0.38, -0.22, 0.16, 0.28, -0.60, -0.48, "stoneDark", top="stone")
    return m


def bld_beastpen():
    """灵兽棚：石基 + 木栏围合（前留门）+ 后半硬山棚顶 + 食槽 + 卧伏灵兽。
    识别符号 = 敞棚 + 卧兽（唯一「活物」语义的资产）。"""
    m = Mesh()
    box(m, -0.52, 0.52, 0.0, 0.06, -0.52, 0.52, "stone", top="stoneDark")
    box(m, -0.52, 0.52, 0.06, 0.40, 0.44, 0.52, "wood", top="woodDark",
        front="woodDark", back="woodDark")
    for (x0, x1) in ((-0.52, -0.44), (0.44, 0.52)):
        box(m, x0, x1, 0.06, 0.40, -0.44, 0.52, "wood", top="woodDark")
    for (x0, x1) in ((-0.52, -0.18), (0.18, 0.52)):
        box(m, x0, x1, 0.06, 0.40, -0.52, -0.44, "wood", top="woodDark")
    gable(m, -0.56, 0.56, 0.40, 0.70, 0.04, 0.58,
          slope="inkMid", end="paperShade", ridge="ink")
    box(m, -0.17, 0.17, 0.06, 0.22, 0.14, 0.30, "woodDark", top="wood")   # 食槽
    box(m, -0.22, 0.10, 0.06, 0.24, -0.26, -0.06, "soulFlame")            # 卧兽 · 身
    box(m, -0.31, -0.20, 0.10, 0.28, -0.24, -0.10, "soulFlame")           # 卧兽 · 头
    return m


def bld_hut():
    """草庐 / 修士小屋：极简石脚 + 泥墙木骨 + 厚茅草顶（赭黄）+ 屋侧柴堆。
    识别符号 = 赭黄茅草顶 —— 全部资产里唯一非墨色的屋顶。"""
    m = Mesh()
    box(m, -0.34, 0.34, 0.0, 0.05, -0.32, 0.32, "stoneDark", top="stone")
    box(m, -0.28, 0.28, 0.05, 0.46, -0.26, 0.26, "paperShade",
        top="paperDeep", left="paperShade", right="paperShade")
    for (sx, sz) in ((-0.28, -0.26), (0.23, -0.26), (-0.28, 0.21), (0.23, 0.21)):
        box(m, sx, sx + 0.05, 0.05, 0.48, sz, sz + 0.05, "wood", top="woodDark")
    # 厚茅草顶：主坡 + 加厚檐口（檐口压在墙头之上，仍留出墙面）
    gable(m, -0.36, 0.36, 0.46, 0.76, -0.32, 0.32,
          slope="clay", end="clay", ridge="woodDark")
    box(m, -0.40, 0.40, 0.42, 0.50, -0.36, 0.36, "clay", top="clay")
    box(m, -0.09, 0.09, 0.05, 0.30, -0.275, -0.255, "ink")          # 门
    box(m, 0.13, 0.21, 0.24, 0.36, -0.27, -0.255, "ink")            # 窗
    box(m, 0.30, 0.44, 0.0, 0.14, -0.10, 0.10, "woodDark", top="wood")  # 柴堆
    return m


# ═════════════════════ 废址遗存 ═════════════════════

def bld_sectruin():
    """废弃宗门：大台基（一角塌缺）+ 不等高残墙 + 两根褪色朱柱与一根倒柱
    + 半边残顶 + 断梁。识别符号 = 倒柱与半边屋顶（「曾经宏大」的暗示）。
    残顶后缘搭在后墙上、前缘由一根立柱托住，避免悬空感。"""
    m = Mesh()
    box(m, -0.56, 0.56, 0.0, 0.10, -0.56, 0.56, "stone", top="stoneDark")
    box(m, 0.28, 0.56, 0.0, 0.05, -0.56, -0.28, "stoneDark", top="stone")   # 塌缺角
    box(m, -0.50, 0.06, 0.10, 0.64, 0.42, 0.50, "paperShade", top="paperDeep")
    box(m, 0.06, 0.50, 0.10, 0.32, 0.42, 0.50, "paperShade", top="paperDeep")
    box(m, -0.56, -0.48, 0.10, 0.46, -0.32, 0.50, "paperShade", top="paperDeep")
    box(m, -0.34, -0.26, 0.10, 0.64, 0.06, 0.14, "cinnabar", top="rouge")    # 托顶朱柱
    box(m, 0.26, 0.34, 0.10, 0.56, -0.12, -0.04, "cinnabar", top="rouge")    # 孤立断柱
    box(m, -0.34, 0.34, 0.10, 0.18, -0.40, -0.32, "cinnabar", top="rouge")   # 倒柱
    gable(m, -0.56, 0.02, 0.64, 0.90, 0.08, 0.52,
          slope="inkMid", end="ink", ridge="ink")                            # 半边残顶
    box(m, -0.44, 0.18, 0.10, 0.18, -0.06, 0.02, "woodDark", top="wood")     # 断梁
    return m


def bld_relic():
    """废墟古迹：双层古台（覆苔）+ 中央半截断碑 + 四根环绕残立石 + 一块倒地石。
    识别符号 = 环形立石 + 苔斑断碑。几乎没有「建筑」语义，读作上古祭址。"""
    m = Mesh()
    box(m, -0.48, 0.48, 0.0, 0.08, -0.48, 0.48, "stone", top="stoneDark")
    box(m, -0.38, 0.38, 0.08, 0.16, -0.38, 0.38, "stoneDark", top="stone")
    box(m, -0.34, -0.14, 0.16, 0.175, 0.12, 0.30, "pineGreen")      # 苔斑
    box(m, 0.16, 0.34, 0.16, 0.172, -0.28, -0.10, "malachite")
    # 中央断碑（顶部错位读「断」）
    box(m, -0.06, 0.06, 0.16, 0.68, -0.06, 0.06, "inkLight",
        top="inkMid", front="inkMid")
    box(m, -0.06, 0.00, 0.68, 0.78, -0.06, 0.00, "inkLight", top="inkMid")
    # 四根环绕残立石（不等高）
    for (x0, y1, z0) in ((-0.34, 0.50, -0.34), (0.24, 0.44, -0.30),
                         (-0.32, 0.38, 0.20), (0.22, 0.52, 0.18)):
        box(m, x0, x0 + 0.10, 0.16, y1, z0, z0 + 0.10, "stone", top="stoneDark")
    box(m, 0.10, 0.38, 0.16, 0.24, -0.06, 0.04, "stoneDark", top="stone")   # 倒地石
    return m


# ═════════════════════ 特殊地形 ═════════════════════
# 主题：带用途与故事的地表场所（区别于「地形岩体」——那是可平铺的岩石/台地模块）。
# 与建筑不同：这批是贴地的，高度普遍压在 0.1–0.9，靠「地面图案 + 少量立物」承担识别。

def terr_spiritfield():
    """灵田：田面 + 密排宽垄（窄沟）+ 引水渠 + 一角嫩苗。
    识别符号 = 密排到「连成面」的垄（人工耕作的秩序感）。
    反面教材（三轮才修对，三条凑齐就读成「托盘里摆了几根绿棒」）：
      ① 田埂用纸白 —— 土黄田面被一圈白框圈住，读成「托盘 / 画框」。田埂是泥，必须土色。
      ② 田垄稀而高、彼此隔开 —— 一条条独立的绿棒。垄必须「宽垄窄沟」连成面。
      ③ 田埂垒得比垄还高 —— 又变回托盘。整块压到 0.075 高，田埂只留田面外缘那圈土。
    另注意：不要在这里放一颗 soulFlame 方块当「灵气」——孤立方块只会读作方块。"""
    m = Mesh()
    box(m, -0.50, 0.50, 0.0, 0.05, -0.50, 0.50, "clay", top="clay")          # 田面（外缘留 0.06 土 = 田埂）
    for i in range(9):                                                        # 宽垄窄沟，连成面
        z = -0.44 + i * 0.10
        box(m, -0.44, 0.44, 0.05, 0.075, z, z + 0.08, "malachite", top="pineGreen")
    box(m, -0.44, 0.44, 0.05, 0.065, 0.44, 0.50, "indigo", top="azurite")    # 引水渠
    for (x, z, h) in ((0.30, -0.42, 0.045), (0.35, -0.35, 0.070), (0.40, -0.28, 0.052)):
        box(m, x, x + 0.03, 0.075, 0.075 + h, z, z + 0.03, "pineGreen")       # 一角嫩苗（细而多，方块不像苗）
    return m


def terr_ancientroad():
    """古道：夯土路基 + 沿路向的青石路面（两侧留出夯土路肩）+ 两道深车辙 + 一端塌缺。
    识别符号 = 车辙与塌缺的路头（走过很多年、也荒了很久）。
    反面教材：横向接缝若与车辙同色同宽，整条路会读成「铺砖的地面」——接缝别做。"""
    m = Mesh()
    box(m, -0.50, 0.50, 0.0, 0.05, -0.50, 0.50, "clay", top="clay")           # 夯土路基
    box(m, -0.34, 0.34, 0.05, 0.11, -0.50, 0.30, "stone", top="stoneDark",
        front="stoneDark", back="stoneDark", left="stoneDark", right="stoneDark")
    for x in (-0.20, 0.12):
        box(m, x, x + 0.06, 0.11, 0.125, -0.50, 0.30, "stoneDark", top="inkMid")  # 车辙
    box(m, -0.30, -0.14, 0.05, 0.10, 0.34, 0.46, "stoneDark", top="stone")    # 塌缺碎石
    box(m, 0.04, 0.22, 0.05, 0.08, 0.38, 0.48, "stoneDark", top="stone")
    for (x, z) in ((-0.44, 0.28), (0.44, -0.24), (-0.46, -0.44)):
        box(m, x, x + 0.06, 0.0, 0.14, z, z + 0.06, "pineGreen")              # 路边杂草
    return m


def terr_mountainpath():
    """山道：一侧崖壁（放在背对相机的 −X 侧）+ 沿壁而上的石阶 + 路缘护石 + 石缝杂草。
    识别符号 = 「崖壁 + 台阶」的组合（terr_stairs 只是裸台阶，没有山的语义）。
    注意：崖壁若放在 +X 侧会挡住相机视线，整件会读成「一个大方块」。"""
    m = Mesh()
    box(m, -0.52, -0.14, 0.0, 0.88, -0.52, 0.52, "stone", top="stoneDark",
        front="stoneDark", back="stoneDark")                                  # 崖壁
    stairs(m, -0.14, 0.50, -0.50, 0.50, 0.0, 0.50, 5, "stone", top="stoneDark")
    for (z, h) in ((-0.38, 0.14), (-0.02, 0.26), (0.34, 0.38)):
        box(m, 0.42, 0.52, 0.0, h, z, z + 0.12, "stoneDark", top="stone")     # 护石
    for (x, z) in ((0.44, 0.14), (0.06, -0.30)):
        box(m, x, x + 0.06, 0.0, 0.14, z, z + 0.06, "pineGreen")              # 杂草
    return m


def terr_plankwalk():
    """栈桥：细木桩排架 + 纵梁 + 窄桥面 + 两侧透空栏杆（细立柱 + 顶横杆）。
    识别符号 = 悬空的窄木板 + 成排的细木桩 + 桩间的横撑。
    反面教材（三轮才修对，四条凑齐就整件读成桌子/托盘）：
      ① 桩太粗 ② 桥面太宽 ③ 栏杆做成连成一片的实心边墙 ④ 桩是光溜溜的竖杆、彼此不连。
    对策：桩收到 0.048、面收到 0.24、栏杆「透空」（细立柱 + 顶横杆），
    并给每组桩加一道横撑 —— 排架横撑是木栈桥桥墩的标志，桌子腿绝不会横着连梁。"""
    m = Mesh()
    # 桥体沿 Z 铺展：标准 3/4 相机在 (+X, −Z)，沿 X 铺展长度会被压到 57%，沿 Z 只压到 82%。
    for z in (-0.50, -0.17, 0.17, 0.50):                                       # 四道排架
        for x in (-0.085, 0.055):
            box(m, x, x + 0.03, 0.0, 0.38, z - 0.024, z + 0.024,
                "woodDark", top="wood")                                        # 细木桩
        box(m, -0.085, 0.085, 0.13, 0.18, z - 0.024, z + 0.024,
            "woodDark", top="wood")                                            # 排架横撑
    for x in (-0.10, 0.04):
        box(m, x, x + 0.06, 0.38, 0.44, -0.56, 0.56, "woodDark")               # 纵梁
    # 桥面 = 三块顺向木板 + 两道通缝（通缝是「栈道」不是「桌面」的关键：桌面没有缝）
    for x0, x1 in ((-0.12, -0.045), (-0.028, 0.028), (0.045, 0.12)):
        box(m, x0, x1, 0.44, 0.49, -0.56, 0.56, "wood", top="woodDark",
            left="woodDark", right="woodDark")
    for x in (-0.148, 0.12):                                                   # 透空栏杆
        for z in (-0.50, -0.17, 0.17, 0.50):
            box(m, x, x + 0.028, 0.49, 0.63, z - 0.028, z + 0.028,
                "woodDark", top="wood")                                        # 栏柱
        box(m, x, x + 0.028, 0.63, 0.665, -0.56, 0.56, "woodDark", top="wood")  # 扶手
    return m


def terr_spring():
    """灵泉：天然石台 + 四段不等高石缘泉池 + 深青碧泉水 + 细高灵气柱（下粗上细）+ 池边散石。
    识别符号 = 池心那道「下粗上细」的亮色灵气柱。
    反面教材（三轮才修对，三条凑齐就读成「浴缸 / 泳池」）：
      ① 池缘又高又厚又齐 —— 读成浴缸。泉缘要低、要薄、四段不等高。
      ② 灵气做成一颗等宽方块 —— 只读作方块 / 电线杆。灵气必须「细高」且「下粗上细」才有上浮感。
      ③ 水面与灵气柱用了同一个 soulFlame —— 柱子在池里直接隐形。水要深（indigo/azurite）、柱要亮。"""
    m = Mesh()
    box(m, -0.46, 0.46, 0.0, 0.11, -0.46, 0.46, "stoneDark", top="stone")      # 石台
    box(m, -0.58, -0.36, 0.0, 0.24, 0.28, 0.50, "stone", top="stoneDark")      # 背后立石（破方池的规整感）
    for (x0, x1, z0, z1, y1) in ((-0.46, -0.38, -0.46, 0.46, 0.17),            # 四段不等高泉缘
                                 (0.38, 0.46, -0.46, 0.46, 0.20),
                                 (-0.38, 0.38, -0.46, -0.38, 0.15),
                                 (-0.38, 0.38, 0.38, 0.46, 0.185)):
        box(m, x0, x1, 0.11, y1, z0, z1, "stoneDark", top="stone")
    box(m, -0.38, 0.38, 0.11, 0.15, -0.38, 0.38, "indigo", top="azurite")      # 深青碧泉水
    # 灵气柱：下粗上细三段 + 轻微偏移，读作上浮消散的雾气；亮色压深水
    box(m, -0.050, 0.050, 0.15, 0.34, -0.050, 0.050, "soulFlame")
    box(m, -0.020, 0.050, 0.34, 0.50, -0.025, 0.045, "soulFlame")
    box(m, -0.017, 0.027, 0.50, 0.66, -0.002, 0.042, "soulFlame")
    box(m, -0.44, -0.30, 0.11, 0.20, -0.16, -0.02, "stoneDark", top="stone")   # 池边散石
    box(m, 0.26, 0.40, 0.11, 0.18, 0.20, 0.34, "stoneDark", top="stone")
    return m


def terr_blast():
    """雷击地：地表 + 中心焦土 + 长短不一的放射焦痕 + 焦裂 + 焦枯木 + 焦砾。
    识别符号 = 放射焦痕与焦枯木（焦痕必须长短不一，等长的四条会拼成「十」字，读成符号）。"""
    m = Mesh()
    box(m, -0.50, 0.50, 0.0, 0.06, -0.50, 0.50, "clay", top="clay")
    box(m, -0.32, 0.32, 0.06, 0.08, -0.32, 0.32, "ink", top="inkMid")          # 焦土
    for (x0, x1, z0, z1) in ((-0.50, -0.28, -0.08, 0.02), (0.26, 0.50, -0.03, 0.09),
                             (-0.07, 0.05, -0.50, -0.30), (-0.02, 0.08, 0.28, 0.50),
                             (-0.50, -0.38, 0.30, 0.40), (0.36, 0.50, -0.44, -0.32)):
        box(m, x0, x1, 0.06, 0.075, z0, z1, "ink", top="inkMid")               # 放射焦痕
    box(m, -0.12, 0.10, 0.08, 0.09, -0.20, -0.14, "inkLight")                  # 焦裂
    box(m, -0.10, 0.02, 0.06, 0.34, -0.02, 0.10, "ink", top="inkMid")          # 焦枯木
    box(m, -0.22, -0.08, 0.22, 0.30, 0.00, 0.08, "ink")                        # 断枝
    box(m, 0.34, 0.44, 0.06, 0.13, -0.16, -0.06, "inkMid", top="ink")          # 焦砾
    return m


def terr_battlefield():
    """古战场：翻踏的焦土 + 中央残旗（焦点）+ 插地的断兵器 + 细长白骨 + 破盾。
    识别符号 = 中央那面残旗与四周插地的兵器。
    反面教材（初版三条都犯了，整件读成「桌面上散落几件东西」）：
    焦土别做成平整的浅色板、旗面别做成一颗红方块、白骨别做成方糖。"""
    m = Mesh()
    box(m, -0.50, 0.50, 0.0, 0.06, -0.50, 0.50, "clay", top="clay")
    for (x0, x1, z0, z1) in ((-0.46, 0.02, -0.20, 0.26), (-0.06, 0.40, -0.34, 0.06),
                             (-0.30, 0.16, 0.20, 0.44), (0.10, 0.46, 0.14, 0.42)):
        box(m, x0, x1, 0.06, 0.08, z0, z1, "stoneDark", top="inkLight")       # 焦土
    box(m, -0.03, 0.03, 0.08, 0.74, -0.03, 0.03, "woodDark", top="wood")      # 旗杆
    box(m, 0.03, 0.26, 0.46, 0.68, -0.03, 0.01, "cinnabar", top="rouge")      # 旗面
    box(m, 0.26, 0.34, 0.52, 0.62, -0.03, 0.01, "rouge")                      # 破损旗尾
    for (x, z, h) in ((-0.34, -0.30, 0.56), (-0.18, 0.34, 0.42), (0.34, 0.28, 0.48)):
        box(m, x, x + 0.05, 0.08, h, z, z + 0.05, "inkLight", top="inkMid")   # 插地兵器
    box(m, -0.41, -0.23, 0.48, 0.52, -0.31, -0.27, "inkMid")                  # 戟枝
    box(m, 0.30, 0.43, 0.40, 0.46, 0.27, 0.33, "inkMid")                      # 剑格
    box(m, 0.10, 0.26, 0.08, 0.11, -0.46, -0.41, "snow")                      # 白骨
    box(m, 0.16, 0.20, 0.08, 0.10, -0.38, -0.24, "snow")
    box(m, -0.46, -0.30, 0.08, 0.11, 0.04, 0.09, "snow")
    box(m, 0.30, 0.46, 0.08, 0.14, 0.06, 0.24, "woodDark", top="wood")        # 破盾
    return m


def terr_array():
    """古阵遗址：石阵台 + 内外两圈刻纹 + 残存符柱 + 中央阵眼余辉。
    识别符号 = 地面上的同心刻纹（与 bld_relic 的区别：那边是石头，这边是「图案」）。
    阵眼要压成「平铺的辉斑」，立起来就又变成一颗方块了。"""
    m = Mesh()
    box(m, -0.50, 0.50, 0.0, 0.08, -0.50, 0.50, "stone", top="stoneDark")
    for (x0, x1, z0, z1) in ((-0.42, 0.42, -0.44, -0.40), (-0.42, 0.42, 0.40, 0.44),
                             (-0.44, -0.40, -0.40, 0.40), (0.40, 0.44, -0.40, 0.40)):
        box(m, x0, x1, 0.08, 0.095, z0, z1, "inkLight")                        # 外圈刻纹
    for (x0, x1, z0, z1) in ((-0.24, 0.24, -0.26, -0.23), (-0.24, 0.24, 0.23, 0.26),
                             (-0.26, -0.23, -0.23, 0.23), (0.23, 0.26, -0.23, 0.23)):
        box(m, x0, x1, 0.08, 0.09, z0, z1, "inkLight")                         # 内圈刻纹
    for (x, z, h) in ((-0.42, -0.42, 0.42), (0.34, 0.34, 0.26)):
        box(m, x, x + 0.09, 0.08, h, z, z + 0.09, "stoneDark", top="stone")    # 残符柱
    box(m, -0.12, 0.12, 0.08, 0.115, -0.12, 0.12, "soulFlame")                 # 阵眼余辉（平铺）
    return m


def terr_lair():
    """妖兽巢穴：错落岩体 + 无门楣的野洞（宽 > 高）+ 岩壁斜抓痕 + 洞口散骨 + 爪印。
    识别符号 = 斜抓痕与散骨（与 terr_cave 的区别：那个有门楣与石阶，是「造过」的）。
    反面教材（三轮才修对，四条凑齐整件读成「一座房子 / 一座塔」）：
      ① 抓痕刻成又细又直的竖缝 —— 读成「窗缝」。抓痕必须「斜」且「粗」，否则是窗不是爪。
      ② 骨堆是一颗白方块 —— 读成方糖。骨要细长、要散、要露在土坪上。
      ③ 岩体用 box + pyramid 搭 —— 必然读成建筑。**这是本项目建筑语言本身**
         （bld_scripture 藏经阁 = 三层递减 + 攒尖顶），见下方岩体的注释。
      ④ 洞口做成规整矩形 —— 读成门 / 窗。野洞要「宽 > 高」且口形不规则。
    注意：抓痕与骨堆必须放在相机看得见的 +X / −Z 面，否则等于白做。"""
    m = Mesh()
    # 岩体：手工定义的「不规则多面岩」—— 六边形底 + 偏心顶点。
    # 反面教训（连中三次，每次都是一个建筑母题）：
    #   ① 三块等大、各带大金字塔  = 三间茅屋（村子）
    #   ② 层叠递减的方块          = 藏经阁（本项目建筑语言正是「三层递减 + 攒尖顶」）
    #   ③ 大方盒 + 单一大金字塔    = 亭 / 冢
    # 结论：**岩不能用 box + pyramid 搭** —— 那正是本项目的建筑语言，搭出来必然是建筑。
    # 岩必须「非正交」：底边不等长、不等角，顶点偏心，各面斜度互不相同。
    base = [(-0.56, 0.0, -0.30), (-0.38, 0.0, 0.44), (0.12, 0.0, 0.52),
            (0.54, 0.0, 0.22), (0.54, 0.0, -0.48), (-0.14, 0.0, -0.48)]
    mid = [(-0.44, 0.46, -0.22), (-0.28, 0.46, 0.36), (0.10, 0.46, 0.42),
           (0.54, 0.46, 0.22), (0.54, 0.46, -0.40), (-0.14, 0.46, -0.40)]
    apex = (-0.16, 0.92, 0.00)
    n = len(base)
    for i in range(n):
        j = (i + 1) % n
        m.quad(base[i], base[j], mid[j], mid[i], "stone")     # 底环在 (x,z) 上是顺时针 → 此绕序法线朝外
        m.tri(mid[i], apex, mid[j], "stoneDark")
    m.poly(list(reversed(base)), "stoneDark")                  # 底面（封闭用，不可见）
    # 野洞：宽 > 高，且**占满正面** —— 让「一个洞」而不是「一座房」成为第一眼
    box(m, 0.00, 0.46, 0.02, 0.30, -0.500, -0.42, "ink")
    box(m, 0.06, 0.52, 0.02, 0.24, -0.495, -0.43, "ink")
    box(m, -0.08, 0.20, 0.02, 0.20, -0.498, -0.44, "ink")
    # 洞口岩檐：薄 + 顶面同色（顶面用浅色会读成一块搁板；太厚也会）
    box(m, 0.02, 0.50, 0.30, 0.38, -0.52, -0.38, "stoneDark")
    # 岩壁斜抓痕：三道，斜且粗（+X 面 x=0.54；细直竖缝会读成窗）
    for (yc, zc) in ((0.34, -0.20), (0.23, -0.06), (0.12, 0.08)):
        h, w, sh = 0.058, 0.018, 0.038
        m.quad((0.542, yc - h, zc - w + sh), (0.542, yc + h, zc - w),
               (0.542, yc + h, zc + w), (0.542, yc - h, zc + w + sh), "ink")
    box(m, -0.40, 0.40, 0.0, 0.04, -0.76, -0.46, "clay", top="clay")           # 洞前土坪
    for (x, z) in ((-0.18, -0.70), (-0.08, -0.67), (0.02, -0.64)):             # 爪印
        m.quad((x, 0.045, z), (x, 0.045, z + 0.045),
               (x + 0.05, 0.045, z + 0.045), (x + 0.05, 0.045, z), "ink")
    # 散骨：细长、多根、不堆成一坨
    box(m, 0.12, 0.34, 0.04, 0.075, -0.72, -0.685, "snow")
    box(m, 0.16, 0.22, 0.075, 0.10, -0.705, -0.685, "snow")
    box(m, -0.02, 0.12, 0.04, 0.068, -0.63, -0.60, "snow")
    box(m, 0.34, 0.44, 0.04, 0.062, -0.62, -0.585, "snow")
    box(m, -0.48, -0.34, 0.0, 0.10, -0.68, -0.54, "stoneDark", top="stone")    # 散石
    box(m, 0.40, 0.50, 0.0, 0.07, -0.72, -0.62, "stoneDark", top="stone")
    return m


def terr_immortalcave():
    """仙人洞府：岩体 + 攒尖岩顶 + 规整石门框 + 门内灵光 + 门前石阶 + 一对石灯（金顶）+ 山脚云气。
    识别符号 = 石门框与石灯（有「营造」痕迹，与妖兽巢穴的野洞正好相对）。
    云气要做「贴地的雾带」——悬在顶上会读成一颗白方块。"""
    m = Mesh()
    box(m, -0.56, 0.56, 0.0, 0.72, -0.52, 0.52, "stone", top="stoneDark",
        front="stoneDark", back="stoneDark")
    pyramid(m, 0.0, 0.0, 0.72, 1.06, 0.56, 0.52, "stoneDark")
    for sx in (-0.26, 0.20):
        box(m, sx, sx + 0.06, 0.10, 0.62, -0.60, -0.54, "stoneDark", top="stone")
    box(m, -0.28, 0.28, 0.62, 0.70, -0.62, -0.52, "stoneDark", top="stone")    # 门楣
    box(m, -0.20, 0.20, 0.10, 0.58, -0.56, -0.46, "ink")                       # 门洞
    box(m, -0.12, 0.12, 0.10, 0.26, -0.60, -0.56, "soulFlame")                 # 门内灵光
    stairs(m, -0.22, 0.22, -0.86, -0.62, 0.0, 0.10, 3, "stone", top="stoneDark")
    for sx in (-0.48, 0.40):
        box(m, sx, sx + 0.08, 0.0, 0.30, -0.72, -0.64, "stoneDark", top="stone")   # 石灯
        box(m, sx - 0.01, sx + 0.09, 0.30, 0.36, -0.73, -0.63, "gold")             # 灯顶
    box(m, -0.62, 0.62, 0.0, 0.09, -0.70, -0.52, "mist")                       # 山脚云气
    return m


# ───────────────────────── 清单 ─────────────────────────
BUILDINGS = [
    ("bld_house", "民居", bld_house),
    ("bld_hall", "宗祠", bld_hall),
    ("bld_tower", "望楼", bld_tower),
    ("bld_gate", "牌坊", bld_gate),
    ("bld_wall", "垣墙", bld_wall),
    ("bld_ruin", "残垣", bld_ruin),
    ("bld_altar", "祭坛", bld_altar),
    ("bld_bridge", "拱桥", bld_bridge),
]
TERRAIN = [
    ("terr_cave", "洞府入口", terr_cave),
    ("terr_arch", "天然石门", terr_arch),
    ("terr_pillar", "石林", terr_pillar),
    ("terr_cliff", "断崖", terr_cliff),
    ("terr_rock", "岩壁块", terr_rock),
    ("terr_terrace", "层台", terr_terrace),
    ("terr_stairs", "石阶", terr_stairs),
    ("terr_slab", "石台", terr_slab),
]

SECT = [
    ("bld_manor", "富户宅院", bld_manor),
    ("bld_dorm", "弟子房", bld_dorm),
    ("bld_alchemy", "丹房", bld_alchemy),
    ("bld_scripture", "藏经阁", bld_scripture),
    ("bld_forge", "炼器房", bld_forge),
    ("bld_beastpen", "灵兽棚", bld_beastpen),
    ("bld_hut", "草庐", bld_hut),
]
RUINS = [
    ("bld_sectruin", "废弃宗门", bld_sectruin),
    ("bld_relic", "废墟古迹", bld_relic),
]

SITE = [
    ("terr_spiritfield", "灵田", terr_spiritfield),
    ("terr_ancientroad", "古道", terr_ancientroad),
    ("terr_mountainpath", "山道", terr_mountainpath),
    ("terr_plankwalk", "栈桥", terr_plankwalk),
    ("terr_spring", "灵泉", terr_spring),
    ("terr_blast", "雷击地", terr_blast),
    ("terr_battlefield", "古战场", terr_battlefield),
    ("terr_array", "古阵遗址", terr_array),
    ("terr_lair", "妖兽巢穴", terr_lair),
    ("terr_immortalcave", "仙人洞府", terr_immortalcave),
]

ALL = [("建筑", BUILDINGS), ("地形岩体", TERRAIN),
       ("宗门宅院", SECT), ("废址遗存", RUINS), ("特殊地形", SITE)]
