import { div } from './dom';

/**
 * Per-system frame timing.
 *
 * Instead of asking every system to report its own cost, this wraps the system
 * registry's three run methods, so enabling it measures everything with no
 * changes elsewhere. Off by default, so there is no cost when it is not wanted.
 *
 * ```ts
 * const profiler = new Profiler(game);
 * profiler.attachToDebugOverlay();   // or profiler.onSample(rows => ...)
 * profiler.toggle();
 * ```
 */
export type ProfileSample = {
    name: string;
    /** Milliseconds spent in this phase over the last window. */
    total: number;
    /** Calls during the window. */
    calls: number;
    /** Highest single call in milliseconds. */
    peak: number;
};

const now: () => number = typeof performance !== 'undefined' && typeof performance.now === 'function' ? () => performance.now() : () => Date.now();

/** Phases that are measured, matching the registry's three run methods. */
export type ProfilePhase = 'update' | 'fixedUpdate' | 'lateUpdate';

export class Profiler {
    /** Seconds between reports. */
    interval = 1;

    readonly samples = new Map<ProfilePhase, ProfileSample>();

    private readonly game: Game;
    private readonly listeners = new Set<(rows: ProfileSample[]) => void>();
    private lastReport = 0;
    private enabledFlag = false;
    private readonly restore: () => void;

    constructor(game: Game) {
        this.game = game;

        const registry = game.systems;
        const update = registry.update.bind(registry);
        const fixedUpdate = registry.fixedUpdate.bind(registry);
        const lateUpdate = registry.lateUpdate.bind(registry);

        registry.update = (delta, hub, include) => this.time('update', () => update(delta, hub, include));
        registry.fixedUpdate = (step, hub, include) => this.time('fixedUpdate', () => fixedUpdate(step, hub, include));
        registry.lateUpdate = (delta, hub, include) => this.time('lateUpdate', () => lateUpdate(delta, hub, include));

        this.restore = () => {
            registry.update = update;
            registry.fixedUpdate = fixedUpdate;
            registry.lateUpdate = lateUpdate;
        };
    }

    get enabled(): boolean {
        return this.enabledFlag;
    }

    /** Start collecting. */
    enable(): void {
        this.enabledFlag = true;
        this.lastReport = this.game.time.elapsed;
    }

    /** Stop collecting and drop the samples. */
    disable(): void {
        this.enabledFlag = false;
        this.samples.clear();
    }

    toggle(enabled = !this.enabledFlag): void {
        if (enabled) this.enable();
        else this.disable();
    }

    /** Subscribe to the once-per-interval report. Returns an unsubscribe function. */
    onSample(listener: (rows: ProfileSample[]) => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    /** Rows for the last window, biggest total first. */
    rows(): ProfileSample[] {
        return [...this.samples.values()].sort((a, b) => b.total - a.total);
    }

    /** One-line summary, e.g. for a console log or a test assertion. */
    summary(): string {
        return this.rows()
            .map((row) => `${row.name}=${row.total.toFixed(1)}ms/${row.calls}`)
            .join(' ');
    }

    /** Show the top rows in the debug overlay, refreshed on every sample. */
    attachToDebugOverlay(rows = 4): void {
        this.onSample((samples) => {
            const top = samples.slice(0, rows);
            this.game.debug.log('profile', top.length === 0 ? 'idle' : top.map((row) => `${row.name} ${row.total.toFixed(1)}ms`).join(' | '));
        });
    }

    /** Remove the wrappers and forget every listener. */
    dispose(): void {
        this.disable();
        this.restore();
        this.listeners.clear();
    }

    //#region Internals

    private time(phase: ProfilePhase, run: () => void): void {
        if (!this.enabledFlag) {
            run();
            return;
        }

        const started = now();
        try {
            run();
        } finally {
            const elapsed = now() - started;
            const sample = this.samples.get(phase) ?? { name: phase, total: 0, calls: 0, peak: 0 };
            sample.total += elapsed;
            sample.calls += 1;
            sample.peak = Math.max(sample.peak, elapsed);
            this.samples.set(phase, sample);

            if (this.game.time.elapsed - this.lastReport >= this.interval) {
                this.lastReport = this.game.time.elapsed;
                const rows = this.rows();
                for (const listener of [...this.listeners]) listener(rows);
                for (const entry of this.samples.values()) {
                    entry.total = 0;
                    entry.calls = 0;
                    entry.peak = 0;
                }
            }
        }
    }

    //#endregion Internals
}

/**
 * A ready made on-screen readout, for tuning a level without opening devtools.
 * Returns the element, so a template can hide it again.
 */
export function createProfilerReadout(parent: HTMLElement, profiler: Profiler, rows = 6): HTMLElement {
    const element = div('profiler-readout', undefined, parent);
    element.style.position = 'absolute';
    element.style.top = '20px';
    element.style.right = '330px';
    element.style.fontFamily = 'ui-monospace, monospace';
    element.style.fontSize = '11px';
    element.style.lineHeight = '1.5';
    element.style.whiteSpace = 'pre';
    element.style.color = 'var(--ui-muted, #a7adba)';
    element.style.pointerEvents = 'none';

    profiler.onSample((samples) => {
        element.textContent = samples
            .slice(0, rows)
            .map((sample) => `${sample.name.padEnd(12)} ${sample.total.toFixed(2)} ms  x${sample.calls}  peak ${sample.peak.toFixed(2)}`)
            .join('\n');
    });
    profiler.enable();
    return element;
}
