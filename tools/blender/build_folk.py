"""
Builds the people of Hollowveil as low-poly, PS1-style models with painted textures.

    blender -b -P tools/blender/build_folk.py

Writes one GLB per character into static/models/folk/. Every character is the
same set of loose parts (torso, head, arms, legs, tail), each with its origin at
its joint, so the game can hang them on its own rig and animate them in code.

Everything here is original: the shapes are built from primitives below and the
textures are painted pixel by pixel into a 128 px atlas. Change a character by
editing its entry in FOLK and running the script again.
"""
import math
import os
import random
import sys

from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lowpoly import Atlas, Part, export_glb, material_for, mix, new_scene, rgb, shade  # noqa: E402

# Atlas regions in pixels: (x0, y0, x1, y1), y down.
FUR = (0, 0, 64, 64)
ACCENT = (64, 0, 96, 32)
DARK = (96, 0, 112, 16)
BONE = (112, 0, 128, 16)
WHITE = (96, 16, 112, 32)
BOOT = (112, 16, 128, 32)
EXTRA = (80, 32, 96, 64)
TROUSERS = (64, 32, 80, 64)
WOOL = (96, 32, 128, 64)
CLOTH = (0, 64, 64, 128)
FACE = (64, 64, 128, 128)

FOLK = {
    # The farmer: a small dark cat in work clothes and a red scarf.
    "farmer": dict(species="cat", fur=0x2B2522, accent=0xD9B8A0, clothes=0x6B4F3A, pattern="overalls", extra=0x8A3A2A, eyes="normal", scarf=True),
    # Barnaby: an old goat in a shop apron, one eye sewn shut.
    "barnaby": dict(species="goat", fur=0xC9BFAE, accent=0xE4DCCB, clothes=0x3D4A3A, pattern="apron", extra=0xB8AE98, eyes="stitched"),
    # Wren: a young rabbit in a dotted dress, her left arm gone and bandaged.
    "wren": dict(species="rabbit", fur=0xD8CFC4, accent=0xE8A8A8, clothes=0x7A5A6A, pattern="dots", extra=0xE8E0D0, eyes="normal", missing_arm=-1),
    # Fen: a fox in a postman's coat, with a neck far too long.
    "fen": dict(species="fox", fur=0xB8622E, accent=0xF2EAD8, clothes=0x2E3A52, pattern="uniform", extra=0x5A4630, eyes="tired", neck=3.2, strap=True),
    # Mother Hollis: a dark-faced sheep under a heap of wool, with no eyes at all.
    "hollis": dict(species="sheep", fur=0x3A3632, accent=0x4A4640, clothes=0x6A6A5A, pattern="check", extra=0x5A4A52, eyes="hollow", scarf=True),
    # Pike: a scruffy dog with a few eyes more than he started with.
    "pike": dict(species="dog", fur=0x8A6A48, accent=0x5E4630, clothes=0x5A3A2A, pattern="stripes", extra=0xA83A32, eyes="extra", scarf=True),
}


# ---------------------------------------------------------------------------
# Texture
# ---------------------------------------------------------------------------

