import type * as THREE from 'three';

/**
 * Item definitions.
 *
 * One definition drives everything the rest of the library does with an item:
 * the pickup in the world, the slot in the inventory grid, the price in a shop,
 * what happens when it is used, and what has to be true before it can be had at
 * all. A game writes a list of these and gets the rest for free.
 *
 * ```ts
 * const items: ItemDefinition[] = [
 *   { id: 'bread', name: 'Bread', icon: '🍞', category: 'consumable', price: 6,
 *     use: { onUse: ({ game }) => game.player?.heal(30) }, description: 'Restores 30 health' },
 *   { id: 'axe', name: 'Axe', icon: '🪓', category: 'tool', price: 80, maxStack: 1,
 *     requires: { level: 2 } },
 *   { id: 'key-rusty', name: 'Rusty key', icon: '🗝', category: 'quest', hidden: true },
 * ];
 * ```
 */
export type ItemCategory = 'material' | 'consumable' | 'tool' | 'weapon' | 'armour' | 'quest' | 'treasure' | (string & {});

export type ItemRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

/** A cost, used by `spend`, shops and gates. */
export type ItemCost = { id: string; amount: number };

/** Context handed to the use handlers. */
export type ItemUseContext = {
    /**
     * The game hub, when the inventory was installed with `addInventory`.
     * A standalone inventory (a test, or a menu without a world) has none, so
     * handlers that need the scene should guard for it.
     */
    game: Game | undefined;
    item: ItemDefinition;
    /** How many of the item are held when it is used. */
    count: number;
    /** The inventory doing the using, so a handler can grant something back. */
    inventory: InventoryApi;
};

export type ItemDefinition = {
    id: string;
    name: string;
    /** Emoji or a couple of letters, drawn in the slot. */
    icon?: string;
    description?: string;
    /** Long text for a detail pane, defaults to `description`. */
    lore?: string;
    category?: ItemCategory;
    rarity?: ItemRarity;
    /** Items per slot. Defaults to 99; use 1 for tools and equipment. */
    maxStack?: number;
    /** Base price. Buy price is `price * buyMultiplier`, sell is `price * sellMultiplier`. */
    price?: number;
    /** Accent colour for the slot, the stat row and any 3D pickup. */
    color?: THREE.ColorRepresentation;
    /** Asset path for a 3D model, when the item can exist in the world. */
    model?: string;
    /** Flat stat lines shown in the detail pane, e.g. `['damage 20', 'range 7']`. */
    stats?: string[];
    /**
     * Cannot be dropped or sold: the tools and quest items a game cannot be
     * finished without. It can still be moved between the player's own inventories.
     */
    keep?: boolean;
    /** What using it does. */
    use?: {
        /** Remove one on use. Defaults to true for consumables, false otherwise. */
        consume?: boolean;
        /** Seconds before it may be used again. */
        cooldown?: number;
        /** Return false, or a reason string, to refuse the use. */
        canUse?: (context: ItemUseContext) => boolean | string;
        /** The effect. Runs after the checks pass. */
        onUse?: (context: ItemUseContext) => void;
    };
    /** Requirements before it can be bought, used or unlocked. */
    requires?: {
        /** Minimum progression level. */
        level?: number;
        /** Items that must be held or previously unlocked. */
        items?: ItemCost[];
        /** Unlock ids that must be set, e.g. 'shop-tier-2'. */
        unlocks?: string[];
    };
    /** Keep it out of the inventory grid, e.g. quest items and internal counters. */
    hidden?: boolean;
    /** Free-form tags for filtering, e.g. `['seed', 'plantable']`. */
    tags?: string[];
};

/** The behaviour an inventory exposes, so handlers can call back into it. */
export type InventoryApi = {
    add: (id: string, amount?: number) => number;
    remove: (id: string, amount?: number) => boolean;
    has: (id: string, amount?: number) => boolean;
    count: (id: string) => number;
    spend: (costs: ItemCost[]) => boolean;
    canAfford: (costs: ItemCost[]) => boolean;
};

/**
 * The list of every item in a game.
 *
 * Definitions are shared, so the inventory, the shop, the pickups and the save
 * file all agree on what an item is. Unknown ids are tolerated (they show as a
 * placeholder) so a save from an older build never crashes a game.
 */
export class ItemRegistry {
    private readonly definitions = new Map<string, ItemDefinition>();

    constructor(definitions: ItemDefinition[] = []) {
        this.defineMany(definitions);
    }

    /** Register one item, or replace it when the id already exists. */
    define(definition: ItemDefinition): ItemDefinition {
        const complete: ItemDefinition = { maxStack: 99, category: 'material', rarity: 'common', ...definition };
        // Consumables disappear when used, tools do not.
        if (complete.use && complete.use.consume === undefined) complete.use.consume = complete.category === 'consumable';
        this.definitions.set(complete.id, complete);
        return complete;
    }

    /** Register a list of items. */
    defineMany(definitions: ItemDefinition[]): void {
        for (const definition of definitions) this.define(definition);
    }

    /** The definition, or `undefined` when the id is unknown. */
    get(id: string): ItemDefinition | undefined {
        return this.definitions.get(id);
    }

    /** The definition, or a safe placeholder so UI code never has to null check. */
    resolve(id: string): ItemDefinition {
        return this.definitions.get(id) ?? { id, name: id, icon: '?', category: 'material', rarity: 'common', maxStack: 99 };
    }

    has(id: string): boolean {
        return this.definitions.has(id);
    }

    /** Every definition, in registration order. */
    all(): ItemDefinition[] {
        return [...this.definitions.values()];
    }

    /** Definitions carrying a tag. */
    withTag(tag: string): ItemDefinition[] {
        return this.all().filter((item) => item.tags?.includes(tag));
    }

    /** Definitions in a category. */
    withCategory(category: ItemCategory): ItemDefinition[] {
        return this.all().filter((item) => item.category === category);
    }

    /** Definitions that have a price, i.e. things a shop can sell. */
    sellable(): ItemDefinition[] {
        return this.all().filter((item) => (item.price ?? 0) > 0 && !item.hidden && !item.keep);
    }

    /** Every category in use, for a filter row. */
    categories(): ItemCategory[] {
        const found = new Set<ItemCategory>();
        for (const item of this.definitions.values()) found.add(item.category ?? 'material');
        return [...found];
    }

    /** Max stack for an id, `99` when unknown. */
    maxStack(id: string): number {
        return this.definitions.get(id)?.maxStack ?? 99;
    }

    /** Price helpers. `buyMultiplier` and `sellMultiplier` come from the shop. */
    buyPrice(id: string, multiplier = 1): number {
        return Math.max(1, Math.round((this.definitions.get(id)?.price ?? 0) * multiplier));
    }

    sellPrice(id: string, multiplier = 0.5): number {
        return Math.max(1, Math.round((this.definitions.get(id)?.price ?? 0) * multiplier));
    }
}
