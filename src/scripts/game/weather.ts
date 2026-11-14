import * as THREE from 'three';

import { SYSTEM_ORDER } from '../core/systems';
import { addRandomEvents } from '../kit';
import type { LoopHandle, Synth } from '../audio/synth';

/**
 * Weather in the valley: three kinds, each of which changes what is wise to do.
 *
 *  - Rain waters the field every hour it falls, and food in the basket cools
 *    half as fast again.
 *  - A thick Veil doubles down on the fog and takes the compass away.
 *  - A clear night comes on at dusk: the fog thins and only half of them walk.
 *
 * A banner says what each one does as it starts, and the line under the task
 * plate repeats it for as long as it lasts.
 */
export type WeatherId = 'rain' | 'thick' | 'clear';

export const WEATHER: Record<WeatherId, { title: string; effect: string; line: string; hours: [number, number]; fog: number; cooling: number; hollow: number }> = {
    rain: { title: 'Rain', effect: 'It waters the field. Food cools faster.', line: ':rain: Rain: the field is watered, food cools faster', hours: [3, 7], fog: 1.1, cooling: 1.5, hollow: 1 },
    thick: { title: 'The Veil is thick', effect: 'The compass is no use until it thins.', line: ':fog: Thick Veil: no compass', hours: [4, 8], fog: 1.45, cooling: 1, hollow: 1 },
    clear: { title: 'A clear night', effect: 'Fewer of them walk. A good night for a long round.', line: ':sparkle: Clear night: fewer of them walk', hours: [9, 10], fog: 0.6, cooling: 1, hollow: 0.5 },
};

export type WeatherOptions = {
    /** In-game hours since the first morning. */
    clock: () => number;
    /** The hour of the day, 0 to 24. */
    hour: () => number;
    /** No weather starts while this is false. */
    enabled: () => boolean;
    /** Under a roof: the rain is not drawn. */
    sheltered: () => boolean;
    synth: Synth;
    /** Water what is planted. Returns how many plots it did. */
    waterField: () => number;
    setCompass: (visible: boolean) => void;
    banner: (title: string, effect: string) => void;
};

export type WeatherHandle = {
    readonly id: WeatherId | undefined;
    /** Multiplies the fog. Eases in and out. */
    readonly fog: number;
    /** Multiplies how fast food cools. */
    readonly cooling: number;
    /** Multiplies how many Hollow walk. */
    readonly hollow: number;
    /** What to show while it lasts, or an empty string. */
    readonly line: string;
    /** In-game hours left. */
    readonly remaining: number;
    force: (id: WeatherId, hours?: number) => void;
    stop: () => void;
    /** For tests: no weather starts by itself while held. */
    hold: (held: boolean) => void;
};

const STREAKS = 520;
const REACH = 16;

export function setupWeather(game: Game, options: WeatherOptions): WeatherHandle {
    let held = false;
    let fog = 1;
    let wateredAt = -1;
    let hiss: LoopHandle | undefined;

    // Rain: short falling lines in a box that travels with the camera.
    const points = new Float32Array(STREAKS * 6);
    const drops = Array.from({ length: STREAKS }, () => new THREE.Vector3((Math.random() - 0.5) * REACH * 2, Math.random() * 12, (Math.random() - 0.5) * REACH * 2));
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(points, 3));
    const rain = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: 0xdfe6e6, transparent: true, opacity: 0.7, fog: false, depthWrite: false }));
    rain.frustumCulled = false;
    rain.visible = false;
    game.scene.add(rain);

    const deck = addRandomEvents(game, {
        id: 'weather',
        clock: options.clock,
        gap: [10, 26],
        firstAfter: 6,
        enabled: () => !held && options.enabled(),
        events: [
            { id: 'rain', weight: 3, duration: WEATHER.rain.hours, cooldown: 12 },
            { id: 'thick', weight: 2, duration: WEATHER.thick.hours, cooldown: 24 },
            // Only ever starts at dusk, so it is the whole night that is clear.
            { id: 'clear', weight: 3, duration: WEATHER.clear.hours, cooldown: 30, when: () => options.hour() >= 18 && options.hour() < 21 },
        ],
        onStart: (event, resumed) => {
            const kind = WEATHER[event.id as WeatherId];
            if (!resumed) options.banner(kind.title, kind.effect);
            if (event.id === 'thick') options.setCompass(false);
            if (event.id === 'rain') hiss = options.synth.wind({ level: 0.09 });
        },
        onEnd: (event) => {
            if (event.id === 'thick') options.setCompass(true);
            hiss?.stop(3);
            hiss = undefined;
            wateredAt = -1;
        },
    });
    const current = (): WeatherId | undefined => deck.current?.id as WeatherId | undefined;

    game.systems.add({
        name: 'weather',
        order: SYSTEM_ORDER.EFFECTS - 1,
        update: (delta) => {
            const id = current();
            fog += ((id ? WEATHER[id].fog : 1) - fog) * Math.min(1, delta * 0.4);
            const raining = id === 'rain';
            if (raining) {
                // Once as it starts, and again every hour it keeps falling.
                const hour = Math.floor(options.clock());
                if (hour !== wateredAt) {
                    wateredAt = hour;
                    options.waterField();
                }
            }
            rain.visible = raining && !options.sheltered();
            if (!rain.visible) return;
            const camera = game.camera.position;
            for (let index = 0; index < STREAKS; index += 1) {
                const drop = drops[index] as THREE.Vector3;
                drop.y -= 15 * delta;
                if (drop.y < -2) drop.set((Math.random() - 0.5) * REACH * 2, 10 + Math.random() * 2, (Math.random() - 0.5) * REACH * 2);
                points.set([camera.x + drop.x, camera.y + drop.y, camera.z + drop.z, camera.x + drop.x + 0.05, camera.y + drop.y - 0.9, camera.z + drop.z], index * 6);
            }
            (geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
        },
    });

    return {
        get id() {
            return current();
        },
        get fog() {
            return fog;
        },
        get cooling() {
            const id = current();
            return id ? WEATHER[id].cooling : 1;
        },
        get hollow() {
            const id = current();
            return id ? WEATHER[id].hollow : 1;
        },
        get line() {
            const id = current();
            return id ? WEATHER[id].line : '';
        },
        get remaining() {
            return deck.remaining;
        },
        force: (id, hours) => void deck.force(id, hours),
        stop: () => deck.stop(),
        hold: (value) => {
            held = value;
        },
    };
}
