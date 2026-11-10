import * as THREE from 'three';

import type { Terrain } from '../kit';
import { MERE_LEVEL, PLACES } from '../content/world';
import { MODELS, haystack, solid, type ModelEntry } from './world';

/**
 * The places off the road: the mere, the lookout, the standing stones, the
 * ruined farm and the graveyard. Each is a short walk down a footpath, each has
 * one of the Hollow who never leaves it, and most have something to bring home.
 */
export type PlaceSpots = {
    /** Mushroom clusters, for foraging. */
    mushrooms: THREE.Object3D[];
    /** The seed crate in the ruin. */
    crate: THREE.Object3D;
};

type Builder = {
    root: THREE.Object3D;
    terrain: Terrain;
    solids: THREE.Box3[];
    add: (entry: ModelEntry, fallback: () => THREE.Object3D, at: { x: number; z: number; yaw?: number }, collide?: boolean) => void;
    random: () => number;
};

const STONE = new THREE.MeshStandardMaterial({ color: 0x4e4b47, roughness: 1, flatShading: true });
const OLD_WOOD = new THREE.MeshStandardMaterial({ color: 0x3e342a, roughness: 1, flatShading: true });

export function buildPlaces(game: Game, builder: Builder): PlaceSpots {
    const mushrooms: THREE.Object3D[] = [];
    buildMere(builder, mushrooms);
    buildLookout(game, builder);
    buildStones(game, builder, mushrooms);
    const crate = buildRuin(game, builder);
    buildGraveyard(builder);
    return { mushrooms, crate };
}

/** A cluster of pale caps. Its origin is on the ground. */
function mushroomPatch(random: () => number): THREE.Object3D {
    const group = new THREE.Group();
    const cap = new THREE.MeshStandardMaterial({ color: 0xcfc6b0, emissive: 0x6a7a66, emissiveIntensity: 0.5, roughness: 0.9, flatShading: true });
    const stalk = new THREE.MeshStandardMaterial({ color: 0x9a9484, roughness: 1 });
    for (let index = 0; index < 4; index += 1) {
        const height = 0.14 + random() * 0.16;
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.035, height, 4), stalk);
        const head = new THREE.Mesh(new THREE.ConeGeometry(0.09 + random() * 0.05, 0.09, 6), cap);
        const x = (random() - 0.5) * 0.5;
        const z = (random() - 0.5) * 0.5;
        stem.position.set(x, height / 2, z);
        head.position.set(x, height + 0.03, z);
        group.add(stem, head);
    }
    return group;
}

/** Dark still water in a hollow, a rotten jetty, reeds, and mushrooms on the shore. */
function buildMere({ root, terrain, random }: Builder, mushrooms: THREE.Object3D[]): void {
    const { x, z, radius } = PLACES.mere;
    const water = new THREE.Mesh(
        new THREE.CircleGeometry(radius + 12, 24),
        new THREE.MeshStandardMaterial({ color: 0x0c1210, roughness: 0.15, metalness: 0.6, transparent: true, opacity: 0.88 }),
    );
    water.rotation.x = -Math.PI / 2;
    water.position.set(x, MERE_LEVEL, z);
    root.add(water);

    // The jetty runs out from the path side and stops short, one plank hanging.
    const jetty = new THREE.Group();
    for (let index = 0; index < 7; index += 1) {
        const plank = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.08, 0.5), OLD_WOOD);
        plank.position.set((random() - 0.5) * 0.1, 0, index * 0.58);
        plank.rotation.z = index === 6 ? 0.5 : (random() - 0.5) * 0.06;
        jetty.add(plank);
    }
    jetty.position.set(x - 9, MERE_LEVEL + 0.35, z - 13);
    jetty.rotation.y = Math.atan2(x - jetty.position.x, z - jetty.position.z);
    root.add(jetty);

    const reed = new THREE.MeshStandardMaterial({ color: 0x4a4a36, roughness: 1 });
    for (let index = 0; index < 60; index += 1) {
        const angle = random() * Math.PI * 2;
        const distance = radius - 3 + random() * 9;
        const px = x + Math.sin(angle) * distance;
        const pz = z + Math.cos(angle) * distance;
        const ground = terrain.heightAt(px, pz);
        // Reeds only where the water is shallow or the bank is wet.
        if (ground > MERE_LEVEL + 0.8) continue;
        const height = 0.9 + random() * 0.9;
        const blade = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.03, height, 3), reed);
        blade.position.set(px, ground + height / 2, pz);
        blade.rotation.z = (random() - 0.5) * 0.3;
        root.add(blade);
    }

    for (let index = 0; index < 6; index += 1) {
        const angle = (index / 6) * Math.PI * 2 + random();
        const distance = radius + 6 + random() * 4;
        const patch = terrain.place(mushroomPatch(random), x + Math.sin(angle) * distance, z + Math.cos(angle) * distance);
        root.add(patch);
        mushrooms.push(patch);
    }
}

/** The top of the hill: one huge dead tree with a rope on it, a bench, and a view over the mist. */
function buildLookout(game: Game, { root, terrain, solids, add }: Builder): void {
    const { x, z } = PLACES.lookout;
    add({ ...MODELS.treeLarge, height: 19 }, () => haystack(), { x: x - 2.5, z: z - 2 });
    const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 3.2, 4), new THREE.MeshStandardMaterial({ color: 0x8a7a5a, roughness: 1 }));
    terrain.place(rope, x - 0.6, z - 1.2, 6.2);
    const loop = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.03, 4, 8), rope.material);
    loop.position.y = -1.8;
    rope.add(loop);
    root.add(rope);

    const bench = new THREE.Group();
    const seat = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.1, 0.45), OLD_WOOD);
    seat.position.y = 0.45;
    const back = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.45, 0.08), OLD_WOOD);
    back.position.set(0, 0.8, -0.2);
    bench.add(seat, back);
    for (const side of [-0.7, 0.7]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.45, 0.4), OLD_WOOD);
        leg.position.set(side, 0.22, 0);
        bench.add(leg);
    }
    terrain.place(bench, x + 2.5, z + 1);
    bench.rotation.y = Math.atan2(52 - x, -40 - z);
    root.add(bench);
    solid(game, bench, { solids });
}

