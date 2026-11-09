import { SYSTEM_ORDER } from '../core/systems';
import { button, div, setVisible } from '../helpers/dom';
import type { ScreenName } from '../ui/screens';
import { createCanvasMenu, type CanvasMenuHandle, type CanvasMenuOptions } from '../ui/canvas-menu';

//#region Menus

export type MenuItem = {
    label: string;
    /** Run when the button is pressed. */
    action?: () => void;
    /** Rendered with the primary style. */
    primary?: boolean;
    disabled?: boolean;
    /** Small text under the label. */
    hint?: string;
};

export type AddMenuOptions = {
    /** Unique id, used by save files and `closeMenu`. */
    id: string;
    title?: string;
    subtitle?: string;
    /** Static buttons, or a builder for a menu whose contents change. */
    items?: MenuItem[];
    build?: () => MenuItem[];
    /** Input action that opens it, e.g. `'pause'` or `'inventory'`. */
    key?: string;
    /** Extra key codes bound to that action. */
    keys?: string[];
    /** Screen to mount into. Defaults to `'menu'`. */
    screen?: ScreenName;
    /** Freeze the clock while it is open. Defaults to true. */
    pause?: boolean;
    /** Start open. */
    open?: boolean;
    /** Close the menu after a button is pressed. Defaults to true. */
    closeOnAction?: boolean;
    /** Called after opening or closing. */
    onVisibilityChange?: (open: boolean) => void;
};

export type MenuHandle = {
    readonly id: string;
    open: () => void;
    close: () => void;
    toggle: () => boolean;
    readonly isOpen: boolean;
    /** Redraw the buttons, e.g. after a value they display changed. */
    refresh: () => void;
    setTitle: (title: string) => void;
    /** Add one button at runtime. */
    addItem: (item: MenuItem) => void;
    dispose: () => void;
};

/**
 * A menu of buttons, mounted into a screen and optionally bound to a key.
 *
 * The default pause menu, a settings screen, a shop inset and a level select are
 * all this. Buttons are functions, so anything can happen on press, and `build`
 * lets the contents depend on the current state.
 */
export function addMenu(game: Game, options: AddMenuOptions): MenuHandle {
    const layer = game.screens.layer(options.screen ?? 'menu');
    const root = div('menu is-hidden', undefined, layer);
    root.dataset.menu = options.id;

    /** Buttons added with `addItem`, kept alongside whatever `build` returns. */
    const extraItems: MenuItem[] = [];
    let isOpen = false;

    const build = (): void => {
        root.replaceChildren();
        const panel = div('menu-panel', undefined, root);
        div('menu-title', options.title ?? options.id, panel);
        if (options.subtitle) div('menu-subtitle', options.subtitle, panel);

        const actions = div('menu-actions', undefined, panel);
        const entries = [...(options.build ? options.build() : (options.items ?? [])), ...extraItems];
        for (const item of entries) {
            const element = button(item.label, () => {
                item.action?.();
                if (options.closeOnAction ?? true) close();
            }, { className: item.primary ? 'menu-button is-primary' : 'menu-button', parent: actions });
            element.disabled = item.disabled === true;
            if (item.hint) div('menu-hint', item.hint, element);
        }
    };

    function open(): void {
        if (isOpen) return;
        build();
        isOpen = true;
        setVisible(root, true);
        game.screens.show(options.screen ?? 'menu', root);
        if (options.pause ?? true) game.time.pause(root);
        options.onVisibilityChange?.(true);
    }

    function close(): void {
        if (!isOpen) return;
        isOpen = false;
        setVisible(root, false);
        game.screens.hide(options.screen ?? 'menu', root);
        if (options.pause ?? true) game.time.resume(root);
        options.onVisibilityChange?.(false);
    }

    const handle: MenuHandle = {
        id: options.id,
        open,
        close,
        toggle: () => {
            if (isOpen) {
                close();
                return false;
            }
            open();
            return true;
        },
        get isOpen() {
            return isOpen;
        },
        refresh: () => {
            if (isOpen) build();
        },
        setTitle: (title) => {
            options.title = title;
            handle.refresh();
        },
        addItem: (item) => {
            extraItems.push(item);
            handle.refresh();
        },
        dispose: () => {
            close();
            removeKey?.();
            registry.delete(options.id);
            root.remove();
        },
    };

    const registry = MENUS.get(game) ?? new Map<string, MenuHandle>();
    MENUS.set(game, registry);
    registry.set(options.id, handle);

    const key = options.key;
    let removeKey: (() => void) | undefined;
    if (key) {
        for (const code of options.keys ?? []) game.input.addBinding(key, code);
        removeKey = game.systems.add({
            name: `menu-key-${options.id}`,
            order: SYSTEM_ORDER.INPUT + 1,
            always: true,
            update: () => {
                // An open menu closes input, so the closing press has to bypass the gate.
                if (isOpen ? game.input.wasPressedUngated(key) : game.input.wasPressed(key)) handle.toggle();
            },
        });
    }

    if (options.open) open();
    return handle;
}

/** The menus installed with `addMenu` on this game, keyed by id. */
const MENUS = new WeakMap<Game, Map<string, MenuHandle>>();

/** Close a menu that was installed with `addMenu`. */
export function closeMenu(game: Game, id: string): void {
    MENUS.get(game)?.get(id)?.close();
}

/** Open a menu that was installed with `addMenu`. */
export function openMenu(game: Game, id: string): void {
    MENUS.get(game)?.get(id)?.open();
}

/** Every menu installed on this game, for a settings screen or a debug panel. */
export function menusOf(game: Game): MenuHandle[] {
    return [...(MENUS.get(game)?.values() ?? [])];
}

/**
 * A menu of three.js buttons drawn inside the canvas.
 *
 * Nothing is added to the DOM: the buttons are meshes on an overlay scene the
 * renderer draws after the game, and hit testing is a bounds test in overlay
 * space, so a mouse and a finger behave the same.
 */
export function addCanvasMenu(game: Game, options: CanvasMenuOptions): CanvasMenuHandle {
    return createCanvasMenu(game, options);
}

//#endregion Menus
