import * as THREE from 'three';

import { SYSTEM_ORDER } from '../core/systems';
import { createBillboardLabel, faceCamera } from '../helpers/text';
import { dampAngle } from '../helpers/math';
import { DialogueBox, type DialogueBoxOptions, type DialogueChoice, type DialogueLine } from '../ui/dialogue-box';
import { Relationships, type GiftTaste } from '../game/relationships';
import { RequestBoard, type Request, type RequestBoardOptions, type RequestInventory, type RequestTemplate } from '../game/requests';
import type { InventoryHandle } from './inventory';

//#region Villagers

/**
 * People to talk to: dialogue, friendship, things to ask about and errands in
 * one install.
 *
 * Walk up and press the interact key. A villager greets you, then offers what
 * makes sense right now: hand in their request when you carry the items, ask
 * about a topic, chat, or (when gifts are on) give them what you hold. The
 * conversation returns to that list until the player says goodbye. Friendship
 * grows from the first chat of the day, from new topics and from finished
 * requests, and topics can wait for a number of hearts, so people open up.
 */
export type VillagerTopic = {
    id: string;
    /** The choice the player sees, e.g. "Ask about the last farmer". */
    label: string;
    lines: string[] | ((context: VillagerContext) => string[]);
    /** Hidden until this many hearts. */
    minHearts?: number;
    /** Hidden until this day. */
    minDay?: number;
};

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
    /** Things the player can ask about. New ones are listed first. */
    topics?: VillagerTopic[];
    /** What they say on a delivery. One is picked per delivery. */
    thanks?: string[];
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
    /** Supplies item names, and the items themselves unless `items` is given. */
    inventory: InventoryHandle;
    /** Where requested items are taken from, e.g. pockets and bag together. Defaults to `inventory`. */
    items?: RequestInventory;
    /** Let the player give the held item as a gift. Defaults to true; false means people only take what they asked for. */
    gifts?: boolean;
    /** The item the player is holding, e.g. `() => hotbar.selectedId`. Gifts use it. */
    held?: () => string | undefined;
    /** Errands villagers can ask for. Omit for no requests. */
    requests?: Pick<RequestBoardOptions, 'templates' | 'maxOpen' | 'tier' | 'deliveriesPerTier'>;
    /** Pays out a finished request. */
    onPaid?: (amount: number, request: Request) => void;
    /** How a reward reads in the thank-you line. Defaults to the bare number. */
    formatReward?: (amount: number) => string;
    /** Called when a conversation starts. */
    onTalk?: (id: string) => void;
    /** Friendship for hearing a topic for the first time. Defaults to 15. */
    topicPoints?: number;
    /** At most this many topics are offered at once. Defaults to 3. */
    maxTopics?: number;
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
    /** True once the player has spoken to them at all. */
    hasMet: (id: string) => boolean;
    /** Call each morning: expires overdue requests and asks for new ones. */
    newDay: () => void;
    dispose: () => void;
};

type Choice = { kind: 'chat' | 'gift' | 'deliver' | 'bye' } | { kind: 'topic'; topic: VillagerTopic };

