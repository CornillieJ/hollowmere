import { SYSTEM_ORDER } from '../core/systems';
import { PackScreen, type PackStat } from '../ui/pack-screen';
import type { ScreenName } from '../ui/screens';
import type { InventoryHandle } from './inventory';

//#region Pack

/**
 * One screen for everything carried: stats on top, a grid per inventory below,
 * drag and drop between them, drag out of the window to drop, click for a menu.
 *
 * ```ts
 * const pack = addPack(game, {
 *     title: 'Backpack',
 *     key: 'inventory',
 *     keys: ['Tab'],
 *     sections: [{ label: 'Backpack', inventory: bag }, { label: 'Pockets', inventory: pockets }],
 *     stats: () => [{ icon: '❤', label: 'Health', value: '75/100' }],
 *     onDrop: (itemId, amount) => world.pickups.spawn({ position: inFront(), itemId, amount, collect: 'interact' }),
 * });
 * ```
 *
 * A chest is the same screen with one more section; make a second pack for it
 * and open that from the chest's interaction.
 */
export type AddPackOptions = {
    title: string;
    sections: Array<{ label: string; inventory: InventoryHandle; columns?: number }>;
    stats?: () => PackStat[];
    /** Called after a stack was dropped out of the window. Without it a dropped stack is simply gone. */
    onDrop?: (itemId: string, amount: number) => void;
    /** Where the screen mounts. Defaults to `'modal'`. */
    screen?: ScreenName;
    /** Input action that opens and closes it. The same key closes it again. */
    key?: string;
    /** Key codes bound to that action, e.g. `['Tab']`. */
    keys?: string[];
    /** Pause the game clock while open. Defaults to true. */
    pauseWhileOpen?: boolean;
};

export type PackHandle = {
    readonly screen: PackScreen;
    readonly isOpen: boolean;
    open: () => void;
    close: () => void;
    toggle: () => boolean;
    dispose: () => void;
};

export function addPack(game: Game, options: AddPackOptions): PackHandle {
    const screenName = options.screen ?? 'modal';
    const key = options.key;
    if (key) for (const code of options.keys ?? []) game.input.addBinding(key, code);

    const screen: PackScreen = new PackScreen(game.screens.layer(screenName), {
        title: options.title,
        sections: options.sections.map((section, index) => ({ id: `section-${index}`, label: section.label, inventory: section.inventory.inventory, ...(section.columns !== undefined ? { columns: section.columns } : {}) })),
        ...(options.stats ? { stats: options.stats } : {}),
        ...(options.onDrop ? { onDrop: options.onDrop } : {}),
        ...(key ? { closeCodes: () => game.input.codesFor(key) } : {}),
        onRefused: (reason) => game.toasts.push(reason, { color: '#ff9a9a' }),
        onVisibilityChange: (open) => {
            if (open) game.screens.show(screenName, screen);
            else game.screens.hide(screenName, screen);
            if (options.pauseWhileOpen ?? true) game.time.setPaused(screen, open);
            if (!open) justClosed = true;
        },
    });
    // The press that closed the screen may still read as "just pressed" on the next frame; it must not open it again.
    let justClosed = false;

    const removers = options.sections.map((section) => section.inventory.onChange(() => screen.isOpen && screen.refresh()));
    if (key) {
        removers.push(
            game.systems.add({
                name: `pack-${options.title}`,
                order: SYSTEM_ORDER.INPUT + 1,
                // Opening only: the screen closes itself on the key event, so a press never closes and reopens it.
                update: () => {
                    if (justClosed) {
                        justClosed = false;
                        return;
                    }
                    if (!screen.isOpen && game.state.is('playing') && game.input.wasPressed(key)) screen.open();
                },
            }),
        );
    }

    return {
        screen,
        get isOpen() {
            return screen.isOpen;
        },
        open: () => screen.open(),
        close: () => screen.close(),
        toggle: () => screen.toggle(),
        dispose: () => {
            screen.close();
            for (const remove of removers) remove();
            screen.dispose();
        },
    };
}

export type { PackStat } from '../ui/pack-screen';

//#endregion Pack
