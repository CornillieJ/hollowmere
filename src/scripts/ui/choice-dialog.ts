import { button, div, setText, setVisible } from '../helpers/dom';

/**
 * A small modal that asks the player to choose one of a few options.
 *
 * Promotion, "which item do you want", "the village is on fire, save the barn or
 * the mill". Built on the same DOM helpers as the menus, and usable while the
 * game is running: it does not change the game state, it just calls you back.
 *
 *   const dialog = new ChoiceDialog(game.uiRoot);
 *   const choice = await dialog.ask('Promote to', [
 *       { label: 'Queen', value: 'q' },
 *       { label: 'Knight', value: 'n' },
 *   ]);
 */
export type ChoiceOption<T> = {
    label: string;
    value: T;
    /** Small text under the label. */
    description?: string;
    /** Rendered with the primary style. */
    primary?: boolean;
    /** Disabled options are visible but cannot be picked. */
    disabled?: boolean;
};

export type ChoiceDialogOptions = {
    /** Shown above the title, e.g. 'Choose one'. */
    eyebrow?: string;
    /** Allow the dialog to be dismissed with Escape. Defaults to true. */
    dismissible?: boolean;
    /** Freeze the game clock while the dialog is open. Defaults to true. */
    pauseTime?: boolean;
};

export class ChoiceDialog {
    readonly root: HTMLElement;

    /** True while a dialog is on screen. */
    get isOpen(): boolean {
        return this.current !== undefined;
    }

    private current: { resolve: (value: unknown) => void; onKey: (event: KeyboardEvent) => void } | undefined;
    private readonly options: ChoiceDialogOptions;

    /**
     * @param parent Where the dialog mounts, usually `game.uiRoot`.
     * @param game Optional hub. When given, `pauseTime` freezes the game clock
     *        while the dialog is open.
     */
    constructor(
        parent: HTMLElement,
        options: ChoiceDialogOptions = {},
        private readonly game?: Game,
    ) {
        this.options = { dismissible: true, pauseTime: true, ...options };
        this.root = div('choice-dialog is-hidden', undefined, parent);
    }

    /**
     * Show a question and resolve with the chosen value.
     * Resolves with `undefined` when it is dismissed.
     */
    ask<T>(title: string, choices: ChoiceOption<T>[], options: ChoiceDialogOptions = {}): Promise<T | undefined> {
        const settings = { ...this.options, ...options };
        if (this.current) this.close(undefined);

        this.root.replaceChildren();
        const card = div('choice-card', undefined, this.root);
        if (settings.eyebrow) div('choice-eyebrow', settings.eyebrow, card);
        div('choice-title', title, card);

        const list = div('choice-options', undefined, card);

        return new Promise<T | undefined>((resolve) => {
            const finish = (value: T | undefined): void => {
                window.removeEventListener('keydown', onKey, true);
                this.current = undefined;
                setVisible(this.root, false);
                if (settings.pauseTime) this.setTimeScale(1);
                resolve(value);
            };

            const onKey = (event: KeyboardEvent): void => {
                if (event.key === 'Escape' && settings.dismissible) {
                    event.preventDefault();
                    event.stopPropagation();
                    finish(undefined);
                    return;
                }
                // Number keys pick the matching option, which makes a keyboard only
                // flow possible for things like promotion.
                const index = Number(event.key) - 1;
                const option = choices[index];
                if (option && !option.disabled) {
                    event.preventDefault();
                    event.stopPropagation();
                    finish(option.value);
                }
            };

            for (const [index, option] of choices.entries()) {
                const element = button(`${index + 1}. ${option.label}`, () => finish(option.value), {
                    className: option.primary ? 'choice-option is-primary' : 'choice-option',
                    parent: list,
                });
                element.disabled = option.disabled === true;
                if (option.description) div('choice-description', option.description, element);
            }

            this.current = { resolve: resolve as (value: unknown) => void, onKey };
            if (settings.pauseTime) this.setTimeScale(0);
            setVisible(this.root, true);
            // Capture phase: the keys the dialog uses are stopped before the game's
            // keyboard sees them, so Escape does not also pause and 1 does not also build.
            window.addEventListener('keydown', onKey, true);
        });
    }

    /** Dismiss an open dialog, resolving it with `undefined`. */
    close(value: unknown = undefined): void {
        const current = this.current;
        if (!current) return;
        this.current = undefined;
        window.removeEventListener('keydown', current.onKey, true);
        setVisible(this.root, false);
        this.setTimeScale(1);
        current.resolve(value);
    }

    /** True when a dialog element is on screen. */
    get visible(): boolean {
        return !this.root.classList.contains('is-hidden');
    }

    dispose(): void {
        this.close(undefined);
        this.root.remove();
    }

    private setTimeScale(scale: number): void {
        // Freezing the clock keeps a choice from resolving under the player's feet.
        this.game?.time.setPaused(this, scale === 0);
    }
}

/** Replace the body text of a choice dialog that is already open, e.g. progress. */
export function setDialogTitle(dialog: ChoiceDialog, text: string): void {
    const title = dialog.root.querySelector<HTMLElement>('.choice-title');
    if (title) setText(title, text);
}
