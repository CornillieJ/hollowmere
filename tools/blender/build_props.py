"""
Builds the things of Hollowveil that are not people: the fire and the pot, the
store's stall, the chapel and the shrine, the clutter of the farmyard, the
crops in the field and the tools in the farmer's hand.

    blender -b -P tools/blender/build_props.py

Writes one GLB per prop into static/models/props/. Each is original: shapes
from the primitives in lowpoly.py, textures painted pixel by pixel. Parts whose
name starts with "glow" are made to shine by the game; a crop's "ripe" part is
shown only once it can be picked.

All props stand on the ground at the origin and face -Y (the game's +z).
"""
import math
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lowpoly import Atlas, Part, cell, export_glb, material_for, mix, new_scene, shade  # noqa: E402

A, B, C, D = cell(0, 0, 2, 2), cell(2, 0, 2, 2), cell(0, 2, 2, 2), cell(2, 2, 2, 2)
WOOD, OLD_WOOD, BARK = (112, 86, 58), (78, 64, 50), (58, 46, 38)
STONE, IRON = (104, 100, 94), (34, 32, 31)
QUARTER = math.pi / 2


def fire(atlas, region):
    """Dark red at the bottom rising to a pale yellow tip."""
    x0, y0, x1, y1 = region
    for y in range(y0, y1):
        t = (y - y0) / (y1 - y0)
        for x in range(x0, x1):
            atlas.put(x, y, mix((255, 236, 150), (226, 84, 24), min(1.0, t * 1.2 + atlas.random.random() * 0.15)))


def glow(atlas, region, color=(255, 222, 150)):
    atlas.fill(region, color, 0.05)


def face(atlas, region, ink=(20, 14, 12), smile=True, eyes="buttons"):
    """A stitched face for anything that should not have one."""
    x0, y0, x1, y1 = region
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    if eyes == "buttons":
        for ex in (cx - 11, cx + 11):
            atlas.oval(ex, cy - 6, 4, 4, ink, region)
            atlas.put(ex - 1, cy - 7, (200, 190, 170))
            atlas.put(ex + 1, cy - 5, (200, 190, 170))
    else:
        for ex in (cx - 12, cx + 12):
            for row in range(9):
                atlas.line(ex - row * 0.55, cy - 10 + row, ex + row * 0.55, cy - 10 + row, ink)
    if smile:
        for step in range(-14, 15):
            y = cy + 12 - (step * step) / 28
            atlas.put(cx + step, y, ink)
            if step % 4 == 0:
                atlas.line(cx + step, y - 2, cx + step, y + 2, ink)


def hearth():
    def paint(atlas):
        atlas.stone(A, STONE)
        atlas.fill(B, IRON, 0.25)
        fire(atlas, C)
        atlas.wood(D, BARK, 3)

    def build():
        base = Part("hearth", (0, 0, 0))
        for index in range(9):
            angle = index / 9 * math.tau
            base.box((math.cos(angle) * 0.62, math.sin(angle) * 0.62, 0.12), (0.3, 0.36, 0.22 + (index % 3) * 0.04), A, rotate=(0, 0, angle))
        for turn in (0.4, 2.0):
            base.tube((0, 0, 0.12), 0.07, 0.07, 0.8, D, sides=6, rotate=(QUARTER, 0, turn))
        for index in range(3):
            angle = index / 3 * math.tau + 0.5
            base.tube((math.cos(angle) * 0.27, math.sin(angle) * 0.27, 0.95), 0.025, 0.025, 2.0, B, sides=4, rotate=(math.sin(angle) * 0.3, -math.cos(angle) * 0.3, 0))
        base.tube((0, 0, 1.45), 0.012, 0.012, 0.75, B, sides=4)
        pot = Part("pot", (0, 0, 1.0))
        pot.ball((0, 0, 1.0), (0.36, 0.36, 0.3), B, detail=2)
        pot.tube((0, 0, 1.2), 0.3, 0.33, 0.07, B, sides=10)
        # Whatever is in it is an unwholesome green, and looks back.
        pot.tube((0, 0, 1.225), 0.27, 0.27, 0.02, C, sides=10)
        flame = Part("glow-flame", (0, 0, 0.1))
        flame.tube((0, 0, 0.42), 0.24, 0.02, 0.62, C, sides=5)
        flame.tube((0.08, 0.05, 0.3), 0.12, 0.01, 0.4, C, sides=4)
        return [base, pot, flame]

    return paint, build


