/**
 * Sound without sound files: tones, noise bursts and endless beds, made with
 * Web Audio on the game's own buses.
 *
 * Good for prototypes and for games whose sound is texture rather than music:
 * a low drone and wind for a horror field, a blip for a pickup, a thud for a
 * door. Everything goes through `game.audio`'s buses, so the volume settings
 * and the mute apply. Nothing plays until the browser has had a user gesture;
 * calls before that are silently skipped.
 */
export type ToneOptions = {
    frequency: number;
    /** Seconds. */
    duration?: number;
    type?: OscillatorType;
    gain?: number;
    /** Multiply the frequency by this over the tone, e.g. 0.5 for a falling thud. */
    sweep?: number;
    bus?: 'sfx' | 'ui' | 'ambient' | 'music';
};

export type NoiseOptions = {
    duration?: number;
    gain?: number;
    /** Low pass cutoff in hertz. Lower is duller. */
    filter?: number;
    bus?: 'sfx' | 'ui' | 'ambient' | 'music';
};

export type LoopHandle = {
    /** Fade to a new level over `seconds`. */
    setLevel: (level: number, seconds?: number) => void;
    stop: (fadeSeconds?: number) => void;
};

export class Synth {
    private readonly game: Game;
    private noiseBuffer: AudioBuffer | undefined;

    constructor(game: Game) {
        this.game = game;
    }

    private get context(): AudioContext | undefined {
        const context = this.game.audio.context;
        return context && context.state === 'running' ? context : undefined;
    }

    private destination(bus: ToneOptions['bus']): AudioNode | undefined {
        return this.game.audio.busFor(bus ?? 'sfx') ?? this.context?.destination;
    }

    /** A single enveloped tone. */
    tone(options: ToneOptions): void {
        const context = this.context;
        const output = this.destination(options.bus);
        if (!context || !output) return;
        const now = context.currentTime;
        const duration = options.duration ?? 0.15;
        const oscillator = context.createOscillator();
        oscillator.type = options.type ?? 'sine';
        oscillator.frequency.setValueAtTime(options.frequency, now);
        if (options.sweep) oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, options.frequency * options.sweep), now + duration);
        const gain = context.createGain();
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(options.gain ?? 0.3, now + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
        oscillator.connect(gain).connect(output);
        oscillator.start(now);
        oscillator.stop(now + duration + 0.05);
    }

    /** A burst of filtered noise: footsteps, thuds, rustles, static. */
    noise(options: NoiseOptions = {}): void {
        const context = this.context;
        const output = this.destination(options.bus);
        if (!context || !output) return;
        const now = context.currentTime;
        const duration = options.duration ?? 0.1;
        const source = context.createBufferSource();
        source.buffer = this.whiteNoise(context);
        const filter = context.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = options.filter ?? 1200;
        const gain = context.createGain();
        gain.gain.setValueAtTime(options.gain ?? 0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
        source.connect(filter).connect(gain).connect(output);
        source.start(now);
        source.stop(now + duration + 0.05);
    }

    /**
     * An endless low drone: a few detuned oscillators through a slowly breathing
     * low pass. The unease under a horror level, or a hum in a machine room.
     */
    drone(options: { notes?: number[]; level?: number; brightness?: number } = {}): LoopHandle | undefined {
        const context = this.context;
        const output = this.destination('ambient');
        if (!context || !output) return undefined;
        const master = context.createGain();
        master.gain.value = 0;
        const filter = context.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = options.brightness ?? 320;
        filter.Q.value = 4;
        const lfo = context.createOscillator();
        lfo.frequency.value = 0.07;
        const lfoGain = context.createGain();
        lfoGain.gain.value = (options.brightness ?? 320) * 0.5;
        lfo.connect(lfoGain).connect(filter.frequency);
        lfo.start();
        const oscillators = (options.notes ?? [55, 55.6, 82.4, 110.3]).map((frequency, index) => {
            const oscillator = context.createOscillator();
            oscillator.type = index % 2 === 0 ? 'sawtooth' : 'triangle';
            oscillator.frequency.value = frequency;
            oscillator.connect(filter);
            oscillator.start();
            return oscillator;
        });
        filter.connect(master).connect(output);
        return this.loop(context, master, options.level ?? 0.12, [...oscillators, lfo]);
    }

    /** Wind: noise through a band pass that wanders, gusting on its own. */
    wind(options: { level?: number } = {}): LoopHandle | undefined {
        const context = this.context;
        const output = this.destination('ambient');
        if (!context || !output) return undefined;
        const source = context.createBufferSource();
        source.buffer = this.whiteNoise(context);
        source.loop = true;
        const filter = context.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 500;
        filter.Q.value = 0.8;
        const lfo = context.createOscillator();
        lfo.frequency.value = 0.11;
        const lfoGain = context.createGain();
        lfoGain.gain.value = 300;
        lfo.connect(lfoGain).connect(filter.frequency);
        lfo.start();
        const master = context.createGain();
        master.gain.value = 0;
        source.connect(filter).connect(master).connect(output);
        source.start();
        return this.loop(context, master, options.level ?? 0.18, [source, lfo]);
    }

    private loop(context: AudioContext, master: GainNode, level: number, sources: AudioScheduledSourceNode[]): LoopHandle {
        master.gain.setTargetAtTime(level, context.currentTime, 1.5);
        return {
            setLevel: (next, seconds = 1) => master.gain.setTargetAtTime(next, context.currentTime, Math.max(0.01, seconds / 3)),
            stop: (fadeSeconds = 1) => {
                master.gain.setTargetAtTime(0, context.currentTime, Math.max(0.01, fadeSeconds / 3));
                for (const source of sources) source.stop(context.currentTime + fadeSeconds + 0.1);
            },
        };
    }

    /** Two seconds of white noise, made once and shared. */
    private whiteNoise(context: AudioContext): AudioBuffer {
        if (this.noiseBuffer) return this.noiseBuffer;
        const buffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
        const data = buffer.getChannelData(0);
        for (let index = 0; index < data.length; index += 1) data[index] = Math.random() * 2 - 1;
        this.noiseBuffer = buffer;
        return buffer;
    }
}
