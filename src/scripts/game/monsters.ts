import * as THREE from 'three';

import { SYSTEM_ORDER } from '../core/systems';
import { randomFloat } from '../helpers/random';
import { createHollow, FolkAnimator } from '../content/folk';
import type { Enemy, EnemyManager } from '../game/enemies';
import type { DayCycle } from '../game/daycycle';
import type { SafeZonesHandle } from '../kit';

/**
 * The Hollow: slow, patient, always somewhere in the fog.
 *
 * Not a combat system. The director keeps a number of them around the player
 * that rises at night and with the days, spawns them out in the mist where they
 * cannot be seen arriving, and lets the far ones go. They are never fast enough
 * to catch someone who keeps moving, which is what makes them a resource to
 * manage rather than a fight.
 */
export type MonsterDirectorOptions = {
    enemies: EnemyManager;
    dayCycle: DayCycle;
    safeZones: SafeZonesHandle;
    /** Nothing spawns closer than this. */
    spawnDistance?: [number, number];
    /** The world's half size, so spawns stay on the map. */
    bounds: number;
};

const animators = new Map<number, FolkAnimator>();

/** The `animate` hook for the enemy manager: walk each Hollow with its own rig. */
export function animateHollow(enemy: Enemy, speed: number, step: number): void {
    animators.get(enemy.id)?.update(speed, step);
}

export class MonsterDirector {
    private readonly options: MonsterDirectorOptions;
    private timer = 2;
    private seed = 0;

    constructor(game: Game, options: MonsterDirectorOptions) {
        this.options = options;
        game.systems.add({
            name: 'monster-director',
            order: SYSTEM_ORDER.GAMEPLAY + 5,
            update: (delta) => this.update(game, delta),
        });
    }

    /** How many should be about right now. */
    get target(): number {
        const { dayCycle } = this.options;
        const night = dayCycle.phase === 'night' || dayCycle.phase === 'dusk';
        const growth = Math.min(4, Math.floor((dayCycle.day - 1) / 2));
        return night ? 7 + growth : 3 + Math.floor(growth / 2);
    }

    get isNight(): boolean {
        return this.options.dayCycle.phase === 'night' || this.options.dayCycle.phase === 'dusk';
    }

    /** Remove every Hollow, e.g. when the player wakes up at home. */
    clear(): void {
        this.options.enemies.clear();
        animators.clear();
    }

    private update(game: Game, delta: number): void {
        const player = game.player;
        if (!player) return;
        const { enemies } = this.options;

        // Let the far ones go, so the count follows the player around the map.
        for (const enemy of [...enemies.all]) {
            if (enemy.root.position.distanceTo(player.position) > 95) this.despawn(enemies, enemy);
        }

        this.timer -= delta;
        if (this.timer > 0 || enemies.count >= this.target) return;
        this.timer = this.isNight ? randomFloat(3, 6) : randomFloat(8, 14);
        const spot = this.spawnSpot(player.position);
        if (spot) this.spawn(spot);
    }

    private spawnSpot(around: THREE.Vector3): THREE.Vector3 | undefined {
        const [near, far] = this.options.spawnDistance ?? [38, 60];
        for (let attempt = 0; attempt < 8; attempt += 1) {
            const angle = Math.random() * Math.PI * 2;
            const distance = randomFloat(near, far);
            const spot = new THREE.Vector3(around.x + Math.sin(angle) * distance, 0.4, around.z + Math.cos(angle) * distance);
            const bounds = this.options.bounds - 4;
            if (Math.abs(spot.x) > bounds || Math.abs(spot.z) > bounds) continue;
            if (this.options.safeZones.zoneAt(spot)) continue;
            return spot;
        }
        return undefined;
    }

    private spawn(position: THREE.Vector3): void {
        this.seed += 1;
        const rig = createHollow(this.seed);
        const night = this.isNight;
        const enemy = this.options.enemies.spawn({
            position,
            object: rig.root,
            // They cannot be killed, only avoided.
            health: 1e9,
            // A walk is 4.5 m/s: even the fast ones at night lose to someone who keeps moving.
            speed: night ? randomFloat(1.6, 2.3) : randomFloat(1.1, 1.6),
            damage: 12,
            attackRange: 1.3,
            attackCooldown: 1.8,
            aggroRange: night ? 20 : 13,
            wanderRadius: 8,
            radius: 0.3,
            height: 2,
            name: `hollow-${this.seed}`,
        });
        animators.set(enemy.id, new FolkAnimator(rig, { stride: 0.7, stutter: 3, armSwing: 0.2 }));
    }

    private despawn(enemies: EnemyManager, enemy: Enemy): void {
        animators.delete(enemy.id);
        enemies.despawn(enemy);
    }
}
