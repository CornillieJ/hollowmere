import type { StoryStep } from '../kit';

/**
 * What the tutorial and the steps after it say: the objective in the corner,
 * the longer detail in the notebook, what the farmer thinks when a step
 * starts (`say`) and when it is done (`after`). The order and the checks are
 * in `game/tutorial.ts`.
 *
 * What the farmer thinks comes first, in their own voice; what to press
 * follows in brackets. `:name:` is an icon.
 */
type StepText = Pick<StoryStep, 'objective' | 'detail' | 'say' | 'after'>;

/** Said when a new game starts, before the first step. */
export const INTRO = [
    "Where am I? This isn't my bed. This isn't even my house. I went to sleep at home last night, I'd swear to it.",
    "It's a farm, by the look of it. I'd better look round before I do anything else. (Walk with WASD, look with the mouse, hold Shift to run. The :arrow: on the compass at the top shows where to go next.)",
];

/** When the farmer tries to leave the farm before the lessons on it are done. */
export const TURNED_BACK = ["I should look round my own farm a bit more before I go wandering off. And I'm hungry."];

export const TUTORIAL = {
    wake: {
        objective: 'Look around the farm',
        detail: 'Walk with WASD, look with the mouse. Hold Shift to run. The :arrow: on the compass points at the next job.',
    },
    plant: {
        objective: 'Plant 3 seeds in the field',
        detail: 'Stand at an empty plot and press E, or hold E and walk along the row. The seeds in your hand are used, or else the first seeds in your pockets.',
        say: ["Turned soil. I could grow something here.", "...And there are seeds in my pocket. I didn't put them there. The packet's labelled in my handwriting. (Stand at a plot and press E. Hold E and walk to do a whole row.)"],
    },
    water: {
        objective: 'Fill the can at the well and water the seeds',
        detail: 'The well is by the house: press E there to fill the can. Then press E at each planted plot, or hold E and walk along the row. A watered crop grows twice as fast that day.',
        say: ["They'll want water, and the can's empty. There's a well by the house. (Press E at the well, then E at each planted plot.)"],
    },
    chop: {
        objective: 'Chop a dead tree for firewood',
        detail: 'Press E at a dead tree, four times. The three at the west edge of the yard are closest.',
        say: ["Now they need time to grow. And nothing cooks without a fire: those dead trees at the west edge will burn. (Press E at a tree, 4 times.)"],
    },
    harvest: {
        objective: 'Pick 2 ripe crops',
        detail: 'A ripe crop stands tall and pale. Press E to pick it. It gives a seed back, sometimes two.',
        say: ["The back of my neck's been prickling the whole time. Like somebody's standing just past where the fog starts.", "Never mind. The crops should be up by now. (Press E at a ripe one. I need 2.)"],
    },
    cook: {
        objective: 'Put something in the pot by the house',
        detail: 'Press E at the pot over the fire. Turnip soup takes 2 turnips and 1 wood; bread takes 2 wheat and 1 wood.',
        say: ["Ripe in minutes. Nothing grows that fast at home. I'm not asking.", "There's a pot over the fire by the house. (Press E at the pot and choose a recipe.)"],
    },
    note: {
        objective: 'Read the paper in front of the scarecrow',
        detail: 'A sheet of paper lies on the ground in front of the scarecrow by the field. Press E to read it.',
        say: ["That'll take a minute.", "...There's a paper on the ground, in front of the scarecrow. That wasn't there before. (Press E to read it.)"],
    },
    take: {
        objective: 'Take the food out of the pot',
        detail: 'Press E at the pot when it has finished. Food is hot out of the pot and cools by the hour.',
        say: ["Light, then. Lamps, candles, the porch. I'll keep near them.", "...The pot should be done. (Press E at the pot to take it.)"],
    },
    sign: {
        objective: 'Find the signpost up the road, past the barn',
        detail: 'The brown road leaves the yard between the field and the barn. A signpost stands beside it where the farm ends.',
        say: ["Hot food, and more than I can eat. If anybody lives round here, they might pay for it.", "There's a road out past the barn, and a signpost on it."],
    },
    ride: {
        objective: 'Follow the road to Hollowveil',
        detail: 'Follow the brown road north east: the :candle: on the compass is the village. The bicycle by the porch is much faster: press E to get on, W pedals, A and D steer, E gets off.',
        say: ['"Hollowveil, 1 mile." So there is somewhere to go.', "It's a long walk. The bicycle by the porch would be quicker, and quicker than whatever's in the fog. (Press E to get on. W pedals, A and D steer. Follow the brown road.)"],
    },
    meet: {
        objective: 'Talk to Barnaby, the shopkeeper',
        detail: 'Barnaby stands by his store on the west side of the square. He sells seeds, buys what you carry, and his order book sells land, pots and animals.',
        say: ['A village. Lamps. People. ...Mostly people.', "The goat by the store looks like he runs the place. (Walk up to him and press E.)"],
    },
    deliver: {
        objective: 'Bring a villager what they ask for',
        detail: 'A ! marks someone with a request. Talk to them to hear it, come back with the goods, and choose "Hand over". Press J for the list. Barnaby buys anything else, for half its worth.',
        say: ["So Barnaby sells seeds, and buys whatever I carry, at half what it's worth.", 'The ones with a ! over their head pay better. (Talk to one to hear what they want, come back with it, and choose "Hand over". J opens my notebook.)'],
        after: ["Paid. So that's the job: grow it, cook it, carry it to whoever asks.", "Nobody here will say what's out in the fog. They only say to be indoors by dark. I'm on my own from here."],
    },
    sleep: {
        objective: 'Go home and sleep before dark',
        detail: 'Press E at the farmhouse door. Sleeping ends the day and saves. More of them walk at night.',
        say: ["Every visit eats 3 hours of the day, and there are more of them after dark. (Press E at the farmhouse door to sleep. Sleeping saves the game.)"],
        after: ["One day done. I still don't know how I got here. But I know how to get through another."],
    },
    mailbox: {
        objective: 'Check the mailbox by the porch',
        detail: 'A letter is waiting when the :letter: shows over the mailbox, beside the farmhouse door. One comes each morning for a while.',
        say: ["There's something in the mailbox by the door. Nobody knows I'm here. (Press E at the mailbox.)"],
    },
    regular: {
        objective: 'Fill 3 requests',
        detail: 'Every 3 deliveries the village starts asking for better things, which pay more. The notebook lists who wants what.',
        say: ["Every request has a day on it: miss the day and they stop waiting. (Fill 3 requests. J lists them.)"],
    },
    pot: {
        objective: "Buy the iron pot from Barnaby's order book",
        detail: 'The order book stands beside the store counter. The iron pot costs 180c and cooks chowder, omelettes, pale broth and bloom tea.',
        say: ["They want proper cooking now, and a clay pot only goes so far. Barnaby's order book has an iron one for 180c."],
    },
    wander: {
        objective: 'Follow the thin paths: find 3 places',
        detail: 'Footpaths leave the road for the black pool (east), the lookout (west), the standing stones (south of the farm), a ruined farm (north of the chapel) and the graveyard (behind the village).',
        say: ["Fen says the thin paths off the road all go somewhere. I'd like to know what else is in this valley with me."],
    },
    friend: {
        objective: 'Make a friend: 2 hearts with anyone',
        detail: 'Talk to someone every day, ask about things, and bring what they ask for. The hearts show when you talk.',
        say: ["These people are strange. They're also all I've got. I could do with one friend."],
        after: ["A friend. Here, of all places. I didn't expect to be glad of it."],
    },
    letters: {
        objective: 'Read every letter',
        detail: 'One arrives each morning until there are no more.',
    },
    pell: {
        objective: 'Go up the hill to Pell once more',
        detail: 'He stands by the old tree on the lookout hill, up the west path from the chapel. He kept something for you.',
        say: ['The last letter. He says he kept something of mine.', 'All right, Pell. Once more up the hill.'],
        after: ["My name. In my own hand. I don't remember writing it.", "I'll read it every morning. And I'll stay. There are worse neighbours."],
    },
} satisfies Record<string, StepText>;
