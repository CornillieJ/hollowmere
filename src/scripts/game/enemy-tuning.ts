/**
 * Kinds of enemy, and how their manners change.
 *
 * A kind is a set of spawn options. A mood ("night", "enraged", "storm")
 * scales or replaces some of them for as long as it lasts, and an alert level
 * from 0 to 1 (noise, scent, a wanted level) stretches others. The numbers an
 * enemy was made with are kept, so a mood ending puts them back exactly.
 * Pure logic: the kit's `addEnemyKinds` applies it to live enemies.
 */
export type Tunable = Record<string, unknown>;

export type EnemyTuning<T extends Tunable = Tunable> = {
    /** Multiply these numeric options. */
    scale?: Partial<Record<keyof T & string, number>>;
    /** Replace these options outright. Applied after `scale`. */
    set?: Partial<T>;
};

/** How much of each numeric option is added at alert 1: `{ aggroRange: 0.7 }` is 70% further. */
export type AlertGain<T extends Tunable = Tunable> = Partial<Record<keyof T & string, number>>;

/** The options an enemy should have right now, from the ones it was made with. */
export function tuneOptions<T extends Tunable>(base: T, mood: EnemyTuning<T> | undefined, gain: AlertGain<T> | undefined, alert: number): T {
    const tuned: Tunable = { ...base };
    const multiply = (key: string, factor: number): void => {
        if (typeof tuned[key] === 'number') tuned[key] = (tuned[key] as number) * factor;
    };
    for (const [key, factor] of Object.entries(mood?.scale ?? {})) multiply(key, factor as number);
    Object.assign(tuned, mood?.set);
    const level = Math.max(0, Math.min(1, alert));
    for (const [key, extra] of Object.entries(gain ?? {})) multiply(key, 1 + level * (extra as number));
    return tuned as T;
}

/** Draw one id by weight from those that are open. */
export function pickWeighted<T extends { weight?: number; when?: () => boolean }>(kinds: Record<string, T>, random: () => number = Math.random): string | undefined {
    const open = Object.entries(kinds).filter(([, kind]) => (kind.weight ?? 1) > 0 && (kind.when?.() ?? true));
    let ticket = random() * open.reduce((sum, [, kind]) => sum + (kind.weight ?? 1), 0);
    for (const [id, kind] of open) {
        ticket -= kind.weight ?? 1;
        if (ticket < 0) return id;
    }
    return open[open.length - 1]?.[0];
}
