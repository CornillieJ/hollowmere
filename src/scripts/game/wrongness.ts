import * as THREE from 'three';

import { SYSTEM_ORDER } from '../core/systems';
import type { PanelRow } from '../ui/list-panel';
import type { Terrain } from '../kit';
import { FARM, ROAD } from '../content/world';
import { createFolk, dressFolk, type FolkRig } from '../content/folk';
import { MODELS, boxHouse, model } from './world';

/**
 * The valley goes wrong by degrees.
 *
 * Nothing here is a threat and nothing is explained. Each thing starts on a
 * set day and gets a little worse, so the place the farmer knew on the first
 * morning is not quite the place they are standing in a fortnight later:
 *
 *  - the scarecrow is nearer the house every morning, until somebody carries it back;
 *  - the signpost at the gate says something else;
 *  - people deny yesterday;
 *  - there is a house in the woods by the road, with a light on, that is not there;
 *  - somebody stands on the road at dusk who looks like the farmer;
 *  - the clock slips;
 *  - things were done in the night.
 *
 * What the farmer has noticed is kept, in their own words, for the notebook.
 */
export type WrongId = 'scarecrow' | 'sign' | 'denial' | 'house' | 'double' | 'clock' | 'night';

export const WRONG_FROM: Record<WrongId, number> = { sign: 2, scarecrow: 3, denial: 4, clock: 5, house: 6, night: 7, double: 8 };

const NOTES: Record<WrongId, { title: string; text: string }> = {
    scarecrow: { title: 'The scarecrow', text: 'It is nearer the house each morning, and it faces the door. I carry it back. I do not remember ever moving it.' },
    sign: { title: 'The signpost', text: 'The board at the gate does not say what it said. Nobody has painted it. The paint is old.' },
    denial: { title: 'Yesterday', text: 'I talked to them yesterday. They say I did not, and they are not lying. They never lie.' },
    house: { title: 'The house in the woods', text: 'A house off the road, with a lamp in the window. When I walked up to it there was grass, and not a mark on the grass.' },
    double: { title: 'Somebody on the road', text: 'Standing still, at dusk, a long way down the road. My coat. My ears. Nobody there when I reached the place.' },
    clock: { title: 'The hour', text: 'For a moment it was a time that is not a time. Then it was the right one again, and I could not swear to which is true.' },
    night: { title: 'In the night', text: 'Things are done before I wake. The field watered. A second plate. I live alone here.' },
};

export type WrongnessOptions = {
    terrain: Terrain;
    day: () => number;
    hour: () => number;
    /** The scarecrow in the yard, where the yard builder put it. */
    scarecrow: THREE.Object3D;
    /** Say something once in the farmer's own voice. Returns nothing; safe to call every frame. */
    think: (id: string, lines: string[]) => void;
    /** True once the farmer has stayed for good: then nothing is wrong any more. */
    settled?: () => boolean;
    /** Water whatever is planted and dry. Returns how many plots it did. */
    waterField: () => number;
    onNoticed?: (id: WrongId, count: number) => void;
};

export type WrongnessHandle = {
    readonly noticed: ReadonlySet<WrongId>;
    /** How far along the valley is: 0 on the first day, 4 after a fortnight. */
    readonly level: number;
    /** Call each morning after a night in bed. Returns rows for the morning summary. */
    newDay: () => PanelRow[];
    /** What somebody says instead of their own line today, if they deny yesterday. Call when a talk starts. */
    denial: (id: string) => string | undefined;
    /** Tell it a talk happened, so there is a yesterday to deny. */
    talked: (id: string) => void;
    /** What the clock reads when it is slipping, or nothing. */
    clock: () => string | undefined;
    /** The label over the task plate. */
    questLabel: () => string;
    /** Rows for the notebook. */
    rows: () => PanelRow[];
    /** For trying things out: make one of them happen now. */
    force: (id: WrongId) => void;
    readonly scarecrowSteps: number;
    readonly double: THREE.Object3D;
    readonly house: THREE.Object3D;
    readonly sign: { text: () => [string, string] };
    toJSON: () => unknown;
    fromJSON: (data: unknown) => void;
};

