import { div, setText } from '../helpers/dom';

/**
 * A bottom bar of things the player can place, buy or select.
 *
 * Built for tower defence, but it is the same widget every building or farming
 * game needs: a row of cards with a name, a cost and a hotkey, where anything
 * unaffordable or unavailable greys out. Selection is a callback, so the game
 * decides what happens next.
 *
 *   const bar = new BuildBar(game.uiRoot);
 *   bar.setEntries(towers.map((tower, index) => ({ id: tower.id, label: tower.name, cost: tower.cost, hotkey: String(index + 1) })));
 *   bar.onSelect((id) => selectTower(id));
 *   bar.setResources('gold', 320);
 */
export type BuildBarEntry = {
    id: string;
    label: string;
    /** Shown as a price. `undefined` hides the cost. */
    cost?: number;
    /** Single key that selects this entry. */
    hotkey?: string;
    /** One line under the label. */
    description?: string;
    /** Extra info on the right, e.g. 'damage 20'. */
    detail?: string;
    /** Force the disabled look even when the player can afford it. */
    disabled?: boolean;
    /** Emoji or short text shown as an icon. */
    icon?: string;
    /** Colour accent, e.g. the tower's own colour. */
    accent?: string;
};

export type BuildBarOptions = {
    /** Title above the bar, e.g. 'Build a tower'. */
    label?: string;
    /** Show the hotkey hint. Defaults to true. */
    showHotkeys?: boolean;
    /** Turn hotkeys off entirely, e.g. while a dialog is open. */
    hotkeysEnabled?: boolean;
    /** Hotkeys only count while this returns true, e.g. not in a menu or a shop. */
    isActive?: () => boolean;
};

type Row = {
    entry: BuildBarEntry;
    element: HTMLElement;
    costElement: HTMLElement | undefined;
    affordable: boolean;
};

export class BuildBar {
    readonly root: HTMLElement;

    /** True while the bar is on screen. */
    get isVisible(): boolean {
        return !this.root.classList.contains('is-hidden');
    }

    /** Id of the selected entry, `undefined` when nothing is selected. */
    get selected(): string | undefined {
        return this.selectedId;
    }

    private entries: BuildBarEntry[] = [];
    private readonly rows = new Map<string, Row>();
    private readonly list: HTMLElement;
    private readonly resources: HTMLElement;
    private selectedId: string | undefined;
    private money = Infinity;
    private readonly selectListeners = new Set<(id: string) => void>();
    private readonly options: Required<Pick<BuildBarOptions, 'showHotkeys' | 'hotkeysEnabled'>> & BuildBarOptions;
    private readonly onKey: (event: KeyboardEvent) => void;

    constructor(parent: HTMLElement, options: BuildBarOptions = {}) {
        this.options = { showHotkeys: true, hotkeysEnabled: true, ...options };

        this.root = div('build-bar is-hidden', undefined, parent);
        const header = div('build-bar-header', undefined, this.root);
        div('build-bar-label', options.label ?? 'Build', header);
        this.resources = div('build-bar-resources', '', header);
        this.list = div('build-bar-list', undefined, this.root);

        this.onKey = (event) => {
            if (!this.options.hotkeysEnabled || !this.isVisible || this.options.isActive?.() === false) return;
            const pressed = event.key.toLowerCase();
            const entry = this.entries.find((candidate) => candidate.hotkey?.toLowerCase() === pressed);
            if (entry && !this.isDisabled(entry)) {
                event.preventDefault();
                this.select(entry.id);
            }
        };
        window.addEventListener('keydown', this.onKey);
    }

    /** Replace the cards. Keeps the selection when the id still exists. */
    setEntries(entries: BuildBarEntry[]): void {
        this.entries = entries;
        this.rows.clear();
        this.list.replaceChildren();

        for (const entry of entries) {
            const card = div('build-card', undefined, this.list);
            card.dataset.id = entry.id;
            if (entry.accent) card.style.setProperty('--build-accent', entry.accent);

            const top = div('build-card-top', undefined, card);
            if (entry.icon) div('build-card-icon', entry.icon, top);
            div('build-card-name', entry.label, top);
            if (entry.hotkey && this.options.showHotkeys) div('build-card-hotkey', entry.hotkey, top);

            if (entry.description) div('build-card-description', entry.description, card);
            if (entry.detail) div('build-card-detail', entry.detail, card);

            let costElement: HTMLElement | undefined;
            if (entry.cost !== undefined) {
                costElement = div('build-card-cost', String(entry.cost), card);
                this.rows.set(entry.id, { entry, element: card, costElement, affordable: true });
            } else {
                this.rows.set(entry.id, { entry, element: card, costElement: undefined, affordable: true });
            }

            card.addEventListener('click', () => {
                if (this.isDisabled(entry)) return;
                this.select(entry.id);
            });
        }
        this.refresh();
    }

    /** Called when a card is clicked or its hotkey pressed. */
    onSelect(listener: (id: string) => void): () => void {
        this.selectListeners.add(listener);
        return () => this.selectListeners.delete(listener);
    }

    /** Highlight a card, or clear the highlight with `undefined`. */
    setSelected(id: string | undefined): void {
        this.selectedId = id;
        this.refresh();
    }

    /** How much of a resource the player has; anything unaffordable greys out. */
    setMoney(amount: number): void {
        this.money = amount;
        this.refresh();
    }

    /** Text on the right of the header, e.g. 'gold 320  lives 12'. */
    setResources(_name: string, value: string | number, extra?: string): void {
        setText(this.resources, extra === undefined ? `${_name} ${value}` : `${_name} ${value}   ${extra}`);
    }

    /** Add a line of text to the tooltip-free header area. */
    setHint(text: string): void {
        setText(this.resources, text);
    }

    show(): void {
        this.root.classList.remove('is-hidden');
    }

    hide(): void {
        this.root.classList.add('is-hidden');
    }

    setHotkeysEnabled(enabled: boolean): void {
        this.options.hotkeysEnabled = enabled;
    }

    dispose(): void {
        window.removeEventListener('keydown', this.onKey);
        this.selectListeners.clear();
        this.root.remove();
    }

    //#region Internals

    private select(id: string): void {
        this.selectedId = id;
        this.refresh();
        for (const listener of [...this.selectListeners]) listener(id);
    }

    private isDisabled(entry: BuildBarEntry): boolean {
        if (entry.disabled) return true;
        return entry.cost !== undefined && entry.cost > this.money;
    }

    /** Repaint affordability and selection. */
    private refresh(): void {
        for (const [id, row] of this.rows) {
            const disabled = this.isDisabled(row.entry);
            row.element.classList.toggle('is-disabled', disabled);
            row.element.classList.toggle('is-selected', id === this.selectedId);
            if (row.costElement) {
                const affordable = row.entry.cost === undefined || row.entry.cost <= this.money;
                row.costElement.classList.toggle('is-too-expensive', !affordable);
            }
        }
    }

    //#endregion Internals
}
