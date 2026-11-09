/**
 * Minimal finite state machine.
 *
 * Used for the game phase (menu, playing, paused, dead) and available for
 * anything else that has clear modes, e.g. an enemy's idle/chase/attack loop.
 */
export type StateHooks<S extends string> = {
    /** Runs once when the state is entered. */
    enter?: (from: S | undefined) => void;
    /** Runs once when the state is left. */
    exit?: (to: S) => void;
    /** Runs every frame while the state is active. */
    update?: (delta: number) => void;
};

export class StateMachine<S extends string> {
    private currentState: S;
    private readonly hooks = new Map<S, StateHooks<S>>();
    private readonly listeners = new Set<(to: S, from: S | undefined) => void>();

    constructor(initial: S) {
        this.currentState = initial;
    }

    /** The active state. */
    get current(): S {
        return this.currentState;
    }

    /** True when the machine sits in any of the given states. */
    is(...states: S[]): boolean {
        return states.includes(this.currentState);
    }

    /** Register enter/exit/update handlers for a state. Chainable. */
    define(state: S, hooks: StateHooks<S>): this {
        this.hooks.set(state, hooks);
        return this;
    }

    /** Notified after every successful transition. Returns an unsubscribe function. */
    onChange(listener: (to: S, from: S | undefined) => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    /**
     * Switch state. Re-entering the current state is a no-op unless `force` is set,
     * so `game.state.set(game.state.current)` never retriggers enter hooks.
     */
    set(next: S, force = false): boolean {
        if (next === this.currentState && !force) return false;
        const previous = this.currentState;
        this.hooks.get(previous)?.exit?.(next);
        this.currentState = next;
        this.hooks.get(next)?.enter?.(previous);
        for (const listener of [...this.listeners]) listener(next, previous);
        return true;
    }

    /** Run the update hook of the active state, if any. */
    update(delta: number): void {
        this.hooks.get(this.currentState)?.update?.(delta);
    }
}
