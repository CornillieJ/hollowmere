import * as THREE from 'three';

import { SYSTEM_ORDER } from '../core/systems';
import { setupGameFlow, type GameFlow } from '../core/game-state';
import { setupSceneDefaults, type SceneDefaultsOptions } from '../setup/setup-scene';
import { DEFAULT_ARENA_SIZE } from '../helpers/build';
import { ThirdPersonController, type ThirdPersonOptions } from '../controls/third-person';
import { Player } from '../game/player';
import { LightCycleArena, type LightCycle, type LightCycleOptions } from '../game/light-cycle';
import { createGame, startGame } from '../init';
import { addTouchControls } from '../kit/touch';
import type { HudOptions } from '../ui/hud';

/**
 * Third person Tron.
 *
 * Light cycles on a neon grid: you always move forward, you steer with A and D,
 * sprint with Shift and brake with Ctrl, and the ribbon you leave behind is
 * lethal to everyone including you. Last one driving wins.
 *
 * The player rides a cycle instead of walking, so this template uses its own
 * lightweight entity rather than the character controller. The camera is the
 * third person rig, aimed at the cycle.
 */
export type TronGameOptions = {
    game?: GameOptions;
    title?: string;
    subtitle?: string;
    scene?: SceneDefaultsOptions;
    controls?: ThirdPersonOptions;
    hud?: HudOptions;
    /** Side length of the arena in meters. */
    arenaSize?: number;
    /** Number of AI opponents. */
    opponents?: number;
    /** Speed of every cycle in meters per second. */
    speed?: number;
    autoStart?: boolean;
    debug?: boolean;
    build?: (world: TronWorld) => void;
    saveSlot?: string;
};

export type TronWorld = {
    game: Game;
    arena: LightCycleArena;
    player: Player;
    cycle: LightCycle;
    controls: ThirdPersonController;
    flow: GameFlow;
    /** Cycles still driving. */
    survivors: () => number;
    restart: () => void;
    dispose: () => void;
};

/**
 * Configure an existing game as a light cycle arena.
 * The player's `Player` is still created: the camera, HUD and death handling all
 * expect one. It is parked out of the way and the cycle does the moving.
 */
