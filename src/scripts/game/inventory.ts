import { Cooldown } from '../helpers/timing';
import { ItemRegistry, type ItemCost, type ItemDefinition, type ItemUseContext, type InventoryApi } from './items';

/**
 * Inventory state: what is carried, what it cost, what can be used.
 *
 * Data only. The screen that draws it is `ui/inventory-screen.ts` and the
 * one-call installer is `addInventory` in `kit.ts`. Everything a game needs to
 * ask is here: `has`, `count`, `add`, `remove`, `use`, `spend`, `canAfford`,
 * `buy`, `sell`, `unlock`.
 *
 * The same object backs an RPG bag and a tower defence shop: the difference is
 * which items the screen lists and whether buying is allowed.
 */
export type InventorySlot = {
    itemId: string;
    amount: number;
    definition: ItemDefinition;
};

export type InventoryOptions = {
    /** How many distinct stacks fit. Defaults to 24. */
    capacity?: number;
    /** Item definitions. Omit to share a registry the game already made. */
    registry?: ItemRegistry;
    /** Money handling. When set, `spend` and `buy` draw from it. */
    currency?: {
        /** Resource id, e.g. 'gold'. */
        id: string;
        get: () => number;
        spend: (amount: number) => boolean;
        earn?: (amount: number) => void;
    } | undefined;
    /** Multiplier on `price` when buying. Defaults to 1. */
    buyMultiplier?: number;
    /** Multiplier on `price` when selling. Defaults to 0.5. */
    sellMultiplier?: number;
    /** Start unlocked, on top of anything in the item's own `requires`. */
    unlocked?: string[];
    /** Progression level used by `requires.level`. Defaults to 1. */
    level?: number;
    /**
     * Make this a shop for another inventory: purchases land in that bag, sales
     * come out of it, and its level and unlocks decide what is for sale. Without
     * it, a shop would buy into itself and the player would never get the item.
     */
    customer?: Inventory;
    /** Called whenever the contents change. */
    onChanged?: (slots: InventorySlot[], inventory: Inventory) => void;
    /** Called after an item is used successfully. */
    onUsed?: (item: ItemDefinition, inventory: Inventory) => void;
};

export class Inventory implements InventoryApi {
    /** Maximum number of distinct stacks. */
    capacity: number;

    readonly registry: ItemRegistry;
    readonly slots: InventorySlot[] = [];

    private readonly options: InventoryOptions;
    private readonly cooldowns = new Map<string, Cooldown>();
    private readonly unlockedIds = new Set<string>();
    private selectedIndex = 0;
    private level: number;

    constructor(options: InventoryOptions = {}) {
        this.options = options;
        this.capacity = options.capacity ?? 24;
        this.registry = options.registry ?? new ItemRegistry();
        this.level = options.level ?? 1;
        for (const id of options.unlocked ?? []) this.unlockedIds.add(id);
    }

    //#region Reading

    /** Slot for an item id, `undefined` when it is not carried. */
    slotOf(itemId: string): InventorySlot | undefined {
        return this.slots.find((slot) => slot.itemId === itemId);
    }

    /** How many are carried. */
    count(itemId: string): number {
        return this.slotOf(itemId)?.amount ?? 0;
    }

    /** True when at least `amount` are carried. */
    has(itemId: string, amount = 1): boolean {
        return this.count(itemId) >= amount;
    }

    /** Number of distinct stacks carried. */
    get used(): number {
        return this.slots.length;
    }

    get isFull(): boolean {
        return this.slots.length >= this.capacity;
    }

    /** Carried item ids. */
    get itemIds(): string[] {
        return this.slots.map((slot) => slot.itemId);
    }

    /** Total price of everything carried, at the sell rate. */
    get value(): number {
        return this.slots.reduce((total, slot) => total + this.registry.sellPrice(slot.itemId, this.options.sellMultiplier ?? 0.5) * slot.amount, 0);
    }

    /** Index of the highlighted slot, for the screen and for quick keys. */
    get selection(): number {
        return this.selectedIndex;
    }

    /** The highlighted slot, `undefined` when nothing is carried. */
    get selected(): InventorySlot | undefined {
        return this.slots[this.selectedIndex];
    }

    //#endregion Reading

    //#region Changing

    /**
     * Add items.
     * @returns How many did not fit, 0 when everything was accepted.
     */
    add(itemId: string, amount = 1): number {
        if (amount <= 0) return 0;
        const definition = this.registry.resolve(itemId);
        const maxStack = definition.maxStack ?? 99;
        const slot = this.slotOf(itemId);

        if (!slot && this.isFull) return amount;

        const current = slot?.amount ?? 0;
        const accepted = Math.min(amount, Math.max(0, maxStack - current));
        if (accepted <= 0) return amount;

        if (slot) slot.amount = current + accepted;
        else this.slots.push({ itemId, amount: accepted, definition });
        this.changed();
        return amount - accepted;
    }

