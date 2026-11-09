import * as THREE from 'three';

import { SYSTEM_ORDER } from '../core/systems';
import { setupGameFlow, type GameFlow, type GameFlowOptions } from '../core/game-state';
import { setupSceneDefaults, type SceneDefaultsOptions } from '../setup/setup-scene';
import { CurvePath, createRibbon } from '../helpers/curve';
import { Grid, type Cell } from '../helpers/grid';
import { BlockBuilder } from '../helpers/build';
import { Player } from '../game/player';
import { TopDownController, type TopDownOptions } from '../controls/top-down';
import { createGame, startGame } from '../init';
import { addGridTowers, SELL_REFUND, type GridTowersHandle, type Tower, type TowerDefinition } from '../game/grid-towers';
import { addPathEnemies, type PathEnemiesHandle, type PathEnemyDefinition } from '../game/path-enemies';
import { addResource, addToolbar, type ResourceHandle, type ToolbarHandle } from '../kit';
import { addWaves } from '../kit';
import type { HudOptions } from '../ui/hud';
import type { MenuConfig } from '../ui/menus';

/**
 * Tower defence, composed from the kit.
 *
 * This file is only wiring: the scene, the camera, a money resource, the enemy
 * walkers, the towers, the waves, the toolbar and the flow all come from library
 * blocks. Everything specific to a tower defence - the map, the tower list, the
 * waves - is passed in.
 *
 * The instanced version of this is `addGridTowers` plus `addPathEnemies`, which
 * is what the tower defence game in CornillieJ/tower-defence uses.
 */
export type TowerDefenseOptions = {
    game?: GameOptions;
    title?: string;
    subtitle?: string;
    scene?: SceneDefaultsOptions;
    camera?: TopDownOptions;
    hud?: HudOptions;
    /** Route the enemies walk, at least two points. */
    path: Array<THREE.Vector3 | Vec3>;
    /** Buildable land. Defaults to the route's bounding box plus a margin. */
    grid?: { columns?: number; rows?: number; cellSize?: number; origin?: THREE.Vector3 | Vec3; margin?: number };
    /** Extra cells that cannot be built on, on top of the route itself. */
    blocked?: (cell: Cell) => boolean;
    towers: TowerDefinition[];
    enemies: PathEnemyDefinition[];
    waves: WaveConfig[];
    lives?: number;
    money?: number;
    pathWidth?: number;
    showPath?: boolean;
    autoStart?: boolean;
    debug?: boolean;
    build?: (world: TowerDefenseWorld) => void;
    flow?: Partial<GameFlowOptions> & { mainMenu?: MenuConfig; pauseMenu?: MenuConfig; deathMenu?: MenuConfig; victoryMenu?: MenuConfig };
    onWaveCleared?: (wave: number, world: TowerDefenseWorld) => void;
    onVictory?: (world: TowerDefenseWorld) => void;
    onDefeat?: (world: TowerDefenseWorld) => void;
};

/** A wave: which enemies, how many, and how tough. */
export type WaveConfig = {
    entries: Array<{ enemy: string; count: number }>;
    interval?: number;
    delay?: number;
    reward?: number;
    healthScale?: number;
};

export type TowerDefenseWorld = {
    game: Game;
    builder: BlockBuilder;
    grid: Grid;
    path: CurvePath;
    walkers: PathEnemiesHandle;
    towers: GridTowersHandle;
    toolbar: ToolbarHandle;
    money: ResourceHandle;
    flow: GameFlow;
    wave: number;
    /** Build on a cell with the selected tower. */
    placeTower: (cell: Cell) => boolean;
    /** Start the current wave now instead of waiting. */
    startWave: () => void;
    restart: () => void;
    dispose: () => void;
};

