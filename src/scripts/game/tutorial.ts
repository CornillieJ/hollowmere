import * as THREE from 'three';

import { addStoryline, type MountHandle, type NarrationHandle, type StorylineHandle, type StoryStep } from '../kit';
import { FARM, VILLAGE } from '../content/world';
import type { Farm } from './farm';
import { worded } from './wording';

/**
 * The first day, one small thing at a time, told by the farmer thinking aloud.
 *
 * The order is fixed and each step only says what the next minute needs:
 *
 *  1. wake      the opening lines, then a look round the yard
 *  2. plant     at the field: there are seeds in the pockets
 *  3. water     the can is empty, the well is by the house
 *  4. chop      firewood; the crops wait a stage short of ripe until it is cut
 *  5. harvest   a feeling of being watched, and the crops are up
 *  6. cook      put something in the pot
 *  7. note      while it cooks: a paper has appeared in front of the scarecrow
 *  8. take      the food out of the pot
 *  9. sign      the signpost up the road; from here the farm can be left
 * 10. ride      the road to the village
 * 11. meet      Barnaby, the store and selling
 * 12. deliver   one request, start to finish
 *
 * After that the hand is let go: the Hollow start to come looking and the
 * steps that follow are only reasons to keep going. Until step 9 the farmer
 * is turned back at the edge of the farm and told what comes first.
 *
 * How the lines are written: what the farmer thinks comes first, in their own
 * voice, and what to press follows in brackets.
 */
export type TutorialFacts = {
    planted: () => number;
    watered: () => number;
    wood: () => number;
    harvested: () => number;
    cooked: () => number;
    /** Something is in the pot, cooking or done. */
    potBusy: () => boolean;
    noteRead: () => boolean;
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

export type TutorialOptions = {
    narration: NarrationHandle;
    facts: TutorialFacts;
    farm: Farm;
    bike: MountHandle;
    /** Where the paper lies, and where the signpost stands. */
    noteSpot: THREE.Vector3;
    signSpot: { x: number; z: number };
    /** A passing thought, said once. */
    think: (id: string, lines: string[]) => void;
    say: (line: string) => void;
    /** The paper has been picked up: the game marks it read and reads it out. */
    onNote: () => void;
};

export type TutorialHandle = StorylineHandle & {
    /** True once the farm may be left. */
    readonly free: boolean;
    /** True once the lessons are over and the valley plays by its own rules. */
    readonly over: boolean;
    readonly note: THREE.Object3D;
};

export const INTRO = [
    "Where am I?... This isn't my bed. This isn't even my house. I went to sleep at home last night, I'd swear to it.",
    "I'm clearly still on a farm. Let's look around first. (Walk with WASD, look with the mouse, hold Shift to run. The :arrow: on the compass at the top shows where to go next.)",
];

/** Meters from the middle of the yard at which the farmer is turned back. */
const FARM_EDGE = 27;
const FIELD = { x: FARM.field.x + 2.4, z: FARM.field.z + 1.6 };

function paper(): THREE.Mesh {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 80;
    const context = canvas.getContext('2d');
    if (context) {
        context.fillStyle = '#cfc6a8';
        context.fillRect(0, 0, 64, 80);
        context.fillStyle = '#5c1410';
        for (const [x, y, width] of [[8, 14, 46], [10, 26, 38], [8, 38, 30], [9, 54, 44], [12, 66, 26]] as Array<[number, number, number]>) context.fillRect(x, y, width, 4);
        context.fillStyle = '#7a1a12';
        for (const [x, y, radius] of [[50, 60, 9], [14, 72, 6], [56, 8, 4], [40, 46, 3]] as Array<[number, number, number]>) {
            context.beginPath();
            context.arc(x, y, radius, 0, Math.PI * 2);
            context.fill();
        }
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.magFilter = THREE.NearestFilter;
    texture.colorSpace = THREE.SRGBColorSpace;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 1), new THREE.MeshStandardMaterial({ map: texture, roughness: 1, emissive: 0xffffff, emissiveMap: texture, emissiveIntensity: 0.35, side: THREE.DoubleSide }));
    mesh.name = 'bloody-note';
    mesh.rotation.set(-Math.PI / 2 + 0.06, 0, 0.5);
    return mesh;
}

