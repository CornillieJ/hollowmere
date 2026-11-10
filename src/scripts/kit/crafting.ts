import * as THREE from 'three';

import { SYSTEM_ORDER } from '../core/systems';
import { CraftingStation, type CraftingState, type Recipe } from '../game/crafting';
import type { PanelRow } from '../ui/list-panel';
import type { InventoryHandle } from './inventory';
import { addPanel, type PanelHandle } from './panel';

//#region Crafting

/**
 * A cookpot, a workbench, a forge: walk up, pick a recipe, wait, take the result.
 *
 * The panel lists every recipe with what it needs and what the player has, so
 * it doubles as the recipe book for that station. Recipes above the station's
 * tier show greyed out, which tells the player what an upgrade would unlock.
 *
 * ```ts
 * const pot = addCraftingStation(game, {
 *     id: 'cookpot',
 *     title: 'Cookpot',
 *     object: potMesh,
 *     recipes: RECIPES,
 *     sources: [pockets, bag],
 * });
 * pot.station.tier = 2;   // after buying the iron pot
 * ```
 */
export type AddCraftingStationOptions = {
    /** Save key and system name. */
    id: string;
    title: string;
    recipes: Recipe[];
    /** Starting tier. Defaults to 1. */
    tier?: number;
    /** What each tier is called, e.g. `['Clay pot', 'Iron pot']`, for the heading and the locked hint. */
    tierNames?: string[];
    /** Inventories ingredients come from, in order. The first also supplies item names and icons. */
    sources: InventoryHandle[];
    /** Where results go. Returns how many did not fit. Defaults to the sources, in order. */
    give?: (itemId: string, amount: number) => number;
    /** The thing in the world to walk up to. Omit to open the panel only from code. */
    object?: THREE.Object3D;
    /** Interaction prompt, e.g. "Cook". */
    prompt?: string;
    range?: number;
    /** Verb on the buttons. Defaults to "Make". */
    verb?: string;
    /** Called when a job finishes, e.g. for a sound. A toast is shown either way. */
    onFinished?: (recipe: Recipe) => void;
    onStarted?: (recipe: Recipe) => void;
    onCollected?: (itemId: string, amount: number) => void;
};

export type CraftingHandle = {
    readonly station: CraftingStation;
    readonly panel: PanelHandle;
    open: () => void;
    /** Start a recipe as if its button was pressed. */
    start: (recipeId: string) => boolean;
    /** Take whatever is finished. Returns true when something was taken. */
    collect: () => boolean;
    dispose: () => void;
};

export function addCraftingStation(game: Game, options: AddCraftingStationOptions): CraftingHandle {
    const station = new CraftingStation({ recipes: options.recipes, ...(options.tier !== undefined ? { tier: options.tier } : {}) });
    const registry = options.sources[0]?.inventory.registry;
    const item = (itemId: string): { name: string; icon: string } => {
        const definition = registry?.resolve(itemId);
        return { name: definition?.name ?? itemId, icon: definition?.icon ?? '' };
    };
    const have = (itemId: string): number => options.sources.reduce((total, source) => total + source.count(itemId), 0);
    const give =
        options.give ??
        ((itemId: string, amount: number): number => {
            let left = amount;
            for (const source of options.sources) left = left > 0 ? source.add(itemId, left) : 0;
            return left;
        });
    const verb = options.verb ?? 'Make';
    const nameOf = (recipe: Recipe): string => recipe.name ?? item(recipe.output.itemId).name;

    const start = (recipeId: string): boolean => {
        const recipe = station.recipe(recipeId);
        if (!recipe || !station.start(recipeId, options.sources)) return false;
        options.onStarted?.(recipe);
        return true;
    };

    const collect = (): boolean => {
        const taken = station.collect(give);
        for (const stack of taken) {
            game.toasts.push(`+${stack.amount} ${item(stack.itemId).name}`, { color: '#d8e8b0' });
            options.onCollected?.(stack.itemId, stack.amount);
        }
        if (taken.length === 0 && station.ready.length > 0) game.toasts.push('No room to carry it', { color: '#ff9a9a' });
        return taken.length > 0;
    };

    const rows = (): PanelRow[] => {
        const list: PanelRow[] = [];
        if (station.job) {
            const left = Math.max(0, Math.ceil(station.job.recipe.seconds - station.job.elapsed));
            list.push({ icon: item(station.job.recipe.output.itemId).icon, title: `Making ${nameOf(station.job.recipe).toLowerCase()}`, meta: `${left}s`, progress: station.progress });
        }
        for (const stack of station.ready) {
            list.push({ icon: item(stack.itemId).icon, title: `${stack.amount} ${item(stack.itemId).name} ready`, action: { label: 'Take', onPress: () => void collect() } });
        }
        list.push({ heading: true, title: 'Recipes' });
        for (const recipe of [...station.recipes].sort((a, b) => (a.tier ?? 1) - (b.tier ?? 1))) {
            const needs = recipe.ingredients.map((ingredient) => `${ingredient.amount} ${item(ingredient.itemId).name.toLowerCase()} (${have(ingredient.itemId)})`).join(', ');
            const amount = recipe.output.amount ?? 1;
            const row: PanelRow = {
                icon: item(recipe.output.itemId).icon,
                title: amount > 1 ? `${nameOf(recipe)} ×${amount}` : nameOf(recipe),
                detail: recipe.description ? `${needs}. ${recipe.description}` : needs,
                meta: `${recipe.seconds}s`,
            };
            if (station.unlocked(recipe)) {
                row.action = { label: verb, enabled: station.canStart(recipe, options.sources), onPress: () => void start(recipe.id) };
            } else {
                row.dim = true;
                row.meta = `Needs ${options.tierNames?.[(recipe.tier ?? 1) - 1]?.toLowerCase() ?? `tier ${recipe.tier}`}`;
            }
            list.push(row);
        }
        return list;
    };

    const panel = addPanel(game, {
        title: options.title,
        rows,
        footer: () => options.tierNames?.[station.tier - 1] ?? '',
        // The job runs on the game clock, so the clock must keep going while the player watches it.
        pauseWhileOpen: false,
    });

    const removers: Array<() => void> = [];
    removers.push(
        game.systems.add({
            name: `crafting-${options.id}`,
            order: SYSTEM_ORDER.GAMEPLAY,
            update: (delta) => {
                const finished = station.update(delta);
                if (!finished) return;
                game.toasts.push(`${nameOf(finished)} is ready`, { color: '#ffe08a' });
                options.onFinished?.(finished);
            },
        }),
    );
    if (options.object) {
        removers.push(
            game.interactions.add(options.object, {
                prompt: () => (station.ready.length > 0 ? `Take the ${item(station.ready[0]?.itemId ?? '').name.toLowerCase()}` : (options.prompt ?? `Use the ${options.title.toLowerCase()}`)),
                range: options.range ?? 2.4,
                // Something finished: one press takes it. Otherwise open the list.
                onInteract: () => {
                    if (station.ready.length === 0 || !collect()) panel.open();
                },
            }),
        );
    }
    removers.push(
        game.save.register(`crafting-${options.id}`, {
            save: () => station.toJSON(),
            load: (data) => station.fromJSON(data as Partial<CraftingState> | undefined),
        }),
    );

    return {
        station,
        panel,
        open: () => panel.open(),
        start,
        collect,
        dispose: () => {
            for (const remove of removers) remove();
            panel.dispose();
        },
    };
}

export type { Recipe } from '../game/crafting';

//#endregion Crafting
