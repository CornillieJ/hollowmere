import * as THREE from 'three';

import { TopDownController, type TopDownOptions } from '../controls/top-down';
import { setupActionGame, createAndStart, type ActionGameOptions, type ActionGameWorld } from './action-game';
import type { Player } from '../game/player';

/**
 * Top-down game.
 *
 * The camera hangs above the player and movement is screen relative, which is
 * what farming games, twin stick shooters and puzzle walkers all want. Pass
 * `fixedYaw` for an isometric board look, or leave `rotateWithMouse` on to swing
 * the view around the character.
 */
export type TopDownGameOptions = ActionGameOptions & {
    controls?: TopDownOptions;
};

export type TopDownWorld = ActionGameWorld & { controls: TopDownController };

/** Configure an existing game as a top-down game. */
export function setupTopDownGame(game: Game, options: TopDownGameOptions = {}): TopDownWorld {
    const world = setupActionGame(
        game,
        (hub: Game, player: Player) =>
            new TopDownController(hub, player, {
                height: 16,
                pitch: -Math.PI / 2.6,
                rotateWithMouse: true,
                jumpEnabled: false,
                ...options.controls,
            }),
        options,
    );
    game.world = world;
    if (options.build) void options.build(world);
    return world;
}

/** Create the game, set it up as a top-down game and start it. */
export async function createTopDownGame(options: TopDownGameOptions = {}): Promise<{ game: Game; world: TopDownWorld }> {
    return createAndStart(options.game ?? {}, (game) => setupTopDownGame(game, options));
}

/** The world point the mouse is over, on the player's floor plane. */
export function mouseWorldPoint(world: TopDownWorld, out = new THREE.Vector3()): THREE.Vector3 {
    return world.controls.aimAtScreenPoint(world.game.input.mouse.ndc, out);
}

/** Horizontal direction from the player to the mouse, normalised. */
export function mouseDirection(world: TopDownWorld, out = new THREE.Vector3()): THREE.Vector3 {
    const point = mouseWorldPoint(world, out);
    return point.sub(world.player.position).setY(0).normalize();
}