export function setupTutorial(game: Game, options: TutorialOptions): TutorialHandle {
    const { facts, farm } = options;
    const startDay = facts.day();
    const near = (spot: { x: number; z: number }, distance: number): boolean => {
        const player = game.player?.position;
        return player !== undefined && Math.hypot(player.x - spot.x, player.z - spot.z) < distance;
    };

    const steps: StoryStep[] = [
        {
            id: 'wake',
            objective: 'Look around the farm',
            detail: 'Walk with WASD, look with the mouse. Hold Shift to run. The :arrow: on the compass points at the next job.',
            done: () => near(FIELD, 7),
        },
        {
            id: 'plant',
            objective: 'Plant 3 seeds in the field',
            detail: 'Stand at an empty plot and press E, or hold E and walk along the row. The seeds in your hand are used, or else the first seeds in your pockets.',
            say: ["Turned soil. I could grow something here.", "...And there are seeds in my pocket. I didn't put them there. (Stand at a plot and press E. Hold E and walk to do a whole row.)"],
            done: () => facts.planted() >= 3,
            progress: () => `${Math.min(3, facts.planted())}/3`,
        },
        {
            id: 'water',
            objective: 'Fill the can at the well and water the seeds',
            detail: 'The well is by the house: press E there to fill the can. Then press E at each planted plot, or hold E and walk along the row. A watered crop grows twice as fast that day.',
            say: ["They'll want water, and the can's empty. There's a well by the house. (Press E at the well, then E at each planted plot.)"],
            done: () => facts.watered() >= 3,
            progress: () => `${Math.min(3, facts.watered())}/3`,
        },
        {
            id: 'chop',
            objective: 'Chop a dead tree for firewood',
            detail: 'Press E at a dead tree, four times. The three at the west edge of the yard are closest.',
            say: ["Now they grow. And nothing cooks without a fire: those dead trees at the west edge will burn. (Press E at a tree, 4 times.)"],
            done: () => facts.wood() >= 1,
        },
        {
            id: 'harvest',
            objective: 'Pick 2 ripe crops',
            detail: 'A ripe crop stands tall and pale. Press E to pick it. It gives a seed back, sometimes two.',
            say: ["The back of my neck's been prickling the whole time. Like somebody's standing just past where the fog starts.", "Never mind. The crops should be up by now. (Press E at a ripe one. I need 2.)"],
            done: () => facts.harvested() >= 2,
            progress: () => `${Math.min(2, facts.harvested())}/2`,
        },
        {
            id: 'cook',
            objective: 'Put something in the pot by the house',
            detail: 'Press E at the pot over the fire. Turnip soup takes 2 turnips and 1 wood; bread takes 2 wheat and 1 wood.',
            say: ["Ripe in minutes. Nothing grows that fast at home. I'm not asking.", "There's a pot over the fire by the house. (Press E at the pot and choose a recipe.)"],
            done: () => facts.potBusy() || facts.cooked() >= 1,
        },
        {
            id: 'note',
            objective: 'Read the paper in front of the scarecrow',
            detail: 'A sheet of paper lies on the ground in front of the scarecrow by the field. Press E to read it.',
            say: ["That'll take a minute.", "...There's a paper on the ground, in front of the scarecrow. That wasn't there before. (Press E to read it.)"],
            done: facts.noteRead,
        },
        {
            id: 'take',
            objective: 'Take the food out of the pot',
            detail: 'Press E at the pot when it has finished. Food is hot out of the pot and cools by the hour.',
            say: ["Lamps, then. I'll stay near them. The pot should be about done. (Press E at the pot to take it.)"],
            done: () => facts.cooked() >= 1,
            reward: () => facts.reward(10),
        },
        {
            id: 'sign',
            objective: 'Find the signpost up the road, past the barn',
            detail: 'The brown road leaves the yard between the field and the barn. A signpost stands beside it where the farm ends.',
            say: ["Hot food, and more than I can eat. If anybody lives round here, they might pay for it.", "There's a road out past the barn, and a signpost on it."],
            done: () => near(options.signSpot, 7),
        },
        {
            id: 'ride',
            objective: 'Follow the road to Hollowveil',
            detail: 'Follow the brown road north east: the :candle: on the compass is the village. The bicycle by the porch is much faster: press E to get on, W pedals, A and D steer, E gets off.',
            say: ['"Hollowveil, 1 mile." So there is somewhere to go.', "It's a long walk. The bicycle by the porch would be quicker, and quicker than whatever's in the fog. (Press E to get on. W pedals, A and D steer. Follow the brown road.)"],
            done: () => near(VILLAGE.center, VILLAGE.wallRadius - 2),
        },
        {
            id: 'meet',
            objective: 'Talk to Barnaby, the shopkeeper',
            detail: 'Barnaby stands by his store on the west side of the square. He sells seeds, his scales buy what you carry, and his order book sells land, pots and animals.',
            say: ['A village. Lamps. People. ...Mostly people.', "The goat by the store looks like he runs the place. (Walk up to him and press E.)"],
            done: facts.metShopkeeper,
        },
        {
            id: 'deliver',
            objective: 'Bring a villager what they ask for',
            detail: 'A ! marks someone with a request. Talk to them to hear it, come back with the goods, and choose "Hand over". Press J for the list. The scales at the store buy anything else, for half its worth.',
            say: ["So the store sells seeds, and the scales beside it buy whatever I carry, at half what it's worth.", 'The ones with a ! over their head pay better. (Talk to one to hear what they want, come back with it, and choose "Hand over". J opens my notebook.)'],
            done: () => facts.delivered() >= 1,
            reward: () => facts.reward(15),
            after: ["Paid. So that's the job: grow it, cook it, carry it to whoever asks.", "Nobody here will say what's out in the fog. They only say to be indoors by dark. I'm on my own from here."],
        },

        // The days after: no more lessons, only reasons to keep going.
        {
            id: 'sleep',
            objective: 'Go home and sleep before dark',
            detail: 'Press E at the farmhouse door. Sleeping ends the day and saves. More of them walk at night.',
            say: ["Every visit eats 3 hours of the day, and there are more of them after dark. (Press E at the farmhouse door to sleep. Sleeping saves the game.)"],
            done: () => facts.day() > startDay,
            after: ["One day done. I still don't know how I got here. But I know how to get through another."],
        },
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
            say: ["Every request has a day on it: miss the day and they stop waiting. (Fill 3 requests. J lists them.)"],
            done: () => facts.delivered() >= 3,
            progress: () => `${Math.min(3, facts.delivered())}/3`,
            reward: () => facts.reward(30),
        },
        {
            id: 'pot',
            objective: "Buy the iron pot from Barnaby's order book",
            detail: 'The order book stands beside the store counter. The iron pot costs 180c and cooks chowder, omelettes and pale broth.',
            say: ["They want proper cooking now, and a clay pot only goes so far. Barnaby's order book has an iron one for 180c."],
            done: () => facts.potTier() >= 2,
        },
        {
            id: 'wander',
            objective: 'Follow the thin paths: find 3 places',
            detail: 'Footpaths leave the road for the black pool (east), the lookout (west), the standing stones (south of the farm), a ruined farm (north of the chapel) and the graveyard (behind the village).',
            say: ["Fen says the thin paths off the road all go somewhere. I'd like to know what else is in this valley with me."],
            done: () => facts.placesFound() >= 3,
            progress: () => `${facts.placesFound()}/3`,
        },
        {
            id: 'friend',
            objective: 'Make a friend: 2 hearts with anyone',
            detail: 'Talk to someone every day, ask about things, and bring what they ask for. The hearts show when you talk.',
            say: ["These people are strange. They're also all I've got. I could do with one friend."],
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
            say: ['The last letter. He says he kept something of mine.', 'All right, Pell. Once more up the hill.'],
            done: facts.metPell,
            after: ["My name. In my own hand. I don't remember writing it.", "I'll read it every morning. And I'll stay. There are worse neighbours."],
        },
    ];

    const worded_ = worded(game);
    for (const step of steps) {
        if (typeof step.detail === 'string') step.detail = worded_(step.detail);
        if (Array.isArray(step.say)) step.say = step.say.map(worded_);
    }
    const handle = addStoryline(game, { steps, narration: options.narration, spoken: true });
    const passed = (id: string): boolean => handle.story.completed.some((step) => step.id === id);
    const at = (id: string): boolean => handle.story.current?.id === id;

    // The paper: there from the moment the pot is on, gone once it is read.
    const note = paper();
    note.position.copy(options.noteSpot);
    note.visible = false;
    game.scene.add(note);
    game.interactions.add(note, { prompt: 'Read the paper', range: 2.2, enabled: false, onInteract: () => options.onNote() });

    let turnedBack = 0;
    game.systems.add({
        name: 'tutorial',
        update: (delta) => {
            const out = at('note') && !facts.noteRead();
            if (note.visible !== out) {
                note.visible = out;
                game.interactions.setEnabled(note, out);
            }

            // Until there is firewood the crops stop a stage short of ripe, so the harvest comes after the axe.
            if (!passed('chop')) {
                for (const plot of farm.plots) {
                    const last = Math.max(2, plot.crop?.stages ?? 3) - 2;
                    if (plot.crop && plot.stage >= last) plot.elapsed = Math.min(plot.elapsed, 1);
                }
            }

            // Nobody leaves the farm before the lessons on it are over.
            turnedBack -= delta;
            const player = game.player;
            if (!player || passed('take')) return;
            const x = player.position.x - FARM.centre.x;
            const z = player.position.z - FARM.centre.z;
            const far = Math.hypot(x, z);
            if (far <= FARM_EDGE) return;
            // A bicycle is put back well inside, or it would stand stuck against the edge.
            const pull = (FARM_EDGE - (options.bike.mounted ? 6 : 0.6)) / far;
            player.body.teleport({ x: FARM.centre.x + x * pull, y: player.position.y, z: FARM.centre.z + z * pull });
            if (options.bike.mounted) options.bike.dismount();
            if (turnedBack > 0) return;
            turnedBack = 5;
            options.think('fenced', ["I should look round my own farm a bit more before I go wandering off. And I'm hungry."]);
            options.say(`First: ${(handle.story.current?.objective ?? 'look around the farm').toLowerCase()}`);
        },
    });

    // When the wood is in, the crops that were held back are let go and are up by the time the farmer is back.
    handle.story.onEvent((event) => {
        if (event.type === 'completed' && event.step?.id === 'chop') farm.advance(240);
    });

    return {
        ...handle,
        get summary() {
            return handle.summary;
        },
        get finished() {
            return handle.finished;
        },
        get free() {
            return passed('take');
        },
        get over() {
            return passed('deliver');
        },
        note,
    };
}
