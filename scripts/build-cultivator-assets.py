"""Build the original low-poly cultivator character library in Blender.

The gray gate intentionally produces only the shared base character.  Later
production phases must be added after the silhouette and rig gate is accepted.
Run: blender -b --python scripts/build-cultivator-assets.py -- --phase gray
"""

import argparse
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[1] / "assets" / "characters" / "cultivator"
SOURCE = ROOT / "source"
DATA = ROOT / "data"
PREVIEW = ROOT / "preview"
MESH = ROOT / "mesh"
MATERIALS = ROOT / "materials"


class MeshBuilder:
    def __init__(self):
        self.verts = []
        self.faces = []
        self.weights = []
        self.parts = {}
        self.face_parts = []

    def vertex(self, point, bone):
        index = len(self.verts)
        self.verts.append(tuple(point))
        self.weights.append(bone)
        return index

    def face(self, indices, part):
        # Explicit triangles keep the gate measurement identical to the export.
        if len(indices) == 3:
            self.faces.append(tuple(indices))
            self.face_parts.append(part)
            self.parts[part] = self.parts.get(part, 0) + 1
        else:
            for i in range(1, len(indices) - 1):
                self.face((indices[0], indices[i], indices[i + 1]), part)

    def rings(self, contours, bones, part, cap_start=True, cap_end=True):
        n = len(contours[0])
        rows = [[self.vertex(p, bone) for p in ring] for ring, bone in zip(contours, bones)]
        for lo, hi in zip(rows, rows[1:]):
            for i in range(n):
                j = (i + 1) % n
                self.face((lo[i], lo[j], hi[j], hi[i]), part)
        if cap_start:
            self.face(tuple(reversed(rows[0])), part)
        if cap_end:
            self.face(tuple(rows[-1]), part)

    def box(self, center, half, bone, part):
        x, y, z = center
        a, b, c = half
        points = [(x+sx*a, y+sy*b, z+sz*c) for sz in (-1, 1)
                  for sy in (-1, 1) for sx in (-1, 1)]
        ids = [self.vertex(p, bone) for p in points]
        for quad in ((0,2,3,1), (4,5,7,6), (0,1,5,4),
                     (2,6,7,3), (0,4,6,2), (1,3,7,5)):
            self.face(tuple(ids[i] for i in quad), part)

    def wedge(self, points, bone, part):
        # A simple solid three-point fringe or folded cloth corner.
        ids = [self.vertex(p, bone) for p in points]
        for tri in ((0,1,2), (3,5,4), (0,3,4), (0,4,1),
                    (1,4,5), (1,5,2), (2,5,3), (2,3,0)):
            self.face(tuple(ids[i] for i in tri), part)

    def ribbon(self, front, depth, bone, part):
        ids = [self.vertex(p, bone) for p in front]
        ids += [self.vertex((p[0],p[1]+depth,p[2]),bone) for p in front]
        for quad in ((0,1,2,3),(7,6,5,4),(0,4,5,1),
                     (1,5,6,2),(2,6,7,3),(3,7,4,0)):
            self.face(tuple(ids[i] for i in quad),part)

    def flat_quad(self, points, bone, part):
        ids=[self.vertex(p,bone) for p in points]
        self.face(tuple(ids),part)


def ellipse_ring(z, rx, ry, cy=0.0, count=8, offset=0.0):
    return [(rx*math.cos(offset+2*math.pi*i/count),
             cy+ry*math.sin(offset+2*math.pi*i/count), z) for i in range(count)]


def section(a, b, ra, rb, bone_a, bone_b, part, builder, sides=6):
    a, b = Vector(a), Vector(b)
    axis = (b-a).normalized()
    side = axis.cross(Vector((0, 1, 0))).normalized()
    if side.length < 0.1:
        side = Vector((1, 0, 0))
    other = axis.cross(side).normalized()
    def ring(center, radius):
        return [center + radius*(math.cos(2*math.pi*i/sides)*side +
                                 math.sin(2*math.pi*i/sides)*other)
                for i in range(sides)]
    builder.rings((ring(a,ra), ring(b,rb)), (bone_a,bone_b), part)