    /** Add a whole list at once, e.g. a quest reward or starting gear. */
    addAll(costs: ItemCost[]): number {
        let leftover = 0;
        for (const cost of costs) leftover += this.add(cost.id, cost.amount);
        return leftover;
    }

    /** True when every item in the list is carried in the given amount. */
    hasAll(costs: ItemCost[]): boolean {
        return costs.every((cost) => this.has(cost.id, cost.amount));
    }

    /** Remove items. Returns false when the amount is not available. */
    remove(itemId: string, amount = 1): boolean {
        const slot = this.slotOf(itemId);
        if (!slot || amount <= 0 || slot.amount < amount) return false;

        slot.amount -= amount;
        if (slot.amount <= 0) this.slots.splice(this.slots.indexOf(slot), 1);
        if (this.selectedIndex >= this.slots.length) this.selectedIndex = Math.max(0, this.slots.length - 1);
        this.changed();
        return true;
    }

    /**
     * Move items into another inventory, e.g. from the bag to the pockets. Moves
     * what fits and keeps the rest here.
     * @returns How many moved.
     */
    moveTo(target: Inventory, itemId: string, amount = this.count(itemId)): number {
        const moving = Math.min(amount, this.count(itemId));
        if (moving <= 0 || target === this) return 0;
        const moved = moving - target.add(itemId, moving);
        if (moved > 0) this.remove(itemId, moved);
        return moved;
    }

    /** Empty everything, e.g. on a new game. */
    clear(): void {
        this.slots.length = 0;
        this.selectedIndex = 0;
        this.changed();
    }

    //#endregion Changing

    //#region Spending

    /** True when the inventory holds every cost. */
    canAfford(costs: ItemCost[]): boolean {
        return costs.every((cost) => (cost.id === this.options.currency?.id ? (this.options.currency?.get() ?? 0) >= cost.amount : this.has(cost.id, cost.amount)));
    }

    /**
     * Take a list of costs, either items or the currency.
     * Nothing is taken unless all of it can be paid.
     */
    spend(costs: ItemCost[]): boolean {
        if (!this.canAfford(costs)) return false;
        for (const cost of costs) {
            if (cost.id === this.options.currency?.id) this.options.currency?.spend(cost.amount);
            else this.remove(cost.id, cost.amount);
        }
        return true;
    }

    /** How much currency the player has, `0` when the inventory has none. */
    currencyBalance(): number {
        return this.options.currency?.get() ?? 0;
    }

    /** Grant the currency, e.g. when something is sold. */
    earn(amount: number): boolean {
        if (!this.options.currency?.earn || amount <= 0) return false;
        this.options.currency.earn(amount);
        return true;
    }

    //#endregion Spending

    //#region Using

    /** True when `use` on this item would do something right now. */
    canUse(itemId: string): boolean {
        const definition = this.registry.get(itemId);
        if (!definition?.use || !this.has(itemId)) return false;
        if (!this.isUnlocked(itemId)) return false;
        const cooldown = this.cooldowns.get(itemId);
        if (cooldown && !cooldown.ready) return false;
        const check = definition.use.canUse?.(this.contextFor(definition));
        if (check === false) return false;
        return true;
    }

    /** Why a use was refused, for a toast. `undefined` when it would work. */
    useBlockedReason(itemId: string): string | undefined {
        const definition = this.registry.get(itemId);
        if (!definition) return 'Unknown item';
        // Being locked is the more useful message, so it is checked before the
        // item's own usability.
        if (!this.isUnlocked(itemId)) return `${definition.name} is locked`;
        if (!definition.use) return `${definition.name} cannot be used`;
        if (!this.has(itemId)) return `No ${definition.name}`;
        const cooldown = this.cooldowns.get(itemId);
        if (cooldown && !cooldown.ready) return `${definition.name} is on cooldown`;
        const check = definition.use.canUse?.(this.contextFor(definition));
        if (typeof check === 'string') return check;
        if (check === false) return `${definition.name} cannot be used yet`;
        return undefined;
    }

