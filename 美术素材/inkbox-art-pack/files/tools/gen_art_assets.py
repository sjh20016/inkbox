#!/usr/bin/env python3
"""墨界美术素材生成器（Inkbox Art Pass）

全部素材由程序生成：没有外部图片、没有版权来源问题；改参数重跑即可换风格。
依赖：numpy、Pillow。用法：  python3 tools/gen_art_assets.py [输出目录，默认 assets/art]

产物（均为 PNG，合计约百 KB 量级）：
  paper_grain.png   512x512  无缝宣纸纤维，近白底；DOM 叠层 mix-blend-mode:multiply
  cun.png           256x256  皴法：竖向干笔飞白（灰度，R 通道=墨量）
  edge.png          256x16   毛边：横向一维噪声（R 通道），用于墙缘墨线抖动
  mist_puff.png     128x128  云气团：径向柔边 + 噪声（A 通道）
  ramp_upper.png / ramp_nether.png   128x1  墙体地层色带：左=凡间一端，右=目标界一端
  manifest.json     尺寸与用途；加载器据此做存在性检查
"""
import json
import os
import sys

import numpy as np
from PIL import Image

OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'art')
OUT = os.path.abspath(OUT)
os.makedirs(OUT, exist_ok=True)
rng = np.random.default_rng(20260930)  # 固定种子：素材可复现


def tile_noise(h, w, octaves, base_cells, persistence=0.5):
    """无缝（可平铺）分形值噪声。h、w 方向各自按整数格周期，保证首尾衔接。"""
    out = np.zeros((h, w), np.float32)
    amp, total = 1.0, 0.0
    for o in range(octaves):
        cy = max(1, base_cells * (2 ** o)) if h > 1 else 1
        cx = max(1, base_cells * (2 ** o)) if w > 1 else 1
        grid = rng.random((cy, cx)).astype(np.float32)
        ys = np.linspace(0, cy, h, endpoint=False)
        xs = np.linspace(0, cx, w, endpoint=False)
        y0 = np.floor(ys).astype(int) % cy
        x0 = np.floor(xs).astype(int) % cx
        y1, x1 = (y0 + 1) % cy, (x0 + 1) % cx
        fy = (ys - np.floor(ys)).astype(np.float32)
        fx = (xs - np.floor(xs)).astype(np.float32)
        fy = fy * fy * (3 - 2 * fy)
        fx = fx * fx * (3 - 2 * fx)
        a = grid[y0][:, x0] * (1 - fx)[None, :] + grid[y0][:, x1] * fx[None, :]
        b = grid[y1][:, x0] * (1 - fx)[None, :] + grid[y1][:, x1] * fx[None, :]
        out += amp * (a * (1 - fy)[:, None] + b * fy[:, None])
        total += amp
        amp *= persistence
    return out / total


def save(arr, name, mode):
    Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), mode).save(os.path.join(OUT, name), optimize=True)


manifest = {}

# 1. 宣纸纤维 ---------------------------------------------------
N = 512
grain = tile_noise(N, N, 4, 8) - 0.5
fine = rng.random((N, N)).astype(np.float32) - 0.5
fibres = np.zeros((N, N), np.float32)
for _ in range(900):                                  # 随机短纤维；取模写入保证无缝
    x, y = rng.integers(0, N, 2)
    ang = rng.uniform(0, np.pi)
    for t in range(int(rng.integers(8, 34))):
        px, py = int(x + np.cos(ang) * t) % N, int(y + np.sin(ang) * t) % N
        fibres[py, px] = max(fibres[py, px], rng.uniform(0.25, 0.7))
darken = np.maximum(0.040 * grain + 0.030 * fine + 0.11 * fibres, 0)
lum = np.clip(1.0 - darken - 0.010, 0, 1)
save(lum * 255, 'paper_grain.png', 'L')            # 灰度即可：暖色由 CSS 叠层提供
manifest['paper_grain'] = {'file': 'paper_grain.png', 'w': N, 'h': N, 'use': 'DOM multiply overlay'}

