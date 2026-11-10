import { addStoryline, type NarrationHandle, type StorylineHandle, type StoryStep } from '../kit';
import { FARM, VILLAGE } from '../content/world';

/**
 * The first day, as a chain of small jobs, told by the farmer thinking aloud.
 *
 * A farmer wakes on a farm that is not theirs, under a sky that is not right,
 * and does the only sensible thing: gets to work. Each step teaches one thing
 * the game is built on, in the order a day needs them.
 */
export type StoryFacts = {
    planted: () => number;
    watered: () => number;
    wood: () => number;
    harvested: () => number;
    cooked: () => number;
    metShopkeeper: () => boolean;
    delivered: () => number;
    day: () => number;
    lettersRead: () => number;
    lettersTotal: number;
    placesFound: () => number;
    potTier: () => number;
    bestHearts: () => number;
    metPell: () => boolean;
    reward: (coins: number) => void;
};

/**
 * How the lines are written: what the farmer thinks comes first, in their own
 * voice, and what to press follows in brackets. Lines a step opens with are
 * shown in the dialogue box, so they are read; `after` lines are passing
 * thoughts and may be missed without harm.
 */
export const INTRO = [
    '...This is not my bed. This is not my farm.',
    'Last night I fell asleep in my own house. I am a farmer. That much I still know.',
    'Now there is fog up to the fence, and shapes standing in it that do not move like people.',
    'I see no road home. So: food first, answers later.',
    'Let me look around. (Walk with WASD, look with the mouse, hold Shift to run. On the compass at the top, ➤ is where to go next.)',
];

