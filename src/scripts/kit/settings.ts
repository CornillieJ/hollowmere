import type { Bus } from '../audio/audio';
import type { MenuButton } from '../ui/menus';

//#region Settings

/**
 * A settings menu that remembers its values on this machine.
 *
 * Each setting is a slider or a toggle with an `apply` that pushes the value
 * into the game. Values are applied once at install and again on every change.
 * `volume` adds the usual sound sliders without writing them out.
 *
 * ```ts
 * const settings = addSettings(game, {
 *     namespace: 'hollowmere',
 *     volume: ['master', 'ambient'],
 *     settings: [
 *         { id: 'look', label: 'Mouse sensitivity', kind: 'slider', min: 0.2, max: 2, step: 0.05, default: 1, percent: true, apply: (value) => (controls.look.sensitivity = 0.0012 * value) },
 *         { id: 'vhs', label: 'VHS filter', kind: 'toggle', default: true, apply: (on) => look.setVhs(on) },
 *     ],
 * });
 * // In a pause menu: settings.button
 * ```
 */
export type SliderSetting = {
    id: string;
    label: string;
    kind: 'slider';
    min: number;
    max: number;
    step?: number;
    default: number;
    /** Show the value as a percentage. */
    percent?: boolean;
    format?: (value: number) => string;
    apply: (value: number) => void;
};

export type ToggleSetting = {
    id: string;
    label: string;
    kind: 'toggle';
    default: boolean;
    apply: (value: boolean) => void;
};

export type Setting = SliderSetting | ToggleSetting;

export type AddSettingsOptions = {
    /** Storage key prefix, so two games on one origin keep separate settings. */
    namespace: string;
    settings: Setting[];
    /** Sound sliders to add: `'master'` and any bus. */
    volume?: Array<Bus | 'master'>;
    title?: string;
    /** Menu id. Defaults to `'settings'`. */
    id?: string;
};

export type SettingsHandle = {
    get: (id: string) => number | boolean | undefined;
    set: (id: string, value: number | boolean) => void;
    /** Show the settings menu; "Back" returns to whichever menu was open. */
    open: () => void;
    /** A "Settings" entry for a main or pause menu. */
    readonly button: MenuButton;
};

const VOLUME_LABELS: Record<string, string> = { master: 'Volume', music: 'Music', sfx: 'Effects', ambient: 'Ambience', ui: 'Interface' };

export function addSettings(game: Game, options: AddSettingsOptions): SettingsHandle {
    const menuId = options.id ?? 'settings';
    const storageKey = `${options.namespace}:settings`;
    const volume: Setting[] = (options.volume ?? []).map((bus) => ({
        id: `volume-${bus}`,
        label: VOLUME_LABELS[bus] ?? bus,
        kind: 'slider',
        min: 0,
        max: 1,
        step: 0.05,
        default: game.audio.getVolume(bus),
        percent: true,
        apply: (value: number) => game.audio.setVolume(bus, value),
    }));
    const settings = [...options.settings, ...volume];
    const values = new Map<string, number | boolean>();

    let stored: Record<string, unknown> = {};
    try {
        stored = JSON.parse(window.localStorage.getItem(storageKey) ?? '{}') as Record<string, unknown>;
    } catch {
        stored = {};
    }
    for (const setting of settings) {
        const saved = stored[setting.id];
        values.set(setting.id, typeof saved === typeof setting.default ? (saved as number | boolean) : setting.default);
    }

    const apply = (setting: Setting): void => {
        const value = values.get(setting.id);
        if (setting.kind === 'slider') setting.apply(value as number);
        else setting.apply(value as boolean);
    };
    const set = (id: string, value: number | boolean): void => {
        const setting = settings.find((entry) => entry.id === id);
        if (!setting) return;
        values.set(id, value);
        apply(setting);
        try {
            window.localStorage.setItem(storageKey, JSON.stringify(Object.fromEntries(values)));
        } catch {
            // Private windows may refuse storage; the setting still applies for this visit.
        }
    };
    for (const setting of settings) apply(setting);

    let returnTo: string | undefined;
    const buttons: MenuButton[] = settings.map((setting) =>
        setting.kind === 'slider'
            ? {
                  label: setting.label,
                  slider: {
                      min: setting.min,
                      max: setting.max,
                      ...(setting.step !== undefined ? { step: setting.step } : {}),
                      value: () => values.get(setting.id) as number,
                      onChange: (value: number) => set(setting.id, value),
                      format: setting.format ?? (setting.percent ? (value: number) => `${Math.round(value * 100)}%` : (value: number) => value.toFixed(2)),
                  },
              }
            : {
                  label: setting.label,
                  text: () => `${setting.label}: ${values.get(setting.id) ? 'on' : 'off'}`,
                  action: () => set(setting.id, !values.get(setting.id)),
              },
    );
    buttons.push({ label: 'Back', primary: true, action: () => (returnTo ? game.menus.show(returnTo) : game.menus.hide(menuId)) });
    game.menus.register(menuId, { title: options.title ?? 'Settings', buttons });

    const open = (): void => {
        returnTo = game.menus.openMenu;
        game.menus.show(menuId);
    };

    return { get: (id) => values.get(id), set, open, button: { label: options.title ?? 'Settings', action: open } };
}

//#endregion Settings
