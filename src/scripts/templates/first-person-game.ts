import * as THREE from 'three';

import { FirstPersonController, type FirstPersonOptions } from '../controls/first-person';
import { setupActionGame, createAndStart, type ActionGameOptions, type ActionGameWorld } from './action-game';
import type { Player } from '../game/player';

/**
 * First person shooter style game.
 *
 * Pointer locked camera at eye height, WASD relative to the look direction,
 * jump, sprint, crouch, head bob, a weapon with a crosshair, enemies, pickups
 * and the usual HUD plus pause menu.
 */
export type FirstPersonGameOptions = ActionGameOptions & {
    /** Camera and movement tuning, including eye height and head bob. */
    controls?: FirstPersonOptions;
    /** Show the player's own body when looking down. Off by default. */
    avatar?: boolean;
};

export type FirstPersonWorld = ActionGameWorld & { controls: FirstPersonController };

/** Configure an existing game as a first person game. */
export function setupFirstPersonGame(game: Game, options: FirstPersonGameOptions = {}): FirstPersonWorld {
    const world = setupActionGame(
        game,
        (hub: Game, player: Player) =>
            new FirstPersonController(hub, player, {
                eyeHeight: 1.7,
                headBob: 0.03,
                crouchEyeHeight: 1.1,
                ...options.controls,
            }),
        { playerObject: options.avatar === true ? 'avatar' : 'none', ...options },
    );
    game.world = world;
    if (options.build) void options.build(world);
    return world;
}

/** Create the game, set it up as a first person game and start it. */
export async function createFirstPersonGame(options: FirstPersonGameOptions = {}): Promise<{ game: Game; world: FirstPersonWorld }> {
    return createAndStart(options.game ?? {}, (game) => setupFirstPersonGame(game, options));
}

/** True when the player is looking at something within `range` metres. */
export function isLookingAt(world: FirstPersonWorld, object: THREE.Object3D, range = 5): boolean {
    const direction = world.game.camera.getWorldDirection(new THREE.Vector3());
    const toObject = object.getWorldPosition(new THREE.Vector3()).sub(world.game.camera.position);
    return toObject.length() <= range && toObject.normalize().dot(direction) > 0.9;
}