const DENIALS: Record<string, string> = {
    barnaby: 'Yesterday? You were not in yesterday. I have the book open here: there is a line ruled for you, and nothing written on it.',
    wren: 'We did not talk yesterday! I would remember. I talked to the other one. The one who looks like you from behind.',
    fen: 'I did not see you yesterday. I called at your door and it was opened, but not by you. I know your face. That one had it on wrong.',
    hollis: 'Yesterday, dear? No. Yesterday you sat with me the whole afternoon and never said a word. I thought it so restful.',
    pike: 'You were not here yesterday. Your smell was. It went twice round the square and then home, without you.',
};

/** What the board at the gate says, by how far along things are. */
const SIGNS: Array<[string, string]> = [
    ['HOLLOWVEIL  >', '1 mile'],
    ['HOLLOWVEIL  >', 'not far'],
    ['<  HOLLOWVEIL', 'you live here'],
    ['HOLLOWVEIL', 'there is no other place'],
    ['STAY', 'we like you'],
];

const NIGHT_ROWS: Array<{ icon: string; title: string }> = [
    { icon: '🍽', title: 'There were 2 plates on the table' },
    { icon: '🛏', title: 'The bed was made. You were in it' },
    { icon: '🚪', title: 'The door was bolted from the outside' },
    { icon: '🧥', title: 'Your coat was wet. It did not rain' },
    { icon: '🕯', title: 'A candle had burned down on the sill. You own no such candle' },
];

/** Spots off the road where the house that is not there stands, one a day. */
const HOUSE_SPOTS = [
    { x: -6, z: 34, yaw: 2.4 },
    { x: 30, z: -2, yaw: -2.2 },
    { x: -30, z: 12, yaw: 0.9 },
    { x: 14, z: -26, yaw: 0.6 },
];

export const SIGN_SPOT = { x: -44.5, z: 43.2 };
const SCARECROW_POST = { x: -48, z: 40.2 };
/** Meters nearer the door each night, and how near it will come: the edge of the porch light. */
const SCARECROW_STEP = 3.4;
const SCARECROW_STOPS = 9.2;

