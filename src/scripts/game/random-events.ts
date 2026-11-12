/**
 * Things that happen now and then: weather, a travelling trader, a blood moon.
 *
 * A deck of events on any clock (seconds, in-game hours, turns). After a quiet
 * gap one is drawn by weight from those whose `when` holds and whose cooldown
 * has passed. It runs for its duration and ends; then the next gap starts.
 * Pure logic: the kit's `addRandomEvents` ticks it and saves it.
 */
export type RandomEvent = {
    id: string;
    /** How likely it is to be drawn, against the others. Defaults to 1. */
    weight?: number;
    /** It can only be drawn while this holds. */
    when?: () => boolean;
    /** How long it lasts on the clock, fixed or a range to roll from. 0 or omitted: over at once. */
    duration?: number | [number, number];
    /** Clock time after it ends before the same one can be drawn again. */
    cooldown?: number;
    /** `resumed` is true when a saved game is loaded in the middle of it. */
    start?: (resumed: boolean) => void;
    end?: () => void;
};

export type RandomEventsOptions = {
    events: RandomEvent[];
    /** Quiet clock time between one ending and the next draw, fixed or a range. */
    gap: number | [number, number];
    /** Quiet time before the very first draw. Defaults to a roll of `gap`. */
    firstAfter?: number;
    /** The chance that a draw gives anything at all. Defaults to 1. */
    chance?: number;
    /** 0..1 source, for tests and seeded games. Defaults to `Math.random`. */
    random?: () => number;
    onStart?: (event: RandomEvent, resumed: boolean) => void;
    onEnd?: (event: RandomEvent) => void;
};

export type RandomEventsState = {
    current?: string;
    endsAt: number;
    nextDraw: number;
    ended: Record<string, number>;
};

export class RandomEvents {
    private readonly options: RandomEventsOptions;
    private readonly random: () => number;
    private running: RandomEvent | undefined;
    private endsAtTime = 0;
    private nextDraw: number | undefined;
    private readonly ended = new Map<string, number>();

    constructor(options: RandomEventsOptions) {
        this.options = options;
        this.random = options.random ?? Math.random;
    }

    /** The event that is running, if any. */
    get current(): RandomEvent | undefined {
        return this.running;
    }

    /** The clock time at which the running event ends. */
    get endsAt(): number {
        return this.endsAtTime;
    }

    is(id: string): boolean {
        return this.running?.id === id;
    }

    private roll(span: number | [number, number]): number {
        return typeof span === 'number' ? span : span[0] + (span[1] - span[0]) * this.random();
    }

    /** Call with the clock's current value, as often as you like. */
    tick(now: number): void {
        if (this.running) {
            if (now < this.endsAtTime) return;
            this.finish(this.endsAtTime);
        }
        this.nextDraw ??= now + (this.options.firstAfter ?? this.roll(this.options.gap));
        if (now < this.nextDraw) return;
        const drawn = this.random() < (this.options.chance ?? 1) ? this.draw(now) : undefined;
        if (!drawn) {
            this.nextDraw = now + this.roll(this.options.gap);
            return;
        }
        this.begin(drawn, now, this.roll(drawn.duration ?? 0), false);
        if (now >= this.endsAtTime) this.finish(now);
    }

    private draw(now: number): RandomEvent | undefined {
        const open = this.options.events.filter((event) => {
            const last = this.ended.get(event.id);
            return (event.weight ?? 1) > 0 && (last === undefined || now >= last + (event.cooldown ?? 0)) && (event.when?.() ?? true);
        });
        let ticket = this.random() * open.reduce((sum, event) => sum + (event.weight ?? 1), 0);
        for (const event of open) {
            ticket -= event.weight ?? 1;
            if (ticket < 0) return event;
        }
        return open[open.length - 1];
    }

    private begin(event: RandomEvent, now: number, duration: number, resumed: boolean): void {
        this.running = event;
        this.endsAtTime = now + duration;
        event.start?.(resumed);
        this.options.onStart?.(event, resumed);
    }

    private finish(now: number): void {
        const event = this.running;
        if (!event) return;
        this.running = undefined;
        this.ended.set(event.id, now);
        this.nextDraw = now + this.roll(this.options.gap);
        event.end?.();
        this.options.onEnd?.(event);
    }

    /** Start one now, whatever the deck says. Ends the running one first. */
    force(id: string, now: number, duration?: number): boolean {
        const event = this.options.events.find((candidate) => candidate.id === id);
        if (!event) return false;
        this.finish(now);
        this.begin(event, now, duration ?? this.roll(event.duration ?? 0), false);
        return true;
    }

    /** End the running event now. */
    stop(now: number): void {
        this.finish(now);
    }

    toJSON(): RandomEventsState {
        return { ...(this.running ? { current: this.running.id } : {}), endsAt: this.endsAtTime, nextDraw: this.nextDraw ?? 0, ended: Object.fromEntries(this.ended) };
    }

    /** Restore a saved deck. A running event is ended quietly first, and the saved one started as `resumed`. */
    fromJSON(data: unknown): void {
        const saved = (data ?? {}) as Partial<RandomEventsState>;
        if (this.running) {
            const event = this.running;
            this.running = undefined;
            event.end?.();
            this.options.onEnd?.(event);
        }
        this.ended.clear();
        for (const [id, at] of Object.entries(saved.ended ?? {})) this.ended.set(id, at);
        this.nextDraw = saved.nextDraw || undefined;
        this.endsAtTime = saved.endsAt ?? 0;
        const event = this.options.events.find((candidate) => candidate.id === saved.current);
        if (!event) return;
        this.running = event;
        event.start?.(true);
        this.options.onStart?.(event, true);
    }
}