def make_base_geometry(builder):
    # The face is toward Blender -Y. Feet touch Z=0, the armature root is at 0.
    # An octagonal robe gives a short, broad hem without nested skirts.
    builder.rings((ellipse_ring(.28,.38,.28,.025),
                   ellipse_ring(.72,.34,.25,.005),
                   ellipse_ring(1.35,.29,.22,.02)),
                  ("pelvis","spine","spine"), "short_robe")
    builder.rings((ellipse_ring(.82,.365,.265,.005),
                   ellipse_ring(.89,.365,.265,.005)),
                  ("spine","spine"), "belt")
    # Two broad diagonal strips give the short robe a readable crossed collar.
    builder.ribbon(((-.24,-.225,1.35),(-.15,-.270,1.36),
                    (.19,-.290,.99),(.075,-.285,.965)),
                   .025,"spine","cross_collar_left")
    builder.ribbon(((.24,-.225,1.35),(.15,-.285,1.36),
                    (-.19,-.305,.99),(-.075,-.295,.965)),
                   .025,"spine","cross_collar_right")

    # Oversize head: 0.94 high versus 2.24 total = 2.38 heads.
    head_center = Vector((0,-.025,1.665))
    rings = []
    for z, radius in ((1.205,.48),(1.36,.88),
                      (1.66,1.0),(1.94,.82),(2.125,.36)):
        rings.append([(head_center.x+.465*radius*math.cos(2*math.pi*i/10),
                       head_center.y+.405*radius*math.sin(2*math.pi*i/10),z)
                      for i in range(10)])
    builder.rings(rings, ("head",)*len(rings), "large_head")
    # Hair is a compact cap, a single side lock and a squared topknot.
    hair_hem=ellipse_ring(1.92,.485,.425,-.025,8)
    hair_hem=[(x,y,z) for (x,y,_),z in zip(
        hair_hem,(1.55,1.35,1.30,1.35,1.55,1.83,1.96,1.83))]
    builder.rings((hair_hem,
                   ellipse_ring(2.15,.25,.24,-.025,8)),
                  ("head",)*2, "hair_cap", cap_start=False)
    builder.wedge(((-.37,-.23,1.95),(-.20,-.40,1.94),(-.19,-.41,1.72),
                   (-.36,-.24,1.95),(-.20,-.38,1.93),(-.18,-.40,1.71)),
                  "head", "hair_fringe_left")
    builder.wedge(((.36,-.24,1.95),(.19,-.40,1.94),(.17,-.42,1.75),
                   (.35,-.23,1.95),(.19,-.38,1.93),(.17,-.40,1.74)),
                  "head", "hair_fringe_right")
    builder.box((0,.005,2.205),(.12,.105,.075),"head","topknot")
    # Eyes alone; all other facial detail is intentionally omitted.
    for x in (-.145,.145):
        builder.box((x,-.429,1.66),(.025,.008,.059),"head","eyes")

    for sign, label in ((-1,"l"),(1,"r")):
        shoulder=(sign*.285,.0,1.285)
        elbow=(sign*.455,-.015,1.045)
        wrist=(sign*.565,-.045,.815)
        section(shoulder,elbow,.19,.205,f"{label}_upperarm",
                f"{label}_lowerarm",f"{label}_upper_sleeve",builder)
        section(elbow,wrist,.205,.17,f"{label}_lowerarm",
                f"{label}_lowerarm",f"{label}_wide_cuff",builder)
        builder.box((sign*.595,-.047,.745),(.09,.095,.085),
                    f"{label}_hand",f"{label}_block_hand")
        section((sign*.16,.0,.45),(sign*.17,0,.17),.13,.115,
                f"{label}_upperleg",f"{label}_lowerleg",f"{label}_short_leg",builder)
        builder.box((sign*.17,-.07,.085),(.135,.185,.085),
                    f"{label}_foot",f"{label}_block_shoe")


BONES = (
    ("root", None, (0,0,0), (0,0,.16)),
    ("pelvis", "root", (0,0,.16), (0,0,.83)),
    ("spine", "pelvis", (0,0,.83), (0,0,1.33)),
    ("head", "spine", (0,0,1.33), (0,0,1.90)),
    ("l_upperarm", "spine", (-.24,0,1.31), (-.455,-.015,1.045)),
    ("l_lowerarm", "l_upperarm", (-.455,-.015,1.045), (-.565,-.045,.815)),
    ("l_hand", "l_lowerarm", (-.565,-.045,.815), (-.60,-.05,.70)),
    ("r_upperarm", "spine", (.24,0,1.31), (.455,-.015,1.045)),
    ("r_lowerarm", "r_upperarm", (.455,-.015,1.045), (.565,-.045,.815)),
    ("r_hand", "r_lowerarm", (.565,-.045,.815), (.60,-.05,.70)),
    ("l_upperleg", "pelvis", (-.15,0,.43), (-.17,0,.25)),
    ("l_lowerleg", "l_upperleg", (-.17,0,.25), (-.17,0,.105)),
    ("l_foot", "l_lowerleg", (-.17,0,.105), (-.17,-.12,.055)),
    ("r_upperleg", "pelvis", (.15,0,.43), (.17,0,.25)),
    ("r_lowerleg", "r_upperleg", (.17,0,.25), (.17,0,.105)),
    ("r_foot", "r_lowerleg", (.17,0,.105), (.17,-.12,.055)),
)


def collection(name):
    coll = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(coll)
    return coll


def make_rig(coll):
    armature=bpy.data.armatures.new("cultivator_16_bones")
    rig=bpy.data.objects.new("cultivator_rig",armature)
    coll.objects.link(rig)
    bpy.context.view_layer.objects.active=rig
    rig.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    for name,parent,head,tail in BONES:
        bone=armature.edit_bones.new(name)
        bone.head=head
        bone.tail=tail
        if parent:
            bone.parent=armature.edit_bones[parent]
            bone.use_connect=False
    bpy.ops.object.mode_set(mode="OBJECT")
    rig.select_set(False)
    rig.show_in_front=True
    return rig


def make_mesh(builder,coll,rig,name="cultivator_base",include_parts=None,material=None,
              palette_slots=None):
    selected=[i for i,part in enumerate(builder.face_parts)
              if include_parts is None or part in include_parts]
    used=sorted({vertex for i in selected for vertex in builder.faces[i]})
    remap={old:i for i,old in enumerate(used)}
    mesh=bpy.data.meshes.new(name+"_mesh")
    mesh.from_pydata([builder.verts[i] for i in used],[],
                     [tuple(remap[v] for v in builder.faces[i]) for i in selected])
    mesh.update()
    obj=bpy.data.objects.new(name,mesh)
    coll.objects.link(obj)
    for name,_,_,_ in BONES:
        obj.vertex_groups.new(name=name)
    for index,old in enumerate(used):
        obj.vertex_groups[builder.weights[old]].add([index],1.0,"REPLACE")
    modifier=obj.modifiers.new("armature_skin","ARMATURE")
    modifier.object=rig
    obj.parent=rig
    mat=material or bpy.data.materials.new("gray_gate_clay")
    if material is None:
        mat.diffuse_color=(.56,.58,.61,1)
    obj.data.materials.append(mat)
    for poly in mesh.polygons:
        poly.use_smooth=False
    if palette_slots is not None:
        uv=mesh.uv_layers.new(name="palette_uv")
        for polygon,face_index in zip(mesh.polygons,selected):
            part=builder.face_parts[face_index]
            slot=palette_slots[part]
            for loop_id in polygon.loop_indices:
                uv.data[loop_id].uv=((slot+.5)/12,.5)
    return obj


