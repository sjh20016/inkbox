"""Screenshot diagnostics, not pass/fail targets. Never edits the input images."""
import argparse
import json
from pathlib import Path
import numpy as np
from PIL import Image


def analyze(path, paper, crop):
    im = Image.open(path).convert("RGB")
    region = im.crop(crop) if crop else im
    rgb = np.asarray(region, dtype=np.float32) / 255.0
    maximum, minimum = rgb.max(axis=2), rgb.min(axis=2)
    saturation = (maximum - minimum) / np.maximum(maximum, 1e-5)
    brightness = rgb @ np.array([0.2126, 0.7152, 0.0722])
    paper_rgb = np.array([int(paper[i:i+2], 16)/255 for i in (1, 3, 5)])
    near_paper = np.max(np.abs(rgb - paper_rgb), axis=2) < 0.09
    # Adjacent luminance differences are a reproducible coarse edge diagnostic.
    edge = np.maximum(np.abs(np.diff(brightness, axis=0, prepend=brightness[:1])),
                      np.abs(np.diff(brightness, axis=1, prepend=brightness[:, :1])))
    return {
        "file": path.name, "imageSize": list(im.size), "crop": crop,
        "nearPaperRatio": float(near_paper.mean()),
        "meanSaturation": float(saturation.mean()),
        "midToneRatio": float(((brightness >= 0.25) & (brightness < 0.75)).mean()),
        "edgeDensity": float((edge > 0.065).mean()),
        "pointColorRatio": float(((saturation > 0.22) & (brightness < 0.90)).mean()),
        "brightness": float(brightness.mean()),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path)
    parser.add_argument("--paper", default="#f5f2ea")
    parser.add_argument("--crop", type=int, nargs=4, default=[180, 100, 1255, 850],
                        help="Same playfield rectangle for the 1500x940 evidence set; contains some existing UI overlays")
    args = parser.parse_args()
    files = sorted(args.directory.glob("*.png"))
    report = {
        "purpose": "diagnostic guardrails only; compare identical snapshot, camera and viewport and judge screenshots",
        "paper": args.paper,
        "definitions": {"nearPaper": "RGB max absolute difference < .09", "midTone": "luminance .25 to .75",
                        "edge": "adjacent luminance change > .065", "pointColor": "HSV saturation > .22, luminance < .90"},
        "images": [analyze(path, args.paper, args.crop) for path in files],
    }
    output = args.directory / "visual-metrics.json"
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"{len(files)} screenshots analyzed: {output}")


if __name__ == "__main__":
    main()