    /**
     * Use an item: checks the gate and the cooldown, runs the handler, and
     * consumes it when the definition says so.
     * @returns True when the use happened.
     */
    use(itemId: string): boolean {
        const definition = this.registry.get(itemId);
        if (!definition?.use || !this.canUse(itemId)) return false;

        definition.use.onUse?.(this.contextFor(definition));
        if (definition.use.cooldown) {
            const existing = this.cooldowns.get(itemId);
            if (existing) existing.trigger(definition.use.cooldown);
            else this.cooldowns.set(itemId, new Cooldown(definition.use.cooldown, false));
        }
        if (definition.use.consume !== false) this.remove(itemId, 1);

        this.options.onUsed?.(definition, this);
        this.changed();
        return true;
    }

    /** Tick item cooldowns. Call it from a system, or let `addInventory` do it. */
    update(delta: number): void {
        for (const cooldown of this.cooldowns.values()) cooldown.update(delta);
    }

    /** How much cooldown is left on an item, in seconds. */
    cooldownLeft(itemId: string): number {
        return this.cooldowns.get(itemId)?.remaining ?? 0;
    }

    //#endregion Using

    //#region Gating

    /** Progression level used by `requires.level`. */
    get progressionLevel(): number {
        return this.level;
    }

    set progressionLevel(level: number) {
        this.level = level;
        this.changed();
    }

    /** Mark an unlock id, e.g. 'shop-tier-2'. */
    unlock(id: string): void {
        if (this.unlockedIds.has(id)) return;
        this.unlockedIds.add(id);
        this.changed();
    }

    /** Remove an unlock id. */
    lock(id: string): void {
        if (!this.unlockedIds.delete(id)) return;
        this.changed();
    }

    isUnlockedFlag(id: string): boolean {
        return this.unlockedIds.has(id);
    }

    /** True when every requirement on the item is met. */
    isUnlocked(itemId: string): boolean {
        if (this.options.customer) return this.options.customer.isUnlocked(itemId);
        const requires = this.registry.get(itemId)?.requires;
        if (!requires) return true;
        if (requires.level !== undefined && this.level < requires.level) return false;
        if (requires.unlocks?.some((id) => !this.unlockedIds.has(id))) return false;
        if (requires.items && !this.hasAll(requires.items)) return false;
        return true;
    }

    /** Why an item is locked, for a tooltip. `undefined` when it is available. */
    lockedReason(itemId: string): string | undefined {
        if (this.options.customer) return this.options.customer.lockedReason(itemId);
        const requires = this.registry.get(itemId)?.requires;
        if (!requires) return undefined;
        if (requires.level !== undefined && this.level < requires.level) return `Needs level ${requires.level}`;
        for (const id of requires.unlocks ?? []) {
            if (!this.unlockedIds.has(id)) return `Needs ${id.replace(/[-_]/g, ' ')}`;
        }
        for (const cost of requires.items ?? []) {
            if (!this.has(cost.id, cost.amount)) return `Needs ${cost.amount} ${this.registry.resolve(cost.id).name}`;
        }
        return undefined;
    }

    //#endregion Gating

    //#region Shop

    /** Buy price of an item, with the shop multiplier applied. */
    buyPrice(itemId: string): number {
        return this.registry.buyPrice(itemId, this.options.buyMultiplier ?? 1);
    }

    sellPrice(itemId: string): number {
        return this.registry.sellPrice(itemId, this.options.sellMultiplier ?? 0.5);
    }

    /**
     * Buy an item with the currency, respecting the unlock gate and capacity.
     * @returns True when the purchase happened.
     */
    buy(itemId: string, amount = 1): boolean {
        const definition = this.registry.get(itemId);
        const currency = this.options.currency;
        if (!definition || !currency) return false;
        if (!this.isUnlocked(itemId)) return false;
        const target = this.options.customer ?? this;
        if (!target.slotOf(itemId) && target.isFull) return false;

        const price = this.buyPrice(itemId) * amount;
        if (!currency.spend(price)) return false;
        target.add(itemId, amount);
        // The listing did not change, but a shop panel still shows the new balance.
        if (target !== this) this.options.onChanged?.(this.slots, this);
        return true;
    }

    /** Sell items back at the sell price. A shop sells out of its customer's bag. */
    sell(itemId: string, amount = 1): boolean {
        const source = this.options.customer ?? this;
        if (!this.options.currency || !source.has(itemId, amount) || this.registry.resolve(itemId).keep) return false;
        if (!source.remove(itemId, amount)) return false;
        this.options.currency.earn?.(this.sellPrice(itemId) * amount);
        return true;
    }

    /** Whose items a shop buys and sells: the customer's bag, or its own when it has none. */
    get trader(): Inventory {
        return this.options.customer ?? this;
    }

