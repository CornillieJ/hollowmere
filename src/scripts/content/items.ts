import type { ItemDefinition } from '../game/items';

/**
 * Everything that can be carried. Seeds and tools have no `use` handler: the
 * hotbar hands them to the game, which decides what a hoe or a watering can does
 * where the player stands. Food has one, so the bag can eat it directly.
 */
export const ITEMS: ItemDefinition[] = [
    { id: 'watering-can', name: 'Watering can', icon: '🚿', category: 'tool', maxStack: 1, description: 'Water a planted plot. Watered crops grow twice as fast that day.' },
    { id: 'fence-kit', name: 'Fence kit', icon: '🪵', category: 'tool', price: 6, description: 'A length of fence. Holds the walkers back for a while. Nothing holds them for long.' },
    { id: 'turnip-seed', name: 'Turnip seeds', icon: '🌱', category: 'material', price: 4, description: 'Quick to grow. Pale inside.' },
    { id: 'corn-seed', name: 'Corn seeds', icon: '🌾', category: 'material', price: 6 },
    { id: 'pumpkin-seed', name: 'Pumpkin seeds', icon: '🎃', category: 'material', price: 9, description: 'Slow. The pumpkins here grow faces on their own.' },
    { id: 'turnip', name: 'Turnip', icon: '🥬', category: 'treasure', price: 12 },
    { id: 'corn', name: 'Corn', icon: '🌽', category: 'treasure', price: 22 },
    { id: 'pumpkin', name: 'Pumpkin', icon: '🎃', category: 'treasure', price: 40 },
    { id: 'egg', name: 'Egg', icon: '🥚', category: 'treasure', price: 14, description: 'Still warm. Do not shake it.' },
    { id: 'milk', name: 'Milk', icon: '🥛', category: 'treasure', price: 26, description: 'Slightly grey.' },
    {
        id: 'bread',
        name: 'Bread',
        icon: '🍞',
        category: 'consumable',
        price: 10,
        description: 'Restores 30 health.',
        use: { onUse: ({ game }) => game?.player?.heal(30), cooldown: 1 },
    },
    { id: 'candle', name: 'Grave candle', icon: '🕯', category: 'treasure', price: 18, description: 'Old Hollis sells these. Everyone keeps one lit.' },
];

/** What the general store stocks. */
export const STORE_STOCK = ['turnip-seed', 'corn-seed', 'pumpkin-seed', 'fence-kit', 'bread', 'candle'];

/** Seed item to crop id, for planting from the hotbar. */
export const SEED_TO_CROP: Record<string, string> = { 'turnip-seed': 'turnip', 'corn-seed': 'corn', 'pumpkin-seed': 'pumpkin' };
