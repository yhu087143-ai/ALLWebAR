"""
在 Blender 里清洗 FBX 角色，导出成移动端友好的 GLB。

由 scripts/prepare-asset.mjs 通过 `blender -b -P <本文件> -- <参数>` 调用，
不要手动执行。

做的事：
  1. 导入 FBX（保留动画与蒙皮）
  2. 骨骼名去前缀（mixamorig: / Armature| 等，否则重定向会全部 miss）
  3. 减面（保留蒙皮权重）
  4. 每顶点骨骼影响限制到 4（three.js 移动端硬约束）
  5. 导出 GLB（含蒙皮与动画）
"""

import sys


def parse_args() -> dict:
    """从 `--` 之后读取 key=value 形式的参数"""
    argv = sys.argv
    if "--" not in argv:
        raise SystemExit("缺少参数：blender -b -P blender-clean.py -- src=xx.fbx dst=xx.glb")
    raw = argv[argv.index("--") + 1:]
    args = {}
    for item in raw:
        if "=" in item:
            key, value = item.split("=", 1)
            args[key] = value
    return args


def strip_bone_prefix(armature) -> None:
    """mixamorig:Hips / Armature|Hips -> Hips"""
    for bone in armature.pose.bones:
        name = bone.name
        for sep in (":", "|"):
            if sep in name:
                name = name.split(sep)[-1]
        bone.name = name


def main() -> None:
    import bpy

    args = parse_args()
    src = args["src"]
    dst = args["dst"]
    ratio = float(args.get("ratio", "0.35"))
    max_weights = int(args.get("max_weights", "4"))

    # 清空场景，避免残留对象被一起导出
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()

    bpy.ops.import_scene.fbx(filepath=src, use_anim=True)

    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    armatures = [o for o in bpy.context.scene.objects if o.type == "ARMATURE"]

    print(f"[clean] 导入完成：网格 {len(meshes)} 个，骨架 {len(armatures)} 个")

    for arm in armatures:
        strip_bone_prefix(arm)
        print(f"[clean] 骨骼数：{len(arm.pose.bones)}")

    before_tris = 0
    for obj in meshes:
        before_tris += len(obj.data.polygons)

    # 减面：保留蒙皮权重，用 COLLAPSE 模式比 DISSOLVE 更稳
    if ratio < 1.0:
        for obj in meshes:
            bpy.context.view_layer.objects.active = obj
            modifier = obj.modifiers.new("Decimate", "DECIMATE")
            modifier.ratio = ratio
            modifier.decimate_type = "COLLAPSE"
            bpy.ops.object.modifier_apply(modifier=modifier.name)

    # 每顶点骨骼影响上限
    for obj in meshes:
        if not obj.vertex_groups:
            continue
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.mode_set(mode="WEIGHT_PAINT")
        bpy.ops.object.vertex_group_limit_total(group_select_mode="ALL", limit=max_weights)
        bpy.ops.object.mode_set(mode="OBJECT")

    after_tris = sum(len(o.data.polygons) for o in meshes)
    print(f"[clean] 面数：{before_tris} -> {after_tris}")

    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.export_scene.gltf(
        filepath=dst,
        export_format="GLB",
        export_skins=True,
        export_animations=True,
        export_image_format="AUTO",
        export_optimize_animation_size=True,
        export_anim_single_armature=True,
        export_materials="EXPORT",
        export_yup=True,
    )
    print(f"[clean] 已导出 {dst}")


main()
