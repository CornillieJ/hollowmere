import type { ItemDefinition } from '../game/items';
import type { CropDefinition } from '../game/farm';
import type { Recipe } from '../game/crafting';

/**
 * Everything that can be carried. Seeds and tools have no `use` handler: the
 * hotbar hands them to the game, which decides what an axe or a watering can
 * does where the player stands. Food has one, so it can be eaten directly.
 *
 * Icons are emoji. Where two things would share one, a `badge` in the corner
 * tells them apart: every seed is a bean with its crop on it, every soup a bowl
 * with what went in.
 *
 * `price` is what the store charges; it buys at half, and the collection
 * crate at the farm pays a little less than that.
 */
const food = (heal: number): NonNullable<ItemDefinition['use']> => ({ onUse: ({ game }) => game?.player?.heal(heal), cooldown: 1 });

export const ITEMS: ItemDefinition[] = [
    { id: 'watering-can', name: 'Watering can', icon: ':drop:', category: 'tool', maxStack: 1, keep: true, description: 'Water a planted plot. Watered crops grow twice as fast that day. Fill it at the well.' },
    { id: 'axe', name: 'Axe', icon: ':axe:', category: 'tool', maxStack: 1, keep: true, description: 'Hold it and press E at a dead tree. Four swings bring one down.' },
    { id: 'fence-kit', name: 'Fence kit', icon: ':fence:', category: 'tool', price: 14, description: 'Press F to put a length of fence down. Holds the walkers back for a while. Nothing holds them for long.' },

    { id: 'turnip-seed', name: 'Turnip seeds', icon: ':seed:', badge: ':turnip:', category: 'material', price: 4, description: 'Quick to grow. Pale inside.' },
    { id: 'wheat-seed', name: 'Wheat seeds', icon: ':seed:', badge: ':wheat:', category: 'material', price: 5, description: 'For bread. It leans away from the road as it grows.' },
    { id: 'corn-seed', name: 'Corn seeds', icon: ':seed:', badge: ':corn:', category: 'material', price: 9, description: 'Tall. Two ears a stalk.' },
    { id: 'pumpkin-seed', name: 'Pumpkin seeds', icon: ':seed:', badge: ':pumpkin:', category: 'material', price: 15, description: 'Slow. The pumpkins here grow faces on their own.' },

    { id: 'turnip', name: 'Turnip', icon: ':turnip:', category: 'treasure', price: 16 },
    { id: 'wheat', name: 'Wheat', icon: ':wheat:', category: 'treasure', price: 14 },
    { id: 'corn', name: 'Corn', icon: ':corn:', category: 'treasure', price: 26 },
    { id: 'pumpkin', name: 'Pumpkin', icon: ':pumpkin:', category: 'treasure', price: 70 },
    { id: 'egg', name: 'Egg', icon: ':egg:', category: 'treasure', price: 22, description: 'Still warm. Do not shake it.' },
    { id: 'milk', name: 'Milk', icon: ':milk:', category: 'treasure', price: 40, description: 'Slightly grey.' },
    { id: 'wood', name: 'Wood', icon: ':wood:', category: 'material', price: 6, description: 'Dead wood burns well. Every dish needs one piece for the fire.' },
    { id: 'mushroom', name: 'Pale cap', icon: ':mushroom:', category: 'treasure', price: 24, description: 'Grows by the black pool and among the standing stones. Faintly warm.' },

    { id: 'veilbloom', name: 'Veilbloom', icon: ':bloom:', category: 'treasure', price: 120, description: 'Opens only after dark, far from any lamp. Barnaby pays well and does not ask where you were.' },

    // Turned up by the hoe now and then: see `FINDS`. Barnaby buys them and never asks to look twice.
    { id: 'find-coin', name: 'Worn coin', icon: ':coin:', category: 'treasure', price: 120, description: 'Rubbed smooth. The face on it has its eyes shut.' },
    { id: 'find-key', name: 'Small key', icon: ':key:', category: 'treasure', price: 160, description: 'Too small for any door on this farm.' },
    { id: 'find-tooth', name: 'Tooth', icon: ':tooth:', category: 'treasure', price: 140, description: 'Not from any animal you keep.' },
    { id: 'find-ring', name: 'Wedding ring', icon: ':ring:', category: 'treasure', price: 260, description: 'A date inside it, and the word "wake".' },
    { id: 'find-button', name: 'Bone button', icon: ':button:', category: 'treasure', price: 100, description: 'It matches the ones on the scarecrow.' },
    { id: 'find-spoon', name: 'Bent spoon', icon: ':spoon:', category: 'treasure', price: 110, description: 'Bent on purpose, and bent back, many times.' },
    { id: 'find-bell', name: 'Cow bell', icon: ':bell:', category: 'treasure', price: 180, description: 'No clapper in it. Your cow will not go near it.' },
    { id: 'find-locket', name: 'Locket', icon: ':locket:', category: 'treasure', price: 320, description: 'Inside, a picture of this farmhouse. Someone is at the window.' },

    { id: 'pale-fish', name: 'Pale fish', icon: ':fish:', category: 'treasure', price: 80, description: 'From the black pool. No eyes to speak of. It does not need them down there.' },
    { id: 'eel', name: 'Black eel', icon: ':eel:', category: 'treasure', price: 150, description: 'It was still moving an hour after. Barnaby sells them to somebody.' },

    { id: 'turnip-soup', name: 'Turnip soup', icon: ':pot:', badge: ':turnip:', category: 'consumable', price: 70, description: 'Restores 35 health.', use: food(35) },
    { id: 'boiled-egg', name: 'Boiled egg', icon: ':egg:', badge: ':hot:', category: 'consumable', price: 54, description: 'Restores 25 health.', use: food(25) },
    { id: 'bread', name: 'Bread', icon: ':bread:', category: 'consumable', price: 64, description: 'Restores 30 health.', use: food(30) },
    { id: 'corn-chowder', name: 'Corn chowder', icon: ':bowl:', badge: ':corn:', category: 'consumable', price: 180, description: 'Restores 60 health.', use: food(60) },
    { id: 'omelette', name: 'Omelette', icon: ':pan:', category: 'consumable', price: 160, description: 'Restores 55 health.', use: food(55) },
    { id: 'pale-broth', name: 'Pale broth', icon: ':bowl:', badge: ':mushroom:', category: 'consumable', price: 150, description: 'Restores 50 health. Glows a little.', use: food(50) },
    { id: 'bloom-tea', name: 'Bloom tea', icon: ':cup:', badge: ':bloom:', category: 'consumable', price: 340, description: 'Restores 70 health. It tastes of a night you got away with.', use: food(70) },
    { id: 'fish-supper', name: 'Fish supper', icon: ':fish:', badge: ':hot:', category: 'consumable', price: 230, description: 'Restores 60 health. Pale fish and turnip, fried. Better than it has any right to be.', use: food(60) },
    { id: 'pumpkin-pie', name: 'Pumpkin pie', icon: ':pie:', category: 'consumable', price: 300, description: 'Restores 80 health.', use: food(80) },
    { id: 'hollow-stew', name: 'Hollowveil stew', icon: ':pot:', badge: ':pumpkin:', category: 'consumable', price: 420, description: 'Restores all health. The village eats it at funerals and at weddings.', use: food(100) },

    // Taught by a villager at 2 hearts; see `content/regulars.ts`.
    { id: 'counted-biscuits', name: 'Counted biscuits', icon: ':biscuit:', category: 'consumable', price: 60, description: 'Restores 25 health. Barnaby taught you. None of them are brown.', use: food(25) },
    { id: 'turnip-mash', name: 'Turnip mash', icon: ':bowl:', badge: ':turnip:', category: 'consumable', price: 130, description: 'Restores 45 health. Wren taught you. The same colour all the way through.', use: food(45) },
    { id: 'postmans-loaf', name: "Postman's loaf", icon: ':loaf:', category: 'consumable', price: 120, description: 'Restores 45 health. Fen taught you. Sounds hollow when you knock.', use: food(45) },
    { id: 'warm-milk', name: 'Warm milk', icon: ':cup:', category: 'consumable', price: 46, description: 'Restores 20 health. Mother Hollis taught you. One cup for whoever is awake.', use: food(20) },
    { id: 'corn-cakes', name: 'Corn cakes', icon: ':cakes:', category: 'consumable', price: 80, description: 'Restores 35 health. Pike taught you. 4 fit in a mouth.', use: food(35) },

    // Bought at the store and put on at once: each is the next size up.
    { id: 'backpack-1', name: 'Stitched backpack', icon: ':bag:', badge: '6', category: 'tool', maxStack: 1, keep: true, price: 150, description: '6 slots instead of 3. Worn as soon as it is bought.' },
    { id: 'backpack-2', name: 'Leather backpack', icon: ':bag:', badge: '10', category: 'tool', maxStack: 1, keep: true, price: 400, description: '10 slots. Worn as soon as it is bought.' },
    { id: 'backpack-3', name: "Postman's satchel", icon: ':bag:', badge: '16', category: 'tool', maxStack: 1, keep: true, price: 900, description: '16 slots. Fen will not say where the last postman went.' },
    { id: 'candle', name: 'Grave candle', icon: ':candle:', category: 'tool', price: 18, description: 'Press F to set it down and light it. The walkers keep out of its light for a minute and a half.' },
    { id: 'lantern', name: 'Lantern', icon: ':lantern:', category: 'tool', price: 45, description: 'Press F to put it up where you stand, with a day of oil in it. They keep out of its light and the Veil thins round it. Keep it in oil.' },
    { id: 'scarecrow', name: 'Weeping scarecrow', icon: ':scarecrow:', category: 'tool', price: 260, description: 'Press F in the field to stand it on the corner between plots. Each morning the plots within 2 steps of it are found watered. Press E at it to take it down.' },
    { id: 'lamp-oil', name: 'Lamp oil', icon: ':oil:', category: 'material', price: 9, description: 'One flask burns for a day. Press E at a lantern to fill it: it holds 2.' },
    { id: 'name-slip', name: 'Folded slip', icon: ':scroll:', category: 'quest', maxStack: 1, keep: true, description: 'Your name, in your own hand. You do not remember writing it. Read it every morning.' },
];