def paint(name, spec):
    atlas = Atlas(sum(ord(c) for c in name))
    fur, accent, cloth, extra = rgb(spec["fur"]), rgb(spec["accent"]), rgb(spec["clothes"]), rgb(spec["extra"])
    ink = (14, 10, 9)

    atlas.fill(FUR, fur, 0.14)
    # A few darker tufts, so the fur reads as fur and not as paint.
    for _ in range(9):
        x, y = atlas.random.randrange(2, 60), atlas.random.randrange(2, 60)
        atlas.line(x, y, x + 2, y + 3, shade(fur, 0.78))
    atlas.fill(ACCENT, accent, 0.1)
    atlas.fill(DARK, ink, 0.0)
    atlas.fill(BONE, (166, 154, 132), 0.2)
    atlas.fill(WHITE, (236, 230, 214), 0.08)
    atlas.fill(BOOT, (38, 30, 26), 0.2)
    atlas.fill(WOOL, (232, 226, 214), 0.22)
    for _ in range(22):
        x, y = atlas.random.randrange(97, 126), atlas.random.randrange(33, 62)
        atlas.oval(x, y, 2, 2, (206, 198, 184), WOOL)

    # The extra swatch: scarf, bandage or strap. Knitted stripes.
    atlas.fill(EXTRA, extra, 0.12)
    for y in range(EXTRA[1], EXTRA[3], 6):
        atlas.line(EXTRA[0], y, EXTRA[2] - 1, y, shade(extra, 0.7))

    # Trousers: plainer and darker than the top, with a seam and a worn knee.
    atlas.fill(TROUSERS, shade(cloth, 0.78), 0.14)
    atlas.line(TROUSERS[0] + 8, TROUSERS[1], TROUSERS[0] + 8, TROUSERS[3] - 1, shade(cloth, 0.55))
    atlas.oval(TROUSERS[0] + 4, TROUSERS[1] + 14, 2.5, 3, shade(cloth, 1.05), TROUSERS)

    paint_clothes(atlas, spec["pattern"], cloth, extra)
    paint_face(atlas, spec, fur, accent, ink)
    return atlas.image(f"{name}-atlas")


