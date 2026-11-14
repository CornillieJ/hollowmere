import * as THREE from 'three';

import { PLACES, POOL_LEVEL } from '../content/world';

/**
 * The black pool keeps what the Veil takes.
 *
 * Whatever the farmer carried when they died is not gone: it is in the water.
 * After dark, somebody who reaches in from the end of the jetty gets it back.
 * By day the water gives nothing. A sign by the jetty says so, more or less.
 */
export type Kept = { itemId: string; amount: number };

export type PoolOptions = {
    terrain: { point: (x: number, z: number, lift?: number) => THREE.Vector3 };
    night: () => boolean;
    /** Put it in the farmer's hands. Returns how many did not fit. */
    stow: (itemId: string, amount: number) => number;
    knows: (itemId: string) => boolean;
    onReturned: (count: number, left: number) => void;
    say: (line: string) => void;
    think: (id: string, lines: string[]) => void;
};

export type PoolHandle = {
    /** What is in the water now. */
    readonly kept: Kept[];
    /** The water takes this, e.g. as the farmer dies. */
    keep: (itemId: string, amount: number) => void;
    /** Reach in. Returns how many things came back. */
    reach: () => number;
    readonly sign: THREE.Object3D;
    readonly reachSpot: THREE.Vector3;
};

/** Heavy block letters: thin ones are lost at the picture's low resolution. */
const SIGN_LINES: Array<[string, string, number]> = [
    ['LOST THINGS', '900 38px Arial Black, Impact, sans-serif', 44],
    ['ARE IN THE POOL', '900 27px Arial Black, Impact, sans-serif', 80],
    ['TAKE THEM BACK AFTER DARK', 'bold 15px Arial, sans-serif', 108],
];

export function setupPool(game: Game, options: PoolOptions): PoolHandle {
    const kept = new Map<string, number>();
    const list = (): Kept[] => [...kept].map(([itemId, amount]) => ({ itemId, amount }));

    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 120;
    const context = canvas.getContext('2d');
    if (context) {
        context.fillStyle = '#b4a888';
        context.fillRect(0, 0, 256, 120);
        context.fillStyle = '#978b6c';
        for (let y = 0; y < 120; y += 15) context.fillRect(0, y, 256, 1);
        context.fillStyle = '#16140f';
        context.textAlign = 'center';
        for (const [text, font, y] of SIGN_LINES) {
            context.font = font;
            context.fillText(text, 128, y);
        }
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.colorSpace = THREE.SRGBColorSpace;
    const wood = new THREE.MeshStandardMaterial({ color: 0x2e2a24, roughness: 1, flatShading: true });
    const face = new THREE.MeshStandardMaterial({ map: texture, roughness: 1, emissive: 0xffffff, emissiveMap: texture, emissiveIntensity: 0.6 });
    const sign = new THREE.Group();
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.14, 3.1, 0.14), wood);
    post.position.y = 1.55;
    // It leans towards the water, as everything on this bank does.
    // Nailed to the front of the post, so the post does not stand through the words.
    const board = new THREE.Mesh(new THREE.BoxGeometry(2.5, 1.17, 0.06), [wood, wood, wood, wood, face, wood]);
    board.position.set(0, 2.55, 0.1);
    sign.add(post, board);
    const { x, z } = PLACES.pool;
    const jetty = { x: x - 9, z: z - 13 };
    const toWater = Math.atan2(x - jetty.x, z - jetty.z);
    sign.position.copy(options.terrain.point(jetty.x - 2.6, jetty.z - 2.4, 0));
    // Read by somebody coming down the path, with the water behind it.
    sign.rotation.set(0.07, toWater + Math.PI, 0.04);
    game.scene.add(sign);
    game.interactions.add(sign, {
        prompt: 'Read the sign',
        range: 2.6,
        onInteract: () => {
            options.say('The sign reads: "Lost things are in the pool. Take them back after dark."');
            options.think('pool-sign', ["So that's where it all went. Whatever I'm carrying when they get me ends up in this water.", "I can take it back from the end of the jetty. But only at night."]);
        },
    });

    // The end of the jetty, where the last plank hangs.
    const reachSpot = new THREE.Vector3(jetty.x + Math.sin(toWater) * 3.6, POOL_LEVEL + 0.4, jetty.z + Math.cos(toWater) * 3.6);
    const water = new THREE.Object3D();
    water.position.copy(reachSpot);
    game.scene.add(water);

    const reach = (): number => {
        let back = 0;
        for (const [itemId, amount] of [...kept]) {
            if (!options.knows(itemId)) {
                kept.delete(itemId);
                continue;
            }
            const left = options.stow(itemId, amount);
            back += amount - left;
            if (left > 0) kept.set(itemId, left);
            else kept.delete(itemId);
        }
        options.onReturned(back, list().reduce((sum, entry) => sum + entry.amount, 0));
        return back;
    };
    game.interactions.add(water, {
        prompt: () => (options.night() ? 'Reach into the water' : 'Look into the water'),
        range: 2.4,
        canInteract: () => kept.size > 0 || !options.night(),
        onInteract: () => {
            if (!options.night()) {
                options.say(kept.size > 0 ? 'Something pale lies on the bottom. The water will not let a hand through.' : 'Black, and still. It does not show your face.');
                return;
            }
            reach();
        },
    });

    game.save.register('pool', {
        save: () => list(),
        load: (data) => {
            kept.clear();
            for (const entry of Array.isArray(data) ? (data as Kept[]) : []) if (entry.amount > 0) kept.set(entry.itemId, entry.amount);
        },
    });

    return {
        get kept() {
            return list();
        },
        keep: (itemId, amount) => void kept.set(itemId, (kept.get(itemId) ?? 0) + amount),
        reach,
        sign,
        reachSpot,
    };
}
