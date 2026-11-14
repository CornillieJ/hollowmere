import * as THREE from 'three';

import { createFolk, FolkAnimator } from '../content/folk';

/**
 * A pedlar with a handcart, on the road between the farm and the village.
 *
 * Every third day, from morning to dusk. The cart carries what Barnaby does
 * not, and the pedlar pays more than Barnaby for anything out of the pockets,
 * so the odd things (finds, fish, veilblooms) are worth keeping for the day
 * the cart comes.
 */
export const PEDLAR = { every: 3, from: 7, until: 19, pays: 0.75 };

/** What the cart carries: the better seeds before Barnaby has them, and lamp things. */
export const PEDLAR_STOCK = ['corn-seed', 'pumpkin-seed', 'lantern', 'lamp-oil', 'egg'];

export type PedlarOptions = {
    position: THREE.Vector3;
    yaw: number;
    /** True while the cart should be standing there. */
    here: () => boolean;
    onTalk: () => void;
};

export type PedlarHandle = {
    readonly object: THREE.Group;
    readonly here: boolean;
};

export function setupPedlar(game: Game, options: PedlarOptions): PedlarHandle {
    const root = new THREE.Group();
    root.name = 'pedlar';
    root.position.copy(options.position);
    root.rotation.y = options.yaw;

    const wood = new THREE.MeshStandardMaterial({ color: 0x6a4e34, roughness: 1, flatShading: true });
    const cart = new THREE.Group();
    const bed = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.45, 2.2), wood);
    bed.position.y = 0.95;
    cart.add(bed);
    const iron = new THREE.MeshStandardMaterial({ color: 0x3a3632, roughness: 1, flatShading: true });
    for (const x of [-0.75, 0.75]) {
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.1, 10), iron);
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(x, 0.55, 0.1);
        cart.add(wheel);
        const handle = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 1.2), wood);
        handle.position.set(x * 0.7, 0.8, -1.6);
        handle.rotation.x = -0.25;
        cart.add(handle);
    }
    cart.position.set(-1.5, 0, -0.3);
    cart.rotation.y = 0.25;

    // A cloth over the load, and the things laid out on it.
    const cloth = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.08, 1.9), new THREE.MeshStandardMaterial({ color: 0x7a2f3a, roughness: 1, flatShading: true }));
    cloth.position.set(0, 1.21, 0);
    cart.add(cloth);
    for (const [x, z, color, height] of [
        [-0.4, 0.5, 0xd9b24a, 0.3],
        [0.1, 0.55, 0x6f8f9a, 0.42],
        [0.45, 0.1, 0xe8dcd0, 0.24],
        [-0.3, -0.3, 0x5f9a52, 0.36],
        [0.25, -0.55, 0xb46ab0, 0.28],
    ] as const) {
        const ware = new THREE.Mesh(new THREE.BoxGeometry(0.24, height, 0.24), new THREE.MeshStandardMaterial({ color, roughness: 1, flatShading: true }));
        ware.position.set(x, 1.25 + height / 2, z);
        cart.add(ware);
    }

    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 2.6, 5), wood);
    pole.position.set(-1.1, 1.3, 0.9);
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.3, 0.24), new THREE.MeshBasicMaterial({ color: 0xffd27a }));
    lamp.position.set(-1.1, 2.45, 1.08);
    const glow = new THREE.PointLight(0xffc870, 6, 9, 1.6);
    glow.position.copy(lamp.position);

    const rig = createFolk({ species: 'fox', fur: 0xb8642e, accent: 0xf0e2c8, clothes: 0x3e4a5a, height: 1.7 });
    rig.root.position.set(0.5, 0, 0.5);
    // A wide hat, so it reads as nobody from the village.
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.04, 8), new THREE.MeshStandardMaterial({ color: 0x2a2622, roughness: 1, flatShading: true }));
    brim.position.y = 0.15;
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 0.2, 6), brim.material);
    crown.position.y = 0.26;
    rig.head.add(brim, crown);
    const animator = new FolkAnimator(rig);

    root.add(cart, pole, lamp, glow, rig.root);
    root.visible = false;
    game.scene.add(root);

    game.interactions.add(rig.root, { prompt: 'Look over the cart', range: 3, enabled: false, onInteract: () => options.onTalk() });

    let here = false;
    let wall: ReturnType<Game['physics']['add']> | undefined;
    const centre = new THREE.Vector3();
    game.systems.add({
        name: 'pedlar',
        update: (delta) => {
            const now = options.here();
            if (now !== here) {
                here = now;
                root.visible = now;
                game.interactions.setEnabled(rig.root, now);
                if (wall) game.physics.remove(wall);
                wall = undefined;
                if (now) {
                    root.updateMatrixWorld(true);
                    cart.getWorldPosition(centre);
                    wall = game.physics.add({ kind: 'fixed', shape: { type: 'box', size: { x: 1.5, y: 2, z: 2.8 } }, position: centre.setY(centre.y + 1), rotation: new THREE.Euler(0, options.yaw + cart.rotation.y, 0), object: cart, syncObject: false, tag: 'wall' });
                }
            }
            if (!here) return;
            animator.update(0, delta);
            // It watches whoever comes up the road.
            const player = game.player;
            if (!player) return;
            const turn = Math.atan2(player.position.x - root.position.x, player.position.z - root.position.z) - options.yaw;
            rig.head.rotation.y = THREE.MathUtils.clamp(Math.atan2(Math.sin(turn), Math.cos(turn)), -0.9, 0.9);
        },
    });

    return {
        object: root,
        get here() {
            return here;
        },
    };
}
