import * as THREE from 'three';

import type { Terrain } from '../kit';
import { VILLAGE, homeOf } from '../content/world';
import { boxHouse, haystack, railFence, solid } from './world';
import { modelled } from './models';

/**
 * The working clutter of a farm: a shed, a woodpile, bales, a trough, a
 * scarecrow, a washing line. It makes the yard a place with corners, and
 * corners are where one of the Hollow turns out to have been standing.
 *
 * Everything is solid, so anything that wanders in has to weave between it.
 */
const WOOD = new THREE.MeshStandardMaterial({ color: 0x4e4032, roughness: 1, flatShading: true });
const DARK = new THREE.MeshStandardMaterial({ color: 0x2c2620, roughness: 1, flatShading: true });
const STRAW = new THREE.MeshStandardMaterial({ color: 0x9a8a52, roughness: 1, flatShading: true });

/** The north fence. */
const FENCE_Z = 25.2;

type Context = { game: Game; root: THREE.Object3D; terrain: Terrain; solids: THREE.Box3[] };

export function buildFarmyard(game: Game, root: THREE.Object3D, terrain: Terrain, solids: THREE.Box3[]): { scarecrow: THREE.Object3D } {
    const context: Context = { game, root, terrain, solids };
    const put = (object: THREE.Object3D, x: number, z: number, yaw = 0, collide = true): THREE.Object3D => {
        terrain.place(object, x, z);
        object.rotation.y = yaw;
        root.add(object);
        if (collide) solid(game, object, { solids }, 0.95);
        return object;
    };

    // A tool shed in the north west corner, inside the fence, and an outhouse nobody has opened in a while.
    put(modelled(game, 'shed', boxHouse(0x4a3e34, 0x2a2420, 3.2)), -60.5, 29, 0.2);
    // The outhouse is the same shed at half the size.
    const outhouse = modelled(game, 'shed', boxHouse(0x54463a, 0x2a2420, 3));
    outhouse.scale.set(0.5, 0.8, 0.55);
    put(outhouse, -67, 62.5, 0.4);

    put(modelled(game, 'woodpile', woodpile()), -63.5, 43.5, 0.3);
    put(modelled(game, 'woodpile', woodpile()), -60.6, 32.2, 1.7);
    for (const [x, z, yaw] of [
        [-40.6, 42.4, 0.2],
        [-28.4, 48.4, 1.1],
        [-43.5, 39.5, 0.6],
        [-58, 40, 1.4],
    ] as Array<[number, number, number]>) {
        put(bale(), x, z, yaw);
    }
    put(modelled(game, 'trough', trough()), -43.6, 50, Math.PI / 2);
    for (const [x, z] of [
        [-45, 60.2],
        [-46.1, 61],
        [-45.4, 61.4],
        [-44.2, 61.6],
    ] as Array<[number, number]>) {
        put(modelled(game, 'crate', crate()), x, z, x * 0.7);
    }
    const yardScarecrow = put(modelled(game, 'scarecrow', scarecrow()), -48, 40.2, Math.PI, false);
    washingLine(context, { x: -57, z: 62 }, { x: -52.5, z: 63.2 });

    // A fence along the north of the fields. The short run is turned a little and joined to the long one: no gap.
    const rail = (x: number, z: number, yaw: number): void => {
        put(railFence(4), x, z, yaw, false);
        for (const along of [-1.5, -0.5, 0.5, 1.5]) {
            const px = x + Math.cos(yaw) * along;
            const pz = z - Math.sin(yaw) * along;
            game.physics.add({ kind: 'fixed', shape: { type: 'box', size: { x: 1.1, y: 1.2, z: 0.3 } }, position: new THREE.Vector3(px, terrain.heightAt(px, pz) + 0.6, pz), syncObject: false, tag: 'wall' });
        }
    };
    for (const x of [-58, -54, -50]) rail(x, FENCE_Z, 0);
    const turn = 0.3;
    for (const along of [2, 6]) rail(-48 + Math.cos(turn) * along, FENCE_Z - Math.sin(turn) * along, turn);
    return { scarecrow: yardScarecrow };
}

