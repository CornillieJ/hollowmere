import { MAIN_MENU, type GameFlow } from '../core/game-state';
import type { SaveEnvelope } from '../game/save';
import type { MenuButton } from '../ui/menus';

//#region Save menu

/**
 * Continue, New game and Save in one install.
 *
 * It replaces the flow's main menu with one that offers "Continue" only when a
 * save exists, asks before a new game overwrites one, and hands back a `save`
 * function and a ready-made pause menu button.
 *
 * A game that was already played in this visit cannot be reset piece by piece,
 * so starting over or loading from there reloads the page and carries on from
 * the title screen by itself. Call this last, after every `game.save.register`.
 *
 * ```ts
 * const saves = addSaveMenu(game, { flow: world.flow, slot: 'farm', title: 'Hollowmere', describe: (save) => `day ${save.data.days}` });
 * saves.save('Saved');            // e.g. when the player sleeps
 * ```
 */
export type AddSaveMenuOptions = {
    flow: GameFlow;
    slot: string;
    title: string;
    subtitle?: string;
    hint?: string;
    /** A short note for the continue button, e.g. the day reached. */
    describe?: (save: SaveEnvelope) => string;
    /** Runs when a fresh game begins, e.g. to play the intro. */
    onNewGame?: () => void;
    /** Runs after a save was loaded. */
    onContinue?: () => void;
    /** More entries for the main menu, placed after New game. */
    buttons?: MenuButton[];
    labels?: { continue?: string; newGame?: string; save?: string; overwrite?: string };
};

export type SaveMenuHandle = {
    /** Write the slot, with an optional toast. Returns false when storage refused. */
    save: (message?: string) => boolean;
    readonly hasSave: boolean;
    /** A "Save game" entry for a pause menu. */
    readonly saveButton: MenuButton;
    continueGame: () => void;
    newGame: () => void;
};

const CONFIRM_MENU = 'confirm-new-game';

export function addSaveMenu(game: Game, options: AddSaveMenuOptions): SaveMenuHandle {
    const { flow, slot } = options;
    const resumeKey = `${slot}:resume`;
    // True once this visit has changed the world, i.e. it no longer matches a fresh boot.
    let dirty = false;
    game.events.on('state:changed', () => {
        if (game.state.is('playing')) dirty = true;
    });

    const reloadInto = (mode: 'new' | 'continue'): void => {
        try {
            window.sessionStorage.setItem(resumeKey, mode);
        } catch {
            // Without session storage the reload lands on the title screen, which is still correct.
        }
        window.location.reload();
    };

    const continueGame = (): void => {
        if (dirty) return reloadInto('continue');
        if (!game.save.load(slot)) return;
        options.onContinue?.();
        flow.start();
    };

    const startFresh = (): void => {
        game.save.remove(slot);
        if (dirty) return reloadInto('new');
        options.onNewGame?.();
        flow.start();
    };

    const describe = (): string => {
        const save = game.save.peek(slot);
        const note = save ? options.describe?.(save) : undefined;
        return note ? `${options.labels?.continue ?? 'Continue'} (${note})` : (options.labels?.continue ?? 'Continue');
    };

    game.menus.register(MAIN_MENU, {
        title: options.title,
        ...(options.subtitle !== undefined ? { subtitle: options.subtitle } : {}),
        buttons: [
            { label: 'Continue', primary: true, visible: () => game.save.exists(slot), text: describe, action: continueGame },
            { label: options.labels?.newGame ?? 'New game', action: () => (game.save.exists(slot) ? game.menus.show(CONFIRM_MENU) : startFresh()) },
            ...(options.buttons ?? []),
        ],
        ...(options.hint !== undefined ? { hint: options.hint } : {}),
    });
    game.menus.register(CONFIRM_MENU, {
        title: options.labels?.overwrite ?? 'Start over?',
        subtitle: 'Your saved game will be lost.',
        buttons: [
            { label: 'Start over', action: startFresh },
            { label: 'Back', primary: true, action: () => game.menus.show(MAIN_MENU) },
        ],
    });

    const save = (message?: string): boolean => {
        const written = game.save.save(slot);
        if (message) game.toasts.push(written ? message : 'Could not save', { color: written ? '#d0c8e0' : '#ff9a9a' });
        return written;
    };

    // A reload asked for by this menu carries on by itself.
    let resume: string | null = null;
    try {
        resume = window.sessionStorage.getItem(resumeKey);
        window.sessionStorage.removeItem(resumeKey);
    } catch {
        resume = null;
    }
    if (resume === 'continue' && game.save.exists(slot)) continueGame();
    else if (resume === 'new') startFresh();

    return {
        save,
        get hasSave() {
            return game.save.exists(slot);
        },
        saveButton: { label: options.labels?.save ?? 'Save game', action: () => void save('Game saved') },
        continueGame,
        newGame: startFresh,
    };
}

//#endregion Save menu