def workbench():
    def paint(atlas):
        atlas.wood(A, WOOD, 5)
        atlas.fill(B, IRON, 0.3)
        atlas.wood(C, BARK, 2)
        atlas.fill(D, (150, 150, 146), 0.2)

    def build():
        part = Part("workbench", (0, 0, 0))
        part.box((0, 0, 0.85), (1.8, 0.8, 0.12), A)
        for x in (-0.8, 0.8):
            for y in (-0.32, 0.32):
                part.box((x, y, 0.4), (0.1, 0.1, 0.8), A)
        part.box((0, 0, 0.25), (1.6, 0.6, 0.05), A)
        part.box((-0.7, -0.3, 0.98), (0.2, 0.22, 0.16), B)
        part.tube((0.25, 0.05, 1.03), 0.12, 0.12, 0.9, C, sides=6, rotate=(0, QUARTER, 0))
        # A saw left in the cut, and a mallet.
        part.box((0.3, -0.05, 1.2), (0.5, 0.012, 0.16), D, rotate=(0, 0.25, 0.3))
        part.box((-0.25, 0.2, 0.96), (0.2, 0.1, 0.1), C)
        part.tube((-0.25, 0.05, 0.96), 0.02, 0.02, 0.3, A, sides=4, rotate=(QUARTER, 0, 0))
        return [part]

    return paint, build


def chest():
    def paint(atlas):
        atlas.wood(A, OLD_WOOD, 4)
        atlas.fill(B, (150, 126, 70), 0.25)
        atlas.wood(C, shade(OLD_WOOD, 0.8), 4)
        # The lock plate has a keyhole shaped a little like an eye.
        atlas.fill(D, (170, 144, 80), 0.2)
        atlas.oval(96 + 16, 64 + 14, 9, 6, (20, 16, 12), D)
        atlas.oval(96 + 16, 64 + 14, 3, 3, (170, 144, 80), D)

    def build():
        part = Part("chest", (0, 0, 0))
        part.box((0, 0, 0.35), (1.3, 0.8, 0.7), A)
        part.tube((0, 0, 0.7), 0.42, 0.42, 1.34, C, sides=8, rotate=(0, QUARTER, 0))
        for x in (-0.5, 0.5):
            part.box((x, 0, 0.36), (0.09, 0.84, 0.74), B)
            part.tube((x, 0, 0.7), 0.44, 0.44, 0.09, B, sides=8, rotate=(0, QUARTER, 0))
        part.box((0, -0.42, 0.62), (0.2, 0.05, 0.24), D)
        return [part]

    return paint, build


def mailbox():
    def paint(atlas):
        atlas.wood(A, OLD_WOOD, 2)
        atlas.fill(B, (96, 110, 104), 0.25)
        atlas.fill(C, (170, 60, 50), 0.15)
        atlas.fill(D, (20, 18, 18), 0.0)

    def build():
        part = Part("mailbox", (0, 0, 0))
        part.box((0, 0, 0.55), (0.1, 0.1, 1.1), A)
        part.box((0, 0, 1.2), (0.3, 0.48, 0.2), B)
        part.tube((0, 0, 1.3), 0.15, 0.15, 0.48, B, sides=8, rotate=(QUARTER, 0, 0))
        part.box((0, -0.245, 1.28), (0.2, 0.01, 0.03), D)
        part.box((0.17, -0.1, 1.38), (0.02, 0.03, 0.2), C)
        part.box((0.17, -0.1, 1.5), (0.02, 0.12, 0.08), C)
        return [part]

    return paint, build


