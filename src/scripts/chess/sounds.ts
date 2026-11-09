/**
 * Chess sounds, synthesised on the fly.
 *
 * There are no audio files in this project: every sound is a couple of short
 * oscillator blips through the template's `ui` bus. That keeps the repo free of
 * binary assets, and a game that changes its mind about sounds only has to edit
 * a few numbers here.
 */
export class ChessSounds {
    /** Master level for every sound this class makes, 0..1. */
    volume = 0.5;
    /** Set false to silence everything without touching the audio context. */
    enabled = true;

    private context: AudioContext | undefined;
    private bus: AudioNode | undefined;

    constructor(private readonly game: Game) {}

    /**
     * Create or resume the audio context. Browsers require a user gesture, so
     * the entry point calls this from the first click.
     */
    async unlock(): Promise<void> {
        await this.game.audio.unlock();
        this.context = this.game.audio.context;
        this.bus = this.game.audio.busFor('ui');
    }

    /** A wood knock for a quiet move. */
    move(): void {
        this.blip({ frequency: 320, duration: 0.06, type: 'triangle', gain: 0.35, sweep: 0.6 });
        this.noise({ duration: 0.05, gain: 0.12, filter: 1800 });
    }

    /** A heavier thud for a capture. */
    capture(): void {
        this.blip({ frequency: 170, duration: 0.12, type: 'sawtooth', gain: 0.4, sweep: 0.45 });
        this.noise({ duration: 0.12, gain: 0.2, filter: 900 });
    }

    /** Two rising notes for the king moving two squares. */
    castle(): void {
        this.blip({ frequency: 260, duration: 0.08, type: 'triangle', gain: 0.3, sweep: 1 });
        window.setTimeout(() => this.blip({ frequency: 390, duration: 0.1, type: 'triangle', gain: 0.3, sweep: 1 }), 90);
    }

    /** A bright pair of notes when the king comes under attack. */
    check(): void {
        this.blip({ frequency: 780, duration: 0.1, type: 'square', gain: 0.22, sweep: 1.4 });
        window.setTimeout(() => this.blip({ frequency: 1040, duration: 0.12, type: 'square', gain: 0.2, sweep: 1.2 }), 90);
    }

    /** Soft tick when a piece is picked up. */
    select(): void {
        this.blip({ frequency: 620, duration: 0.04, type: 'sine', gain: 0.18, sweep: 1.1 });
    }

    /** A shimmer for a pawn promotion. */
    promote(): void {
        [520, 660, 790].forEach((frequency, index) => {
            window.setTimeout(() => this.blip({ frequency, duration: 0.14, type: 'triangle', gain: 0.22, sweep: 1 }), index * 80);
        });
    }

    /** A short fanfare, or a descending one when the player lost. */
    gameOver(won: boolean): void {
        const notes = won ? [520, 660, 780, 1040] : [520, 440, 350, 260];
        notes.forEach((frequency, index) => {
            window.setTimeout(() => this.blip({ frequency, duration: 0.22, type: 'triangle', gain: 0.26, sweep: 1 }), index * 140);
        });
    }

    //#region Internals

    private blip(options: { frequency: number; duration: number; type: OscillatorType; gain: number; sweep?: number }): void {
        if (!this.enabled || !this.context) return;
        const context = this.context;
        const now = context.currentTime;

        const oscillator = context.createOscillator();
        oscillator.type = options.type;
        oscillator.frequency.setValueAtTime(options.frequency, now);
        if (options.sweep) oscillator.frequency.exponentialRampToValueAtTime(Math.max(40, options.frequency * options.sweep), now + options.duration);

        const gain = context.createGain();
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(options.gain * this.volume, now + 0.008);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + options.duration);

        oscillator.connect(gain);
        this.connect(gain);
        oscillator.start(now);
        oscillator.stop(now + options.duration + 0.02);
    }

    /** A short filtered noise burst, used for the percussive edge of a move. */
    private noise(options: { duration: number; gain: number; filter: number }): void {
        if (!this.enabled || !this.context) return;
        const context = this.context;
        const frames = Math.floor(context.sampleRate * options.duration);
        if (frames <= 0) return;

        const buffer = context.createBuffer(1, frames, context.sampleRate);
        const data = buffer.getChannelData(0);
        for (let index = 0; index < frames; index += 1) {
            data[index] = (Math.random() * 2 - 1) * (1 - index / frames);
        }

        const source = context.createBufferSource();
        source.buffer = buffer;

        const filter = context.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = options.filter;

        const gain = context.createGain();
        gain.gain.value = options.gain * this.volume;

        source.connect(filter).connect(gain);
        this.connect(gain);
        source.start();
    }

    private connect(node: AudioNode): void {
        if (this.bus) node.connect(this.bus);
        else if (this.context) node.connect(this.context.destination);
    }

    //#endregion Internals
}
