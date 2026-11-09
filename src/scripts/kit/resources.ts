//#region Resources

export type ResourceOptions = {
    id: string;
    /** Label in the UI. Defaults to the id, capitalised. */
    label?: string;
    /** Starting amount. Defaults to 0. */
    initial?: number;
    /** Upper limit, `Infinity` by default. */
    max?: number;
    /** Lower limit. Defaults to 0. */
    min?: number;
    /** Show it in the HUD. Defaults to true. */
    showInHud?: boolean;
    /** Format the number, e.g. `(value) => \`$${value}\``. */
    format?: (value: number) => string;
    /** Round to whole numbers on every change. Off by default, so small per-frame gains add up. */
    integer?: boolean;
    onChange?: (value: number, delta: number) => void;
};

export type ResourceHandle = {
    readonly id: string;
    /** Current amount. */
    value: () => number;
    /** Set the amount and clamp it. */
    set: (value: number) => number;
    /** Add or subtract, clamped. Returns the new amount. */
    add: (amount: number) => number;
    /** Add `amount` only when it fits, e.g. a shop that refuses a purchase. */
    trySpend: (amount: number) => boolean;
    /** Take as much as possible and report how much was taken. */
    drain: (amount: number) => number;
    /** Fire the change listeners, e.g. after an external write. */
    refresh: () => void;
    onChange: (listener: (value: number, delta: number) => void) => () => void;
};

/**
 * A named counter with a HUD row: gold, wood, reputation, XP, lives.
 *
 * Resources are what costs are paid from, so an inventory can spend gold without
 * knowing whether the game calls it gold, coins or scrap.
 */
export function addResource(game: Game, options: ResourceOptions): ResourceHandle {
    const label = options.label ?? options.id.charAt(0).toUpperCase() + options.id.slice(1);
    const min = options.min ?? 0;
    const max = options.max ?? Infinity;
    let current = clamp(options.initial ?? 0);

    const listeners = new Set<(value: number, delta: number) => void>();

    function clamp(value: number): number {
        const rounded = options.integer === true ? Math.round(value) : value;
        return Math.min(max, Math.max(min, rounded));
    }

    function publish(next: number, previous: number): number {
        current = clamp(next);
        const delta = current - previous;
        if (options.showInHud !== false) game.hud.setStat(options.id, (options.format ?? String)(current), label);
        if (delta !== 0) {
            options.onChange?.(current, delta);
            for (const listener of [...listeners]) listener(current, delta);
        }
        return current;
    }

    const handle: ResourceHandle = {
        id: options.id,
        value: () => current,
        set: (value) => publish(value, current),
        add: (amount) => publish(current + amount, current),
        trySpend: (amount) => {
            if (current < amount) return false;
            publish(current - amount, current);
            return true;
        },
        drain: (amount) => {
            const taken = Math.min(current, amount);
            if (taken > 0) publish(current - taken, current);
            return taken;
        },
        refresh: () => {
            publish(current, current);
            if (options.showInHud !== false) game.hud.setStat(options.id, (options.format ?? String)(current), label);
        },
        onChange: (listener) => {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
    };

    // Paint the row once so it exists before the first change.
    handle.refresh();
    return handle;
}

//#endregion Resources
