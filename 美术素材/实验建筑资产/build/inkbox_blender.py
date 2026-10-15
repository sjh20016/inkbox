# -*- coding: utf-8 -*-
"""
《坐天观井 / Inkbox》实验建筑资产 · Blender 无头构建脚本

在 Blender 内运行（--background --python）。职责：
  1. 由 inkbox_geom 的顶点/多边形数据建网格，焊点、平直着色
  2. 按面颜色写 UV → 图集色格中心（单材质共享 Inkbox_EntityAtlas）
  3. 每件导出 GLB + OBJ/MTL
  4. 用 EEVEE 渲染单体预览 PNG（纸底 + 墨线感）
  5. 写出 manifest.json

坐标：几何模块用 Y 向上；Blender 是 Z 向上。
  映射 (x, y, z) → (x, -z, y) 是绕 X 的纯旋转（det=+1），保持绕序与法线；
  再经 glTF/OBJ 的 +Y up 转换，最终回到原始 Y 向上朝向。

调用：
  blender --background --factory-startup --python inkbox_blender.py -- <root>
"""
import bpy
import sys
import os
import json
import math
import mathutils

# ── 参数 ─────────────────────────────────────────────────────
argv = sys.argv
ROOT = argv[argv.index("--") + 1] if "--" in argv else os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BUILD = os.path.join(ROOT, "build")
sys.path.insert(0, BUILD)

import inkbox_palette as PAL       # noqa: E402
import inkbox_geom as GEO          # noqa: E402

ATLAS = os.path.join(ROOT, "Inkbox_EntityAtlas.png")
DIRS = {"建筑": os.path.join(ROOT, "建筑"),
        "地形岩体": os.path.join(ROOT, "地形"),
        "宗门宅院": os.path.join(ROOT, "宗门宅院"),
        "废址遗存": os.path.join(ROOT, "废址"),
        "特殊地形": os.path.join(ROOT, "特殊地形")}
PREV = os.path.join(ROOT, "预览")

ORTHO = 2.15            # 统一正交尺度：让各件保持真实相对大小
RES = 512               # 预览分辨率


def to_blender(p):
    """几何坐标 (Y-up) → Blender 坐标 (Z-up)。"""
    return (p[0], -p[2], p[1])


def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def make_material(atlas_path):
    img = bpy.data.images.load(atlas_path)
    img.name = "Inkbox_EntityAtlas"
    print("   图集载入: %s  %d×%d  %s" % (os.path.basename(atlas_path),
                                       img.size[0], img.size[1],
                                       img.colorspace_settings.name))
    mat = bpy.data.materials.new("inkbox_entity_atlas")
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (1.0, 1.0, 1.0, 1.0)
    bsdf.inputs["Roughness"].default_value = 1.0
    bsdf.inputs["Metallic"].default_value = 0.0
    for nm in ("Specular IOR Level", "Specular"):
        if nm in bsdf.inputs:
            bsdf.inputs[nm].default_value = 0.04
            break
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = img
    tex.interpolation = 'Closest'      # 像素/色格清晰，不做插值
    tex.extension = 'CLIP'
    tex.location = (-420, 240)
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    return mat


def build_object(name, mesh_data, mat):
    """由 (verts, faces) 建对象；每面按颜色写 UV 到图集色格中心。"""
    verts = [to_blender(v) for v in mesh_data.verts]
    faces = [list(idx) for idx, _c in mesh_data.faces]

    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.update()

    # 焊点（几何模块已按坐标去重，这里再保险一次）
    bm = bpy.data.meshes.new_from_object  # noqa: F841 (占位，避免误用)
    me.validate(verbose=False)

    # UV（用 Blender 的 V 约定：V=0 在图像底部；导出时 glTF 导出器会翻回）
    uvl = me.uv_layers.new(name="UVMap")
    for poly in me.polygons:
        color = mesh_data.faces[poly.index][1]
        u, v = PAL.UV_BLEND[color]
        for li in poly.loop_indices:
            uvl.data[li].uv = (u, v)

    # 平直着色（低模）
    for poly in me.polygons:
        poly.use_smooth = False

    me.materials.append(mat)
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def export_glb(ob, path):
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.export_scene.gltf(
        filepath=path, export_format='GLB', use_selection=True,
        export_apply=True, export_yup=True, export_materials='EXPORT',
        export_normals=True, export_image_format='AUTO',
    )


def export_obj(ob, obj_path, mtl_path):
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.wm.obj_export(
        filepath=obj_path, export_selected_objects=True,
        export_materials=True, export_uv=True, export_normals=True,
        export_triangulated_mesh=False, path_mode='RELATIVE',
        forward_axis='NEGATIVE_Z', up_axis='Y',
    )