SOCKETS=(
    ("socket_hair","head",(0,0,2.12)),
    ("socket_back","spine",(0,.27,1.17)),
    ("socket_waist","pelvis",(.28,0,.83)),
    ("socket_weapon","r_hand",(.62,-.05,.72)),
)


def make_sockets(coll,rig):
    result={}
    for name,bone,world_point in SOCKETS:
        empty=bpy.data.objects.new(name,None)
        coll.objects.link(empty)
        empty.empty_display_type="PLAIN_AXES"
        empty.empty_display_size=.08
        empty.parent=rig
        empty.parent_type="BONE"
        empty.parent_bone=bone
        bpy.context.view_layer.update()
        empty.matrix_world.translation=Vector(world_point)
        result[name]={"parent_bone":bone,"rest_world_position":list(world_point)}
    return result


def make_camera(coll,name,position,target,scale):
    camera=bpy.data.cameras.new(name)
    camera.type="ORTHO"
    camera.ortho_scale=scale
    obj=bpy.data.objects.new(name,camera)
    coll.objects.link(obj)
    obj.location=position
    obj.rotation_euler=(Vector(target)-obj.location).to_track_quat("-Z","Y").to_euler()
    return obj


def render_gray(base,coll,path,turnaround=False):
    scene=bpy.context.scene
    scene.render.engine="BLENDER_WORKBENCH"
    scene.display.shading.light="STUDIO"
    scene.display.shading.color_type="MATERIAL"
    scene.display.shading.show_cavity=True
    scene.display.shading.cavity_type="BOTH"
    scene.display.shading.curvature_ridge_factor=1.2
    scene.display.shading.curvature_valley_factor=1.2
    scene.render.film_transparent=False
    scene.world.color=(.08,.08,.08)
    scene.render.image_settings.file_format="PNG"
    scene.render.resolution_percentage=100
    scene.render.resolution_y=768
    scene.render.resolution_x=1536 if turnaround else 768
    camera=make_camera(coll,"gray_preview_camera",(0,-8,1.17),
                       (0,0,1.17),3.03 if turnaround else 2.70)
    scene.camera=camera
    temporary=[]
    if turnaround:
        base.hide_render=True
        for x,angle,name in ((-1.15,0,"front"),(0,math.pi/2,"side"),
                             (1.15,math.pi,"back")):
            obj=bpy.data.objects.new("preview_"+name,base.data)
            coll.objects.link(obj)
            obj.location.x=x
            obj.rotation_euler.z=angle
            temporary.append(obj)
        # Blender's ortho scale is horizontal; 2:1 output halves its height.
        camera.data.ortho_scale=5.7
    scene.render.filepath=str(path)
    bpy.ops.render.render(write_still=True)
    for obj in temporary:
        bpy.data.objects.remove(obj,do_unlink=True)
    bpy.data.objects.remove(camera,do_unlink=True)
    base.hide_render=False


def gray():
    for path in (SOURCE,DATA,PREVIEW):
        path.mkdir(parents=True,exist_ok=True)
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for old in list(bpy.data.collections):
        if old.name != bpy.context.scene.collection.name:
            bpy.data.collections.remove(old)
    coll=collection("BASE_SHARED_GRAY")
    builder=MeshBuilder()
    make_base_geometry(builder)
    rig=make_rig(coll)
    base=make_mesh(builder,coll,rig)
    sockets=make_sockets(coll,rig)
    bpy.context.view_layer.update()
    tris=sum(len(p.vertices)-2 for p in base.data.polygons)
    bounds=[tuple(v.co) for v in base.data.vertices]
    min_z=min(v[2] for v in bounds)
    max_z=max(v[2] for v in bounds)
    head_height=2.125-1.205
    report={
        "phase":"gray",
        "original_asset":True,
        "base_object":base.name,
        "triangles":tris,
        "triangle_budget":[250,450],
        "budget_pass":250<=tris<=450,
        "parts_triangles":builder.parts,
        "bone_count":len(BONES),
        "bones":[row[0] for row in BONES],
        "feet_root_z":0.0,
        "mesh_min_z":min_z,
        "mesh_max_z":max_z,
        "head_height":head_height,
        "head_body_ratio":max_z/head_height,
        "head_body_ratio_excluding_topknot":2.125/head_height,
        "facing_blender":"-Y",
        "sockets":sockets,
        "files":{"blend":"source/cultivator_gray_gate.blend",
                 "blockout":"preview/cultivator_gray_blockout.png",
                 "turnaround":"preview/cultivator_gray_turnaround.png"},
    }
    if not report["budget_pass"]:
        raise RuntimeError(f"Gray base has {tris} triangles, outside 250..450")
    render_gray(base,coll,PREVIEW/"cultivator_gray_blockout.png")
    render_gray(base,coll,PREVIEW/"cultivator_gray_turnaround.png",True)
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/"cultivator_gray_gate.blend"))
    (DATA/"cultivator_gray_stats.json").write_text(
        json.dumps(report,ensure_ascii=False,indent=2),encoding="utf-8")
    print("GRAY_GATE_REPORT="+json.dumps(report,ensure_ascii=False))


