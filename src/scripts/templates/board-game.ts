import * as THREE from 'three';

import { setupGameFlow, type GameFlow, type GameFlowOptions } from '../core/game-state';
import { Board, type BoardOptions } from '../game/board';
import { OrbitController, type OrbitOptions } from '../controls/orbit';
import { setupGradientBackground, setupSceneDefaults, type SceneDefaultsOptions } from '../setup/setup-scene';
import { createGame, startGame } from '../init';
import type { HudOptions } from '../ui/hud';
import type { MenuConfig } from '../ui/menus';
import type { Cell } from '../helpers/grid';

/**
 * Turn based board game, the template behind 3D chess.
 *
 * No player character and no physics movement: an orbit camera, a clickable
 * grid, and a turn machine. You supply the pieces and the rules; the board
 * handles picking, moving, capturing and highlighting.
 */
export type BoardGameOptions<T = unknown> = {
    game?: GameOptions;
    title?: string;
    subtitle?: string;
    scene?: SceneDefaultsOptions;
    /** Backdrop gradient, top then bottom colour. `false` keeps the preset background. */
    backdrop?: [THREE.ColorRepresentation, THREE.ColorRepresentation] | false;
    /** Colour of the table the board stands on. `false` for no table. */
    table?: THREE.ColorRepresentation | false;
    camera?: OrbitOptions;
    board?: BoardOptions;
    hud?: HudOptions;
    autoStart?: boolean;
    /** Player names shown in the HUD, defaults to White and Black. */
    sides?: [string, string];
    /** Build the starting position. Runs after the board exists. */
    setup?: (world: BoardGameWorld<T>) => void;
    /**
     * Rebuild a piece's object from its data. Give it, and saves keep the whole
     * position; without it, only whose turn it is survives a save.
     */
    createPiece?: (data: T) => THREE.Object3D;
    /** Escape hatch for the menu and flow: titles, menus, callbacks, phase lists. */
    flow?: Partial<GameFlowOptions> & { mainMenu?: MenuConfig; pauseMenu?: MenuConfig; deathMenu?: MenuConfig; victoryMenu?: MenuConfig };
    debug?: boolean;
    stats?: boolean;
    saveSlot?: string;
};

export type BoardGameWorld<T = unknown> = {
    game: Game;
    board: Board<T>;
    camera: OrbitController;
    flow: GameFlow;
    /** Whose turn it is: 0 or 1. */
    turn: number;
    /** Half moves played, for a move counter. */
    moveCount: number;
    /** Switch to the other side and update the HUD. */
    endTurn: () => void;
    /** A side has won. */
    finish: (winner: number) => void;
    /** Reset the board and start from side 0. */
    restart: () => void;
    dispose: () => void;
};

/** Configure an existing game as a board game. */
export function setupBoardGame<T = unknown>(game: Game, options: BoardGameOptions<T> = {}): BoardGameWorld<T> {
    setupSceneDefaults(game.scene, game.renderer, game.physics, {
        preset: 'indoor',
        groundSize: 0,
        ...options.scene,
    });

    if (options.backdrop !== false) {
        const [top, bottom] = options.backdrop ?? [0x2a2f3a, 0x0b0c10];
        setupGradientBackground(game.scene, top, bottom);
    }

    const board = new Board<T>(game, { columns: 8, rows: 8, coordinates: true, ...options.board });
    if (options.table !== false) game.scene.add(createTable(board, options.table ?? 0x1c1a19));
    const camera = new OrbitController(game, {
        target: new THREE.Vector3(0, 0, 0),
        distance: 12,
        minDistance: 6,
        maxDistance: 26,
        maxPolarAngle: Math.PI / 2.2,
        dampingFactor: 0.2,
        ...options.camera,
    });

    // A board game has no health, lives or ammo, so those counters must not show.
    game.hud.setCrosshair(false, false);
    game.hud.setCombatCountersVisible(false);

    const sides = options.sides ?? ['White', 'Black'];
    const world: BoardGameWorld<T> = {
        game,
        board,
        camera,
        // Filled in below; the flow needs the world for its callbacks.
        flow: undefined as unknown as GameFlow,
        turn: 0,
        moveCount: 0,
        endTurn: () => undefined,
        finish: () => undefined,
        restart: () => undefined,
        dispose: () => undefined,
    };

    const updateHud = (): void => {
        game.hud.setStat('turn', sides[world.turn] ?? `Side ${world.turn + 1}`, 'turn');
        game.hud.setStat('moves', world.moveCount, 'moves');
    };

    world.endTurn = () => {
        world.turn = (world.turn + 1) % sides.length;
        world.moveCount += 1;
        board.select(undefined);
        board.setLegalTargets([]);
        updateHud();
    };

    world.finish = (winner: number) => {
        game.hud.setObjective(`${sides[winner] ?? `Side ${winner + 1}`} wins`);
        game.events.emit('level:complete', { id: 'board' });
    };

    world.restart = () => {
        board.clear();
        game.hud.setObjective('');
        world.turn = 0;
        world.moveCount = 0;
        updateHud();
        options.setup?.(world);
        game.state.set('playing', true);
    };

    world.dispose = () => {
        board.dispose();
        camera.dispose();
    };

    const flow = setupGameFlow(game, {
        title: options.title ?? 'Board Game',
        ...(options.subtitle !== undefined ? { subtitle: options.subtitle } : {}),
        autoStart: options.autoStart ?? true,
        simulateWhen: ['playing'],
        hudWhen: ['playing', 'paused', 'dead', 'victory'],
        crosshairWhen: [],
        pointerLock: false,
        onRestart: () => world.restart(),
        onContinue: () => game.save.load(options.saveSlot ?? 'default'),
        ...options.flow,
    });
    world.flow = flow;

    const createPiece = options.createPiece;
    game.save.register('board', {
        save: () => ({
            turn: world.turn,
            moveCount: world.moveCount,
            ...(createPiece ? { pieces: board.pieces.map((piece) => ({ cell: piece.cell, data: piece.data })) } : {}),
        }),
        load: (data) => {
            const saved = data as { turn?: number; moveCount?: number; pieces?: Array<{ cell: Cell; data: T }> } | undefined;
            if (!saved) return;
            world.turn = saved.turn ?? 0;
            world.moveCount = saved.moveCount ?? 0;
            if (createPiece && saved.pieces) {
                board.clear();
                for (const piece of saved.pieces) board.addPiece(piece.cell, createPiece(piece.data), piece.data);
            }
            updateHud();
        },
    });

    // Keep the camera on the action: the board centre at the start.
    camera.focus(board.grid.center(), 12);
    updateHud();
    options.setup?.(world);

    game.world = world;
    if (options.debug) game.debug.toggle(true);
    return world;
}