/** Configure an existing game as a tower defence. */
export function setupTowerDefense(game: Game, options: TowerDefenseOptions): TowerDefenseWorld {
    if (options.path.length < 2) throw new Error('[tower-defense] a path needs at least two waypoints');

    setupSceneDefaults(game.scene, game.renderer, game.physics, {
        preset: 'outdoor-day',
        groundSize: 0,
        fog: false,
        ...options.scene,
    });

    const builder = new BlockBuilder(game);
    const path = new CurvePath(options.path, { mode: 'once', speed: 0, samples: 240 });
    const cellSize = options.grid?.cellSize ?? 2;
    const margin = options.grid?.margin ?? 6;

    const bounds = new THREE.Box3().setFromPoints(options.path.map((point) => new THREE.Vector3(point.x, point.y, point.z)));
    const grid = new Grid({
        width: options.grid?.columns ?? Math.ceil((bounds.max.x - bounds.min.x + margin * 2) / cellSize),
        depth: options.grid?.rows ?? Math.ceil((bounds.max.z - bounds.min.z + margin * 2) / cellSize),
        spacing: cellSize,
        origin: options.grid?.origin ?? new THREE.Vector3(bounds.min.x - margin, 0, bounds.min.z - margin),
        y: 0,
    });

    buildGround(builder, grid, path, options);

    // A tower defence has no character, but the camera rig expects one.
    const player = new Player(game, { position: grid.center(), object: new THREE.Group() });
    player.frozen = true;
    game.player = player;

    new TopDownController(game, player, {
        height: Math.max(grid.depth * cellSize * 0.62, 26),
        pitch: -Math.PI / 2.35,
        rotateWithMouse: true,
        jumpEnabled: false,
        faceDirection: false,
        ...options.camera,
    });

    // Money and lives are just resources, so they get HUD rows for free.
    const money = addResource(game, { id: 'gold', label: 'Gold', initial: options.money ?? 250, format: (value) => `$${value}` });
    const lives = addResource(game, { id: 'lives', label: 'Lives', initial: options.lives ?? 20, min: 0 });

    const enemyById = new Map(options.enemies.map((enemy) => [enemy.id, enemy]));
    const towerById = new Map(options.towers.map((tower) => [tower.id, tower]));

    const walkers = addPathEnemies(game, {
        path,
        onKill: (enemy) => money.add(enemy.definition.reward ?? 5),
        onLeak: (enemy) => {
            lives.add(-(enemy.definition.leak ?? 1));
            game.effects.flash(0.25, 0xff4444, 0.25);
            game.effects.shake.add(0.3);
            if (lives.value() <= 0) {
                options.onDefeat?.(world);
                world.flow.die();
            }
        },
    });

    const towers = addGridTowers(game, {
        grid,
        path,
        pathClearance: (options.pathWidth ?? 2) * 0.8,
        targets: () => walkers.enemies,
        onDamage: (target, amount) => walkers.damage(target, amount),
        onSpend: (amount) => money.trySpend(amount),
        onRefund: (amount) => money.add(amount),
        ...(options.blocked ? { blocked: options.blocked } : {}),
        onChanged: () => refreshHud(),
    });

    const toolbar = addToolbar(game, {
        label: 'Build a tower',
        entries: options.towers.map((tower, index) => ({
            id: tower.id,
            label: tower.name,
            cost: tower.cost,
            hotkey: String(index + 1),
            detail: `dmg ${tower.damage}  rng ${tower.range}  ${tower.fireRate}/s`,
            ...(tower.description !== undefined ? { description: tower.description } : {}),
            ...(tower.icon !== undefined ? { icon: tower.icon } : {}),
            ...(tower.color !== undefined ? { accent: `#${new THREE.Color(tower.color).getHexString()}` } : {}),
        })),
        onSelect: (id) => {
            const definition = id ? towerById.get(id) : undefined;
            if (definition) towers.beginPlacement(definition);
            else towers.endPlacement();
        },
    });

    const world: TowerDefenseWorld = {
        game,
        builder,
        grid,
        path,
        walkers,
        towers,
        toolbar,
        money,
        flow: undefined as unknown as GameFlow,
        wave: 0,
        placeTower: (cell) => {
            const definition = selectedDefinition();
            return definition ? towers.place(definition, cell) : false;
        },
        startWave: () => spawner.skipDelay(),
        restart: () => restart(),
        dispose: () => dispose(),
    };

    const spawner = addWaves(game, {
        waves: options.waves.map((wave, index) => ({
            count: wave.entries.reduce((total: number, entry: { count: number }) => total + entry.count, 0),
            interval: wave.interval ?? 0.9,
            delay: wave.delay ?? (index === 0 ? 8 : 5),
        })),
        radius: 0,
        spawnPoint: path.positionAt(0),
        aliveCount: () => walkers.enemies.length,
        spawn: (index, waveNumber) => {
            const config = options.waves[waveNumber - 1];
            if (!config) return;
            const entry = pickEntry(config.entries, index);
            const definition = enemyById.get(entry.enemy);
            if (!definition) {
                console.warn(`[tower-defense] no enemy named "${entry.enemy}"`);
                return;
            }
            walkers.spawn({ ...definition, healthScale: config.healthScale ?? 1 });
        },
        onWaveStart: (waveNumber) => {
            world.wave = waveNumber;
            game.toasts.push(`Wave ${waveNumber} of ${options.waves.length}`, { color: '#ffd166' });
            refreshHud();
        },
        onWaveCleared: (waveNumber) => {
            const reward = options.waves[waveNumber - 1]?.reward ?? 20 + waveNumber * 5;
            money.add(reward);
            game.toasts.push(`Wave cleared, +$${reward}`, { color: '#b6f5b6' });
            options.onWaveCleared?.(waveNumber, world);
        },
        onComplete: () => {
            options.onVictory?.(world);
            game.events.emit('level:complete', { id: 'tower-defense' });
        },
    });

    /** Which entry of a wave the nth spawn belongs to. */
    function pickEntry(entries: Array<{ enemy: string; count: number }>, index: number): { enemy: string; count: number } {
        let seen = 0;
        for (const entry of entries) {
            seen += entry.count;
            if (index < seen) return entry;
        }
        return entries[entries.length - 1] as { enemy: string; count: number };
    }

    function selectedDefinition(): TowerDefinition | undefined {
        const selected = toolbar.selected;
        return selected ? towerById.get(selected) : undefined;
    }

    function refreshHud(): void {
        game.hud.setStat('enemies', walkers.enemies.length, 'enemies');
        game.hud.setObjective(lives.value() > 0 ? 'Defend the road' : 'The road was overrun');
        toolbar.setMoney(money.value());
    }

    game.systems.add({ name: 'tower-defense-hud', order: SYSTEM_ORDER.UI, update: () => refreshHud() });

    function restart(): void {
        towers.clear();
        walkers.clear();
        money.set(options.money ?? 250);
        lives.set(options.lives ?? 20);
        world.wave = 0;
        toolbar.select(undefined);
        towers.endPlacement();
        spawner.reset();
        spawner.start();
        refreshHud();
    }

    function dispose(): void {
        towers.dispose();
        walkers.dispose();
        toolbar.dispose();
        builder.dispose();
    }

    game.hud.setCombatCountersVisible(false);
    game.hud.setCrosshair(false, false);

    world.flow = setupGameFlow(game, {
        title: options.title ?? 'Tower Defence',
        ...(options.subtitle !== undefined ? { subtitle: options.subtitle } : {}),
        autoStart: options.autoStart ?? true,
        simulateWhen: ['playing'],
        hudWhen: ['playing', 'paused', 'dead', 'victory'],
        crosshairWhen: [],
        pointerLock: false,
        onRestart: () => restart(),
        ...options.flow,
    });

    refreshHud();
    spawner.start();
    options.build?.(world);
    game.world = world;
    if (options.debug) game.debug.toggle(true);
    return world;
}

