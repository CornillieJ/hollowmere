import * as THREE from 'three';

import { CanvasUi, type Widget } from './canvas-ui';

/**
 * A menu made of three.js buttons, inside the game's canvas.
 *
 * A single toggle button (a gear, a hamburger, whatever you pass) sits in a
 * corner. Pressing it opens a stack of items; pressing one closes the menu and
 * runs its action. Everything is drawn by the renderer, so there is no DOM layer
 * over the canvas, nothing to scroll, and the same code answers a mouse and a
 * finger.
 *
 * ```ts
 * const menu = addCanvasMenu(game, {
 *     items: [
 *         { label: 'Resume', onSelect: () => pause(false) },
 *         { label: 'Controls', onSelect: () => toggleControls() },
 *         { label: 'Restart', onSelect: () => restart(), danger: true },
 *     ],
 * });
 * menu.open(); menu.close(); menu.toggle();
 * ```
 */
export type CanvasMenuItem = {
    label: string;
    onSelect: () => void;
    /** Icon shown before the label. */
    icon?: string;
    /** A separate label, e.g. the key that also triggers it. */
    shortcut?: string;
    /** Rendered in the warning colour, e.g. for Quit. */
    danger?: boolean;
    /** Start disabled. */
    disabled?: boolean;
    /** Keep the menu open after the action. */
    keepOpen?: boolean;
};

export type CanvasMenuOptions = {
    items: CanvasMenuItem[];
    /** Corner the toggle button sits in. Defaults to `top-right`. */
    anchor?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
    /** Label or glyph on the toggle button. Defaults to a gear. */
    toggleLabel?: string;
    /** Title shown above the items. */
    title?: string;
    /** Item width in pixels. Defaults to 210. */
    width?: number;
    /** Start open. */
    open?: boolean;
    /** Freeze the game clock while open. Defaults to false. */
    pause?: boolean;
    /** Called whenever the menu opens or closes. */
    onChange?: (open: boolean) => void;
    /** Input action that also toggles the menu, e.g. `'pause'`. */
    key?: string;
};

export type CanvasMenuHandle = {
    readonly ui: CanvasUi;
    /** The toggle button, so a game can move or hide it. */
    readonly button: Widget;
    open: () => void;
    close: () => void;
    toggle: () => boolean;
    readonly isOpen: boolean;
    /** Rebuild the item list, e.g. after a value it displays changed. */
    refresh: (items?: CanvasMenuItem[]) => void;
    dispose: () => void;
};

export function createCanvasMenu(game: Game, options: CanvasMenuOptions): CanvasMenuHandle {
    const width = options.width ?? 210;
    const anchor = options.anchor ?? 'top-right';
    const ui = new CanvasUi(game);

    // The panel sits behind the items and blocks the game from seeing presses
    // that land on it but not on a button.
    const panelHeight = 92 + options.items.length * 58;
    const panel = ui.addPanel({
        width: width + 34,
        height: panelHeight,
        anchor,
        offset: { x: -((width + 34) / 2 + 14), y: -(panelHeight / 2 + 14) },
        ...(options.title !== undefined ? { title: options.title } : {}),
    });
    ui.setVisible(panel, false);

    const stack = ui.addStack({ anchor, direction: 'column', gap: 8, offset: { x: -((width + 34) / 2 + 14), y: -(panelHeight / 2) + 44 } });
    const itemWidgets: Widget[] = [];

    const toggleButton = ui.addButton({
        label: options.toggleLabel ?? '☰',
        width: 54,
        height: 54,
        anchor,
        fontSize: 24,
        onClick: () => handle.toggle(),
    });

    let isOpen = options.open ?? false;

    function buildItems(items: CanvasMenuItem[]): void {
        for (const widget of itemWidgets) ui.remove(widget);
        itemWidgets.length = 0;
        if (items.length !== 0) {
            panel.height = 92 + items.length * 58;
        }

        for (const item of items) {
            const widget = ui.addButton({
                label: item.label,
                ...(item.icon !== undefined ? { icon: item.icon } : {}),
                width,
                height: 50,
                fontSize: 16,
                ...(item.danger ? { color: 0x6b2730 } : {}),
                onClick: () => {
                    if (item.disabled) return;
                    item.onSelect();
                    if (!item.keepOpen) handle.close();
                },
            });
            ui.setEnabled(widget, item.disabled !== true);
            itemWidgets.push(widget);
        }

    }

    buildItems(options.items);
    setOpen(isOpen);

    function setOpen(open: boolean): void {
        isOpen = open;
        ui.setVisible(panel, open);
        for (const widget of itemWidgets) ui.setVisible(widget, open);
        // The toggle button stays where it is; its glyph shows the state.
        const label = toggleButton.object.children.find((child) => 'text' in child) as { text: string; sync?: () => void } | undefined;
        if (label) {
            label.text = open ? '✕' : (options.toggleLabel ?? '☰');
            label.sync?.();
        }
        if (options.pause) game.time.setPaused(ui, open);
        ui.layout();
        options.onChange?.(open);
    }

    const handle: CanvasMenuHandle = {
        ui,
        button: toggleButton,
        open: () => setOpen(true),
        close: () => setOpen(false),
        toggle: () => {
            setOpen(!isOpen);
            return isOpen;
        },
        get isOpen() {
            return isOpen;
        },
        refresh: (items) => {
            if (items) options.items = items;
            buildItems(options.items);
            setOpen(isOpen);
        },
        dispose: () => ui.dispose(),
    };

    // A key can also toggle it, which is how a pause menu stays reachable.
    if (options.key) {
        game.systems.add({
            name: 'canvas-menu-key',
            order: -190,
            always: true,
            update: () => {
                if (!game.input.wasPressed(options.key as string)) return;
                handle.toggle();
            },
        });
    }

    return handle;
}

/**
 * A single in-canvas button, for things like a fullscreen toggle or an
 * "open the bag" button. Returns the widget.
 */
export function addCanvasButton(
    game: Game,
    ui: CanvasUi,
    options: {
        label: string;
        onClick: () => void;
        icon?: string;
        anchor?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center';
        width?: number;
        height?: number;
        offset?: { x: number; y: number };
        primary?: boolean;
    },
): Widget {
    void game;
    return ui.addButton({
        label: options.label,
        onClick: options.onClick,
        ...(options.icon !== undefined ? { icon: options.icon } : {}),
        anchor: options.anchor ?? 'top-left',
        width: options.width ?? 120,
        height: options.height ?? 42,
        ...(options.offset !== undefined ? { offset: options.offset } : {}),
        ...(options.primary !== undefined ? { primary: options.primary } : {}),
    });
}

/** Re-export so a game only imports this module. */
export { CanvasUi, type Widget };
