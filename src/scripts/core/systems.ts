/**
 * Ordered list of per-frame and per-fixed-step updates.
 *
 * Anything that needs to run every frame registers here instead of being hard
 * wired into the loop. `order` decides who runs first (lower is earlier), which
 * matters because input must be sampled before movement and movement before
 * cameras.
 */
export type System = {
    /** Name for debugging, e.g. 'first-person-controls'. */
    name: string;
    /** Lower runs earlier. Default 0. */
    order?: number;
    /** Toggle without unregistering. Default true. */
    enabled?: boolean;
    /**
     * Run even when the world is not simulating, i.e. while a menu is open.
     * Use it for hotkeys, pause handling and other meta systems.
     */
    always?: boolean;
    /** Runs once per frame. `delta` is already scaled by `time.scale`. */
    update?: (delta: number, game: Game) => void;
    /** Runs once per fixed physics step. */
    fixedUpdate?: (step: number, game: Game) => void;
    /** Runs after `update`, for cameras and other things that read final positions. */
    lateUpdate?: (delta: number, game: Game) => void;
};

/** Common run orders, so systems do not fight over magic numbers. */
export const SYSTEM_ORDER = {
    INPUT: -100,
    CONTROL: 0,
    PHYSICS_SYNC: 10,
    GAMEPLAY: 20,
    CAMERA: 90,
    EFFECTS: 95,
    UI: 100,
} as const;

const always = (): boolean => true;

export class SystemRegistry {
    private systems: System[] = [];
    private dirty = false;

    /** Register a system. Returns a function that removes it again. */
    add(system: System): () => void {
        this.systems.push(system);
        this.dirty = true;
        return () => this.remove(system);
    }

    /** Convenience overload for one-off update callbacks. */
    addUpdate(name: string, update: (delta: number, game: Game) => void, order = 0): () => void {
        return this.add({ name, order, update });
    }

    remove(system: System): void {
        const index = this.systems.indexOf(system);
        if (index >= 0) this.systems.splice(index, 1);
        this.dirty = true;
    }

    /** Look up a registered system by name. */
    get(name: string): System | undefined {
        return this.systems.find((system) => system.name === name);
    }

    /** Enable or disable every system with the given name, e.g. all controls while paused. */
    setEnabled(names: string | string[], enabled: boolean): void {
        const list = Array.isArray(names) ? names : [names];
        for (const system of this.systems) {
            if (list.includes(system.name)) system.enabled = enabled;
        }
    }

    clear(): void {
        this.systems = [];
        this.dirty = false;
    }

    /**
     * Run every frame update.
     * @param include Optional filter, e.g. skip gameplay while a menu is open.
     */
    update(delta: number, game: Game, include: (system: System) => boolean = always): void {
        this.sorted();
        for (const system of this.systems) {
            if (system.enabled === false || !include(system)) continue;
            system.update?.(delta, game);
        }
    }

    /** Run every fixed step update. */
    fixedUpdate(step: number, game: Game, include: (system: System) => boolean = always): void {
        this.sorted();
        for (const system of this.systems) {
            if (system.enabled === false || !include(system)) continue;
            system.fixedUpdate?.(step, game);
        }
    }

    /** Run every late update, after physics and cameras. */
    lateUpdate(delta: number, game: Game, include: (system: System) => boolean = always): void {
        this.sorted();
        for (const system of this.systems) {
            if (system.enabled === false || !include(system)) continue;
            system.lateUpdate?.(delta, game);
        }
    }

    /** Bodies tagged with the given tag, in registration order. */
    names(): string[] {
        return this.systems.map((system) => system.name);
    }

    private sorted(): void {
        if (!this.dirty) return;
        this.systems.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        this.dirty = false;
    }
}
