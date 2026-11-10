import * as THREE from 'three';

import type { Enemy, EnemyManager } from '../game/enemies';
import { forgetHollow, spawnHollow } from './monsters';

/**
 * Days that go wrong. Now and then, at some hour nobody chose, a great many of
 * the Hollow gather in one place and stay until the next dawn:
 *
 *  - the siege: they ring the village, shoulder to shoulder at the edge of the
 *    shrine's light, and getting in or out means going through them;
 *  - the overrun: they fill the farmyard, right up to the porch.
 *
 * They cannot enter the lit places, so neither is a death sentence. Both are a
 * reason to change the day's plans.
 */
export type HappeningKind = 'siege' | 'overrun';

export type HappeningsOptions = {
    enemies: EnemyManager;
    day: () => number;
    hour: () => number;
    /** False until the Hollow have started coming for the farmer. */
    enabled: () => boolean;
    village: { x: number; z: number; radius: number };
    farm: { x: number; z: number };
    heightAt: (x: number, z: number) => number;
    /** True where nothing may be put: a lit place, a wall. */
    blocked: (position: THREE.Vector3) => boolean;
    onStart: (kind: HappeningKind) => void;
};

export type HappeningsHandle = {
    readonly active: HappeningKind | undefined;
    /** How many gathered for the one going on. */
    readonly gathered: number;
    /** Start one now. */
    trigger: (kind: HappeningKind) => void;
    /** Call each morning: yesterday's crowd drifts off, and today may get its own. */
    newDay: () => void;
};

/** Chance per day that something happens, from the first day they hunt. */
const CHANCE = 0.3;

export function setupHappenings(game: Game, options: HappeningsOptions): HappeningsHandle {
    const crowd: Enemy[] = [];
    let active: HappeningKind | undefined;
    let planned: { kind: HappeningKind; hour: number } | undefined;

    const put = (x: number, z: number): void => {
        const position = new THREE.Vector3(x, options.heightAt(x, z) + 0.4, z);
        if (options.blocked(position)) return;
        // Each keeps to the patch it appeared on, so the crowd holds its shape.
        crowd.push(spawnHollow(options.enemies, position, { night: true, hunting: true, post: { x, y: 0, z, radius: 3 } }));
    };

    function trigger(kind: HappeningKind): void {
        if (active) return;
        active = kind;
        planned = undefined;
        if (kind === 'siege') {
            const { x, z, radius } = options.village;
            for (let index = 0; index < 18; index += 1) {
                const angle = (index / 18) * Math.PI * 2 + Math.random() * 0.2;
                put(x + Math.sin(angle) * (radius + 2.5 + Math.random() * 2), z + Math.cos(angle) * (radius + 2.5 + Math.random() * 2));
            }
        } else {
            for (let index = 0; index < 14; index += 1) {
                const angle = Math.random() * Math.PI * 2;
                const distance = 6 + Math.random() * 16;
                put(options.farm.x + Math.sin(angle) * distance, options.farm.z + Math.cos(angle) * distance);
            }
        }
        options.onStart(kind);
    }

    game.systems.add({
        name: 'happenings',
        order: 60,
        update: () => {
            if (planned && !active && options.enabled() && options.hour() >= planned.hour) trigger(planned.kind);
        },
    });

    return {
        get active() {
            return active;
        },
        get gathered() {
            return crowd.filter((enemy) => !enemy.dead).length;
        },
        trigger,
        newDay: () => {
            for (const enemy of crowd.splice(0)) {
                if (enemy.dead) continue;
                forgetHollow(enemy);
                options.enemies.despawn(enemy);
            }
            active = undefined;
            planned = options.enabled() && options.day() >= 3 && Math.random() < CHANCE ? { kind: Math.random() < 0.5 ? 'siege' : 'overrun', hour: 9 + Math.random() * 11 } : undefined;
        },
    };
}
