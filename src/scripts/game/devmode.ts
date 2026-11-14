/**
 * Dev mode: a menu of shortcuts for trying things out, opened by typing
 * `devmode` into the code field at the bottom of the settings menu. Once
 * typed it is remembered on this machine and a "Dev tools" entry shows in the
 * pause menu. `devmode off` hides it again.
 */
export type DevAction = { label: string; run: () => void };

export type DevModeHandle = {
    readonly on: boolean;
    /** Give this to `addSettings` as its `console`. */
    code: (text: string) => string;
    open: () => void;
    /** A pause menu entry, shown only while dev mode is on. */
    readonly button: { label: string; action: () => void; visible: () => boolean };
};

const KEY = 'hollowveil-farm:devmode';
const MENU = 'dev-tools';

export function setupDevMode(game: Game, actions: DevAction[]): DevModeHandle {
    let on = false;
    try {
        on = window.localStorage.getItem(KEY) === '1';
    } catch {
        on = false;
    }
    let returnTo: string | undefined;
    const back = (): void => (returnTo ? game.menus.show(returnTo) : game.menus.hide(MENU));
    game.menus.register(MENU, {
        title: 'Dev tools',
        buttons: [
            ...actions.map((action) => ({
                label: action.label,
                action: () => {
                    action.run();
                    game.toasts.push(`Dev: ${action.label.toLowerCase()}`, { color: '#ffe14a' });
                },
            })),
            { label: 'Back', primary: true, action: back },
        ],
    });
    const open = (): void => {
        returnTo = game.menus.openMenu === MENU ? returnTo : game.menus.openMenu;
        game.menus.show(MENU);
    };
    const remember = (value: boolean): void => {
        on = value;
        try {
            window.localStorage.setItem(KEY, value ? '1' : '0');
        } catch {
            // A private window may refuse storage: it still works for this visit.
        }
    };
    return {
        get on() {
            return on;
        },
        code: (text) => {
            const code = text.toLowerCase();
            if (code === 'devmode') {
                remember(true);
                open();
                return 'Dev mode is on. "Dev tools" is in the pause menu.';
            }
            if (code === 'devmode off') {
                remember(false);
                return 'Dev mode is off.';
            }
            return code ? 'Unknown code' : '';
        },
        open,
        button: { label: 'Dev tools', action: open, visible: () => on },
    };
}
