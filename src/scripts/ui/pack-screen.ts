import { button, clearChildren, div, setText, setVisible } from '../helpers/dom';
import type { Inventory } from '../game/inventory';

/**
 * A carry-everything screen in the Minecraft manner: stats on top, then one
 * grid of slots per inventory (bag, pockets, a chest).
 *
 * Drag a stack onto another grid to move it, within a grid to reorder it, and
 * out of the window to drop it. Click a stack for a small menu of what can be
 * done with it. Empty slots are drawn, so how much room is left is plain.
 */
export type PackSection = {
    id: string;
    label: string;
    inventory: Inventory;
    /** Slots per row. Defaults to 8. */
    columns?: number;
};

export type PackStat = { icon?: string; label: string; value: string };

export type PackScreenOptions = {
    title: string;
    sections: PackSection[];
    /** The row of readouts above the grids: health, money, the day. */
    stats?: () => PackStat[];
    /** Called after a stack was dropped out of the window, e.g. to put it in the world. */
    onDrop?: (itemId: string, amount: number, from: Inventory) => void;
    /** Key codes that close the screen besides Escape, usually the key that opened it. */
    closeCodes?: () => string[];
    onVisibilityChange?: (open: boolean) => void;
    /** Called when something is refused, e.g. to show a toast. */
    onRefused?: (reason: string) => void;
};

type Drag = { section: PackSection; index: number; itemId: string; x: number; y: number; moving: boolean };

export class PackScreen {
    readonly root: HTMLElement;

    private readonly options: PackScreenOptions;
    private readonly card: HTMLElement;
    private readonly stats: HTMLElement;
    private readonly grids: HTMLElement;
    private readonly menu: HTMLElement;
    private readonly ghost: HTMLElement;
    private readonly onKey: (event: KeyboardEvent) => void;
    private drag: Drag | undefined;

    constructor(parent: HTMLElement, options: PackScreenOptions) {
        this.options = options;
        this.root = div('pack-wrap is-hidden', undefined, parent);
        this.card = div('pack', undefined, this.root);
        const head = div('pack-head', undefined, this.card);
        div('pack-title', options.title, head);
        button(':close:', () => this.close(), { className: 'pack-close', parent: head });
        this.stats = div('pack-stats', undefined, this.card);
        this.grids = div('pack-grids', undefined, this.card);
        div('pack-hint', 'Drag to move, onto another item to swap. Drag out of the window to drop. Click for more.', this.card);
        this.menu = div('pack-menu is-hidden', undefined, this.root);
        this.ghost = div('pack-ghost is-hidden', undefined, this.root);

        this.root.addEventListener('pointerdown', (event) => this.onDown(event));
        this.root.addEventListener('pointermove', (event) => this.onMove(event));
        this.root.addEventListener('pointerup', (event) => this.onUp(event));
        this.root.addEventListener('pointercancel', () => this.endDrag());

        // Capture phase: the keys that close the screen must not also pause or reopen it.
        this.onKey = (event) => {
            if (!this.isOpen) return;
            if (event.key !== 'Escape' && event.code !== 'Escape' && event.code !== 'Tab' && !this.options.closeCodes?.().includes(event.code)) return;
            event.preventDefault();
            // Immediate: the game's own key listener must not see the press and open the screen again.
            event.stopImmediatePropagation();
            if (!this.menu.classList.contains('is-hidden')) this.closeMenu();
            else this.close();
        };
        window.addEventListener('keydown', this.onKey, true);
    }

    get isOpen(): boolean {
        return !this.root.classList.contains('is-hidden');
    }

    open(): void {
        if (this.isOpen) return;
        this.refresh();
        setVisible(this.root, true);
        this.options.onVisibilityChange?.(true);
    }

    close(): void {
        if (!this.isOpen) return;
        this.endDrag();
        this.closeMenu();
        setVisible(this.root, false);
        this.options.onVisibilityChange?.(false);
    }

    toggle(): boolean {
        if (this.isOpen) this.close();
        else this.open();
        return this.isOpen;
    }

    /** Redraw the stats and every grid. Skipped mid-drag, so the stack in hand keeps its slot. */
    refresh(): void {
        if (this.drag?.moving) return;
        clearChildren(this.stats);
        for (const stat of this.options.stats?.() ?? []) {
            const element = div('pack-stat', undefined, this.stats);
            if (stat.icon) div('pack-stat-icon', stat.icon, element);
            div('pack-stat-value', stat.value, element);
            div('pack-stat-label', stat.label, element);
        }
        setVisible(this.stats, this.stats.childElementCount > 0);

        clearChildren(this.grids);
        for (const section of this.options.sections) {
            const block = div('pack-section', undefined, this.grids);
            div('pack-section-label', `${section.label} (${section.inventory.slots.length}/${section.inventory.capacity})`, block);
            const grid = div('pack-grid', undefined, block);
            grid.style.setProperty('--pack-columns', String(section.columns ?? 8));
            for (let index = 0; index < section.inventory.capacity; index += 1) {
                const slot = section.inventory.slots[index];
                const element = div(slot ? 'pack-slot' : 'pack-slot is-empty', undefined, grid);
                element.dataset.section = section.id;
                element.dataset.index = String(index);
                if (!slot) continue;
                element.dataset.item = slot.itemId;
                element.title = slot.definition.name;
                div('pack-slot-icon', slot.definition.icon ?? '?', element);
                if (slot.definition.badge) div('item-badge', slot.definition.badge, element);
                if (slot.amount > 1) div('pack-slot-count', String(slot.amount), element);
            }
        }
    }

