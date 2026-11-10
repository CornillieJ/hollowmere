import { SYSTEM_ORDER } from '../core/systems';
import { ListPanel, type PanelRow, type PanelTab } from '../ui/list-panel';
import type { ScreenName } from '../ui/screens';

//#region Panel

/**
 * A modal list panel with everything around it handled: its layer, the game
 * clock, the open key and a live refresh while it is up.
 *
 * `addCraftingStation`, `addUpgrades` and `addJournal` are all this panel with
 * different rows. Use it directly for anything else that is a list:
 *
 * ```ts
 * const help = addPanel(game, {
 *     title: 'Field notes',
 *     key: 'journal',
 *     keys: ['KeyJ'],
 *     tabs: [{ id: 'tips', label: 'Tips', rows: () => TIPS.map((tip) => ({ icon: '✎', title: tip })) }],
 * });
 * ```
 */
export type AddPanelOptions = {
    title: string;
    tabs?: PanelTab[];
    /** Shorthand for a single tab. */
    rows?: () => PanelRow[];
    empty?: string;
    footer?: () => string;
    /** Where the panel mounts. Defaults to `'modal'`. */
    screen?: ScreenName;
    /** Input action that opens and closes the panel. */
    key?: string;
    /** Key codes bound to that action, e.g. `['KeyJ']`. */
    keys?: string[];
    /** Pause the game clock while open. Defaults to true. */
    pauseWhileOpen?: boolean;
    /** Seconds between refreshes while open, for timers and progress bars. Defaults to 0.25. */
    refreshEvery?: number;
    onOpen?: () => void;
    onClose?: () => void;
};

export type PanelHandle = {
    readonly panel: ListPanel;
    readonly isOpen: boolean;
    open: (tabId?: string) => void;
    close: () => void;
    toggle: () => boolean;
    refresh: () => void;
    dispose: () => void;
};

export function addPanel(game: Game, options: AddPanelOptions): PanelHandle {
    const screenName = options.screen ?? 'modal';
    const tabs = options.tabs ?? [{ id: 'main', label: options.title, rows: options.rows ?? (() => []), ...(options.empty !== undefined ? { empty: options.empty } : {}) }];
    const panel: ListPanel = new ListPanel(game.screens.layer(screenName), {
        title: options.title,
        tabs,
        ...(options.footer ? { footer: options.footer } : {}),
        onVisibilityChange: (open) => {
            if (open) game.screens.show(screenName, panel);
            else game.screens.hide(screenName, panel);
            if (options.pauseWhileOpen ?? true) game.time.setPaused(panel, open);
            (open ? options.onOpen : options.onClose)?.();
        },
    });

    const key = options.key;
    if (key) for (const code of options.keys ?? []) game.input.addBinding(key, code);
    let sinceRefresh = 0;
    let last = performance.now();
    const removeSystem = game.systems.add({
        name: `panel-${options.title}`,
        order: SYSTEM_ORDER.INPUT + 1,
        // Runs while the panel has the clock paused, or it could never close or tick.
        always: true,
        update: () => {
            // Real time: the game clock may be stopped by this very panel.
            const now = performance.now();
            const elapsed = (now - last) / 1000;
            last = now;
            if (key) {
                const pressed = panel.isOpen ? game.input.wasPressedUngated(key) : game.input.wasPressed(key);
                if (pressed && (panel.isOpen || game.state.is('playing'))) panel.toggle();
            }
            if (!panel.isOpen) return;
            sinceRefresh += elapsed;
            if (sinceRefresh < (options.refreshEvery ?? 0.25)) return;
            sinceRefresh = 0;
            panel.refresh();
        },
    });

    return {
        panel,
        get isOpen() {
            return panel.isOpen;
        },
        open: (tabId) => panel.open(tabId),
        close: () => panel.close(),
        toggle: () => panel.toggle(),
        refresh: () => panel.refresh(),
        dispose: () => {
            panel.close();
            removeSystem();
            panel.dispose();
        },
    };
}

export type { PanelRow, PanelTab } from '../ui/list-panel';

//#endregion Panel