PALETTE=(
    ("skin", "#F4C9AC"), ("paper_white", "#ECE6DE"),
    ("warm_beige", "#D4BEA8"), ("ink_black", "#302D32"),
    ("blue_gray", "#8597B0"), ("sect_blue", "#355B91"),
    ("earth_brown", "#806A5D"), ("dark_red", "#8D3A3A"),
    ("ghost_cyan", "#36676A"), ("medicine_yellow", "#E8B454"),
    ("gray_purple", "#A6A0AB"), ("muted_green", "#6E7B56"),
)
HAIR_PARTS={"hair_cap","hair_fringe_left","hair_fringe_right","topknot"}


def part_palette(part):
    if part=="short_robe" or part.endswith("upper_sleeve"):
        return 5
    if part=="large_head" or part.endswith("block_hand"):
        return 0
    if part=="eyes" or part.endswith("block_shoe") or part in HAIR_PARTS:
        return 3
    if part=="belt" or part.startswith("cross_collar"):
        return 4
    if part.endswith("wide_cuff"):
        return 4
    if part.endswith("short_leg"):
        return 6
    return 1


def build_palette():
    image=bpy.data.images.new("cultivator_palette_12",width=12,height=1,alpha=True)
    pixels=[]
    for _,hex_color in PALETTE:
        rgb=[int(hex_color[i:i+2],16)/255 for i in (1,3,5)]
        pixels.extend((*rgb,1.0))
    image.pixels[:]=pixels
    image.filepath_raw=str(MATERIALS/"cultivator_palette_12.png")
    image.file_format="PNG"
    image.save()
    image.pack()
    mat=bpy.data.materials.new("cultivator_flat_palette")
    mat.use_nodes=True
    mat.node_tree.nodes.clear()
    bsdf=mat.node_tree.nodes.new("ShaderNodeBsdfPrincipled")
    output=mat.node_tree.nodes.new("ShaderNodeOutputMaterial")
    mat.node_tree.links.new(bsdf.outputs["BSDF"],output.inputs["Surface"])
    bsdf.inputs["Roughness"].default_value=1.0
    bsdf.inputs["Metallic"].default_value=0.0
    tex=mat.node_tree.nodes.new("ShaderNodeTexImage")
    tex.image=image
    tex.interpolation="Closest"
    mat.node_tree.links.new(tex.outputs["Color"],bsdf.inputs["Base Color"])
    return mat


def create_action(rig,name,frames):
    action=bpy.data.actions.new(name)
    rig.animation_data_create()
    rig.animation_data.action=action
    for frame,channels in frames:
        for bone_name,rotation,translation in channels:
            bone=rig.pose.bones[bone_name]
            bone.rotation_mode="XYZ"
            bone.rotation_euler=rotation
            bone.location=translation
            bone.keyframe_insert(data_path="rotation_euler",frame=frame,group=bone_name)
            bone.keyframe_insert(data_path="location",frame=frame,group=bone_name)
    track=rig.animation_data.nla_tracks.new()
    track.name=name
    track.strips.new(name,1,action)
    rig.animation_data.action=None
    return action


def make_animations(rig):
    def channel(name,rotation=(0,0,0),translation=(0,0,0)):
        return (name,rotation,translation)
    idle=[]
    for frame,bob,tilt in ((1,0,0),(17,.012,.015),(33,0,0)):
        idle.append((frame,[channel("pelvis",translation=(0,0,bob)),
                            channel("head",rotation=(0,tilt,0)),
                            channel("l_upperarm",rotation=(0,0,.025*math.sin(frame/8))),
                            channel("r_upperarm",rotation=(0,0,-.025*math.sin(frame/8)))]))
    create_action(rig,"Idle",idle)
    walk=[]
    for frame,phase in ((1,0),(9,math.pi/2),(17,math.pi),
                        (25,3*math.pi/2),(33,2*math.pi)):
        swing=math.cos(phase)
        bob=.024*abs(math.sin(phase))
        walk.append((frame,[channel("pelvis",translation=(0,0,bob)),
                            channel("l_upperleg",rotation=(.29*swing,0,0)),
                            channel("r_upperleg",rotation=(-.29*swing,0,0)),
                            channel("l_lowerleg",rotation=(-.10*max(0,-swing),0,0)),
                            channel("r_lowerleg",rotation=(-.10*max(0,swing),0,0)),
                            channel("l_upperarm",rotation=(-.18*swing,0,0)),
                            channel("r_upperarm",rotation=(.18*swing,0,0))]))
    create_action(rig,"Walk",walk)
    bpy.context.scene.frame_set(1)