def postcrate():
    def paint(atlas):
        atlas.wood(A, WOOD, 4)
        atlas.wood(B, OLD_WOOD, 2)
        # The sign: a coin and an arrow into the box, painted by someone in a hurry.
        atlas.fill(C, (206, 196, 170), 0.12)
        atlas.oval(20, 96, 9, 9, (196, 164, 84), C)
        atlas.oval(20, 96, 5, 5, (150, 120, 60), C)
        atlas.line(34, 96, 54, 96, (60, 30, 26))
        atlas.line(54, 96, 48, 90, (60, 30, 26))
        atlas.line(54, 96, 48, 102, (60, 30, 26))
        atlas.fill(D, (20, 18, 18), 0.0)

    def build():
        part = Part("postcrate", (0, 0, 0))
        part.box((0, 0, 0.36), (1.1, 0.8, 0.72), A)
        part.box((0, 0.05, 0.76), (1.16, 0.74, 0.08), B, rotate=(-0.12, 0, 0))
        part.box((0, -0.33, 0.7), (0.5, 0.06, 0.03), D)
        part.box((0.75, 0, 0.75), (0.08, 0.08, 1.5), B)
        part.box((0.75, -0.06, 1.3), (0.62, 0.03, 0.4), C)
        return [part]

    return paint, build


def stall():
    def paint(atlas):
        atlas.wood(A, WOOD, 5)
        atlas.stripes(B, (150, 52, 44), (214, 204, 180), 8)
        atlas.fill(C, (96, 132, 78), 0.3)
        for _ in range(14):
            atlas.oval(atlas.random.randrange(4, 60), atlas.random.randrange(68, 124), 3, 3, (226, 220, 206), C)
        glow(atlas, D)

    def build():
        part = Part("stall", (0, 0, 0))
        part.box((0, 0, 0.47), (2.0, 0.7, 0.94), A)
        part.box((0, -0.05, 0.96), (2.2, 0.9, 0.06), A)
        for x in (-1.0, 1.0):
            for y, height in ((-0.4, 2.1), (0.5, 2.5)):
                part.box((x, y, height / 2), (0.09, 0.09, height), A)
        part.box((0, 0.02, 2.36), (2.5, 1.25, 0.05), B, rotate=(0.42, 0, 0))
        part.box((0, -0.56, 2.02), (2.5, 0.03, 0.2), B)
        # What is for sale: a crate of turnips, a sack, a jar of something pale.
        part.box((-0.6, -0.05, 1.1), (0.5, 0.4, 0.22), A)
        for index in range(5):
            part.ball((-0.75 + index * 0.075, -0.08 + (index % 2) * 0.1, 1.24), (0.07, 0.07, 0.06), C, detail=1)
        part.ball((0.15, 0, 1.16), (0.2, 0.17, 0.2), C, detail=1)
        part.tube((0.7, 0, 1.13), 0.09, 0.09, 0.26, C, sides=7)
        lamp = Part("glow-lamp", (0.95, -0.42, 1.8))
        lamp.box((0.95, -0.42, 1.8), (0.14, 0.14, 0.2), D)
        return [part, lamp]

    return paint, build


