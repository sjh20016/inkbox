#!/usr/bin/env python3
"""Independent PSD, geometry, export, and compositing checks for the G2-P master."""

from __future__ import annotations

import argparse
import io
import json
import math
import struct
import sys
from pathlib import Path

from PIL import Image, ImageCms, ImageChops, ImageDraw, ImageFont
from psd_tools import PSDImage


ROOT = Path(__file__).resolve().parents[2]
MASTER = ROOT / "assets/portraits/source/inkbox_face_master_v1.psd"
PREVIEW = ROOT / "assets/portraits/source/inkbox_face_master_preview.png"
ANCHORS = ROOT / "assets/portraits/source/portraitAnchors.v1.json"
PACK = ROOT / "assets/portraits/inkbox-face-v1"
EXAMPLE_MANIFEST = PACK / "manifest.example.json"
MAP_FILE = ROOT / "tools/portrait-master/export-map.v1.json"
EXAMPLE_ROOT = PACK / "examples/master-demo"
QA_ROOT = ROOT / "research/g2-portrait-preview"
SLOT_ORDER = [
    "background", "backHair", "robe", "neck", "face", "ears", "eyes", "brows",
    "nose", "mouth", "cheeks", "skinMarks", "frontHair", "ornament", "effects", "frame",
]
PSD_ROOT_ORDER = [f"{index:02d}_{slot}" for index, slot in enumerate(SLOT_ORDER)]
DEFAULT_IDS = {
    "background": "round-01", "backHair": "loose-01", "robe": "sage-01", "neck": "base",
    "face": "oval-01", "ears": "base", "eyes": "calm-01", "brows": "level-01",
    "nose": "dot-01", "mouth": "neutral-01", "cheeks": "base", "frontHair": "part-01",
    "ornament": "pin-01", "frame": "base",
}


def fail(message: str) -> None:
    raise RuntimeError(message)


def require(condition: bool, message: str) -> None:
    if not condition:
        fail(message)


def children_by_name(layer):
    return {child.name: child for child in layer}


def get_path(root, names):
    layer = root
    for name in names:
        match = next((child for child in layer if child.name == name), None)
        if match is None:
            fail(f"Missing PSD layer/group: {'/'.join(names)}")
        layer = match
    return layer


def count_tree(psd):
    groups = 0
    pixels = 0
    nonempty = 0
    def visit(layer):
        nonlocal groups, pixels, nonempty
        if layer.is_group():
            groups += 1
            for child in layer:
                visit(child)
        elif layer.kind == "pixel":
            pixels += 1
            image = layer.topil()
            if image is not None and image.mode in ("RGBA", "LA") and image.getchannel("A").getbbox():
                nonempty += 1
    for layer in psd:
        visit(layer)
    return groups, pixels, nonempty


def alpha_bbox(path: Path):
    with Image.open(path) as image:
        rgba = image.convert("RGBA")
        return rgba.getchannel("A").getbbox()


def write_size_previews(image: Image.Image):
    QA_ROOT.mkdir(parents=True, exist_ok=True)
    for size in (256, 128, 64, 48):
        image.resize((size, size), Image.Resampling.LANCZOS).save(
            QA_ROOT / f"inkbox-face-master-{size}.png", optimize=True
        )


def load_export(path: str) -> Image.Image:
    file = PACK / path
    if not file.is_file():
        fail(f"Missing exported PNG: {file.relative_to(ROOT)}. Run node tools/portrait-master/export.mjs first.")
    image = Image.open(file).convert("RGBA")
    with Image.open(file) as source:
        require(image.size == (512, 512), f"{file.relative_to(ROOT)} is {image.size}, expected 512x512.")
        require("A" in source.getbands(), f"{file.relative_to(ROOT)} has no transparency channel.")
    return image