export function setupTronGame(game: Game, options: TronGameOptions = {}): TronWorld {
    const arenaSize = options.arenaSize ?? DEFAULT_ARENA_SIZE;

    setupSceneDefaults(game.scene, game.renderer, game.physics, {
        preset: 'neon',
        groundSize: 0,
        fog: false,
        ...options.scene,
    });
    // Dense neon haze, which is most of the Tron look.
    game.scene.fog = new THREE.FogExp2(0x120a24, 0.014);

    const arena = new LightCycleArena(game, {
        size: arenaSize,
        speed: options.speed ?? 15,
        onDeath: (cycle) => {
            // The round is over for the player the moment their cycle crashes.
            if (cycle.player) {
                game.toasts.push('You derezzed', { color: '#ff8a8a' });
                world.flow.die();
            }
        },
        onWinner: (cycle) => {
            if (cycle.player) game.events.emit('level:complete', { id: 'light-cycle' });
            else game.state.set('dead');
        },
    });

    const player = new Player(game, { position: new THREE.Vector3(0, 40, 0), object: new THREE.Group() });
    player.frozen = true;
    game.player = player;

    /** Spawn the player cycle and the rivals. Runs again on every restart. */
    const spawnCycles = (): LightCycle => {
        const playerCycle = arena.spawn({ position: new THREE.Vector3(-arenaSize / 4, 0, arenaSize / 4), yaw: Math.PI / 2, color: 0x59d3ff, player: true, name: 'You', trailHeight: 1.4 });
        for (let index = 0; index < (options.opponents ?? 2); index += 1) {
            const angle = (index / Math.max(1, options.opponents ?? 2)) * Math.PI;
            arena.spawn({
                position: new THREE.Vector3(Math.sin(angle) * arenaSize * 0.25, 0, -Math.cos(angle) * arenaSize * 0.25),
                yaw: angle + Math.PI,
                color: index % 2 === 0 ? 0xff8a3d : 0xc45bd9,
                ai: true,
                name: `Rival ${index + 1}`,
                trailHeight: 1.4,
            });
        }
        return playerCycle;
    };

    const cycle = spawnCycles();

    // The camera rig drives the invisible Player, which the cycle carries along.
    const controls = new ThirdPersonController(game, player, {
        distance: 9,
        targetHeight: 1.6,
        cameraCollision: false,
        shoulderOffset: 0,
        pitch: -0.35,
        faceDirection: false,
        jumpEnabled: false,
        ...options.controls,
    });

    game.hud.setCombatCountersVisible(false);
    game.hud.setCrosshair(false, false);

    // Steering is two actions, so two buttons are the whole mobile rig.
    addTouchControls(game, {
        joystick: false,
        buttons: [
            { action: 'left', label: '◀', primary: true, hold: true },
            { action: 'right', label: '▶', primary: true, hold: true },
            { action: 'sprint', label: '≫', hold: true },
            { action: 'crouch', label: '▼', hold: true },
        ],
    });

    let finished = false;

    const world: TronWorld = {
        game,
        arena,
        player,
        cycle,
        controls,
        flow: undefined as unknown as GameFlow,
        survivors: () => arena.aliveCount,
        restart: () => {
            finished = false;
            arena.clear();
            // Rebuilding is cheaper than resetting every ribbon sample.
            world.cycle = spawnCycles();
            game.state.set('playing', true);
        },
        dispose: () => {
            arena.dispose();
            controls.dispose();
            player.destroy();
        },
    };

    // Keep the invisible player capsule under the cycle so the camera follows it.
    game.systems.add({
        name: 'tron-follow',
        order: SYSTEM_ORDER.CONTROL - 1,
        update: () => {
            // `world.cycle` changes on every restart, the closure variable does not.
            const current = world.cycle;
            player.body.teleport(current.root.position);
            game.hud.setStat('speed', `${Math.round(current.speed * (game.input.isDown('sprint') ? 1.5 : game.input.isDown('crouch') ? 0.55 : 1))} m/s`, 'speed');
            game.hud.setStat('alive', `${arena.aliveCount}`, 'cycles');

            if (!finished && current.alive && arena.aliveCount === 1) {
                finished = true;
                game.events.emit('level:complete', { id: 'light-cycle' });
            }
        },
    });

    world.flow = setupGameFlow(game, {
        title: options.title ?? 'Light Cycle',
        ...(options.subtitle !== undefined ? { subtitle: options.subtitle } : {}),
        autoStart: options.autoStart ?? true,
        simulateWhen: ['playing'],
        hudWhen: ['playing', 'paused', 'victory', 'dead'],
        crosshairWhen: [],
        pointerLock: true,
        onStart: () => game.input.requestPointerLock(),
        onRestart: () => world.restart(),
        onContinue: () => game.save.load(options.saveSlot ?? 'default'),
    });

    options.build?.(world);
    game.world = world;
    if (options.debug) game.debug.toggle(true);
    return world;
}

/** Create the game, set it up as a light cycle arena and start it. */
export async function createTronGame(options: TronGameOptions = {}): Promise<{ game: Game; world: TronWorld }> {
    const game = await createGame({ shadows: false, ...options.game });
    const world = setupTronGame(game, options);
    startGame(game);
    return { game, world };
}

/** Add another AI rival to a running arena. */
export function addRival(world: TronWorld, options: Partial<LightCycleOptions> = {}): LightCycle {
    return world.arena.spawn({ position: new THREE.Vector3(0, 0, -world.arena.cycles.length * 3), color: 0x8ce09a, ai: true, name: `Rival ${world.arena.cycles.length}`, ...options });
}
