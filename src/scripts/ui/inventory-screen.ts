import { button, div, setText, setVisible } from '../helpers/dom';
import type { Inventory, InventorySlot } from '../game/inventory';
import type { ItemCategory, ItemDefinition } from '../game/items';

/**
 * The screen for an inventory, and for a shop.
 *
 * One component serves both: `mode: 'own'` lists what the player carries and
 * offers Use, `mode: 'shop'` lists what is for sale with prices and offers Buy
 * and Sell. That is the point of putting items, costs and gates in one place: an
 * RPG bag, a tower defence upgrade list and a village shop are the same widget
 * with different options.
 */
export type InventoryScreenMode = 'own' | 'shop';

export type InventoryScreenOptions = {
    title?: string;
    mode?: InventoryScreenMode;
    /** Columns in the item grid. Defaults to 5. */
    columns?: number;
    /** Items listed in shop mode. Defaults to everything with a price. */
    catalogue?: string[];
    /** Show the category filter row. Defaults to true in shop mode. */
    filters?: boolean;
    /** Label for the currency, e.g. 'gold'. */
    currencyLabel?: string;
    /** How a price reads, e.g. `(n) => n + 'c'`. Defaults to a dollar sign. */
    formatPrice?: (amount: number) => string;
    /** Show the slot count and total value at the bottom. */
    showValue?: boolean;
    /** Called with a message when an action is refused, e.g. "Needs level 2". */
    onRefused?: (reason: string) => void;
    /** Called when the panel opens or closes. */
    onVisibilityChange?: (open: boolean) => void;
    /**
     * Key codes that close the panel, asked on every press so rebinding is
     * followed. The key that opened a panel should also close it, even when the
     * panel would otherwise use that key itself (Tab moves the selection).
     */
    closeCodes?: () => string[];
    /** Other inventories a stack can be moved into, e.g. `[{ label: 'To pockets', target: pockets }]`. */
    transfers?: Array<{ label: string; target: Inventory }>;
};

type SlotElement = {
    itemId: string;
    element: HTMLElement;
    count: HTMLElement;
    price: HTMLElement;
};

export class InventoryScreen {
    readonly root: HTMLElement;

    mode: InventoryScreenMode;

    private readonly inventory: Inventory;
    private readonly options: InventoryScreenOptions;
    private readonly titleElement: HTMLElement;
    private readonly resources: HTMLElement;
    private readonly filters: HTMLElement;
    private readonly grid: HTMLElement;
    private readonly detail: HTMLElement;
    private readonly footer: HTMLElement;
    private readonly slotElements: SlotElement[] = [];
    private readonly onKey: (event: KeyboardEvent) => void;
    private selected: string | undefined;
    private filter: ItemCategory | 'all' = 'all';

    constructor(parent: HTMLElement, inventory: Inventory, options: InventoryScreenOptions = {}) {
        this.inventory = inventory;
        this.options = options;
        this.mode = options.mode ?? 'own';

        this.root = div('inventory is-hidden', undefined, parent);
        const panel = div('inventory-panel', undefined, this.root);

        const header = div('inventory-header', undefined, panel);
        this.titleElement = div('inventory-title', options.title ?? (this.mode === 'shop' ? 'Shop' : 'Inventory'), header);
        this.resources = div('inventory-resources', '', header);

        this.filters = div('inventory-filters', undefined, panel);
        this.grid = div('inventory-grid', undefined, panel);
        if (options.columns) this.grid.style.gridTemplateColumns = `repeat(${options.columns}, 1fr)`;
        this.detail = div('inventory-detail', undefined, panel);
        this.footer = div('inventory-footer', '', panel);

        this.onKey = (event) => this.handleKey(event);
        // Capture phase, so the keys the panel handles never reach the game's keyboard.
        window.addEventListener('keydown', this.onKey, true);
        this.refresh();
    }

    /** True while the panel is on screen. */
    get isOpen(): boolean {
        return !this.root.classList.contains('is-hidden');
    }

    //#region Visibility

    open(): void {
        if (this.isOpen) return;
        this.refresh();
        setVisible(this.root, true);
        this.options.onVisibilityChange?.(true);
    }