/** What the general store stocks from the first day. Better seeds are added by upgrades. */
export const STORE_STOCK = ['turnip-seed', 'wheat-seed', 'fence-kit', 'candle', 'lantern', 'lamp-oil'];

/** Real seconds per growth stage are short: a crop takes a few minutes of a ten minute day. */
export const CROPS: CropDefinition[] = [
    { id: 'turnip', name: 'Turnip', seed: 'turnip-seed', produce: 'turnip', stages: 3, stageSeconds: [35, 35, 35], height: 0.5, colors: [0x5f8a52, 0x7aa064, 0xc8d8b0], seedReturn: 1, bonusSeedChance: 0.35 },
    { id: 'wheat', name: 'Wheat', seed: 'wheat-seed', produce: 'wheat', yield: 2, stages: 3, stageSeconds: [40, 40, 40], height: 1.1, colors: [0x6a8a52, 0x9a9a5a, 0xc8b060], seedReturn: 1, bonusSeedChance: 0.35 },
    { id: 'corn', name: 'Corn', seed: 'corn-seed', produce: 'corn', yield: 2, stages: 4, stageSeconds: [45, 45, 45, 45], height: 1.7, colors: [0x5f8a52, 0x7a9a5a, 0xb0a85a, 0xd8c070], seedReturn: 1, bonusSeedChance: 0.3 },
    { id: 'pumpkin', name: 'Pumpkin', seed: 'pumpkin-seed', produce: 'pumpkin', stages: 4, stageSeconds: [60, 60, 60, 60], height: 0.8, colors: [0x5f8a52, 0x7a9a52, 0xb07a3a, 0xd0702a], seedReturn: 1, bonusSeedChance: 0.25 },
];