def lectern():
    def paint(atlas):
        atlas.wood(A, OLD_WOOD, 3)
        atlas.fill(B, (222, 212, 188), 0.1)
        for y in range(6, 60, 5):
            atlas.line(70, y, 122, y, (90, 80, 70))
        # Some lines are crossed out, in a different ink.
        atlas.line(70, 21, 110, 21, (120, 40, 36))
        atlas.line(70, 41, 96, 41, (120, 40, 36))
        atlas.fill(C, (30, 58, 42), 0.15)
        atlas.fill(D, (150, 126, 70), 0.2)

    def build():
        part = Part("lectern", (0, 0, 0))
        part.box((0, 0, 0.05), (0.6, 0.6, 0.1), A)
        part.box((0, 0, 0.55), (0.2, 0.2, 1.0), A)
        part.box((0, -0.03, 1.1), (0.7, 0.5, 0.06), A, rotate=(0.4, 0, 0))
        part.box((0, -0.05, 1.15), (0.6, 0.4, 0.04), C, rotate=(0.4, 0, 0))
        part.box((-0.145, -0.06, 1.18), (0.27, 0.36, 0.03), B, rotate=(0.4, 0, 0))
        part.box((0.145, -0.06, 1.18), (0.27, 0.36, 0.03), B, rotate=(0.4, 0, 0))
        part.box((0.3, -0.2, 1.2), (0.03, 0.03, 0.2), D, rotate=(0.4, 0.3, 0))
        return [part]

    return paint, build


def chapel():
    def paint(atlas):
        atlas.stone(A, (74, 70, 64))
        atlas.fill(B, (36, 34, 34), 0.3)
        for y in range(0, 64, 6):
            atlas.line(64, y, 127, y, (22, 20, 20))
        # The front: stone, an arched door standing a hand open, and a round window.
        atlas.stone(C, (74, 70, 64))
        atlas.oval(32, 110, 9, 14, (44, 34, 28), C)
        for y in range(108, 128):
            atlas.line(23, y, 41, y, (44, 34, 28))
        atlas.line(38, 100, 38, 127, (6, 5, 5))
        atlas.line(39, 100, 39, 127, (6, 5, 5))
        atlas.oval(32, 80, 6, 6, (255, 214, 140), C)
        atlas.line(32, 74, 32, 86, (60, 50, 40))
        atlas.line(26, 80, 38, 80, (60, 50, 40))
        glow(atlas, D)

    def build():
        part = Part("chapel", (0, 0, 0))
        part.box((0, 0, 1.6), (4.0, 3.0, 3.2), A)
        for wall in part.bm.faces:
            pass
        part.tube((0, 0, 4.1), 2.95, 0.05, 1.9, B, sides=4, rotate=(0, 0, math.pi / 4))
        part.box((0, -0.9, 5.0), (0.7, 0.7, 1.1), A)
        part.tube((0, -0.9, 5.85), 0.62, 0.02, 0.7, B, sides=4, rotate=(0, 0, math.pi / 4))
        part.box((0, -0.9, 6.45), (0.06, 0.06, 0.6), B)
        part.box((0, -0.9, 6.55), (0.34, 0.06, 0.06), B)
        front = Part("front", (0, -1.5, 0))
        front.box((0, -1.51, 1.6), (4.0, 0.02, 3.2), C)
        window = Part("glow-window", (0, -1.53, 1.98))
        window.tube((0, -1.53, 1.98), 0.36, 0.36, 0.02, D, sides=10, rotate=(QUARTER, 0, 0))
        candle = Part("glow-candle", (0.9, -1.9, 0.15))
        candle.box((0.9, -1.9, 0.15), (0.12, 0.12, 0.3), D)
        return [part, front, window, candle]

    return paint, build