    close(): void {
        if (!this.isOpen) return;
        setVisible(this.root, false);
        this.options.onVisibilityChange?.(false);
    }

    /** Show or hide, and report the new state. */
    toggle(): boolean {
        if (this.isOpen) {
            this.close();
            return false;
        }
        this.open();
        return true;
    }

    /** Switch between the bag and the shop without rebuilding the panel. */
    setMode(mode: InventoryScreenMode, title?: string): void {
        if (this.mode === mode && title === undefined) return;
        this.mode = mode;
        setText(this.titleElement, title ?? (mode === 'shop' ? 'Shop' : 'Inventory'));
        this.refresh();
    }

    //#endregion Visibility

    //#region Rendering

    /** Rebuild the grid and the detail pane from the inventory. */
    refresh(): void {
        const entries = this.visibleEntries();
        const ids = entries.map((entry) => entry.definition.id);
        const sameShape = ids.length === this.slotElements.length && ids.every((id, index) => this.slotElements[index]?.itemId === id);
        if (!sameShape) this.buildGrid(entries);

        for (const element of this.slotElements) {
            const definition = this.inventory.registry.resolve(element.itemId);
            const amount = this.owned(element.itemId);
            const locked = !this.inventory.isUnlocked(element.itemId);
            const isListing = this.mode === 'shop' && amount === 0;

            element.element.classList.toggle('is-selected', element.itemId === this.selected);
            element.element.classList.toggle('is-locked', locked);
            element.element.classList.toggle('is-listing', isListing);
            element.element.title = locked ? (this.inventory.lockedReason(element.itemId) ?? 'Locked') : (definition.description ?? definition.name);
            setText(element.count, amount > 0 ? `x${amount}` : '');
            setText(element.price, this.mode === 'shop' ? (isListing ? this.money(this.inventory.buyPrice(element.itemId)) : this.money(this.inventory.sellPrice(element.itemId))) : '');
        }

        this.renderFilters();
        this.renderDetail();
        this.renderFooter();
        // A plain bag has no money to show; only a panel with a currency gets a balance.
        setText(this.resources, this.inventory.hasCurrency ? `${this.options.currencyLabel ?? ''} ${this.money(this.inventory.currencyBalance())}`.trim() : '');
    }

    private buildGrid(entries: InventorySlot[]): void {
        this.grid.replaceChildren();
        this.slotElements.length = 0;

        for (const entry of entries) {
            const definition = entry.definition;
            const slot = div('inventory-slot', undefined, this.grid);
            slot.dataset.item = definition.id;
            slot.classList.add(`rarity-${definition.rarity ?? 'common'}`);
            if (definition.color) slot.style.setProperty('--slot-accent', `#${String(definition.color).replace('#', '')}`);

            div('inventory-slot-icon', definition.icon ?? definition.name.slice(0, 2), slot);
            if (definition.badge) div('item-badge', definition.badge, slot);
            const count = div('inventory-slot-count', '', slot);
            const price = div('inventory-slot-price', '', slot);

            slot.addEventListener('click', () => {
                this.selected = definition.id;
                this.refresh();
            });
            slot.addEventListener('dblclick', () => this.activate(definition.id));

            this.slotElements.push({ itemId: definition.id, element: slot, count, price });
        }
    }

    private renderFilters(): void {
        const show = this.options.filters ?? this.mode === 'shop';
        setVisible(this.filters, show);
        if (!show) return;

        const categories: Array<ItemCategory | 'all'> = ['all', ...this.inventory.registry.categories()];
        if (this.filters.childElementCount !== categories.length) {
            this.filters.replaceChildren();
            for (const category of categories) {
                const element = button(category === 'all' ? 'All' : category, () => {
                    this.filter = category;
                    this.refresh();
                }, { className: 'inventory-filter', parent: this.filters });
                element.dataset.category = category;
            }
        }
        for (const element of Array.from(this.filters.children)) {
            element.classList.toggle('is-selected', (element as HTMLElement).dataset.category === this.filter);
        }
    }

