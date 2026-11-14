import { SYSTEM_ORDER } from '../core/systems';
import type { Synth } from '../audio/synth';

/**
 * Sounds that lie.
 *
 *  - Steps: out on foot late in the day, a second set of footsteps falls in a
 *    little after the farmer's own, and stops a little after the farmer stops.
 *  - A knock: three slow knocks on the barn door, at night, from the outside.
 *  - A voice: somebody from the village calling from out in the Veil, at an
 *    hour when they are at home.
 *
 * None of them is anything. Nothing comes of answering, and nothing follows.
 * The farmer remarks on each kind once.
 */
export type WhisperId = 'steps' | 'knock' | 'voice';

export type WhispersOptions = {
    synth: Synth;
    hour: () => number;
    night: () => boolean;
    /** False during the tutorial, a menu, or a talk. */
    enabled: () => boolean;
    inBarn: () => boolean;
    /** In the light, where nothing is heard. */
    safe: () => boolean;
    riding: () => boolean;
    /** Meters to the village square. */
    toVillage: () => number;
    /** The air is full: the Veil is thick. Voices carry by day as well. */
    thick: () => boolean;
    say: (line: string) => void;
    think: (id: string, lines: string[]) => void;
};

export type WhispersHandle = {
    /** How often each has been heard. */
    readonly heard: Record<WhisperId, number>;
    /** For tests: play one now, wherever the farmer is. */
    play: (id: WhisperId) => void;
};

const VOICES = [
    '"Is that you, dear? Come away from the road."',
    '"I can see you! Can you see me?"',
    '"Store is open. Store is always open."',
    '"Signed for. Signed for. Signed for."',
    '"Over here." It was your own voice.',
];

const between = (low: number, high: number): number => low + Math.random() * (high - low);

export function setupWhispers(game: Game, options: WhispersOptions): WhispersHandle {
    const { synth } = options;
    const heard: Record<WhisperId, number> = { steps: 0, knock: 0, voice: 0 };
    const wait: Record<WhisperId, number> = { steps: between(50, 110), knock: between(25, 60), voice: between(90, 180) };
    /** Seconds left of the steps that follow, and the beat they fall on. */
    let following = 0;
    let beat = 0;
    /** Steps still to fall after the farmer has stopped. */
    let trailing = 0;

    const footfall = (delay = 0): void => {
        window.setTimeout(() => synth.noise({ duration: 0.09, gain: 0.11, filter: 260 + Math.random() * 120 }), delay * 1000);
    };

    const start: Record<WhisperId, () => void> = {
        steps: () => {
            following = between(8, 14);
            beat = 0.25;
            trailing = 2;
            options.think('whisper-steps', ["There's a second set of steps. A little behind mine.", "When I stop, they take 2 more. Then they stop too.", "I'm not turning round. There's never anything there when I turn round."]);
        },
        knock: () => {
            for (const delay of [0, 0.5, 1]) synth.tone({ frequency: 92, duration: 0.14, type: 'triangle', gain: 0.3, sweep: 0.6, delay });
            options.think('whisper-knock', ["3 knocks on the barn door. Slow, and polite.", "Nothing that walks out there has knuckles.", "I'm not opening it. Nobody asked me to, exactly."]);
        },
        voice: () => {
            const line = VOICES[Math.floor(Math.random() * VOICES.length)] as string;
            synth.tone({ frequency: 233, duration: 0.5, type: 'sine', gain: 0.05, sweep: 0.86 });
            synth.tone({ frequency: 196, duration: 0.7, type: 'sine', gain: 0.045, sweep: 0.9, delay: 0.45 });
            options.say(line);
            options.think('whisper-voice', ["That was a voice from the village. Out there, in the Veil, off the road.", "Everybody from the village is behind a door at this hour. I've seen the doors.", "So it wasn't meant for me. Or it was, and that's worse. I keep walking."]);
        },
    };
    const play = (id: WhisperId): void => {
        heard[id] += 1;
        start[id]();
    };

    game.systems.add({
        name: 'whispers',
        order: SYSTEM_ORDER.EFFECTS,
        update: (delta) => {
            const player = game.player;
            if (!player || !options.enabled()) return;
            const speed = player.body.speed;

            if (following > 0) {
                following -= delta;
                beat -= delta;
                if (speed > 1) {
                    trailing = 2;
                    if (beat <= 0) {
                        footfall();
                        beat = 0.44;
                    }
                } else if (beat <= 0 && trailing > 0) {
                    // The farmer has stopped. They have not, quite.
                    footfall();
                    trailing -= 1;
                    beat = 0.5;
                    if (trailing === 0) following = 0;
                }
            }

            const hour = options.hour();
            const outside = !options.inBarn() && !options.safe();
            const late = hour >= 17 || hour < 6;
            const ready = (id: WhisperId, fits: boolean, again: [number, number]): void => {
                if (!fits) return;
                wait[id] -= delta;
                if (wait[id] > 0) return;
                wait[id] = between(...again);
                play(id);
            };
            ready('steps', outside && late && !options.riding() && speed > 1 && following <= 0, [70, 160]);
            ready('knock', options.inBarn() && options.night(), [45, 100]);
            ready('voice', outside && (options.night() || options.thick()) && options.toVillage() > 60, [120, 240]);
        },
    });

    return { heard, play };
}
