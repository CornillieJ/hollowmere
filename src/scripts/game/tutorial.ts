import * as THREE from 'three';

import { addStoryline, type MountHandle, type NarrationHandle, type StorylineHandle, type StoryStep } from '../kit';
import { TURNED_BACK, TUTORIAL } from '../content/tutorial';
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
    think: (id: string, lines?: string[]) => void;
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
            ...TUTORIAL['wake'],
            done: () => near(FIELD, 7),
        },
        {
            id: 'plant',
            ...TUTORIAL['plant'],
            done: () => facts.planted() >= 3,
            progress: () => `${Math.min(3, facts.planted())}/3`,
        },
        {
            id: 'water',
            ...TUTORIAL['water'],
            done: () => facts.watered() >= 3,
            progress: () => `${Math.min(3, facts.watered())}/3`,
        },
        {
            id: 'chop',
            ...TUTORIAL['chop'],
            done: () => facts.wood() >= 1,
        },
        {
            id: 'harvest',
            ...TUTORIAL['harvest'],
            done: () => facts.harvested() >= 2,
            progress: () => `${Math.min(2, facts.harvested())}/2`,
        },
        {
            id: 'cook',
            ...TUTORIAL['cook'],
            done: () => facts.potBusy() || facts.cooked() >= 1,
        },
        {
            id: 'note',
            ...TUTORIAL['note'],
            done: facts.noteRead,
        },
        {
            id: 'take',
            ...TUTORIAL['take'],
            done: () => facts.cooked() >= 1,
            reward: () => facts.reward(10),
        },
        {
            id: 'sign',
            ...TUTORIAL['sign'],
            done: () => near(options.signSpot, 7),
        },
        {
            id: 'ride',
            ...TUTORIAL['ride'],
            done: () => near(VILLAGE.center, VILLAGE.wallRadius - 2),
        },
        {
            id: 'meet',
            ...TUTORIAL['meet'],
            done: facts.metShopkeeper,
        },
        {
            id: 'deliver',
            ...TUTORIAL['deliver'],
            done: () => facts.delivered() >= 1,
            reward: () => facts.reward(15),
        },

        // The days after: no more lessons, only reasons to keep going.
        {
            id: 'sleep',
            ...TUTORIAL['sleep'],
            done: () => facts.day() > startDay,
        },
        {
            id: 'mailbox',
            ...TUTORIAL['mailbox'],
            done: () => facts.lettersRead() >= 1,
        },
        {
            id: 'regular',
            ...TUTORIAL['regular'],
            done: () => facts.delivered() >= 3,
            progress: () => `${Math.min(3, facts.delivered())}/3`,
            reward: () => facts.reward(30),
        },
        {
            id: 'pot',
            ...TUTORIAL['pot'],
            done: () => facts.potTier() >= 2,
        },
        {
            id: 'wander',
            ...TUTORIAL['wander'],
            done: () => facts.placesFound() >= 3,
            progress: () => `${facts.placesFound()}/3`,
        },
        {
            id: 'friend',
            ...TUTORIAL['friend'],
            done: () => facts.bestHearts() >= 2,
        },
        {
            id: 'letters',
            ...TUTORIAL['letters'],
            done: () => facts.lettersRead() >= facts.lettersTotal,
            progress: () => `${facts.lettersRead()}/${facts.lettersTotal}`,
        },
        {
            id: 'pell',
            ...TUTORIAL['pell'],
            done: facts.metPell,
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
            options.think('fenced', TURNED_BACK);
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
