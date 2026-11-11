import * as THREE from 'three';

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
const SIZE = { x: 9, y: 3.6, z: 7 };

export function setupBarn(game: Game, options: BarnOptions): BarnHandle {
    const floor = new THREE.Vector3(options.door.x + 6, HEIGHT, options.door.z);
    const room = new THREE.Group();
    room.name = 'barn-inside';
    room.position.copy(floor);
    game.scene.add(room);

    const planks = new THREE.MeshStandardMaterial({ color: 0x4a3626, roughness: 1, flatShading: true });
    const boards = new THREE.MeshStandardMaterial({ color: 0x5c3a2c, roughness: 1, flatShading: true });
    const dark = new THREE.MeshStandardMaterial({ color: 0x2a1e18, roughness: 1, flatShading: true });
    const straw = new THREE.MeshStandardMaterial({ color: 0xb09a52, roughness: 1, flatShading: true });

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

    // Beams, bales and a lamp: enough to read as a barn in the half dark.
    for (const x of [-3, 0, 3]) {
        const beam = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.24, SIZE.z), dark);
        beam.position.set(x, SIZE.y - 0.3, 0);
        room.add(beam);
    }
    for (const [x, y, z, turn] of [
        [3.3, 0.4, -2.6, 0],
        [3.3, 0.4, -1.3, 0.1],
        [3.2, 1.2, -2, -0.15],
        [2, 0.4, -2.7, 1.5],
    ] as const) {
        const bale = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.8, 1.2), straw);
        bale.position.set(x, y, z);
        bale.rotation.y = turn;
        bale.castShadow = true;
        room.add(bale);
    }
    const lampBody = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.32, 0.22), new THREE.MeshStandardMaterial({ color: 0xffd9a0, emissive: 0xffa040, emissiveIntensity: 2.4 }));
    lampBody.position.set(0, SIZE.y - 0.75, 0);
    const lamp = new THREE.PointLight(0xffb36b, 40, 20, 1.4);
    lamp.position.copy(lampBody.position);
    room.add(lampBody, lamp);

    // The way out: a darker rectangle in the west wall, where the way in is outside.
    const doorway = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.4, 1.5), dark);
    doorway.position.set(-SIZE.x / 2 + 0.05, 1.2, 0);
    room.add(doorway);

    let inside = false;
    const step = (to: THREE.Vector3, then: () => void): void => {
        game.effects.flash(0.7, 0x000000, 1);
        game.player?.body.teleport(to);
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
