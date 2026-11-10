import { SYSTEM_ORDER } from '../core/systems';
import { Storyline, type StoryStep } from '../game/storyline';
import { DialogueBox } from '../ui/dialogue-box';
import { Subtitles } from '../ui/subtitles';

//#region Narration

/**
 * Lines the player reads while still playing: the character thinking aloud, a
 * narrator, a voice on the radio. Lines queue up and each stays long enough to
 * read, so a game can say three things in a row and walk away.
 *
 * `say` is for colour: it never stops play, and so it can be missed. `speak` is
 * for what must be read: it opens the dialogue box with the game held still,
 * and the player presses a key for each line.
 */
export type NarrationOptions = {
    /** Seconds per character on top of the minimum. Defaults to 0.055. */
    secondsPerCharacter?: number;
    /** Shortest time a line stays up. Defaults to 2.4. */
    minimumSeconds?: number;
    /** Called when a line appears, e.g. for a soft sound. */
    onLine?: (line: string) => void;
    /** Who is talking in the `speak` box, e.g. "You". */
    speaker?: string;
    /** Emoji shown as the portrait in the `speak` box. */
    portrait?: string;
    /** Characters per second in the `speak` box. Defaults to 45. */
    speed?: number;
};

export type NarrationHandle = {
    /** Queue one or more lines as subtitles. They pass by themselves. */
    say: (lines: string | string[], speaker?: string) => void;
    /**
     * Show lines in the dialogue box, one key press each, with the game held
     * still. It waits for any open panel to close first. Resolves once read.
     */
    speak: (lines: string | string[], options?: { speaker?: string; portrait?: string }) => Promise<void>;
    /** True while the `speak` box is up or has lines waiting. */
    readonly speaking: boolean;
    /** Drop everything queued and hide the current line. */
    clear: () => void;
    /** True while a line is up or waiting. */
    readonly busy: boolean;
    dispose: () => void;
};

export function addNarration(game: Game, options: NarrationOptions = {}): NarrationHandle {
    const subtitles = new Subtitles(game.hud.root);
    const queue: Array<{ line: string; speaker: string | undefined }> = [];
    let remaining = 0;
    let showing = false;
    let last = performance.now();

    const box = new DialogueBox(game.screens.layer('modal'), { speed: options.speed ?? 45 });
    box.root.classList.add('dialogue-self');
    const speeches: Array<{ lines: string[]; speaker: string; portrait: string | undefined; done: () => void }> = [];
    let speaking = false;

    async function deliver(speech: (typeof speeches)[number]): Promise<void> {
        speaking = true;
        game.time.pause(box);
        game.screens.show('modal', box);
        try {
            await box.say(speech.lines.map((text) => ({ text, portrait: speech.portrait })), speech.speaker);
        } finally {
            game.screens.hide('modal', box);
            game.time.resume(box);
            speaking = false;
            speech.done();
        }
    }

    const removeSystem = game.systems.add({
        name: 'narration',
        order: SYSTEM_ORDER.UI,
        // Runs while a panel has the clock stopped, so it can step aside for it.
        always: true,
        update: () => {
            // Wall-clock time, capped: a paused game or a hidden tab must not eat a line.
            const now = performance.now();
            const elapsed = Math.min(0.1, (now - last) / 1000);
            last = now;
            // A dialogue, a panel or a menu has the player's eyes: step aside and wait for it to close.
            const covered = game.screens.blocksInput || !game.state.is('playing');
            subtitles.root.style.visibility = covered ? 'hidden' : '';
            if (covered) return;
            // Something to be read comes before anything that merely passes by.
            const speech = speeches.shift();
            if (speech) return void deliver(speech);
            remaining -= elapsed;
            if (remaining > 0) return;
            const next = queue.shift();
            if (!next) {
                if (showing) subtitles.hide();
                showing = false;
                return;
            }
            showing = true;
            subtitles.show(next.line, next.speaker);
            options.onLine?.(next.line);
            remaining = Math.max(options.minimumSeconds ?? 2.4, next.line.length * (options.secondsPerCharacter ?? 0.055));
        },
    });

    return {
        say: (lines, speaker) => {
            for (const line of Array.isArray(lines) ? lines : [lines]) queue.push({ line, speaker });
        },
        speak: (lines, extra) =>
            new Promise<void>((resolve) => {
                speeches.push({ lines: Array.isArray(lines) ? lines : [lines], speaker: extra?.speaker ?? options.speaker ?? '', portrait: extra?.portrait ?? options.portrait, done: resolve });
            }),
        get speaking() {
            return speaking || speeches.length > 0;
        },
        clear: () => {
            for (const speech of speeches.splice(0)) speech.done();
            queue.length = 0;
            remaining = 0;
            showing = false;
            subtitles.hide();
        },
        get busy() {
            return showing || queue.length > 0;
        },
        dispose: () => {
            removeSystem();
            subtitles.dispose();
            box.dispose();
        },
    };
}