/** Marks the empty house on the square as the infirmary: a white lamp and a cross over the door. */
export function buildInfirmary(root: THREE.Object3D, terrain: Terrain): void {
    const door = homeOf(VILLAGE.infirmary);
    const sign = new THREE.Group();
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.6, 0.12), DARK);
    post.position.y = 1.3;
    const white = new THREE.MeshStandardMaterial({ color: 0xf2f0e8, emissive: 0xd8e0e0, emissiveIntensity: 1.6 });
    const upright = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.6, 0.06), white);
    upright.position.set(0, 2.3, 0.1);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.16, 0.06), white);
    bar.position.set(0, 2.3, 0.1);
    sign.add(post, upright, bar);
    const light = new THREE.PointLight(0xdfe8e8, 5, 9, 1.6);
    light.position.y = 2.2;
    sign.add(light);
    terrain.place(sign, door.x - 1.6, door.z - 1.2);
    sign.rotation.y = door.yaw;
    root.add(sign);

    // A cot outside under the eaves: the beds inside are all taken.
    const cot = new THREE.Group();
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.3, 2), WOOD);
    frame.position.y = 0.3;
    const sheet = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.08, 1.9), new THREE.MeshStandardMaterial({ color: 0xc8c4b8, roughness: 1 }));
    sheet.position.y = 0.49;
    cot.add(frame, sheet);
    terrain.place(cot, door.x + 1.4, door.z - 0.6);
    cot.rotation.y = door.yaw;
    root.add(cot);
}

function woodpile(): THREE.Object3D {
    const group = new THREE.Group();
    for (let row = 0; row < 3; row += 1) {
        for (let index = 0; index < 5 - row; index += 1) {
            const log = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 1.5, 6), DARK);
            log.rotation.x = Math.PI / 2;
            log.position.set((index - (4 - row) / 2) * 0.3, 0.14 + row * 0.26, 0);
            group.add(log);
        }
    }
    return group;
}

function bale(): THREE.Object3D {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.65, 1.2, 8), STRAW);
    mesh.rotation.z = Math.PI / 2;
    mesh.geometry.translate(0, 0, 0);
    const group = new THREE.Group();
    mesh.position.y = 0.65;
    mesh.castShadow = true;
    group.add(mesh);
    return group;
}

function trough(): THREE.Object3D {
    const group = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.5, 0.7), WOOD);
    body.position.y = 0.35;
    const water = new THREE.Mesh(new THREE.BoxGeometry(2, 0.04, 0.5), new THREE.MeshStandardMaterial({ color: 0x1a2220, roughness: 0.2, metalness: 0.4 }));
    water.position.y = 0.58;
    group.add(body, water);
    return group;
}

function crate(): THREE.Object3D {
    const group = new THREE.Group();
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.7, 0.8), WOOD);
    box.position.y = 0.35;
    box.castShadow = true;
    group.add(box);
    return group;
}

/** A coat on a cross. It faces the house, as the one at the ruin does. */
function scarecrow(): THREE.Object3D {
    const group = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.3, 0.1), WOOD);
    pole.position.y = 1.15;
    const arms = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.1, 0.1), WOOD);
    arms.position.y = 1.7;
    const coat = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.85, 0.22), DARK);
    coat.position.y = 1.3;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.38, 0.32), STRAW);
    head.position.y = 2.15;
    group.add(pole, arms, coat, head);
    return group;
}

function washingLine({ root, terrain, game, solids }: Context, from: { x: number; z: number }, to: { x: number; z: number }): void {
    const cloth = new THREE.MeshStandardMaterial({ color: 0xb8b0a0, roughness: 1, side: THREE.DoubleSide });
    for (const end of [from, to]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2, 0.1), WOOD);
        terrain.place(post, end.x, end.z, 1);
        root.add(post);
        solid(game, post, { solids }, 1);
    }
    const yaw = Math.atan2(to.x - from.x, to.z - from.z);
    for (let index = 1; index <= 3; index += 1) {
        const t = index / 4;
        const sheet = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.1 - (index % 2) * 0.3), cloth);
        terrain.place(sheet, from.x + (to.x - from.x) * t, from.z + (to.z - from.z) * t, 1.35);
        sheet.rotation.y = yaw + Math.PI / 2;
        root.add(sheet);
    }
}