/** Seed item to crop id, for planting from the hotbar. */
export const SEED_TO_CROP: Record<string, string> = Object.fromEntries(CROPS.map((crop) => [crop.seed as string, crop.id]));

export const POT_TIERS = ['Clay pot', 'Iron pot', 'Cauldron'];

/** What the pot over the fire makes. Every dish burns 1 wood. */
export const COOKING: Recipe[] = [
    { id: 'turnip-soup', output: { itemId: 'turnip-soup' }, ingredients: [{ itemId: 'turnip', amount: 2 }, { itemId: 'wood', amount: 1 }], seconds: 20 },
    { id: 'boiled-egg', output: { itemId: 'boiled-egg' }, ingredients: [{ itemId: 'egg', amount: 1 }, { itemId: 'wood', amount: 1 }], seconds: 12 },
    { id: 'fish-supper', output: { itemId: 'fish-supper' }, ingredients: [{ itemId: 'pale-fish', amount: 1 }, { itemId: 'turnip', amount: 1 }, { itemId: 'wood', amount: 1 }], seconds: 22 },
    { id: 'bread', output: { itemId: 'bread' }, ingredients: [{ itemId: 'wheat', amount: 2 }, { itemId: 'wood', amount: 1 }], seconds: 25 },
    { id: 'corn-chowder', output: { itemId: 'corn-chowder' }, ingredients: [{ itemId: 'corn', amount: 2 }, { itemId: 'milk', amount: 1 }, { itemId: 'wood', amount: 1 }], seconds: 30, tier: 2 },
    { id: 'omelette', output: { itemId: 'omelette' }, ingredients: [{ itemId: 'egg', amount: 2 }, { itemId: 'milk', amount: 1 }, { itemId: 'wood', amount: 1 }], seconds: 22, tier: 2 },
    { id: 'pale-broth', output: { itemId: 'pale-broth' }, ingredients: [{ itemId: 'mushroom', amount: 2 }, { itemId: 'turnip', amount: 1 }, { itemId: 'wood', amount: 1 }], seconds: 28, tier: 2 },
    { id: 'bloom-tea', output: { itemId: 'bloom-tea' }, ingredients: [{ itemId: 'veilbloom', amount: 1 }, { itemId: 'milk', amount: 1 }, { itemId: 'wood', amount: 1 }], seconds: 24, tier: 2 },
    { id: 'pumpkin-pie', output: { itemId: 'pumpkin-pie' }, ingredients: [{ itemId: 'pumpkin', amount: 1 }, { itemId: 'egg', amount: 1 }, { itemId: 'wheat', amount: 1 }, { itemId: 'wood', amount: 1 }], seconds: 40, tier: 3 },
    { id: 'hollow-stew', output: { itemId: 'hollow-stew' }, ingredients: [{ itemId: 'pumpkin', amount: 1 }, { itemId: 'corn', amount: 1 }, { itemId: 'mushroom', amount: 2 }, { itemId: 'milk', amount: 1 }, { itemId: 'wood', amount: 1 }], seconds: 50, tier: 3 },
];

