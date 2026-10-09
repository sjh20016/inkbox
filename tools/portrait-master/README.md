# G2-P Portrait Master Tools

The tool package is build-time artwork tooling. Game runtime code continues to load transparent PNGs through the existing Manifest v1 registry; it never reads PSD files.

## Install and run

From the repository root:

```bash
npm install --prefix tools/portrait-master
node tools/portrait-master/generate-master.mjs
node tools/portrait-master/export.mjs
py -3 -m pip install -r tools/portrait-master/requirements.txt
py -3 tools/portrait-master/check-master.py
```

`generate-master.mjs` creates the starter PSD and previews. It refuses to replace an existing source file unless `--force` is supplied. The default face is neutral; hidden PSD-only `busuanzi-talisman-sealed-01`, `busuanzi-talisman-wind-01`, and `wind-gust-soft-01` layers create a small occlusion/state proof based on the design discussion. Those story variants deliberately stay out of Manifest v1 because the current ornament IDs also feed the hereditary style roll. The tool embeds an installed system sRGB profile; if the system profile is stored elsewhere, pass `--icc path/to/sRGB.icc`.

After hand editing and saving the PSD, run `export.mjs` to refresh the isolated starter package and `manifest.example.json`. The export map is `export-map.v1.json`. Every source entry points to an exact PSD group or pixel layer; the exporter reads the PSD tree, composes only that selected source, validates the slot and stable ID against the G2-P schema, preserves the common origin, and emits a 512×512 RGBA PNG. It never writes outside the portrait pack's `examples/` subdirectory by default.

To publish reviewed artwork into the active pack, change the map to include only the approved slots and run, for example:

```bash
node tools/portrait-master/export.mjs --publish --include eyes.calm-01
```

Publish mode merges into `manifest.json`, preserves unrelated existing entries, refuses to remap a published ID, and refuses to replace an existing file. To intentionally revise artwork already mapped to the same ID and path, add `--replace-existing` after reviewing the historical appearance impact. `--help` lists the exporter flags.

`check-master.py` uses `psd-tools`, an independent PSD reader. It checks the 8BPS header, RGB/8 geometry, embedded sRGB profile, layer/group structure, slot order, exported manifest paths, image sizes/alpha, eye and brow canvas positions, and agreement between the PSD composite and the layer-export composite. It writes the 256/128/64/48-pixel previews, state/variant matrix, and a three-panel master/runtime/difference comparison under `research/g2-portrait-preview/`.

On Windows with Photoshop installed, verify native compatibility and compare Photoshop's reopened render against the preview:

```powershell
powershell -ExecutionPolicy Bypass -File tools/portrait-master/photoshop-roundtrip.ps1 `
  -Master assets/portraits/source/inkbox_face_master_v1.psd `
  -Roundtrip .tmp/photoshop-master-roundtrip.psd `
  -RenderPath .tmp/photoshop-master-roundtrip.png
py -3 tools/portrait-master/check-master.py --photoshop-render .tmp/photoshop-master-roundtrip.png
```

The PSD layer records use runtime bottom-to-top ordering. The Photoshop check is important because PSD writers/readers can disagree about record order; passing only a file-header or independent-reader check does not establish the visible Photoshop composite.

The generated states are editable PSD test layers and example v1 PNG overlays. They do not add state simulation logic or local compositing capabilities to the game.