    dispose(): void {
        window.removeEventListener('keydown', this.onKey, true);
        this.root.remove();
    }

    //#region Dragging

    private slotAt(target: EventTarget | null): { section: PackSection; index: number } | undefined {
        const element = (target as HTMLElement | null)?.closest<HTMLElement>('.pack-slot');
        const section = this.options.sections.find((entry) => entry.id === element?.dataset.section);
        return element && section ? { section, index: Number(element.dataset.index) } : undefined;
    }

    private onDown(event: PointerEvent): void {
        const target = event.target as HTMLElement;
        if (target.closest('.pack-menu')) return;
        this.closeMenu();
        const hit = this.slotAt(target);
        const slot = hit?.section.inventory.slots[hit.index];
        if (!hit || !slot) return;
        this.drag = { section: hit.section, index: hit.index, itemId: slot.itemId, x: event.clientX, y: event.clientY, moving: false };
        // Capture, so a stack dragged past the edge of the window still reports where it was let go.
        try {
            this.root.setPointerCapture(event.pointerId);
        } catch {
            // A pointer the browser no longer tracks cannot be captured; the drag still works inside the window.
        }
    }

    private onMove(event: PointerEvent): void {
        const drag = this.drag;
        if (!drag) return;
        if (!drag.moving && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 6) return;
        if (!drag.moving) {
            drag.moving = true;
            setText(this.ghost, drag.section.inventory.registry.resolve(drag.itemId).icon ?? '?');
            setVisible(this.ghost, true);
        }
        this.ghost.style.left = `${event.clientX}px`;
        this.ghost.style.top = `${event.clientY}px`;
    }

    private onUp(event: PointerEvent): void {
        const drag = this.drag;
        if (!drag) return;
        this.endDrag();
        if (!drag.moving) {
            this.openMenu(drag.section, drag.itemId, event.clientX, event.clientY);
            return;
        }
        const under = document.elementFromPoint(event.clientX, event.clientY);
        const hit = this.slotAt(under);
        if (hit) this.move(drag, hit.section, hit.index);
        else if (!under?.closest('.pack')) this.drop(drag.section, drag.itemId, drag.section.inventory.count(drag.itemId));
        this.refresh();
    }

    private endDrag(): void {
        this.drag = undefined;
        setVisible(this.ghost, false);
    }

    private move(drag: Drag, target: PackSection, index: number): void {
        const occupied = target.inventory.slots[index] !== undefined;
        if (target === drag.section) {
            // Onto another stack: the two trade places. Onto an empty slot: to the end of the row.
            if (occupied) drag.section.inventory.swap(drag.index, index);
            else drag.section.inventory.reorder(drag.index, index);
            return;
        }
        // Onto a stack in another grid: trade the two, which also works when both grids are full.
        if (occupied && drag.section.inventory.swapWith(drag.index, target.inventory, index)) return;
        if (drag.section.inventory.moveTo(target.inventory, drag.itemId) === 0) this.options.onRefused?.('No room there');
    }

    private drop(section: PackSection, itemId: string, amount: number): void {
        if (section.inventory.registry.resolve(itemId).keep) {
            this.options.onRefused?.('You had better keep hold of that');
            return;
        }
        if (amount > 0 && section.inventory.remove(itemId, amount)) this.options.onDrop?.(itemId, amount, section.inventory);
    }

    //#endregion Dragging

    //#region Item menu

    private openMenu(section: PackSection, itemId: string, x: number, y: number): void {
        const inventory = section.inventory;
        const definition = inventory.registry.resolve(itemId);
        clearChildren(this.menu);
        div('pack-menu-title', `${definition.icon ?? ''} ${definition.name}`.trim(), this.menu);
        if (definition.description) div('pack-menu-text', definition.description, this.menu);
        const act = (label: string, run: () => void, enabled = true): void => {
            const element = button(
                label,
                () => {
                    run();
                    this.closeMenu();
                    this.refresh();
                },
                { className: 'pack-menu-button', parent: this.menu },
            );
            element.disabled = !enabled;
        };
        if (definition.use) act(inventory.canUse(itemId) ? 'Use' : (inventory.useBlockedReason(itemId) ?? 'Use'), () => void inventory.use(itemId), inventory.canUse(itemId));
        for (const other of this.options.sections) {
            if (other === section) continue;
            act(`To ${other.label.toLowerCase()}`, () => {
                if (inventory.moveTo(other.inventory, itemId) === 0) this.options.onRefused?.('No room there');
            });
        }
        if (!definition.keep) {
            act('Drop 1', () => this.drop(section, itemId, 1));
            if (inventory.count(itemId) > 1) act('Drop all', () => this.drop(section, itemId, inventory.count(itemId)));
        }
        setVisible(this.menu, true);
        // Keep the menu on screen: it opens beside the pointer and is pulled back in at the edges.
        const width = this.menu.offsetWidth;
        const height = this.menu.offsetHeight;
        this.menu.style.left = `${Math.max(8, Math.min(window.innerWidth - width - 8, x + 10))}px`;
        this.menu.style.top = `${Math.max(8, Math.min(window.innerHeight - height - 8, y + 10))}px`;
    }

    private closeMenu(): void {
        setVisible(this.menu, false);
    }

    //#endregion Item menu
}
