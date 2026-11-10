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
    /** The choice the player sees, e.g. "Ask about the last farmer". A function can show live numbers. */
    label: string | ((context: VillagerContext) => string);
    lines: string[] | ((context: VillagerContext) => string[]);
    /** Hidden until this many hearts. */
    minHearts?: number;
    /** Hidden until this day. */
    minDay?: number;
    /** Hidden while this returns false, e.g. until a deal is on the table. */
    visible?: (context: VillagerContext) => boolean;
    /** Always listed first, and never pushed out by the cap on topics. */
    pinned?: boolean;
    /**
     * Runs after the lines, with the conversation still open: ask a question
     * with `dialogue.say` and act on the answer. This is how a topic becomes a deal.
     */
    after?: (context: VillagerContext, dialogue: DialogueBox) => Promise<void> | void;
};

/** A place in a villager's day. `from` is an hour, 0 to 24. */
export type VillagerStop = { from: number; position: Vec3; yaw?: number };

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
    /**
     * Where they are through the day: the entry with the latest `from` hour that
     * has passed applies, and the last one carries over midnight. They walk from
     * one place to the next. Omit to stand at `position` all day.
     */
    schedule?: VillagerStop[];
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
    /**
     * Takes a job's deposit and returns whether the player could pay. Without it
     * jobs with a deposit are simply taken.
     */
    payDeposit?: (amount: number, request: Request) => boolean;
    /** Called when the player takes a job that needed a deposit. */
    onAccepted?: (request: Request) => void;
    /** Called for each request that ran out of time, e.g. to tell the player and cool the friendship. */
    onExpired?: (request: Request) => void;
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
    /** The hour of the day, 0 to 24, for schedules. */
    hour?: () => number;
    /** Ground height, so a walking villager follows the terrain. */
    heightAt?: (x: number, z: number) => number;
    /** Meters per second between stops. Defaults to 1.3. */
    walkSpeed?: number;
    /** Called every frame per villager with their speed, for walk animations. */
    animate?: (id: string, speed: number, delta: number) => void;
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
    /** Put everyone where their schedule says, without the walk, e.g. after sleeping or loading. */
    snapToSchedule: () => void;
    /** Call each morning: expires overdue requests and asks for new ones. */
    newDay: () => void;
    dispose: () => void;
};

