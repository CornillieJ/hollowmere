import * as THREE from 'three';

import { SYSTEM_ORDER } from '../core/systems';
import { randomFloat } from '../helpers/random';
import type { Enemy, EnemyManager } from '../game/enemies';

//#region Population

/**
 * Keeps the world around the player populated without waves or a kill count:
 * wanderers in the fog, wildlife, patrols. The number that should be about is a
 * function, so it can follow the time of day or the difficulty. New ones appear
 * out of sight at a distance, and the ones left far behind are let go, so the
 * count travels with the player across a large map.
 *
 * `posts` are fixed places with regulars of their own: one figure at a
 * crossroads, or a handful that keep to a graveyard. They are counted apart from
 * the roamers and never follow the player away, so a crowd cannot be gathered
 * in one corner to leave the rest of the map empty.
 *
 * ```ts
 * addPopulation(game, {
 *     enemies: world.enemies,
 *     target: () => (dayCycle.phase === 'night' ? 10 : 5),
 *     spawn: (position) => world.enemies.spawn({ position, speed: 1.4, health: 40 }),
 *     canSpawnAt: (position) => !safeZones.zoneAt(position),
 *     heightAt: (x, z) => terrain.heightAt(x, z),
 * });
 * ```
 */
export type AddPopulationOptions = {
    enemies: EnemyManager;
    /** How many roamers should be around right now. */
    target: () => number;
    /** Create one at a position. `post` is set for the ones that belong to a fixed place. */
    spawn: (position: THREE.Vector3, post: PopulationPost | undefined) => Enemy;
    /** New ones appear between these distances from the player. Defaults to 38 and 60. */
    spawnDistance?: [number, number];
    /** Anything farther than this is removed. Defaults to 95. */
    despawnDistance?: number;
    /** Seconds between spawns, fixed or a range to roll from. Defaults to 6 to 12. */
    interval?: () => number | [number, number];
    /** Refuse a spot, e.g. inside a safe zone or a building. */
    canSpawnAt?: (position: THREE.Vector3) => boolean;
    /** Ground height, so spawns stand on terrain. */
    heightAt?: (x: number, z: number) => number;
    /** Half the map size: nothing spawns outside it. */
    bounds?: number;
    /** Fixed places that keep their own regulars while the player is in the area. */
    posts?: PopulationPost[];
    onDespawn?: (enemy: Enemy) => void;
};

/** A place with regulars. `count` of them spawn within `radius` of it. */
export type PopulationPost = Vec3 & { count?: number; radius?: number; name?: string };

export type PopulationHandle = {
    /** Roamers alive right now, not counting the ones at posts. */
    readonly count: number;
    /** Remove everything, e.g. when a new day starts. */
    clear: () => void;
    dispose: () => void;
};

export function addPopulation(game: Game, options: AddPopulationOptions): PopulationHandle {
    const roamers = new Set<Enemy>();
    const posted = new Map<PopulationPost, Enemy[]>();
    const [near, far] = options.spawnDistance ?? [38, 60];
    const despawnDistance = options.despawnDistance ?? 95;
    let timer = 2;

    const alive = (enemy: Enemy): boolean => !enemy.dead && options.enemies.all.includes(enemy);
    const release = (enemy: Enemy): void => {
        options.onDespawn?.(enemy);
        options.enemies.despawn(enemy);
    };
    const ground = (x: number, z: number): number => options.heightAt?.(x, z) ?? 0;

    function spawnSpot(around: THREE.Vector3): THREE.Vector3 | undefined {
        for (let attempt = 0; attempt < 8; attempt += 1) {
            const angle = Math.random() * Math.PI * 2;
            const distance = randomFloat(near, far);
            const x = around.x + Math.sin(angle) * distance;
            const z = around.z + Math.cos(angle) * distance;
            if (options.bounds !== undefined && (Math.abs(x) > options.bounds || Math.abs(z) > options.bounds)) continue;
            const spot = new THREE.Vector3(x, ground(x, z) + 0.4, z);
            if (options.canSpawnAt && !options.canSpawnAt(spot)) continue;
            return spot;
        }
        return undefined;
    }

    const removeSystem = game.systems.add({
        name: 'population',
        order: SYSTEM_ORDER.GAMEPLAY + 5,
        update: (delta) => {
            const player = game.player;
            if (!player) return;

            for (const enemy of [...roamers]) {
                if (!alive(enemy)) roamers.delete(enemy);
                else if (enemy.root.position.distanceTo(player.position) > despawnDistance) {
                    roamers.delete(enemy);
                    release(enemy);
                }
            }

            // Posts fill while the player is in the area but too far to see it happen.
            for (const post of options.posts ?? []) {
                const distance = Math.hypot(post.x - player.position.x, post.z - player.position.z);
                const standing = (posted.get(post) ?? []).filter(alive);
                posted.set(post, standing);
                if (distance > despawnDistance) {
                    for (const enemy of standing) release(enemy);
                    standing.length = 0;
                } else if (standing.length < (post.count ?? 1) && distance > near * 0.6 && distance < despawnDistance - 10) {
                    const angle = Math.random() * Math.PI * 2;
                    const reach = Math.random() * (post.radius ?? 0);
                    const x = post.x + Math.sin(angle) * reach;
                    const z = post.z + Math.cos(angle) * reach;
                    standing.push(options.spawn(new THREE.Vector3(x, ground(x, z) + 0.4, z), post));
                }
            }

            timer -= delta;
            if (timer > 0 || roamers.size >= options.target()) return;
            const interval = options.interval?.() ?? [6, 12];
            timer = Array.isArray(interval) ? randomFloat(interval[0], interval[1]) : interval;
            const spot = spawnSpot(player.position);
            if (spot) roamers.add(options.spawn(spot, undefined));
        },
    });

    const clear = (): void => {
        for (const enemy of [...roamers, ...[...posted.values()].flat()]) if (alive(enemy)) release(enemy);
        roamers.clear();
        posted.clear();
    };

    return {
        get count() {
            return roamers.size;
        },
        clear,
        dispose: () => {
            clear();
            removeSystem();
        },
    };
}

//#endregion Population