def shrine():
    def paint(atlas):
        atlas.stone(A, (62, 60, 58))
        # Carved down the pillar: eyes, all open, none of them a pair.
        for y in (12, 30, 48):
            atlas.oval(32 + (y % 9) - 4, y, 8, 4.5, (24, 22, 22), A)
            atlas.oval(32 + (y % 9) - 4, y, 2.5, 2.5, (150, 144, 132), A)
        atlas.fill(B, (236, 226, 196), 0.1)
        glow(atlas, C, (255, 214, 130))
        atlas.fill(D, (120, 60, 52), 0.3)

    def build():
        part = Part("shrine", (0, 0, 0))
        part.tube((0, 0, 0.12), 1.5, 1.35, 0.24, A, sides=8)
        part.tube((0, 0, 0.36), 1.0, 0.9, 0.24, A, sides=8)
        part.tube((0, 0, 2.0), 0.72, 0.45, 3.1, A, sides=5)
        part.ball((0, 0, 3.6), (0.5, 0.5, 0.34), A, detail=1)
        for index in range(7):
            angle = index / 7 * math.tau
            height = 0.2 + (index % 3) * 0.09
            part.box((math.cos(angle) * 1.15, math.sin(angle) * 1.15, 0.24 + height / 2), (0.09, 0.09, height), B)
        # Offerings: a bowl of something, and a small shawl, folded.
        part.tube((0.5, -0.7, 0.54), 0.12, 0.2, 0.12, D, sides=7)
        part.box((-0.55, -0.6, 0.52), (0.34, 0.26, 0.08), D)
        flames = Part("glow-candles", (0, 0, 0.5))
        for index in range(7):
            angle = index / 7 * math.tau
            height = 0.2 + (index % 3) * 0.09
            flames.tube((math.cos(angle) * 1.15, math.sin(angle) * 1.15, 0.3 + height), 0.035, 0.005, 0.1, C, sides=4)
        return [part, flames]

    return paint, build


def scarecrow():
    def paint(atlas):
        atlas.wood(A, OLD_WOOD, 2)
        atlas.fill(B, (46, 42, 40), 0.25)
        for x in (76, 96, 116):
            atlas.oval(x, 30, 2.5, 2.5, (150, 126, 70), B)
        # A sack for a head, and a smile somebody sewed onto it.
        atlas.fill(C, (160, 140, 96), 0.25)
        face(atlas, C)
        atlas.fill(D, (150, 126, 60), 0.3)

    def build():
        part = Part("scarecrow", (0, 0, 0))
        part.box((0, 0, 1.15), (0.1, 0.1, 2.3), A)
        part.box((0, 0, 1.7), (1.8, 0.08, 0.08), A)
        part.tube((0, 0, 1.32), 0.4, 0.22, 0.9, B, sides=7)
        for side in (-1, 1):
            part.tube((side * 0.62, 0, 1.68), 0.1, 0.13, 0.56, B, sides=5, rotate=(0, QUARTER, 0))
            for straw in range(3):
                part.box((side * 0.95, (straw - 1) * 0.03, 1.66), (0.2, 0.012, 0.012), D, rotate=(0, (straw - 1) * 0.3, 0))
        part.ball((0, 0, 2.12), (0.24, 0.22, 0.26), D, front=C, detail=2)
        part.tube((0, 0, 2.34), 0.44, 0.44, 0.03, D, sides=9)
        part.tube((0, 0, 2.46), 0.22, 0.16, 0.22, D, sides=7)
        return [part]

    return paint, build


def crate():
    def paint(atlas):
        atlas.wood(A, WOOD, 4)
        atlas.wood(B, OLD_WOOD, 1)
        atlas.fill(C, (0, 0, 0))
        atlas.fill(D, (0, 0, 0))

    def build():
        part = Part("crate", (0, 0, 0))
        part.box((0, 0, 0.35), (0.8, 0.8, 0.7), A)
        for x in (-0.36, 0.36):
            for y in (-0.36, 0.36):
                part.box((x, y, 0.35), (0.1, 0.1, 0.74), B)
        part.box((0, -0.41, 0.35), (0.9, 0.03, 0.1), B, rotate=(0, 0.72, 0))
        return [part]

    return paint, build


def woodpile():
    def paint(atlas):
        atlas.wood(A, BARK, 3)
        # Cut ends: pale, with rings.
        atlas.fill(B, (176, 150, 110), 0.15)
        for radius in (26, 19, 12, 6):
            for step in range(60):
                angle = step / 60 * math.tau
                atlas.put(96 + math.cos(angle) * radius, 32 + math.sin(angle) * radius, (120, 96, 66))
        atlas.fill(C, (0, 0, 0))
        atlas.fill(D, (0, 0, 0))

    def build():
        part = Part("woodpile", (0, 0, 0))
        for row in range(3):
            for index in range(5 - row):
                x = (index - (4 - row) / 2) * 0.3
                z = 0.15 + row * 0.26
                part.tube((x, 0, z), 0.14, 0.14, 1.5, A, sides=7, rotate=(QUARTER, 0, 0), front=B)
        return [part]

    return paint, build


