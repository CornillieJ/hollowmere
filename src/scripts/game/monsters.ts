import * as THREE from 'three';

import { randomFloat } from '../helpers/random';
import { createHollow, dressFolk, FolkAnimator } from '../content/folk';
import type { Enemy, EnemyManager } from '../game/enemies';
import type { DayCycle } from '../game/daycycle';
import { addEnemyKinds, type EnemyKindsHandle, type PopulationPost } from '../kit';

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
 *
 * They smell hot food. `setScent` says how strongly the farmer's basket
 * smells, from 0 to 1: at 1 they notice from 70% further off, the roamers
 * close in twice as fast, and more of them turn up, most of all after dark.
 */
export type HollowKind = 'walker' | 'crawler' | 'watcher';

const animators = new Map<number, FolkAnimator>();
let seed = 0;
/** How strongly the farmer's basket smells, 0 to 1. */
let scent = 0;
let dark = false;
/** Set once at boot: with it, each of them is dressed in its model as it appears. */
let hub: Game | undefined;
let kinds: EnemyKindsHandle | undefined;

/** A walk is 4.5 m/s and a run 6.8: even hurrying, none of them keeps up with someone who moves. */
const COMMON = {
    // They cannot be killed, only avoided.
    health: 1e9,
    damage: 25,
    attackRange: 1.3,
    attackCooldown: 1.6,
    // Half a second with its arms up before the blow: time to get out of reach.
    attackWindup: 0.55,
    wanderRadius: 13,
    wanderSpeed: 0.5,
    // They come on in a wandering line and at an uneven pace, and hurry a little at the end.
    meander: 0.85,
    pace: 0.8,
    focusRange: 9,
    focusBoost: 1.25,
    // Roamers drift towards wherever the farmer is.
    drift: 0.55,
    radius: 0.3,
    height: 2,
};
/** By night they see farther, close in faster and more directly, and walk a little quicker. */
const NIGHT = { scale: { speed: 1.25, aggroRange: 1.5, drift: 2 }, set: { meander: 0.55, wanderSpeed: 0.7 } };
/** A basket of hot food: noticed from 70% further off, and the roamers close in twice as fast. */
const SCENT = { aggroRange: 0.7, drift: 1 };

export function useHollowModels(game: Game, enemies: EnemyManager): void {
    hub = game;
    kinds = addEnemyKinds(game, {
        enemies,
        mood: () => (dark ? 'night' : undefined),
        alert: () => scent,
        kinds: {
            walker: { options: () => ({ ...COMMON, speed: randomFloat(1.1, 1.6), aggroRange: 14 }), moods: { night: NIGHT }, alert: SCENT },
            crawler: { options: () => ({ ...COMMON, speed: randomFloat(1.9, 2.5), aggroRange: 11, height: 1 }), moods: { night: NIGHT }, alert: SCENT },
            // It walks straight and at one speed, when it walks at all.
            watcher: { options: { ...COMMON, speed: 3.1, damage: 40, aggroRange: 26, meander: 0, pace: 0, focusBoost: 1 }, moods: { night: { scale: { aggroRange: 1.5, drift: 2 }, set: { wanderSpeed: 0.7 } } }, alert: SCENT, frozenWhenWatched: true },
        },
    });
}

/** The `animate` hook for the enemy manager: walk each Hollow with its own rig. */
export function animateHollow(enemy: Enemy, speed: number, step: number): void {
    const animator = animators.get(enemy.id);
    if (!animator) return;
    // The arms go up while it winds up, which is the moment to step back.
    animator.strike = enemy.attackProgress;
    animator.update(speed, step);
}

/** Night runs from half past seven in the evening to half past five in the morning. */
export const isNight = (dayCycle: DayCycle): boolean => dayCycle.hour >= 19.5 || dayCycle.hour < 5.5;

/** Roaming at night, for every one by day. */
export const NIGHT_FACTOR = 3;

/** How many should be roaming near the player right now. One more turns up every day, to a limit. */
export function hollowTarget(dayCycle: DayCycle, hunting: boolean): number {
    // Before the farmer has found their feet there are only a few, and they keep their distance.
    if (!hunting) return 3;
    const byDay = 3 + Math.min(5, dayCycle.day - 1);
    // A basket of hot food brings more of them out of the fog: up to 2 by day, 5 at night.
    return isNight(dayCycle) ? byDay * NIGHT_FACTOR + Math.round(scent * 5) : byDay + Math.round(scent * 2);
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

    if (hub) void dressFolk(hub, rig, `hollow-${kind}`);

    if (!kinds) throw new Error('useHollowModels has not been called');
    const enemy = kinds.spawn(position, {
        kind,
        // Before the tutorial ends they keep their manners whatever the hour.
        fixed: !hunting,
        options: {
            object: rig.root,
            name: `hollow-${kind}-${seed}`,
            ...(hunting ? {} : { aggroRange: 5, drift: 0 }),
            // The ones with a place stay near it.
            ...(post ? { wanderRadius: Math.max(4, post.radius ?? 3), leash: (post.radius ?? 3) + 22, drift: 0 } : {}),
        },
    });
    animators.set(enemy.id, new FolkAnimator(rig, kind === 'crawler' ? { stride: 1.2, stutter: 4, armSwing: 0.6 } : { stride: 0.7, stutter: 3, armSwing: 0.2 }));
    return enemy;
}

export function forgetHollow(enemy: Enemy): void {
    animators.delete(enemy.id);
    kinds?.forget(enemy);
}

/** How strongly the farmer smells of hot food right now, 0 to 1. Every one of them is told. */
export function setScent(level: number): void {
    scent = Math.max(0, Math.min(1, level));
}

export const currentScent = (): number => scent;

/** Switch every one of them to day or night manners. Call when the hour crosses over. */
export function setNightTemper(night: boolean): void {
    dark = night;
}
