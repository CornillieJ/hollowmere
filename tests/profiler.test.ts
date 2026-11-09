import assert from 'node:assert/strict';

import { Profiler } from '../src/scripts/helpers/profiler';

/**
 * The profiler wraps the system registry, so it is testable without a browser:
 * give it a fake game with a registry, a clock and a debug overlay, run updates
 * and check what it reports.
 */

type System = { name: string; order?: number; update?: (delta: number, game: unknown) => void };

function fakeGame(): { game: unknown; systems: { update: (delta: number, hub: unknown, include?: (system: System) => boolean) => void; fixedUpdate: () => void; lateUpdate: () => void }; elapsed: { value: number } } {
    const list: System[] = [];
    const elapsed = { value: 0 };
    const systems = {
        update: (delta: number): void => {
            for (const system of list) system.update?.(delta, undefined);
        },
        fixedUpdate: (): void => undefined,
        lateUpdate: (): void => undefined,
    };
    const game = {
        systems: Object.assign(systems, {
            add: (system: System) => {
                list.push(system);
                return () => undefined;
            },
        }),
        time: {
            get elapsed() {
                return elapsed.value;
            },
        },
        debug: { log: () => undefined, unlog: () => undefined },
    };
    return { game, systems, elapsed };
}

const { game, systems, elapsed } = fakeGame();
const profiler = new Profiler(game as never);

// Off by default: no samples, and the wrapped call still runs.
assert.equal(profiler.enabled, false);
systems.update(1 / 60, game);
assert.equal(profiler.rows().length, 0, 'disabled means nothing is recorded');

// Enabled: the phase is recorded and reported once the interval passes.
const reports: Array<Array<{ name: string; total: number; calls: number }>> = [];
profiler.onSample((rows) => reports.push(rows.map((row) => ({ name: row.name, total: row.total, calls: row.calls }))));
profiler.enable();
assert.equal(profiler.enabled, true);

systems.update(1 / 60, game);
systems.update(1 / 60, game);
assert.equal(profiler.samples.get('update')?.calls, 2, 'two calls recorded');

// Cross the report interval.
elapsed.value = 2;
systems.update(1 / 60, game);
assert.equal(reports.length, 1, 'one report per interval');
assert.ok(reports[0]?.some((row) => row.name === 'update'), 'the report names the phase');

// The window resets after a report, so totals do not grow forever.
const afterReport = profiler.samples.get('update');
assert.ok(afterReport !== undefined && afterReport.total < 1, `the window resets, total=${afterReport?.total}`);

profiler.disable();
assert.equal(profiler.rows().length, 0, 'disabling clears the samples');

profiler.dispose();
assert.equal(profiler.enabled, false);
