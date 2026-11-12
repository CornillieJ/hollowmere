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

const SIGN_LINES: Array<[string, string]> = [
    ['WHAT THEY TAKE', 'bold 25px Georgia, serif'],
    ['THE WATER KEEPS', 'bold 25px Georgia, serif'],
    ['it is not at home by day', 'italic 17px Georgia, serif'],
];

export function setupPool(game: Game, options: PoolOptions): PoolHandle {
    const kept = new Map<string, number>();
    const list = (): Kept[] => [...kept].map(([itemId, amount]) => ({ itemId, amount }));

    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 112;
    const context = canvas.getContext('2d');
    if (context) {
        context.fillStyle = '#7c7462';
        context.fillRect(0, 0, 256, 112);
        context.fillStyle = '#625a4a';
        for (let y = 0; y < 112; y += 14) context.fillRect(0, y, 256, 1);
        context.fillStyle = '#16140f';
        context.textAlign = 'center';
        SIGN_LINES.forEach(([text, font], index) => {
            context.font = font;
            context.fillText(text, 128, 34 + index * 30);
        });
        // Scratched in afterwards, by somebody in a hurry, not quite level.
        context.save();
        context.translate(196, 104);
        context.rotate(-0.06);
        context.font = '11px Georgia, serif';
        context.fillStyle = '#2c2418';
        context.fillText('bring your own hands', 0, 0);
        context.restore();
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.colorSpace = THREE.SRGBColorSpace;
    const wood = new THREE.MeshStandardMaterial({ color: 0x2e2a24, roughness: 1, flatShading: true });
    const face = new THREE.MeshStandardMaterial({ map: texture, roughness: 1, emissive: 0xffffff, emissiveMap: texture, emissiveIntensity: 0.6 });
    const sign = new THREE.Group();
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.14, 2.2, 0.14), wood);
    post.position.y = 1.1;
    // It leans towards the water, as everything on this bank does.
    const board = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.85, 0.06), [wood, wood, wood, wood, face, face]);
    board.position.y = 1.8;
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
            options.say('"What they take, the water keeps. It is not at home by day."');
            options.think('pool-sign', ['Underneath, scratched with a nail: "bring your own hands".', 'What they take. Everything I had on me, the time they got me, was gone when I woke.', 'So it is in there. And it can be asked for, after dark, by hand.']);
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
