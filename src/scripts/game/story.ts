import { addStoryline, type NarrationHandle, type StorylineHandle, type StoryStep } from '../kit';
import { FARM, VILLAGE } from '../content/world';
import { worded } from './wording';

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
    noteRead: () => boolean;
    reward: (coins: number) => void;
};

/**
 * How the lines are written: what the farmer thinks comes first, in their own
 * voice, and what to press follows in brackets. Lines a step opens with are
 * shown in the dialogue box, so they are read; `after` lines are passing
 * thoughts and may be missed without harm.
 */
export const INTRO = [
    "...This isn't my bed. This isn't my house.",
    "I went to sleep at home last night. My own farm, my own blankets. I'd swear to it.",
    "And I woke up on somebody else's. There's fog standing at the edge of the yard like a wall, and things in it that are shaped like people and don't move like them.",
    "No road I know. Nobody to ask. All right. A farm is a farm: I get food in the ground first, and I work out the rest on a full stomach.",
    "Let's see what they left me. (Walk with WASD, look with the mouse, hold Shift to run. The :arrow: on the compass at the top shows where to go next.)",
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
            detail: 'Walk with WASD, look with the mouse. Hold Shift to run. The :arrow: on the compass points at the next job.',
            done: () => farFrom(FARM.door, 7),
        },
        {
            id: 'plant',
            objective: 'Plant 3 seeds in the field',
            detail: 'Stand at an empty plot and press E, or hold E and walk along the row. The seeds in your hand are used, or else the first seeds in your pockets.',
            say: ["A field, just north of the house. Dark soil, already turned. Somebody was expecting a farmer.", "Turnip and wheat seeds in my pockets, and I didn't put them there. 3 in the ground, then. (Stand at a plot and press E. Hold E and walk to work down a row. The number keys or the wheel pick which seeds.)"],
            done: () => facts.planted() >= 3,
            progress: () => `${Math.min(3, facts.planted())}/3`,
        },
        {
            id: 'water',
            objective: 'Water what you planted',
            detail: 'Press E at a planted plot, or hold E and walk along the row. A watered crop grows twice as fast that day.',
            say: ["That's them in. They'll want water, or I'll be standing here all day.", '(Press E at each planted plot, or hold it and walk. The watering can comes to hand by itself. It holds 5 waterings: fill it at the well by the house.)'],
            done: () => facts.watered() >= 3,
            progress: () => `${Math.min(3, facts.watered())}/3`,
        },
        {
            id: 'chop',
            objective: 'Chop a dead tree for firewood',
            detail: 'Press E at a dead tree, four times. The three at the west edge of the yard are closest.',
            say: ["Nothing to do now but let them grow. And nothing cooks without a fire.", "Those dead trees at the west edge of the yard will burn. (Press E at a tree, 4 times. The axe comes to hand by itself.)"],
            done: () => facts.wood() >= 1,
        },
        {
            id: 'harvest',
            objective: 'Pick 2 ripe crops',
            detail: 'A ripe crop stands tall and pale. Press E to pick it. It gives a seed back, sometimes two.',
            say: ["That'll burn. Back to the field. I've got a feeling about those seeds.", '(A ripe crop stands tall and pale. Press E to pick it. I need 2.)'],
            done: () => facts.harvested() >= 2,
            progress: () => `${Math.min(2, facts.harvested())}/2`,
        },
        {
            id: 'note',
            objective: 'Read the paper lying by the field',
            detail: 'A sheet of paper lies on the ground just south of the field. Press E to read it. Nobody leaves the farm before it is read.',
            say: ["Ripe in minutes. Nothing grows that fast at home. I'm not going to ask.", "Hold on. There's a paper on the ground at the end of the row. That wasn't there before. (Press E to read it.)"],
            done: facts.noteRead,
        },
        {
            id: 'cook',
            objective: 'Cook a dish at the fire by the house',
            detail: 'Press E at the pot. Turnip soup takes 2 turnips and 1 wood; bread takes 2 wheat and 1 wood. Wait, then take it.',
            say: [
                "Lamps, then. I'll stay near them. And I still haven't eaten.",
                "There's a pot over the fire by the house. (Press E at the pot and choose a recipe: soup takes 2 turnips and 1 wood, bread 2 wheat and 1 wood. Wait, then press E to take it.)",
            ],
            done: () => facts.cooked() >= 1,
            reward: () => facts.reward(10),
        },
        {
            id: 'ride',
            objective: 'Ride the bicycle up the road to the village',
            detail: 'Press E at the bicycle by the porch. W pedals, A and D steer, E gets off. Follow the brown road north east: the :candle: on the compass is the village.',
            say: [
                "Hot food, and more of it than I can eat. If anybody lives up that road, they might pay for some.",
                "There's a bicycle by the porch. Quicker than walking, and quicker than whatever's in the fog. (Press E to get on. W pedals, A and D steer. Follow the brown road to the :candle: on the compass.)",
            ],
            done: () => !farFrom(VILLAGE.center, VILLAGE.wallRadius - 2),
        },
        {
            id: 'meet',
            objective: 'Talk to Barnaby, the shopkeeper',
            detail: 'Barnaby stands by his store on the west side of the square. He sells seeds, and his order book sells land, pots and animals.',
            say: ['A village. Lamps. People. ...Mostly people.', "The goat by the store looks like he runs the place. I'll start with him. (Walk up to him and press E.)"],
            done: facts.metShopkeeper,
        },
        {
            id: 'deliver',
            objective: 'Bring a villager what they ask for',
            detail: 'A ! marks someone with a request. Talk to them to hear it, come back with the goods, and choose "Hand over". Press J for the list.',
            say: [
                "He says to be indoors by dark the way you'd tell someone to wipe their feet. Nobody here will say what's out there.",
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
                "Paid. So that's the job: grow it, cook it, carry it to whoever asks. And every visit eats 3 hours of the day.",
                "The light's going, and there are more of them after dark. Home, and the door shut behind me. (Press E at the farmhouse door to sleep. Sleeping saves the game.)",
            ],
            done: () => facts.day() > startDay,
            after: ["One day done. I still don't know how I got here. But I know how to get through another."],
        },

        // The days after: no more lessons, only reasons to keep going.
        {
            id: 'mailbox',
            objective: 'Check the mailbox by the porch',
            detail: 'A letter is waiting when the :letter: shows over the mailbox, beside the farmhouse door. One comes each morning for a while.',
            say: ["There's something in the mailbox by the door. Nobody knows I'm here. (Press E at the mailbox.)"],
            done: () => facts.lettersRead() >= 1,
        },
        {
            id: 'regular',
            objective: 'Fill 3 requests',
            detail: 'Every 3 deliveries the village starts asking for better things, which pay more. The notebook lists who wants what.',
            say: ["The village pays well for what it asks for. Every request has a day on it: miss the day and they stop waiting.", "I think they mean to keep me. Then I'd better be worth keeping. (Fill 3 requests. J lists them.)"],
            done: () => facts.delivered() >= 3,
            progress: () => `${Math.min(3, facts.delivered())}/3`,
            reward: () => facts.reward(30),
        },
        {
            id: 'pot',
            objective: "Buy the iron pot from Barnaby's order book",
            detail: 'The order book stands beside the store counter. The iron pot costs 180c and cooks chowder, omelettes and pale broth.',
            say: ["They want proper cooking now, and a clay pot only goes so far.", "Barnaby's order book stands beside his counter. The iron pot is 180c. (Press E at the book.)"],
            done: () => facts.potTier() >= 2,
        },
        {
            id: 'wander',
            objective: 'Follow the thin paths: find 3 places',
            detail: 'Footpaths leave the road for the black pool (east), the lookout (west), the standing stones (south of the farm), a ruined farm (north of the chapel) and the graveyard (behind the village).',
            say: ["Fen says the thin paths off the road all go somewhere. I'd like to know what else is in this valley with me. (Find 3 of the places they lead to.)"],
            done: () => facts.placesFound() >= 3,
            progress: () => `${Math.min(3, facts.placesFound())}/3`,
        },
        {
            id: 'friend',
            objective: 'Make a friend: 2 hearts with anyone',
            detail: 'Talk to someone every day, ask about things, and bring what they ask for. The hearts show when you talk.',
            say: ["These people are strange. They're also all I've got.", 'I could do with one friend. (Talk to someone every day, ask them about things, bring what they ask for. 2 hearts.)'],
            done: () => facts.bestHearts() >= 2,
            after: ["A friend. Here, of all places. I didn't expect to be glad of it."],
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
            say: ['The last letter. He says he kept something of mine.', 'All right, Pell. Once more up the hill. (The west path from the chapel, to the old tree.)'],
            done: facts.metPell,
            after: ["My name. In my own hand. I don't remember writing it.", "I'll read it every morning. And I'll stay. There are worse neighbours."],
        },
    ];

    const say = worded(game);
    for (const step of steps) {
        if (typeof step.detail === 'string') step.detail = say(step.detail);
        if (Array.isArray(step.say)) step.say = step.say.map(say);
    }
    return addStoryline(game, { steps, narration, spoken: true });
}
