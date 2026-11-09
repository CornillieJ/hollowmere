import * as THREE from 'three';

import { SYSTEM_ORDER } from '../core/systems';
import { createBillboardLabel, faceCamera } from '../helpers/text';
import { dampAngle } from '../helpers/math';
import { DialogueBox, type DialogueBoxOptions, type DialogueChoice, type DialogueLine } from '../ui/dialogue-box';
import { Relationships, type GiftTaste } from '../game/relationships';
import { RequestBoard, type Request, type RequestTemplate } from '../game/requests';
import type { InventoryHandle } from './inventory';

//#region Villagers

/**
 * People to talk to: dialogue, friendship, gifts and errands in one install.
 *
 * Walk up and press the interact key. A villager greets you, then offers what
 * makes sense right now: hand in their request when you carry the items, give
 * them what you hold, or just chat. Friendship grows from the first chat of the
 * day, from gifts (one a day, by taste) and from finished requests.
 */
export type VillagerDefinition = {
    id: string;
    name: string;
    /** Emoji shown as the portrait in the dialogue box. */
    portrait?: string;
    /** The character's visual. Its origin sits on the ground, facing +z. */
    object: THREE.Object3D;
    position: Vec3;
    /** Heading when nobody is near. */
    yaw?: number;
    /** Small talk. One is picked per day; give a function to react to hearts or events. */
    lines: string[] | ((context: VillagerContext) => string[]);
    /** What they say when they get a gift, per taste. */
    giftLines?: Partial<Record<GiftTaste, string>>;
    loves?: string[];
    likes?: string[];
    dislikes?: string[];
};

export type VillagerContext = { game: Game; hearts: number; day: number; id: string };

export type AddVillagersOptions = {
    villagers: VillagerDefinition[];
    /** The current day number, for once-a-day talks and gifts and for deadlines. */
    day: () => number;
    /** Where requested items are taken from and gifts come out of. */
    inventory: InventoryHandle;
    /** The item the player is holding, e.g. `() => hotbar.selectedId`. Gifts use it. */
    held?: () => string | undefined;
    /** Errands villagers can ask for. Omit for no requests. */
    requests?: { templates: RequestTemplate[]; maxOpen?: number };
    /** Pays out a finished request. */
    onPaid?: (amount: number, request: Request) => void;
    /** Freeze gameplay while talking. Defaults to true. */
    pauseWhileTalking?: boolean;
    dialogue?: DialogueBoxOptions;
    /** Interaction range in meters. */
    range?: number;
};

export type VillagersHandle = {
    readonly dialogue: DialogueBox;
    readonly relationships: Relationships;
    readonly requests: RequestBoard | undefined;
    /** Start a conversation, as if the player pressed the key next to them. */
    talkTo: (id: string) => Promise<void>;
    /** Call each morning: expires overdue requests and asks for new ones. */
    newDay: () => void;
    dispose: () => void;
};

type Choice = 'chat' | 'gift' | 'deliver' | 'bye';

