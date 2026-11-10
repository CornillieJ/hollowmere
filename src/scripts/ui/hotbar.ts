import { div, setText } from '../helpers/dom';
import type { Inventory, InventorySlot } from '../game/inventory';

/**
 * The row of quick slots along the bottom of the screen: what the player has in
 * hand. It shows an inventory (usually small "pockets", next to a big bag) and
 * keeps one slot selected.
 *
 * Selection follows the item, not the position: when a stack runs out and the
 * row closes up, the highlight stays on the slot number the player chose.
 */
export type HotbarOptions = {
    /** Slots shown. Items past this stay in the inventory but are not on the bar. */
    slots?: number;
    /** Print 1, 2, 3... on the slots. */
    showKeys?: boolean;
};

export class Hotbar {
    readonly root: HTMLElement;
    selectedIndex = 0;

    private readonly inventory: Inventory;
    private readonly slots: Array<{ element: HTMLElement; icon: HTMLElement; count: HTMLElement }> = [];
    private readonly listeners = new Set<(slot: InventorySlot | undefined, index: number) => void>();

    constructor(parent: HTMLElement, inventory: Inventory, options: HotbarOptions = {}) {
        this.inventory = inventory;
        this.root = div('hotbar', undefined, parent);
        const count = options.slots ?? 8;
        for (let index = 0; index < count; index += 1) {
            const element = div('hotbar-slot', undefined, this.root);
            if (options.showKeys ?? true) div('hotbar-key', String((index + 1) % 10), element);
            const icon = div('hotbar-icon', '', element);
            const amount = div('hotbar-count', '', element);
            // A tap selects, which is how a touch screen picks a tool.
            element.addEventListener('pointerdown', (event) => {
                event.stopPropagation();
                this.select(index);
            });
            this.slots.push({ element, icon, count: amount });
        }
        this.refresh();
    }

    /** What each slot showed last, to spot a gain. */
    private readonly shown: string[] = [];
    /** False until the first draw, so nothing hops when the bar first appears. */
    private primed = false;

    /** The stack in the selected slot, `undefined` when the slot is empty. */
    get selected(): InventorySlot | undefined {
        return this.inventory.slots[this.selectedIndex];
    }

    get size(): number {
        return this.slots.length;
    }

    select(index: number): void {
        const wrapped = ((index % this.slots.length) + this.slots.length) % this.slots.length;
        if (wrapped === this.selectedIndex) return;
        this.selectedIndex = wrapped;
        this.refresh();
        for (const listener of this.listeners) listener(this.selected, wrapped);
    }

    cycle(step: number): void {
        this.select(this.selectedIndex + step);
    }

    onSelect(listener: (slot: InventorySlot | undefined, index: number) => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    /** Redraw from the inventory. Cheap: call it whenever the contents change. */
    refresh(): void {
        this.slots.forEach((slot, index) => {
            const stack = this.inventory.slots[index];
            // A slot that just gained something hops, so a pickup is seen to arrive.
            const key = stack ? `${stack.itemId}:${stack.amount}` : '';
            const before = this.shown[index] ?? '';
            const gained = stack !== undefined && key !== before && (before.split(':')[0] !== stack.itemId || Number(before.split(':')[1]) < stack.amount);
            this.shown[index] = key;
            if (gained && this.primed) {
                slot.element.classList.remove('is-bump');
                void slot.element.offsetWidth;
                slot.element.classList.add('is-bump');
            }
            setText(slot.icon, stack?.definition.icon ?? '');
            setText(slot.count, stack && stack.amount > 1 ? String(stack.amount) : '');
            slot.element.title = stack?.definition.name ?? '';
            slot.element.classList.toggle('is-selected', index === this.selectedIndex);
            slot.element.classList.toggle('is-empty', !stack);
        });
        this.primed = true;
    }

    setVisible(visible: boolean): void {
        this.root.classList.toggle('is-hidden', !visible);
    }

    dispose(): void {
        this.listeners.clear();
        this.root.remove();
    }
}