/** The crop a request ultimately needs seeds for. Requests for these wait until the player can grow it. */
export const NEEDS_CROP: Record<string, string> = { 'corn-chowder': 'corn', pumpkin: 'pumpkin', 'pumpkin-pie': 'pumpkin', 'hollow-stew': 'pumpkin' };

/** What the bench in the yard makes. */
export const WOODWORK: Recipe[] = [
    { id: 'fence-kit', output: { itemId: 'fence-kit' }, ingredients: [{ itemId: 'wood', amount: 3 }], seconds: 8, description: 'Cheaper than the store.' },
    { id: 'lantern', output: { itemId: 'lantern' }, ingredients: [{ itemId: 'wood', amount: 4 }, { itemId: 'lamp-oil', amount: 1 }], seconds: 12, description: 'A post and a lamp. Cheaper than the store.' },
];

/** What the collection crate takes: produce and dishes, not tools or seeds. */
export const SHIPPABLE = new Set(ITEMS.filter((item) => item.category === 'treasure' || item.category === 'consumable' || item.id === 'wood').map((item) => item.id));

/** What lies in the field under the crops, in the order it tends to come up. */
export const FINDS = ['find-button', 'find-coin', 'find-spoon', 'find-tooth', 'find-key', 'find-bell', 'find-ring', 'find-locket'];
