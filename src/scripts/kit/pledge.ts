import { SYSTEM_ORDER } from '../core/systems';
import type { ResourceHandle } from './resources';

//#region Pledge

/**
 * A sum to pay off before a deadline: a debt, a ransom, the price of the way
 * out. It can be paid in parts. Paying it all keeps the pledge; the deadline
 * passing first breaks it. Both are reported once, and the state is saved.
 *
 * ```ts
 * const pledge = addPledge(game, { id: 'escape', target: 12000, currency: coins, day: () => dayCycle.day, onKept: win, onMissed: stay });
 * pledge.start(60);       // 60 days from today
 * pledge.pay(500);
 * ```
 */
export type PledgeState = 'idle' | 'running' | 'kept' | 'missed';

export type AddPledgeOptions = {
    /** Save key. */
    id: string;
    target: number;
    currency: ResourceHandle;
    /** The current day number. */
    day: () => number;
    /** Show what is left and the days remaining as a HUD stat with this label. Omit for no readout. */
    hudLabel?: string;
    format?: (amount: number) => string;
    onKept?: () => void;
    onMissed?: () => void;
};

export type PledgeHandle = {
    readonly state: PledgeState;
    readonly paid: number;
    readonly remaining: number;
    /** Days left including today, 0 when not running. */
    readonly daysLeft: number;
    /** The last day on which it can still be paid. */
    readonly deadline: number;
    /** Begin the countdown: the pledge must be paid within this many days. */
    start: (days: number) => void;
    /** Pay up to `amount` out of the currency. Returns what was actually paid. */
    pay: (amount: number) => number;
    dispose: () => void;
};

export function addPledge(game: Game, options: AddPledgeOptions): PledgeHandle {
    let state: PledgeState = 'idle';
    let paid = 0;
    let deadline = 0;
    const format = options.format ?? ((amount: number) => String(amount));
    const daysLeft = (): number => (state === 'running' ? Math.max(0, deadline - options.day() + 1) : 0);

    const removeSystem = game.systems.add({
        name: `pledge-${options.id}`,
        order: SYSTEM_ORDER.GAMEPLAY + 9,
        update: () => {
            if (state === 'running' && options.day() > deadline) {
                state = 'missed';
                options.onMissed?.();
            }
            if (!options.hudLabel) return;
            if (state === 'running') game.hud.setStat(`pledge-${options.id}`, `${format(options.target - paid)} · ${daysLeft()}d`, options.hudLabel);
            else game.hud.removeStat(`pledge-${options.id}`);
        },
    });
    const removeSave = game.save.register(`pledge-${options.id}`, {
        save: () => ({ state, paid, deadline }),
        load: (data) => {
            const saved = data as { state?: PledgeState; paid?: number; deadline?: number } | undefined;
            state = saved?.state ?? 'idle';
            paid = saved?.paid ?? 0;
            deadline = saved?.deadline ?? 0;
            // The target may have come down since this was saved.
            if (state === 'running' && paid >= options.target) state = 'kept';
        },
    });

    return {
        get state() {
            return state;
        },
        get paid() {
            return paid;
        },
        get remaining() {
            return options.target - paid;
        },
        get daysLeft() {
            return daysLeft();
        },
        get deadline() {
            return deadline;
        },
        start: (days) => {
            if (state !== 'idle') return;
            state = 'running';
            deadline = options.day() + days - 1;
        },
        pay: (amount) => {
            if (state !== 'running') return 0;
            const part = options.currency.drain(Math.min(amount, options.target - paid));
            paid += part;
            if (paid >= options.target) {
                state = 'kept';
                options.onKept?.();
            }
            return part;
        },
        dispose: () => {
            removeSystem();
            removeSave();
        },
    };
}

//#endregion Pledge
