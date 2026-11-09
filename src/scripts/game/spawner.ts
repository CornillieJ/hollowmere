import * as THREE from 'three';

import { SYSTEM_ORDER } from '../core/systems';
import { Cooldown } from '../helpers/timing';
import { randomFloat } from '../helpers/random';

/**
 * Wave based spawning for arena and survival modes.
 *
 * A wave spawns over time, and the next one only starts once the field is clear
 * (or the wave's timeout runs out, so one stuck enemy cannot soft-lock the
 * level). `spawn` is a plain callback, so it can create enemies, pickups,
 * obstacles, anything.
 */
export type WaveDefinition = {
    /** How many things this wave spawns. */
    count: number;
    /** Seconds between individual spawns inside the wave. Defaults to the spawner's rate. */
    interval?: number;
    /** Seconds to wait before starting the wave. */
    delay?: number;
    /** Extra seconds allowed before the wave counts as cleared anyway. */
    timeout?: number;
    /** Free-form data forwarded to the `spawn` callback. */
    data?: unknown;
};

export type WaveSpawnerOptions = {
    waves: WaveDefinition[];
    /** Called once per spawned item. `index` is 0-based inside the wave. */
    spawn: (index: number, wave: number, definition: WaveDefinition) => void;
    /** Centre of the spawn area. Defaults to the origin. */
    spawnPoint?: THREE.Vector3 | Vec3;
    /** Radius of the spawn area. 0 spawns everything on the spawn point. */
    radius?: number;
    /** Seconds between spawns when a wave does not override it. */
    interval?: number;
    /** Hard cap on live items; spawning pauses while the field is fuller. */
    maxAlive?: number;
    /** Live item count, used with `maxAlive` and to detect a cleared field. */
    aliveCount?: () => number;
    /** Start the first wave immediately. */
    autoStart?: boolean;
    /** Called when a wave starts, 1-based wave number. */
    onWaveStart?: (wave: number, definition: WaveDefinition) => void;
    /** Called when a wave finishes spawning. */
    onWaveSpawned?: (wave: number, definition: WaveDefinition) => void;
    /** Called when the field is clear and the next wave can begin. */
    onWaveCleared?: (wave: number) => void;
    /** Called after the last wave is cleared. */
    onComplete?: () => void;
};

export class WaveSpawner {
    /** 1-based current wave, 0 before the first wave starts. */
    wave = 0;
    /** `onWaveSpawned` fires once per wave, not on every frame the wave waits to be cleared. */
    private spawnAnnounced = false;
    /** True between `start` and the end of the last wave. */
    running = false;
    /** True once every wave is spawned and cleared. */
    complete = false;

    private readonly game: Game;
    private readonly options: WaveSpawnerOptions;
    private readonly spawnPoint: THREE.Vector3;
    private readonly cooldown = new Cooldown(0);
    private spawnedThisWave = 0;
    private aliveBeforeWave = 0;
    private waveTimer = 0;
    private waitingForStart = false;

    constructor(game: Game, options: WaveSpawnerOptions) {
        this.game = game;
        this.options = options;
        const point = options.spawnPoint ?? { x: 0, y: 0, z: 0 };
        this.spawnPoint = new THREE.Vector3(point.x, point.y, point.z);

        game.systems.add({
            name: 'wave-spawner',
            order: SYSTEM_ORDER.GAMEPLAY,
            update: (delta) => this.update(delta),
        });
        if (options.autoStart) this.start();
    }

    /** Total number of waves. */
    get totalWaves(): number {
        return this.options.waves.length;
    }

    /** Items left to spawn in the current wave. */
    get remainingInWave(): number {
        const definition = this.options.waves[this.wave - 1];
        return definition ? Math.max(0, definition.count - this.spawnedThisWave) : 0;
    }

    /** Begin the first wave, or resume after `stop`. */
    start(): void {
        if (this.running || this.complete) return;
        this.running = true;
        if (this.wave === 0) this.beginWave(1);
    }

    /** Stop spawning. Enemies already in the world stay. */
    stop(): void {
        this.running = false;
        this.waitingForStart = false;
    }

    /** Reset to wave zero and stop. */
    reset(): void {
        this.stop();
        this.complete = false;
        this.wave = 0;
        this.spawnedThisWave = 0;
        this.waveTimer = 0;
    }

    /**
     * Cut short the wait before the current wave starts, i.e. the player pressed
     * "start now". Does nothing once the wave is already spawning.
     */
    skipDelay(): void {
        this.waitingForStart = false;
        this.cooldown.trigger(0);
        this.waveTimer = 0;
    }

    /** Skip the remainder of the current wave and start the next one. */
    skipWave(): void {
        if (!this.running) return;
        this.spawnedThisWave = this.options.waves[this.wave - 1]?.count ?? 0;
        this.beginWave(this.wave + 1);
    }

    /** Spawn one item now, ignoring the wave schedule. */
    spawnNow(definition?: WaveDefinition): void {
        this.options.spawn(0, this.wave, definition ?? { count: 1 });
    }

    /** A random point inside the spawn area. */
    randomSpawnPoint(out = new THREE.Vector3()): THREE.Vector3 {
        const radius = this.options.radius ?? 0;
        if (radius <= 0) return out.copy(this.spawnPoint);
        const angle = randomFloat(0, Math.PI * 2);
        const distance = radius * Math.sqrt(Math.random());
        return out.set(this.spawnPoint.x + Math.cos(angle) * distance, this.spawnPoint.y, this.spawnPoint.z + Math.sin(angle) * distance);
    }

    private beginWave(wave: number): void {
        if (wave > this.options.waves.length) {
            this.running = false;
            this.complete = true;
            this.options.onComplete?.();
            return;
        }
        const definition = this.options.waves[wave - 1] as WaveDefinition;
        this.wave = wave;
        this.spawnAnnounced = false;
        this.spawnedThisWave = 0;
        this.waveTimer = 0;
        this.waitingForStart = definition.delay !== undefined && definition.delay > 0;
        this.cooldown.trigger(definition.delay ?? 0);
        this.aliveBeforeWave = this.options.aliveCount?.() ?? 0;
        this.options.onWaveStart?.(wave, definition);
    }

    private update(delta: number): void {
        if (!this.running) return;
        this.cooldown.update(delta);
        this.waveTimer += delta;

        const definition = this.options.waves[this.wave - 1];
        if (!definition) return;

        if (this.waitingForStart) {
            if (this.cooldown.ready) this.waitingForStart = false;
            return;
        }

        const maxAlive = this.options.maxAlive ?? Infinity;
        const alive = this.options.aliveCount?.() ?? 0;

        if (this.spawnedThisWave < definition.count) {
            if (this.cooldown.ready && alive < maxAlive) {
                this.options.spawn(this.spawnedThisWave, this.wave, definition);
                this.spawnedThisWave += 1;
                this.cooldown.trigger(definition.interval ?? this.options.interval ?? 0.6);
            }
            return;
        }

        if (!this.spawnAnnounced) {
            this.spawnAnnounced = true;
            this.options.onWaveSpawned?.(this.wave, definition);
        }
        const cleared = alive <= this.aliveBeforeWave || this.waveTimer > definition.count * 2 + (definition.timeout ?? 25);
        if (cleared) {
            this.options.onWaveCleared?.(this.wave);
            this.beginWave(this.wave + 1);
        }
    }
}
