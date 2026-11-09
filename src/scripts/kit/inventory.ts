import { Inventory, bindGame, type InventoryOptions } from '../game/inventory';
import { ItemRegistry, type ItemCost, type ItemDefinition } from '../game/items';
import { InventoryScreen, type InventoryScreenMode } from '../ui/inventory-screen';
import { SYSTEM_ORDER } from '../core/systems';
import type { ScreenName } from '../ui/screens';
import type { ResourceHandle } from './resources';

//#region Inventory

/**
 * Panels registered per layer, so two installed inventories in the same layer
 * cannot both be open. Opening one closes the other.
 */
const PANELS = new Map<HTMLElement, Set<InventoryScreen>>();

export type AddInventoryOptions = Omit<InventoryOptions, 'currency' | 'customer'> & {
    /** Item definitions, or a registry the game already built. */
    items?: ItemDefinition[];
    /**
     * Make this the hub's main inventory, i.e. `game.inventory`. Defaults to
     * true, so pickups, HUD code and templates all agree on one bag. Pass false
     * for a second, specialised one such as a shop that shares the same items.
     */
    primary?: boolean;
    /** Where the panel mounts. Defaults to `'modal'`. */
    screen?: ScreenName;
    /**
     * Input action that opens and closes the panel, e.g. `'inventory'` or
     * `'shop'`. Actions are rebindable, so this is the right knob; `keys` adds
     * extra codes on top of whatever the game already binds.
     */
    key?: string;
    /** Extra key codes bound to the open action, e.g. `['KeyB']`. */
    keys?: string[];
    /** Start open. */
    open?: boolean;
    /** Panel heading. */
    title?: string;
    mode?: InventoryScreenMode;
    /** Items listed in shop mode. Defaults to everything with a price. */
    catalogue?: string[];
    columns?: number;
    filters?: boolean;
    /** Pause the game clock while the panel is open. Defaults to true. */
    pauseWhileOpen?: boolean;
    /** Make this a shop that buys into, and sells out of, another inventory (usually the bag). */
    customer?: InventoryHandle;
    /** Pay with a resource. */
    currency?: { resource: ResourceHandle; label?: string; buyMultiplier?: number; sellMultiplier?: number };
    /** Save under this key, using the game's save store. */
    persist?: string;
    /** Show the slot count and value footer. */
    showValue?: boolean;
    /** Called when an action is refused, e.g. to show a toast. */
    onRefused?: (reason: string) => void;
};

export type InventoryHandle = {
    readonly inventory: Inventory;
    readonly screen: InventoryScreen;
    /** Add items. Returns how many did not fit. */
    add: (id: string, amount?: number) => number;
    remove: (id: string, amount?: number) => boolean;
    has: (id: string, amount?: number) => boolean;
    count: (id: string) => number;
    /** Use an item, running its `use` handler. */
    use: (id: string) => boolean;
    /** Pay a list of costs from items and currency. */
    spend: (costs: ItemCost[]) => boolean;
    canAfford: (costs: ItemCost[]) => boolean;
    /** Shop helpers. */
    buy: (id: string, amount?: number) => boolean;
    sell: (id: string, amount?: number) => boolean;
    /** Unlock ids for gated content. */
    unlock: (id: string) => void;
    isUnlocked: (itemId: string) => boolean;
    /** Progression level used by `requires.level`. */
    level: () => number;
    setLevel: (level: number) => void;
    /** Panel control. */
    open: () => void;
    close: () => void;
    toggle: () => boolean;
    readonly isOpen: boolean;
    /** Notified when the contents change, for HUD refreshes. */
    onChange: (listener: () => void) => () => void;
    /** Move a stack into another inventory. Returns how many moved. */
    moveTo: (target: InventoryHandle, id: string, amount?: number) => number;
    /** Add a "move there" button to this panel, e.g. `bag.offerTransfer('To pockets', pockets)`. */
    offerTransfer: (label: string, target: InventoryHandle) => void;
    /** Public properties. */
    readonly game: Game;
    dispose: () => void;
};

/**
 * Install an inventory: items, costs, uses, gates, a panel and a save slot.
 *
 * With `mode: 'shop'` and a `catalogue` the same install becomes a shop, which
 * is how a tower defence upgrade list and an RPG bag share one implementation.
 */