export function addVillagers(game: Game, options: AddVillagersOptions): VillagersHandle {
    const dialogue = new DialogueBox(game.screens.layer('modal'), options.dialogue);
    const relationships = new Relationships({ day: options.day });
    const nameOf = (itemId: string): string => options.inventory.inventory.registry.resolve(itemId).name;
    const items: RequestInventory = options.items ?? options.inventory;
    const requests = options.requests
        ? new RequestBoard({ ...options.requests, people: options.villagers.map((villager) => villager.id), day: options.day, itemName: nameOf })
        : undefined;
    const byId = new Map(options.villagers.map((villager) => [villager.id, villager]));
    const markers = new Map<string, THREE.Object3D>();
    const removers: Array<() => void> = [];
    /** Topic ids already heard, per villager. */
    const heard = new Map<string, Set<string>>();
    const met = new Set<string>();
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

    const heardBy = (id: string): Set<string> => {
        let set = heard.get(id);
        if (!set) {
            set = new Set();
            heard.set(id, set);
        }
        return set;
    };

    async function converse(villager: VillagerDefinition): Promise<void> {
        const speaker = villager.name;
        const portrait = villager.portrait;
        const context = (): VillagerContext => ({ game, hearts: relationships.hearts(villager.id), day: options.day(), id: villager.id });
        const pool = typeof villager.lines === 'function' ? villager.lines(context()) : villager.lines;
        const pick = (offset: number): string => pool[(options.day() + villager.id.length + offset) % Math.max(1, pool.length)] ?? '...';
        relationships.talk(villager.id);
        met.add(villager.id);
        options.onTalk?.(villager.id);

        let opening: Array<DialogueLine<Choice>> = [{ text: pick(0), portrait }];
        const request = requests?.from(villager.id)[0];
        if (request && !requests?.canFulfil(request, items)) {
            const reward = options.formatReward?.(request.reward) ?? String(request.reward);
            opening.push({ text: `${request.text} (${reward}, by day ${request.dueDay})`, portrait });
        }
        let chats = 0;

        // Back to the list after every answer, until the player says goodbye.
        for (let turn = 0; turn < 24; turn += 1) {
            const open = requests?.from(villager.id)[0];
            const held = options.held?.();
            const choices: Array<DialogueChoice<Choice>> = [];
            if (open && requests?.canFulfil(open, items)) choices.push({ label: `Hand over ${open.amount} ${nameOf(open.itemId)}`, value: { kind: 'deliver' } });
            if (options.gifts !== false && held && relationships.canGift(villager.id)) choices.push({ label: `Give ${nameOf(held)}`, value: { kind: 'gift' } });
            for (const topic of availableTopics(villager, context())) choices.push({ label: topic.label, value: { kind: 'topic', topic } });
            choices.push({ label: 'Chat', value: { kind: 'chat' } }, { label: 'Goodbye', value: { kind: 'bye' } });

            const choice = await dialogue.say<Choice>([...opening, { text: hearts(villager.id), portrait, choices }], speaker);
            opening = [];
            if (!choice || choice.kind === 'bye') return;

            if (choice.kind === 'deliver' && open && requests) {
                const done = requests.fulfil(open, items);
                if (done) {
                    options.onPaid?.(done.reward, done);
                    relationships.add(villager.id, done.friendship);
                    const thanks = villager.thanks?.[done.id % villager.thanks.length] ?? 'Thank you.';
                    await dialogue.say([{ text: `${thanks} (+${options.formatReward?.(done.reward) ?? done.reward})`, portrait }], speaker);
                }
            } else if (choice.kind === 'gift' && held) {
                const taste: GiftTaste = villager.loves?.includes(held) ? 'loved' : villager.likes?.includes(held) ? 'liked' : villager.dislikes?.includes(held) ? 'disliked' : 'neutral';
                if (options.inventory.remove(held, 1)) {
                    relationships.gift(villager.id, taste);
                    await dialogue.say([{ text: villager.giftLines?.[taste] ?? GIFT_LINES[taste], portrait }], speaker);
                }
            } else if (choice.kind === 'topic') {
                const { topic } = choice;
                const lines = typeof topic.lines === 'function' ? topic.lines(context()) : topic.lines;
                await dialogue.say(lines.map((text) => ({ text, portrait })), speaker);
                const known = heardBy(villager.id);
                if (!known.has(topic.id)) {
                    known.add(topic.id);
                    relationships.add(villager.id, options.topicPoints ?? 15);
                }
            } else if (choice.kind === 'chat') {
                chats += 1;
                await dialogue.say([{ text: pick(chats), portrait }], speaker);
            }
        }
    }

    /** Topics on offer: unlocked ones, the unheard first, capped so the list stays short. */
    function availableTopics(villager: VillagerDefinition, context: VillagerContext): VillagerTopic[] {
        const known = heardBy(villager.id);
        return (villager.topics ?? [])
            .filter((topic) => context.hearts >= (topic.minHearts ?? 0) && context.day >= (topic.minDay ?? 0))
            .sort((a, b) => Number(known.has(a.id)) - Number(known.has(b.id)))
            .slice(0, options.maxTopics ?? 3);
    }

    function hearts(id: string): string {
        const count = relationships.hearts(id);
        return `${'♥'.repeat(count)}${'♡'.repeat(Math.max(0, 5 - count))}`;
    }

    type Saved = { relationships?: ReturnType<Relationships['toJSON']>; requests?: ReturnType<RequestBoard['toJSON']>; heard?: Record<string, string[]>; met?: string[] };
    game.save.register('villagers', {
        save: (): Saved => ({
            relationships: relationships.toJSON(),
            ...(requests ? { requests: requests.toJSON() } : {}),
            heard: Object.fromEntries([...heard].map(([id, set]) => [id, [...set]])),
            met: [...met],
        }),
        load: (data) => {
            const saved = data as Saved | undefined;
            relationships.fromJSON(saved?.relationships);
            requests?.fromJSON(saved?.requests);
            heard.clear();
            for (const [id, topics] of Object.entries(saved?.heard ?? {})) heard.set(id, new Set(topics));
            met.clear();
            for (const id of saved?.met ?? []) met.add(id);
            refreshMarkers();
        },
    });

    return {
        dialogue,
        relationships,
        requests,
        talkTo,
        hasMet: (id) => met.has(id),
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