    private renderDetail(): void {
        this.detail.replaceChildren();
        const itemId = this.selected ?? this.visibleEntries()[0]?.definition.id;
        if (!itemId) {
            div('inventory-detail-empty', this.mode === 'shop' ? 'Nothing for sale' : 'Nothing carried', this.detail);
            return;
        }

        const definition = this.inventory.registry.resolve(itemId);
        const amount = this.owned(itemId);
        const locked = !this.inventory.isUnlocked(itemId);

        const heading = div('inventory-detail-heading', undefined, this.detail);
        div('inventory-detail-icon', definition.icon ?? '?', heading);
        const names = div('inventory-detail-names', undefined, heading);
        div('inventory-detail-name', definition.name, names);
        const meta = [`${definition.category ?? 'item'}`];
        if (definition.rarity && definition.rarity !== 'common') meta.push(definition.rarity);
        if (amount > 0) meta.push(`held ${amount}`);
        div('inventory-detail-meta', meta.join(' · '), names);

        if (definition.description) div('inventory-detail-text', definition.description, this.detail);
        if (definition.lore) div('inventory-detail-lore', definition.lore, this.detail);
        for (const stat of definition.stats ?? []) div('inventory-detail-stat', stat, this.detail);

        const actions = div('inventory-actions', undefined, this.detail);
        if (locked) {
            // Showing the price with a disabled button tells the player what they
            // are working towards, which a hidden button does not.
            if (this.mode === 'shop') {
                const price = this.inventory.buyPrice(itemId);
                const buy = button(`Buy ${this.money(price)}`, () => undefined, { className: 'menu-button is-primary', parent: actions });
                buy.disabled = true;
            }
            div('inventory-detail-locked', this.inventory.lockedReason(itemId) ?? 'Locked', this.detail);
            return;
        }

        if (this.mode === 'own') {
            if (definition.use) {
                const usable = this.inventory.canUse(itemId);
                const use = button(usable ? 'Use' : (this.inventory.useBlockedReason(itemId) ?? 'Use'), () => this.activate(itemId), { className: 'menu-button is-primary', parent: actions });
                use.disabled = !usable;
            }
            for (const transfer of this.options.transfers ?? []) {
                if (amount <= 0) break;
                const move = button(transfer.label, () => this.transfer(itemId, transfer.target), { className: 'menu-button', parent: actions });
                move.disabled = !transfer.target.slotOf(itemId) && transfer.target.isFull;
            }
            // A kept item (a tool, a quest item) has no drop button: losing it could end the game.
            if (amount > 0 && !definition.keep) button('Drop 1', () => this.drop(itemId), { className: 'menu-button', parent: actions });
            return;
        }

        // Something the customer carries that the shop does not stock can only be sold.
        if (this.stocks(itemId)) {
            const price = this.inventory.buyPrice(itemId);
            const buy = button(`Buy ${this.money(price)}`, () => this.buy(itemId), { className: 'menu-button is-primary', parent: actions });
            buy.disabled = this.inventory.currencyBalance() < price;
        }
        if (amount > 0 && !definition.keep) button(`Sell ${this.money(this.inventory.sellPrice(itemId))}`, () => this.sell(itemId), { className: 'menu-button', parent: actions });
    }

    private renderFooter(): void {
        if (this.options.showValue === false) {
            setText(this.footer, '');
            return;
        }
        setText(this.footer, `${this.inventory.used}/${this.inventory.capacity} slots` + (this.inventory.hasCurrency ? ` · carried value ${this.money(this.inventory.value)}` : ''));
    }

    //#endregion Rendering

    //#region Actions

    private money(amount: number): string {
        return this.options.formatPrice?.(amount) ?? `$${amount}`;
    }

    /** Offer a "move here" button for another inventory, e.g. the pockets in the bag's panel. */
    addTransfer(label: string, target: Inventory): void {
        this.options.transfers = [...(this.options.transfers ?? []), { label, target }];
        this.refresh();
    }

    private transfer(itemId: string, target: Inventory): void {
        if (this.inventory.moveTo(target, itemId) === 0) this.options.onRefused?.('No room there');
        this.refresh();
    }

