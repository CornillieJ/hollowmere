import type { FolkSpec } from './folk';
import type { RequestTemplate } from '../game/requests';
import type { VillagerContext, VillagerTopic } from '../kit';

/**
 * The village. Everyone is kind, and means it. Everyone is also a little wrong,
 * and nobody ever says the walkers are a problem. The gap between how gently
 * they speak and what they are actually saying is the whole tone of the game.
 *
 * Writing rules for anyone adding lines:
 *  - They like the player. The warmth is real, never a trick.
 *  - The unsettling part is said in passing, as something ordinary.
 *  - Nobody explains. Nobody is afraid. Nobody calls the Hollow dangerous.
 *  - Topics open up with hearts: the closer the friendship, the stranger the truth.
 */
export type VillagerContent = {
    id: string;
    name: string;
    portrait: string;
    look: FolkSpec;
    /** Where they stand, relative to the village centre. */
    spot: { x: number; z: number; yaw: number };
    /** Index of their house in `VILLAGE.houses`. Barnaby has none: the store never closes. */
    home?: number;
    /** The hours they come out to the square and go home again. */
    hours?: [number, number];
    lines: (context: VillagerContext) => string[];
    topics: VillagerTopic[];
    thanks: string[];
};

export const VILLAGERS: VillagerContent[] = [
    {
        // The shopkeeper. Careful, fatherly, counts everything. Keeps a ledger of the living.
        id: 'barnaby',
        name: 'Barnaby',
        portrait: ':face-barnaby:',
        look: { species: 'goat', fur: 0xc9bfae, clothes: 0x3d4a3a, eyes: 'stitched', height: 1.75 },
        spot: { x: -6, z: 4, yaw: Math.PI / 2 },
        lines: ({ hearts, day }) => [
            'Store is open. Store is always open. I do not remember closing it, so it must be.',
            `Day ${day} for you here. I wrote it down. I write everyone's days down, it is only polite.`,
            'If they lean on your fence, they are only curious. Mostly curious.',
            ...(day >= 2 ? ["I see you have the dog. Pell's dog. Or the one before Pell's. They do not age, that sort."] : []),
            hearts >= 2 ? 'You came back again. I set a cup out for you this morning before I knew you would. That is how I knew you would.' : 'You are the new one at the old Pell place. Nice house. Good strong door. You will want the door.',
            'The Veil is thick today. That is what we call the fog here; you will pick it up. I find it cosy, like a blanket somebody else is also under.',
            hearts >= 3 ? 'I worry when you are late. Then I check the ledger, and your name is still in the right book, and I can breathe.' : 'Eat something warm before the walk home. A full stomach walks faster. I have noticed that about people.',
            'I have been short one customer since the spring. I keep their order on the shelf. It would be rude not to.',
        ],
        topics: [
            {
                id: 'missing',
                label: 'Ask who has not been in',
                minDay: 3,
                lines: ({ day }) => [
                    day >= 7 ? 'Seven names moved this week. I have had to rule new lines in the black book. I do not like ruling new lines.' : 'The Marlow boy did not come for his milk. Nor the day before. I have moved him to the other book, in pencil for now.',
                    day >= 5 ? 'Old Tansy from the mill went out for kindling and her basket came back without her. It is on my shelf. Somebody may want it.' : 'His mother says he is visiting. She has set his place at table every night since. One sets a place for visitors, I suppose.',
                    'It is always worst out on the open ground by the road. I would keep to the brown, and I would not stop to look at anything lying on it.',
                ],
            },
            {
                id: 'store',
                label: 'Ask about the store',
                lines: [
                    'Seeds and candles on the counter. Bigger things go in the order book: land, a better pot, animals. I write them down and they arrive. I do not ask how.',
                    'I buy what you grow, too. Half price. I am fond of you, not foolish.',
                    'Folk who ask for food pay far better than I do. Do not tell them I said so. They do not count the way I count.',
                ],
            },
            {
                id: 'cart',
                label: 'Ask about the cart on the road',
                minDay: 3,
                lines: [
                    'A cart? On that road? No one comes up that road.',
                    'I would not buy from anyone who did. And if they paid you, count it again at home. In the light.',
                ],
            },
            {
                id: 'eye',
                label: 'Ask about his eye',
                minHearts: 1,
                lines: [
                    'This? One of the walkers wanted it, back in the spring. Very insistent fellow. Used to be the baker.',
                    'I stitched it shut myself. Neat work, do you not think? Wren says it looks like a little smile.',
                    'He still comes by the window some nights and holds it up, so I can see the shop. That is thoughtful, in its way.',
                ],
            },
            {
                id: 'farmer',
                label: 'Ask about the last farmer',
                minHearts: 2,
                lines: [
                    'Old Pell. Good with turnips. Quiet. Paid on time, which I respect in anyone.',
                    'Then one week he bought every candle I had and stopped buying seed. That is the wrong way round, for a farmer.',
                    'I moved his name to the other book in the autumn. He still owes me for the candles. I have not liked to ask.',
                ],
            },
            {
                id: 'ledger',
                label: 'Ask about the ledgers',
                minHearts: 3,
                lines: [
                    'Two books. The green one is everyone who comes in. The black one is everyone who used to.',
                    'Some mornings a name has moved from one to the other in my own handwriting, and I do not recall doing it.',
                    'Yours is in the green one. I check it first thing. I have pressed a flower on your page, I hope that is not too forward.',
                ],
            },
            {
                id: 'night',
                label: 'Ask what to do at night',
                lines: [
                    'Oh, it is best to stay indoors after dark. Or to keep to the lit places: the chapel on the road, the shrine in the square, your own porch.',
                    'Nobody will tell you that you must. It is only the polite way to live here. One does not go wandering about in the dark, any more than one reads over a shoulder.',
                    'And if you should find you have company on the road, simply keep walking. No need to be rude about it. No need to stop, either.',
                ],
            },
        ],
        thanks: ['Exactly what I asked for, and counted right. You are a pleasure to do business with.', 'I will mark it in the green book. In ink.', 'Thank you. I will save the best of it for whoever comes by the window tonight.'],
    },
    {
        // A child, more or less. Sunny, proud of small things, says the worst of it most cheerfully.
        id: 'wren',
        name: 'Wren',
        portrait: ':face-wren:',
        look: { species: 'rabbit', fur: 0xd8cfc4, accent: 0xe8a8a8, clothes: 0x7a5a6a, missingArm: 'left', height: 1.45 },
        spot: { x: 5, z: 7, yaw: -Math.PI / 3 },
        home: 0,
        hours: [7.5, 18.5],
        lines: ({ hearts, day }) => [
            'Hi! Sorry, I can only wave with the one. It saves time, really.',
            ...(day >= 2 ? ['You found him! He always goes to whoever is at that farm. He waits on the porch until somebody wakes up in there.'] : []),
            'I counted eleven walkers by the chapel this morning. A new record! I gave them all names. Three of them already had names.',
            'Mum says not to stand still near the hedges after dark. I forget why. I think the hedges get lonely.',
            hearts >= 3 ? 'You are my favourite. I told the others. They said that was fine. They say everything is fine.' : 'Are you staying? Please stay. The last one stayed a whole year!',
            'If you hear knocking at night, do not answer. It is rude to answer. They are only practising.',
            hearts >= 2 ? 'I made you a drawing. It is you, at your farm. The ones standing round the edge are just there to keep you company.' : 'Do you like eggs? I like eggs. Shells and all. Mum says that is why my teeth are so good.',
            'I can hold my breath for ages. I practise in case I have to be very quiet. I am the best at it in my whole house.',
        ],
        topics: [
            {
                id: 'missing',
                label: 'Ask about the new walkers',
                minDay: 3,
                lines: ({ day }) => [
                    `There are loads more now! I counted ${10 + day * 2} from the wall this morning. I knew two of them. One still had her apron on.`,
                    'Some of the new ones go on their hands and knees. They are quicker, but they cannot see very far. I do not think they like standing up any more.',
                    day >= 5 ? 'And there are white ones! Tall. They only move when you are not looking. So I look. I am very good at looking. I have not blinked since breakfast.' : 'Mum says more will come. She said it with her eyes shut. She says most things with her eyes shut now.',
                ],
            },
            {
                id: 'arm',
                label: 'Ask about her arm',
                lines: [
                    'Oh, I lent it out! One of them asked so nicely. Well. Pulled so nicely.',
                    'It still waves at me sometimes, from the road. So I wave back. It would be mean not to.',
                    'Mum says I will grow into the other one. I am eating lots so it happens faster.',
                ],
            },
            {
                id: 'mum',
                label: 'Ask about her mum',
                minHearts: 1,
                lines: [
                    'Mum is at home. She is always at home now. She is so good at staying still.',
                    'I bring her soup and tell her about my day and she listens to the whole thing. She never interrupts any more.',
                    'She would like you. I will ask her. I will tell you what she would have said.',
                ],
            },
            {
                id: 'game',
                label: 'Ask what she does for fun',
                minHearts: 2,
                lines: [
                    'There is a game where you stand at the wall at dusk and see who can get a walker to look at them first.',
                    'You are not allowed to make a sound. If it looks at you, you win, and then you run. I always win.',
                    'Pike used to play, but he cannot stop wagging, so they always look at him. It is not really fair on him.',
                ],
            },
            {
                id: 'pool',
                label: 'Ask about the black pool',
                minHearts: 3,
                lines: [
                    'The black pool, down the east path? We do not swim there. It is not deep. It is just that it remembers you.',
                    'I looked in once and there were two of me. The other one was not waving.',
                    'The mushrooms on the shore are fine, though! They make the best broth. They hum if you hold them to your ear.',
                ],
            },
        ],
        thanks: ['You remembered! Nobody ever remembers! Thank you thank you.', 'This is the best day. I am going to tell Mum. She will be so pleased, in her way.', 'I will eat half and bury half. That is how you say thank you properly.'],
    },
    {
        // The postman. Tired, dry, dutiful to a fault. Still delivers to houses nobody lives in.
        id: 'fen',
        name: 'Fen',
        portrait: ':face-fen:',
        look: { species: 'fox', fur: 0xb8622e, clothes: 0x2e3a52, neck: 3.2, headTilt: 0.25 },
        spot: { x: 10, z: 3, yaw: -Math.PI / 2 },
        home: 1,
        hours: [6.5, 20],
        lines: ({ hearts }) => [
            'Post is late. The road was busy. By busy I mean they were standing on it again, facing the wrong way.',
            'Bike is the way to travel. They are slow. You are not. That is the whole of what I know, and it has been enough.',
            'The chapel on the road is lit all night. Stop there if you are tired. Or followed. Or both, it is usually both.',
            hearts >= 2 ? 'I saved you the good stamp. The one with the bird. I do not do that for everyone. I do it for nobody, in fact.' : 'New at the Pell farm. Right. I will stop leaving his letters there, then. Probably.',
            'I deliver to every house. Even the ones nobody lives in. Someone takes the letters in. I have decided not to look into it.',
            hearts >= 3 ? 'You wave when you pass. Do you know how long it is since somebody on that road waved at me on purpose?' : 'Keep to the brown of the road. The grass is fine too. It is the standing still that I would not recommend.',
            'My rounds take an hour longer every month. The road is the same length. I have measured. I would rather not talk about it.',
        ],
        topics: [
            {
                id: 'missing',
                label: 'Ask about the things on the road',
                minDay: 3,
                lines: ({ day }) => [
                    'You have seen them, then. The boot. The basket. I step round. It is not my job to pick things up, only to put things through doors.',
                    day >= 6 ? 'There is more every morning now. I counted four houses on my round with the door standing open and the lamp still lit. I posted the letters anyway.' : 'There was blood by the first bend on Tuesday. By Wednesday somebody had swept it. Nobody here owns up to sweeping.',
                    'If you find a letter out there with no envelope, bring it to me. Do not read it. They are never addressed to the person who finds them, and they are always meant for them.',
                ],
            },
            {
                id: 'neck',
                label: 'Ask about his neck',
                lines: [
                    'My neck? It was always like this. Was it not always like this?',
                    'It is useful, for letterboxes. And for seeing over the Veil. On a clear day I can see myself coming back.',
                    'Mother Hollis says it is still growing. She says it kindly. She says everything kindly, that is how you know to worry.',
                ],
            },
            {
                id: 'paths',
                label: 'Ask where the paths lead',
                lines: [
                    'The thin paths off the road. East goes down to the black pool. West climbs to the old tree, and there is a lamp up there, above the Veil.',
                    'South of your farm there are standing stones, and mushrooms if you want them. North of the chapel is the Aldous farm. Was the Aldous farm.',
                    'Behind the village, the graves. I deliver there too. Less than I used to. They have mostly stopped writing back.',
                ],
            },
            {
                id: 'letters',
                label: 'Ask about the letters',
                minHearts: 1,
                lines: [
                    'There are letters for you, you know. Dated before you came. In a hand I do not recognise, and I know every hand in this valley.',
                    'I have not given them to you. The rule is the name has to match, and the name on them is not quite yours. Close. It is getting closer.',
                    'When it matches, I will bring them. I am sorry in advance.',
                ],
            },
            {
                id: 'farmer',
                label: 'Ask about the last farmer',
                minHearts: 2,
                lines: [
                    'Pell. He got post every day near the end. All the same envelope. No stamp. I never saw who sent them.',
                    'He stopped opening the door, so I pushed them under it. Then one morning they were all pushed back out. Opened. Answered.',
                    'I delivered the answers. That is the job. I should like it noted that I did not read them.',
                ],
            },
            {
                id: 'tired',
                label: 'Ask if he is all right',
                minHearts: 3,
                lines: [
                    'Kind of you. Nobody asks the postman. I am tired, is all. I have been tired since before I can remember being rested.',
                    'Some of the ones on the road, I knew them. I still nod. A few nod back. That is more than I got when they were living.',
                    'If my name ever turns up on a letter with no stamp, do not deliver it. Burn it. Then wave at me on the road anyway. Promise me that.',
                ],
            },
        ],
        thanks: ['Signed for. Thank you. Properly, I mean. Thank you.', 'That is the first thing all week that arrived where it was meant to.', 'Right. Good. I will remember this. I remember all of it, that is rather the problem.'],
    },
    {
        // The elder. Warm as a grandmother, calls everyone dear, and knows exactly what the shrine costs.
        id: 'hollis',
        name: 'Mother Hollis',
        portrait: ':face-hollis:',
        look: { species: 'sheep', fur: 0x3a3632, clothes: 0x6a6a5a, eyes: 'hollow', height: 1.55 },
        spot: { x: -2, z: -9, yaw: 0 },
        home: 2,
        hours: [7, 19],
        lines: ({ hearts }) => [
            'Keep a candle lit, dear. Not for them. For you. So you can find yourself again in the morning.',
            'My eyes went dark years ago. I see well enough. I see you, standing there with your whole heart still in.',
            'They were all somebody, once. Now they are only hungry. Like the rest of us, and with better manners than some.',
            hearts >= 2 ? 'I like you, dear. The last farmer was not as kind as you. So he had to go.' : 'You have a gentle step. I heard you coming from the gate. I hear everyone coming. It gives me time to put the kettle on.',
            'Have you eaten? You are thin. This place likes its people thin, and I will not have it getting its way with you.',
            hearts >= 3 ? 'I am knitting you something. It is nearly long enough. When it is done you will never be cold again, I promise you that.' : 'Milk, if you have it. The cows here are very honest. It is the only thing in the valley that is.',
            'Do sleep at home, dear. In your own bed. It matters whose bed. I will say no more about it.',
        ],
        topics: [
            {
                id: 'missing',
                label: 'Ask about the ones who are gone',
                minDay: 4,
                lines: ({ day }) => [
                    day >= 8 ? 'I have finished six shawls this week, dear. My hands ache. I have never had to knit so fast.' : 'I finished two shawls this week, dear. That is two more than I like to finish.',
                    'They are not lost. Do not think of them as lost. They are only out in the Veil now, on the other side of the wall, and facing the wrong way. We call them the Hollow. It is not unkind. It is only accurate.',
                    'More of them come every day, yes. The valley has been hungry lately. It will pass. It has always passed. Eat your supper and keep your candle lit.',
                ],
            },
            {
                id: 'shrine',
                label: 'Ask about the shrine',
                lines: [
                    'The stone in the square keeps them back. It always has. They will not come inside the candles.',
                    'It asks for very little. A candle. A kind word. Now and then, somebody who was not going to be missed.',
                    'Do not look like that, dear. It has not asked in a long while. And you are going to be missed terribly, I have seen to that.',
                ],
            },
            {
                id: 'eyes',
                label: 'Ask about her eyes',
                minHearts: 1,
                lines: [
                    'I gave them up. Somebody had to see what was coming, and you cannot see that with eyes, dear. You see it with the place where they were.',
                    'It did not hurt. Well. It hurt once, and then it was over, which is the best you can say of most things.',
                    'Would you like to know what I see when I look at you? No. No, you would not. Have a biscuit instead.',
                ],
            },
            {
                id: 'farmer',
                label: 'Ask about the last farmer',
                minHearts: 2,
                lines: [
                    'Pell was not a bad man. He was a frightened one, which is worse for a village. Fear gets into the bread.',
                    'He would not sit with us. Would not light his candle. He looked at poor Wren as though she were something that had happened to him.',
                    'So we talked it over, the five of us, very fairly. And then he went for a walk one evening. That is all. You are so much easier to love, dear.',
                ],
            },
            {
                id: 'knitting',
                label: 'Ask what she is knitting',
                minHearts: 3,
                lines: [
                    'A shawl. One for everybody in the village. Every stitch is a day they have stayed.',
                    'When someone leaves us, I do not unpick theirs. I finish it, and I walk out to the road at dusk, and I put it round their shoulders.',
                    'That is why some of them out there are dressed so warmly. Did you think the dead were cold, dear? Not mine. Never mine.',
                ],
            },
            {
                id: 'home',
                label: 'Ask if she remembers anywhere else',
                minHearts: 4,
                lines: [
                    'Somewhere before this? You do, do you not. I can hear it in how you say "home" and mean two places.',
                    'We all came from somewhere, dear. We all woke up here one morning with dirt under our nails and a job to do.',
                    'It fades. I am sorry. One day you will try to say the name of it and you will say "Hollowveil", and it will feel true. That is not a sad thing. I will be right here when it happens.',
                ],
            },
        ],
        thanks: ['Bless you, dear. Sit a moment. No? Another time. There is always another time, here.', 'You good, good child. I will put a stitch in for this.', 'Lovely. I shall tell the stone you were kind. It likes to know who the kind ones are.'],
    },
    {
        // The dog. Loyal past all sense, adores the player on sight, sees a great deal too much.
        id: 'pike',
        name: 'Pike',
        portrait: ':face-pike:',
        look: { species: 'dog', fur: 0x8a6a48, clothes: 0x5a3a2a, eyes: 'extra', height: 1.4 },
        spot: { x: 3, z: -2, yaw: Math.PI },
        home: 4,
        hours: [8, 19.5],
        lines: ({ hearts }) => [
            'Hi! Hi. Hello. It is you! I knew it was you from the gate. I knew it was you from yesterday.',
            'You smell like the farm. And like them, a little. That is normal here, do not wash it off, it helps.',
            'I see them before anyone does. I see a lot of things before anyone does. I try to only mention the nice ones.',
            hearts >= 2 ? 'I walked behind you some of the way home last night. Not close! Just until the bend. You did not see me. Nobody ever sees the one at the back.' : 'Are you staying? People never stay. I get so fond of them and then they are on the road instead.',
            'Want to see my rock collection? Some of them blink. I only keep the ones that blink back.',
            hearts >= 3 ? 'If you ever go out there, with them, I will still come and find you. Every day. I will bring you things. I am telling you now so you are not scared.' : 'Pumpkins are best. They look back at you. Most food will not do that.',
            'I am a very good boy. Mother Hollis said so. She said it right after, so I know she meant it.',
        ],
        topics: [
            {
                id: 'missing',
                label: 'Ask what he smells on the road',
                minDay: 3,
                lines: ({ day }) => [
                    'Blood. New. And the place where somebody was and then was not. That smell stays for days. It is like a door left open.',
                    day >= 6 ? 'There are so many now that the whole road smells of people I used to know. I say hello to all of them. It takes me ages to get anywhere.' : 'I followed one of the drag marks into the trees. It stopped. It just stopped, in the middle of the ground. I did not dig. I am a good boy.',
                    'The white ones do not smell of anything. That is how I know to turn round.',
                ],
            },
            {
                id: 'eyes',
                label: 'Ask about his eyes',
                lines: [
                    'There were two when I was little! The others came in one at a time. I think they followed me home.',
                    'This one sees you. This one sees where you are going to be. This one I keep shut. It is not for looking at friends with.',
                    'It is fine! It does not hurt. It itches when something is behind you. It is itching a tiny bit now, but do not turn round, it is rude.',
                ],
            },
            {
                id: 'rocks',
                label: 'Ask about the rocks',
                minHearts: 1,
                lines: [
                    'I find them up at the standing stones, south of your farm. Little ones, at the foot of the big ones. They come off in the night.',
                    'If you put one under your pillow you dream about somebody else. I have one for everyone in the village.',
                    'I found a new one last week with nobody in it yet. I am keeping it safe. I am keeping it for you.',
                ],
            },
            {
                id: 'farmer',
                label: 'Ask about the last farmer',
                minHearts: 2,
                lines: [
                    'Mister Pell! I loved Mister Pell. He threw a stick for me once. Only once. I still have it.',
                    'I went with him on his walk, the last night. Everyone said I could. I walked him right to the place and I sat with him until he was not scared any more.',
                    'He is the tall one up on the hill now, by the old tree. He does not chase. If you see him, you can say hello. He likes it when I say hello.',
                ],
            },
            {
                id: 'smell',
                label: 'Ask what he smells on you',
                minHearts: 3,
                lines: [
                    'Somewhere else. A kitchen. A different kind of rain. It is on you like a coat, but it is getting thin at the elbows.',
                    'Everyone has it when they come. Fen had it. Barnaby had it for ages. One day I go to smell it and it is just the Veil, same as the rest of us.',
                    'I have been smelling yours extra hard so I remember it for you. When you forget, ask me. I will tell you what your home was like. I promise I will get it right.',
                ],
            },
        ],
        thanks: ['For me? For ME? I am going to carry it round the whole square first.', 'You are the best one. You are the best one we have ever had, and we have had loads.', 'Thank you! I will guard it. I will guard you. I am already guarding you, actually.'],
    },
];