/** A round table top under the board, so it stands on something and catches shadows. */
function createTable(board: { grid: Board["grid"] }, color: THREE.ColorRepresentation): THREE.Mesh {
    const centre = board.grid.center();
    // Wide enough that its edge stays off screen at every zoom the camera allows.
    const radius = Math.max(board.grid.width, board.grid.depth) * board.grid.spacing * 5;
    const geometry = new THREE.CylinderGeometry(radius, radius, 0.2, 96);
    const table = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.05 }));
    table.name = 'board-table';
    table.receiveShadow = true;
    table.position.set(centre.x, board.grid.y - 0.42, centre.z);
    table.raycast = () => undefined;
    return table;
}

/** Create the game, set it up as a board game and start it. */
export async function createBoardGame<T = unknown>(options: BoardGameOptions<T> = {}): Promise<{ game: Game; world: BoardGameWorld<T> }> {
    const game = await createGame({ shadows: true, ...options.game });
    const world = setupBoardGame<T>(game, options);
    startGame(game);
    return { game, world };
}

/**
 * Straight line cells from `from` towards a direction, stopping before the
 * first blocker. Exactly what a rook, bishop or queen needs.
 * @param limit Only travel this many cells.
 */
export function rayCells(from: Cell, step: { x: number; z: number }, limit: number, isBlocked: (cell: Cell) => 'empty' | 'friend' | 'enemy'): Cell[] {
    const cells: Cell[] = [];
    let current = { x: from.x + step.x, z: from.z + step.z };
    while (cells.length < limit) {
        const state = isBlocked(current);
        if (state === 'empty') cells.push({ ...current });
        else {
            if (state === 'enemy') cells.push({ ...current });
            break;
        }
        current = { x: current.x + step.x, z: current.z + step.z };
    }
    return cells;
}

/** Cells a knight can reach, ignoring blockers, since a knight jumps. */
export function knightCells(from: Cell): Cell[] {
    return [
        { x: from.x + 1, z: from.z + 2 },
        { x: from.x + 2, z: from.z + 1 },
        { x: from.x + 2, z: from.z - 1 },
        { x: from.x + 1, z: from.z - 2 },
        { x: from.x - 1, z: from.z - 2 },
        { x: from.x - 2, z: from.z - 1 },
        { x: from.x - 2, z: from.z + 1 },
        { x: from.x - 1, z: from.z + 2 },
    ];
}

/** Cells a king can reach, one step in any direction. */
export function kingCells(from: Cell): Cell[] {
    const cells: Cell[] = [];
    for (let dx = -1; dx <= 1; dx += 1) {
        for (let dz = -1; dz <= 1; dz += 1) {
            if (dx === 0 && dz === 0) continue;
            cells.push({ x: from.x + dx, z: from.z + dz });
        }
    }
    return cells;
}

/** Default move counter limit so a board game cannot run forever. */
export const BOARD_MOVE_LIMIT = 400;