def module_geometry(module_id):
    b=MeshBuilder()
    if module_id in ("hair_elder","hair_ghost"):
        hem=ellipse_ring(1.92,.49,.43,-.025,8)
        if module_id=="hair_elder":
            heights=(1.47,1.27,1.25,1.27,1.47,1.82,1.94,1.82)
        else:
            heights=(1.52,1.33,1.30,1.33,1.52,1.77,1.91,1.77)
        hem=[(x,y,z) for (x,y,_),z in zip(hem,heights)]
        b.rings((hem,ellipse_ring(2.16,.25,.24,-.025,8)),
                ("head","head"),"hair_mass",cap_start=False)
        b.box((0,.005,2.205),(.12,.105,.075),"head","hair_topknot")
        if module_id=="hair_elder":
            b.wedge(((-.29,-.37,1.94),(-.10,-.45,1.92),(-.12,-.45,1.64),
                     (-.28,-.36,1.94),(-.10,-.43,1.91),(-.11,-.44,1.63)),
                    "head","white_fringe")
            b.wedge(((.30,-.37,1.94),(.10,-.45,1.92),(.12,-.45,1.69),
                     (.29,-.36,1.94),(.10,-.43,1.91),(.11,-.44,1.68)),
                    "head","white_fringe")
        else:
            b.wedge(((-.37,-.23,1.93),(-.17,-.43,1.91),(-.20,-.45,1.67),
                     (-.36,-.22,1.93),(-.17,-.41,1.90),(-.19,-.43,1.66)),
                    "head","ghost_fringe")
            b.wedge(((.35,-.22,1.92),(.16,-.43,1.91),(.20,-.45,1.72),
                     (.34,-.21,1.92),(.16,-.41,1.90),(.19,-.43,1.71)),
                    "head","ghost_red_streak")
    elif module_id=="sword_simple":
        section((.61,-.055,.77),(.72,-.055,.92),.045,.040,
                "r_hand","r_hand","sword_grip",b,4)
        section((.69,-.055,.84),(.78,-.055,.82),.042,.042,
                "r_hand","r_hand","sword_guard",b,4)
        section((.60,-.055,.70),(.86,-.055,.13),.060,.020,
                "r_hand","r_hand","sword_blade",b,4)
    elif module_id=="pack_traveler":
        # Offset toward the outer left back edge: still legible from 3/4 front.
        b.box((-.42,.35,1.09),(.23,.18,.23),"spine","pack_body")
        b.box((-.42,.19,1.28),(.23,.035,.065),"spine","pack_flap")
        b.box((-.42,.36,1.37),(.19,.17,.065),"spine","pack_roll")
        for x in (-.58,-.26):
            b.box((x,.18,1.11),(.025,.025,.25),"spine","pack_strap")
    elif module_id=="gourd_small":
        center=(.48,-.09)
        def ring(z,r):
            return [(center[0]+r*math.cos(2*math.pi*i/6),
                     center[1]+r*math.sin(2*math.pi*i/6),z) for i in range(6)]
        b.rings((ring(.42,.035),ring(.49,.12),ring(.62,.12),
                 ring(.70,.065),ring(.76,.047)),("pelvis",)*5,"gourd_shell")
        b.box((.48,-.09,.79),(.035,.035,.045),"pelvis","gourd_cork")
    elif module_id=="soul_lamp":
        center=(.66,-.07)
        def ring(z,r):
            return [(center[0]+r*math.cos(2*math.pi*i/6),
                     center[1]+r*math.sin(2*math.pi*i/6),z) for i in range(6)]
        b.rings((ring(.29,.03),ring(.35,.115),ring(.57,.115),ring(.64,.03)),
                ("r_hand",)*4,"lamp_glass")
        b.rings((ring(.57,.125),ring(.61,.07)),("r_hand",)*2,"lamp_roof")
        b.box((.66,-.07,.695),(.025,.025,.085),"r_hand","lamp_loop")
        for x in (.55,.77):
            b.box((x,-.07,.46),(.018,.022,.16),"r_hand","lamp_frame")
    elif module_id in ("sect_token","alchemy_tag"):
        x=.35 if module_id=="sect_token" else -.35
        b.box((x,-.17,.72),(.09,.025,.14),"pelvis","tag_face")
        b.box((x,-.17,.85),(.015,.025,.045),"pelvis","tag_loop")
        if module_id=="alchemy_tag":
            y=-.197
            # Four ink quads form a readable small cauldron: lid, bowl, legs.
            b.flat_quad(((x-.050,y,.777),(x+.050,y,.777),
                         (x+.050,y,.793),(x-.050,y,.793)),"pelvis","furnace_mark")
            b.flat_quad(((x-.055,y,.720),(x+.055,y,.720),
                         (x+.037,y,.769),(x-.037,y,.769)),"pelvis","furnace_mark")
            for dx in (-.032,.032):
                b.flat_quad(((x+dx-.010,y,.667),(x+dx+.010,y,.667),
                             (x+dx+.010,y,.721),(x+dx-.010,y,.721)),
                            "pelvis","furnace_mark")
    elif module_id=="elder_mantle":
        # One broad shoulder edge; no multilayer robe or dangling cloth.
        b.ribbon(((-.31,-.19,1.35),(-.18,-.235,1.40),
                  (.17,-.245,1.34),(.33,-.18,1.29)),.09,
                 "spine","elder_shoulder")
    elif module_id=="ghost_torn_hem":
        for x,z in ((-.23,.24),(.23,.27)):
            b.wedge(((x-.11,-.275,.47),(x+.11,-.275,.47),(x,-.28,z),
                     (x-.11,-.285,.47),(x+.11,-.285,.47),(x,-.29,z-.01)),
                    "pelvis","torn_hem")
    else:
        raise ValueError(module_id)
    return b


MODULE_SPECS={
    "hair_elder":("hair", "socket_hair",{"hair_mass":1,"hair_topknot":1,
                                        "white_fringe":1}),
    "hair_ghost":("hair", "socket_hair",{"hair_mass":3,"hair_topknot":3,
                                        "ghost_fringe":3,"ghost_red_streak":7}),
    "sword_simple":("weapon","socket_weapon",{"sword_grip":6,"sword_guard":9,
                                               "sword_blade":4}),
    "pack_traveler":("back","socket_back",{"pack_body":6,"pack_flap":7,
                                            "pack_roll":6,"pack_strap":2}),
    "gourd_small":("prop","socket_waist",{"gourd_shell":9,"gourd_cork":6}),
    "soul_lamp":("prop","socket_weapon",{"lamp_glass":8,"lamp_roof":3,
                                         "lamp_loop":3,"lamp_frame":3}),
    "sect_token":("tag","socket_waist",{"tag_face":9,"tag_loop":6}),
    "alchemy_tag":("tag","socket_waist",{"tag_face":9,"tag_loop":6,
                                          "furnace_mark":3}),
    "elder_mantle":("robe","socket_back",{"elder_shoulder":10}),
    "ghost_torn_hem":("robe","socket_waist",{"torn_hem":3}),
}