export function setupWrongness(game: Game, options: WrongnessOptions): WrongnessHandle {
    const { terrain } = options;
    const noticed = new Set<WrongId>();
    const settled = (): boolean => options.settled?.() === true;
    const active = (id: WrongId): boolean => !settled() && options.day() >= WRONG_FROM[id];
    const notice = (id: WrongId, lines: string[]): void => {
        options.think(`wrong-${id}`, lines);
        if (noticed.has(id)) return;
        noticed.add(id);
        options.onNoticed?.(id, noticed.size);
    };
    const level = (): number => {
        const day = options.day();
        return day >= 12 ? 4 : day >= 8 ? 3 : day >= 5 ? 2 : day >= 3 ? 1 : 0;
    };

    //#region The scarecrow

    let steps = 0;
    const doorDirection = new THREE.Vector2(FARM.door.x - SCARECROW_POST.x, FARM.door.z - SCARECROW_POST.z);
    const toDoor = doorDirection.length();
    doorDirection.normalize();
    const standScarecrow = (): void => {
        const along = Math.min(steps * SCARECROW_STEP, toDoor - SCARECROW_STOPS);
        const x = SCARECROW_POST.x + doorDirection.x * along;
        const z = SCARECROW_POST.z + doorDirection.y * along;
        options.scarecrow.position.copy(terrain.point(x, z, 0));
        // It faces the door from wherever it stands.
        options.scarecrow.rotation.y = Math.atan2(FARM.door.x - x, FARM.door.z - z);
    };
    game.interactions.add(options.scarecrow, {
        prompt: 'Carry the scarecrow back to its post',
        range: 2.4,
        canInteract: () => steps > 0,
        onInteract: () => {
            steps = 0;
            standScarecrow();
            game.toasts.push('It is lighter than it looks. It is back on its post.', { color: '#c8c0b0' });
        },
    });

    //#endregion

    //#region The signpost

    const signLevel = (): number => (active('sign') ? Math.min(SIGNS.length - 1, 1 + level()) : 0);
    const signText = (): [string, string] => (settled() ? ['HOLLOWVEIL', 'home'] : (SIGNS[signLevel()] as [string, string]));
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 96;
    const texture = new THREE.CanvasTexture(canvas);
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.colorSpace = THREE.SRGBColorSpace;
    let painted = -1;
    const paintSign = (): void => {
        const shown = settled() ? 99 : signLevel();
        if (painted === shown) return;
        painted = shown;
        const context = canvas.getContext('2d');
        if (!context) return;
        const [top, bottom] = signText();
        context.fillStyle = '#b4a888';
        context.fillRect(0, 0, 256, 96);
        context.fillStyle = '#978b6c';
        for (let y = 0; y < 96; y += 12) context.fillRect(0, y, 256, 1);
        context.fillStyle = '#1e1a14';
        context.textAlign = 'center';
        // Heavy block letters: thin ones are lost at the picture's low resolution.
        context.font = '900 31px Arial Black, Impact, sans-serif';
        context.fillText(top, 128, 44, 244);
        context.font = 'bold 22px Arial, sans-serif';
        context.fillText(bottom.toUpperCase(), 128, 78, 244);
        texture.needsUpdate = true;
    };
    const signpost = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ color: 0x3e3226, roughness: 1, flatShading: true });
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.14, 2.6, 0.14), wood);
    post.position.y = 1.3;
    post.castShadow = true;
    // Lit a little from within, or the letters are lost in the Veil at any distance.
    const face = new THREE.MeshStandardMaterial({ map: texture, roughness: 1, emissive: 0xffffff, emissiveMap: texture, emissiveIntensity: 0.45 });
    // Nailed to the front of the post, so the post does not stand through the words.
    const board = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.98, 0.06), [wood, wood, wood, wood, face, wood]);
    board.position.set(0, 2.1, 0.1);
    board.castShadow = true;
    signpost.add(post, board);
    // Where the road leaves the yard, turned to be read from the house.
    signpost.position.copy(terrain.point(SIGN_SPOT.x, SIGN_SPOT.z, 0));
    signpost.rotation.y = Math.atan2(FARM.door.x - SIGN_SPOT.x, FARM.door.z - SIGN_SPOT.z);
    game.scene.add(signpost);
    paintSign();
    let signRead = 0;
    game.interactions.add(signpost, {
        prompt: 'Read the signpost',
        range: 2.4,
        onInteract: () => {
            const [top, bottom] = signText();
            const changed = signLevel() !== signRead;
            const first = signRead === 0 && signLevel() === 0;
            signRead = signLevel();
            const way = top.includes('>') ? 'It points up the road. ' : top.includes('<') ? 'It points back at the farm. ' : '';
            game.toasts.push(`The signpost reads: "${top.replace(/[<>]/g, '').trim()}, ${bottom}". ${way}`.trim(), { color: '#e8e0c8' });
            if (changed && !first && signLevel() > 0) notice('sign', [`"${bottom}." It did not say that. It said a mile.`, 'Nobody has painted it. The paint is old and cracked right through the letters.']);
        },
    });

    //#endregion

    //#region Yesterday

    const lastTalk = new Map<string, number>();
    const denied = new Map<string, number>();
    const denial = (id: string): string | undefined => {
        const day = options.day();
        if (!active('denial') || !DENIALS[id]) return undefined;
        if (denied.get(id) === day) return DENIALS[id];
        // Only somebody who was spoken to yesterday can say they were not, and not every time.
        if (lastTalk.get(id) !== day - 1 || (day + id.length) % 2 !== 0) return undefined;
        denied.set(id, day);
        pendingDenial = true;
        return DENIALS[id];
    };
    let pendingDenial = false;

    //#endregion

    //#region The house that is not there

    const house = new THREE.Group();
    house.visible = false;
    game.scene.add(house);
    void model(game, MODELS.houseB, () => boxHouse(0x7a7064, 0x3a3030)).then((object) => house.add(object));
    const windowGlow = new THREE.PointLight(0xffc070, 10, 16, 1.5);
    windowGlow.position.set(0, 2.2, 4.8);
    house.add(windowGlow);
    let houseGoneOn = 0;
    const placeHouse = (): void => {
        const spot = HOUSE_SPOTS[options.day() % HOUSE_SPOTS.length] as { x: number; z: number; yaw: number };
        house.position.copy(terrain.point(spot.x, spot.z, 0));
        house.rotation.y = spot.yaw;
        house.visible = active('house') && houseGoneOn !== options.day();
    };

    //#endregion

    //#region Somebody on the road

    const rig: FolkRig = createFolk({ species: 'cat', fur: 0x2b2522, accent: 0xd9b8a0, clothes: 0x6b4f3a });
    void dressFolk(game, rig, 'farmer');
    const double = rig.root;
    double.visible = false;
    game.scene.add(double);
    let doubleTimer = 20;
    const dusk = (): boolean => options.hour() >= 17 || options.hour() < 5;
    /** A point on the road this far from the farmer, if the road has one. */
    const roadPointNear = (from: THREE.Vector3, min: number, max: number): THREE.Vector3 | undefined => {
        const candidates: THREE.Vector3[] = [];
        for (let index = 0; index < ROAD.length - 1; index += 1) {
            const a = ROAD[index] as { x: number; z: number };
            const b = ROAD[index + 1] as { x: number; z: number };
            for (let t = 0; t < 1; t += 0.125) {
                const x = a.x + (b.x - a.x) * t;
                const z = a.z + (b.z - a.z) * t;
                const distance = Math.hypot(x - from.x, z - from.z);
                if (distance >= min && distance <= max) candidates.push(terrain.point(x, z, 0));
            }
        }
        return candidates[Math.floor(Math.random() * candidates.length)];
    };

    //#endregion

    //#region The clock

    let slipTimer = 50;
    let slipLeft = 0;
    let slipText = '';
    let slips = 0;
    const SLIPS = ['25:61', '00:00', '13:13', '--:--', '07:00', '99:99'];

    //#endregion

    game.systems.add({
        name: 'wrongness',
        order: SYSTEM_ORDER.GAMEPLAY + 9,
        update: (delta) => {
            const player = game.player;
            if (!player) return;
            paintSign();

            if (steps > 0 && active('scarecrow') && player.position.distanceTo(options.scarecrow.position) < 11) {
                notice('scarecrow', ['The scarecrow is not where it was. It is nearer the house.', 'I must have moved it. I must have.']);
                if (steps * SCARECROW_STEP >= toDoor - SCARECROW_STOPS) options.think('wrong-scarecrow-door', ['The scarecrow is at the edge of the porch light. Facing the door.', 'I did not put it there. I am going to carry it back, and I am not going to think about it.']);
            }

            if (pendingDenial && !game.screens.blocksInput) {
                pendingDenial = false;
                notice('denial', ['I did speak to them yesterday. I remember what was said.', 'They are not lying. Nobody here lies. So one of us was somewhere else yesterday, and they seem very sure it was me.']);
            }

            if (house.visible && Math.hypot(player.position.x - house.position.x, player.position.z - house.position.z) < 15) {
                house.visible = false;
                houseGoneOn = options.day();
                game.effects.flash(0.25, 0xffffff, 0.25);
                notice('house', ['There was a house here. A lamp in the window. I saw it from the road.', 'There is not a mark on the grass.']);
            }

            // Somebody on the road at dusk. Never close, never moving, gone when reached.
            if (double.visible) {
                const distance = double.position.distanceTo(player.position);
                double.rotation.y = Math.atan2(player.position.x - double.position.x, player.position.z - double.position.z);
                if (distance < 17) {
                    double.visible = false;
                    doubleTimer = 150;
                    notice('double', ['Somebody was standing in the road. Standing quite still. My coat. My ears.', 'There is nobody here now. There are no tracks but mine, and mine come from both directions.']);
                } else if (distance > 75 || !dusk()) {
                    double.visible = false;
                    doubleTimer = 30;
                }
            } else if (active('double') && dusk()) {
                doubleTimer -= delta;
                if (doubleTimer <= 0) {
                    doubleTimer = 25;
                    const spot = roadPointNear(player.position, 30, 46);
                    if (spot) {
                        double.position.copy(spot);
                        double.visible = true;
                    }
                }
            }

            // The clock slips for a moment, now and then, from the fifth day.
            if (slipLeft > 0) {
                slipLeft -= delta;
                if (slipLeft <= 0 && slips >= 2) notice('clock', ['The hour. For a moment it was not an hour at all.', 'It is right again now. I think it is right.']);
            } else if (active('clock')) {
                slipTimer -= delta;
                if (slipTimer <= 0) {
                    slipTimer = 45 + Math.random() * 70;
                    slipLeft = 1.3;
                    slips += 1;
                    slipText = SLIPS[Math.floor(Math.random() * SLIPS.length)] as string;
                }
            }
        },
    });

    return {
        noticed,
        get level() {
            return level();
        },
        newDay: () => {
            const day = options.day();
            const rows: PanelRow[] = [];
            if (active('scarecrow')) steps += 1;
            else if (settled()) steps = 0;
            standScarecrow();
            if (settled()) double.visible = false;
            placeHouse();
            if (active('night')) {
                // Every third night it is the field: watered, properly, by nobody.
                const watered = day % 3 === 1 ? options.waterField() : 0;
                if (watered > 0) rows.push({ icon: '💧', title: 'The field was watered before you woke', detail: `${watered} plot${watered > 1 ? 's' : ''}. The can is where you left it, and dry.` });
                else rows.push(NIGHT_ROWS[day % NIGHT_ROWS.length] as PanelRow);
                if (!noticed.has('night')) {
                    noticed.add('night');
                    options.onNoticed?.('night', noticed.size);
                }
            }
            return rows;
        },
        denial,
        talked: (id) => lastTalk.set(id, options.day()),
        clock: () => (slipLeft > 0 ? slipText : undefined),
        questLabel: () => (settled() ? '✦ Today' : level() >= 4 ? '✦ You forgot something' : level() >= 3 ? "✦ Don't forget who you are" : "✦ Don't forget"),
        rows: () => {
            const ids = Object.keys(NOTES) as WrongId[];
            const seen = ids.filter((id) => noticed.has(id));
            return [
                { heading: true, title: `Things that are not right (${seen.length} of ${ids.length})` },
                ...(seen.length === 0 ? [{ title: 'Nothing yet.', detail: 'It is an ordinary valley. Everybody says so.', dim: true }] : []),
                ...seen.map((id) => ({ icon: '✎', title: NOTES[id].title, detail: NOTES[id].text })),
                ...(seen.length > 0 && seen.length < ids.length ? [{ title: 'There will be more. There is always a little more.', dim: true }] : []),
            ];
        },
        force: (id) => {
            if (id === 'scarecrow') {
                steps += 1;
                standScarecrow();
            } else if (id === 'house') {
                houseGoneOn = 0;
                placeHouse();
                house.visible = true;
            } else if (id === 'double') {
                doubleTimer = 0;
            } else if (id === 'clock') {
                slipTimer = 0;
            }
        },
        get scarecrowSteps() {
            return steps;
        },
        double,
        house,
        sign: { text: signText },
        toJSON: () => ({ noticed: [...noticed], steps, signRead, lastTalk: Object.fromEntries(lastTalk), houseGoneOn, slips }),
        fromJSON: (data) => {
            const saved = (data ?? {}) as { noticed?: WrongId[]; steps?: number; signRead?: number; lastTalk?: Record<string, number>; houseGoneOn?: number; slips?: number };
            noticed.clear();
            for (const id of saved.noticed ?? []) noticed.add(id);
            steps = saved.steps ?? 0;
            signRead = saved.signRead ?? 0;
            houseGoneOn = saved.houseGoneOn ?? 0;
            slips = saved.slips ?? 0;
            lastTalk.clear();
            for (const [id, day] of Object.entries(saved.lastTalk ?? {})) lastTalk.set(id, day);
            denied.clear();
            double.visible = false;
            standScarecrow();
            placeHouse();
        },
    };
}