export function setupStory(game: Game, narration: NarrationHandle, facts: StoryFacts): StorylineHandle {
    const startDay = facts.day();
    const farFrom = (spot: { x: number; z: number }, distance: number): boolean => {
        const player = game.player?.position;
        return player !== undefined && Math.hypot(player.x - spot.x, player.z - spot.z) > distance;
    };

    const steps: StoryStep[] = [
        {
            id: 'wake',
            objective: 'Look around the farm',
            detail: 'Walk with WASD, look with the mouse. Hold Shift to run. The ➤ on the compass points at the next job.',
            done: () => farFrom(FARM.door, 7),
        },
        {
            id: 'plant',
            objective: 'Plant 3 seeds in the field',
            detail: 'Stand at an empty plot and press E, or hold E and walk along the row. The seeds in your hand are used, or else the first seeds in your pockets.',
            say: ['A field, just north of the house. Good dark soil.', 'I have turnip and wheat seeds in my pockets. I will plant 3 of them. (Stand at a plot and press E. Hold E and walk to work down a row. The number keys or the wheel pick which seeds.)'],
            done: () => facts.planted() >= 3,
            progress: () => `${Math.min(3, facts.planted())}/3`,
        },
        {
            id: 'water',
            objective: 'Water what you planted',
            detail: 'Press E at a planted plot, or hold E and walk along the row. A watered crop grows twice as fast that day.',
            say: ['Planted. Now they need water, or they will take all day.', '(Press E at each planted plot, or hold it and walk. The watering can comes to hand by itself.)'],
            done: () => facts.watered() >= 3,
            progress: () => `${Math.min(3, facts.watered())}/3`,
        },
        {
            id: 'chop',
            objective: 'Chop a dead tree for firewood',
            detail: 'Press E at a dead tree, four times. The three at the west edge of the yard are closest.',
            say: ['They need a few minutes to grow. Meanwhile I need firewood to cook with.', 'The dead trees at the west edge of the yard will do. (Press E at a tree, 4 times. The axe comes to hand by itself.)'],
            done: () => facts.wood() >= 1,
            after: ['Something is standing out among the trees, watching. It has not moved.'],
        },
        {
            id: 'harvest',
            objective: 'Pick 2 ripe crops',
            detail: 'A ripe crop stands tall and pale. Press E to pick it. It gives a seed back, sometimes two.',
            say: ['Firewood. Back to the field: the crops should be about ready.', '(A ripe crop stands tall and pale. Press E to pick it. I need 2.)'],
            done: () => facts.harvested() >= 2,
            progress: () => `${Math.min(2, facts.harvested())}/2`,
        },
        {
            id: 'cook',
            objective: 'Cook a dish at the fire by the house',
            detail: 'Press E at the pot. Turnip soup takes 2 turnips and 1 wood; bread takes 2 wheat and 1 wood. Wait, then take it.',
            say: [
                'Ripe in minutes. Nothing grows that fast at home. Never mind.',
                'There is a pot over the fire by the house. Time to cook. (Press E at the pot and choose a recipe: soup takes 2 turnips and 1 wood, bread 2 wheat and 1 wood. Wait, then press E to take it.)',
            ],
            done: () => facts.cooked() >= 1,
            reward: () => facts.reward(10),
        },
        {
            id: 'ride',
            objective: 'Ride the bicycle up the road to the village',
            detail: 'Press E at the bicycle by the porch. W pedals, A and D steer, E gets off. Follow the brown road north east: the 🕯 on the compass is the village.',
            say: [
                'Hot food, and more than I need. If anyone lives along that road, they might pay for it.',
                'There is a bicycle by the porch. Faster than walking, and faster than whatever is in the fog. (Press E to get on. W pedals, A and D steer. Follow the brown road to the 🕯 on the compass.)',
            ],
            done: () => !farFrom(VILLAGE.center, VILLAGE.wallRadius - 2),
        },
        {
            id: 'meet',
            objective: 'Talk to Barnaby, the shopkeeper',
            detail: 'Barnaby stands by his store on the west side of the square. He sells seeds, and his order book sells land, pots and animals.',
            say: ['A village. Lamps. People. ...Mostly people.', 'The goat by the store looks like he runs the place. I will start with him. (Walk up to him and press E.)'],
            done: facts.metShopkeeper,
        },
        {
            id: 'deliver',
            objective: 'Bring a villager what they ask for',
            detail: 'A ! marks someone with a request. Talk to them to hear it, come back with the goods, and choose "Hand over". Press J for the list.',
            say: [
                'He talks about staying indoors after dark as if it were only good manners. Nobody here says what is out there.',
                'The ones with a ! over their head want something from me. (Talk to them to hear what, come back with it, and choose "Hand over". J opens my notebook, which lists who wants what.)',
            ],
            done: () => facts.delivered() >= 1,
            reward: () => facts.reward(15),
        },
        {
            id: 'sleep',
            objective: 'Go home and sleep before dark',
            detail: 'Press E at the farmhouse door. Sleeping ends the day and saves. More of them walk at night.',
            say: [
                'Paid. So that is the work: grow it, cook it, bring it to whoever asks.',
                'The light is going, and there are more of them at night. Home, and the door shut behind me. (Press E at the farmhouse door to sleep. Sleeping saves the game.)',
            ],
            done: () => facts.day() > startDay,
            after: ['One day survived. I still do not know how I came here. But I know how to last.'],
        },

        // The days after: no more lessons, only reasons to keep going.
        {
            id: 'mailbox',
            objective: 'Check the mailbox by the porch',
            detail: 'A letter is waiting when the ✉ shows over the mailbox, beside the farmhouse door. One comes each morning for a while.',
            say: ['Something is in the mailbox by the door. Nobody knows I am here. (Press E at the mailbox.)'],
            done: () => facts.lettersRead() >= 1,
        },
        {
            id: 'regular',
            objective: 'Fill 3 requests',
            detail: 'Every 3 deliveries the village starts asking for better things, which pay more. The notebook lists who wants what.',
            say: ['The village pays well for what it asks for. Every request has a day it is due: miss it and they stop waiting.', 'They mean to keep me, I think. Then I had better be worth keeping. (Fill 3 requests. J lists them.)'],
            done: () => facts.delivered() >= 3,
            progress: () => `${Math.min(3, facts.delivered())}/3`,
            reward: () => facts.reward(30),
        },
        {
            id: 'pot',
            objective: "Buy the iron pot from Barnaby's order book",
            detail: 'The order book stands beside the store counter. The iron pot costs 180c and cooks chowder, omelettes and pale broth.',
            say: ['They ask for cooked food now, and a clay pot only goes so far.', "Barnaby's order book stands beside his counter. The iron pot is 180c. (Press E at the book.)"],
            done: () => facts.potTier() >= 2,
        },
        {
            id: 'wander',
            objective: 'Follow the thin paths: find 3 places',
            detail: 'Footpaths leave the road for the mere (east), the lookout (west), the standing stones (south of the farm), a ruined farm (north of the chapel) and the graveyard (behind the village).',
            say: ['Fen says the thin paths off the road all go somewhere. I should know what is in this valley with me. (Find 3 of the places they lead to.)'],
            done: () => facts.placesFound() >= 3,
            progress: () => `${Math.min(3, facts.placesFound())}/3`,
        },
        {
            id: 'friend',
            objective: 'Make a friend: 2 hearts with anyone',
            detail: 'Talk to someone every day, ask about things, and bring what they ask for. The hearts show when you talk.',
            say: ['These people are strange. They are also all I have.', 'I should make a friend of one. (Talk to someone every day, ask them about things, bring what they ask for. 2 hearts.)'],
            done: () => facts.bestHearts() >= 2,
            after: ['A friend. Here. I did not expect to be glad of it.'],
        },
        {
            id: 'letters',
            objective: 'Read every letter',
            detail: 'One arrives each morning until there are no more.',
            done: () => facts.lettersRead() >= facts.lettersTotal,
            progress: () => `${facts.lettersRead()}/${facts.lettersTotal}`,
        },
        {
            id: 'pell',
            objective: 'Go up the hill to Pell once more',
            detail: 'He stands by the old tree on the lookout hill, up the west path from the chapel. He kept something for you.',
            say: ['The last letter. He kept something of mine, he says.', 'All right, Pell. Once more up the hill. (The west path from the chapel, to the old tree.)'],
            done: facts.metPell,
            after: ['My name. In my own hand. I do not remember writing it.', 'I will read it every morning. And I will stay. There are worse neighbours.'],
        },
    ];

    return addStoryline(game, { steps, narration, spoken: true });
}
