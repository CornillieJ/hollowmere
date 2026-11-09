import * as THREE from 'three';

import { setupSceneDefaults, type SceneDefaultsOptions } from '../setup/setup-scene';
import { setupGameFlow, type GameFlow } from '../core/game-state';
import { SYSTEM_ORDER } from '../core/systems';
import { BlockBuilder } from '../helpers/build';
import { createLabel } from '../helpers/text';
import { Player } from '../game/player';
import { PortalManager, type Portal, type PortalManagerOptions } from '../game/portals';
import { FirstPersonController, type FirstPersonOptions } from '../controls/first-person';
import { createGame, startGame } from '../init';
import { addTouchControls } from '../kit/touch';
import type { HudOptions } from '../ui/hud';

/**
 * Portal style test chamber.
 *
 * A small room, a gap you cannot jump, two linked portals, and an exit pad.
 * Movement is first person with the character controller, so everything stays
 * physical: gravity, momentum carried through the portal, and a pad you have to
 * reach to finish.
 *
 * Replace `buildChamber` to make your own level; the portal pair and the exit
 * logic do not change.
 */
export type PortalGameOptions = {
    game?: GameOptions;
    title?: string;
    subtitle?: string;
    scene?: SceneDefaultsOptions;
    controls?: FirstPersonOptions;
    hud?: HudOptions;
    portals?: PortalManagerOptions;
    autoStart?: boolean;
    debug?: boolean;
    /** Skip the built-in chamber and build your own with `build`. */
    chamber?: boolean;
    build?: (world: PortalWorld) => void;
    saveSlot?: string;
};

export type PortalWorld = {
    game: Game;
    builder: BlockBuilder;
    portals: PortalManager;
    controls: FirstPersonController;
    flow: GameFlow;
    /** Where the player starts. */
    spawnPoint: THREE.Vector3;
    /** The pad that finishes the level, when the built-in chamber is used. */
    exitPad: THREE.Object3D | undefined;
    /** Link a pair of portals at runtime. */
    addPortalPair: (a: THREE.Vector3 | Vec3, aNormal: THREE.Vector3 | Vec3, b: THREE.Vector3 | Vec3, bNormal: THREE.Vector3 | Vec3) => [Portal, Portal];
    restart: () => void;
    dispose: () => void;
};

/** Configure an existing game as a portal chamber. */
export function setupPortalGame(game: Game, options: PortalGameOptions = {}): PortalWorld {
    const spawnPoint = new THREE.Vector3(0, 0.4, 10);

    setupSceneDefaults(game.scene, game.renderer, game.physics, {
        preset: 'indoor',
        groundSize: 0,
        fog: false,
        ...options.scene,
    });

    const builder = new BlockBuilder(game);
    const portals = new PortalManager(game, options.portals);

    const player = new Player(game, { position: spawnPoint, object: new THREE.Group() });
    game.player = player;

    const controls = new FirstPersonController(game, player, { eyeHeight: 1.7, headBob: 0.02, ...options.controls });
    game.interactions.useCamera(game.camera);

    addTouchControls(game, {
        buttons: [
            { action: 'jump', label: '⤒', hold: true },
            { action: 'interact', label: '✋', primary: true },
            { action: 'sprint', label: '≫', hold: true },
        ],
    });

    const world: PortalWorld = {
        game,
        builder,
        portals,
        controls,
        flow: undefined as unknown as GameFlow,
        spawnPoint,
        exitPad: undefined,
        addPortalPair: (a, aNormal, b, bNormal) => portals.createPair({ position: a, normal: aNormal }, { position: b, normal: bNormal }),
        restart: () => {
            player.restart(spawnPoint);
            game.projectiles.clear();
        },
        dispose: () => {
            portals.dispose();
            builder.dispose();
            controls.dispose();
            player.destroy();
        },
    };

    if (options.chamber !== false) buildChamber(world);

    // A portal chamber has no health, lives or ammo; keep the HUD to the minimum.
    game.hud.setCombatCountersVisible(false);
    game.hud.setCrosshair(true, false);

    world.flow = setupGameFlow(game, {
        title: options.title ?? 'Portal',
        ...(options.subtitle !== undefined ? { subtitle: options.subtitle } : {}),
        autoStart: options.autoStart ?? true,
        simulateWhen: ['playing'],
        hudWhen: ['playing', 'paused', 'victory'],
        crosshairWhen: ['playing'],
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

/** Create the game, set it up as a portal chamber and start it. */
export async function createPortalGame(options: PortalGameOptions = {}): Promise<{ game: Game; world: PortalWorld }> {
    const game = await createGame({ shadows: true, ...options.game });
    const world = setupPortalGame(game, options);
    startGame(game);
    return { game, world };
}

/**
 * The built-in chamber: a start room, a chasm that is too wide to jump, a
 * portal pair, and an exit pad on the far side.
 */
export function buildChamber(world: PortalWorld): void {
    const { builder, game } = world;

    builder.box({ size: { x: 16, y: 0.6, z: 16 }, position: { x: 0, y: -0.3, z: 11 }, color: 0xb9c0c9, tag: 'floor' });
    builder.box({ size: { x: 16, y: 0.6, z: 16 }, position: { x: 0, y: -0.3, z: -11 }, color: 0xb9c0c9, tag: 'floor' });
    builder.box({ size: { x: 18, y: 7, z: 1 }, position: { x: 0, y: 3.5, z: 19 }, color: 0x7d848e, tag: 'wall' });
    builder.box({ size: { x: 18, y: 7, z: 1 }, position: { x: 0, y: 3.5, z: -19 }, color: 0x7d848e, tag: 'wall' });
    builder.box({ size: { x: 1, y: 7, z: 38 }, position: { x: -9, y: 3.5, z: 0 }, color: 0x7d848e, tag: 'wall' });
    builder.box({ size: { x: 1, y: 7, z: 38 }, position: { x: 9, y: 3.5, z: 0 }, color: 0x7d848e, tag: 'wall' });
    // The chasm: a thin ledge on each side, nothing in between.
    builder.box({ size: { x: 18, y: 0.4, z: 2 }, position: { x: 0, y: 0, z: -0.5 }, color: 0x5c636d, tag: 'ledge' });

    // One portal on the start room wall, low enough that its opening meets the
    // floor. It stands half a meter off the wall: the plane check needs the
    // capsule centre to cross it, and a flush mount would leave less room than
    // a capsule radius, so nobody could ever walk in.
    world.portals.createPair({ position: new THREE.Vector3(0, 1.15, 18.0), normal: new THREE.Vector3(0, 0, -1) }, { position: new THREE.Vector3(-7.6, 2.4, -11), normal: new THREE.Vector3(1, 0, 0) });

    const pad = builder.cylinder(1.5, 0.25, { position: { x: 7, y: 0.3, z: -14 }, color: 0x6ce09a, tag: 'exit-pad' });
    world.exitPad = pad;

    game.interactions.add(pad, {
        prompt: 'Finish the test',
        range: 4,
        onInteract: () => game.events.emit('level:complete', { id: 'chamber' }),
    });

    // A sign above the pad, always facing the camera so it is readable from anywhere.
    const sign = createLabel('Exit', { fontSize: 0.8, color: 0x6ce09a, outlineWidth: 0.06, outlineColor: 0x0a0a0a });
    sign.position.set(7, 3, -14);
    sign.userData.billboard = true;
    game.scene.add(sign);
    game.systems.add({
        name: 'portal-sign-billboard',
        order: SYSTEM_ORDER.UI,
        lateUpdate: () => sign.quaternion.copy(game.camera.quaternion),
    });
}