# 2. 皴：竖向干笔飞白 -------------------------------------------
# 64 道笔（每道 4px 宽）；每道笔沿纵向有自己的断续（飞白），再叠一点纸纹颗粒。
S = 256
BR = 64
col = tile_noise(1, BR, 3, 8)[0]
col = (col - col.min()) / (col.max() - col.min())
streak = np.stack([tile_noise(S, 1, 3, int(rng.integers(2, 5)))[:, 0] for _ in range(BR)], axis=1)   # (S, BR)
ink = 0.45 * col[None, :] + 0.75 * streak
ink = np.repeat(ink, S // BR, axis=1)                                      # 展开成 4px 宽的笔道
# 笔道边缘轻微抖动：水平方向 3 像素箱式模糊
k = np.ones(3, np.float32) / 3
ink = np.apply_along_axis(lambda v: np.convolve(np.pad(v, 1, mode='wrap'), k, 'valid'), 1, ink)
ink += 0.10 * (rng.random((S, S)).astype(np.float32) - 0.5)
t = np.clip((ink - 0.38) / 0.45, 0, 1)
ink = t * t * (3 - 2 * t)                                                  # 软阈值，不再是纯黑白
save(ink * 255, 'cun.png', 'L')
manifest['cun'] = {'file': 'cun.png', 'w': S, 'h': S, 'use': 'wall dry-brush strokes (R=ink amount)'}

# 3. 毛边一维噪声 ------------------------------------------------
EW, EH = 256, 16
e = tile_noise(1, EW, 5, 6)[0]
e = (e - e.min()) / (e.max() - e.min())
save(np.repeat(e[None, :], EH, 0) * 255, 'edge.png', 'L')
manifest['edge'] = {'file': 'edge.png', 'w': EW, 'h': EH, 'use': 'wall edge wobble (R)'}

# 4. 云气团 ------------------------------------------------------
M = 128
yy, xx = np.mgrid[0:M, 0:M].astype(np.float32)
r = np.hypot(xx - M / 2 + 0.5, yy - M / 2 + 0.5) / (M / 2)
radial = np.clip((1 - r) / 0.85, 0, 1); radial = radial * radial * (3 - 2 * radial)
cloud = tile_noise(M, M, 4, 3)
alpha = np.clip(radial * (0.35 + 1.1 * (cloud - 0.25)), 0, 1) * 0.9
rgba = np.dstack([np.full((M, M), 244.0), np.full((M, M), 240.0), np.full((M, M), 228.0), alpha * 255])
save(rgba, 'mist_puff.png', 'RGBA')
manifest['mist_puff'] = {'file': 'mist_puff.png', 'w': M, 'h': M, 'use': 'rim mist sprite (A)'}


# 5. 墙体地层色带 ------------------------------------------------
def ramp(stops, n=128):
    xs = np.array([s[0] for s in stops], np.float32)
    cs = np.array([s[1] for s in stops], np.float32)
    t = np.linspace(0, 1, n)
    return np.stack([np.interp(t, xs, cs[:, k]) for k in range(3)], -1)


# 左端=凡间岩体（赭石、土褐）；右端=目标界。颜色取自 core/config.js 的 INK 水墨色系。
ramps = {
    'upper': [(0.00, (118, 98, 72)), (0.35, (170, 150, 112)), (0.70, (214, 218, 205)), (1.00, (238, 240, 226))],
    'nether': [(0.00, (118, 98, 72)), (0.35, (92, 80, 76)), (0.70, (62, 54, 66)), (1.00, (36, 30, 42))],
}
for plane, stops in ramps.items():
    rgb = ramp(stops)[None, :, :]
    rgba = np.dstack([rgb, np.full((1, rgb.shape[1]), 255.0)])
    save(rgba, f'ramp_{plane}.png', 'RGBA')
    manifest[f'ramp_{plane}'] = {'file': f'ramp_{plane}.png', 'w': 128, 'h': 1, 'use': 'wall strata ramp (left=mortal, right=target)'}

with open(os.path.join(OUT, 'manifest.json'), 'w', encoding='utf-8') as f:
    json.dump({'version': 1, 'generator': 'tools/gen_art_assets.py', 'seed': 20260930, 'assets': manifest}, f, ensure_ascii=False, indent=2)

total = sum(os.path.getsize(os.path.join(OUT, n)) for n in os.listdir(OUT))
print(f'wrote {len(manifest)} assets + manifest.json to {OUT} ({total/1024:.0f} KB)')