export function addInventory(game: Game, options: AddInventoryOptions = {}): InventoryHandle {
    const registry = options.registry ?? new ItemRegistry(options.items ?? []);
    if (options.items && options.registry) options.registry.defineMany(options.items);

    const currency = options.currency
        ? {
              id: options.currency.resource.id,
              get: () => options.currency?.resource.value() ?? 0,
              spend: (amount: number) => options.currency?.resource.trySpend(amount) ?? false,
              earn: (amount: number) => options.currency?.resource.add(amount),
          }
        : undefined;

    const { customer, ...inventoryOptions } = options;
    const inventory = new Inventory({
        ...inventoryOptions,
        registry,
        currency,
        ...(customer ? { customer: customer.inventory } : {}),
        onChanged: () => notify(),
        ...(options.currency?.buyMultiplier !== undefined ? { buyMultiplier: options.currency.buyMultiplier } : {}),
        ...(options.currency?.sellMultiplier !== undefined ? { sellMultiplier: options.currency.sellMultiplier } : {}),
    });
    bindGame(inventory, game);
    if (options.primary ?? true) game.inventory = inventory;

    // Declared before the handle so both the inventory options and the handle can
    // reach the same listener set.
    const listeners = new Set<() => void>();
    const notify = (): void => {
        for (const listener of [...listeners]) listener();
    };

    const layer = game.screens.layer(options.screen ?? 'modal');
    const siblings = PANELS.get(layer) ?? new Set<InventoryScreen>();
    PANELS.set(layer, siblings);

    const currencyLabel = options.currency?.label ?? options.currency?.resource.id;
    const screen = new InventoryScreen(layer, inventory, {
        ...(options.title !== undefined ? { title: options.title } : {}),
        ...(options.mode !== undefined ? { mode: options.mode } : {}),
        ...(options.catalogue !== undefined ? { catalogue: options.catalogue } : {}),
        ...(options.columns !== undefined ? { columns: options.columns } : {}),
        ...(options.filters !== undefined ? { filters: options.filters } : {}),
        ...(options.showValue !== undefined ? { showValue: options.showValue } : {}),
        ...(currencyLabel !== undefined ? { currencyLabel } : {}),
        onRefused: (reason) => {
            options.onRefused?.(reason);
            if (!options.onRefused) game.toasts.push(reason, { color: '#ff9a9a' });
        },
        onVisibilityChange: (isOpen) => {
            const screenName = options.screen ?? 'modal';
            if (isOpen) {
                // Only one panel per layer: opening this one closes its siblings.
                for (const sibling of siblings) {
                    if (sibling !== screen) sibling.close();
                }
                siblings.add(screen);
                game.screens.show(screenName, screen);
            } else {
                game.screens.hide(screenName, screen);
            }
            if (options.pauseWhileOpen ?? true) game.time.setPaused(screen, isOpen);
        },
    });

    // Open and close from anywhere, including code.
    const handle: InventoryHandle = {
        inventory,
        screen,
        game,
        add: (id, amount = 1) => inventory.add(id, amount),
        remove: (id, amount = 1) => inventory.remove(id, amount),
        has: (id, amount = 1) => inventory.has(id, amount),
        count: (id) => inventory.count(id),
        use: (id) => inventory.use(id),
        spend: (costs) => inventory.spend(costs),
        canAfford: (costs) => inventory.canAfford(costs),
        buy: (id, amount = 1) => inventory.buy(id, amount),
        sell: (id, amount = 1) => inventory.sell(id, amount),
        unlock: (id) => inventory.unlock(id),
        isUnlocked: (itemId) => inventory.isUnlocked(itemId),
        level: () => inventory.progressionLevel,
        setLevel: (level) => {
            inventory.progressionLevel = level;
        },
        open: () => screen.open(),
        close: () => screen.close(),
        toggle: () => screen.toggle(),
        get isOpen() {
            return screen.isOpen;
        },
        moveTo: (target, id, amount) => inventory.moveTo(target.inventory, id, amount),
        offerTransfer: (label, target) => screen.addTransfer(label, target.inventory),
        onChange: (listener) => {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        dispose: () => {
            if (screen.isOpen) screen.close();
            for (const remove of removers) remove();
            siblings.delete(screen);
            screen.dispose();
            listeners.clear();
        },
    };

    const removers: Array<() => void> = [];
    // The open key is an input action, so it can be rebound like anything else.
    const openKey = options.key;
    if (openKey) {
        for (const code of options.keys ?? []) game.input.addBinding(openKey, code);
        removers.push(game.systems.add({
            name: `inventory-key-${openKey}`,
            order: SYSTEM_ORDER.INPUT + 1,
            // Must run while the panel is open too, or it could never close.
            always: true,
            update: () => {
                // An open panel closes input, so the closing press has to bypass the gate.
                const pressed = screen.isOpen ? game.input.wasPressedUngated(openKey) : game.input.wasPressed(openKey);
                if (!pressed) return;
                // Leaving a panel open behind a menu would be confusing.
                if (!screen.isOpen && game.state.is('menu', 'dead', 'victory')) return;
                screen.toggle();
            },
        }));
    }

    // Item cooldowns and the clock while the panel is open.
    removers.push(game.systems.add({
        name: 'inventory-tick',
        order: SYSTEM_ORDER.GAMEPLAY - 1,
        update: (delta) => inventory.update(delta),
    }));

    if (options.persist) {
        game.save.register(options.persist, {
            save: () => inventory.toJSON(),
            load: (data) => inventory.fromJSON(data as ReturnType<Inventory['toJSON']>),
        });
    }

    screen.refresh();
    if (options.open) screen.open();
    return handle;
}

//#endregion Inventory
