import * as THREE from 'three';

import { Synth } from '../audio/synth';
import { SYSTEM_ORDER } from '../core/systems';
import { div, setText } from '../helpers/dom';

//#region Juice

/**
 * The small answers a game gives to everything the player does: a blip and a
 * hop when something is picked up, a jingle and a banner when a job is done, a
 * held breath when a blow just misses. None of it changes the rules. All of it
 * is why doing the same thing for the fortieth time still feels good.
 *
 * ```ts
 * const juice = addJuice(game);
 * juice.reward(plot.position, '+1 turnip');     // text, sparkle, blip
 * juice.pop(plantMesh);                         // a quick squash and stretch
 * juice.banner('Request filled', '+54c');
 * juice.chime('coin');
 * ```
 */
export type ChimeName = 'pickup' | 'plant' | 'water' | 'coin' | 'success' | 'fanfare' | 'error' | 'tick' | 'close';

export type JuiceHandle = {
    readonly synth: Synth;
    /** A named sound. Each is a few notes, pitched a little differently every time so repeats do not grate. */
    chime: (name: ChimeName) => void;
    /** A quick scale punch on an object: out and back in a quarter of a second. */
    pop: (object: THREE.Object3D, strength?: number) => void;
    /** Floating text, a small burst of sparks and the pickup blip at a place in the world. */
    reward: (position: THREE.Vector3, text: string, options?: { color?: THREE.ColorRepresentation; chime?: ChimeName | false }) => void;
    /** A burst of sparks. */
    sparkle: (position: THREE.Vector3, color?: THREE.ColorRepresentation, count?: number) => void;
    /** Freeze the action for a few frames so a hit lands. */
    hitStop: (seconds?: number) => void;
    /** Slow the world briefly, e.g. for a blow that just missed. */
    slowMo: (seconds?: number, scale?: number) => void;
    /** A line across the middle of the screen that fades by itself. */
    banner: (title: string, subtitle?: string, options?: { color?: string; seconds?: number }) => void;
    dispose: () => void;
};

/** Notes by name, in hertz. C major pentatonic over two octaves: everything played from it sounds agreeable. */
const NOTE = { C4: 261.6, D4: 293.7, E4: 329.6, G4: 392, A4: 440, C5: 523.3, D5: 587.3, E5: 659.3, G5: 784, A5: 880, C6: 1046.5 };

export function addJuice(game: Game): JuiceHandle {
    const synth = new Synth(game);
    const banner = div('banner click-through is-hidden', undefined, game.hud.root);
    const bannerTitle = div('banner-title', '', banner);
    const bannerSub = div('banner-sub', '', banner);
    let bannerTimer = 0;
    const pops: Array<{ object: THREE.Object3D; base: THREE.Vector3; elapsed: number; strength: number }> = [];
    // A hair of random pitch, so the hundredth pickup is not the same sound as the first.
    const vary = (frequency: number): number => frequency * (1 + (Math.random() - 0.5) * 0.04);

    const chime = (name: ChimeName): void => {
        if (name === 'pickup') synth.notes([NOTE.E5, NOTE.A5].map(vary), 0.06, { gain: 0.09, duration: 0.14 });
        else if (name === 'plant') synth.notes([NOTE.G4, NOTE.C5].map(vary), 0.07, { gain: 0.08, type: 'sine' });
        else if (name === 'water') synth.notes([NOTE.A5, NOTE.G5, NOTE.E5].map(vary), 0.05, { gain: 0.05, type: 'sine', duration: 0.1 });
        else if (name === 'coin') synth.notes([NOTE.E5, NOTE.G5, NOTE.C6].map(vary), 0.06, { gain: 0.09, type: 'square', duration: 0.1 });
        else if (name === 'success') synth.notes([NOTE.C5, NOTE.E5, NOTE.G5, NOTE.C6], 0.09, { gain: 0.11, duration: 0.3 });
        else if (name === 'fanfare') synth.notes([NOTE.C5, NOTE.E5, NOTE.G5, NOTE.E5, NOTE.G5, NOTE.C6], 0.12, { gain: 0.12, duration: 0.45 });
        else if (name === 'error') synth.notes([NOTE.D4, NOTE.C4], 0.1, { gain: 0.08, type: 'square', duration: 0.14 });
        else if (name === 'close') synth.notes([NOTE.A5, NOTE.E5].map(vary), 0.04, { gain: 0.07, type: 'sine', duration: 0.25 });
        else synth.tone({ frequency: vary(NOTE.C6), duration: 0.04, type: 'square', gain: 0.03 });
    };

    const removeSystem = game.systems.add({
        name: 'juice',
        order: SYSTEM_ORDER.EFFECTS,
        always: true,
        update: () => {
            // Real time: a banner and a pop must finish even while a panel has the clock stopped.
            const delta = Math.min(0.05, game.time.rawDelta || 0.016);
            for (const pop of [...pops]) {
                pop.elapsed += delta;
                const t = Math.min(1, pop.elapsed / 0.26);
                // Out fast, back with a small overshoot.
                const swell = Math.sin(t * Math.PI) * pop.strength * (1 - t * 0.4);
                pop.object.scale.copy(pop.base).multiplyScalar(1 + swell);
                if (t >= 1) {
                    pop.object.scale.copy(pop.base);
                    pops.splice(pops.indexOf(pop), 1);
                }
            }
            if (bannerTimer > 0) {
                bannerTimer -= delta;
                if (bannerTimer <= 0) banner.classList.add('is-hidden');
            }
        },
    });

    const sparkle = (position: THREE.Vector3, color: THREE.ColorRepresentation = 0xffe9a8, count = 10): void => {
        game.effects.particles.burst(position, { count, color, size: 0.05, speed: 2.2, lifetime: 0.5 });
    };

    return {
        synth,
        chime,
        pop: (object, strength = 0.28) => {
            const running = pops.find((pop) => pop.object === object);
            if (running) {
                running.elapsed = 0;
                running.strength = strength;
                return;
            }
            pops.push({ object, base: object.scale.clone(), elapsed: 0, strength });
        },
        reward: (position, text, options = {}) => {
            game.effects.text(position, text, { color: options.color ?? 0xffe9a8 });
            sparkle(position, options.color);
            if (options.chime !== false) chime(options.chime ?? 'pickup');
        },
        sparkle,
        hitStop: (seconds = 0.07) => game.time.slowMotion(seconds, 0.02),
        slowMo: (seconds = 0.5, scale = 0.35) => game.time.slowMotion(seconds, scale),
        banner: (title, subtitle = '', options = {}) => {
            setText(bannerTitle, title);
            setText(bannerSub, subtitle);
            banner.style.setProperty('--banner-color', options.color ?? '');
            banner.classList.remove('is-hidden');
            // Restart the entrance for a banner that replaces another.
            banner.classList.remove('is-in');
            void banner.offsetWidth;
            banner.classList.add('is-in');
            bannerTimer = options.seconds ?? 2.4;
        },
        dispose: () => {
            removeSystem();
            banner.remove();
        },
    };
}

