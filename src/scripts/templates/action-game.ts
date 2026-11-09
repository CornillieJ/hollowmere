import * as THREE from 'three';

import * as CONSTANTS from '../Constants/Constants';
import { setupGameFlow, type GameFlow, type GameFlowOptions } from '../core/game-state';
import { DEFAULT_ARENA_SIZE, DEFAULT_WALL_HEIGHT, BlockBuilder, createAvatar } from '../helpers/build';
import { Player, type PlayerOptions } from '../game/player';
import { EnemyManager, type EnemyManagerOptions, type EnemyOptions } from '../game/enemies';
import { PickupManager } from '../game/pickups';
import { Weapon, type WeaponOptions } from '../game/weapon';
import { setupSceneDefaults, type SceneDefaultsOptions, type SceneDefaultsRefs } from '../setup/setup-scene';
import { createGame, startGame } from '../init';
import { addTouchControls } from '../kit/touch';
import type { HudOptions } from '../ui/hud';
import type { MenuConfig } from '../ui/menus';
import type { TouchControlsOptions } from '../ui/touch-controls';

/**
 * Shared body of every "you control a character in an arena" game.
 *
 * Scene, arena, player, enemies, pickups, weapon, HUD, save slots, pause menu
 * and restart all live here. A template only supplies the control scheme, so a
 * first person, third person and top-down game cannot drift apart.
 */
export type ArenaOptions =
    | false
    | {
          /** Side length of the walled area in meters. */
          size?: number;
          /** Add a wall ring. */
          walls?: boolean;
          wallHeight?: number;
          /** Number of random cover boxes. */
          obstacles?: number;
      };

export type ActionGameOptions = {
    /** Options forwarded to `createGame`, e.g. `{ shadows: false }`. */
    game?: GameOptions;
    title?: string;
    subtitle?: string;
    scene?: SceneDefaultsOptions;
    player?: PlayerOptions;
    arena?: ArenaOptions | undefined;
    /** `false` disables the weapon entirely. */
    weapon?: WeaponOptions | false;
    hud?: HudOptions;
    /** Skip the main menu. */
    autoStart?: boolean;
    /** Where the player and the clear zone start. */
    spawnPoint?: Vec3 | undefined;
    /** Build or extend the level, runs once after the arena exists. */
    build?: (world: ActionGameWorld) => void | Promise<void>;
    /**
     * Spawn what a restart has to bring back: enemies, pickups, collectibles.
     * Runs at the start and again after every restart, once the old ones are cleared.
     */
    populate?: (world: ActionGameWorld) => void;
    debug?: boolean;
    stats?: boolean;
    saveSlot?: string;
    /** Show the control hint in the main menu. */
    hint?: string;
    /**
     * Escape hatch for the menu and flow: overrides any of the titles, menus,
     * callbacks or phase lists that this template would otherwise choose.
     */
    flow?: Partial<GameFlowOptions> & { mainMenu?: MenuConfig; pauseMenu?: MenuConfig; deathMenu?: MenuConfig; victoryMenu?: MenuConfig };
    /**
     * Give enemies a navigation grid so they walk around obstacles instead of
     * into them. Build one with `buildBlockedSet` from the level builder's cover.
     */
    navigation?: EnemyManagerOptions['navigation'];
    /** Enemy behaviour hooks, e.g. `animate` for walk cycles or `onAttack` for a sound. */
    enemies?: Omit<EnemyManagerOptions, 'navigation'>;
    /**
     * What the player looks like: the built-in placeholder avatar, nothing (right
     * for first person), a loaded model, or a factory for one, e.g. an
     * `addAnimatedAvatar` call, which needs the game hub to exist first.
     */
    playerObject?: 'avatar' | 'none' | THREE.Object3D | ((game: Game) => THREE.Object3D);
    /**
     * On-screen joystick and buttons. Installed by default; they stay hidden
     * until a finger touches the screen, so a desktop player never sees them.
     * Pass `false` to opt out, or options to change the buttons.
     */
    touch?: TouchControlsOptions | false;
};

