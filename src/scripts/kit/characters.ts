import { SYSTEM_ORDER } from '../core/systems';
import { createAnimatedAvatar, type AnimatedAvatar, type AnimatedAvatarOptions } from '../game/animated-avatar';
import type { CharacterBody } from '../physics/character';

//#region Animated characters

export type AddAnimatedAvatarOptions = AnimatedAvatarOptions & {
    /**
     * Derive the state from a character body: 'jump' in the air, 'run' when it
     * moves, 'idle' otherwise. The states map decides which clips those names
     * land on. A resolver works when the body does not exist yet, e.g. an
     * avatar passed as a `playerObject` factory: `follow: () => world.player.body`.
     */
    follow?: CharacterBody | (() => CharacterBody | undefined);
};

/**
 * A real character for a player or NPC in one call: a placeholder capsule
 * while the glTF loads, then the model with idle/run/jump clips switched from
 * the body's motion. Returns the avatar; hand `avatar.object` to a `Player`.
 *
 * ```ts
 * const avatar = addAnimatedAvatar(game, { url: 'models/robot.glb', height: 1.62, follow: player.body });
 * const player = new Player(game, { position: spawn, object: avatar.object });
 * avatar.follow = player.body;
 * ```
 */
export function addAnimatedAvatar(game: Game, options: AddAnimatedAvatarOptions): AnimatedAvatar {
    const avatar = createAnimatedAvatar(game, {
        states: { idle: ['idle', 'stand'], run: ['run', 'walk'], jump: ['jump', 'fall'], ...options.states },
        ...options,
    });

    if (options.follow) {
        const resolve = typeof options.follow === 'function' ? options.follow : () => options.follow as CharacterBody;
        game.systems.add({
            name: `avatar-states-${options.url}`,
            order: SYSTEM_ORDER.GAMEPLAY + 1,
            update: () => {
                const body = resolve();
                if (body) avatar.setState(!body.grounded ? 'jump' : body.speed > 0.6 ? 'run' : 'idle');
            },
        });
    }

    return avatar;
}

//#endregion Animated characters
