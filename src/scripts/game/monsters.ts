import * as THREE from 'three';

import { randomFloat } from '../helpers/random';
import { createHollow, FolkAnimator } from '../content/folk';
import type { Enemy, EnemyManager } from '../game/enemies';
import type { DayCycle } from '../game/daycycle';
import type { PopulationPost } from '../kit';

/**
 * The Hollow: slow, patient, always somewhere in the fog.
 *
 * Not a combat system. `addPopulation` keeps a number of them near the player
 * that rises at night and with every day, and others keep to places of their
 * own and will not be led away from them. They weave, they speed up and slow
 * down, and they hurry a little once they are close. They are still never fast
 * enough to catch someone who keeps moving.
 *
 * Three kinds:
 *  - the walker, from the first day;
 *  - the crawler, from day 3: low, quicker, short-sighted;
 *  - the watcher, from day 5: tall and pale, and it only moves while nobody is
 *    looking at it.
 */
export type HollowKind = 'walker' | 'crawler' | 'watcher';

const animators = new Map<number, FolkAnimator>();
const watchers = new Set<Enemy>();
let seed = 0;

/** The `animate` hook for the enemy manager: walk each Hollow with its own rig. */
export function animateHollow(enemy: Enemy, speed: number, step: number): void {
    const animator = animators.get(enemy.id);
    if (!animator) return;
    // The arms go up while it winds up, which is the moment to step back.
    animator.strike = enemy.attackProgress;
    animator.update(speed, step);
}

export const isNight = (dayCycle: DayCycle): boolean => dayCycle.phase === 'night' || dayCycle.phase === 'dusk';

/** How many should be roaming near the player right now. One more turns up every day, to a limit. */
export function hollowTarget(dayCycle: DayCycle, hunting: boolean): number {
    // Before the farmer has found their feet there are only a few, and they keep their distance.
    if (!hunting) return 3;
    const days = dayCycle.day - 1;
    return isNight(dayCycle) ? 8 + Math.min(9, days) : 4 + Math.min(7, days);
}

/** Which kind turns up, by day. The odd ones stay rare. */
export function pickKind(day: number): HollowKind {
    const roll = Math.random();
    if (day >= 5 && roll < 0.14) return 'watcher';
    if (day >= 3 && roll < 0.38) return 'crawler';
    return 'walker';
}

export type SpawnHollowOptions = {
    night: boolean;
    /** The place it belongs to. It keeps to it and will not be led far away. */
    post?: PopulationPost | undefined;
    /** False before the tutorial ends: it wanders, and only notices someone very close. */
    hunting: boolean;
    kind?: HollowKind;
};

export function spawnHollow(enemies: EnemyManager, position: THREE.Vector3, options: SpawnHollowOptions): Enemy {
    seed += 1;
    const kind = options.kind ?? 'walker';
    const rig = createHollow(seed);
    const { night, post, hunting } = options;

    if (kind === 'crawler') {
        // Down on all fours: the same body, folded over.
        const body = rig.root.children[0] as THREE.Object3D;
        body.rotation.x = 1.15;
        body.position.set(0, 0.55, -0.5);
    } else if (kind === 'watcher') {
        rig.root.scale.set(0.9, 1.4, 0.9);
        const pale = new THREE.MeshStandardMaterial({ color: 0xd6d2c8, roughness: 1, flatShading: true });
        rig.root.traverse((child) => {
            const mesh = child as THREE.Mesh;
            // Everything but the dark hollow of the face goes bone white.
            if (mesh.isMesh && (mesh.material as THREE.MeshStandardMaterial).color.getHex() !== 0x050404) mesh.material = pale;
        });
    }

    const speed = kind === 'crawler' ? randomFloat(1.9, 2.5) : kind === 'watcher' ? 3.1 : night ? randomFloat(1.5, 2.1) : randomFloat(1.1, 1.6);
    const enemy = enemies.spawn({
        position,
        object: rig.root,
        // They cannot be killed, only avoided.
        health: 1e9,
        // A walk is 4.5 m/s and a run 6.8: even hurrying, none of them keeps up with someone who moves.
        speed,
        damage: kind === 'watcher' ? 40 : 25,
        attackRange: 1.3,
        attackCooldown: 1.6,
        // Half a second with its arms up before the blow: time to get out of reach.
        attackWindup: 0.55,
        aggroRange: !hunting ? 5 : kind === 'crawler' ? 11 : kind === 'watcher' ? 26 : night ? 20 : 14,
        wanderRadius: post ? Math.max(4, post.radius ?? 3) : 13,
        wanderSpeed: 0.5,
        // They come on in a wandering line and at an uneven pace, and hurry a little at the end.
        meander: kind === 'watcher' ? 0 : 0.85,
        pace: kind === 'watcher' ? 0 : 0.8,
        focusRange: 9,
        focusBoost: kind === 'watcher' ? 1 : 1.25,
        // Roamers drift towards wherever the farmer is. The ones with a place stay near it.
        ...(post ? { leash: (post.radius ?? 3) + 22 } : hunting ? { drift: 0.55 } : {}),
        radius: 0.3,
        height: kind === 'crawler' ? 1 : 2,
        name: `hollow-${kind}-${seed}`,
    });
    animators.set(enemy.id, new FolkAnimator(rig, kind === 'crawler' ? { stride: 1.2, stutter: 4, armSwing: 0.6 } : { stride: 0.7, stutter: 3, armSwing: 0.2 }));
    if (kind === 'watcher') watchers.add(enemy);
    return enemy;
}

export function forgetHollow(enemy: Enemy): void {
    animators.delete(enemy.id);
    watchers.delete(enemy);
}

const TO_WATCHER = new THREE.Vector3();
const VIEW = new THREE.Vector3();

/** Watchers freeze while the camera has them in view. Call every frame. */
export function updateWatchers(camera: THREE.Camera): void {
    camera.getWorldDirection(VIEW);
    for (const watcher of watchers) {
        if (watcher.dead) {
            watchers.delete(watcher);
            continue;
        }
        TO_WATCHER.copy(watcher.root.position).sub(camera.position);
        const distance = TO_WATCHER.length();
        const seen = distance < 45 && TO_WATCHER.normalize().dot(VIEW) > 0.72;
        watcher.options.speed = seen ? 0.001 : 3.1;
    }
}