export function addVillagers(game: Game, options: AddVillagersOptions): VillagersHandle {
    const dialogue = new DialogueBox(game.screens.layer('modal'), options.dialogue);
    const relationships = new Relationships({ day: options.day });
    const nameOf = (itemId: string): string => options.inventory.inventory.registry.resolve(itemId).name;
    const requests = options.requests
        ? new RequestBoard({ ...options.requests, people: options.villagers.map((villager) => villager.id), day: options.day, itemName: nameOf })
        : undefined;
    const byId = new Map(options.villagers.map((villager) => [villager.id, villager]));
    const markers = new Map<string, THREE.Object3D>();
    const removers: Array<() => void> = [];
    let talking = false;

    for (const villager of options.villagers) {
        villager.object.position.set(villager.position.x, villager.position.y, villager.position.z);
        villager.object.rotation.y = villager.yaw ?? 0;
        villager.object.name = `villager-${villager.id}`;
        game.scene.add(villager.object);

        // A "!" over anyone with an errand, so the village reads at a glance.
        const marker = createBillboardLabel('!', { x: 0, y: 2.3, z: 0 }, { fontSize: 0.5, color: 0xffd166 });
        marker.visible = false;
        villager.object.add(marker);
        markers.set(villager.id, marker);

        removers.push(
            game.interactions.add(villager.object, {
                prompt: `Talk to ${villager.name}`,
                range: options.range ?? 2.6,
                canInteract: () => !talking,
                onInteract: () => void talkTo(villager.id),
            }),
        );
    }

    const refreshMarkers = (): void => {
        for (const [id, marker] of markers) marker.visible = (requests?.from(id).length ?? 0) > 0;
    };
    if (requests) removers.push(requests.onChange(refreshMarkers));

    // Villagers turn to face whoever is near, and back when they leave.
    removers.push(
        game.systems.add({
            name: 'villagers',
            order: SYSTEM_ORDER.GAMEPLAY + 2,
            always: true,
            update: (delta) => {
                const player = game.player?.position;
                for (const villager of options.villagers) {
                    const object = villager.object;
                    const near = player && object.position.distanceToSquared(player) < 36;
                    const goal = near ? Math.atan2(player.x - object.position.x, player.z - object.position.z) : (villager.yaw ?? 0);
                    object.rotation.y = dampAngle(object.rotation.y, goal, 0.02, delta);
                    const marker = markers.get(villager.id);
                    if (marker?.visible) faceCamera(marker, game.camera);
                }
            },
        }),
    );

    async function talkTo(id: string): Promise<void> {
        const villager = byId.get(id);
        if (!villager || talking) return;
        talking = true;
        const pause = options.pauseWhileTalking ?? true;
        if (pause) game.time.pause(dialogue);
        game.screens.show('modal', dialogue);
        try {
            await converse(villager);
        } finally {
            game.screens.hide('modal', dialogue);
            if (pause) game.time.resume(dialogue);
            talking = false;
        }
    }

    async function converse(villager: VillagerDefinition): Promise<void> {
        const speaker = villager.name;
        const portrait = villager.portrait;
        const context: VillagerContext = { game, hearts: relationships.hearts(villager.id), day: options.day(), id: villager.id };
        const pool = typeof villager.lines === 'function' ? villager.lines(context) : villager.lines;
        const greeting = pool[(options.day() + villager.id.length) % Math.max(1, pool.length)] ?? '...';
        relationships.talk(villager.id);

        const request = requests?.from(villager.id)[0];
        const held = options.held?.();
        const choices: Array<DialogueChoice<Choice>> = [];
        if (request && requests?.canFulfil(request, options.inventory)) choices.push({ label: `Hand over ${request.amount} ${nameOf(request.itemId)}`, value: 'deliver' });
        if (held && relationships.canGift(villager.id)) choices.push({ label: `Give ${nameOf(held)}`, value: 'gift' });
        choices.push({ label: 'Chat', value: 'chat' }, { label: 'Goodbye', value: 'bye' });

        const lines: Array<DialogueLine<Choice>> = [{ text: greeting, portrait }];
        if (request && !requests?.canFulfil(request, options.inventory)) lines.push({ text: `${request.text} (by day ${request.dueDay})`, portrait });
        lines.push({ text: hearts(villager.id), portrait, choices });
        const choice = await dialogue.say(lines, speaker);

        if (choice === 'deliver' && request && requests) {
            const done = requests.fulfil(request, options.inventory);
            if (done) {
                options.onPaid?.(done.reward, done);
                relationships.add(villager.id, done.friendship);
                await dialogue.say([{ text: `Thank you. Here, $${done.reward}.`, portrait }], speaker);
            }
        } else if (choice === 'gift' && held) {
            const taste: GiftTaste = villager.loves?.includes(held) ? 'loved' : villager.likes?.includes(held) ? 'liked' : villager.dislikes?.includes(held) ? 'disliked' : 'neutral';
            if (options.inventory.remove(held, 1)) {
                relationships.gift(villager.id, taste);
                await dialogue.say([{ text: villager.giftLines?.[taste] ?? GIFT_LINES[taste], portrait }], speaker);
            }
        } else if (choice === 'chat') {
            const other = pool[(options.day() + villager.id.length + 1) % Math.max(1, pool.length)] ?? '...';
            await dialogue.say([{ text: other, portrait }], speaker);
        }
    }

    function hearts(id: string): string {
        const count = relationships.hearts(id);
        return `${'♥'.repeat(count)}${'♡'.repeat(Math.max(0, 5 - count))}`;
    }

    game.save.register('villagers', {
        save: () => ({ relationships: relationships.toJSON(), requests: requests?.toJSON() }),
        load: (data) => {
            const saved = data as { relationships?: ReturnType<Relationships['toJSON']>; requests?: ReturnType<RequestBoard['toJSON']> } | undefined;
            relationships.fromJSON(saved?.relationships);
            requests?.fromJSON(saved?.requests);
            refreshMarkers();
        },
    });

    return {
        dialogue,
        relationships,
        requests,
        talkTo,
        newDay: () => {
            requests?.expire();
            requests?.refill();
            refreshMarkers();
        },
        dispose: () => {
            for (const remove of removers) remove();
            dialogue.dispose();
            for (const villager of options.villagers) villager.object.removeFromParent();
        },
    };
}

const GIFT_LINES: Record<GiftTaste, string> = {
    loved: 'Oh! You remembered. I love this.',
    liked: 'That is kind of you. Thank you.',
    neutral: 'Thanks, I suppose.',
    disliked: 'Oh. Hm. Well. Thank you.',
};

//#endregion Villagers