def enable_master_role_palette():
    """After GLB export, preview role color with one material and one atlas.

    pass_index = role palette index + 1; zero retains the authored UV.  Only
    face loops at faction slot 5 are redirected, leaving skin and trim intact.
    """
    material=bpy.data.materials["cultivator_flat_palette"]
    nodes=material.node_tree.nodes
    links=material.node_tree.links
    texture=next(node for node in nodes if node.type=="TEX_IMAGE")
    uv=nodes.new("ShaderNodeUVMap")
    uv.uv_map="palette_uv"
    split=nodes.new("ShaderNodeSeparateXYZ")
    links.new(uv.outputs["UV"],split.inputs["Vector"])
    info=nodes.new("ShaderNodeObjectInfo")
    def math_node(operation,a=None,b=None):
        node=nodes.new("ShaderNodeMath")
        node.operation=operation
        for index,value in enumerate((a,b)):
            if value is not None:
                if isinstance(value,(float,int)):
                    node.inputs[index].default_value=value
                else:
                    links.new(value,node.inputs[index])
        return node.outputs[0]
    index=info.outputs["Object Index"]
    active=math_node("GREATER_THAN",index,0.0)
    compare=nodes.new("ShaderNodeMath")
    compare.operation="COMPARE"
    links.new(split.outputs["X"],compare.inputs[0])
    compare.inputs[1].default_value=5.5/12
    compare.inputs[2].default_value=.001
    slot_mask=compare.outputs[0]
    mask=math_node("MULTIPLY",active,slot_mask)
    inverted=math_node("SUBTRACT",1.0,mask)
    replacement=math_node("DIVIDE",
                          math_node("SUBTRACT",index,.5),12.0)
    original_term=math_node("MULTIPLY",split.outputs["X"],inverted)
    new_term=math_node("MULTIPLY",replacement,mask)
    combine=nodes.new("ShaderNodeCombineXYZ")
    links.new(math_node("ADD",original_term,new_term),combine.inputs["X"])
    links.new(split.outputs["Y"],combine.inputs["Y"])
    links.new(combine.outputs["Vector"],texture.inputs["Vector"])


def clone_role(role_id,role,manifest,preview_coll,x=0.0,rotation=0.0,
               z=0.0,scale=1.0):
    copies=[]
    for key in ("body","hair","robe","back","weapon","prop","tag"):
        module_id=role.get(key)
        if not module_id:
            continue
        node=manifest["modules"][module_id]["node"]
        original=bpy.data.objects[node]
        obj=original.copy()
        obj.name=f"preview_{role_id}_{key}"
        obj.data=original.data
        preview_coll.objects.link(obj)
        obj.parent=None
        obj.animation_data_clear()
        for mod in list(obj.modifiers):
            obj.modifiers.remove(mod)
        obj.hide_render=False
        obj.hide_viewport=False
        obj.location=(x,0,z)
        obj.rotation_euler=(0,0,rotation)
        obj.scale=(scale,)*3
        obj.pass_index=role["paletteIndex"]+1
        copies.append(obj)
    return copies


def render_master_preview(objects,path,width,height,ortho,eye,target):
    scene=bpy.context.scene
    scene.render.engine="BLENDER_EEVEE_NEXT"
    scene.render.resolution_x=width
    scene.render.resolution_y=height
    scene.render.resolution_percentage=100
    scene.render.image_settings.file_format="PNG"
    scene.render.film_transparent=False
    scene.world.color=(.25,.25,.25)
    camera_data=bpy.data.cameras.new("TEMP_preview_camera")
    camera_data.type="ORTHO"
    camera_data.ortho_scale=ortho
    camera=bpy.data.objects.new("TEMP_preview_camera",camera_data)
    bpy.context.scene.collection.objects.link(camera)
    camera.location=eye
    camera.rotation_euler=(Vector(target)-camera.location).to_track_quat("-Z","Y").to_euler()
    scene.camera=camera
    light_data=bpy.data.lights.new("TEMP_preview_key","AREA")
    light_data.energy=1900
    light_data.shape="DISK"
    light_data.size=8
    light=bpy.data.objects.new("TEMP_preview_key",light_data)
    bpy.context.scene.collection.objects.link(light)
    light.location=(-3,-5,7)
    light.rotation_euler=(Vector(target)-light.location).to_track_quat("-Z","Y").to_euler()
    for obj in objects:
        obj.hide_render=False
    scene.render.filepath=str(path)
    bpy.ops.render.render(write_still=True)
    for obj in objects:
        obj.hide_render=True
    bpy.data.objects.remove(camera,do_unlink=True)
    bpy.data.objects.remove(light,do_unlink=True)
    bpy.data.cameras.remove(camera_data,do_unlink=True)
    bpy.data.lights.remove(light_data,do_unlink=True)


