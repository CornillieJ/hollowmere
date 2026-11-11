import { button, clearChildren, div, setText, setVisible } from '../helpers/dom';

/**
 * A panel of rows: the shape behind a recipe list, an upgrade shop, a quest
 * journal or a help page.
 *
 * Each row has an icon, a title, some detail, an optional progress bar and an
 * optional button. Rows come from a function, so the panel always shows live
 * state; `refresh` patches the rows in place when their shape has not changed,
 * which keeps a button clickable while a progress bar next to it ticks.
 */
export type PanelRow = {
    /** Emoji or short glyph. */
    icon?: string;
    title: string;
    /** Smaller text under the title. */
    detail?: string;
    /** Right-aligned note, e.g. a price or a deadline. */
    meta?: string;
    /** 0..1 draws a progress bar under the row. */
    progress?: number;
    /** Grey the row out, e.g. a locked recipe. */
    dim?: boolean;
    /** A section heading instead of an entry. */
    heading?: boolean;
    action?: { label: string; enabled?: boolean; onPress: () => void };
};

export type PanelTab = {
    id: string;
    label: string;
    rows: () => PanelRow[];
    /** Shown when the tab has no rows. */
    empty?: string;
};

export type ListPanelOptions = {
    title: string;
    /** One tab shows no tab bar. */
    tabs: PanelTab[];
    /** Small text along the bottom, e.g. the player's money. */
    footer?: () => string;
    onVisibilityChange?: (open: boolean) => void;
};

type RowElements = { root: HTMLElement; icon: HTMLElement; title: HTMLElement; detail: HTMLElement; meta: HTMLElement; bar: HTMLElement; fill: HTMLElement; action: HTMLButtonElement; row: PanelRow };

export class ListPanel {
    readonly root: HTMLElement;

    private readonly options: ListPanelOptions;
    private readonly tabBar: HTMLElement;
    private readonly list: HTMLElement;
    private readonly footer: HTMLElement;
    private readonly onKey: (event: KeyboardEvent) => void;
    private rows: RowElements[] = [];
    private shape = '';
    private tabId: string;

    constructor(parent: HTMLElement, options: ListPanelOptions) {
        this.options = options;
        this.tabId = options.tabs[0]?.id ?? '';
        this.root = div('list-panel-wrap is-hidden', undefined, parent);
        const card = div('list-panel', undefined, this.root);
        const head = div('list-panel-head', undefined, card);
        div('list-panel-title', options.title, head);
        button('✕', () => this.close(), { className: 'list-panel-close', parent: head });
        this.tabBar = div('list-panel-tabs', undefined, card);
        this.list = div('list-panel-rows', undefined, card);
        this.footer = div('list-panel-footer', '', card);
        setVisible(this.tabBar, options.tabs.length > 1);
        for (const tab of options.tabs) {
            const element = button(tab.label, () => this.showTab(tab.id), { className: 'list-panel-tab', parent: this.tabBar });
            element.dataset.tab = tab.id;
        }

        // Capture phase: Escape closes the panel and must not also pause the game. Tab closes
        // it too, because in fullscreen a browser may keep Escape for itself.
        this.onKey = (event) => {
            if (!this.isOpen || (event.key !== 'Escape' && event.code !== 'Escape' && event.code !== 'Tab')) return;
            event.preventDefault();
            event.stopImmediatePropagation();
            this.close();
        };
        window.addEventListener('keydown', this.onKey, true);
    }

    get isOpen(): boolean {
        return !this.root.classList.contains('is-hidden');
    }

    get tab(): string {
        return this.tabId;
    }

    open(tabId?: string): void {
        if (tabId) this.tabId = tabId;
        this.refresh();
        if (this.isOpen) return;
        setVisible(this.root, true);
        this.options.onVisibilityChange?.(true);
    }

    close(): void {
        if (!this.isOpen) return;
        setVisible(this.root, false);
        this.options.onVisibilityChange?.(false);
    }

    toggle(): boolean {
        if (this.isOpen) this.close();
        else this.open();
        return this.isOpen;
    }

    showTab(id: string): void {
        this.tabId = id;
        this.refresh();
    }

    /** Re-read the rows. Cheap enough to call a few times a second while open. */
    refresh(): void {
        const tab = this.options.tabs.find((entry) => entry.id === this.tabId) ?? this.options.tabs[0];
        if (!tab) return;
        for (const element of this.tabBar.children) element.classList.toggle('is-active', (element as HTMLElement).dataset.tab === tab.id);
        const rows = tab.rows();
        // Same rows as last time: update texts and bars, keep the elements (and any click in flight).
        const shape = `${tab.id}|${rows.map((row) => `${row.heading ? 'h' : 'r'}:${row.title}:${row.action ? 'a' : ''}`).join('|')}`;
        if (shape !== this.shape) {
            this.shape = shape;
            clearChildren(this.list);
            this.rows = rows.map((row) => this.createRow(row));
            if (rows.length === 0) div('list-panel-empty', tab.empty ?? 'Nothing here yet.', this.list);
        }
        rows.forEach((row, index) => this.patchRow(this.rows[index] as RowElements, row));
        const footer = this.options.footer?.() ?? '';
        setText(this.footer, footer);
        setVisible(this.footer, footer !== '');
    }

    dispose(): void {
        window.removeEventListener('keydown', this.onKey, true);
        this.root.remove();
    }

    private createRow(row: PanelRow): RowElements {
        const root = div(row.heading ? 'list-panel-heading' : 'list-panel-row', undefined, this.list);
        const icon = div('list-panel-icon', '', root);
        const body = div('list-panel-body', undefined, root);
        const title = div('list-panel-row-title', '', body);
        const detail = div('list-panel-detail', '', body);
        const bar = div('list-panel-bar', undefined, body);
        const fill = div('list-panel-fill', undefined, bar);
        const meta = div('list-panel-meta', '', root);
        const elements: RowElements = { root, icon, title, detail, meta, bar, fill, action: undefined as unknown as HTMLButtonElement, row };
        // The handler reads the latest row, so a patched row never fires a stale action.
        elements.action = button('', () => elements.row.action?.onPress(), { className: 'list-panel-action', parent: root });
        elements.action.addEventListener('click', () => this.refresh());
        return elements;
    }

    private patchRow(elements: RowElements, row: PanelRow): void {
        elements.row = row;
        elements.root.classList.toggle('is-dim', row.dim === true);
        setText(elements.icon, row.icon ?? '');
        setVisible(elements.icon, row.icon !== undefined);
        setText(elements.title, row.title);
        setText(elements.detail, row.detail ?? '');
        setVisible(elements.detail, Boolean(row.detail));
        setText(elements.meta, row.meta ?? '');
        setVisible(elements.meta, Boolean(row.meta));
        setVisible(elements.bar, row.progress !== undefined);
        elements.fill.style.width = `${Math.round(Math.max(0, Math.min(1, row.progress ?? 0)) * 100)}%`;
        setVisible(elements.action, row.action !== undefined);
        if (row.action) {
            setText(elements.action, row.action.label);
            elements.action.disabled = row.action.enabled === false;
        }
    }
}