/** Nine standing stones and a slab. Nobody in the village will say who stood them up. */
function buildStones(game: Game, { root, terrain, solids, random }: Builder, mushrooms: THREE.Object3D[]): void {
    const { x, z, radius } = PLACES.stones;
    for (let index = 0; index < 9; index += 1) {
        const angle = (index / 9) * Math.PI * 2;
        const height = 2.2 + random() * 1.6;
        const stone = new THREE.Mesh(new THREE.BoxGeometry(0.9 + random() * 0.4, height, 0.5), STONE);
        terrain.place(stone, x + Math.sin(angle) * radius, z + Math.cos(angle) * radius, height / 2 - 0.2);
        stone.rotation.set((random() - 0.5) * 0.25, angle, (random() - 0.5) * 0.25);
        stone.castShadow = true;
        root.add(stone);
        solid(game, stone, { solids }, 0.9);
    }
    const slab = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.5, 1.2), STONE);
    terrain.place(slab, x, z, 0.5);
    root.add(slab);
    solid(game, slab, { solids });
    const candle = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.24, 0.1), new THREE.MeshStandardMaterial({ color: 0xfff2d0, emissive: 0xffc070, emissiveIntensity: 3 }));
    candle.position.set(0.4, 0.37, 0);
    slab.add(candle);

    for (let index = 0; index < 6; index += 1) {
        const angle = (index / 6) * Math.PI * 2 + 0.4;
        const patch = terrain.place(mushroomPatch(random), x + Math.sin(angle) * (radius - 2.5), z + Math.cos(angle) * (radius - 2.5));
        root.add(patch);
        mushrooms.push(patch);
    }
}

/** The farm that was here before: broken walls, a chimney, and a crate nobody came back for. */
function buildRuin(game: Game, { root, terrain, solids, add, random }: Builder): THREE.Object3D {
    const { x, z } = PLACES.ruin;
    const wall = new THREE.MeshStandardMaterial({ color: 0x5a544c, roughness: 1, flatShading: true });
    const pieces: Array<{ dx: number; dz: number; width: number; depth: number }> = [
        { dx: -3, dz: 0, width: 0.4, depth: 6 },
        { dx: 3, dz: 1.2, width: 0.4, depth: 3.4 },
        { dx: 0, dz: -3, width: 6, depth: 0.4 },
        { dx: -1.6, dz: 3, width: 2.8, depth: 0.4 },
    ];
    for (const piece of pieces) {
        const height = 0.9 + random() * 2;
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(piece.width, height, piece.depth), wall);
        terrain.place(mesh, x + piece.dx, z + piece.dz, height / 2 - 0.1);
        mesh.castShadow = true;
        root.add(mesh);
        solid(game, mesh, { solids }, 1);
    }
    const chimney = new THREE.Mesh(new THREE.BoxGeometry(1, 4.6, 1), wall);
    terrain.place(chimney, x + 2.4, z - 2.4, 2.3);
    root.add(chimney);
    solid(game, chimney, { solids }, 1);
    add(MODELS.cart, () => haystack(), { x: x - 6, z: z + 2, yaw: 2.2 });

    // A scarecrow that faces the house instead of the field.
    const scarecrow = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.2, 0.1), OLD_WOOD);
    pole.position.y = 1.1;
    const arms = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.1, 0.1), OLD_WOOD);
    arms.position.y = 1.6;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.36, 0.3), new THREE.MeshStandardMaterial({ color: 0x8a7a52, roughness: 1 }));
    head.position.y = 2.05;
    const coat = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.8, 0.2), new THREE.MeshStandardMaterial({ color: 0x33302c, roughness: 1 }));
    coat.position.y = 1.25;
    scarecrow.add(pole, arms, head, coat);
    terrain.place(scarecrow, x + 6, z + 4);
    scarecrow.rotation.y = Math.atan2(x - scarecrow.position.x, z - scarecrow.position.z);
    root.add(scarecrow);

    const crate = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.6, 0.6), OLD_WOOD);
    terrain.place(crate, x - 1, z - 1.6, 0.3);
    crate.rotation.y = 0.4;
    root.add(crate);
    return crate;
}

/** Graves on the rise behind the village, in rows that stop being straight at the back. */
function buildGraveyard({ terrain, add, random, root }: Builder): void {
    const { x, z } = PLACES.graveyard;
    let index = 0;
    for (let row = 0; row < 3; row += 1) {
        for (let column = 0; column < 5; column += 1) {
            const spot = { x: x - 5 + column * 2.5 + (random() - 0.5) * row * 0.8, z: z - 4 + row * 3.2 + (random() - 0.5) * row * 0.6, yaw: (random() - 0.5) * (0.2 + row * 0.25) };
            add(index % 4 === 0 ? MODELS.graveDamaged : MODELS.grave, () => haystack(), spot, false);
            index += 1;
        }
    }
    // One grave is open and empty.
    const pit = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.1, 2.1), new THREE.MeshStandardMaterial({ color: 0x0a0908, roughness: 1 }));
    terrain.place(pit, x + 6.5, z + 2, 0.04);
    root.add(pit);
}
