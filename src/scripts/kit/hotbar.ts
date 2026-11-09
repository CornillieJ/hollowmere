import { SYSTEM_ORDER } from '../core/systems';
import { Hotbar } from '../ui/hotbar';
import type { InventorySlot } from '../game/inventory';
import type { InventoryHandle } from './inventory';

//#region Hotbar

export type AddHotbarOptions = {
    /** The inventory shown on the bar, usually small pockets next to a bigger bag. */
    inventory: InventoryHandle;
    /** Number of slots. Defaults to the inventory's capacity, at most 10. */
    slots?: number;
    /** Number keys 1..9, 0 pick a slot. Defaults to true. */
    numberKeys?: boolean;
    /** The mouse wheel cycles slots. Defaults to true. */
    wheel?: boolean;
    /**
     * Input action that uses what is in hand. Items with a `use` handler are used
     * through the inventory; anything else goes to `onUse`, which is where tools
     * such as a hoe or a watering can do their work.
     */
    useAction?: string;
    onUse?: (slot: InventorySlot, game: Game) => void;
    onSelect?: (slot: InventorySlot | undefined, index: number) => void;
};

export type HotbarHandle = {
    readonly bar: Hotbar;
    /** The stack in hand. */
    readonly selected: InventorySlot | undefined;
    /** Item id in hand, handy for "is the player holding the watering can". */
    readonly selectedId: string | undefined;
    select: (index: number) => void;
    show: () => void;
    hide: () => void;
    dispose: () => void;
};

/** A bottom row of quick slots bound to an inventory, with keys, wheel, tap and a use action. */
export function addHotbar(game: Game, options: AddHotbarOptions): HotbarHandle {
    const inventory = options.inventory.inventory;
    const bar = new Hotbar(game.screens.layer('hud'), inventory, { slots: options.slots ?? Math.min(10, inventory.capacity) });
    const stopRefresh = options.inventory.onChange(() => bar.refresh());
    if (options.onSelect) bar.onSelect(options.onSelect);

    const removeSystem = game.systems.add({
        name: 'hotbar',
        order: SYSTEM_ORDER.INPUT + 2,
        update: () => {
            const input = game.input;
            if (!input.enabled) return;
            if (options.numberKeys !== false) {
                for (let index = 0; index < bar.size; index += 1) {
                    if (input.keyboard.wasPressed(`Digit${(index + 1) % 10}`)) bar.select(index);
                }
            }
            if (options.wheel !== false && input.mouse.scroll.delta !== 0) bar.cycle(Math.sign(input.mouse.scroll.delta));

            const action = options.useAction;
            const stack = bar.selected;
            if (!action || !stack || !input.wasPressed(action)) return;
            if (stack.definition.use) inventory.use(stack.itemId);
            else options.onUse?.(stack, game);
        },
    });

    return {
        bar,
        get selected() {
            return bar.selected;
        },
        get selectedId() {
            return bar.selected?.itemId;
        },
        select: (index) => bar.select(index),
        show: () => bar.setVisible(true),
        hide: () => bar.setVisible(false),
        dispose: () => {
            removeSystem();
            stopRefresh();
            bar.dispose();
        },
    };
}

//#endregion Hotbar