/** Create the game, set it up as a tower defence and start it. */
export async function createTowerDefense(options: TowerDefenseOptions): Promise<{ game: Game; world: TowerDefenseWorld }> {
    const game = await createGame({ shadows: true, ...options.game });
    const world = setupTowerDefense(game, options);
    startGame(game);
    return { game, world };
}

/** Ground plate and the drawn route. */
export function buildGround(builder: BlockBuilder, grid: Grid, path: CurvePath, options: Pick<TowerDefenseOptions, 'pathWidth' | 'showPath'>): void {
    const centre = grid.center();
    builder.box({
        size: { x: grid.width * grid.spacing, y: 0.4, z: grid.depth * grid.spacing },
        position: { x: centre.x, y: -0.2, z: centre.z },
        color: 0x6f7f5a,
        tag: 'ground',
    });

    if (options.showPath === false) return;
    // A flat ribbon, not a tube: a tube is a cylinder, so the road would be half
    // buried and the enemies walking it would be inside the mesh.
    const ribbon = createRibbon(path, (options.pathWidth ?? 2) * 1.15, { y: 0.03 });
    ribbon.name = 'road';
    builder.scene.add(ribbon);
}

/** Keys and clicks a tower defence reacts to, for the pause menu and the docs. */
export const TOWER_DEFENSE_CONTROLS = ['1-9 pick a tower', 'click a plot to build', 'click a tower to upgrade', 'hold Shift and click to sell', 'drag to orbit'];

export { SELL_REFUND, type Tower, type TowerDefinition };
