import { div } from '../helpers/dom';

/**
 * An ending, told.
 *
 * The screen closes over the valley and the last of the story is read a card
 * at a time: a small picture, a few lines, a key or a tap for the next. The
 * final card adds up what the farmer did here. The game is held still
 * underneath until the last button is pressed.
 */
export type EndingSlide = {
    /** The picture: one or two glyphs, drawn large and coarse. */
    picture: string;
    text: string;
};

export type EndingOptions = {
    /** `wake` closes to white, `stay` to the colour of the Veil. */
    kind: 'wake' | 'stay';
    title: string;
    slides: EndingSlide[];
    /** Lines for the last card, e.g. days lived and requests filled. */
    tally: Array<{ label: string; value: string }>;
    /** What the button on the last card says. */
    button: string;
};

export type EndingHandle = {
    /** True while an ending is on the screen. */
    readonly playing: boolean;
    /** Show an ending. Resolves when the last button is pressed. */
    play: (options: EndingOptions) => Promise<void>;
    /** For tests: go to the next card, or press the last button. */
    next: () => void;
};

export function setupEnding(game: Game): EndingHandle {
    const root = div('ending is-hidden');
    game.screens.layer('overlay').appendChild(root);
    const card = div('ending-card', undefined, root);
    const picture = div('ending-picture', '', card);
    const title = div('ending-title', '', card);
    const text = div('ending-text', '', card);
    const tally = div('ending-tally', undefined, card);
    const hint = div('ending-hint', '', card);
    const button = document.createElement('button');
    button.className = 'menu-button is-primary ending-button';
    card.appendChild(button);

    let advance: (() => void) | undefined;
    const press = (): void => advance?.();
    root.addEventListener('pointerdown', (event) => {
        if (event.target !== button) press();
    });
    button.addEventListener('click', (event) => {
        event.stopPropagation();
        press();
    });
    // Capture phase: nothing typed during an ending reaches the game underneath.
    window.addEventListener(
        'keydown',
        (event) => {
            if (!advance) return;
            event.stopPropagation();
            event.preventDefault();
            if (event.code === 'Space' || event.code === 'Enter' || event.code === 'KeyE') press();
        },
        true,
    );

    const play = (options: EndingOptions): Promise<void> =>
        new Promise((resolve) => {
            game.time.setPaused(root, true);
            game.screens.show('overlay', root);
            root.classList.remove('is-hidden', 'is-wake', 'is-stay', 'is-open');
            root.classList.add(`is-${options.kind}`);
            // The next frame, so the closing-over is a transition and not a cut.
            requestAnimationFrame(() => root.classList.add('is-open'));
            let index = -1;
            const show = (): void => {
                index += 1;
                const slide = options.slides[index];
                card.classList.remove('is-in');
                void card.offsetWidth;
                card.classList.add('is-in');
                if (slide) {
                    picture.textContent = slide.picture;
                    title.textContent = index === 0 ? options.title : '';
                    text.textContent = slide.text;
                    tally.replaceChildren();
                    hint.textContent = game.device.touch ? 'tap' : 'space';
                    button.classList.add('is-hidden');
                    return;
                }
                if (index === options.slides.length) {
                    picture.textContent = options.kind === 'wake' ? ':sprout:' : ':fog:';
                    title.textContent = options.title;
                    text.textContent = '';
                    tally.replaceChildren();
                    for (const line of options.tally) {
                        const row = div('ending-tally-row', undefined, tally);
                        div('ending-tally-label', line.label, row);
                        div('ending-tally-value', line.value, row);
                    }
                    hint.textContent = '';
                    button.textContent = options.button;
                    button.classList.remove('is-hidden');
                    return;
                }
                advance = undefined;
                root.classList.remove('is-open');
                root.classList.add('is-hidden');
                game.screens.hide('overlay', root);
                game.time.setPaused(root, false);
                resolve();
            };
            advance = show;
            show();
        });

    return {
        get playing() {
            return advance !== undefined;
        },
        play,
        next: press,
    };
}