def build_master(manifest,library_coll):
    # Export happened first. These displays all link existing Mesh datablocks;
    # only the canonical library collection owns the single armature.
    enable_master_role_palette()
    for obj in library_coll.objects:
        obj.hide_render=True
    role_order=("basic","sect_disciple","wanderer","elder","ghost","alchemist")
    family=collection("FAMILY_SIX_LINKED")
    family_objects=[]
    for i,role_id in enumerate(role_order):
        family_objects += clone_role(role_id,manifest["roles"][role_id],manifest,
                                     family,x=(i-2.5)*1.5,rotation=.22)
        label_data=bpy.data.curves.new("family_label_"+role_id,"FONT")
        label_data.body=role_id
        label_data.size=.17
        label_data.align_x="CENTER"
        label=bpy.data.objects.new("family_label_"+role_id,label_data)
        family.objects.link(label)
        label.location=((i-2.5)*1.5,-.35,-.23)
        label.rotation_euler=(math.pi/2,0,0)
        family_objects.append(label)
    render_master_preview(family_objects,PREVIEW/"cultivator_family_six.png",
                          1800,660,10.6,(0,-12,2.3),(0,0,1.12))

    turnaround=collection("TURNAROUND_LINKED")
    turn_objects=[]
    for i,rotation in enumerate((0,math.pi/2,math.pi)):
        turn_objects += clone_role("basic",manifest["roles"]["basic"],manifest,
                                   turnaround,x=(i-1)*1.5,rotation=rotation)
    render_master_preview(turn_objects,PREVIEW/"cultivator_color_turnaround.png",
                          1536,768,6.2,(0,-10,1.5),(0,0,1.12))

    modules_coll=collection("MODULES_LINKED")
    module_objects=[]
    for index,(module_id,entry) in enumerate(manifest["modules"].items()):
        source=bpy.data.objects[entry["node"]]
        obj=source.copy()
        obj.name="preview_module_"+module_id
        obj.data=source.data
        modules_coll.objects.link(obj)
        obj.parent=None
        obj.animation_data_clear()
        for mod in list(obj.modifiers):
            obj.modifiers.remove(mod)
        obj.hide_render=False
        obj.hide_viewport=False
        x=(index%6-2.5)*1.45
        row=index//6
        z=1.8-row*2.05
        bbox=[Vector(v.co) for v in source.data.vertices]
        min_x,max_x=min(v.x for v in bbox),max(v.x for v in bbox)
        min_z,max_z=min(v.z for v in bbox),max(v.z for v in bbox)
        obj.location=(x-(min_x+max_x)/2,0,z-(min_z+max_z)/2)
        module_objects.append(obj)
        label_data=bpy.data.curves.new("label_"+module_id,"FONT")
        label_data.body=module_id
        label_data.size=.14
        label_data.align_x="CENTER"
        label=bpy.data.objects.new("label_"+module_id,label_data)
        modules_coll.objects.link(label)
        label.location=(x,-.7,z-.92)
        label.rotation_euler=(math.pi/2,0,0)
        module_objects.append(label)
    render_master_preview(module_objects,PREVIEW/"cultivator_modules.png",
                          1800,850,10.6,(0,-12,1.1),(0,0,.8))

    for count in (6,20,50):
        crowd=collection(f"SCALE_TEST_{count}_LINKED")
        crowd_objects=[]
        columns=6 if count==6 else (5 if count==20 else 10)
        rows=math.ceil(count/columns)
        for i in range(count):
            role_id=role_order[i%6]
            x=(i%columns-(columns-1)/2)*1.05
            y=i//columns*.65
            z=0
            copies=clone_role(role_id,manifest["roles"][role_id],manifest,
                              crowd,x=x,rotation=.15,z=z,scale=.68)
            for obj in copies:
                obj.location.y=y
            crowd_objects+=copies
        if count==6:
            render_master_preview(crowd_objects,PREVIEW/"cultivator_scale_6.png",
                                  1500,500,8.0,(0,-10,2.1),(0,0,.8))
        elif count==20:
            render_master_preview(crowd_objects,PREVIEW/"cultivator_scale_20.png",
                                  1500,850,7.0,(0,-10,5.0),(0,1.0,.7))
        else:
            render_master_preview(crowd_objects,PREVIEW/"cultivator_scale_50.png",
                                  1800,850,13.0,(0,-13,7.0),(0,1.5,.5))
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/"cultivator_master.blend"))


