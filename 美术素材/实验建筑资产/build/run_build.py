# -*- coding: utf-8 -*-
"""
《坐天观井 / Inkbox》实验建筑资产 · 外部编排

  1. 生成共享颜色词典图集（Pillow）
  2. 驱动无头 Blender 建模 / UV / 导出 GLB+OBJ / 渲染预览
  3. 合成预览接触表

运行：
  C:/Users/Administrator/.workbuddy-ai/binaries/python/envs/default/Scripts/python.exe build/run_build.py
"""
import os
import sys
import subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)

BLENDER = os.environ.get(
    "INKBOX_BLENDER",
    r"D:\Program Files\Blender Foundation\Blender 5.2\blender.exe",
)

import inkbox_palette as PAL       # noqa: E402
import inkbox_geom as GEO          # noqa: E402


def step1_atlas():
    path = os.path.join(ROOT, "Inkbox_EntityAtlas.png")
    PAL.build_atlas(path)
    print("[1/3] 图集：%s (%d×%d, %d 色)" % (os.path.basename(path),
                                            PAL.ATLAS_SIZE, PAL.ATLAS_SIZE,
                                            len(PAL.PALETTE)))


def step2_blender():
    if not os.path.exists(BLENDER):
        raise SystemExit("找不到 Blender：%s（可用环境变量 INKBOX_BLENDER 覆盖）" % BLENDER)
    script = os.path.join(HERE, "inkbox_blender.py")
    cmd = [BLENDER, "--background", "--factory-startup", "--python", script, "--", ROOT]
    print("[2/3] Blender 无头构建 …")
    proc = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
    tail = [ln for ln in (proc.stdout or "").splitlines()
            if ln.strip() and not ln.startswith("Blender quit")]
    for ln in tail[-40:]:
        print("   ", ln)
    if proc.returncode != 0:
        print("--- stderr ---")
        print((proc.stderr or "")[-3000:])
        raise SystemExit("Blender 构建失败（exit %d）" % proc.returncode)


def step3_sheet():
    from PIL import Image, ImageDraw, ImageFont
    prev = os.path.join(ROOT, "预览")

    def font(sz):
        for p in (r"C:\Windows\Fonts\msyh.ttc", r"C:\Windows\Fonts\simhei.ttf"):
            if os.path.exists(p):
                return ImageFont.truetype(p, sz)
        return ImageFont.load_default()

    title_font, label_font = font(21), font(15)
    cell, pad, title_h = 220, 16, 36
    cols = 5
    bg = (244, 239, 226)
    ink = (34, 32, 28)
    ink_light = (125, 119, 107)

    groups = []
    for gname, items in GEO.ALL:
        groups.append((gname, [(n, cn) for (n, cn, _f) in items]))

    W = pad + cols * (cell + pad)
    H = pad + sum(title_h + ((len(it) + cols - 1) // cols) * (cell + pad)
                  for _t, it in groups) + pad
    sheet = Image.new("RGB", (W, H), bg)
    dr = ImageDraw.Draw(sheet)

    y = pad
    for gname, items in groups:
        dr.text((pad + 4, y + 6), gname, font=title_font, fill=ink)
        dr.line([(pad, y + title_h - 8), (W - pad, y + title_h - 8)], fill=ink_light, width=1)
        y += title_h
        for i, (name, cn) in enumerate(items):
            x = pad + (i % cols) * (cell + pad)
            yy = y + (i // cols) * (cell + pad)
            p = os.path.join(prev, name + ".png")
            if os.path.exists(p):
                tile = Image.open(p).convert("RGB").resize((cell, cell), Image.LANCZOS)
                sheet.paste(tile, (x, yy))
            dr.rectangle([x, yy, x + cell - 1, yy + cell - 1], outline=ink_light, width=1)
            dr.text((x + 6, yy + cell - 21), "%s  %s" % (cn, name.split("_", 1)[1]),
                    font=label_font, fill=ink)
        y += ((len(items) + cols - 1) // cols) * (cell + pad)

    out = os.path.join(prev, "contact_sheet.png")
    sheet.save(out)
    print("[3/3] 接触表：%s (%d×%d)" % (out, W, H))


if __name__ == "__main__":
    step1_atlas()
    step2_blender()
    step3_sheet()
    print("\n完成。")
