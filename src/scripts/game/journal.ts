import { addPanel, type CraftingHandle, type PanelHandle, type PanelRow, type StorylineHandle, type VillagersHandle } from '../kit';
import type { ItemRegistry } from '../game/items';
import { POT_TIERS } from '../content/items';
import { VILLAGERS } from '../content/villagers';
import { worded } from './wording';

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

const GUIDE: Array<[string, string, string]> = [
    ['🌱', 'Farming', 'Press E at a plot and the right thing happens: an empty plot is planted, a dry one watered, a ripe one picked. Hold E and walk to work down a row. The seeds in your hand are planted, or else the first in your pockets. Watered crops grow twice as fast that day, ripe ones glint, and every harvest gives a seed back, sometimes two.'],
    ['💧', 'Water', 'The watering can holds 5 waterings. Press E at the well by the farmhouse to fill it. Barnaby can order a bigger one. Crops also grow while you sleep and while you pay a call.'],
    ['👒', 'Scarecrows', 'A weeping scarecrow (260c at the store) stands on the corner between plots, put up with F. Every morning the plots within 2 steps of it are already watered: 12 at most. Press E at it to take it down and move it.'],
    ['🌙', 'After dark', 'A delivery made at night pays 50% more. A dish in the bicycle basket cools half as fast while you ride, so the bicycle is how hot food gets there late.'],
    ['🕒', 'Time', 'A day is 10 minutes. Filling a request takes 3 hours. At 3 in the morning the clock stops and nothing can be done but go home to bed.'],
    ['🪓', 'Wood', 'Press E at a dead tree, four times; the axe comes to hand by itself. Trees grow back after 2 or 3 days. Every cooked dish burns 1 wood, and 3 wood make a fence kit at the bench.'],
    ['🍲', 'Cooking', 'Press E at the pot by the farmhouse, choose a recipe, wait, then take the dish. Cooked food pays far better than raw crops. Better pots cook better dishes. A dish is hot for 4 hours out of the pot and warm for 6 more: delivered hot it pays 30% more, warm 12% more. The list under your task shows what you carry and how long it has. A delivery takes 3 hours, so think about who goes first.'],
    ['🏮', 'Lanterns and the Veil', 'The Veil is thickest late in the day and far from any light. A lantern (45c at the store, or 4 wood and a flask of oil at the workbench) can be put up anywhere with F. While it has oil they keep out of its ring and the fog thins round it. A flask of lamp oil (9c) burns a day; a lantern holds 2. Press E at one to fill it, or to take it down. 10 at most.'],
    ['☁', 'The smell of it', 'They can smell hot food. A basket of hot dishes is noticed from much further off, and brings more of them, most of all after dark. Cold food hardly smells. A lit place or the barn hides it.'],
    ['🔔', 'Good days', 'Each further request filled on the same day pays 10% more than the last, up to half as much again. The morning tells you your best day so far.'],
    ['❗', 'Requests', 'A ! marks a villager who wants something. Talk to them, bring exactly what they asked for, and choose "Hand over". Each delivery pays coins and friendship, and every few deliveries they start asking for better things.'],
    ['🤝', 'Big jobs', 'The better-paid requests want a third of the pay put down first. You are asked yes or no. Deliver in time and it comes back with the pay; miss the day and they keep it.'],
    ['🌅', 'Going home', 'From day 3 Pell waits on the lookout hill with an offer: burn 6000c at the old tree within 60 days and you wake up at home. Pay in parts, whenever you call on him. Dying costs 3 of those days. Miss the last day and you stay for good.'],
    ['🌫', 'The edge', 'The valley has no edge. The villagers call the fog the Veil: walk far enough into it in any direction and you come out on the far side.'],
    ['⚠', 'Bad days', 'Some days a crowd of them gathers: round the village wall, or all over the farmyard. They still cannot enter a lit place, and they are gone by the next dawn.'],
    ['🛒', 'The store', 'Barnaby sells seeds and fence kits and buys anything at half price: the crate at the end of his stall takes it out of your backpack too. His order book sells land, pots, hens and cows. His collection crate by your mailbox buys crops, food and wood too, for a little less.'],
    ['🥚', 'Animals', 'Hens lay and the cow gives milk every couple of minutes. Press E at an animal when it is ready.'],
    ['🚲', 'Getting about', 'Press E at the bicycle to ride: W pedals, A and D steer, E gets off. It is much faster than anything in the fog. The thin paths off the road lead to places worth a visit.'],
    ['🧭', 'Finding the way', 'The strip at the top of the screen is a compass. 🏠 is your farm, 🕯 is the village, and ➤ is where the current task is.'],
    ['🕯', 'The Hollow', 'The village\'s word for the ones out in the Veil. They are slow and they do not stop. Keep moving, put a fence down with F, light a grave candle with F for a minute and a half of safety, or step into a lit place: your porch, the barn lamp, the chapel, the shrine, the lookout. Night runs from 19:30 to 05:30: 3 times as many walk then, they see farther and they head for you instead of wandering. One more turns up with every day. Pale ones only move while you are not looking at them. If they kill you, you wake in the village infirmary 3 days later with nothing but your tools, and anyone who was waiting on you has stopped waiting.'],
    ['🌧', 'Weather', 'Rain waters the field every hour it falls, and food in the basket cools half as fast again. A thick Veil takes the compass away until it thins. A clear night starts at dusk: only half of them walk, so it is the night for a long round. A banner says which it is, and the line under the task stays while it lasts.'],
    ['✉', 'Letters', 'From the second day a letter waits in the mailbox by the porch each morning, marked with a ✉. Read them all.'],
    ['🛏', 'Sleeping', 'Press E at the farmhouse door to sleep until morning. Sleeping saves the game. You can also save from the pause menu.'],
    ['🧺', 'Regulars', 'Whoever you reach 1 heart with starts a regular order: their favourite, every 3 days, for far more than the stall pays. It waits 3 days. Hand it over when you talk to them; hot food pays more here too. At 2 hearts they will teach you their own dish if you ask, and the order changes to that. At 3 hearts each of them has a favour that lasts. The list is at the top of this notebook.'],
    ['🎒', 'Carrying', 'Pockets are the 8 slots on the hotbar: pick one with 1 to 8 or the wheel, press F to use it. Tab opens the backpack: drag things between it and the pockets, drag them out of the window to drop them, click one for more. It starts with 3 slots; the store and the order book sell bigger ones (150c, 400c, 900c). Drag one item onto another to swap them. The chest in the barn stores what you do not want to carry; nothing follows you in there. What you drop stays where it lies.'],
];

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
            rows.push({ icon: '➤', title: options.story.summary, ...(step.detail !== undefined ? { detail: step.detail } : {}) });
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
        if (done.length > 0) rows.push({ heading: true, title: 'Done' }, ...done.map((entry) => ({ icon: '✓', title: entry.objective, dim: true })).reverse());
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