def trough():
    def paint(atlas):
        atlas.wood(A, OLD_WOOD, 5)
        atlas.fill(B, (22, 30, 28), 0.3)
        atlas.fill(C, (0, 0, 0))
        atlas.fill(D, (0, 0, 0))

    def build():
        part = Part("trough", (0, 0, 0))
        part.box((0, 0, 0.3), (2.2, 0.7, 0.14), A)
        for y in (-0.3, 0.3):
            part.box((0, y, 0.45), (2.2, 0.1, 0.36), A)
        for x in (-1.05, 1.05):
            part.box((x, 0, 0.45), (0.1, 0.7, 0.36), A)
            part.box((x * 0.8, 0, 0.13), (0.14, 0.6, 0.26), A)
        part.box((0, 0, 0.56), (2.0, 0.5, 0.02), B)
        return [part]

    return paint, build


def stone():
    def paint(atlas):
        atlas.stone(A, (82, 78, 74))
        # A spiral cut into the face of it, worn nearly smooth.
        for step in range(90):
            angle = step / 90 * math.tau * 2.6
            radius = 2 + step * 0.2
            atlas.put(32 + math.cos(angle) * radius, 26 + math.sin(angle) * radius, (40, 38, 36))
        atlas.stone(B, (70, 68, 64))
        atlas.fill(C, (0, 0, 0))
        atlas.fill(D, (0, 0, 0))

    def build():
        part = Part("stone", (0, 0, 0))
        part.tube((0, 0, 1.5), 0.52, 0.36, 3.0, B, sides=5, rotate=(0.04, 0.05, 0.3), front=A)
        part.ball((0, 0, 3.0), (0.36, 0.3, 0.2), B, detail=1)
        return [part]

    return paint, build


def mushrooms():
    def paint(atlas):
        atlas.fill(A, (212, 204, 182), 0.15)
        for _ in range(12):
            atlas.oval(atlas.random.randrange(4, 60), atlas.random.randrange(4, 60), 2.5, 2.5, (150, 164, 140), A)
        atlas.fill(B, (160, 154, 138), 0.2)
        glow(atlas, C, (190, 214, 180))
        atlas.fill(D, (0, 0, 0))

    def build():
        rng = random.Random(3)
        part = Part("mushrooms", (0, 0, 0))
        for index in range(5):
            x, y = (rng.random() - 0.5) * 0.5, (rng.random() - 0.5) * 0.5
            height = 0.14 + rng.random() * 0.2
            part.tube((x, y, height / 2), 0.035, 0.025, height, B, sides=5)
            part.tube((x, y, height + 0.03), 0.1 + rng.random() * 0.05, 0.02, 0.08, A, sides=7)
        # One of them has a faint light under the cap.
        gills = Part("glow-gills", (0, 0, 0.3))
        gills.tube((0.02, 0, 0.3), 0.07, 0.07, 0.01, C, sides=7)
        return [part, gills]

    return paint, build


