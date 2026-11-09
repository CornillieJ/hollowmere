import * as THREE from 'three';

import { SYSTEM_ORDER } from '../core/systems';
import { setupGameFlow, type GameFlow } from '../core/game-state';
import { setupSceneDefaults, type SceneDefaultsOptions } from '../setup/setup-scene';
import { addVehicle, type VehicleHandle, type AddVehicleOptions } from '../kit/vehicle';
import { addMinimap } from '../kit/minimap';
import { addTouchControls } from '../kit/touch';
import { addCheckpoints, type CheckpointsHandle } from '../game/checkpoints';
import { createGame, startGame } from '../init';
import { BlockBuilder } from '../helpers/build';

/**
 * Time trial racing: gates in order, laps, a running clock and a best lap.
 *
 * The whole template is the kit composed for racing: an `addVehicle` for the
 * car, ordered `addCheckpoints` for the gates, a minimap with the track on it.
 * The game-specific part is only the track layout, handed over as gate
 * positions and a builder function.
 */
export type RacingGameOptions = {
    game?: GameOptions;
    title?: string;
    subtitle?: string;
    scene?: SceneDefaultsOptions;
    vehicle?: Partial<AddVehicleOptions>;
    /** Laps to win. Defaults to 3. */
    laps?: number;
    /** Gate positions, in order; the finish line is the first one. Defaults to a stadium oval. */
    gates?: Array<Vec3>;
    /** Gate trigger radius. Defaults to 3. */
    gateRadius?: number;
    /** Barriers, scenery, grandstands. Runs after the track ribbon exists. */
    build?: (world: RacingWorld) => void;
    autoStart?: boolean;
    debug?: boolean;
};

export type RacingWorld = {
    game: Game;
    van: VehicleHandle;
    gates: CheckpointsHandle;
    flow: GameFlow;
    /** Current lap, 1 based. */
    lap: () => number;
    /** Seconds into the current lap. */
    lapTime: () => number;
    /** Best lap so far, seconds. */
    bestLap: () => number | undefined;
    restart: () => void;
    dispose: () => void;
};

/** The default track: a wide stadium oval. */
export const DEFAULT_GATES: Vec3[] = [
    { x: 0, y: 0, z: 30 },
    { x: 22, y: 0, z: 22 },
    { x: 30, y: 0, z: 0 },
    { x: 22, y: 0, z: -22 },
    { x: 0, y: 0, z: -30 },
    { x: -22, y: 0, z: -22 },
    { x: -30, y: 0, z: 0 },
    { x: -22, y: 0, z: 22 },
];

