import { addPanel, type CraftingHandle, type PanelHandle, type PanelRow, type StorylineHandle, type VillagersHandle } from '../kit';
import type { ItemRegistry } from '../game/items';
import { POT_TIERS } from '../content/items';
import { VILLAGERS } from '../content/villagers';
import { worded } from './wording';
import { GUIDE } from '../content/guide';

/**
 * The notebook, on J: what to do next, who wants what, every recipe, and how
 * the valley works. Everything the game expects the player to know is written
 * down here, so nothing has to be remembered from a line that scrolled past.
 */
export type JournalOptions = {
    story: StorylineHandle;
    villagers: VillagersHandle;
    stations: Array<{ label: string; handle: CraftingHandle; tiers?: string[] }>;
    registry: ItemRegistry;
    have: (itemId: string) => number;
    day: () => number;
    /** Extra rows for the top of the task list, e.g. the bargain with Pell. */
    extra?: () => PanelRow[];
    /** The list of deeds, for its own tab. */
    deeds: () => PanelRow[];
    /** What the farmer has noticed is not right. */
    wrong: () => PanelRow[];
};


export function setupJournal(game: Game, options: JournalOptions): PanelHandle {
    const say = worded(game);
    const name = (itemId: string): string => options.registry.resolve(itemId).name;
    const icon = (itemId: string): string => options.registry.resolve(itemId).icon ?? '';
    const who = (id: string): string => VILLAGERS.find((villager) => villager.id === id)?.name ?? id;

    const tasks = (): PanelRow[] => {
        const rows: PanelRow[] = [...(options.extra?.() ?? [])];
        const step = options.story.story.current;
        if (step) {
            rows.push({ heading: true, title: 'Now' });
            rows.push({ icon: ':arrow:', title: options.story.summary, ...(step.detail !== undefined ? { detail: step.detail } : {}) });
        }
        const requests = options.villagers.requests?.open ?? [];
        rows.push({ heading: true, title: 'Requests' });
        for (const request of requests) {
            const carried = options.have(request.itemId);
            const daysLeft = request.dueDay - options.day();
            rows.push({
                icon: icon(request.itemId),
                title: `${who(request.from)}: ${request.amount} ${name(request.itemId).toLowerCase()}`,
                detail: `${!request.accepted ? `On offer: wants ${request.deposit}c down first. Talk to them. ` : request.deposit > 0 ? `Taken, ${request.deposit}c down. ` : ''}You carry ${carried}. ${daysLeft <= 0 ? 'Due today.' : `${daysLeft} day${daysLeft > 1 ? 's' : ''} left.`}`,
                meta: `${request.reward}c`,
            });
        }
        if (requests.length === 0) rows.push({ title: 'Nobody is asking for anything today.', dim: true });
        const done = options.story.story.completed;
        if (done.length > 0) rows.push({ heading: true, title: 'Done' }, ...done.map((entry) => ({ icon: ':check:', title: entry.objective, dim: true })).reverse());
        return rows;
    };

    const recipes = (): PanelRow[] =>
        options.stations.flatMap(({ label, handle, tiers }) => [
            { heading: true, title: tiers ? `${label} (${tiers[handle.station.tier - 1] ?? ''})` : label },
            ...handle.station.recipes.map((recipe): PanelRow => {
                const locked = !handle.station.unlocked(recipe);
                return {
                    icon: icon(recipe.output.itemId),
                    title: name(recipe.output.itemId),
                    detail: recipe.ingredients.map((ingredient) => `${ingredient.amount} ${name(ingredient.itemId).toLowerCase()}`).join(', '),
                    meta: locked ? `Needs ${(tiers ?? POT_TIERS)[(recipe.tier ?? 1) - 1]?.toLowerCase()}` : `${recipe.seconds}s`,
                    dim: locked,
                };
            }),
        ]);

    return addPanel(game, {
        title: 'Notebook',
        key: 'journal',
        keys: ['KeyJ'],
        tabs: [
            { id: 'tasks', label: 'Tasks', rows: tasks },
            { id: 'recipes', label: 'Recipes', rows: recipes },
            { id: 'deeds', label: 'Deeds', rows: options.deeds },
            { id: 'wrong', label: 'Not right', rows: options.wrong },
            { id: 'guide', label: 'How to live here', rows: () => GUIDE.map(([glyph, title, detail]) => ({ icon: glyph, title, detail: say(detail) })) },
        ],
    });
}
