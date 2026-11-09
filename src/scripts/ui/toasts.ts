import * as CONSTANTS from '../Constants/Constants';
import { div } from '../helpers/dom';

/**
 * Short lived messages at the top of the screen.
 *
 * Toasts are for facts the player only needs for a moment: "checkpoint
 * reached", "you need a key", "+12 wood". Anything that stays true belongs in
 * an objective line, not here.
 */
export type ToastOptions = {
    /** Seconds on screen. Defaults to `FEEL.TOAST_DURATION`. */
    duration?: number;
    /** Text colour, e.g. the player's heal green. */
    color?: string;
};

export class Toasts {
    readonly root: HTMLElement;
    /** Oldest toasts are dropped first when this many are on screen. */
    maxVisible = 4;

    private readonly timers = new Set<number>();

    constructor(parent: HTMLElement) {
        this.root = div('toast-stack click-through', undefined, parent);
    }

    /** Show a message. */
    push(message: string, options: ToastOptions = {}): HTMLElement {
        const element = div('toast', message, this.root);
        if (options.color) element.style.color = options.color;

        const duration = options.duration ?? CONSTANTS.FEEL.TOAST_DURATION;
        const timer = window.setTimeout(() => {
            this.timers.delete(timer);
            element.style.transition = 'opacity 200ms ease, transform 200ms ease';
            element.style.opacity = '0';
            element.style.transform = 'translateY(-6px)';
            window.setTimeout(() => element.remove(), 240);
        }, duration * 1000);
        this.timers.add(timer);

        while (this.root.children.length > this.maxVisible) this.root.firstElementChild?.remove();
        return element;
    }

    /** Remove every toast and cancel their timers. */
    clear(): void {
        for (const timer of this.timers) window.clearTimeout(timer);
        this.timers.clear();
        this.root.replaceChildren();
    }

    dispose(): void {
        this.clear();
        this.root.remove();
    }
}
