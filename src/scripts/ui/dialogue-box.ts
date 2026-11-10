import { button, div, setText, setVisible } from '../helpers/dom';

/**
 * The talking box along the bottom of the screen: a name, a portrait, text that
 * types itself out, and optional choices.
 *
 * `say` plays lines one by one and resolves when the player has read them. A
 * line with choices resolves with the picked value. Space, Enter or a click
 * finishes the current line first, then advances, so a fast reader is never
 * held back and a slow one never misses text.
 */
export type DialogueChoice<T = string> = { label: string; value: T };

export type DialogueLine<T = string> = {
    text: string;
    /** Overrides the speaker for this line. */
    speaker?: string | undefined;
    /** Emoji or a short glyph shown as the portrait. */
    portrait?: string | undefined;
    choices?: Array<DialogueChoice<T>>;
};

export type DialogueBoxOptions = {
    /** Characters per second. 0 shows each line at once. */
    speed?: number;
    /** Called once per typed character, e.g. for a soft voice blip. */
    onType?: (character: string) => void;
};

export class DialogueBox {
    readonly root: HTMLElement;

    private readonly portrait: HTMLElement;
    private readonly speaker: HTMLElement;
    private readonly text: HTMLElement;
    private readonly choices: HTMLElement;
    private readonly hint: HTMLElement;
    private readonly options: DialogueBoxOptions;
    private typing: { line: string; shown: number; timer: number } | undefined;
    private advance: (() => void) | undefined;
    private open = false;
    private readonly onKey: (event: KeyboardEvent) => void;
    private frame = 0;

    constructor(parent: HTMLElement, options: DialogueBoxOptions = {}) {
        this.options = options;
        this.root = div('dialogue is-hidden', undefined, parent);
        const card = div('dialogue-card', undefined, this.root);
        this.portrait = div('dialogue-portrait', '', card);
        const body = div('dialogue-body', undefined, card);
        this.speaker = div('dialogue-speaker', '', body);
        this.text = div('dialogue-text', '', body);
        this.choices = div('dialogue-choices', undefined, body);
        this.hint = div('dialogue-hint', '▼', body);
        card.addEventListener('pointerdown', (event) => {
            event.stopPropagation();
            this.next();
        });

        // Capture phase: the keys that advance the text must not also jump or interact.
        this.onKey = (event) => {
            if (!this.open) return;
            if (event.code === 'Space' || event.code === 'Enter' || event.code === 'KeyE') {
                event.preventDefault();
                event.stopPropagation();
                this.next();
            } else if (event.code === 'Escape') {
                // Escape backs out: it reads on through plain lines and takes the last choice, by convention the "no" or "goodbye".
                event.preventDefault();
                event.stopPropagation();
                const last = this.choices.lastElementChild as HTMLButtonElement | null;
                if (last) last.click();
                else this.next();
            } else if (/^Digit[1-9]$/.test(event.code)) {
                const choice = this.choices.children[Number(event.code.slice(5)) - 1] as HTMLButtonElement | undefined;
                if (choice) {
                    event.preventDefault();
                    event.stopPropagation();
                    choice.click();
                }
            }
        };
        window.addEventListener('keydown', this.onKey, true);
    }

    get isOpen(): boolean {
        return this.open;
    }

    /** Play lines and resolve with the last choice made, or `undefined` when none was asked. */
    async say<T = string>(lines: Array<DialogueLine<T>>, speaker = ''): Promise<T | undefined> {
        this.open = true;
        setVisible(this.root, true);
        let picked: T | undefined;
        for (const line of lines) {
            picked = await this.show(line, speaker);
        }
        this.close();
        return picked;
    }

    close(): void {
        this.open = false;
        this.typing = undefined;
        cancelAnimationFrame(this.frame);
        setVisible(this.root, false);
    }

    dispose(): void {
        this.close();
        window.removeEventListener('keydown', this.onKey, true);
        this.root.remove();
    }

    private show<T>(line: DialogueLine<T>, speaker: string): Promise<T | undefined> {
        setText(this.speaker, line.speaker ?? speaker);
        setText(this.portrait, line.portrait ?? '');
        this.portrait.classList.toggle('is-hidden', !line.portrait);
        this.choices.replaceChildren();
        setVisible(this.hint, false);

        return new Promise((resolve) => {
            const showChoices = (): void => {
                if (!line.choices?.length) {
                    setVisible(this.hint, true);
                    this.advance = () => resolve(undefined);
                    return;
                }
                this.advance = undefined;
                line.choices.forEach((choice, index) => {
                    button(`${index + 1}. ${choice.label}`, () => resolve(choice.value), { className: 'dialogue-choice', parent: this.choices });
                });
            };
            this.type(line.text, showChoices);
        });
    }

    /** Finish the line being typed, or move on when it is done. */
    private next(): void {
        if (this.typing) {
            this.typing.shown = this.typing.line.length;
            return;
        }
        const advance = this.advance;
        this.advance = undefined;
        advance?.();
    }

    private type(line: string, done: () => void): void {
        const speed = this.options.speed ?? 45;
        if (speed <= 0) {
            setText(this.text, line);
            done();
            return;
        }
        this.typing = { line, shown: 0, timer: performance.now() };
        const tick = (): void => {
            const typing = this.typing;
            if (!typing) return;
            const now = performance.now();
            const due = Math.floor(((now - typing.timer) / 1000) * speed);
            if (due > 0) {
                const next = Math.min(typing.line.length, typing.shown + due);
                for (let index = typing.shown; index < next; index += 1) this.options.onType?.(typing.line.charAt(index));
                typing.shown = next;
                typing.timer = now;
            }
            setText(this.text, typing.line.slice(0, typing.shown));
            if (typing.shown >= typing.line.length) {
                this.typing = undefined;
                done();
                return;
            }
            this.frame = requestAnimationFrame(tick);
        };
        tick();
    }
}
