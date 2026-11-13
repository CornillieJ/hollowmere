import * as THREE from 'three';

import type { Farm, PlotState } from './farm';
import { modelled } from './models';

/**
 * Weeping scarecrows: bought at the store and stood in the field.
 *
 * Every morning the plots within a couple of steps of one are found wet, so a
 * big farm does not turn into a morning of walking to the well. It stands on
 * the corner between plots and takes no ground from the crop. Nobody says what
 * it weeps, or over whom.
 */
export type ScarecrowsOptions = {
    farm: Farm;
    plotSize: number;
    /** Take one out of what is carried. False when there is none. */
    take: () => boolean;
    give: () => void;
    say: (message: string, color?: string) => void;
    onPlaced?: (position: THREE.Vector3) => void;
};

export type ScarecrowsHandle = {
    readonly count: number;
    /** Stand one at the plot corner nearest the farmer. */
    place: () => boolean;
    /** Call each morning, after the field has dried. Returns how many planted plots were watered. */
    weep: () => number;
    toJSON: () => Array<{ x: number; z: number }>;
    fromJSON: (data: unknown) => void;
};

/** A corner has 4 plots against it and 8 more a plot further out; this reaches those 12 and no others. */
const REACH = 1.7;

export function setupScarecrows(game: Game, options: ScarecrowsOptions): ScarecrowsHandle {
    const { farm } = options;
    const standing: Array<{ object: THREE.Group; position: THREE.Vector3 }> = [];
    const within = (position: THREE.Vector3): PlotState[] => farm.plots.filter((plot) => plot.active && Math.hypot(plot.position.x - position.x, plot.position.z - position.z) < options.plotSize * REACH);

    const add = (x: number, z: number, y: number): void => {
        const object = modelled(game, 'scarecrow', new THREE.Group());
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.8, 0.1), new THREE.MeshStandardMaterial({ color: 0x4e4032, roughness: 1 }));
        post.position.y = 0.9;
        object.add(post);
        object.position.set(x, y, z);
        object.scale.setScalar(0.72);
        object.rotation.y = (x * 7 + z * 3) % 6.28;
        game.scene.add(object);
        const entry = { object, position: object.position.clone() };
        standing.push(entry);
        game.interactions.add(object, {
            prompt: 'Take the scarecrow down',
            range: 1.6,
            onInteract: () => {
                game.interactions.remove(object);
                object.removeFromParent();
                standing.splice(standing.indexOf(entry), 1);
                options.give();
            },
        });
    };

    return {
        get count() {
            return standing.length;
        },
        place: () => {
            const player = game.player;
            const plot = player ? farm.nearestPlot(player.position, options.plotSize * 1.2) : undefined;
            if (!player || !plot) {
                options.say('Stand in the field to put the scarecrow up');
                return false;
            }
            const half = options.plotSize / 2;
            const x = plot.position.x + (player.position.x >= plot.position.x ? half : -half);
            const z = plot.position.z + (player.position.z >= plot.position.z ? half : -half);
            if (standing.some((entry) => Math.hypot(entry.position.x - x, entry.position.z - z) < 0.1)) {
                options.say('There is one on this corner already');
                return false;
            }
            if (!options.take()) return false;
            add(x, z, plot.position.y);
            options.onPlaced?.(new THREE.Vector3(x, plot.position.y, z));
            options.say(`It will keep ${within(new THREE.Vector3(x, 0, z)).length} plots wet, starting tomorrow morning`, '#8fb8c8');
            return true;
        },
        weep: () => {
            let watered = 0;
            for (const entry of standing) {
                for (const plot of within(entry.position)) {
                    if (plot.crop && !plot.watered) watered += 1;
                    farm.water(plot);
                }
            }
            return watered;
        },
        toJSON: () => standing.map((entry) => ({ x: entry.position.x, z: entry.position.z })),
        fromJSON: (data) => {
            for (const entry of standing) {
                game.interactions.remove(entry.object);
                entry.object.removeFromParent();
            }
            standing.length = 0;
            const y = farm.plots[0]?.position.y ?? 0;
            for (const spot of Array.isArray(data) ? (data as Array<{ x: number; z: number }>) : []) add(spot.x, spot.z, y);
        },
    };
}