//#endregion Juice

//#region Music box

/**
 * A tune that writes itself: single soft notes, a few seconds apart, wandering
 * up and down a scale. It never loops, so it never grates, and it leaves room
 * for the sounds that matter.
 *
 * ```ts
 * const music = addMusicBox(game, { scale: [220, 261.6, 293.7, 329.6, 392, 440] });
 * music.setScale(NIGHT_SCALE, { gap: [4, 9] });   // sparser and darker after dusk
 * ```
 */
export type MusicBoxOptions = {
    /** Frequencies to wander over, low to high. */
    scale: number[];
    /** Seconds between notes, rolled from this range. Defaults to 1.6 to 4. */
    gap?: [number, number];
    /** Loudness of a note before the music bus volume. Defaults to 0.06. */
    gain?: number;
    /** Return false to rest, e.g. in a menu or during a scare. */
    playing?: () => boolean;
};

export type MusicBoxHandle = {
    setScale: (scale: number[], options?: { gap?: [number, number] }) => void;
    dispose: () => void;
};

export function addMusicBox(game: Game, options: MusicBoxOptions): MusicBoxHandle {
    const synth = new Synth(game);
    let scale = options.scale;
    let gap = options.gap ?? [1.6, 4];
    let index = Math.floor(scale.length / 2);
    let wait = 2;
    let last = performance.now();
    const removeSystem = game.systems.add({
        name: 'music-box',
        order: SYSTEM_ORDER.EFFECTS,
        update: () => {
            const now = performance.now();
            wait -= Math.min(0.1, (now - last) / 1000);
            last = now;
            if (wait > 0 || options.playing?.() === false) return;
            wait = gap[0] + Math.random() * (gap[1] - gap[0]);
            // Mostly steps to a neighbouring note, now and then a leap, which is what makes it sound like a tune.
            const step = Math.random() < 0.75 ? (Math.random() < 0.5 ? -1 : 1) : Math.floor(Math.random() * 5) - 2;
            index = Math.max(0, Math.min(scale.length - 1, index + step));
            const frequency = scale[index] as number;
            const gain = options.gain ?? 0.06;
            synth.tone({ frequency, duration: 2.4, type: 'sine', gain, bus: 'music' });
            synth.tone({ frequency: frequency * 2, duration: 1.2, type: 'sine', gain: gain * 0.3, bus: 'music' });
            // Sometimes a second note a little later, a third above: a small answer to the first.
            if (Math.random() < 0.3) synth.tone({ frequency: scale[Math.min(scale.length - 1, index + 2)] as number, duration: 2, type: 'sine', gain: gain * 0.7, bus: 'music', delay: 0.4 });
        },
    });
    return {
        setScale: (next, extra) => {
            scale = next;
            gap = extra?.gap ?? gap;
            index = Math.min(index, scale.length - 1);
        },
        dispose: removeSystem,
    };
}

//#endregion Music box