export type ActionGameWorld = {
    game: Game;
    player: Player;
    enemies: EnemyManager;
    pickups: PickupManager;
    weapon: Weapon | undefined;
    /** Level builder, so games can add their own geometry with colliders. */
    builder: BlockBuilder;
    spawnPosition: THREE.Vector3;
    /** The scene's lights and ground, e.g. for a day cycle that moves the sun. */
    scene: SceneDefaultsRefs;
    flow: GameFlow;
    /** Put the player, enemies, effects and inventory back to their start state. */
    restart: () => void;
    dispose: () => void;
};

/** The control scheme a template injects. */
export type ActionControls = {
    dispose: () => void;
};

/**
 * Build a playable arena game.
 * @param createControls Factory for the control scheme, called once with the player.
 */
export function setupActionGame<TControls extends ActionControls>(game: Game, createControls: (game: Game, player: Player) => TControls, options: ActionGameOptions = {}): ActionGameWorld & { controls: TControls } {
    const spawnPoint = options.spawnPoint ?? { x: 0, y: 0.2, z: 0 };
    const spawnPosition = new THREE.Vector3(spawnPoint.x, spawnPoint.y, spawnPoint.z);

    const scene = setupSceneDefaults(game.scene, game.renderer, game.physics, {
        preset: 'outdoor-day',
        groundSize: 400,
        fog: true,
        ...options.scene,
    });

    const builder = new BlockBuilder(game);
    buildArena(builder, options.arena, spawnPosition);

    const playerObject =
        options.playerObject === 'none'
            ? undefined
            : typeof options.playerObject === 'function'
              ? options.playerObject(game)
              : options.playerObject instanceof THREE.Object3D
                ? options.playerObject
                : createAvatar({ color: 0x4f9bd9 });
    const player = new Player(game, {
        position: spawnPoint,
        lives: CONSTANTS.GAMEPLAY.STARTING_LIVES,
        ...(playerObject ? { object: playerObject } : {}),
        ...options.player,
    });
    game.player = player;

    const controls = createControls(game, player);
    game.interactions.useCamera(game.camera);

    if (options.touch !== false) {
        const hasWeapon = options.weapon !== false;
        addTouchControls(game, {
            buttons: [
                ...(hasWeapon ? [{ action: 'attack', label: '◉', primary: true, hold: true }] : []),
                { action: 'jump', label: '⤒', primary: !hasWeapon, hold: true },
                { action: 'sprint', label: '≫', hold: true },
                { action: 'interact', label: '✋' },
            ],
            ...options.touch,
        });
    }

    const enemies = new EnemyManager(game, {
        onAttack: () => game.effects.flash(0.18, 0xff5555, 0.15),
        ...(options.navigation ? { navigation: options.navigation } : {}),
        ...options.enemies,
    });
    const pickups = new PickupManager(game);

    let weapon: Weapon | undefined;
    if (options.weapon !== false) {
        weapon = new Weapon(game, {
            damage: 25,
            fireRate: 4.5,
            spread: 0.02,
            headshotMultiplier: 1.8,
            recoil: 0.09,
            automatic: true,
            color: 0x9fe7ff,
            onAmmoChange: (magazine, reserve) => game.hud.setAmmo(magazine ?? 0, reserve),
            ...options.weapon,
        });
        game.hud.setAmmo(weapon.magazine ?? 0, weapon.reserve);
    } else {
        game.hud.setAmmo(0);
    }

    // HUD, counters and inventory readout.
    game.hud.reset(CONSTANTS.GAMEPLAY.MAX_HEALTH, player.lives);
    game.hud.setHealthVisible(true);
    // A game where the player faints and wakes at home has endless lives, and no counter for them.
    game.hud.setLivesVisible(Number.isFinite(player.lives));
    game.hud.setAmmoVisible(options.weapon !== false);
    game.hud.setLives(player.lives);
    game.events.on('player:lives', ({ lives }) => game.hud.setLives(lives));
    game.events.on('inventory:changed', () => refreshInventoryHud(game));

    // Persistence: player, objectives and inventory all ride one save slot.
    game.save.register('player', {
        save: () => ({ health: player.health.current, lives: player.lives, position: player.position.toArray() }),
        load: (data) => {
            const saved = data as { health?: number; lives?: number; position?: number[] } | undefined;
            if (!saved) return;
            if (saved.lives !== undefined) player.lives = saved.lives;
            if (saved.health !== undefined) player.health.set(saved.health);
            if (saved.position?.length === 3) player.body.teleport(new THREE.Vector3(saved.position[0], saved.position[1], saved.position[2]));
            refreshInventoryHud(game);
        },
    });
    game.save.register('objectives', { save: () => game.objectives.toJSON(), load: (data) => game.objectives.fromJSON((data as ReturnType<typeof game.objectives.toJSON>) ?? []) });
    game.save.register('inventory', { save: () => game.inventory.toJSON(), load: (data) => game.inventory.fromJSON((data as ReturnType<typeof game.inventory.toJSON>) ?? { slots: [] }) });

    const flow = setupGameFlow(game, {
        title: options.title ?? 'Three.js Game',
        ...(options.subtitle !== undefined ? { subtitle: options.subtitle } : {}),
        autoStart: options.autoStart ?? true,
        simulateWhen: ['playing'],
        hudWhen: ['playing', 'paused', 'dead', 'victory'],
        crosshairWhen: ['playing'],
        onStart: () => game.input.requestPointerLock(),
        onRestart: () => resetWorld(),
        ...(options.hint !== undefined ? { hint: options.hint } : {}),
        onContinue: () => game.save.load(options.saveSlot ?? 'default'),
        ...options.flow,
    });

    game.events.on('player:death', ({ livesLeft }) => {
        if (livesLeft <= 0) flow.die();
    });
    // The flow shows the win screen; the template only has to keep the progress.
    game.events.on('level:complete', () => {
        if (options.saveSlot) game.save.save(options.saveSlot);
    });

    function resetWorld(): void {
        player.restart(spawnPosition);
        enemies.clear();
        pickups.clear();
        game.projectiles.clear();
        weapon?.refill();
        game.objectives.resetProgress();
        options.populate?.(world);
        refreshInventoryHud(game);
    }

    const world: ActionGameWorld & { controls: TControls } = {
        game,
        player,
        controls,
        enemies,
        pickups,
        weapon,
        builder,
        spawnPosition,
        scene,
        flow,
        restart: resetWorld,
        dispose: () => {
            enemies.dispose();
            pickups.dispose();
            builder.dispose();
            controls.dispose();
            player.destroy();
        },
    };

    options.populate?.(world);
    if (options.debug) game.debug.toggle(true);
    return world;
}