/** Configure an existing game as a time trial. */
export function setupRacingGame(game: Game, options: RacingGameOptions = {}): RacingWorld {
    const gatesOption = options.gates ?? DEFAULT_GATES;
    const laps = options.laps ?? 3;

    setupSceneDefaults(game.scene, game.renderer, game.physics, {
        preset: 'outdoor-day',
        groundSize: 160,
        ...options.scene,
    });

    // The road ribbon through every gate, drawn flat so it never fights the wheels.
    const ribbon = new BlockBuilder(game);
    for (let index = 0; index < gatesOption.length; index += 1) {
        const from = gatesOption[index] as Vec3;
        const to = gatesOption[(index + 1) % gatesOption.length] as Vec3;
        const dx = to.x - from.x;
        const dz = to.z - from.z;
        const length = Math.hypot(dx, dz);
        ribbon.box({
            position: { x: (from.x + to.x) / 2, y: 0.03, z: (from.z + to.z) / 2 },
            size: { x: 9, y: 0.05, z: length + 9 },
            rotation: { x: 0, y: Math.atan2(dx, dz), z: 0 },
            color: 0x3c4048,
            tag: 'road',
            physics: 'none',
        });
    }

    const van = addVehicle(game, {
        position: { x: (gatesOption[0] as Vec3).x, y: 0, z: (gatesOption[0] as Vec3).z + 6 },
        engineForce: 3000,
        ...options.vehicle,
    });

    let lap = 1;
    let lapStart = game.time.elapsed;
    let best: number | undefined;

    const gates = addCheckpoints(game, {
        points: gatesOption.slice(1), // gate 0 is the finish line, not a checkpoint
        radius: options.gateRadius ?? 3.4,
        setSpawn: false,
        ordered: true,
        tracking: () => van.vehicle.position,
        onAll: () => {
            const time = game.time.elapsed - lapStart;
            if (best === undefined || time < best) best = time;
            if (lap >= laps) {
                game.events.emit('level:complete', { id: 'race' });
                return;
            }
            lap += 1;
            lapStart = game.time.elapsed;
            game.toasts.push(`Lap ${lap}/${laps}`, { color: '#9fe7ff' });
            gates.reset();
        },
    });

    addMinimap(game, {
        follow: () => van.vehicle.position,
        zoom: 110,
        markers: () => [{ position: van.vehicle.position, color: '#ffffff', heading: van.vehicle.yaw, size: 5 }],
        drawStatic: (ctx, toMap) => {
            ctx.strokeStyle = 'rgba(160, 168, 184, 0.85)';
            ctx.lineWidth = 9 * (ctx.canvas.width / 110);
            ctx.lineJoin = 'round';
            ctx.beginPath();
            for (const [index, gate] of gatesOption.entries()) {
                const point = toMap(gate.x, gate.z);
                if (index === 0) ctx.moveTo(...point);
                else ctx.lineTo(...point);
            }
            ctx.closePath();
            ctx.stroke();
        },
    });

    game.hud.setCombatCountersVisible(false);
    game.hud.setCrosshair(false, false);

    // The joystick steers; the big button is the brake.
    addTouchControls(game, { buttons: [{ action: 'jump', label: '⛔', primary: true, hold: true }] });

    game.systems.add({
        name: 'racing-hud',
        order: SYSTEM_ORDER.UI - 1,
        update: () => {
            game.hud.setStat('lap', `${lap}/${laps}`, 'lap');
            game.hud.setStat('time', `${(game.time.elapsed - lapStart).toFixed(1)}s`, 'lap time');
            if (best !== undefined) game.hud.setStat('best', `${best.toFixed(1)}s`, 'best');
            game.hud.setStat('speed', `${Math.round(van.vehicle.speedKmh)} km/h`, 'speed');
        },
    });

    const flow = setupGameFlow(game, {
        title: options.title ?? 'Time trial',
        ...(options.subtitle !== undefined ? { subtitle: options.subtitle } : {}),
        autoStart: options.autoStart ?? true,
        pointerLock: false,
        hudWhen: ['playing', 'paused', 'victory'],
        crosshairWhen: [],
        onRestart: () => restart(),
        onVictory: () => {
            game.hud.setObjective(`Finished: best lap ${best?.toFixed(1)}s`);
        },
    });

    function restart(): void {
        lap = 1;
        lapStart = game.time.elapsed;
        best = undefined;
        gates.reset();
        const start = gatesOption[0] as Vec3;
        van.vehicle.teleport({ x: start.x, y: 0, z: start.z + 6 }, Math.atan2(-((gatesOption[1] as Vec3).x - start.x), -((gatesOption[1] as Vec3).z - start.z)));
    }

    const world: RacingWorld = {
        game,
        van,
        gates,
        flow,
        lap: () => lap,
        lapTime: () => game.time.elapsed - lapStart,
        bestLap: () => best,
        restart,
        dispose: () => {
            van.dispose();
            gates.dispose();
            ribbon.dispose();
        },
    };

    options.build?.(world);
    game.world = world;
    if (options.debug) game.debug.toggle(true);
    return world;
}

/** Create the game, set it up as a time trial and start it. */
export async function createRacingGame(options: RacingGameOptions = {}): Promise<{ game: Game; world: RacingWorld }> {
    const game = await createGame({ shadows: true, ...options.game });
    const world = setupRacingGame(game, options);
    startGame(game);
    return { game, world };
}
