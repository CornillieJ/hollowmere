/**
 * Recipes and stations: put ingredients in, wait, take the result out.
 *
 * A station runs one job at a time. Starting a job takes the ingredients from
 * one or more inventories; when the time is up the result waits on the station
 * until it is collected. A station has a tier, and a recipe can ask for one, so
 * "a better pot cooks better food" is a number going up.
 *
 * Pure logic: no scene, no UI. `addCraftingStation` in the kit wraps it.
 */
export type RecipeItem = { itemId: string; amount: number };

export type Recipe = {
    id: string;
    /** Shown in the list. Defaults to the output item's name. */
    name?: string;
    output: { itemId: string; amount?: number };
    ingredients: RecipeItem[];
    /** Seconds the job takes. */
    seconds: number;
    /** Station tier needed. Defaults to 1. */
    tier?: number;
    description?: string;
};

/** Anything ingredients can be taken from. An `Inventory` and an `InventoryHandle` both fit. */
export type CraftSource = {
    count: (itemId: string) => number;
    remove: (itemId: string, amount: number) => boolean;
};

export type CraftJob = { recipe: Recipe; elapsed: number };

export type CraftingState = { tier: number; job: { recipe: string; elapsed: number } | null; ready: RecipeItem[] };

export class CraftingStation {
    readonly recipes: Recipe[];
    /** Finished results waiting to be taken. */
    readonly ready: RecipeItem[] = [];
    job: CraftJob | undefined;

    private level: number;
    private readonly listeners = new Set<(event: 'started' | 'finished' | 'collected' | 'tier') => void>();

    constructor(options: { recipes: Recipe[]; tier?: number }) {
        this.recipes = options.recipes;
        this.level = options.tier ?? 1;
    }

    get tier(): number {
        return this.level;
    }

    set tier(value: number) {
        if (value === this.level) return;
        this.level = value;
        this.notify('tier');
    }

    /** 0..1 through the current job, 0 when idle. */
    get progress(): number {
        return this.job ? Math.min(1, this.job.elapsed / Math.max(0.001, this.job.recipe.seconds)) : 0;
    }

    get busy(): boolean {
        return this.job !== undefined;
    }

    recipe(id: string): Recipe | undefined {
        return this.recipes.find((recipe) => recipe.id === id);
    }

    /** True when the station's tier is high enough for the recipe. */
    unlocked(recipe: Recipe): boolean {
        return (recipe.tier ?? 1) <= this.level;
    }

    /** What is still short, summed over every source. Empty when the recipe can be made. */
    missing(recipe: Recipe, sources: CraftSource[]): RecipeItem[] {
        return recipe.ingredients
            .map((ingredient) => ({ itemId: ingredient.itemId, amount: ingredient.amount - sources.reduce((total, source) => total + source.count(ingredient.itemId), 0) }))
            .filter((entry) => entry.amount > 0);
    }

    canStart(recipe: Recipe, sources: CraftSource[]): boolean {
        return !this.busy && this.unlocked(recipe) && this.missing(recipe, sources).length === 0;
    }

    /** Take the ingredients and begin. Returns false when busy, locked or short. */
    start(recipeId: string, sources: CraftSource[]): boolean {
        const recipe = this.recipe(recipeId);
        if (!recipe || !this.canStart(recipe, sources)) return false;
        for (const ingredient of recipe.ingredients) {
            let left = ingredient.amount;
            for (const source of sources) {
                const take = Math.min(left, source.count(ingredient.itemId));
                if (take > 0 && source.remove(ingredient.itemId, take)) left -= take;
                if (left <= 0) break;
            }
        }
        this.job = { recipe, elapsed: 0 };
        this.notify('started');
        return true;
    }

    /** Advance the job. Returns the recipe on the step it finishes. */
    update(delta: number): Recipe | undefined {
        if (!this.job) return undefined;
        this.job.elapsed += delta;
        if (this.job.elapsed < this.job.recipe.seconds) return undefined;
        const recipe = this.job.recipe;
        this.job = undefined;
        this.addReady(recipe.output.itemId, recipe.output.amount ?? 1);
        this.notify('finished');
        return recipe;
    }

    /**
     * Hand the finished results over.
     * @param give Receives each stack and returns how many did not fit; those stay on the station.
     * @returns What was actually taken.
     */
    collect(give: (itemId: string, amount: number) => number): RecipeItem[] {
        const taken: RecipeItem[] = [];
        for (const stack of [...this.ready]) {
            const left = Math.max(0, give(stack.itemId, stack.amount));
            if (left < stack.amount) taken.push({ itemId: stack.itemId, amount: stack.amount - left });
            if (left > 0) stack.amount = left;
            else this.ready.splice(this.ready.indexOf(stack), 1);
        }
        if (taken.length > 0) this.notify('collected');
        return taken;
    }

    onChange(listener: (event: 'started' | 'finished' | 'collected' | 'tier') => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    toJSON(): CraftingState {
        return { tier: this.level, job: this.job ? { recipe: this.job.recipe.id, elapsed: this.job.elapsed } : null, ready: this.ready.map((stack) => ({ ...stack })) };
    }

    fromJSON(data: Partial<CraftingState> | undefined): void {
        this.level = data?.tier ?? this.level;
        const recipe = data?.job ? this.recipe(data.job.recipe) : undefined;
        this.job = recipe ? { recipe, elapsed: data?.job?.elapsed ?? 0 } : undefined;
        this.ready.length = 0;
        this.ready.push(...(data?.ready ?? []).map((stack) => ({ ...stack })));
        this.notify('tier');
    }

    private addReady(itemId: string, amount: number): void {
        const stack = this.ready.find((entry) => entry.itemId === itemId);
        if (stack) stack.amount += amount;
        else this.ready.push({ itemId, amount });
    }

    private notify(event: 'started' | 'finished' | 'collected' | 'tier'): void {
        for (const listener of [...this.listeners]) listener(event);
    }
}
