import * as THREE from 'three';

import { randomFloat } from '../helpers/random';
import { createHollow, FolkAnimator } from '../content/folk';
import type { Enemy, EnemyManager } from '../game/enemies';
import type { DayCycle } from '../game/daycycle';

/**
 * The Hollow: slow, patient, always somewhere in the fog.
 *
 * Not a combat system. `addPopulation` keeps a number of them around the player
 * that rises at night and with the days, and a few stand at fixed places and
 * never leave. They are never fast enough to catch someone who keeps moving,
 * which is what makes them a resource to manage rather than a fight.
 */
const animators = new Map<number, FolkAnimator>();
let seed = 0;

/** The `animate` hook for the enemy manager: walk each Hollow with its own rig. */
export function animateHollow(enemy: Enemy, speed: number, step: number): void {
    animators.get(enemy.id)?.update(speed, step);
}

export const isNight = (dayCycle: DayCycle): boolean => dayCycle.phase === 'night' || dayCycle.phase === 'dusk';

/** How many should be roaming near the player right now. */
export function hollowTarget(dayCycle: DayCycle): number {
    const growth = Math.min(5, Math.floor((dayCycle.day - 1) / 2));
    return isNight(dayCycle) ? 10 + growth : 5 + Math.floor(growth / 2);
}

/**
 * Put one of them in the world.
 * @param posted True for the ones that keep to a place: they barely wander and notice less.
 */
export function spawnHollow(enemies: EnemyManager, position: THREE.Vector3, night: boolean, posted: boolean): Enemy {
    seed += 1;
    const rig = createHollow(seed);
    const enemy = enemies.spawn({
        position,
        object: rig.root,
        // They cannot be killed, only avoided.
        health: 1e9,
        // A walk is 4.5 m/s: even the fast ones at night lose to someone who keeps moving.
        speed: night ? randomFloat(1.6, 2.3) : randomFloat(1.1, 1.6),
        damage: 12,
        attackRange: 1.3,
        attackCooldown: 1.8,
        aggroRange: posted ? 9 : night ? 20 : 13,
        wanderRadius: posted ? 2.5 : 8,
        radius: 0.3,
        height: 2,
        name: `hollow-${seed}`,
    });
    animators.set(enemy.id, new FolkAnimator(rig, { stride: 0.7, stutter: 3, armSwing: 0.2 }));
    return enemy;
}

export function forgetHollow(enemy: Enemy): void {
    animators.delete(enemy.id);
}
