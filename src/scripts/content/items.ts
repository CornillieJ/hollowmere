import type { ItemDefinition } from '../game/items';
import type { CropDefinition } from '../game/farm';
import type { Recipe } from '../game/crafting';

/**
 * Everything that can be carried. Seeds and tools have no `use` handler: the
 * hotbar hands them to the game, which decides what an axe or a watering can
 * does where the player stands. Food has one, so it can be eaten directly.
 *
 * `price` is what the store charges; it buys at half, and the shipping bin at
 * the farm pays a little less than that.
 */
const food = (heal: number): NonNullable<ItemDefinition['use']> => ({ onUse: ({ game }) => game?.player?.heal(heal), cooldown: 1 });

export const ITEMS: ItemDefinition[] = [
    { id: 'watering-can', name: 'Watering can', icon: '🚿', category: 'tool', maxStack: 1, description: 'Water a planted plot. Watered crops grow twice as fast that day.' },
    { id: 'axe', name: 'Axe', icon: '🪓', category: 'tool', maxStack: 1, description: 'Hold it and press E at a dead tree. Four swings bring one down.' },
    { id: 'fence-kit', name: 'Fence kit', icon: '🚧', category: 'tool', price: 14, description: 'Press F to put a length of fence down. Holds the walkers back for a while. Nothing holds them for long.' },

    { id: 'turnip-seed', name: 'Turnip seeds', icon: '🌱', category: 'material', price: 4, description: 'Quick to grow. Pale inside.' },
    { id: 'wheat-seed', name: 'Wheat seeds', icon: '🌾', category: 'material', price: 5, description: 'For bread. It leans away from the road as it grows.' },
    { id: 'corn-seed', name: 'Corn seeds', icon: '🌽', category: 'material', price: 9, description: 'Tall. Two ears a stalk.' },
    { id: 'pumpkin-seed', name: 'Pumpkin seeds', icon: '🎃', category: 'material', price: 15, description: 'Slow. The pumpkins here grow faces on their own.' },

    { id: 'turnip', name: 'Turnip', icon: '🥬', category: 'treasure', price: 16 },
    { id: 'wheat', name: 'Wheat', icon: '🌾', category: 'treasure', price: 14 },
    { id: 'corn', name: 'Corn', icon: '🌽', category: 'treasure', price: 26 },
    { id: 'pumpkin', name: 'Pumpkin', icon: '🎃', category: 'treasure', price: 70 },
    { id: 'egg', name: 'Egg', icon: '🥚', category: 'treasure', price: 22, description: 'Still warm. Do not shake it.' },
    { id: 'milk', name: 'Milk', icon: '🥛', category: 'treasure', price: 40, description: 'Slightly grey.' },
    { id: 'wood', name: 'Wood', icon: '🪵', category: 'material', price: 6, description: 'Dead wood burns well. Every dish needs one piece for the fire.' },
    { id: 'mushroom', name: 'Pale cap', icon: '🍄', category: 'treasure', price: 24, description: 'Grows by the mere and among the standing stones. Faintly warm.' },

    { id: 'turnip-soup', name: 'Turnip soup', icon: '🍲', category: 'consumable', price: 70, description: 'Restores 35 health.', use: food(35) },
    { id: 'boiled-egg', name: 'Boiled egg', icon: '🥚', category: 'consumable', price: 54, description: 'Restores 25 health.', use: food(25) },
    { id: 'bread', name: 'Bread', icon: '🍞', category: 'consumable', price: 64, description: 'Restores 30 health.', use: food(30) },
    { id: 'corn-chowder', name: 'Corn chowder', icon: '🥣', category: 'consumable', price: 180, description: 'Restores 60 health.', use: food(60) },
    { id: 'omelette', name: 'Omelette', icon: '🍳', category: 'consumable', price: 160, description: 'Restores 55 health.', use: food(55) },
    { id: 'pale-broth', name: 'Pale broth', icon: '🫕', category: 'consumable', price: 150, description: 'Restores 50 health. Glows a little.', use: food(50) },
    { id: 'pumpkin-pie', name: 'Pumpkin pie', icon: '🥧', category: 'consumable', price: 300, description: 'Restores 80 health.', use: food(80) },
    { id: 'hollow-stew', name: 'Hollowmere stew', icon: '🍛', category: 'consumable', price: 420, description: 'Restores all health. The village eats it at funerals and at weddings.', use: food(100) },

    { id: 'candle', name: 'Grave candle', icon: '🕯', category: 'treasure', price: 18, description: 'Everyone keeps one lit.' },
];

/** What the general store stocks from the first day. Better seeds are added by upgrades. */
export const STORE_STOCK = ['turnip-seed', 'wheat-seed', 'fence-kit', 'candle'];

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
    { id: 'bread', output: { itemId: 'bread' }, ingredients: [{ itemId: 'wheat', amount: 2 }, { itemId: 'wood', amount: 1 }], seconds: 25 },
    { id: 'corn-chowder', output: { itemId: 'corn-chowder' }, ingredients: [{ itemId: 'corn', amount: 2 }, { itemId: 'milk', amount: 1 }, { itemId: 'wood', amount: 1 }], seconds: 30, tier: 2 },
    { id: 'omelette', output: { itemId: 'omelette' }, ingredients: [{ itemId: 'egg', amount: 2 }, { itemId: 'milk', amount: 1 }, { itemId: 'wood', amount: 1 }], seconds: 22, tier: 2 },
    { id: 'pale-broth', output: { itemId: 'pale-broth' }, ingredients: [{ itemId: 'mushroom', amount: 2 }, { itemId: 'turnip', amount: 1 }, { itemId: 'wood', amount: 1 }], seconds: 28, tier: 2 },
    { id: 'pumpkin-pie', output: { itemId: 'pumpkin-pie' }, ingredients: [{ itemId: 'pumpkin', amount: 1 }, { itemId: 'egg', amount: 1 }, { itemId: 'wheat', amount: 1 }, { itemId: 'wood', amount: 1 }], seconds: 40, tier: 3 },
    { id: 'hollow-stew', output: { itemId: 'hollow-stew' }, ingredients: [{ itemId: 'pumpkin', amount: 1 }, { itemId: 'corn', amount: 1 }, { itemId: 'mushroom', amount: 2 }, { itemId: 'milk', amount: 1 }, { itemId: 'wood', amount: 1 }], seconds: 50, tier: 3 },
];

/** What the bench in the yard makes. */
export const WOODWORK: Recipe[] = [{ id: 'fence-kit', output: { itemId: 'fence-kit' }, ingredients: [{ itemId: 'wood', amount: 3 }], seconds: 8, description: 'Cheaper than the store.' }];

/** What the shipping bin takes: produce and dishes, not tools or seeds. */
export const SHIPPABLE = new Set(ITEMS.filter((item) => item.category === 'treasure' || item.category === 'consumable' || item.id === 'wood').map((item) => item.id));
