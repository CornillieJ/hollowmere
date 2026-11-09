/**
 * Timers, cooldowns and intervals.
 *
 * These are plain objects with an `update(delta)` call, so they can live inside
 * any entity or system without a scheduler. Nothing here uses `setTimeout`,
 * which means pausing the game pauses every timer with it.
 */

/** A one-shot delay that reports when it has elapsed. */
export class Timer {
    /** Seconds left, `0` when finished. */
    remaining: number;
    /** Total duration set on the last `start`. */
    duration: number;
    private completed = false;

    constructor(duration = 1) {
        this.duration = duration;
        this.remaining = duration;
    }

    /** Restart with an optional new duration. */
    start(duration = this.duration): this {
        this.duration = duration;
        this.remaining = duration;
        this.completed = false;
        return this;
    }

    /** Advance the timer. Returns true on the single step where it finishes. */
    update(delta: number): boolean {
        if (this.completed || this.remaining <= 0) return false;
        this.remaining -= delta;
        if (this.remaining > 0) return false;
        this.remaining = 0;
        this.completed = true;
        return true;
    }

    /** True while the timer has time left. */
    get running(): boolean {
        return !this.completed && this.remaining > 0;
    }

    /** True once the timer has run out. */
    get finished(): boolean {
        return this.completed;
    }

    /** Fraction elapsed in 0..1. */
    get progress(): number {
        return this.duration <= 0 ? 1 : 1 - this.remaining / this.duration;
    }

    /** Reset to a stopped, unstarted state. */
    reset(): void {
        this.completed = false;
        this.remaining = this.duration;
    }
}

/**
 * A gate that only opens again after a fixed period.
 * Use it for fire rates, dodge rolls and anything with a wind-up.
 */
export class Cooldown {
    duration: number;
    /** Seconds until the gate opens, `0` when ready. */
    remaining = 0;

    constructor(duration = 0.2, startReady = true) {
        this.duration = duration;
        if (!startReady) this.remaining = duration;
    }

    /** True when no cooldown is left. */
    get ready(): boolean {
        return this.remaining <= 0;
    }

    /** Fraction of the cooldown already spent, 0..1. */
    get progress(): number {
        return this.duration <= 0 ? 1 : 1 - this.remaining / this.duration;
    }

    /** Consume the cooldown. Returns false when it was not ready. */
    tryUse(): boolean {
        if (!this.ready) return false;
        this.remaining = this.duration;
        return true;
    }

    /** Restart the cooldown unconditionally. */
    trigger(duration = this.duration): void {
        this.duration = duration;
        this.remaining = duration;
    }

    update(delta: number): void {
        if (this.remaining > 0) this.remaining = Math.max(0, this.remaining - delta);
    }
}

/** A repeating ticker, e.g. spawn a wave every 8 seconds. */
export class Interval {
    interval: number;
    /** Time since the last tick. */
    elapsed = 0;
    /** Optional upper bound on the number of ticks, `Infinity` by default. */
    repeat = Infinity;
    /** Number of ticks fired so far. */
    count = 0;

    constructor(interval = 1) {
        this.interval = interval;
    }

    /** Advance and report whether this step crossed a tick boundary. */
    update(delta: number): boolean {
        if (this.count >= this.repeat) return false;
        this.elapsed += delta;
        if (this.elapsed < this.interval) return false;
        this.elapsed -= this.interval;
        this.count += 1;
        return true;
    }

    /** Fraction towards the next tick, 0..1. */
    get progress(): number {
        return this.interval <= 0 ? 1 : Math.min(this.elapsed / this.interval, 1);
    }

    get finished(): boolean {
        return this.count >= this.repeat;
    }

    reset(): void {
        this.elapsed = 0;
        this.count = 0;
    }
}

/** Measures elapsed time, e.g. for a level completion screen. */
export class Stopwatch {
    elapsed = 0;
    private running = false;

    start(): this {
        this.running = true;
        return this;
    }

    stop(): this {
        this.running = false;
        return this;
    }

    update(delta: number): void {
        if (this.running) this.elapsed += delta;
    }

    reset(): void {
        this.elapsed = 0;
    }
}

/**
 * Rate limiter that fires only every `interval` seconds while `active`.
 * Useful for damage over time and for expensive checks in a hot loop.
 */
export class Ticker {
    readonly interval: Interval;
    private readonly action: (index: number) => void;

    constructor(interval: number, action: (index: number) => void, immediate = false) {
        this.interval = new Interval(interval);
        this.action = action;
        if (immediate) action(0);
    }

    update(delta: number, active = true): void {
        if (!active) return;
        if (this.interval.update(delta)) this.action(this.interval.count);
    }

    reset(): void {
        this.interval.reset();
    }
}