def material(full=False):
    for path in (SOURCE,DATA,PREVIEW,MESH,MATERIALS):
        path.mkdir(parents=True,exist_ok=True)
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for old in list(bpy.data.collections):
        if old.name != bpy.context.scene.collection.name:
            bpy.data.collections.remove(old)
    coll=collection("CULTIVATOR_LIBRARY")
    builder=MeshBuilder()
    make_base_geometry(builder)
    rig=make_rig(coll)
    atlas_material=build_palette()
    slots={part:part_palette(part) for part in builder.parts}
    body_parts=set(builder.parts)-HAIR_PARTS
    body=make_mesh(builder,coll,rig,"cultivator_body_base",body_parts,atlas_material,slots)
    hair=make_mesh(builder,coll,rig,"cultivator_hair_base",HAIR_PARTS,atlas_material,slots)
    extra_modules={}
    if full:
        for module_id,(slot,socket,palette_map) in MODULE_SPECS.items():
            geometry=module_geometry(module_id)
            mesh_obj=make_mesh(geometry,coll,rig,"cultivator_"+module_id,
                               None,atlas_material,palette_map)
            extra_modules[module_id]={"node":mesh_obj.name,"slot":slot,
                "triangles":len(mesh_obj.data.polygons),"socket":socket,
                "local_transform":"identity",
                "palette":{"parts":palette_map,"faction_recolor_parts":[]}}
    sockets=make_sockets(coll,rig)
    make_animations(rig)
    bpy.context.scene.render.fps=24
    bpy.context.scene.frame_start=1
    bpy.context.scene.frame_end=33
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/"cultivator_library.blend"))
    bpy.ops.export_scene.gltf(
        filepath=str(MESH/"cultivator_library.glb"),export_format="GLB",
        use_selection=False,export_yup=True,export_animations=True,
        export_nla_strips=True,export_skins=True,export_cameras=False,
        export_lights=False,export_apply=False)
    manifest={
        "schema":"cultivator-library-v1",
        "asset":"mesh/cultivator_library.glb",
        "coordinate_system":{"blender":"Z-up, front -Y, feet/root at origin",
                             "gltf":"Y-up, front +Z, feet/root at origin",
                             "module_transform":"identity; vertices in shared character rest space"},
        "rig":{"node":"cultivator_rig","bone_count":16,
               "bones":[row[0] for row in BONES],
               "animations":{"Idle":{"start":1,"end":33,"fps":24},
                             "Walk":{"start":1,"end":33,"fps":24,"in_place":True}}},
        "palette":{"texture":"materials/cultivator_palette_12.png",
                   "material":"cultivator_flat_palette","count":12,
                   "factionSlot":5,
                   "colors":[{"index":i,"semantic":semantic,"hex":hex_color}
                             for i,(semantic,hex_color) in enumerate(PALETTE)],
                   "uv_rule":"face loop UV at ((index+0.5)/12, 0.5); nearest sampling"},
        "modules":{
            "body_base":{"node":body.name,"slot":"body","triangles":len(body.data.polygons),
                         "socket":None,"local_transform":"identity",
                         "palette":{"parts":{p:slots[p] for p in sorted(body_parts)},
                                    "faction_recolor_parts":["short_robe","l_upper_sleeve",
                                                             "r_upper_sleeve"]}},
            "hair_base":{"node":hair.name,"slot":"hair","triangles":len(hair.data.polygons),
                         "socket":"socket_hair","local_transform":"identity",
                         "palette":{"parts":{p:slots[p] for p in sorted(HAIR_PARTS)},
                                    "faction_recolor_parts":[]}},
        },
        "sockets":sockets,
        "roles":{"basic":{"body":"body_base","hair":"hair_base",
                              "weapon":None,"prop":None,"tag":None,"back":None,
                              "paletteIndex":1,
                              "allowedSlots":["weapon","back","prop","tag"]}},
        "limits":{"hair":1,"weapon":1,"prop":1,"tag":1,
                  "weapon_prop_tag_combined":2},
        "phase":"full" if full else "material",
    }
    manifest["modules"].update(extra_modules)
    if full:
        manifest["roles"].update({
            "sect_disciple":{"body":"body_base","hair":"hair_base",
                "weapon":"sword_simple","tag":"sect_token","prop":None,"back":None,
                "paletteIndex":5,"allowedSlots":["weapon","tag"]},
            "wanderer":{"body":"body_base","hair":"hair_base",
                "weapon":None,"tag":None,"prop":"gourd_small","back":"pack_traveler",
                "paletteIndex":2,"allowedSlots":["back","prop"]},
            "elder":{"body":"body_base","hair":"hair_elder",
                "weapon":"sword_simple","tag":None,"prop":None,"back":None,
                "robe":"elder_mantle","paletteIndex":4,
                "allowedSlots":["weapon","robe"]},
            "ghost":{"body":"body_base","hair":"hair_ghost",
                "weapon":None,"tag":None,"prop":"soul_lamp","back":None,
                "robe":"ghost_torn_hem","paletteIndex":3,
                "allowedSlots":["prop","tag","robe"]},
            "alchemist":{"body":"body_base","hair":"hair_base",
                "weapon":None,"tag":"alchemy_tag","prop":None,"back":None,
                "paletteIndex":9,"allowedSlots":["prop","tag"]},
        })
    (DATA/"cultivator_manifest.json").write_text(
        json.dumps(manifest,ensure_ascii=False,indent=2),encoding="utf-8")
    if full:
        role_triangles={}
        for role_id,role in manifest["roles"].items():
            module_ids=[role.get(slot) for slot in
                        ("body","hair","robe","back","weapon","prop","tag")]
            role_triangles[role_id]=sum(manifest["modules"][module_id]["triangles"]
                                        for module_id in module_ids if module_id)
        report={"phase":"full","role_triangles":role_triangles,
                "base_budget_including_hair":434,
                "shared_armature_count":1,
                "linked_role_previews":6,
                "linked_scale_counts":[6,20,50],
                "runtime_glb_has_preview_duplicates":False,
                "files":{"master":"source/cultivator_master.blend",
                         "family":"preview/cultivator_family_six.png",
                         "modules":"preview/cultivator_modules.png",
                         "turnaround":"preview/cultivator_color_turnaround.png"}}
        (DATA/"cultivator_build_report.json").write_text(
            json.dumps(report,ensure_ascii=False,indent=2),encoding="utf-8")
        build_master(manifest,coll)
    print("MATERIAL_REPORT="+json.dumps({
        "body_triangles":len(body.data.polygons),
        "hair_triangles":len(hair.data.polygons),
        "total_triangles":len(body.data.polygons)+len(hair.data.polygons),
        "glb":str(MESH/"cultivator_library.glb"),
        "manifest":str(DATA/"cultivator_manifest.json"),
        "module_count":len(manifest["modules"]),
        "role_count":len(manifest["roles"])},ensure_ascii=False))


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--phase",choices=("gray","material","full"),required=True)
    args=parser.parse_args(sys.argv[sys.argv.index("--")+1:] if "--" in sys.argv else [])
    if args.phase=="gray":
        gray()
    elif args.phase=="material":
        material()
    elif args.phase=="full":
        material(full=True)


if __name__=="__main__":
    main()
