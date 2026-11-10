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

export const INTRO = [
    '...This is not my bed. This is not my farm.',
    'Last night I fell asleep in my own house. I am a farmer. That much I still know.',
    'Now there is fog up to the fence, and shapes standing in it that do not move like people.',
    'I see no road home. So: food first, answers later.',
    'I have seeds, a watering can and an axe. The field is just south of the house.',
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
            detail: 'Walk with WASD, look with the mouse. Hold Shift to run.',
            done: () => farFrom(FARM.door, 7),
            after: ['Good dark soil. I will plant what I have and see what grows here.'],
        },
        {
            id: 'plant',
            objective: 'Plant 3 seeds in the field',
            detail: 'Pick the seeds on the hotbar with 1 to 8 or the wheel, stand at an empty plot and press E.',
            done: () => facts.planted() >= 3,
            progress: () => `${Math.min(3, facts.planted())}/3`,
            after: ['Planted. Now water, or they will take all day.'],
        },
        {
            id: 'water',
            objective: 'Water what you planted',
            detail: 'Pick the watering can and press E at a planted plot. A watered crop grows twice as fast that day.',
            done: () => facts.watered() >= 3,
            progress: () => `${Math.min(3, facts.watered())}/3`,
            after: ['They need a few minutes to grow. Meanwhile I need firewood to cook with.'],
        },
        {
            id: 'chop',
            objective: 'Chop a dead tree for firewood',
            detail: 'Pick the axe and press E at a dead tree, four times. The three at the west edge of the yard are closest.',
            done: () => facts.wood() >= 1,
            say: ['The dead trees at the west edge of the yard will do. Axe in hand.'],
            after: ['Firewood. And something is standing out there among the trees, watching. It has not moved. Back to the field.'],
        },
        {
            id: 'harvest',
            objective: 'Pick 2 ripe crops',
            detail: 'A ripe crop stands tall and pale. Press E to pick it. It gives a seed back, sometimes two.',
            done: () => facts.harvested() >= 2,
            progress: () => `${Math.min(2, facts.harvested())}/2`,
            after: ['Ripe in minutes. Nothing grows that fast at home. Never mind: there is a pot over the fire by the house.'],
        },
        {
            id: 'cook',
            objective: 'Cook a dish at the fire by the house',
            detail: 'Press E at the pot. Turnip soup takes 2 turnips and 1 wood; bread takes 2 wheat and 1 wood. Wait, then take it.',
            done: () => facts.cooked() >= 1,
            reward: () => facts.reward(10),
            after: ['Hot food. More than I need. If anyone lives along that road, they might pay for it.'],
        },
        {
            id: 'ride',
            objective: 'Ride the bicycle up the road to the village',
            detail: 'Press E at the bicycle by the porch. W pedals, A and D steer, E gets off. Follow the brown road north east.',
            done: () => !farFrom(VILLAGE.center, VILLAGE.wallRadius - 2),
            say: ['There is a bicycle by the porch. Faster than walking, and faster than whatever is in the fog.'],
            after: ['A village. Lamps. People. ...Mostly people. Somebody here must buy and sell.'],
        },
        {
            id: 'meet',
            objective: 'Talk to Barnaby, the shopkeeper',
            detail: 'Barnaby stands by his store on the west side of the square. He sells seeds, and his order book sells land, pots and animals.',
            done: facts.metShopkeeper,
        },
        {
            id: 'deliver',
            objective: 'Bring a villager what they ask for',
            detail: 'A ! marks someone with a request. Talk to them to hear it, come back with the goods, and choose "Hand over". Press J for the list.',
            done: () => facts.delivered() >= 1,
            say: ['He never mentioned the things in the fog. Nobody does. The ones marked with a ! want something from me.'],
            reward: () => facts.reward(15),
            after: ['Paid. So that is the work: grow it, cook it, bring it to whoever asks.'],
        },
        {
            id: 'sleep',
            objective: 'Go home and sleep before dark',
            detail: 'Press E at the farmhouse door. Sleeping ends the day and saves. More of them walk at night.',
            done: () => facts.day() > startDay,
            say: ['The light is going, and there are more of them at night. Home, and the door shut behind me.'],
            after: ['One day survived. I still do not know how I came here. But I know how to last: plant, cook, deliver, sleep.'],
        },

        // The days after: no more lessons, only reasons to keep going.
        {
            id: 'mailbox',
            objective: 'Check the mailbox by the porch',
            detail: 'A letter is waiting when the ✉ shows over the mailbox, north of the farmhouse door. One comes each morning for a while.',
            done: () => facts.lettersRead() >= 1,
            say: ['Something is in the mailbox. Nobody knows I am here.'],
        },
        {
            id: 'regular',
            objective: 'Fill 3 requests',
            detail: 'Every 3 deliveries the village starts asking for better things, which pay more. The notebook lists who wants what.',
            done: () => facts.delivered() >= 3,
            progress: () => `${Math.min(3, facts.delivered())}/3`,
            reward: () => facts.reward(30),
            after: ['They ask for cooked food now. A clay pot will only go so far.'],
        },
        {
            id: 'pot',
            objective: "Buy the iron pot from Barnaby's order book",
            detail: 'The order book stands beside the store counter. The iron pot costs 180c and cooks chowder, omelettes and pale broth.',
            done: () => facts.potTier() >= 2,
        },
        {
            id: 'wander',
            objective: 'Follow the thin paths: find 3 places',
            detail: 'Footpaths leave the road for the mere (east), the lookout (west), the standing stones (south of the farm), a ruined farm (north of the chapel) and the graveyard (behind the village).',
            done: () => facts.placesFound() >= 3,
            progress: () => `${Math.min(3, facts.placesFound())}/3`,
            say: ['Fen says the thin paths go somewhere. I should know what is in this valley with me.'],
        },
        {
            id: 'friend',
            objective: 'Make a friend: 2 hearts with anyone',
            detail: 'Talk to someone every day, ask about things, and bring what they ask for. The hearts show when you talk.',
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
            objective: 'Say hello to the tall one at the bend in the road',
            detail: 'He stands where the road turns for the chapel, between the farm and the lamp. He does not chase.',
            done: facts.metPell,
            after: ['My name. In my own hand. I do not remember writing it.', 'I will read it every morning. And I will stay. There are worse neighbours.'],
        },
    ];

    return addStoryline(game, { steps, narration });
}
