import { SYSTEM_ORDER } from '../core/systems';

/**
 * Hot food.
 *
 * A dish is hot when it leaves the pot and cools by the hour: hot for a few
 * hours, warm for a few more, then cold. Whoever asked for it pays more the
 * hotter it arrives. A visit takes hours, so a round of deliveries has an
 * order that matters, and a pot emptied in the morning is worth more than one
 * emptied the night before.
 *
 * Heat is kept per kind of dish, not per bowl: taking more of the same from the
 * pot warms the lot a little, as it would in one basket. A dish that leaves the
 * farmer's hands (into the chest, onto the ground) is cold when it comes back.
 */
export type Heat = 'hot' | 'warm' | 'cold';

export type WarmthOptions = {
    /** The dishes that have a temperature at all. */
    dishes: Set<string>;
    /** How many of an item the farmer carries. */
    have: (itemId: string) => number;
    /** The hour since the first midnight: day and clock in one number. */
    now: () => number;
    /** Stretches both spans, e.g. 1.5 once somebody has knitted a cosy. Defaults to 1. */
    keep?: () => number;
};

export type WarmthHandle = {
    /** Call when dishes come out of the pot into the farmer's hands, after they were added. */
    collected: (itemId: string, amount: number) => void;
    /** How hot the carried dishes of this kind are. `undefined` for anything that is not a dish. */
    heatOf: (itemId: string) => Heat | undefined;
    /** Hours until it drops to the next state. 0 once cold. */
    hoursLeft: (itemId: string) => number;
    /** The part of the reward added for delivering it as it is now: 0.3 hot, 0.12 warm, 0 cold. */
    bonus: (itemId: string) => number;
    /** Every dish carried, hottest first. */
    carried: () => Array<{ itemId: string; amount: number; heat: Heat; hoursLeft: number }>;
    /** How strongly the basket smells: hot dishes count double, cold ones hardly. */
    scent: () => number;
    toJSON: () => Record<string, number>;
    fromJSON: (data: unknown) => void;
};

/** Hours a dish stays hot, and hours after that it stays warm. */
export const HOT_HOURS = 4;
export const WARM_HOURS = 6;
export const HEAT_BONUS: Record<Heat, number> = { hot: 0.3, warm: 0.12, cold: 0 };

export function setupWarmth(game: Game, options: WarmthOptions): WarmthHandle {
    /** When each kind of dish came off the fire, in hours. */
    const cookedAt = new Map<string, number>();
    const keep = (): number => options.keep?.() ?? 1;

    const ageOf = (itemId: string): number => {
        const at = cookedAt.get(itemId);
        return at === undefined ? Infinity : options.now() - at;
    };
    const heatOf = (itemId: string): Heat | undefined => {
        if (!options.dishes.has(itemId)) return undefined;
        const age = ageOf(itemId);
        return age <= HOT_HOURS * keep() ? 'hot' : age <= (HOT_HOURS + WARM_HOURS) * keep() ? 'warm' : 'cold';
    };
    const hoursLeft = (itemId: string): number => {
        const age = ageOf(itemId);
        const hot = HOT_HOURS * keep();
        const warm = (HOT_HOURS + WARM_HOURS) * keep();
        return age <= hot ? hot - age : age <= warm ? warm - age : 0;
    };

    // What is no longer carried has no temperature to keep.
    game.systems.add({
        name: 'warmth',
        order: SYSTEM_ORDER.GAMEPLAY + 8,
        update: () => {
            for (const itemId of [...cookedAt.keys()]) if (options.have(itemId) === 0) cookedAt.delete(itemId);
        },
    });

    return {
        collected: (itemId, amount) => {
            if (!options.dishes.has(itemId)) return;
            const now = options.now();
            const before = Math.max(0, options.have(itemId) - amount);
            const old = cookedAt.get(itemId);
            // Fresh bowls in with older ones: the basket ends up somewhere in between. Cold ones count as long cold.
            const oldAt = old === undefined ? now - (HOT_HOURS + WARM_HOURS) * keep() : Math.max(old, now - (HOT_HOURS + WARM_HOURS) * keep());
            cookedAt.set(itemId, before === 0 ? now : (oldAt * before + now * amount) / (before + amount));
        },
        heatOf,
        hoursLeft,
        bonus: (itemId) => HEAT_BONUS[heatOf(itemId) ?? 'cold'],
        carried: () =>
            [...options.dishes]
                .map((itemId) => ({ itemId, amount: options.have(itemId), heat: heatOf(itemId) ?? 'cold', hoursLeft: hoursLeft(itemId) }))
                .filter((dish) => dish.amount > 0)
                .sort((a, b) => ageOf(a.itemId) - ageOf(b.itemId)),
        scent: () => [...options.dishes].reduce((total, itemId) => total + options.have(itemId) * (heatOf(itemId) === 'hot' ? 2 : heatOf(itemId) === 'warm' ? 1 : 0.25), 0),
        toJSON: () => Object.fromEntries(cookedAt),
        fromJSON: (data) => {
            cookedAt.clear();
            if (!data || typeof data !== 'object') return;
            for (const [itemId, at] of Object.entries(data as Record<string, unknown>)) if (typeof at === 'number') cookedAt.set(itemId, at);
        },
    };
}
