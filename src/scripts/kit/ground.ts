import { SYSTEM_ORDER } from '../core/systems';
import { damp } from '../helpers/math';
import type { CharacterMovement } from '../controls/character-movement';

//#region Ground drag

/**
 * Ground that slows the player down: water to wade through, mud, deep snow.
 *
 * `dragAt` says how heavy the going is at a point, 0 for firm ground to 1 for
 * the worst of it. The player's speed eases towards the slowed value, so
 * stepping into water feels like resistance, not a switch.
 *
 * ```ts
 * addGroundDrag(game, {
 *     movement: world.controls.movement,
 *     // Knee deep is full drag.
 *     dragAt: (position) => (WATER_LEVEL - terrain.heightAt(position.x, position.z)) / 0.7,
 *     onEnter: () => splash(),
 * });
 * ```
 */
export type AddGroundDragOptions = {
    movement: CharacterMovement;
    /** How heavy the going is at a point: 0 or less is firm, 1 or more is the worst. */
    dragAt: (position: Vec3) => number;
    /** Speed multiplier at full drag. Defaults to 0.45. */
    slowest?: number;
    /** Called when the player steps in, and when they are out again. */
    onEnter?: () => void;
    onLeave?: () => void;
};

export type GroundDragHandle = {
    /** 0..1: how bogged down the player is right now. */
    readonly drag: number;
    dispose: () => void;
};

export function addGroundDrag(game: Game, options: AddGroundDragOptions): GroundDragHandle {
    let drag = 0;
    let inside = false;
    const removeSystem = game.systems.add({
        name: 'ground-drag',
        order: SYSTEM_ORDER.CONTROL - 1,
        update: (delta) => {
            const player = game.player;
            if (!player) return;
            const target = Math.max(0, Math.min(1, options.dragAt(player.position)));
            drag = damp(drag, target, 0.02, delta);
            options.movement.speedScale = 1 - drag * (1 - (options.slowest ?? 0.45));
            const now = target > 0.05;
            if (now !== inside) {
                inside = now;
                (now ? options.onEnter : options.onLeave)?.();
            }
        },
    });
    return {
        get drag() {
            return drag;
        },
        dispose: () => {
            removeSystem();
            options.movement.speedScale = 1;
        },
    };
}

//#endregion Ground drag