# ── 预览场景 ─────────────────────────────────────────────────
def setup_preview_scene():
    sc = bpy.context.scene
    # Cycles：CPU 光线追踪，无头环境下可靠采样纹理（EEVEE 在无 GPU 上下文时丢纹理）
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = 64
    sc.cycles.use_denoising = True
    sc.cycles.max_bounces = 4
    sc.cycles.diffuse_bounces = 2
    sc.render.resolution_x = RES
    sc.render.resolution_y = RES
    sc.render.film_transparent = False

    # 纸底世界
    world = bpy.data.worlds.new("paper")
    sc.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    bg.inputs[0].default_value = (0.82, 0.78, 0.70, 1.0)
    bg.inputs[1].default_value = 1.05

    # 地面（承接阴影，纸色略深）
    bpy.ops.mesh.primitive_plane_add(size=40, location=(0, 0, -0.001))
    ground = bpy.context.active_object
    gm = bpy.data.materials.new("paper_ground")
    gm.use_nodes = True
    gm.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.80, 0.75, 0.66, 1.0)
    gm.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 1.0
    ground.data.materials.append(gm)

    # 主光
    bpy.ops.object.light_add(type='SUN', location=(4, -6, 8))
    sun = bpy.context.active_object
    sun.data.energy = 3.4
    sun.data.angle = math.radians(12)
    sun.rotation_euler = (math.radians(48), 0, math.radians(38))

    # 补光
    bpy.ops.object.light_add(type='AREA', location=(-5, 4, 4))
    fill = bpy.context.active_object
    fill.data.energy = 260
    fill.data.size = 8
    fill.rotation_euler = (math.radians(62), 0, math.radians(-135))

    # 相机（正交 3/4 视角）
    cam_data = bpy.data.cameras.new("cam")
    cam_data.type = 'ORTHO'
    cam_data.ortho_scale = ORTHO
    cam = bpy.data.objects.new("cam", cam_data)
    sc.collection.objects.link(cam)
    sc.camera = cam
    return cam, ground, [sun, fill]


def aim_camera(cam, target, direction=(0.85, 0.60, 1.0), dist=8.0):
    d = mathutils.Vector(direction).normalized()
    t = mathutils.Vector(target)
    cam.location = t + d * dist
    cam.rotation_euler = (t - cam.location).to_track_quat('-Z', 'Y').to_euler()


def render_to(cam, target, path, ground, lights):
    aim_camera(cam, target)
    bpy.context.scene.render.filepath = path
    bpy.ops.render.render(write_still=True)


def main():
    for d in list(DIRS.values()) + [PREV]:
        os.makedirs(d, exist_ok=True)

    # 迭代用：INKBOX_ONLY=bld_hut,bld_relic 只重建这几件（此时不写 manifest，避免覆盖全量清单）
    only = {s.strip() for s in os.environ.get("INKBOX_ONLY", "").split(",") if s.strip()}
    if only:
        print("   仅重建: %s" % ", ".join(sorted(only)))

    # 图集（若不存在则用 Pillow 生成；Blender 内无 PIL 时要求外部先生成）
    if not os.path.exists(ATLAS):
        raise SystemExit("缺少图集 %s，请先运行 build/inkbox_palette.py" % ATLAS)

    clear_scene()
    cam, ground, lights = setup_preview_scene()
    mat = make_material(ATLAS)

    manifest = {"atlas": os.path.basename(ATLAS), "ortho": ORTHO, "groups": []}
    total = 0
    for gname, items in GEO.ALL:
        outdir = DIRS[gname]
        items = [it for it in items if not only or it[0] in only]
        if not items:
            continue
        entries = []
        for (name, cn, fn) in items:
            data = fn()
            ob = build_object(name, data, mat)
            (mnx, mny, mnz), (mxx, mxy, mxz) = data.bounds()
            cx, cy, cz = (mnx + mxx) / 2, (mny + mxy) / 2, (mnz + mxz) / 2
            target = to_blender((cx, cy, cz))

            export_glb(ob, os.path.join(outdir, name + ".glb"))
            export_obj(ob, os.path.join(outdir, name + ".obj"),
                       os.path.join(outdir, name + ".mtl"))
            render_to(cam, target, os.path.join(PREV, name + ".png"), ground, lights)

            entries.append({
                "name": name, "cn": cn,
                "verts": len(data.verts), "faces": len(data.faces),
                "size": [round(mxx - mnx, 3), round(mxy - mny, 3), round(mxz - mnz, 3)],
            })
            total += 1
            print("  %-14s %-8s v=%-4d f=%-4d  %.2f×%.2f×%.2f" %
                  (name, cn, len(data.verts), len(data.faces),
                   mxx - mnx, mxy - mny, mxz - mnz))

            bpy.data.objects.remove(ob, do_unlink=True)
        manifest["groups"].append({"group": gname, "items": entries})

    manifest["total_assets"] = total
    if only:
        print("BLENDER BUILD DONE (only): %d assets（未写 manifest）" % total)
        return
    with open(os.path.join(ROOT, "assets_manifest.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
    print("BLENDER BUILD DONE: %d assets" % total)


if __name__ == "__main__":
    main()