def paint_clothes(atlas, pattern, cloth, extra):
    x0, y0, x1, y1 = CLOTH
    atlas.fill(CLOTH, cloth, 0.12)
    dark, light = shade(cloth, 0.68), shade(cloth, 1.28)
    middle = (x0 + x1) // 2
    if pattern == "stripes":
        for y in range(y0 + 4, y1, 10):
            for row in range(3):
                atlas.line(x0, y + row, x1 - 1, y + row, light)
    elif pattern == "check":
        for y in range(y0, y1, 12):
            atlas.line(x0, y, x1 - 1, y, dark)
            atlas.line(x0, y + 1, x1 - 1, y + 1, dark)
        for x in range(x0, x1, 12):
            atlas.line(x, y0, x, y1 - 1, light)
    elif pattern == "dots":
        for y in range(y0 + 5, y1, 11):
            for x in range(x0 + 4 + ((y // 11) % 2) * 5, x1, 11):
                atlas.oval(x, y, 1.6, 1.6, light, CLOTH)
    elif pattern == "apron":
        # A pale apron down the front, tied at the neck, with a pocket.
        apron = (198, 190, 170)
        for y in range(y0 + 8, y1 - 2):
            atlas.line(middle - 13, y, middle + 13, y, shade(apron, 0.94 + 0.06 * ((y * 7) % 3 == 0)))
        atlas.line(middle - 13, y0 + 8, middle - 4, y0, apron)
        atlas.line(middle + 13, y0 + 8, middle + 4, y0, apron)
        for x in range(middle - 7, middle + 8):
            atlas.put(x, y0 + 36, shade(apron, 0.7))
        atlas.line(middle - 7, y0 + 36, middle - 7, y0 + 46, shade(apron, 0.7))
        atlas.line(middle + 7, y0 + 36, middle + 7, y0 + 46, shade(apron, 0.7))
        # An old stain nobody mentions.
        atlas.oval(middle + 5, y0 + 24, 3, 4, (120, 60, 50), CLOTH)
    elif pattern == "uniform":
        for y in range(y0 + 6, y1 - 4, 9):
            atlas.oval(middle - 4, y, 1.5, 1.5, (196, 164, 84), CLOTH)
            atlas.oval(middle + 4, y, 1.5, 1.5, (196, 164, 84), CLOTH)
        atlas.line(middle, y0, middle, y1 - 1, dark)
        for x in range(x0, x1):
            atlas.put(x, y0 + 2, (196, 164, 84))
    elif pattern == "overalls":
        # Bib and braces over a lighter shirt, with a sewn-on patch.
        shirt = (150, 132, 104)
        for y in range(y0, y0 + 18):
            atlas.line(x0, y, x1 - 1, y, shade(shirt, 0.95 + 0.07 * (y % 2)))
        for y in range(y0 + 8, y0 + 20):
            atlas.line(middle - 9, y, middle + 9, y, cloth)
        atlas.line(middle - 9, y0 + 8, middle - 7, y0, cloth)
        atlas.line(middle + 9, y0 + 8, middle + 7, y0, cloth)
        atlas.oval(middle - 8, y0 + 10, 1.4, 1.4, (196, 164, 84), CLOTH)
        atlas.oval(middle + 8, y0 + 10, 1.4, 1.4, (196, 164, 84), CLOTH)
        for y in range(y0 + 38, y0 + 48):
            atlas.line(middle + 6, y, middle + 15, y, shade(extra, 0.9))
        for x in range(middle + 6, middle + 16, 2):
            atlas.put(x, y0 + 37, light)
            atlas.put(x, y0 + 48, light)
    # A hem, and a seam down each side.
    for row in range(3):
        atlas.line(x0, y1 - 1 - row, x1 - 1, y1 - 1 - row, dark)
    for stitch in range(y0 + 2, y1 - 4, 4):
        atlas.put(x0 + 2, stitch, light)
        atlas.put(x1 - 3, stitch, light)


def paint_face(atlas, spec, fur, accent, ink):
    x0, y0, x1, y1 = FACE
    atlas.fill(FACE, fur, 0.12)
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    species, eyes = spec["species"], spec["eyes"]
    muzzle = accent if species != "sheep" else shade(fur, 1.25)

    # A lighter muzzle patch low on the face, where the snout sits.
    atlas.oval(cx, cy + 13, 13, 9, muzzle, FACE)
    if species == "fox":
        atlas.oval(cx - 16, cy + 9, 9, 10, muzzle, FACE)
        atlas.oval(cx + 16, cy + 9, 9, 10, muzzle, FACE)
    if species == "dog":
        atlas.oval(cx + 13, cy - 4, 10, 11, shade(fur, 0.7), FACE)

    white = (240, 234, 214)

    def eye(ex, ey, size=5.0, lid=0.0):
        """A big dark eye with one bright fleck: the whole of 'cute' at this resolution."""
        atlas.oval(ex, ey, size, size * 1.15, ink, FACE)
        atlas.oval(ex - size * 0.35, ey - size * 0.45, max(1.0, size * 0.3), max(1.0, size * 0.3), white, FACE)
        if lid > 0:
            for row in range(int(size * lid * 2)):
                atlas.line(ex - size, ey - size * 1.15 + row, ex + size, ey - size * 1.15 + row, shade(fur, 0.8))

    def blush(bx, by):
        atlas.oval(bx, by, 3.5, 2, mix(fur, (226, 120, 120), 0.55), FACE)

    left, right, level = cx - 13, cx + 13, cy - 1
    if eyes == "hollow":
        # No eyes: two pits, wider than eyes should be, and something has run down from them.
        for ex in (left, right):
            atlas.oval(ex, level, 7, 8, (4, 3, 3), FACE)
            atlas.oval(ex, level, 8.5, 9.5, shade(fur, 0.6), FACE)
            atlas.oval(ex, level, 7, 8, (4, 3, 3), FACE)
            atlas.line(ex - 1, level + 7, ex - 2, level + 16, (10, 8, 8))
            atlas.line(ex + 2, level + 7, ex + 2, level + 12, (10, 8, 8))
    elif eyes == "stitched":
        eye(left, level, 5.5)
        blush(left - 2, level + 9)
        # The other eye is sewn shut: a sunken lid and five dark stitches across it.
        atlas.oval(right, level, 6, 4, shade(fur, 0.72), FACE)
        atlas.line(right - 7, level, right + 7, level, shade(fur, 0.45))
        for stitch in range(-6, 7, 3):
            atlas.line(right + stitch - 1, level - 4, right + stitch + 1, level + 4, (40, 20, 16))
    elif eyes == "extra":
        eye(left, level, 5.5)
        eye(right, level, 5.5)
        # The ones that came later: smaller, never quite level, one of them shut.
        eye(cx + 1, level - 13, 3.6)
        eye(left - 9, level - 11, 2.8)
        eye(right + 8, level + 9, 2.6)
        atlas.line(cx - 12, level - 17, cx - 7, level - 16, ink)
        blush(left - 1, level + 10)
        blush(right, level + 10)
    elif eyes == "tired":
        eye(left, level, 5.0, lid=0.45)
        eye(right, level, 5.0, lid=0.45)
        for ex in (left, right):
            atlas.line(ex - 4, level + 7, ex + 4, level + 7, shade(fur, 0.62))
    else:
        eye(left, level, 5.8)
        eye(right, level, 5.8)
        blush(left - 3, level + 10)
        blush(right + 3, level + 10)

    # A small mouth under the snout. Everyone here smiles a little.
    my = cy + 18
    atlas.line(cx - 4, my, cx, my + 2, ink)
    atlas.line(cx, my + 2, cx + 4, my, ink)


# ---------------------------------------------------------------------------
# Geometry
# ---------------------------------------------------------------------------

def build_character(name, spec):
    """Facing -Y, feet on the ground, about 1.55 m to the ear tips before the game scales it."""
    species = spec["species"]
    hip, shoulder = 0.40, 0.76
    neck = 0.07 * spec.get("neck", 1.0)
    head_joint = (0, 0, 0.82 + neck)
    parts = []

    # Legs: short and stubby, in a boot too big for them.
    for side, label in ((-1, "leg-left"), (1, "leg-right")):
        leg = Part(label, (side * 0.1, 0, hip))
        leg.tube((side * 0.1, 0, 0.25), 0.07, 0.085, 0.3, TROUSERS, sides=6)
        leg.ball((side * 0.1, -0.035, 0.07), (0.09, 0.13, 0.075), BOOT, detail=1)
        parts.append(leg)

    # Torso: a smock that flares at the hem, with the neck on top.
    torso = Part("torso", (0, 0, hip))
    torso.tube((0, 0, 0.58), 0.25, 0.15, 0.42, CLOTH, sides=10)
    torso.ball((0, 0, 0.79), (0.16, 0.14, 0.06), CLOTH, detail=1)
    torso.tube((0, 0, 0.8 + neck / 2), 0.065, 0.06, neck + 0.08, FUR, sides=6)
    if spec.get("scarf"):
        torso.tube((0, 0, 0.82), 0.12, 0.1, 0.07, EXTRA, sides=8)
        torso.box((0.07, -0.11, 0.72), (0.07, 0.03, 0.2), EXTRA, rotate=(0.15, 0, 0.12))
    if spec.get("strap"):
        # A satchel on a strap across the chest, worn smooth.
        torso.box((0, -0.01, 0.62), (0.46, 0.34, 0.035), EXTRA, rotate=(0, 0.75, 0))
        torso.box((0.22, 0, 0.44), (0.1, 0.2, 0.17), EXTRA)
    missing = spec.get("missing_arm", 0)
    if missing:
        # What is left of the arm: a short stump, neatly bandaged.
        torso.tube((missing * 0.2, 0, 0.72), 0.045, 0.06, 0.1, WHITE, sides=6, rotate=(0, missing * 0.6, 0))
        torso.ball((missing * 0.225, 0, 0.675), (0.05, 0.05, 0.035), EXTRA, detail=1)
    parts.append(torso)

    # Arms: fur, with a mitten of a hand.
    for side, label in ((-1, "arm-left"), (1, "arm-right")):
        if side == missing:
            continue
        arm = Part(label, (side * 0.19, 0, shoulder))
        arm.tube((side * 0.2, 0, shoulder - 0.16), 0.045, 0.055, 0.3, FUR, sides=6)
        arm.ball((side * 0.2, 0, shoulder - 0.33), (0.065, 0.065, 0.065), ACCENT if species in ("cat", "fox", "rabbit") else FUR, detail=1)
        parts.append(arm)

    # Head: big, round and a little wide, with the face painted on the front.
    head = Part("head", head_joint)
    centre = Vector(head_joint) + Vector((0, 0, 0.21))
    head.ball(centre, (0.27, 0.235, 0.235), FUR, front=FACE, detail=2)
    add_species(head, species, centre, spec)
    parts.append(head)

    tail = build_tail(species)
    if tail:
        parts.append(tail)
    return parts


def add_species(head, species, c, spec):
    def ear(x, height, width, lean, back=0.0, region=FUR):
        tilt = -math.copysign(lean, x)
        head.tube((c.x + x, c.y + 0.02, c.z + 0.2 + height / 2 - abs(x) * 0.3), width, 0.012, height, region, sides=4, rotate=(back, tilt, 0))
        head.tube((c.x + x, c.y - 0.012, c.z + 0.19 + height / 2 - abs(x) * 0.3), width * 0.55, 0.008, height * 0.72, ACCENT, sides=4, rotate=(back, tilt, 0))

    def snout(length, width, height, drop=0.07, region=ACCENT):
        head.ball((c.x, c.y - 0.2 - length / 2, c.z - drop), (width, length, height), region, detail=1)
        head.ball((c.x, c.y - 0.2 - length * 1.35, c.z - drop + height * 0.35), (0.032, 0.026, 0.024), DARK, detail=1)

    if species == "cat":
        ear(-0.15, 0.17, 0.085, 0.2)
        ear(0.15, 0.17, 0.085, 0.2)
        snout(0.045, 0.075, 0.05)
        # Whiskers, as flat slivers.
        for side in (-1, 1):
            head.box((c.x + side * 0.2, c.y - 0.2, c.z - 0.07), (0.16, 0.004, 0.008), WHITE, rotate=(0, side * 0.12, 0))
    elif species == "rabbit":
        ear(-0.09, 0.4, 0.06, 0.08)
        # One ear has folded over and stayed that way.
        head.tube((c.x + 0.1, c.y + 0.02, c.z + 0.3), 0.06, 0.05, 0.2, FUR, sides=4, rotate=(0, -0.15, 0))
        head.tube((c.x + 0.19, c.y + 0.02, c.z + 0.36), 0.05, 0.012, 0.2, FUR, sides=4, rotate=(0, -1.9, 0))
        snout(0.035, 0.07, 0.05, drop=0.06)
        head.box((c.x, c.y - 0.265, c.z - 0.115), (0.045, 0.01, 0.05), WHITE)
    elif species == "fox":
        ear(-0.16, 0.2, 0.09, 0.28)
        ear(0.16, 0.2, 0.09, 0.28)
        snout(0.13, 0.075, 0.06, drop=0.06)
        for side in (-1, 1):
            head.tube((c.x + side * 0.25, c.y - 0.03, c.z - 0.07), 0.07, 0.01, 0.12, ACCENT, sides=4, rotate=(0, side * 1.9, 0))
    elif species == "dog":
        for side in (-1, 1):
            head.box((c.x + side * 0.27, c.y, c.z + 0.02), (0.06, 0.13, 0.24), ACCENT, rotate=(0, side * 0.3, 0))
        snout(0.1, 0.095, 0.075, drop=0.07, region=FUR)
        head.box((c.x + 0.03, c.y - 0.335, c.z - 0.13), (0.04, 0.01, 0.07), EXTRA)
    elif species == "goat":
        for side in (-1, 1):
            head.tube((c.x + side * 0.1, c.y + 0.06, c.z + 0.3), 0.045, 0.01, 0.3, BONE, sides=5, rotate=(-0.7, side * 0.25, 0))
            head.tube((c.x + side * 0.3, c.y + 0.02, c.z + 0.05), 0.05, 0.012, 0.16, FUR, sides=4, rotate=(0, side * 1.75, 0))
        snout(0.12, 0.085, 0.07, drop=0.06)
        head.tube((c.x, c.y - 0.2, c.z - 0.27), 0.012, 0.04, 0.15, WHITE, sides=4)
        # Half-moon spectacles on the end of his nose. Only one lens is any use to him.
        for side in (-1, 1):
            head.tube((c.x + side * 0.07, c.y - 0.285, c.z - 0.015), 0.045, 0.045, 0.008, BONE, sides=8, rotate=(math.pi / 2, 0, 0))
    elif species == "sheep":
        rng = random.Random(4)
        for index in range(13):
            angle = index / 13 * math.tau
            ring = 0.2 + rng.random() * 0.03
            head.ball((c.x + math.cos(angle) * ring, c.y + 0.02 + math.sin(index * 1.7) * 0.06, c.z + 0.12 + math.sin(angle) * 0.13 + 0.05), (0.09, 0.09, 0.085), WOOL, detail=1)
        head.ball((c.x, c.y + 0.03, c.z + 0.2), (0.2, 0.19, 0.12), WOOL, detail=1)
        for side in (-1, 1):
            head.tube((c.x + side * 0.29, c.y, c.z + 0.02), 0.045, 0.012, 0.13, FUR, sides=4, rotate=(0, side * 1.9, 0))
        snout(0.06, 0.08, 0.06, drop=0.07, region=FUR)


def build_tail(species):
    if species in ("goat", "sheep"):
        return None
    joint = (0, 0.14, 0.44)
    tail = Part("tail", joint)
    if species == "rabbit":
        tail.ball((0, 0.2, 0.46), (0.085, 0.085, 0.085), WHITE, detail=1)
    elif species == "dog":
        tail.tube((0, 0.22, 0.52), 0.045, 0.02, 0.24, FUR, sides=5, rotate=(-0.9, 0, 0))
    elif species == "fox":
        tail.tube((0, 0.3, 0.52), 0.05, 0.11, 0.38, FUR, sides=6, rotate=(-1.05, 0, 0))
        tail.ball((0, 0.5, 0.64), (0.11, 0.13, 0.11), ACCENT, detail=1)
    else:
        tail.tube((0, 0.24, 0.56), 0.04, 0.03, 0.3, FUR, sides=5, rotate=(-0.8, 0, 0))
        tail.tube((0, 0.38, 0.76), 0.03, 0.022, 0.24, FUR, sides=5, rotate=(-0.2, 0, 0))
        tail.ball((0, 0.41, 0.89), (0.035, 0.035, 0.035), FUR, detail=1)
    return tail


# ---------------------------------------------------------------------------
# The Hollow
# ---------------------------------------------------------------------------

HOLLOW = {
    # The walker: what most of them are. Grey, hunched, and wrapped in one of Mother Hollis's shawls.
    "hollow-walker": dict(skin=0x8D8C86, wrap=0x5A4A52, ears="droop", shawl=True),
    # The crawler: down on all fours, jaw hanging, in what is left of an apron.
    "hollow-crawler": dict(skin=0x7A6F66, wrap=0xA89E88, ears="none", jaw=True, rags=True),
    # The watcher: bone white and too tall, with two pinpricks of light a long way inside.
    "hollow-watcher": dict(skin=0xD6D2C8, wrap=0x2A2624, ears="twigs", pupils=True, collar=True),
    # Pell: the farmer before you. A walker, better dressed, and still wearing his hat.
    "pell": dict(skin=0x9A968C, wrap=0x5A4A52, ears="droop", shawl=True, hat=True, pupils=True),
}

SKIN, WRAP, PIT, NAIL, HOLLOW_FACE = (0, 0, 64, 64), (64, 0, 128, 64), (0, 64, 32, 96), (32, 64, 64, 96), (64, 64, 128, 128)


def paint_hollow(name, spec):
    atlas = Atlas(sum(ord(c) for c in name))
    skin, wrap = rgb(spec["skin"]), rgb(spec["wrap"])
    atlas.fill(SKIN, skin, 0.2)
    # Ribs and old bruises: thin dark bars across the skin.
    for y in range(8, 60, 7):
        atlas.line(14, y, 50, y, shade(skin, 0.74))
    for _ in range(5):
        atlas.oval(atlas.random.randrange(4, 60), atlas.random.randrange(4, 60), 3, 2, mix(skin, (70, 50, 70), 0.35), SKIN)
    # The wrap is knitted: rows of stitches, a few of them dropped.
    atlas.fill(WRAP, wrap, 0.14)
    for y in range(2, 64, 5):
        atlas.line(64, y, 127, y, shade(wrap, 0.72))
        for x in range(66 + (y % 2) * 3, 127, 6):
            atlas.put(x, y + 2, shade(wrap, 1.3))
    for _ in range(4):
        atlas.oval(atlas.random.randrange(70, 122), atlas.random.randrange(6, 58), 2.5, 3.5, (12, 10, 10), WRAP)
    atlas.fill(PIT, (5, 4, 4), 0.0)
    atlas.fill(NAIL, shade(skin, 0.5), 0.2)

    # The face: skin, and where a face should be, a hole.
    atlas.fill(HOLLOW_FACE, skin, 0.16)
    cx, cy = 96, 94
    atlas.oval(cx, cy, 17, 21, shade(skin, 0.62), HOLLOW_FACE)
    atlas.oval(cx, cy, 14.5, 18.5, (5, 4, 4), HOLLOW_FACE)
    # The rim has started to fray.
    for step in range(14):
        angle = step / 14 * math.tau
        atlas.line(cx + math.cos(angle) * 14, cy + math.sin(angle) * 18, cx + math.cos(angle) * 18.5, cy + math.sin(angle) * 23, (5, 4, 4))
    if spec.get("pupils"):
        for ex in (cx - 5, cx + 5):
            atlas.put(ex, cy - 3, (236, 230, 214))
            atlas.put(ex, cy - 2, (160, 156, 146))
    # Somebody sewed a smile under it. The stitches are neat. They did not hold.
    for stitch in range(-9, 10, 3):
        atlas.line(cx + stitch, cy + 25 + abs(stitch) * -0.25, cx + stitch + 1, cy + 28 + abs(stitch) * -0.25, (40, 22, 18))
    return atlas.image(f"{name}-atlas")


def build_hollow(name, spec):
    """Tall, thin and hunched, with arms that hang to the knee. The game's rig does the hunch."""
    hip, shoulder = 0.95, 1.6
    parts = []
    for side, label in ((-1, "leg-left"), (1, "leg-right")):
        leg = Part(label, (side * 0.1, 0, hip))
        leg.tube((side * 0.1, 0, 0.52), 0.045, 0.06, 0.86, SKIN, sides=5)
        leg.ball((side * 0.1, 0, 0.5), (0.065, 0.065, 0.06), SKIN, detail=1)
        leg.ball((side * 0.1, -0.05, 0.045), (0.07, 0.14, 0.045), SKIN, detail=1)
        parts.append(leg)

    torso = Part("torso", (0, 0, hip))
    torso.tube((0, 0, 1.3), 0.1, 0.17, 0.72, SKIN, sides=7)
    torso.ball((0, 0, 0.98), (0.14, 0.11, 0.1), SKIN, detail=1)
    torso.tube((0, 0, 1.72), 0.05, 0.045, 0.16, SKIN, sides=5)
    if spec.get("shawl"):
        torso.tube((0, 0, 1.5), 0.33, 0.13, 0.36, WRAP, sides=9)
        torso.box((0.1, -0.2, 1.3), (0.1, 0.03, 0.3), WRAP, rotate=(0.1, 0, 0.1))
    if spec.get("rags"):
        torso.tube((0, 0, 1.08), 0.2, 0.13, 0.3, WRAP, sides=7)
        torso.box((0, -0.13, 1.36), (0.2, 0.02, 0.34), WRAP)
    if spec.get("collar"):
        torso.tube((0, 0, 1.64), 0.2, 0.09, 0.1, WRAP, sides=8)
    parts.append(torso)

    for side, label in ((-1, "arm-left"), (1, "arm-right")):
        arm = Part(label, (side * 0.21, 0, shoulder))
        arm.tube((side * 0.21, 0, 1.1), 0.028, 0.04, 1.0, SKIN, sides=5)
        arm.ball((side * 0.21, 0, 1.12), (0.045, 0.045, 0.045), SKIN, detail=1)
        arm.ball((side * 0.21, 0, 0.58), (0.05, 0.04, 0.07), SKIN, detail=1)
        # Fingers a joint too long.
        for finger in (-1, 0, 1):
            arm.box((side * 0.21 + finger * 0.03, -0.01, 0.46), (0.014, 0.014, 0.17), NAIL, rotate=(0.1, finger * 0.12, 0))
        parts.append(arm)

    head_joint = (0, -0.03, 1.78)
    head = Part("head", head_joint)
    c = Vector(head_joint) + Vector((0, 0, 0.2))
    head.ball(c, (0.2, 0.19, 0.24), SKIN, front=HOLLOW_FACE, detail=2)
    ears = spec.get("ears")
    if ears == "droop":
        # They were somebody's neighbours. The ears are still there; one is torn.
        head.tube((c.x - 0.2, c.y, c.z + 0.02), 0.055, 0.015, 0.3, SKIN, sides=4, rotate=(0, 2.6, 0))
        head.tube((c.x + 0.19, c.y, c.z + 0.08), 0.055, 0.03, 0.15, SKIN, sides=4, rotate=(0, -2.5, 0))
    elif ears == "twigs":
        for side in (-1, 1):
            head.tube((c.x + side * 0.1, c.y, c.z + 0.34), 0.018, 0.006, 0.34, NAIL, sides=4, rotate=(0, side * 0.35, 0))
            head.tube((c.x + side * 0.2, c.y, c.z + 0.4), 0.012, 0.004, 0.2, NAIL, sides=4, rotate=(0, side * 1.2, 0))
    if spec.get("jaw"):
        head.box((c.x, c.y - 0.1, c.z - 0.27), (0.17, 0.14, 0.06), SKIN, rotate=(-0.5, 0, 0.1))
    if spec.get("hat"):
        head.tube((c.x, c.y, c.z + 0.2), 0.34, 0.34, 0.025, WRAP, sides=10)
        head.tube((c.x, c.y, c.z + 0.31), 0.18, 0.15, 0.2, WRAP, sides=8)
    parts.append(head)
    return parts


# ---------------------------------------------------------------------------
# Export
# ---------------------------------------------------------------------------

def export(name, spec):
    collection = new_scene()
    material = material_for(name, paint(name, spec))
    for part in build_character(name, spec):
        part.build(material, collection)
    export_glb("folk", name)


for folk_name, folk_spec in FOLK.items():
    export(folk_name, folk_spec)

for hollow_name, hollow_spec in HOLLOW.items():
    collection = new_scene()
    hollow_material = material_for(hollow_name, paint_hollow(hollow_name, hollow_spec))
    for hollow_part in build_hollow(hollow_name, hollow_spec):
        hollow_part.build(hollow_material, collection)
    export_glb("folk", hollow_name)