//#endregion Narration

//#region Storyline

/**
 * A guided chain of steps with the HUD objective and narration wired up.
 *
 * ```ts
 * const story = addStoryline(game, {
 *     narration,
 *     steps: [
 *         { id: 'plant', objective: 'Plant 3 turnips', say: ['Right. Seeds first.'], done: () => farm.plantedCount >= 3, progress: () => `${farm.plantedCount}/3` },
 *         { id: 'water', objective: 'Water them', done: () => farm.plots.filter((plot) => plot.watered).length >= 3 },
 *     ],
 * });
 * ```
 */
export type AddStorylineOptions = {
    steps: StoryStep[];
    /** Says each step's `say` and `after` lines. */
    narration?: NarrationHandle;
    /**
     * Put each step's `say` and `after` lines in the dialogue box, where they
     * have to be read, instead of in passing subtitles.
     */
    spoken?: boolean;
    /** Write the current step to the HUD objective line. Defaults to true. */
    hud?: boolean;
    /** Save key. Defaults to `'story'`. */
    persist?: string;
    onStepStarted?: (step: StoryStep) => void;
    onStepCompleted?: (step: StoryStep) => void;
    onFinished?: () => void;
};

export type StorylineHandle = {
    readonly story: Storyline;
    /** The HUD line for the current step, empty once the story is over. */
    readonly summary: string;
    readonly finished: boolean;
    dispose: () => void;
};

export function addStoryline(game: Game, options: AddStorylineOptions): StorylineHandle {
    const story = new Storyline(options.steps);
    const removers: Array<() => void> = [];

    removers.push(
        story.onEvent((event) => {
            if (event.type === 'started' && event.step) {
                if (event.step.say) void (options.spoken ? options.narration?.speak(event.step.say) : options.narration?.say(event.step.say));
                options.onStepStarted?.(event.step);
            } else if (event.type === 'completed' && event.step) {
                if (event.step.after) void (options.spoken ? options.narration?.speak(event.step.after) : options.narration?.say(event.step.after));
                options.onStepCompleted?.(event.step);
            } else if (event.type === 'finished') {
                options.onFinished?.();
            }
        }),
    );
    removers.push(
        game.systems.add({
            name: 'storyline',
            order: SYSTEM_ORDER.GAMEPLAY + 8,
            update: () => {
                if (!game.state.is('playing')) return;
                story.update();
                if (options.hud !== false && !story.finished) game.hud.setObjective(story.summary);
            },
        }),
    );
    removers.push(
        game.save.register(options.persist ?? 'story', {
            save: () => story.toJSON(),
            load: (data) => story.fromJSON(data as { step?: string | null } | undefined),
        }),
    );

    return {
        story,
        get summary() {
            return story.summary;
        },
        get finished() {
            return story.finished;
        },
        dispose: () => {
            for (const remove of removers) remove();
        },
    };
}

export type { StoryStep } from '../game/storyline';

//#endregion Storyline
