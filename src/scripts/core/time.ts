import * as THREE from 'three';

/**
 * Frame timing.
 *
 * `Time` owns the running clock, the time scale and a fixed-step accumulator.
 * The loop calls `time.advance(rawDelta)` once per frame and then drains
 * `time.stepFixed(...)` so physics always sees identical steps.
 */
/** Anything that identifies who paused: a name, or the object doing it. */
export type PauseOwner = string | object;

export class Time {
    /** Seconds since boot, already scaled by `scale`. */
    elapsed = 0;
    /** Seconds since boot, unaffected by `scale`. */
    realElapsed = 0;
    /** Scaled delta of the last frame in seconds. */
    delta = 0;
    /** Unscaled delta of the last frame in seconds, capped to avoid tunnelling after a tab switch. */
    rawDelta = 0;
    /** Number of completed frames. */
    frame = 0;
    /**
     * Your multiplier for every delta, e.g. 0.5 for a slow motion power-up.
     * Pausing and hit stop do not touch it: they stack on top through `pause()`
     * and `slowMotion()`, so no system can undo another's.
     */
    scale = 1;
    /** Hard cap on a single frame delta in seconds. */
    maxDelta = 0.25;

    private readonly pausers = new Set<PauseOwner>();
    private slowTimer = 0;
    private slowScale = 1;
    private accumulator = 0;
    private lastStep = 1 / 60;
    private readonly clock = new THREE.Clock();

    /**
     * Advance the clock by the raw delta reported by the renderer.
     * Call once per frame at the top of the loop.
     */
    advance(rawDelta?: number): number {
        const measured = rawDelta ?? this.clock.getDelta();
        this.rawDelta = Math.min(measured, this.maxDelta);
        this.delta = this.rawDelta * this.effectiveScale;
        // Slow motion lasts real seconds, or a strong slow down would stretch itself.
        if (this.slowTimer > 0) {
            this.slowTimer -= this.rawDelta;
            if (this.slowTimer <= 0) this.slowScale = 1;
        }
        this.elapsed += this.delta;
        this.realElapsed += this.rawDelta;
        this.frame += 1;
        return this.delta;
    }

    /**
     * Drain the accumulator and invoke `run` once per fixed step.
     * @param step Fixed step size in seconds, e.g. 1/60.
     * @param maxSubSteps Upper bound per frame; extra backlog is dropped.
     * @param run Callback receiving the fixed step size.
     * @returns How many steps ran this frame.
     */
    stepFixed(step: number, maxSubSteps: number, run: (step: number) => void): number {
        this.lastStep = step;
        this.accumulator += this.delta;
        let steps = 0;
        while (this.accumulator >= step && steps < maxSubSteps) {
            run(step);
            this.accumulator -= step;
            steps += 1;
        }
        if (steps === maxSubSteps && this.accumulator >= step) {
            // The machine cannot keep up, drop the backlog instead of growing it forever.
            this.accumulator = 0;
        }
        return steps;
    }

    /**
     * Freeze gameplay time on behalf of `owner`. Time runs again only when every
     * owner has resumed, so a dialog closing over an open inventory does not
     * start the game behind the inventory.
     */
    pause(owner: PauseOwner): void {
        this.pausers.add(owner);
    }

    /** Release one owner's pause. */
    resume(owner: PauseOwner): void {
        this.pausers.delete(owner);
    }

    /** Pause or resume for an owner in one call. */
    setPaused(owner: PauseOwner, paused: boolean): void {
        if (paused) this.pause(owner);
        else this.resume(owner);
    }

    get isPaused(): boolean {
        return this.pausers.size > 0;
    }

    /** Run at `scale` for `seconds` of real time, e.g. a hit stop. A stronger call wins. */
    slowMotion(seconds: number, scale: number): void {
        if (this.slowTimer > 0 && scale > this.slowScale) return;
        this.slowTimer = Math.max(this.slowTimer, seconds);
        this.slowScale = Math.max(0, scale);
    }

    /** The multiplier actually applied this frame: pause, slow motion and `scale` together. */
    get effectiveScale(): number {
        return this.isPaused ? 0 : this.scale * this.slowScale;
    }

    /** Seconds of unsimulated time left in the accumulator. */
    get fixedRemainder(): number {
        return this.accumulator;
    }

    /**
     * Fraction of the last fixed step still waiting to be simulated, in 0..1.
     * Multiply by a rigid body's velocity to render it interpolated.
     */
    get alpha(): number {
        return this.lastStep > 0 ? Math.min(this.accumulator / this.lastStep, 1) : 0;
    }

    /** Forget the time that passed while the tab was hidden, keeping the running totals. */
    skipGap(): void {
        this.clock.getDelta();
        this.accumulator = 0;
    }

    /** Reset the clock and accumulator, e.g. after loading a level. */
    reset(): void {
        this.accumulator = 0;
        this.elapsed = 0;
        this.realElapsed = 0;
        this.delta = 0;
        this.rawDelta = 0;
        this.frame = 0;
        this.clock.getDelta();
    }
}
