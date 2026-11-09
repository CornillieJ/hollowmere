import { div, setVisible } from '../helpers/dom';

/**
 * The single "press E" line in the middle of the screen.
 *
 * Only one prompt is shown at a time, which is deliberate: two overlapping
 * prompts are how players end up confused about what they are aiming at.
 */
export class Prompts {
    readonly root: HTMLElement;

    private readonly keyElement: HTMLElement;
    private readonly textElement: HTMLElement;
    private hideTimer: number | undefined;

    constructor(parent: HTMLElement) {
        this.root = div('prompt click-through is-hidden', undefined, parent);
        this.keyElement = div('prompt-key', 'E', this.root);
        this.textElement = div('prompt-text', '', this.root);
    }

    /** Show a prompt with an optional key cap, e.g. `show('Pick up', 'E')`. */
    show(text: string, key?: string): void {
        if (this.hideTimer !== undefined) {
            window.clearTimeout(this.hideTimer);
            this.hideTimer = undefined;
        }
        this.textElement.textContent = text;
        this.keyElement.textContent = key ?? '';
        setVisible(this.keyElement, Boolean(key));
        setVisible(this.root, true);
    }

    /** Hide the prompt immediately. */
    hide(): void {
        setVisible(this.root, false);
    }

    /**
     * Hide the prompt after a delay, e.g. when an interaction succeeds.
     * Calling `show` before the delay is up cancels the hide.
     */
    hideAfter(seconds: number): void {
        this.hideTimer = window.setTimeout(() => {
            this.hideTimer = undefined;
            this.hide();
        }, seconds * 1000);
    }

    /** Replace the key cap without changing the text. */
    setKey(key: string | undefined): void {
        this.keyElement.textContent = key ?? '';
        setVisible(this.keyElement, Boolean(key));
    }

    /** True while a prompt is on screen. */
    get visible(): boolean {
        return !this.root.classList.contains('is-hidden');
    }

    /** Reposition the prompt, e.g. above the HUD on a very small window. */
    setVerticalPosition(percent: number): void {
        this.root.style.top = `${percent}%`;
    }

    dispose(): void {
        if (this.hideTimer !== undefined) window.clearTimeout(this.hideTimer);
        this.root.remove();
    }
}