type Choice = { kind: 'chat' | 'gift' | 'deliver' | 'offer' | 'bye' } | { kind: 'topic'; topic: VillagerTopic };

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

    /** Where a villager should be right now, by schedule or by their one fixed spot. */
    const stopFor = (villager: VillagerDefinition): { position: Vec3; yaw: number } => {
        const hour = options.hour?.();
        const stops = villager.schedule;
        if (hour === undefined || !stops || stops.length === 0) return { position: villager.position, yaw: villager.yaw ?? 0 };
        const sorted = [...stops].sort((a, b) => a.from - b.from);
        const current = [...sorted].reverse().find((stop) => stop.from <= hour) ?? (sorted[sorted.length - 1] as VillagerStop);
        return { position: current.position, yaw: current.yaw ?? villager.yaw ?? 0 };
    };
    const snapToSchedule = (): void => {
        for (const villager of options.villagers) {
            const stop = stopFor(villager);
            villager.object.position.set(stop.position.x, stop.position.y, stop.position.z);
            villager.object.rotation.y = stop.yaw;
        }
    };
    snapToSchedule();

    // Villagers walk to where their day takes them, and turn to face whoever is near.
    removers.push(
        game.systems.add({
            name: 'villagers',
            order: SYSTEM_ORDER.GAMEPLAY + 2,
            always: true,
            update: (delta) => {
                const player = game.player?.position;
                // Nobody walks while the game is paused or someone is being spoken to.
                const moving = game.state.is('playing') && !game.time.isPaused && !talking;
                for (const villager of options.villagers) {
                    const object = villager.object;
                    const stop = stopFor(villager);
                    const dx = stop.position.x - object.position.x;
                    const dz = stop.position.z - object.position.z;
                    const distance = Math.hypot(dx, dz);
                    let speed = 0;
                    if (distance > 0.15 && moving) {
                        speed = Math.min(options.walkSpeed ?? 1.3, distance / Math.max(delta, 1e-4));
                        object.position.x += (dx / distance) * speed * delta;
                        object.position.z += (dz / distance) * speed * delta;
                        object.position.y = options.heightAt?.(object.position.x, object.position.z) ?? stop.position.y;
                        object.rotation.y = dampAngle(object.rotation.y, Math.atan2(dx, dz), 0.01, delta);
                    } else {
                        const near = player && object.position.distanceToSquared(player) < 36;
                        const goal = near ? Math.atan2(player.x - object.position.x, player.z - object.position.z) : stop.yaw;
                        object.rotation.y = dampAngle(object.rotation.y, goal, 0.02, delta);
                    }
                    options.animate?.(villager.id, speed, moving ? delta : 0);
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
        const money = (amount: number): string => options.formatReward?.(amount) ?? String(amount);
        /** A job with a deposit: say what it is, ask yes or no, and take the money on a yes. */
        const offer = async (job: Request): Promise<void> => {
            const answer = await dialogue.say<boolean>(
                [
                    { text: `${job.text} (${money(job.reward)}, by day ${job.dueDay})`, portrait },
                    {
                        text: `It is a lot to ask, so I will want ${money(job.deposit)} from you first. You get it back with your pay. If the day passes, I keep it. Will you do it?`,
                        portrait,
                        choices: [
                            { label: `Yes, pay ${money(job.deposit)}`, value: true },
                            { label: 'No, not now', value: false },
                        ],
                    },
                ],
                speaker,
            );
            if (!answer || !requests) return;
            if (requests.accept(job, (amount) => options.payDeposit?.(amount, job) ?? true)) {
                options.onAccepted?.(job);
                await dialogue.say([{ text: 'Good. I will be waiting.', portrait }], speaker);
            } else {
                await dialogue.say([{ text: 'You have not got it on you. Come back when you do.', portrait }], speaker);
            }
        };
        if (request && !request.accepted) {
            await dialogue.say(opening, speaker);
            opening = [];
            await offer(request);
        } else if (request && !requests?.canFulfil(request, items)) {
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
            if (open && !open.accepted) choices.push({ label: `About the job (deposit ${money(open.deposit)})`, value: { kind: 'offer' } });
            if (options.gifts !== false && held && relationships.canGift(villager.id)) choices.push({ label: `Give ${nameOf(held)}`, value: { kind: 'gift' } });
            for (const topic of availableTopics(villager, context())) choices.push({ label: typeof topic.label === 'function' ? topic.label(context()) : topic.label, value: { kind: 'topic', topic } });
            choices.push({ label: 'Chat', value: { kind: 'chat' } }, { label: 'Goodbye', value: { kind: 'bye' } });

            const choice = await dialogue.say<Choice>([...opening, { text: hearts(villager.id), portrait, choices }], speaker);
            opening = [];
            if (!choice || choice.kind === 'bye') return;

            if (choice.kind === 'offer' && open) {
                await offer(open);
            } else if (choice.kind === 'deliver' && open && requests) {
                const done = requests.fulfil(open, items);
                if (done) {
                    // The deposit comes back with the pay.
                    options.onPaid?.(done.reward + done.deposit, done);
                    relationships.add(villager.id, done.friendship);
                    const thanks = villager.thanks?.[done.id % villager.thanks.length] ?? 'Thank you.';
                    await dialogue.say([{ text: `${thanks} (+${money(done.reward)}${done.deposit > 0 ? `, and your ${money(done.deposit)} back` : ''})`, portrait }], speaker);
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
                await topic.after?.(context(), dialogue);
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
        const open = (villager.topics ?? []).filter((topic) => context.hearts >= (topic.minHearts ?? 0) && context.day >= (topic.minDay ?? 0) && topic.visible?.(context) !== false);
        const ordinary = open
            .filter((topic) => !topic.pinned)
            .sort((a, b) => Number(known.has(a.id)) - Number(known.has(b.id)))
            .slice(0, options.maxTopics ?? 3);
        return [...open.filter((topic) => topic.pinned), ...ordinary];
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
            snapToSchedule();
        },
    });

    return {
        dialogue,
        relationships,
        requests,
        talkTo,
        hasMet: (id) => met.has(id),
        snapToSchedule,
        newDay: () => {
            for (const lapsed of requests?.expire() ?? []) options.onExpired?.(lapsed);
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
