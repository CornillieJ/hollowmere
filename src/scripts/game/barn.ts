import * as THREE from 'three';

import { modelled } from './models';

import { SYSTEM_ORDER } from '../core/systems';
import type { Atmosphere } from '../fx/atmosphere';

/**
 * The inside of the barn.
 *
 * The barn in the yard is a solid model, so its inside is a room of its own,
 * high above the valley where the Veil never reaches and nothing can be seen
 * from the ground. A door in the yard leads up to it and a door inside leads
 * back down: the screen goes dark for the moment in between. None of them can
 * follow, so it is the one place besides the porch to sit out a bad night.
 */
export type BarnOptions = {
    /** Where the door stands in the yard. */
    door: THREE.Vector3;
    /** Where the farmer is put on coming back out. */
    outside: THREE.Vector3;
    atmosphere: Atmosphere;
    /** False while the farmer may not go in, with the reason. */
    canEnter?: () => string | undefined;
    /** Called right after the farmer is moved, to bring the camera along at once. */
    settle?: () => void;
    onEnter?: () => void;
    onLeave?: () => void;
};

export type BarnHandle = {
    readonly inside: boolean;
    /** The middle of the floor, for placing things in the room. */
    readonly floor: THREE.Vector3;
    /** The room, to hang furniture in. Its origin is the middle of the floor. */
    readonly room: THREE.Group;
    /** The door back out, for anything that limits what may be used. */
    readonly exit: THREE.Object3D;
    enter: () => void;
    leave: () => void;
};

/** How far above the valley the room hangs. */
const HEIGHT = 90;
/** Roomier than the barn looks from the yard. Nobody inside has ever said so. */
const SIZE = { x: 16, y: 4.8, z: 12 };

type Horse = { root: THREE.Group; neck: THREE.Object3D; tail: THREE.Object3D; rest: number };

/** A horse from boxes, facing +z, head over the stall gate. */
function buildHorse(color: number): Horse {
    const coat = new THREE.MeshStandardMaterial({ color, roughness: 1, flatShading: true });
    const mane = new THREE.MeshStandardMaterial({ color: 0x141210, roughness: 1, flatShading: true });
    const root = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.8, 1.9), coat);
    body.position.y = 1.35;
    root.add(body);
    for (const [x, z] of [[-0.25, 0.7], [0.25, 0.7], [-0.25, -0.7], [0.25, -0.7]] as const) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1, 0.18), coat);
        leg.position.set(x, 0.5, z);
        root.add(leg);
    }
    const neck = new THREE.Group();
    neck.position.set(0, 1.6, 0.85);
    const neckBox = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.9, 0.4), coat);
    neckBox.position.set(0, 0.35, 0.2);
    neckBox.rotation.x = 0.5;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.32, 0.75), coat);
    head.position.set(0, 0.72, 0.62);
    const hair = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.7, 0.32), mane);
    hair.position.set(0, 0.5, 0.05);
    hair.rotation.x = 0.5;
    for (const x of [-0.09, 0.09]) {
        const ear = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.06), coat);
        ear.position.set(x, 0.92, 0.32);
        neck.add(ear);
    }
    neck.add(neckBox, head, hair);
    root.add(neck);
    const tail = new THREE.Group();
    tail.position.set(0, 1.6, -0.95);
    const strands = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.9, 0.14), mane);
    strands.position.y = -0.45;
    tail.add(strands);
    root.add(tail);
    return { root, neck, tail, rest: 0 };
}

