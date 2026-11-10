import { SYSTEM_ORDER } from '../core/systems';
import { div } from '../helpers/dom';

//#region Damage feedback

/**
 * Makes getting hurt readable: the screen edges flash red, the health bar
 * jolts, the character blinks while they cannot be hit again, and the edges
 * keep pulsing when health is low.
 *
 * `invulnerableSeconds` is the breathing room after a hit. It is what lets a
 * player who has been caught turn and run instead of being hit twice.
 *
 * ```ts
 * addDamageFeedback(game, { invulnerableSeconds: 1.5 });
 * ```
 */
export type AddDamageFeedbackOptions = {
    /** Seconds the player cannot be hurt again after a hit. Leaves the player's own setting alone when omitted. */
    invulnerableSeconds?: number;
    /** CSS colour of the flash. Defaults to a dark red. */
    color?: string;
    /** Blink the character while invulnerable. Defaults to true. */
    blink?: boolean;
    /** Health fraction under which the edges keep pulsing. Defaults to 0.3; 0 turns it off. */
    lowHealth?: number;
    onHit?: (amount: number) => void;
};

export type DamageFeedbackHandle = {
    dispose: () => void;
};

export function addDamageFeedback(game: Game, options: AddDamageFeedbackOptions = {}): DamageFeedbackHandle {
    const vignette = div('damage-vignette', undefined, game.screens.layer('overlay'));
    if (options.color) vignette.style.setProperty('--damage-color', options.color);
    game.screens.show('overlay', vignette);
    const bar = game.hud.root.querySelector<HTMLElement>('.hud-bar');
    const restart = (element: HTMLElement | null, name: string): void => {
        if (!element) return;
        element.classList.remove(name);
        // Reading a layout value restarts the CSS animation for back-to-back hits.
        void element.offsetWidth;
        element.classList.add(name);
    };

    const stopListening = game.events.on('player:damage', ({ amount }) => {
        if (amount <= 0) return;
        restart(vignette, 'is-hit');
        restart(bar, 'is-hit');
        options.onHit?.(amount);
    });

    let blinking = false;
    const removeSystem = game.systems.add({
        name: 'damage-feedback',
        order: SYSTEM_ORDER.EFFECTS,
        always: true,
        update: () => {
            const player = game.player;
            if (!player) return;
            if (options.invulnerableSeconds !== undefined) player.health.invulnerableAfterHit = options.invulnerableSeconds;
            const ratio = player.health.max > 0 ? player.health.current / player.health.max : 1;
            vignette.classList.toggle('is-low', !player.isDead && ratio <= (options.lowHealth ?? 0.3));
            if (options.blink === false) return;
            const invulnerable = player.health.isInvulnerable && !player.isDead;
            if (invulnerable) player.root.visible = Math.floor(performance.now() / 90) % 2 === 0;
            else if (blinking) player.root.visible = true;
            blinking = invulnerable;
        },
    });

    return {
        dispose: () => {
            stopListening();
            removeSystem();
            if (game.player) game.player.root.visible = true;
            vignette.remove();
        },
    };
}

//#endregion Damage feedback
