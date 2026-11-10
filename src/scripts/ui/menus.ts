import { button, clearChildren, div, setText, setVisible } from '../helpers/dom';

/**
 * Screen based menus: main menu, pause menu, death screen, win screen.
 *
 * A menu is registered once with its buttons, then shown and hidden by id. The
 * element is reused, so showing the pause menu a hundred times allocates
 * nothing. Buttons call plain callbacks; the game state machine decides what
 * those callbacks change.
 */
export type MenuButton = {
    label: string;
    /** Run on press. Not needed for a slider. */
    action?: () => void;
    /** Rendered with the primary style, use for "Resume" or "Start". */
    primary?: boolean;
    /** Show a slider instead of a button: volume, sensitivity, brightness. */
    slider?: MenuSlider;
    /** Asked each time the menu opens; false hides the button, e.g. "Continue" without a save. */
    visible?: () => boolean;
    /** Asked each time the menu opens, e.g. "Continue (day 4)". Replaces `label`. */
    text?: () => string;
};

export type MenuSlider = {
    min: number;
    max: number;
    step?: number;
    /** Read when the menu is shown, so it always opens on the current value. */
    value: () => number;
    onChange: (value: number) => void;
    /** How the value reads next to the label, e.g. `(v) => Math.round(v * 100) + '%'`. */
    format?: (value: number) => string;
};

/** A labelled range input that calls back on every change. */
export function createSlider(parent: HTMLElement, label: string, slider: MenuSlider): HTMLElement {
    const row = div('menu-slider', undefined, parent);
    const head = div('menu-slider-head', undefined, row);
    div('menu-slider-label', label, head);
    const readout = div('menu-slider-value', '', head);
    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(slider.min);
    input.max = String(slider.max);
    input.step = String(slider.step ?? (slider.max - slider.min) / 100);
    const show = (value: number): void => setText(readout, slider.format?.(value) ?? value.toFixed(2));
    input.addEventListener('input', () => {
        const value = Number(input.value);
        show(value);
        slider.onChange(value);
    });
    // Keyboard arrows on a focused slider must not also walk the player around.
    input.addEventListener('keydown', (event) => event.stopPropagation());
    row.appendChild(input);
    const sync = (): void => {
        input.value = String(slider.value());
        show(slider.value());
    };
    sync();
    (row as HTMLElement & { sync?: () => void }).sync = sync;
    return row;
}

export type MenuConfig = {
    title: string;
    subtitle?: string;
    buttons: MenuButton[];
    /** Small text under the buttons, e.g. control hints. */
    hint?: string;
};

type Synced = HTMLElement & { syncEntry?: () => void };

export class Menus {
    readonly root: HTMLElement;

    private readonly panels = new Map<string, HTMLElement>();
    private currentId: string | undefined;
    private readonly openListeners = new Set<(id: string) => void>();
    private readonly closeListeners = new Set<(id: string) => void>();

    private readonly layer: { show: () => void; hide: () => void } | undefined;

    /**
     * @param parent Element the menus mount in.
     * @param layer The screen layer holding `parent`. It is shown while a menu is
     *        open and hidden after, so menus never depend on someone else
     *        remembering to reveal their layer.
     */
    constructor(parent: HTMLElement, layer?: { show: () => void; hide: () => void }) {
        this.root = div('menu-root', undefined, parent);
        this.layer = layer;
    }

    /** Id of the visible menu, `undefined` when none is open. */
    get openMenu(): string | undefined {
        return this.currentId;
    }

    get isOpen(): boolean {
        return this.currentId !== undefined;
    }

    /** Create a menu, or replace its content when the id already exists. */
    register(id: string, config: MenuConfig): HTMLElement {
        let panel = this.panels.get(id);
        if (!panel) {
            panel = div('menu is-hidden', undefined, this.root);
            this.panels.set(id, panel);
        }
        clearChildren(panel);
        const card = div('menu-panel', undefined, panel);
        div('menu-title', config.title, card);
        if (config.subtitle) div('menu-subtitle', config.subtitle, card);

        const actions = div('menu-actions', undefined, card);
        for (const entry of config.buttons) {
            const element = entry.slider
                ? createSlider(actions, entry.label, entry.slider)
                : button(entry.label, () => {
                      entry.action?.();
                      // A toggle changes its own label: re-read every dynamic entry after a press.
                      for (const dynamic of actions.querySelectorAll<Synced>('.menu-dynamic')) dynamic.syncEntry?.();
                  }, { className: entry.primary ? 'menu-button is-primary' : 'menu-button', parent: actions });
            if (!entry.visible && !entry.text) continue;
            element.classList.add('menu-dynamic');
            (element as Synced).syncEntry = () => {
                if (entry.visible) setVisible(element, entry.visible());
                if (entry.text) setText(element, entry.text());
            };
            (element as Synced).syncEntry?.();
        }
        if (config.hint) div('menu-hint', config.hint, card);
        return panel;
    }

    /** Update only the title of an existing menu, e.g. to show a score. */
    setTitle(id: string, title: string): void {
        const panel = this.panels.get(id);
        const titleElement = panel?.querySelector<HTMLElement>('.menu-title');
        if (titleElement) setText(titleElement, title);
    }

    /** Show a menu, hiding whatever was open before. */
    show(id: string): void {
        const panel = this.panels.get(id);
        if (!panel) {
            console.warn(`[menus] no menu registered as "${id}"`);
            return;
        }
        if (this.currentId === id) return;
        if (this.currentId) setVisible(this.panels.get(this.currentId) as HTMLElement, false);
        this.currentId = id;
        for (const row of panel.querySelectorAll<HTMLElement & { sync?: () => void }>('.menu-slider')) row.sync?.();
        for (const element of panel.querySelectorAll<Synced>('.menu-dynamic')) element.syncEntry?.();
        setVisible(panel, true);
        this.layer?.show();
        for (const listener of this.openListeners) listener(id);
    }

    /** Hide a menu by id, or hide whatever is open when no id is given. */
    hide(id?: string): void {
        if (id && this.currentId !== id) return;
        if (!this.currentId) return;
        const panel = this.panels.get(this.currentId);
        if (panel) setVisible(panel, false);
        const closed = this.currentId;
        this.currentId = undefined;
        this.layer?.hide();
        for (const listener of this.closeListeners) listener(closed);
    }

    /** Hide every menu. */
    hideAll(): void {
        for (const panel of this.panels.values()) setVisible(panel, false);
        this.currentId = undefined;
        this.layer?.hide();
    }

    /** Remove a menu and its element. */
    unregister(id: string): void {
        const panel = this.panels.get(id);
        if (!panel) return;
        if (this.currentId === id) this.currentId = undefined;
        panel.remove();
        this.panels.delete(id);
    }

    /** Rebuild a menu with fresh values, e.g. a score in the death screen. */
    refresh(id: string, config: MenuConfig): void {
        this.register(id, config);
    }

    /** Notified when a menu opens. Returns an unsubscribe function. */
    onOpen(listener: (id: string) => void): () => void {
        this.openListeners.add(listener);
        return () => this.openListeners.delete(listener);
    }

    /** Notified when a menu closes. Returns an unsubscribe function. */
    onClose(listener: (id: string) => void): () => void {
        this.closeListeners.add(listener);
        return () => this.closeListeners.delete(listener);
    }

    dispose(): void {
        this.openListeners.clear();
        this.closeListeners.clear();
        this.panels.clear();
        this.root.remove();
    }
}
