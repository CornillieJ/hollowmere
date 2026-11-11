"""
Shared tools for the Blender build scripts: a pixel-painted texture atlas, loose
low-poly parts with their origin at a joint, and GLB export.

The look is PS1: a 128 px texture with hard pixels, flat-shaded faces, shapes
made from a handful of primitives. Nothing here is specific to one model.
"""
import math
import os
import random

import bmesh
import bpy
from mathutils import Matrix, Vector

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SIZE = 128


def rgb(value):
    return ((value >> 16) & 255, (value >> 8) & 255, value & 255)


def shade(color, amount):
    return tuple(max(0, min(255, int(c * amount))) for c in color)


def mix(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))



class Atlas:
    """A 128 px image painted in pixel coordinates, y down."""

    def __init__(self, seed):
        self.pixels = [[(0, 0, 0)] * SIZE for _ in range(SIZE)]
        self.random = random.Random(seed)

    def put(self, x, y, color):
        if 0 <= x < SIZE and 0 <= y < SIZE:
            self.pixels[int(y)][int(x)] = color

    def fill(self, region, color, speckle=0.0):
        x0, y0, x1, y1 = region
        for y in range(y0, y1):
            for x in range(x0, x1):
                roll = self.random.random()
                tone = 1.0
                if roll < speckle:
                    tone = 0.86
                elif roll > 1 - speckle * 0.6:
                    tone = 1.1
                self.put(x, y, shade(color, tone))

    def oval(self, cx, cy, rx, ry, color, region=None):
        for y in range(int(cy - ry), int(cy + ry) + 1):
            for x in range(int(cx - rx), int(cx + rx) + 1):
                if ((x - cx) / max(rx, 0.5)) ** 2 + ((y - cy) / max(ry, 0.5)) ** 2 <= 1.0:
                    if region is None or (region[0] <= x < region[2] and region[1] <= y < region[3]):
                        self.put(x, y, color)

    def line(self, x0, y0, x1, y1, color):
        steps = int(max(abs(x1 - x0), abs(y1 - y0))) + 1
        for step in range(steps + 1):
            t = step / steps
            self.put(round(x0 + (x1 - x0) * t), round(y0 + (y1 - y0) * t), color)

    def image(self, name):
        image = bpy.data.images.new(name, SIZE, SIZE, alpha=False)
        flat = []
        # Blender stores rows bottom up.
        for row in reversed(self.pixels):
            for r, g, b in row:
                flat.extend((r / 255, g / 255, b / 255, 1.0))
        image.pixels = flat
        image.pack()
        return image



    # Surfaces. Each paints a whole region so a part can be mapped onto it.

    def wood(self, region, color, planks=4):
        """Planks with a grain and the odd knot."""
        x0, y0, x1, y1 = region
        self.fill(region, color, 0.1)
        width = max(3, (x1 - x0) // planks)
        for x in range(x0, x1):
            if (x - x0) % width == 0:
                self.line(x, y0, x, y1 - 1, shade(color, 0.6))
        for _ in range((x1 - x0) * (y1 - y0) // 60):
            x, y = self.random.randrange(x0, x1), self.random.randrange(y0, y1 - 4)
            self.line(x, y, x, y + self.random.randrange(2, 5), shade(color, 0.8))
        for _ in range(2):
            self.oval(self.random.randrange(x0 + 2, x1 - 2), self.random.randrange(y0 + 2, y1 - 2), 1.5, 2, shade(color, 0.55), region)

    def stone(self, region, color):
        """Mottled stone with a few cracks and a lichen patch."""
        x0, y0, x1, y1 = region
        self.fill(region, color, 0.22)
        for _ in range(3):
            x, y = self.random.randrange(x0, x1), self.random.randrange(y0, y1)
            for _ in range(7):
                self.put(x, y, shade(color, 0.55)) if x0 <= x < x1 and y0 <= y < y1 else None
                x += self.random.choice((-1, 0, 1))
                y += 1
        self.oval(self.random.randrange(x0 + 3, x1 - 3), self.random.randrange(y0 + 3, y1 - 3), 3, 2, mix(color, (96, 112, 80), 0.5), region)

    def stripes(self, region, a, b, band=5):
        x0, y0, x1, y1 = region
        for y in range(y0, y1):
            for x in range(x0, x1):
                self.put(x, y, shade(a if ((x - x0) // band) % 2 == 0 else b, 0.94 + 0.1 * self.random.random()))


def cell(column, row, width=1, height=1, size=32):
    """A region of the atlas on a grid of 32 px cells."""
    return (column * size, row * size, (column + width) * size, (row + height) * size)


class Part:
    """One loose piece of a character, built in world space and exported with its origin at a joint."""

    def __init__(self, name, joint):
        self.name = name
        self.joint = Vector(joint)
        self.bm = bmesh.new()
        self.uv = self.bm.loops.layers.uv.new("UVMap")

    def _finish(self, verts, region, front=None):
        faces = {face for vert in verts for face in vert.link_faces}
        xs = [v.co.x for v in verts]
        zs = [v.co.z for v in verts]
        x0, x1, z0, z1 = min(xs), max(xs), min(zs), max(zs)
        for face in faces:
            face.normal_update()
            target = front if front is not None and face.normal.y < -0.3 else region
            px0, py0, px1, py1 = target
            for loop in face.loops:
                s = (loop.vert.co.x - x0) / max(x1 - x0, 1e-6)
                t = (loop.vert.co.z - z0) / max(z1 - z0, 1e-6)
                # Stay a pixel inside the region so neighbours never bleed in.
                s = 0.04 + s * 0.92
                t = 0.04 + t * 0.92
                loop[self.uv].uv = ((px0 + s * (px1 - px0)) / SIZE, 1 - (py0 + (1 - t) * (py1 - py0)) / SIZE)

    def ball(self, at, radii, region, front=None, detail=2, rotate=None):
        made = bmesh.ops.create_icosphere(self.bm, subdivisions=detail, radius=1.0)["verts"]
        self._place(made, at, radii, rotate)
        self._finish(made, region, front)

    def tube(self, at, radius_low, radius_high, height, region, sides=8, rotate=None, front=None):
        made = bmesh.ops.create_cone(self.bm, cap_ends=True, segments=sides, radius1=radius_low, radius2=radius_high, depth=height)["verts"]
        self._place(made, at, (1, 1, 1), rotate)
        self._finish(made, region, front)

    def box(self, at, size, region, rotate=None):
        made = bmesh.ops.create_cube(self.bm, size=1.0)["verts"]
        self._place(made, at, size, rotate)
        self._finish(made, region)

    def _place(self, verts, at, scale, rotate):
        matrix = Matrix.Translation(Vector(at))
        if rotate:
            matrix = matrix @ Matrix.Rotation(rotate[0], 4, "X") @ Matrix.Rotation(rotate[1], 4, "Y") @ Matrix.Rotation(rotate[2], 4, "Z")
        matrix = matrix @ Matrix.Diagonal((scale[0], scale[1], scale[2], 1.0))
        bmesh.ops.transform(self.bm, matrix=matrix, verts=verts)

    def build(self, material, collection):
        bmesh.ops.translate(self.bm, vec=-self.joint, verts=self.bm.verts)
        mesh = bpy.data.meshes.new(self.name)
        self.bm.to_mesh(mesh)
        self.bm.free()
        mesh.materials.append(material)
        obj = bpy.data.objects.new(self.name, mesh)
        obj.location = self.joint
        collection.objects.link(obj)
        return obj



def material_for(name, image):
    material = bpy.data.materials.new(f"{name}-material")
    material.use_nodes = True
    nodes = material.node_tree.nodes
    shader = nodes["Principled BSDF"]
    shader.inputs["Roughness"].default_value = 1.0
    shader.inputs["Metallic"].default_value = 0.0
    texture = nodes.new("ShaderNodeTexImage")
    texture.image = image
    # Hard pixels: this is the PS1 look, and at 128 px any filtering turns faces to mush.
    texture.interpolation = "Closest"
    material.node_tree.links.new(texture.outputs["Color"], shader.inputs["Base Color"])
    return material




def new_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    return bpy.context.scene.collection


def export_glb(folder, name):
    """Write everything in the scene to static/models/<folder>/<name>.glb, and a preview when asked."""
    out = os.path.join(ROOT, "static", "models", folder)
    os.makedirs(out, exist_ok=True)
    path = os.path.join(out, f"{name}.glb")
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", export_yup=True, export_apply=True, export_image_format="AUTO", export_animations=False)
    print(f"wrote {path}")
    preview = os.environ.get("FOLK_PREVIEW")
    if preview:
        render_preview(os.path.join(preview, f"{name}.png"))


def render_preview(path):
    """A quick look without starting the game: `FOLK_PREVIEW=/some/dir blender -b -P ...`."""
    scene = bpy.context.scene
    camera = bpy.data.objects.new("camera", bpy.data.cameras.new("camera"))
    scene.collection.objects.link(camera)
    # Frame whatever was built: stand back in proportion to how tall and wide it is.
    corners = [obj.matrix_world @ Vector(corner) for obj in scene.objects if obj.type == "MESH" for corner in obj.bound_box]
    top = max(corner.z for corner in corners)
    reach = max(top, max(abs(corner.x) for corner in corners) * 2.2, max(abs(corner.y) for corner in corners) * 2.2)
    camera.location = (reach * 0.95, -reach * 1.95, top * 0.62 + 0.3)
    direction = Vector((0, 0, top * 0.5)) - camera.location
    camera.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    camera.data.lens = 60
    scene.camera = camera
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.display.shading.light = "FLAT"
    scene.display.shading.color_type = "TEXTURE"
    scene.render.resolution_x = 420
    scene.render.resolution_y = 520
    scene.render.filepath = path
    scene.view_settings.view_transform = "Standard"
    scene.world = bpy.data.worlds.new("world")
    scene.world.color = (0.32, 0.36, 0.33)
    bpy.ops.render.render(write_still=True)