export function setupBarn(game: Game, options: BarnOptions): BarnHandle {
    let inside = false;
    const horses: Horse[] = [];
    const floor = new THREE.Vector3(options.door.x + 6, HEIGHT, options.door.z);
    const room = new THREE.Group();
    room.name = 'barn-inside';
    room.position.copy(floor);
    game.scene.add(room);

    const planks = new THREE.MeshStandardMaterial({ color: 0x4a3626, roughness: 1, flatShading: true });
    const boards = new THREE.MeshStandardMaterial({ color: 0x5c3a2c, roughness: 1, flatShading: true });
    const dark = new THREE.MeshStandardMaterial({ color: 0x2a1e18, roughness: 1, flatShading: true });
    const straw = new THREE.MeshStandardMaterial({ color: 0x8e7a40, roughness: 1, flatShading: true });

    /** A slab of the room: drawn, and solid. */
    const slab = (size: THREE.Vector3, at: THREE.Vector3, material: THREE.Material): void => {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), material);
        mesh.position.copy(at);
        mesh.receiveShadow = true;
        room.add(mesh);
        game.physics.add({ kind: 'fixed', shape: { type: 'box', size: { x: size.x, y: size.y, z: size.z } }, position: at.clone().add(floor), syncObject: false, tag: 'wall' });
    };
    const wall = 0.3;
    slab(new THREE.Vector3(SIZE.x + wall * 2, 0.4, SIZE.z + wall * 2), new THREE.Vector3(0, -0.2, 0), planks);
    slab(new THREE.Vector3(SIZE.x + wall * 2, 0.3, SIZE.z + wall * 2), new THREE.Vector3(0, SIZE.y + 0.15, 0), dark);
    slab(new THREE.Vector3(wall, SIZE.y, SIZE.z + wall * 2), new THREE.Vector3(-SIZE.x / 2 - wall / 2, SIZE.y / 2, 0), boards);
    slab(new THREE.Vector3(wall, SIZE.y, SIZE.z + wall * 2), new THREE.Vector3(SIZE.x / 2 + wall / 2, SIZE.y / 2, 0), boards);
    slab(new THREE.Vector3(SIZE.x, SIZE.y, wall), new THREE.Vector3(0, SIZE.y / 2, -SIZE.z / 2 - wall / 2), boards);
    slab(new THREE.Vector3(SIZE.x, SIZE.y, wall), new THREE.Vector3(0, SIZE.y / 2, SIZE.z / 2 + wall / 2), boards);

    // Beams, hay, 2 stalls and a lamp: enough to read as a barn in the half dark.
    for (const x of [-6, -2, 2, 6]) {
        const beam = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.28, SIZE.z), dark);
        beam.position.set(x, SIZE.y - 0.35, 0);
        room.add(beam);
    }
    // Loose hay in heaps along the north wall, and a few round bales: no crates nobody can open.
    for (const [x, z, size] of [
        [-5.6, -4.6, 1.5],
        [-3.2, -4.9, 1.1],
        [-0.8, -4.5, 1.6],
        [-6.6, -2.2, 0.9],
    ] as const) {
        const heap = new THREE.Mesh(new THREE.ConeGeometry(size, size * 0.62, 10, 2), straw);
        heap.scale.set(1, 1, 0.8);
        heap.position.set(x, size * 0.31, z);
        heap.rotation.y = x;
        room.add(heap);
    }
    for (const [x, z, y] of [
        [1.4, -4.9, 0.55],
        [2.8, -4.9, 0.55],
        [2.1, -4.9, 1.55],
    ] as const) {
        const bale = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 1.1, 8), straw);
        bale.rotation.x = Math.PI / 2;
        bale.position.set(x, y, z);
        bale.castShadow = true;
        room.add(bale);
    }
    // 2 stalls against the east wall, a horse in each.
    for (const z of [-3.2, 1.2, 5.6]) slab(new THREE.Vector3(3.2, 1.5, 0.15), new THREE.Vector3(SIZE.x / 2 - 1.6, 0.75, z - 1), planks);
    for (const z of [-2.2, 2.2]) {
        const gate = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.9, 3.6), planks);
        gate.position.set(SIZE.x / 2 - 3.3, 0.85, z + 0.2);
        room.add(gate);
        game.physics.add({ kind: 'fixed', shape: { type: 'box', size: { x: 0.2, y: 1.6, z: 4.4 } }, position: new THREE.Vector3(SIZE.x / 2 - 3.3, 0.8, z + 0.2).add(floor), syncObject: false, tag: 'wall' });
        const horse = buildHorse(z < 0 ? 0x5a3a26 : 0x2c2622);
        // The modelled horse takes the stand-in's place, and its neck and tail are the ones that move from then on.
        modelled(game, z < 0 ? 'horse-bay' : 'horse-black', horse.root);
        horse.root.addEventListener('modelled' as never, () => {
            horse.neck.removeFromParent();
            horse.tail.removeFromParent();
            horse.neck = horse.root.getObjectByName('neck') ?? horse.neck;
            horse.tail = horse.root.getObjectByName('tail') ?? horse.tail;
            horse.rest = horse.neck.rotation.x;
        });
        horse.root.position.set(SIZE.x / 2 - 1.7, 0, z + 0.2);
        horse.root.rotation.y = -Math.PI / 2;
        room.add(horse.root);
        horses.push(horse);
    }
    game.systems.add({
        name: 'barn-horses',
        update: () => {
            if (!inside) return;
            const now = performance.now() / 1000;
            horses.forEach((horse, index) => {
                horse.neck.rotation.x = horse.rest + Math.max(0, Math.sin(now * 0.4 + index * 2)) * 0.5;
                horse.tail.rotation.z = Math.sin(now * 2.2 + index) * 0.35;
            });
        },
    });

    const lampBody = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.32, 0.22), new THREE.MeshStandardMaterial({ color: 0xffd9a0, emissive: 0xffa040, emissiveIntensity: 2.4 }));
    lampBody.position.set(-2, SIZE.y - 0.75, 0);
    const lamp = new THREE.PointLight(0xffb36b, 45, 22, 1.4);
    lamp.position.copy(lampBody.position);
    // A second, over the stalls.
    const stallLamp = lampBody.clone();
    stallLamp.position.set(4.5, SIZE.y - 0.75, 0.2);
    const stallLight = new THREE.PointLight(0xffb36b, 30, 14, 1.4);
    stallLight.position.copy(stallLamp.position);
    room.add(lampBody, lamp, stallLamp, stallLight);

    // The way out: a darker rectangle in the west wall, where the way in is outside.
    const doorway = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.4, 1.5), dark);
    doorway.position.set(-SIZE.x / 2 + 0.05, 1.2, 0);
    room.add(doorway);

    const step = (to: THREE.Vector3, then: () => void): void => {
        game.effects.flash(1.1, 0x000000, 1);
        game.player?.body.teleport(to);
        // The camera is put there too, or it is seen flying up to the loft through the dark.
        options.settle?.();
        then();
    };
    const enter = (): void => {
        const refusal = options.canEnter?.();
        if (refusal) return void game.toasts.push(refusal, { color: '#c8a0a0' });
        step(floor.clone().add(new THREE.Vector3(-SIZE.x / 2 + 2.4, 0.3, 0)), () => {
            inside = true;
            options.onEnter?.();
        });
    };
    const leave = (): void => {
        step(options.outside, () => {
            inside = false;
            options.onLeave?.();
        });
    };

    const outer = new THREE.Object3D();
    outer.position.copy(options.door);
    game.scene.add(outer);
    game.interactions.add(outer, { prompt: 'Go into the barn', range: 2.4, onInteract: enter });
    game.interactions.add(doorway, { prompt: 'Go back out to the yard', range: 2.4, onInteract: leave });

    game.systems.add({
        name: 'barn',
        // After the hour and the edge of the valley have had their say about the fog.
        order: SYSTEM_ORDER.EFFECTS + 1,
        update: () => {
            const player = game.player;
            if (!player) return;
            // Loading a save, dying or waking somewhere else all leave the room without the door.
            const up = player.position.y > HEIGHT - 5;
            if (up !== inside) {
                inside = up;
                (up ? options.onEnter : options.onLeave)?.();
            }
            if (inside) options.atmosphere.setDensity(0.012);
        },
    });

    return {
        get inside() {
            return inside;
        },
        floor,
        room,
        exit: doorway,
        enter,
        leave,
    };
}
