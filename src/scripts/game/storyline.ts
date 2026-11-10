/**
 * A guided chain of steps: the opening hour of a game, a tutorial, a main quest.
 *
 * One step is current at a time. Each has the line the HUD shows, a `done`
 * check that is asked every frame, and optional things to say when it starts
 * and ends. Checks read the game's own state ("3 plots planted", "holding
 * soup"), so a step can never be missed by doing things in an odd order.
 *
 * Pure logic: `addStoryline` in the kit connects it to the HUD and narration.
 */
export type StoryStep = {
    id: string;
    /** What the HUD shows while this step is current. */
    objective: string;
    /** A longer explanation for a journal. */
    detail?: string;
    /** True once the step is finished. Asked every frame while current. */
    done: () => boolean;
    /** A short count for the HUD, e.g. `() => '2/3'`. */
    progress?: () => string;
    /** Said when the step begins. */
    say?: string[];
    /** Said when the step is finished. */
    after?: string[];
    /** Runs once when the step is finished, e.g. to pay a reward. */
    reward?: () => void;
};

export type StoryEvent = { type: 'started' | 'completed' | 'finished'; step: StoryStep | undefined };

export class Storyline {
    readonly steps: StoryStep[];

    private index = 0;
    private announced = -1;
    private readonly listeners = new Set<(event: StoryEvent) => void>();

    constructor(steps: StoryStep[]) {
        this.steps = steps;
    }

    /** The step being worked on, `undefined` once the story is over. */
    get current(): StoryStep | undefined {
        return this.steps[this.index];
    }

    get finished(): boolean {
        return this.index >= this.steps.length;
    }

    /** Steps already finished, oldest first. */
    get completed(): StoryStep[] {
        return this.steps.slice(0, this.index);
    }

    /** The HUD line: the objective plus its progress count. */
    get summary(): string {
        const step = this.current;
        if (!step) return '';
        const progress = step.progress?.();
        return progress ? `${step.objective} (${progress})` : step.objective;
    }

    /** Check the current step and move on when it is done. Call every frame. */
    update(): void {
        const step = this.current;
        if (!step) return;
        if (this.announced !== this.index) {
            this.announced = this.index;
            this.notify({ type: 'started', step });
        }
        if (step.done()) this.complete();
    }

    /** Finish the current step now, whatever its check says. */
    complete(): void {
        const step = this.current;
        if (!step) return;
        step.reward?.();
        this.index += 1;
        this.notify({ type: 'completed', step });
        if (this.finished) this.notify({ type: 'finished', step: undefined });
    }

    /** Jump to a step by id, e.g. for a debug menu. */
    goTo(id: string): void {
        const index = this.steps.findIndex((step) => step.id === id);
        if (index >= 0) this.index = index;
    }

    /** Back to the first step, for a new game. */
    restart(): void {
        this.index = 0;
        this.announced = -1;
    }

    onEvent(listener: (event: StoryEvent) => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    toJSON(): { step: string | null } {
        return { step: this.current?.id ?? null };
    }

    /** Resume at a saved step. The step's opening lines are not said again. */
    fromJSON(data: { step?: string | null } | undefined): void {
        if (!data) return;
        const index = data.step ? this.steps.findIndex((step) => step.id === data.step) : this.steps.length;
        this.index = index >= 0 ? index : 0;
        this.announced = this.index;
    }

    private notify(event: StoryEvent): void {
        for (const listener of [...this.listeners]) listener(event);
    }
}
