/**
 * Things bought once, or a few times, that change the game for good: a bigger
 * field, a better pot, another cow.
 *
 * Each upgrade has a list of levels with a price. `apply(level)` is the one
 * place the game reacts, and it is called both on purchase and on load, so it
 * should set the world to that level rather than add to it.
 *
 * Pure logic: no scene, no UI. `addUpgrades` in the kit wraps it.
 */
export type UpgradeLevel = {
    cost: number;
    /** Name of this step, e.g. "Iron pot". Defaults to the upgrade's name. */
    name?: string;
    description?: string;
};

export type UpgradeDefinition = {
    id: string;
    name: string;
    icon?: string;
    description?: string;
    /** One entry per purchase, in order. */
    levels: UpgradeLevel[];
    /** Hidden until another upgrade reaches a level. */
    requires?: { id: string; level: number };
    /** Set the world to this level. Called on purchase and on load, with 0 for "not bought". */
    apply?: (level: number) => void;
};

export class Upgrades {
    readonly definitions: UpgradeDefinition[];

    private readonly levels = new Map<string, number>();
    private readonly listeners = new Set<(id: string, level: number) => void>();

    constructor(definitions: UpgradeDefinition[]) {
        this.definitions = definitions;
    }

    /** How many times an upgrade was bought. */
    level(id: string): number {
        return this.levels.get(id) ?? 0;
    }

    definition(id: string): UpgradeDefinition | undefined {
        return this.definitions.find((definition) => definition.id === id);
    }

    /** The next step to buy, `undefined` when everything is bought. */
    next(id: string): UpgradeLevel | undefined {
        return this.definition(id)?.levels[this.level(id)];
    }

    maxed(id: string): boolean {
        return this.next(id) === undefined;
    }

    /** False while its `requires` is not met. */
    visible(id: string): boolean {
        const requires = this.definition(id)?.requires;
        return !requires || this.level(requires.id) >= requires.level;
    }

    /**
     * Buy the next level.
     * @param pay Takes the money and returns whether it could.
     */
    buy(id: string, pay: (cost: number) => boolean): boolean {
        const next = this.next(id);
        if (!next || !this.visible(id) || !pay(next.cost)) return false;
        this.set(id, this.level(id) + 1);
        return true;
    }

    /** Set a level directly, e.g. for a cheat or a quest reward. */
    set(id: string, level: number): void {
        const definition = this.definition(id);
        if (!definition) return;
        const clamped = Math.max(0, Math.min(definition.levels.length, level));
        this.levels.set(id, clamped);
        definition.apply?.(clamped);
        for (const listener of [...this.listeners]) listener(id, clamped);
    }

    onChange(listener: (id: string, level: number) => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    toJSON(): Record<string, number> {
        return Object.fromEntries(this.levels);
    }

    /** Restore levels and re-apply every upgrade, so the world matches the save. */
    fromJSON(data: Record<string, number> | undefined): void {
        for (const definition of this.definitions) this.set(definition.id, data?.[definition.id] ?? 0);
    }
}
