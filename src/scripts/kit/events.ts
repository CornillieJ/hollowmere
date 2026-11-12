import { SYSTEM_ORDER } from '../core/systems';
import { RandomEvents, type RandomEvent, type RandomEventsOptions } from '../game/random-events';

//#region Random events

/**
 * Things that happen now and then, drawn from a deck: weather, a trader on the
 * road, a night when more of them walk. Each has a weight, a duration on your
 * own clock, an optional condition and cooldown, and a `start` and `end`. One
 * runs at a time, and what is running is saved and resumed.
 *
 * ```ts
 * const weather = addRandomEvents(game, {
 *     id: 'weather',
 *     clock: () => dayCycle.day * 24 + dayCycle.hour,   // in-game hours
 *     gap: [10, 30],
 *     events: [
 *         { id: 'rain', weight: 2, duration: [4, 8], start: () => rain.start(), end: () => rain.stop() },
 *         { id: 'storm', when: () => dayCycle.day > 3, duration: 3, cooldown: 72, start: storm, end: calm },
 *     ],
 *     onStart: (event) => juice.banner(event.id, 'has begun'),
 * });
 * weather.is('rain');
 * ```
 */
export type AddRandomEventsOptions = RandomEventsOptions & {
    /** Save key. */
    id: string;
    /** The clock the gaps, durations and cooldowns are measured on. Defaults to seconds of play. */
    clock?: () => number;
    /** Hold the deck still, e.g. during a tutorial. Running events still end. */
    enabled?: () => boolean;
};

export type RandomEventsHandle = {
    readonly current: RandomEvent | undefined;
    /** Clock time left of the running event, 0 when none. */
    readonly remaining: number;
    is: (id: string) => boolean;
    /** Start one now. `duration` overrides its own. */
    force: (id: string, duration?: number) => boolean;
    stop: () => void;
    dispose: () => void;
};

export function addRandomEvents(game: Game, options: AddRandomEventsOptions): RandomEventsHandle {
    const deck = new RandomEvents(options);
    let played = 0;
    const clock = options.clock ?? (() => played);

    const removeSystem = game.systems.add({
        name: `events-${options.id}`,
        order: SYSTEM_ORDER.GAMEPLAY + 9,
        update: (delta) => {
            played += delta;
            if (deck.current || (options.enabled?.() ?? true)) deck.tick(clock());
        },
    });
    const removeSave = game.save.register(`events-${options.id}`, {
        save: () => ({ ...deck.toJSON(), played }),
        load: (data) => {
            played = (data as { played?: number } | undefined)?.played ?? 0;
            deck.fromJSON(data);
        },
    });

    return {
        get current() {
            return deck.current;
        },
        get remaining() {
            return deck.current ? Math.max(0, deck.endsAt - clock()) : 0;
        },
        is: (id) => deck.is(id),
        force: (id, duration) => deck.force(id, clock(), duration),
        stop: () => deck.stop(clock()),
        dispose: () => {
            deck.stop(clock());
            removeSystem();
            removeSave();
        },
    };
}

//#endregion Random events
