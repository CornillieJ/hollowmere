import * as THREE from 'three';

/**
 * Objectives, quests and completion tracking.
 *
 * An objective is a line of text the player is working towards. The HUD shows
 * the first unfinished one through `summary`, so there is exactly one voice
 * telling the player what to do.
 */
export type ObjectiveOptions = {
    /** Optional objectives do not block `isAllComplete`. */
    optional?: boolean;
    /** Hidden objectives are tracked but never shown in `summary`. */
    hidden?: boolean;
    /** Target count for "collect 5 wood" style objectives. */
    target?: number;
};

export type Objective = {
    id: string;
    text: string;
    progress: number;
    target: number;
    completed: boolean;
    optional: boolean;
    hidden: boolean;
};

export class Objectives {
    private readonly items = new Map<string, Objective>();
    private readonly order: string[] = [];
    private readonly listeners = new Set<(objectives: Objective[]) => void>();

    constructor(private readonly onSummary: (summary: string) => void = () => undefined) {}

    /** Add an objective, or update its text when the id already exists. */
    add(id: string, text: string, options: ObjectiveOptions = {}): Objective {
        const existing = this.items.get(id);
        if (existing) {
            existing.text = text;
            existing.optional = options.optional ?? existing.optional;
            existing.hidden = options.hidden ?? existing.hidden;
            if (options.target !== undefined) existing.target = options.target;
            this.notify();
            return existing;
        }
        const objective: Objective = {
            id,
            text,
            progress: 0,
            target: options.target ?? 1,
            completed: false,
            optional: options.optional ?? false,
            hidden: options.hidden ?? false,
        };
        this.items.set(id, objective);
        this.order.push(id);
        this.notify();
        return objective;
    }

    /** Put every objective back to zero progress, e.g. when the level restarts. */
    resetProgress(): void {
        for (const objective of this.items.values()) {
            objective.progress = 0;
            objective.completed = false;
        }
        this.notify();
    }

    /** Add `amount` progress. Completes the objective when it reaches the target. */
    advance(id: string, amount = 1): void {
        const objective = this.items.get(id);
        if (!objective || objective.completed) return;
        objective.progress = Math.min(objective.target, objective.progress + amount);
        if (objective.progress >= objective.target) objective.completed = true;
        this.notify();
    }

    /**
     * Track a value directly, e.g. money towards a savings goal. Progress only
     * ever rises: spending the money later does not undo a goal already met.
     */
    setProgress(id: string, value: number): void {
        const objective = this.items.get(id);
        if (!objective || value <= objective.progress) return;
        this.advance(id, value - objective.progress);
    }

    /** Mark an objective complete in one call. */
    complete(id: string): void {
        const objective = this.items.get(id);
        if (!objective || objective.completed) return;
        objective.progress = objective.target;
        objective.completed = true;
        this.notify();
    }

    /** Undo completion, e.g. when a lever is reset. */
    reopen(id: string): void {
        const objective = this.items.get(id);
        if (!objective) return;
        objective.completed = false;
        objective.progress = 0;
        this.notify();
    }

    isComplete(id: string): boolean {
        return this.items.get(id)?.completed ?? false;
    }

    get(id: string): Objective | undefined {
        return this.items.get(id);
    }

    remove(id: string): void {
        this.items.delete(id);
        const index = this.order.indexOf(id);
        if (index >= 0) this.order.splice(index, 1);
        this.notify();
    }

    /** Every objective, in the order they were added. */
    get all(): Objective[] {
        return this.order.map((id) => this.items.get(id) as Objective).filter(Boolean);
    }

    /** Objectives that are not finished yet, including hidden ones. */
    get active(): Objective[] {
        return this.all.filter((objective) => !objective.completed);
    }

    /**
     * True when every required objective is complete, i.e. the level is won.
     * A list with no required objectives is never complete: otherwise adding a
     * single optional objective would immediately finish the level.
     */
    get allRequiredComplete(): boolean {
        const required = this.all.filter((objective) => !objective.optional);
        return required.length > 0 && required.every((objective) => objective.completed);
    }

    /** Completed divided by total, in 0..1. */
    get ratio(): number {
        const all = this.all;
        if (all.length === 0) return 1;
        return all.filter((objective) => objective.completed).length / all.length;
    }

    /** One line describing what to do next, or an empty string when done. */
    get summary(): string {
        const next = this.order.map((id) => this.items.get(id) as Objective).find((objective) => objective && !objective.completed && !objective.hidden);
        if (!next) return this.all.length > 0 ? 'All objectives complete' : '';
        return next.target > 1 ? `${next.text} (${next.progress}/${next.target})` : next.text;
    }

    clear(): void {
        this.items.clear();
        this.order.length = 0;
        this.notify();
    }

    /** Notified on any change. Returns an unsubscribe function. */
    onChange(listener: (objectives: Objective[]) => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    toJSON(): Array<{ id: string; text: string; progress: number; target: number; completed: boolean; optional: boolean; hidden: boolean }> {
        return this.all.map((objective) => ({ ...objective }));
    }

    fromJSON(data: Array<{ id: string; text: string; progress?: number; target?: number; completed?: boolean; optional?: boolean; hidden?: boolean }>): void {
        this.clear();
        for (const entry of data) {
            const options: ObjectiveOptions = { target: entry.target ?? 1 };
            if (entry.optional !== undefined) options.optional = entry.optional;
            if (entry.hidden !== undefined) options.hidden = entry.hidden;
            const objective = this.add(entry.id, entry.text, options);
            objective.progress = entry.progress ?? (entry.completed ? objective.target : 0);
            objective.completed = entry.completed ?? false;
        }
        this.notify();
    }

    private notify(): void {
        this.onSummary(this.summary);
        const snapshot = this.all;
        for (const listener of [...this.listeners]) listener(snapshot);
    }
}

/**
 * Forward objective changes to the game's event bus and emit `level:complete`
 * once every required objective is done. Call it once during boot; templates do.
 */
export function bridgeObjectivesToEvents(game: Game): () => void {
    const announced = new Set<string>();
    return game.objectives.onChange((all) => {
        for (const objective of all) {
            if (!objective.completed || announced.has(objective.id)) continue;
            announced.add(objective.id);
            game.events.emit('objective:completed', { id: objective.id, text: objective.text });
        }
        if (all.length > 0 && game.objectives.allRequiredComplete) game.events.emit('level:complete', { id: 'objectives' });
    });
}

/**
 * A goal that fires once when a world position is reached.
 * Returns an update function; call it in a system and it cleans itself up.
 */
export function reachPositionGoal(position: THREE.Vector3, radius: number, onReached: () => void): (current: THREE.Vector3) => boolean {
    let reached = false;
    return (current: THREE.Vector3) => {
        if (reached) return true;
        if (current.distanceToSquared(position) <= radius * radius) {
            reached = true;
            onReached();
        }
        return reached;
    };
}