def compose(manifest, selected, overlays=()):
    result = Image.new("RGBA", (512, 512), (0, 0, 0, 0))
    for slot in SLOT_ORDER:
        variant = selected.get(slot)
        if variant is not None:
            relpath = manifest["slots"].get(slot, {}).get(variant)
            require(relpath is not None, f"Missing manifest mapping for {slot}.{variant}.")
            result.alpha_composite(load_export(relpath))
        for overlay_slot, overlay_id in overlays:
            if overlay_slot == slot:
                relpath = manifest["slots"].get(slot, {}).get(overlay_id)
                require(relpath is not None, f"Missing overlay mapping for {slot}.{overlay_id}.")
                result.alpha_composite(load_export(relpath))
    return result


def write_stress_matrix(manifest):
    base = dict(DEFAULT_IDS)
    scenarios = [
        ("BASE", compose(manifest, base)),
        ("ALT FACE+FEATURES", compose(manifest, {**base, "face": "round-01", "eyes": "round-01", "brows": "sword-01", "mouth": "smile-01", "backHair": "bun-01", "robe": "paper-01", "frontHair": "sweep-01"})),
        ("AGE + SCAR", compose(manifest, base, [("skinMarks", "age-lines"), ("skinMarks", "scar")])),
        ("INJURY + CORRUPTION", compose(manifest, base, [("skinMarks", "bruise-small"), ("skinMarks", "corruption-1")])),
        ("GHOST + SCAR", compose(manifest, base, [("skinMarks", "ghost"), ("skinMarks", "scar")])),
        ("GHOST + FIRE", compose(manifest, base, [("skinMarks", "ghost"), ("effects", "technique-fire")])),
        ("AGE + CORRUPTION", compose(manifest, base, [("skinMarks", "age-lines"), ("skinMarks", "corruption-1")])),
        ("FROST TECHNIQUE", compose(manifest, base, [("effects", "technique-frost")])),
        ("INJURY + FRONT HAIR", compose(manifest, base, [("skinMarks", "bruise-small")])),
    ]
    cell_w, cell_h, cols = 250, 274, 3
    sheet = Image.new("RGB", (cell_w * cols, cell_h * 3), (30, 37, 39))
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.load_default()
    for index, (label, image) in enumerate(scenarios):
        x, y = (index % cols) * cell_w, (index // cols) * cell_h
        thumb = image.resize((224, 224), Image.Resampling.LANCZOS)
        sheet.paste(thumb.convert("RGB"), (x + 13, y + 12))
        draw.text((x + 13, y + 244), label, fill=(238, 232, 218), font=font)
    QA_ROOT.mkdir(parents=True, exist_ok=True)
    sheet.save(QA_ROOT / "inkbox-face-master-stress-matrix.png", optimize=True)
    return scenarios


def write_composite_comparison(psd_preview: Image.Image, runtime_composite: Image.Image):
    left = psd_preview.convert("RGBA").resize((512, 512), Image.Resampling.LANCZOS)
    right = runtime_composite.convert("RGBA")
    difference = ImageChops.difference(left, right).convert("RGB").point(lambda value: min(255, value * 6))
    sheet = Image.new("RGB", (1536, 538), (30, 37, 39))
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.load_default()
    draw.text((16, 6), "PSD master", fill=(238, 232, 218), font=font)
    draw.text((528, 6), "G2-P PNG composite", fill=(238, 232, 218), font=font)
    draw.text((1040, 6), "Difference x6", fill=(238, 232, 218), font=font)
    sheet.paste(left.convert("RGB"), (0, 26))
    sheet.paste(right.convert("RGB"), (512, 26))
    sheet.paste(difference, (1024, 26))
    QA_ROOT.mkdir(parents=True, exist_ok=True)
    sheet.save(QA_ROOT / "inkbox-face-master-composite-comparison.png", optimize=True)


def check_busuanzi_previews():
    paths = [
        QA_ROOT / "inkbox-face-master-busuanzi-sealed.png",
        QA_ROOT / "inkbox-face-master-busuanzi-wind.png",
    ]
    for path in paths:
        require(path.is_file(), f"Missing layered talisman concept preview: {path.name}.")
        with Image.open(path) as image:
            require(image.format == "PNG" and image.size == (1024, 1024), f"Invalid talisman concept preview: {path.name}.")
    with Image.open(paths[0]) as sealed, Image.open(paths[1]) as wind:
        require(ImageChops.difference(sealed.convert("RGB"), wind.convert("RGB")).getbbox() is not None, "Sealed and wind-reveal concept states must differ.")


def compare_images(a: Image.Image, b: Image.Image):
    aa = a.convert("RGBA")
    bb = b.convert("RGBA")
    diff = ImageChops.difference(aa, bb)
    extrema = diff.getextrema()
    max_delta = max(pair[1] for pair in extrema)
    mean_delta = sum(ImageStatMean(diff)) / 4
    return max_delta, mean_delta


def ImageStatMean(image):
    import PIL.ImageStat
    return PIL.ImageStat.Stat(image).mean


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--psd", default=str(MASTER))
    parser.add_argument("--preview", default=str(PREVIEW))
    parser.add_argument("--manifest", default=str(EXAMPLE_MANIFEST))
    parser.add_argument("--map", default=str(MAP_FILE))
    parser.add_argument("--photoshop-render", help="Optional PNG exported by Photoshop after opening, saving, and reopening the PSD.")
    args = parser.parse_args()
    psd_path = Path(args.psd).resolve()
    require(psd_path.is_file(), f"Missing PSD: {psd_path}")
    raw = psd_path.read_bytes()
    require(raw[:4] == b"8BPS", "PSD signature is not 8BPS.")
    require(struct.unpack(">H", raw[4:6])[0] == 1, "Expected PSD version 1 (not PSB).")
    channels = struct.unpack(">H", raw[12:14])[0]
    height = struct.unpack(">I", raw[14:18])[0]
    width = struct.unpack(">I", raw[18:22])[0]
    depth = struct.unpack(">H", raw[22:24])[0]
    mode = struct.unpack(">H", raw[24:26])[0]
    require((width, height, depth, mode) == (1024, 1024, 8, 3), f"Expected RGB/8 1024x1024, got {width}x{height}, depth={depth}, mode={mode}.")
    require(channels in (3, 4), f"Unexpected composite channel count: {channels}.")

    psd = PSDImage.open(psd_path)
    require((psd.width, psd.height, psd.depth) == (1024, 1024, 8), "Independent psd-tools reader reports incorrect dimensions/depth.")
    require(int(psd.color_mode) == 3, "Independent parser does not report RGB color mode.")
    roots = list(psd)
    root_names = [layer.name for layer in roots]
    require(root_names == PSD_ROOT_ORDER, f"Runtime slot root groups/bottom-to-top order mismatch: {root_names}")
    require(all(layer.is_group() for layer in roots), "One or more runtime slots is not an editable PSD group.")

    resource = psd.image_resources.get_data(1039)
    require(resource is not None and len(resource) >= 128 and resource[36:40] == b"acsp", "PSD is missing a valid embedded ICC profile.")
    profile = ImageCms.ImageCmsProfile(io.BytesIO(resource))
    profile_name = ImageCms.getProfileDescription(profile)
    require("sRGB IEC61966-2.1" in profile_name, f"Expected an embedded sRGB profile, got {profile_name!r}.")

    groups, pixel_layers, nonempty = count_tree(psd)
    require(groups >= 100 and pixel_layers >= 80 and nonempty >= 40, f"Layer structure is too small: {groups} groups, {pixel_layers} pixel layers, {nonempty} nonempty pixel layers.")

    required_paths = [
        ("01_backHair", "variant-loose-01", "hair-shape"),
        ("01_backHair", "variant-bun-01", "bun"),
        ("02_robe", "variant-sage-cross-01", "cross-collar-overlay"),
        ("02_robe", "variant-paper-scholar-01", "scholar-collar-overlay"),
        ("04_face", "variant-oval-01", "face-base-skin"),
        ("04_face", "variant-round-01", "face-base-skin"),
        ("06_eyes", "variant-calm-01", "left-eye", "eye-white"),
        ("06_eyes", "variant-calm-01", "right-eye", "eye-white"),
        ("06_eyes", "variant-calm-01", "left-eye", "iris"),
        ("06_eyes", "variant-calm-01", "left-eye", "pupil"),
        ("07_brows", "variant-level-01", "left-brow"),
        ("07_brows", "variant-level-01", "right-brow"),
        ("09_mouth", "variant-neutral-01"),
        ("09_mouth", "variant-smile-01"),
        ("11_skinMarks", "age"), ("11_skinMarks", "injury"), ("11_skinMarks", "scar"),
        ("11_skinMarks", "ghost"), ("11_skinMarks", "corruption"),
        ("12_frontHair", "variant-part-01"), ("12_frontHair", "variant-sweep-01"),
        ("14_effects", "behind-backHair"), ("14_effects", "front"),
    ]
    for route in required_paths:
        get_path(psd, route)
    for route in (
        ("13_ornament", "busuanzi-talisman-sealed-01", "li-trigram-top-yang"),
        ("13_ornament", "busuanzi-talisman-wind-01", "folded-corner"),
        ("14_effects", "front", "wind-gust-soft-01"),
    ):
        get_path(psd, route)
    require(get_path(psd, ("06_eyes", "variant-calm-01")).visible, "Default calm eye group must be visible.")
    require(not get_path(psd, ("06_eyes", "variant-round-01")).visible, "Alternate round eye group must start hidden.")
    require(not get_path(psd, ("12_frontHair", "variant-sweep-01")).visible, "Alternate front hair must start hidden.")
    for category in ("age", "injury", "scar", "ghost", "corruption"):
        require(not get_path(psd, ("11_skinMarks", category)).visible, f"State category {category} must start hidden.")

    anchors = json.loads(ANCHORS.read_text(encoding="utf-8"))
    coord = anchors["coordinateSystem"]
    require(coord["viewBox"] == "0 0 100 100" and coord["masterPixelsPerLogicalUnit"] == 10.24 and coord["exportPixelsPerLogicalUnit"] == 5.12, "Anchor profile conversion does not match the G2-P canvas contract.")
    require(coord["masterSize"] == 1024 and coord["exportSize"] == 512 and coord["cropTransparentEdges"] is False, "Anchor export geometry is invalid.")

    manifest = json.loads(Path(args.manifest).read_text(encoding="utf-8"))
    require(manifest.get("schemaVersion") == 1 and isinstance(manifest.get("slots"), dict), "Invalid Manifest v1 example.")
    mapped = 0
    for slot, entries in manifest["slots"].items():
        require(slot in SLOT_ORDER and isinstance(entries, dict), f"Unknown or malformed slot {slot}.")
        for variant, relpath in entries.items():
            require(isinstance(relpath, str) and relpath.startswith("examples/master-demo/"), f"Unsafe or non-example manifest path: {relpath!r}.")
            target = (PACK / relpath).resolve()
            require(target.is_relative_to(PACK.resolve()), f"Manifest path escapes the portrait pack: {relpath}.")
            require(target.is_file(), f"Manifest entry {slot}.{variant} has no file: {relpath}.")
            with Image.open(target) as image:
                require(image.format == "PNG" and image.size == (512, 512) and "A" in image.getbands(), f"Invalid transparent 512x512 PNG: {relpath}.")
            mapped += 1
    require(mapped >= 25, f"Expected the starter asset variants and state overlays, found {mapped}.")

    eyes = PACK / manifest["slots"]["eyes"]["calm-01"]
    bbox = alpha_bbox(eyes)
    require(bbox is not None and 165 <= bbox[0] <= 190 and 325 <= bbox[2] <= 350 and 225 <= bbox[1] <= 245 and 270 <= bbox[3] <= 290, f"Eye PNG is cropped or not on the shared face coordinate: bbox={bbox}.")
    brows = PACK / manifest["slots"]["brows"]["level-01"]
    bbox_brows = alpha_bbox(brows)
    require(bbox_brows is not None and 165 <= bbox_brows[0] <= 190 and 325 <= bbox_brows[2] <= 350 and 195 <= bbox_brows[1] <= 220 and 225 <= bbox_brows[3] <= 245, f"Brow PNG is cropped or not aligned with eyes: bbox={bbox_brows}.")

    preview_path = Path(args.preview).resolve()
    require(preview_path.is_file(), f"Missing preview image: {preview_path}")
    with Image.open(preview_path) as im:
        preview = im.convert("RGBA")
        require(im.format == "PNG" and preview.size == (1024, 1024), "Master preview must be 1024x1024 PNG.")
    composite = psd.composite()
    require(composite is not None and composite.size == (1024, 1024), "PSD does not contain a full composite preview.")
    max_preview_delta, mean_preview_delta = compare_images(composite.convert("RGBA"), preview)
    require(mean_preview_delta <= 1.0 and max_preview_delta <= 8, f"PSD composite and preview differ: mean={mean_preview_delta:.3f}, max={max_preview_delta}.")

    # G4: compare the independently parsed PSD composite with the same selected
    # slot PNGs flattened in runtime SLOT_ORDER at their 512px delivery size.
    default_composed = compose(manifest, DEFAULT_IDS)
    psd_512 = composite.convert("RGBA").resize((512, 512), Image.Resampling.LANCZOS)
    max_delta, mean_delta = compare_images(psd_512, default_composed)
    require(mean_delta <= 4.0 and max_delta <= 45, f"PSD-vs-exported-slot composite diverged: mean={mean_delta:.3f}, max={max_delta}.")
    write_composite_comparison(preview, default_composed)
    check_busuanzi_previews()

    photoshop_report = ""
    if args.photoshop_render:
        photoshop_path = Path(args.photoshop_render).resolve()
        require(photoshop_path.is_file(), f"Photoshop render not found: {photoshop_path}")
        with Image.open(photoshop_path) as im:
            photoshop = im.convert("RGBA")
            require(im.format == "PNG" and photoshop.size == (1024, 1024), "Photoshop output must be a 1024x1024 PNG.")
        ps_max, ps_mean = compare_images(photoshop, preview)
        require(ps_mean <= 2.0 and ps_max <= 32, f"Photoshop-rendered composite differs from the master preview: mean={ps_mean:.3f}, max={ps_max}.")
        photoshop_report = f"; Photoshop open/save/reopen mean/max delta={ps_mean:.3f}/{ps_max}"

    write_size_previews(preview)
    scenarios = write_stress_matrix(manifest)
    print(f"PASS PSD: 8BPS v1, {width}x{height}, RGB/8, {channels} composite channels; embedded {profile_name.strip()} profile.")
    print(f"PASS layers: {len(roots)} ordered runtime groups, {groups} total groups, {pixel_layers} raster layers ({nonempty} with independent pixels).")
    print(f"PASS geometry: full-canvas 512x512 alpha exports, eye bbox={alpha_bbox(eyes)}, brow bbox={bbox_brows}.")
    print(f"PASS composite: preview mean/max delta={mean_preview_delta:.3f}/{max_preview_delta}; PSD/export mean/max delta={mean_delta:.3f}/{max_delta}{photoshop_report}.")
    print(f"PASS manifest: {mapped} verified mappings; rendered {len(scenarios)} stress combinations and 256/128/64/48 px size previews.")
    print(f"PASS discussion variant: sealed/wind talisman concept layers and preview pair; no unsupported IDs added to the runtime Manifest v1.")
    print(f"QA previews: {QA_ROOT.relative_to(ROOT)} (including master/engine/difference comparison)")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"FAIL: {error}", file=sys.stderr)
        sys.exit(1)
