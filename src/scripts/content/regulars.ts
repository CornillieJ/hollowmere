import type { Recipe } from '../game/crafting';

/**
 * What each villager wants again and again, what they teach, and what they do
 * for a friend.
 *
 * - From 1 heart they keep a regular order: their favourite, every few days.
 * - At 2 hearts they will say what they really like to eat, and how it is made.
 *   From then on the regular order is for that dish, and pays more.
 * - At 3 hearts they do the farmer a favour that lasts.
 *
 * The same writing rules as the rest of the village: warm, and a little wrong.
 */
export type Regular = {
    id: string;
    /** What the regular order is for before they have taught their own dish. */
    favourite: string;
    amount: number;
    /** Days between one order being filled and the next coming round. */
    every: number;
    /** The dish they teach at 2 hearts. Its item is in `content/items.ts`. */
    teaches: Recipe;
    teachLabel: string;
    teachLines: string[];
    /** The favour at 3 hearts. */
    favour: { id: Favour; title: string; text: string; label: string; lines: string[] };
    /** Said when the regular order is handed over. */
    thanks: string[];
    /** Said in the farmer's own voice when the order first comes round. */
    asks: string;
};

export type Favour = 'ledger' | 'seeds' | 'shortcut' | 'cosy' | 'guard';

export const REGULARS: Regular[] = [
    {
        id: 'barnaby',
        favourite: 'bread',
        amount: 2,
        every: 3,
        teaches: { id: 'counted-biscuits', output: { itemId: 'counted-biscuits', amount: 2 }, ingredients: [{ itemId: 'wheat', amount: 2 }, { itemId: 'egg', amount: 1 }, { itemId: 'wood', amount: 1 }], seconds: 24, description: 'Barnaby taught you. Makes 2.' },
        teachLabel: 'Ask what he eats himself',
        teachLines: [
            'Biscuits. Twelve to a tray, and I count them in and I count them out. It is a comfort to have something that adds up.',
            'Two measures of wheat, one egg, and do not let them brown: brown ones look like they are thinking.',
            'There. Now you know. Bring me a couple when the order comes round and I will write you down in the good ink.',
        ],
        favour: {
            id: 'ledger',
            title: 'In the green book',
            text: 'The collection crate at your door now pays the full stall price.',
            label: 'Ask about the green book',
            lines: [
                'The green book is for people I do not expect to lose. It is a short book.',
                'I have moved you into it. So: no more of this knocking a fifth off at your crate. What goes in the box at your door is paid as if you had stood at my counter.',
                'Do not make me rule you out again. I have only the one green book.',
            ],
        },
        thanks: ['Two, and counted. You are as regular as the walkers, and I mean that kindly.', 'On the day, to the hour. I shall put a tick. I like putting ticks.'],
        asks: 'Barnaby wants bread from me every few days now. A regular order. He wrote it in a book while I stood there.',
    },
    {
        id: 'wren',
        favourite: 'boiled-egg',
        amount: 2,
        every: 3,
        teaches: { id: 'turnip-mash', output: { itemId: 'turnip-mash' }, ingredients: [{ itemId: 'turnip', amount: 3 }, { itemId: 'milk', amount: 1 }, { itemId: 'wood', amount: 1 }], seconds: 22, description: 'Wren taught you.' },
        teachLabel: 'Ask what her favourite is',
        teachLines: [
            'Mash! Turnip mash, with milk in, so it is the same colour all the way through. Mum made it every night until she stopped.',
            'Three turnips and some milk and you squash it until it stops looking like turnips. That is the whole secret. I am very good at secrets.',
            'If you make it I will eat half and bury half, same as always. The buried half is for the one who cannot come to the door.',
        ],
        favour: {
            id: 'seeds',
            title: 'Half for you',
            text: 'Every morning Wren leaves a few seeds on your doorstep.',
            label: 'Ask what she does with the buried half',
            lines: [
                'It comes up! Not as mash. As other things. I dig where I buried it and there are seeds, lots, all different.',
                'I have too many now. So I am going to leave some on your step every morning, before you are awake. I am very quiet. You will not hear me. Nobody ever does.',
                'Half for me, half for you. That is how you say you are friends properly.',
            ],
        },
        thanks: ['Both of them! Still looking at me! Thank you thank you.', 'You came on the right day. I waited by the gate since it got light, so I know.'],
        asks: 'Wren wants 2 boiled eggs every few days. She says it is a rule now, and that rules are how you know somebody is staying.',
    },
    {
        id: 'fen',
        favourite: 'turnip-soup',
        amount: 1,
        every: 3,
        teaches: { id: 'postmans-loaf', output: { itemId: 'postmans-loaf' }, ingredients: [{ itemId: 'wheat', amount: 3 }, { itemId: 'egg', amount: 1 }, { itemId: 'wood', amount: 1 }], seconds: 30, description: 'Fen taught you.' },
        teachLabel: 'Ask what he takes on his round',
        teachLines: [
            'A loaf. A dense one, with an egg in the dough, so it does not go stale between the first house and the last. My round is longer than the valley is. Do not ask me how.',
            'Three of wheat, one egg. Bake it until it sounds hollow when you knock. Everything here does, in the end, but the loaf is meant to.',
            'I would take one of those over soup any day. I only asked for soup because it was the last thing I remembered wanting.',
        ],
        favour: {
            id: 'shortcut',
            title: 'The short way round',
            text: 'A delivery now takes 2 hours of the day, not 3.',
            label: 'Ask about his round',
            lines: [
                'There is a way through the village that is shorter than the village. I found it the week the houses moved. Between the third door and the third door.',
                'I will show you. Do not look at the windows while you are on it. They are not this village\'s windows.',
                'It saves an hour on every call. I have never told anyone. There was never anyone still delivering by the time I trusted them.',
            ],
        },
        thanks: ['On the day. Signed for. You have no idea how rare that is, here.', 'Thank you. That is one thing this week that came to the door it was meant for.'],
        asks: 'Fen wants soup brought round every few days. A standing order, he called it. He looked relieved to have something to stand on.',
    },
    {
        id: 'hollis',
        favourite: 'turnip-soup',
        amount: 1,
        every: 3,
        teaches: { id: 'warm-milk', output: { itemId: 'warm-milk', amount: 2 }, ingredients: [{ itemId: 'milk', amount: 1 }, { itemId: 'wood', amount: 1 }], seconds: 12, description: 'Mother Hollis taught you. Makes 2.' },
        teachLabel: 'Ask what she would like best',
        teachLines: [
            'Oh, only warm milk, dear. I have not the teeth for more, nor the eyes to see what I am chewing.',
            'Heat it until the skin comes and no further. Then one cup for whoever is awake and one for whoever is not.',
            'I leave the second cup on the sill. In the morning it is empty and the cup has been washed. Such nice manners, for a thing with no mouth.',
        ],
        favour: {
            id: 'cosy',
            title: 'A knitted cosy',
            text: 'Your dishes stay hot, and then warm, half as long again.',
            label: 'Ask what she is knitting',
            lines: [
                'This one is yours, dear. A cosy for your pot and your basket. Unravelled from a shawl nobody came back for, so it is good wool and it knows the way.',
                'Wrap what you cook in it and it will still be hot when you get where you are going. I have put a stitch in for every door in the village.',
                'There is one stitch over. I do not know whose door that is. I expect you will find out before I do.',
            ],
        },
        thanks: ['Bless you, dear, right on the day. I knew by the kettle. It sings flat when you are coming.', 'There you are. I had the bowl out already. I always do, and now I am always right.'],
        asks: 'Mother Hollis wants a bowl of soup every few days. She said she would know the day by her kettle.',
    },
    {
        id: 'pike',
        favourite: 'boiled-egg',
        amount: 2,
        every: 3,
        teaches: { id: 'corn-cakes', output: { itemId: 'corn-cakes', amount: 2 }, ingredients: [{ itemId: 'corn', amount: 2 }, { itemId: 'egg', amount: 1 }, { itemId: 'wood', amount: 1 }], seconds: 26, description: 'Pike taught you. Makes 2.' },
        teachLabel: 'Ask what the best food is',
        teachLines: [
            'CORN CAKES. Flat ones! You can carry four in your mouth if you do not breathe. I have tested it.',
            'Corn and an egg, squashed, on the hot bit of the pot. Mister Pell made them. He made them the last morning too, and left them on the sill, and nobody was allowed to eat them. I ate them.',
            'If you make them I will know from the other side of the square. I will already be on my way.',
        ],
        favour: {
            id: 'guard',
            title: 'Walked home',
            text: 'Hot food on you smells only half as strong to them.',
            label: 'Ask why he follows you to the gate',
            lines: [
                'I am walking you home! A bit of the way. I do it for the ones I like. I rub against your basket so it smells of me and not of dinner.',
                'They do not come for dog. I do not know why. Barnaby says it is because I already look at them with all of my eyes.',
                'So now you smell a bit of me, always. You are welcome. It does not wash off. I have checked on the others.',
            ],
        },
        thanks: ['On the DAY. You remembered the day! I am going to do a lap of the square.', 'Two! Still warm! I knew it was today, I have been sitting facing your road since yesterday.'],
        asks: 'Pike wants 2 boiled eggs every few days. He has decided it is a tradition. It has happened once.',
    },
];