    /** Move a stack to another place in the list, e.g. after a drag. Out-of-range targets go to the end. */
    reorder(from: number, to: number): void {
        const [slot] = this.slots.splice(from, 1);
        if (!slot) return;
        this.slots.splice(Math.max(0, Math.min(this.slots.length, to)), 0, slot);
        this.options.onChanged?.(this.slots, this);
    }

    /** Trade the places of two stacks. */
    swap(a: number, b: number): void {
        const first = this.slots[a];
        const second = this.slots[b];
        if (!first || !second || a === b) return;
        this.slots[a] = second;
        this.slots[b] = first;
        this.options.onChanged?.(this.slots, this);
    }

    /**
     * Trade a stack here for a stack in another inventory, slot for slot.
     * @returns False when either side already holds the incoming item elsewhere; move the stack instead, so it merges.
     */
    swapWith(index: number, other: Inventory, otherIndex: number): boolean {
        const mine = this.slots[index];
        const theirs = other.slots[otherIndex];
        if (!mine || !theirs || other === this) return false;
        if (mine.itemId === theirs.itemId || other.slotOf(mine.itemId) || this.slotOf(theirs.itemId)) return false;
        this.slots[index] = theirs;
        other.slots[otherIndex] = mine;
        this.options.onChanged?.(this.slots, this);
        other.options.onChanged?.(other.slots, other);
        return true;
    }

    /** True when this inventory trades in a currency. */
    get hasCurrency(): boolean {
        return this.options.currency !== undefined;
    }

    //#endregion Shop

    //#region Selection

    /** Highlight a slot by index, wrapping around. */
    select(index: number): InventorySlot | undefined {
        if (this.slots.length === 0) {
            this.selectedIndex = 0;
            return undefined;
        }
        this.selectedIndex = ((index % this.slots.length) + this.slots.length) % this.slots.length;
        return this.selected;
    }

    /** Move the highlight, e.g. from a mouse wheel. */
    cycle(step = 1): InventorySlot | undefined {
        return this.select(this.selectedIndex + step);
    }

    /** The item id in a slot index, for a hotbar. */
    itemAt(index: number): string | undefined {
        return this.slots[index]?.itemId;
    }

    /** Total price of everything of a category, for a summary line. */
    valueOfCategory(category: string): number {
        return this.slots.filter((slot) => (slot.definition.category ?? 'material') === category).reduce((total, slot) => total + this.sellPrice(slot.itemId) * slot.amount, 0);
    }

    //#endregion Selection

    //#region Persistence

    toJSON(): { slots: Array<{ id: string; amount: number }>; selected: number; unlocked: string[] } {
        return {
            slots: this.slots.map((slot) => ({ id: slot.itemId, amount: slot.amount })),
            selected: this.selectedIndex,
            unlocked: [...this.unlockedIds],
        };
    }

    fromJSON(data: { slots?: Array<{ id: string; amount: number }>; selected?: number; unlocked?: string[] } | undefined): void {
        if (!data) return;
        this.slots.length = 0;
        // `resolve` matches `add`: an item added without a definition survives a save too.
        for (const slot of data.slots ?? []) {
            this.slots.push({ itemId: slot.id, amount: slot.amount, definition: this.registry.resolve(slot.id) });
        }
        this.selectedIndex = Math.min(data.selected ?? 0, Math.max(0, this.slots.length - 1));
        this.unlockedIds.clear();
        for (const id of data.unlocked ?? []) this.unlockedIds.add(id);
        this.changed();
    }

    //#endregion Persistence

    //#region Internals

    private contextFor(definition: ItemDefinition): ItemUseContext {
        return { game: GAMES.get(this), item: definition, count: this.count(definition.id), inventory: this };
    }

    private changed(): void {
        this.options.onChanged?.(this.slots, this);
    }

    //#endregion Internals
}

/**
 * The game hub attached by `addInventory`, so item handlers can reach the world.
 * Kept in a WeakMap rather than a constructor argument so an inventory can be
 * created and unit tested without a game at all.
 */
const GAMES = new WeakMap<Inventory, Game>();

/** Attach the hub to an inventory. Done by the installer. */
export function bindGame(inventory: Inventory, game: Game): void {
    GAMES.set(inventory, game);
}

/** The hub an inventory belongs to, `undefined` for a standalone one. */
export function gameOf(inventory: Inventory): Game | undefined {
    return GAMES.get(inventory);
}

/** The hub an inventory belongs to, or a clear error when it has none. */
export function requireGame(inventory: Inventory): Game {
    const game = GAMES.get(inventory);
    if (!game) throw new Error('[inventory] this inventory was not installed with addInventory(game, ...), so it has no game');
    return game;
}