/** Add an arena of walls and cover to a builder, keeping the spawn area clear. */
export function buildArena(builder: BlockBuilder, arena: ArenaOptions | undefined, spawnPoint: THREE.Vector3): void {
    if (arena === false) return;
    const size = arena?.size ?? DEFAULT_ARENA_SIZE;
    if (arena?.walls !== false) builder.walls(size + 1, arena?.wallHeight ?? DEFAULT_WALL_HEIGHT, 0.8, { color: 0x6b7280, tag: 'wall' });
    const obstacles = arena?.obstacles ?? 8;
    // Keep a clear circle around the spawn, or the player starts inside a crate.
    if (obstacles > 0) builder.scatter(obstacles, size * 0.8, { color: 0x8b93a1, tag: 'cover', minSize: 1, maxSize: 2.6, avoid: { position: spawnPoint, radius: 6 } });
}

/** Add an enemy with arena-friendly defaults. */
export function spawnEnemy(world: Pick<ActionGameWorld, 'enemies'>, options: Partial<EnemyOptions> & { position: Vec3 | THREE.Vector3 }): void {
    world.enemies.spawn({ health: 60, speed: 2.8, damage: 9, aggroRange: 20, color: 0xd9574f, ...options });
}

/** One-line summary of what the player carries, shown in the HUD. */
export function refreshInventoryHud(game: Game): void {
    const slots = game.inventory.slots;
    if (slots.length === 0) {
        game.hud.removeStat('items');
        return;
    }
    game.hud.setStat('items', slots.map((slot) => `${slot.itemId} x${slot.amount}`).join('  '), 'items');
}

/** Create the game, run a setup function, start the loop. The common one-liner. */
export async function createAndStart<T>(gameOptions: GameOptions, setup: (game: Game) => T): Promise<{ game: Game; world: T }> {
    const game = await createGame({ shadows: true, stats: false, ...gameOptions });
    const world = setup(game);
    startGame(game);
    return { game, world };
}
