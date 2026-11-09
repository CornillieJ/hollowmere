import type { FolkSpec } from './folk';
import type { RequestTemplate } from '../game/requests';
import type { VillagerContext } from '../kit';

/**
 * The village. Everyone is pleasant, everyone is a little wrong, and nobody ever
 * says the walkers are a problem. That gap is the whole tone of the game.
 */
export type VillagerContent = {
    id: string;
    name: string;
    portrait: string;
    look: FolkSpec;
    /** Where they stand, relative to the village centre. */
    spot: { x: number; z: number; yaw: number };
    lines: (context: VillagerContext) => string[];
    loves: string[];
    likes: string[];
    dislikes: string[];
};

export const VILLAGERS: VillagerContent[] = [
    {
        id: 'barnaby',
        name: 'Barnaby',
        portrait: '🐐',
        look: { species: 'goat', fur: 0xc9bfae, clothes: 0x3d4a3a, eyes: 'stitched', height: 1.75 },
        spot: { x: -6, z: 4, yaw: Math.PI / 2 },
        lines: ({ hearts }) => [
            'Store is open. Store is always open. Seeds, fence kits, candles.',
            'The walkers took my left eye in the spring. Lovely spring, that was.',
            'If they lean on your fence, they are only curious. Mostly curious.',
            hearts >= 2 ? 'You come back every day. Most new farmers stop coming back around the second week.' : 'You are the new one at the old Pell place. Nice house. Good door.',
            'Fog is thick today. It is thick every day. I find it cosy.',
        ],
        loves: ['pumpkin', 'milk'],
        likes: ['corn', 'bread'],
        dislikes: ['egg'],
    },
    {
        id: 'wren',
        name: 'Wren',
        portrait: '🐰',
        look: { species: 'rabbit', fur: 0xd8cfc4, accent: 0xe8a8a8, clothes: 0x7a5a6a, missingArm: 'left', height: 1.45 },
        spot: { x: 5, z: 7, yaw: -Math.PI / 3 },
        lines: ({ hearts }) => [
            'Hi! Sorry, I can only wave with the one. It saves time, really.',
            'Mum says not to stand still near the hedges after dark. I forget why.',
            'I counted eleven walkers by the chapel this morning. A new record!',
            hearts >= 3 ? 'You are my favourite. Do not tell the others. They would not mind. They do not mind anything.' : 'Do you like eggs? I like eggs. Shells and all.',
            'If you hear knocking at night, do not answer. It is rude to answer.',
        ],
        loves: ['egg', 'turnip'],
        likes: ['bread', 'candle'],
        dislikes: ['corn'],
    },
    {
        id: 'fen',
        name: 'Fen',
        portrait: '🦊',
        look: { species: 'fox', fur: 0xb8622e, clothes: 0x2e3a52, neck: 3.2, headTilt: 0.25 },
        spot: { x: 9, z: -4, yaw: -Math.PI / 2 },
        lines: () => [
            'Post is late. The road was busy. By busy I mean the dead were on it again.',
            'My neck? It was always like this. Was it not always like this?',
            'Bike is the way to travel. They are slow. You are not. Simple.',
            'The chapel on the road is lit all night. Stop there if you are tired. Or followed.',
            'I deliver to everyone. Even the houses nobody lives in any more.',
        ],
        loves: ['corn', 'candle'],
        likes: ['turnip', 'milk'],
        dislikes: ['pumpkin'],
    },
    {
        id: 'hollis',
        name: 'Mother Hollis',
        portrait: '🐑',
        look: { species: 'sheep', fur: 0x3a3632, clothes: 0x6a6a5a, eyes: 'hollow', height: 1.55 },
        spot: { x: -2, z: -9, yaw: 0 },
        lines: () => [
            'Keep a candle lit, dear. Not for them. For you.',
            'The shrine keeps them back. It always has. Do not ask what it costs.',
            'My eyes went dark years ago. I see well enough. I see you.',
            'They were all somebody, once. Now they are only hungry. Like the rest of us.',
            'Milk, if you have it. The cows here are very honest.',
        ],
        loves: ['milk', 'bread'],
        likes: ['egg', 'turnip'],
        dislikes: ['candle'],
    },
    {
        id: 'pike',
        name: 'Pike',
        portrait: '🐕',
        look: { species: 'dog', fur: 0x8a6a48, clothes: 0x5a3a2a, eyes: 'extra', height: 1.4 },
        spot: { x: 3, z: -2, yaw: Math.PI },
        lines: ({ hearts }) => [
            'I see them before anyone. I see a lot of things before anyone.',
            'You smell like the farm. And like them, a little. That is normal here.',
            'Want to see my rock collection? Some of them blink.',
            hearts >= 2 ? 'You are brave. Or new. Same thing, here.' : 'Hi! Hi. Hello. Are you staying? People never stay.',
            'Pumpkins are best. They look back at you.',
        ],
        loves: ['pumpkin', 'egg'],
        likes: ['corn'],
        dislikes: ['milk'],
    },
];

/** Errands villagers ask for: the delivery side of the game. */
export const REQUESTS: RequestTemplate[] = [
    { itemId: 'turnip', amount: [2, 4], pricePerItem: 20, days: 3, text: 'Could you bring me {amount} {item}? For soup. Just soup.' },
    { itemId: 'corn', amount: [2, 3], pricePerItem: 34, days: 4, text: 'I need {amount} {item}. Do not ask about the scarecrow.' },
    { itemId: 'pumpkin', amount: 1, pricePerItem: 70, days: 4, text: 'One pumpkin. A big one. With a kind face, if it has one.' },
    { itemId: 'egg', amount: [2, 3], pricePerItem: 22, days: 2, text: '{amount} eggs, please. Fresh. Before they stop being eggs.' },
    { itemId: 'milk', amount: [1, 2], pricePerItem: 40, days: 3, text: '{amount} {item}, if the cow is willing.' },
];
