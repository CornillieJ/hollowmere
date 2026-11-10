import { div, setText, setVisible } from '../helpers/dom';

/**
 * One line of text low on the screen that never takes control away: a thought,
 * a narrator, a radio voice. Unlike the dialogue box it does not wait for a key.
 */
export class Subtitles {
    readonly root: HTMLElement;

    private readonly text: HTMLElement;

    constructor(parent: HTMLElement) {
        this.root = div('subtitles is-hidden', undefined, parent);
        this.text = div('subtitles-text', '', this.root);
    }

    show(line: string, speaker?: string): void {
        setText(this.text, speaker ? `${speaker}: ${line}` : line);
        setVisible(this.root, true);
        // Restart the fade-in for every new line.
        this.text.classList.remove('is-fresh');
        void this.text.offsetWidth;
        this.text.classList.add('is-fresh');
    }

    hide(): void {
        setVisible(this.root, false);
    }

    dispose(): void {
        this.root.remove();
    }
}
