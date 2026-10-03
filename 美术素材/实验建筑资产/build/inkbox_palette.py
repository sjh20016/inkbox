# -*- coding: utf-8 -*-
"""
《坐天观井 / Inkbox》实验建筑资产 · 颜色词典与共享图集

单一真相源：几何模块与 Blender 脚本都从这里取「颜色名 → 图集 UV 中心」。
图集是颜色词典，不是传统贴图：每格纯色，NearestFilter 下 UV 取色精确。
颜色对齐 src/inkbox/core/config.js 的 INK，并吸收《中国画 AI 配色参考》。

生成图集需要 Pillow（外部 Python），Blender 侧只读取已生成的 PNG。
"""
import os

# key            rgb                   语义（第 1 层纸墨 / 第 2 层木石 / 第 3 层矿物 / 第 4 层三界）
PALETTE = [
    ("paper",        (233, 224, 205)),   # 宣纸 · 墙
    ("paperDeep",    (217, 205, 180)),   # 熟宣深 · 墙暗面
    ("paperShade",   (198, 184, 158)),   # 赭灰 · 墙脚 / 屋身暗
    ("mist",         (244, 239, 226)),   # 蛤粉 · 云雾 / 高光
    ("ink",          (34, 32, 28)),      # 松烟墨 · 门洞 / 屋脊
    ("inkMid",       (74, 70, 62)),      # 重墨 · 屋顶
    ("inkLight",     (125, 119, 107)),   # 淡墨 · 青灰石面
    ("stone",        (154, 147, 132)),   # 石
    ("stoneDark",    (111, 106, 94)),    # 石暗
    ("wood",         (138, 106, 68)),    # 赭石木
    ("woodDark",     (93, 70, 48)),      # 赭墨老木
    ("clay",         (169, 122, 82)),    # 赭黄 · 土坡 / 木构亮
    ("cinnabar",     (168, 73, 60)),     # 朱砂 · 礼制 / 柱
    ("rouge",        (156, 74, 92)),     # 胭脂 · 朱砂暗部
    ("gold",         (176, 143, 62)),    # 泥金 · 只做线边纹
    ("azurite",      (63, 95, 125)),     # 石青
    ("indigo",       (49, 80, 95)),      # 花青
    ("malachite",    (77, 107, 82)),     # 石绿
    ("pineGreen",    (63, 90, 69)),      # 老绿
    ("orchid",       (107, 74, 107)),    # 紫檀
    ("upperA",       (168, 182, 189)),   # 上界淡青
    ("upperB",       (143, 167, 184)),   # 上界青
    ("upperC",       (200, 164, 78)),    # 上界金
    ("upperD",       (143, 176, 216)),   # 上界天青
    ("nether",       (42, 37, 48)),      # 幽冥紫黑
    ("netherMid",    (61, 55, 69)),      # 幽冥中
    ("soulFlame",    (127, 168, 143)),   # 魂火青绿
    ("snow",         (240, 236, 224)),   # 雪
]

COLOR_RGB = dict(PALETTE)
ATLAS_SIZE = 128
ATLAS_GRID = 8                      # 8×8 = 64 色格，每格 16×16 px
ATLAS_CELL = ATLAS_SIZE // ATLAS_GRID

# 颜色名 → 图集 UV 中心
# 图集按 PIL 习惯生成：色格 0..7 在「顶行」（图像坐标 y 向下）。
# 因此这里给出两套 V：
#   UV        glTF / OBJ 约定（V=0 在图像顶部）
#   UV_BLEND  Blender 约定（V=0 在图像底部）—— Blender 渲染必须用它
UV = {}
UV_BLEND = {}
for _i, (_n, _rgb) in enumerate(PALETTE):
    _u = ((_i % ATLAS_GRID) + 0.5) / ATLAS_GRID
    _v_top = ((_i // ATLAS_GRID) + 0.5) / ATLAS_GRID
    UV[_n] = (_u, _v_top)
    UV_BLEND[_n] = (_u, 1.0 - _v_top)


def build_atlas(path):
    """生成共享颜色词典图集（需 Pillow）。"""
    from PIL import Image
    img = Image.new("RGB", (ATLAS_SIZE, ATLAS_SIZE), COLOR_RGB["paper"])
    px = img.load()
    for i, (_n, rgb) in enumerate(PALETTE):
        cx = (i % ATLAS_GRID) * ATLAS_CELL
        cy = (i // ATLAS_GRID) * ATLAS_CELL
        for y in range(cy, cy + ATLAS_CELL):
            for x in range(cx, cx + ATLAS_CELL):
                px[x, y] = rgb
    img.save(path, format="PNG")
    return path


if __name__ == "__main__":
    here = os.path.dirname(os.path.abspath(__file__))
    out = os.path.join(os.path.dirname(here), "Inkbox_EntityAtlas.png")
    build_atlas(out)
    print("atlas:", out, ATLAS_SIZE, "×", ATLAS_SIZE, len(PALETTE), "色")