def shed():
    def paint(atlas):
        atlas.wood(A, OLD_WOOD, 6)
        atlas.fill(B, (40, 36, 34), 0.3)
        # The front: planks, a door on a slant, and a knot-hole at eye height.
        atlas.wood(C, OLD_WOOD, 6)
        for y in range(84, 128):
            atlas.line(24, y, 42, y, shade(OLD_WOOD, 0.7 + 0.08 * ((y // 3) % 2)))
        atlas.line(24, 84, 42, 84, (30, 24, 20))
        atlas.oval(39, 106, 1.5, 1.5, (150, 126, 70), C)
        atlas.oval(33, 92, 2, 2, (8, 6, 6), C)
        atlas.fill(D, (0, 0, 0))

    def build():
        part = Part("shed", (0, 0, 0))
        part.box((0, 0, 1.1), (3.0, 2.4, 2.2), A)
        part.box((0, -0.35, 2.45), (3.3, 1.9, 0.08), B, rotate=(0.42, 0, 0))
        part.box((0, 0.85, 2.3), (3.3, 1.1, 0.08), B, rotate=(-0.5, 0, 0))
        front = Part("front", (0, -1.2, 0))
        front.box((0, -1.21, 1.1), (3.0, 0.02, 2.2), C)
        return [part, front]

    return paint, build


def crop(kind):
    green = (86, 124, 74)

    def paint(atlas):
        atlas.fill(A, green, 0.25)
        for x in range(4, 64, 8):
            atlas.line(x, 0, x, 63, shade(green, 0.7))
        if kind == "turnip":
            for y in range(0, 64):
                for x in range(64, 128):
                    atlas.put(x, y, mix((150, 86, 130), (236, 230, 214), min(1.0, y / 34)))
        elif kind == "wheat":
            atlas.fill(B, (206, 170, 84), 0.25)
            for y in range(2, 64, 4):
                atlas.line(64, y, 127, y, (150, 116, 50))
        elif kind == "corn":
            atlas.fill(B, (226, 190, 72), 0.1)
            for y in range(0, 64, 4):
                atlas.line(64, y, 127, y, (176, 140, 44))
            for x in range(64, 128, 4):
                atlas.line(x, 0, x, 63, (176, 140, 44))
        else:
            atlas.fill(B, (206, 110, 40), 0.15)
            for x in range(64, 128, 9):
                atlas.line(x, 0, x, 63, (150, 70, 26))
        # The pumpkins here grow faces on their own.
        atlas.fill(C, (206, 110, 40), 0.15)
        face(atlas, C, ink=(30, 14, 8), eyes="triangles")
        atlas.fill(D, (120, 96, 52), 0.25)

    def build():
        rng = random.Random(len(kind))
        plant = Part("plant", (0, 0, 0))
        ripe = Part("ripe", (0, 0, 0))
        if kind == "turnip":
            for index in range(6):
                angle = index / 6 * math.tau
                plant.box((math.cos(angle) * 0.07, math.sin(angle) * 0.07, 0.22), (0.07, 0.012, 0.42), A, rotate=(-math.sin(angle) * 0.45, math.cos(angle) * 0.45, angle))
            ripe.ball((0, 0, 0.02), (0.11, 0.11, 0.1), B, detail=1)
        elif kind == "wheat":
            for index in range(8):
                x, y = (rng.random() - 0.5) * 0.4, (rng.random() - 0.5) * 0.4
                lean = ((rng.random() - 0.5) * 0.25, (rng.random() - 0.5) * 0.25, 0)
                plant.tube((x, y, 0.45), 0.012, 0.01, 0.9, A, sides=3, rotate=lean)
                ripe.ball((x - lean[1] * 0.5, y + lean[0] * 0.5, 0.98), (0.03, 0.03, 0.12), B, detail=1)
        elif kind == "corn":
            plant.tube((0, 0, 0.8), 0.035, 0.025, 1.6, A, sides=5)
            for index in range(6):
                angle = index * 2.4
                z = 0.4 + index * 0.2
                plant.box((math.cos(angle) * 0.2, math.sin(angle) * 0.2, z), (0.46, 0.07, 0.012), A, rotate=(0, 0.5, angle))
            for index, z in enumerate((0.75, 1.1)):
                angle = 1.0 + index * 2.6
                ripe.ball((math.cos(angle) * 0.09, math.sin(angle) * 0.09, z), (0.055, 0.055, 0.16), B, detail=1)
        else:
            for index in range(5):
                angle = index / 5 * math.tau + 0.3
                plant.tube((math.cos(angle) * 0.2, math.sin(angle) * 0.2, 0.06), 0.012, 0.012, 0.42, A, sides=3, rotate=(0, QUARTER, angle))
                plant.box((math.cos(angle) * 0.4, math.sin(angle) * 0.4, 0.14), (0.24, 0.24, 0.012), A, rotate=(0.25, 0.2, angle))
            ripe.ball((0, 0, 0.24), (0.34, 0.32, 0.26), B, front=C, detail=2)
            ripe.tube((0, 0, 0.53), 0.035, 0.02, 0.12, D, sides=5, rotate=(0.2, 0.2, 0))
        return [plant, ripe]

    return paint, build


def tool(kind):
    """Held things, built in the hand's own space: the grip at the origin, the business end along -Y."""

    def paint(atlas):
        atlas.wood(A, WOOD, 2)
        atlas.fill(B, (150, 152, 150), 0.25)
        atlas.line(66, 40, 126, 40, (226, 226, 220))
        atlas.fill(C, (104, 124, 122), 0.25)
        glow(atlas, D, (255, 226, 150))

    def build():
        part = Part(kind, (0, 0, 0))
        extra = []
        if kind == "axe":
            part.tube((0, -0.26, 0), 0.02, 0.024, 0.64, A, sides=5, rotate=(QUARTER, 0, 0))
            part.box((0, -0.52, -0.045), (0.035, 0.13, 0.2), B)
            part.box((0, -0.52, -0.15), (0.012, 0.16, 0.04), B)
        elif kind == "watering-can":
            part.tube((0, -0.06, -0.1), 0.1, 0.09, 0.18, C, sides=8)
            part.tube((0, -0.24, -0.06), 0.03, 0.018, 0.28, C, sides=5, rotate=(1.1, 0, 0))
            part.tube((0, -0.36, 0.0), 0.02, 0.045, 0.04, C, sides=6, rotate=(1.1, 0, 0))
            part.box((0, 0.03, -0.02), (0.02, 0.1, 0.03), C)
        else:
            part.tube((0, -0.04, -0.07), 0.03, 0.026, 0.16, D, sides=6)
            part.tube((0, -0.04, -0.17), 0.06, 0.05, 0.03, B, sides=7)
            flame = Part("glow-flame", (0, -0.04, 0.03))
            flame.tube((0, -0.04, 0.045), 0.016, 0.002, 0.06, D, sides=4)
            extra.append(flame)
        return [part] + extra

    return paint, build


PROPS = {
    "hearth": hearth(),
    "workbench": workbench(),
    "chest": chest(),
    "mailbox": mailbox(),
    "postcrate": postcrate(),
    "stall": stall(),
    "lectern": lectern(),
    "chapel": chapel(),
    "shrine": shrine(),
    "scarecrow": scarecrow(),
    "crate": crate(),
    "woodpile": woodpile(),
    "trough": trough(),
    "stone": stone(),
    "mushrooms": mushrooms(),
    "shed": shed(),
    "crop-turnip": crop("turnip"),
    "crop-wheat": crop("wheat"),
    "crop-corn": crop("corn"),
    "crop-pumpkin": crop("pumpkin"),
    "tool-axe": tool("axe"),
    "tool-watering-can": tool("watering-can"),
    "tool-candle": tool("candle"),
}

only = os.environ.get("PROP_ONLY")
for prop_name, (paint_prop, build_prop) in PROPS.items():
    if only and prop_name not in only.split(","):
        continue
    collection = new_scene()
    prop_atlas = Atlas(sum(ord(c) for c in prop_name))
    paint_prop(prop_atlas)
    prop_material = material_for(prop_name, prop_atlas.image(f"{prop_name}-atlas"))
    for prop_part in build_prop():
        prop_part.build(prop_material, collection)
    export_glb("props", prop_name)
