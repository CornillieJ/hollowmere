import * as THREE from 'three';

import { WaveSpawner, type WaveDefinition } from '../game/spawner';
import { setupActionGame, createAndStart, refreshInventoryHud, type ActionGameOptions, type ActionGameWorld } from './action-game';
import { FirstPersonController, type FirstPersonOptions } from '../controls/first-person';
import { TopDownController, type TopDownOptions } from '../controls/top-down';
import { ThirdPersonController, type ThirdPersonOptions } from '../controls/third-person';
import type { Player } from '../game/player';

/**
 * Wave survival arena.
 *
 * Enemies arrive in waves, the field has to be cleared before the next one
 * starts, and surviving every wave wins. Pick the camera style with `view`, so
 * the same waves work as a first person shooter, a third person shooter or a
 * top-down twin stick arena.
 */
export type ArenaView = 'first-person' | 'third-person' | 'top-down';

export type ArenaShooterOptions = ActionGameOptions & {
    /** Camera and movement style. */
    view?: ArenaView;
    /** Options for whichever view is chosen. */
    controls?: FirstPersonOptions | ThirdPersonOptions | TopDownOptions;
    /** Enemy hit points per wave. */
    enemyHealth?: number;
    /** Enemies in the first wave. */
    startCount?: number;
    /** Extra enemies per wave. */
    countStep?: number;
    /** Number of waves to survive. */
    waves?: number;
    /** Seconds between individual spawns inside a wave. */
    spawnInterval?: number;
    /** Cap on live enemies. */
    maxAlive?: number;
};

export type ArenaShooterWorld = ActionGameWorld & {
    controls: FirstPersonController | ThirdPersonController | TopDownController;
    spawner: WaveSpawner;
    view: ArenaView;
};

/** Configure an existing game as a wave survival arena. */
export function setupArenaShooter(game: Game, options: ArenaShooterOptions = {}): ArenaShooterWorld {
    const view = options.view ?? 'third-person';

    // Declared first: the restart hook passed to the action setup needs to reach it.
    let spawner: WaveSpawner | undefined;
    const world = setupActionGame(
        game,
        (hub: Game, player: Player) => {
            switch (view) {
                case 'first-person':
                    return new FirstPersonController(hub, player, { headBob: 0.03, ...(options.controls as FirstPersonOptions | undefined) });
                case 'top-down':
                    return new TopDownController(hub, player, { height: 20, pitch: -Math.PI / 2.4, jumpEnabled: false, ...(options.controls as TopDownOptions | undefined) });
                default:
                    return new ThirdPersonController(hub, player, { distance: 5.5, targetHeight: 1.5, shoulderOffset: 0.5, ...(options.controls as ThirdPersonOptions | undefined) });
            }
        },
        {
            ...options,
            playerObject: view === 'first-person' ? 'none' : 'avatar',
            // A restart starts the waves over. The spawner does not exist on the first call yet.
            populate: (built) => {
                options.populate?.(built);
                spawner?.reset();
                spawner?.start();
            },
        },
    );

    const totalWaves = options.waves ?? 5;
    const startCount = options.startCount ?? 3;
    const countStep = options.countStep ?? 2;
    const enemyHealth = options.enemyHealth ?? 60;

    const waves: WaveDefinition[] = Array.from({ length: totalWaves }, (_unused, index) => ({
        count: startCount + index * countStep,
        interval: Math.max(0.25, (options.spawnInterval ?? 0.9) - index * 0.08),
        delay: index === 0 ? 3 : 6,
        timeout: 30 + index * 6,
    }));

    const waveSpawner = new WaveSpawner(game, {
        waves,
        radius: 18,
        spawnPoint: world.spawnPosition,
        maxAlive: options.maxAlive ?? 18,
        aliveCount: () => world.enemies.count,
        spawn: (index, wave, definition) => {
            const point = waveSpawner.randomSpawnPoint();
            world.enemies.spawn({
                position: point.setY(0.4),
                health: enemyHealth + (wave - 1) * 10,
                speed: 2.6 + wave * 0.12,
                damage: 8 + wave,
                aggroRange: 40,
                color: new THREE.Color().setHSL((wave * 0.12 + index * 0.01) % 1, 0.55, 0.55),
                loot: [{ itemId: 'cell', amount: 2 }],
            });
            void definition;
            void index;
        },
        onWaveStart: (wave) => {
            game.toasts.push(`Wave ${wave} of ${totalWaves}`, { color: '#ffd166' });
            game.objectives.add('waves', `Survive ${totalWaves} waves`, { target: totalWaves });
            game.hud.setStat('wave', `${wave}/${totalWaves}`, 'wave');
        },
        onWaveCleared: (wave) => {
            game.objectives.advance('waves');
            game.toasts.push(`Wave ${wave} cleared`, { color: '#b6f5b6' });
            game.effects.healText(world.player.position.clone().setY(1.4), 10);
            world.player.heal(10);
        },
        onComplete: () => game.events.emit('level:complete', { id: 'arena' }),
    });

    game.hud.setStat('wave', `1/${totalWaves}`, 'wave');
    game.systems.add({
        name: 'arena-hud',
        order: 99,
        update: (_delta, hub) => {
            hub.hud.setStat('enemies', `${world.enemies.count} left`, 'enemies');
            refreshInventoryHud(hub);
        },
    });

    spawner = waveSpawner;
    waveSpawner.start();

    game.world = world;
    if (options.build) void options.build(world);
    return { ...world, controls: world.controls, spawner: waveSpawner, view };
}

/** Create the game, set it up as a wave survival arena and start it. */
export async function createArenaShooter(options: ArenaShooterOptions = {}): Promise<{ game: Game; world: ArenaShooterWorld }> {
    return createAndStart(options.game ?? {}, (game) => setupArenaShooter(game, options));
}