/**
 * Errands, by tier. The board opens a tier for every few deliveries, and the
 * higher tiers pay far better than the store, so cooking is where the money is.
 * Several are open at once: which to chase is the player's call.
 */
export const REQUESTS: RequestTemplate[] = [
    // Tier 0: straight from the field.
    { itemId: 'turnip', amount: [2, 3], pricePerItem: 18, days: 3, from: ['wren', 'barnaby'], text: 'Could you bring {amount} {item}? For soup. Just soup. I promise it is for soup.' },
    { itemId: 'wheat', amount: [2, 4], pricePerItem: 15, days: 3, from: ['hollis', 'fen'], text: '{amount} {item}, if you would. Bread keeps the house smelling lived in.' },
    { itemId: 'egg', amount: [1, 2], pricePerItem: 26, days: 2, from: ['wren', 'pike'], text: '{amount} of your eggs, please. Fresh. Before they stop being eggs.' },
    { itemId: 'wood', amount: [3, 5], pricePerItem: 9, days: 3, from: ['barnaby', 'hollis'], text: '{amount} pieces of {item} for the fire. The dead trees burn so quietly.' },

    // Tier 1: the clay pot.
    { tier: 1, itemId: 'turnip-soup', amount: [1, 2], pricePerItem: 62, days: 3, from: ['wren', 'hollis'], text: '{amount} {item}, warm if you can. One bowl is for someone who cannot fetch their own.' },
    { tier: 1, itemId: 'bread', amount: [1, 2], pricePerItem: 58, days: 3, from: ['fen', 'barnaby'], text: '{amount} of {item}. I have a long round and nobody on it bakes any more.' },
    { tier: 1, itemId: 'boiled-egg', amount: 2, pricePerItem: 44, days: 2, from: ['pike', 'wren'], text: 'Two of your boiled eggs! I like how they look at you when you peel them.' },
    { tier: 1, itemId: 'milk', amount: [1, 2], pricePerItem: 40, days: 3, from: ['hollis'], text: '{amount} {item}, dear, if the cow is willing. She usually is, for you.' },

    // Tier 2: the iron pot.
    // From here on they want money down first: a third of the pay, back on delivery, kept if the day passes.
    { tier: 2, deposit: 0.33, itemId: 'corn-chowder', amount: 1, pricePerItem: 150, days: 4, from: ['barnaby', 'fen'], text: 'A pot of {item}. I have a guest at the window most nights and nothing to offer him.' },
    { tier: 2, deposit: 0.33, itemId: 'omelette', amount: [1, 2], pricePerItem: 125, days: 3, from: ['wren', 'pike'], text: '{amount} {item}, please! Mum used to make them. She has stopped. She has stopped most things.' },
    { tier: 2, deposit: 0.33, itemId: 'pale-broth', amount: 1, pricePerItem: 135, days: 4, from: ['hollis', 'pike'], text: 'One {item}. The caps grow by the black pool and at the stones. It helps me see, dear.' },
    { tier: 2, deposit: 0.33, itemId: 'pumpkin', amount: 1, pricePerItem: 80, days: 4, from: ['pike'], text: 'One pumpkin. A big one. With a kind face, if it has grown one.' },

    // Tier 3: the cauldron.
    { tier: 3, deposit: 0.33, itemId: 'pumpkin-pie', amount: 1, pricePerItem: 250, days: 4, from: ['wren', 'barnaby', 'fen'], text: 'A whole {item}. It is somebody\'s day. I will not say whose, it would only upset them.' },
    { tier: 3, deposit: 0.33, itemId: 'hollow-stew', amount: 1, pricePerItem: 340, days: 5, from: ['hollis'], text: 'The {item}, dear. The proper one. We have someone to see off, and it should be done right.' },
];