    /** Use in bag mode, buy in shop mode. Used by a double click and by Enter. */
    private activate(itemId: string): void {
        if (this.mode === 'shop') {
            if (this.stocks(itemId)) this.buy(itemId);
            return;
        }
        if (this.inventory.use(itemId)) {
            this.refresh();
            return;
        }
        const reason = this.inventory.useBlockedReason(itemId);
        if (reason) this.options.onRefused?.(reason);
        this.refresh();
    }

    private buy(itemId: string): void {
        if (this.inventory.buy(itemId)) {
            this.refresh();
            return;
        }
        const reason = !this.inventory.isUnlocked(itemId) ? (this.inventory.lockedReason(itemId) ?? 'Locked') : `Needs ${this.money(this.inventory.buyPrice(itemId))}`;
        this.options.onRefused?.(reason);
        this.refresh();
    }

    private sell(itemId: string): void {
        this.inventory.sell(itemId);
        this.refresh();
    }

    private drop(itemId: string): void {
        if (this.inventory.registry.resolve(itemId).keep) return;
        this.inventory.remove(itemId, 1);
        this.refresh();
    }

    private handleKey(event: KeyboardEvent): void {
        if (!this.isOpen) return;

        // Tab closes as Escape does: in fullscreen a browser may keep Escape for itself.
        if (event.key === 'Escape' || event.code === 'Tab' || this.options.closeCodes?.().includes(event.code)) {
            event.preventDefault();
            event.stopImmediatePropagation();
            this.close();
            return;
        }

        const entries = this.visibleEntries();
        if (entries.length === 0) return;
        // Selection follows the grid, so left and right move by one and up and
        // down move by a row.
        const current = Math.max(0, entries.findIndex((entry) => entry.definition.id === this.selected));
        const columns = this.options.columns ?? 5;
        let next = current;

        if (event.key === 'ArrowRight' || event.key === 'd') next = current + 1;
        else if (event.key === 'ArrowLeft' || event.key === 'a') next = current - 1;
        else if (event.key === 'ArrowDown' || event.key === 's') next = current + columns;
        else if (event.key === 'ArrowUp' || event.key === 'w') next = current - columns;
        else if (event.key === 'Enter' || event.key === ' ') {
            if (this.selected) this.activate(this.selected);
            event.preventDefault();
            event.stopPropagation();
            return;
        } else if (event.key === 'Tab') {
            next = current + 1;
        } else {
            return;
        }

        this.selected = entries[((next % entries.length) + entries.length) % entries.length]?.definition.id;
        event.preventDefault();
        event.stopPropagation();
        this.refresh();
    }

    /** Entries on screen: carried items, or the shop catalogue after the filter. */
    private visibleEntries(): InventorySlot[] {
        const passesFilter = (definition: ItemDefinition): boolean => this.filter === 'all' || (definition.category ?? 'material') === this.filter;

        if (this.mode === 'own') {
            return this.inventory.slots.filter((slot) => !slot.definition.hidden && passesFilter(slot.definition));
        }

        const ids = this.options.catalogue ?? this.inventory.registry.sellable().map((item) => item.id);
        // After the stock: whatever the customer carries that the shop would buy.
        const carried = this.inventory.trader.slots
            .filter((slot) => !ids.includes(slot.itemId) && !slot.definition.keep && (slot.definition.price ?? 0) > 0)
            .map((slot) => slot.itemId);
        return [...ids, ...carried]
            .map((id) => ({ itemId: id, amount: 0, definition: this.inventory.registry.resolve(id) }))
            .filter((slot) => !slot.definition.hidden && passesFilter(slot.definition));
    }

    private stocks(itemId: string): boolean {
        return (this.options.catalogue ?? this.inventory.registry.sellable().map((item) => item.id)).includes(itemId);
    }

    /** How many the player has: in a shop that is the customer's bag, not the shop's shelf. */
    private owned(itemId: string): number {
        return this.mode === 'shop' ? this.inventory.trader.count(itemId) : this.inventory.count(itemId);
    }

    dispose(): void {
        window.removeEventListener('keydown', this.onKey, true);
        this.root.remove();
    }

    //#endregion Actions
}
