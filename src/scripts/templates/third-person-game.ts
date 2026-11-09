import * as THREE from 'three';

import { ThirdPersonController, type ThirdPersonOptions } from '../controls/third-person';
import { setupActionGame, createAndStart, type ActionGameOptions, type ActionGameWorld } from './action-game';
import type { Player } from '../game/player';

/**
 * Third person action game.
 *
 * An over the shoulder camera, a shooting weapon, enemies and pickups in a
 * walled arena, with a HUD, pause menu and save slots. This is the template to
 * reach for when the player should see their character.
 */
export type ThirdPersonGameOptions = ActionGameOptions & {
    /** Camera and movement tuning. */
    controls?: ThirdPersonOptions;
};

export type ThirdPersonWorld = ActionGameWorld & { controls: ThirdPersonController };

/** Configure an existing game as a third person action game. */
export function setupThirdPersonGame(game: Game, options: ThirdPersonGameOptions = {}): ThirdPersonWorld {
    const world = setupActionGame(
        game,
        (hub: Game, player: Player) =>
            new ThirdPersonController(hub, player, {
                distance: 5,
                targetHeight: 1.55,
                shoulderOffset: 0.5,
                ...options.controls,
            }),
        options,
    );
    game.world = world;
    if (options.build) void options.build(world);
    return world;
}

/** Create the game, set it up as a third person action game and start it. */
export async function createThirdPersonGame(options: ThirdPersonGameOptions = {}): Promise<{ game: Game; world: ThirdPersonWorld }> {
    return createAndStart(options.game ?? {}, (game) => setupThirdPersonGame(game, options));
}

/** Direction the third person camera looks along. Convenience for aiming code. */
export function aimDirection(world: ThirdPersonWorld, out = new THREE.Vector3()): THREE.Vector3 {
    return world.game.camera.getWorldDirection(out);
}
