import * as THREE from 'three';

import * as CONSTANTS from '../Constants/Constants';
import { clamp } from '../helpers/math';

/**
 * Audio playback built on the Web Audio API.
 *
 * Three buses (music, sfx, ambient) hang off a master gain, so a settings menu
 * only has to touch four numbers. Positional sound is panning based rather than
 * true HRTF, which is cheap and reads well for a top-down or third person view.
 *
 * Browsers block audio until the player interacts, so `unlock()` is called from
 * the first click and everything queued before that starts then.
 */
export type SoundOptions = {
    /** Per-play volume in 0..1, multiplied with the bus volume. */
    volume?: number;
    /** Playback rate, 1 is the recorded pitch. */
    rate?: number;
    /** Random rate variation, e.g. 0.05 for a slightly different shot each time. */
    rateVariance?: number;
    /** When true the sound loops until stopped. */
    loop?: boolean;
    /** Stereo pan in -1..1. */
    pan?: number;
    /** Play this sound positionally, from a world position. */
    position?: THREE.Vector3;
    /** Register the sound so a `stop` with the same key replaces it. */
    key?: string;
    /** Called when playback finishes, never for looping sounds. */
    onEnded?: () => void;
};

export type Bus = 'music' | 'sfx' | 'ambient' | 'ui';

export class AudioManager {
    /** Created lazily on the first unlock so no AudioContext exists before a gesture. */
    context: AudioContext | undefined;

    private masterGain: GainNode | undefined;
    private busGains = new Map<Bus, GainNode>();
    private readonly buffers = new Map<string, AudioBuffer>();
    private readonly oneShots = new Map<string, AudioBufferSourceNode>();
    private readonly volumes: Record<Bus | 'master', number> = {
        master: CONSTANTS.AUDIO_DEFAULTS.MASTER,
        music: CONSTANTS.AUDIO_DEFAULTS.MUSIC,
        sfx: CONSTANTS.AUDIO_DEFAULTS.SFX,
        ambient: CONSTANTS.AUDIO_DEFAULTS.AMBIENT,
        ui: CONSTANTS.AUDIO_DEFAULTS.UI,
    };
    private musicSource: AudioBufferSourceNode | undefined;
    private musicGain: GainNode | undefined;

    constructor(private readonly listenerAnchor: THREE.Object3D | null = null) {}

    /** True once the browser has allowed audio. */
    get unlocked(): boolean {
        return this.context?.state === 'running';
    }

    /**
     * Create or resume the AudioContext. Call it from a user gesture; calling it
     * more than once is harmless.
     */
    async unlock(): Promise<boolean> {
        if (!this.context) {
            this.context = new AudioContext();
            this.buildGraph(this.context);
        }
        if (this.context.state === 'suspended') await this.context.resume();
        return this.unlocked;
    }

    /** Load a sound and keep it in memory. Repeat calls for the same url are free. */
    async load(url: string): Promise<AudioBuffer | undefined> {
        await this.unlock();
        if (!this.context) return undefined;
        const cached = this.buffers.get(url);
        if (cached) return cached;
        try {
            const response = await fetch(url);
            const bytes = await response.arrayBuffer();
            const buffer = await this.context.decodeAudioData(bytes);
            this.buffers.set(url, buffer);
            return buffer;
        } catch (error) {
            console.warn(`[audio] could not load "${url}"`, error);
            return undefined;
        }
    }

    /** Fire and forget a sound effect. */
    async play(url: string, options: SoundOptions = {}): Promise<void> {
        const buffer = await this.load(url);
        if (!buffer || !this.context) return;
        this.playBuffer(url, buffer, 'sfx', options);
    }

    /** Play a UI sound, routed through the ui bus so it stays audible over gameplay. */
    async playUi(url: string, options: SoundOptions = {}): Promise<void> {
        const buffer = await this.load(url);
        if (!buffer || !this.context) return;
        this.playBuffer(url, buffer, 'ui', options);
    }

    /** Start a looping ambient bed. Only one ambient track is kept. */
    async playAmbient(url: string, options: SoundOptions = {}): Promise<void> {
        const buffer = await this.load(url);
        if (!buffer || !this.context) return;
        this.stop('ambient');
        this.playBuffer('ambient', buffer, 'ambient', { loop: true, ...options });
    }

    /** Crossfade to a new music track. */
    async playMusic(url: string, fadeSeconds: number = CONSTANTS.AUDIO_DEFAULTS.MUSIC_FADE): Promise<void> {
        const buffer = await this.load(url);
        if (!buffer || !this.context) return;
        if (this.musicSource) {
            this.fadeOutMusic(fadeSeconds);
        }
        const source = this.context.createBufferSource();
        source.buffer = buffer;
        source.loop = true;
        const gain = this.context.createGain();
        gain.gain.value = 0;
        source.connect(gain).connect(this.busGains.get('music') ?? this.context.destination);
        source.start();
        // The music bus already applies the music volume; this gain only fades the track in.
        gain.gain.linearRampToValueAtTime(1, this.context.currentTime + fadeSeconds);
        this.musicSource = source;
        this.musicGain = gain;
    }

    /** Stop the current music with a fade. */
    stopMusic(fadeSeconds: number = CONSTANTS.AUDIO_DEFAULTS.MUSIC_FADE): void {
        this.fadeOutMusic(fadeSeconds);
    }

    /** Stop a keyed sound, or every sound on a bus. */
    stop(key: string): void {
        if (key === 'music') {
            this.stopMusic(0.05);
            return;
        }
        const source = this.oneShots.get(key);
        if (!source) return;
        try {
            source.stop();
        } catch {
            // Already stopped, nothing to do.
        }
        this.oneShots.delete(key);
    }

    /** Stop every one shot. Music and ambient keep playing. */
    stopAll(): void {
        for (const key of [...this.oneShots.keys()]) {
            if (key !== 'ambient') this.stop(key);
        }
    }

    /** Set a bus volume in 0..1. */
    setVolume(bus: Bus | 'master', value: number): void {
        this.volumes[bus] = clamp(value, 0, 1);
        const gain = bus === 'master' ? this.masterGain : this.busGains.get(bus);
        if (gain) gain.gain.value = this.volumes[bus];
    }

    getVolume(bus: Bus | 'master'): number {
        return this.volumes[bus];
    }

    /** Mute everything without losing the volume settings. */
    setMuted(muted: boolean): void {
        if (this.masterGain) this.masterGain.gain.value = muted ? 0 : this.volumes.master;
    }

    /**
     * The gain node of a bus, so a game can plug its own nodes in.
     * Use it for synthesised sounds, filters or a custom reverb chain.
     */
    busFor(bus: Bus): GainNode | undefined {
        return bus === 'music' ? this.musicGain ?? this.busGains.get(bus) : this.busGains.get(bus);
    }

    /** Connect a node you built to a bus. Returns the same node for chaining. */
    connectToBus(bus: Bus, node: AudioNode): AudioNode {
        const target = this.busFor(bus) ?? this.masterGain ?? this.context?.destination;
        if (target) node.connect(target);
        return node;
    }

    /** Stereo pan from a world position relative to the listener, in -1..1. */
    panFromWorldPosition(position: THREE.Vector3): number {
        if (!this.listenerAnchor) return 0;
        const local = this.listenerAnchor.worldToLocal(position.clone());
        const distance = Math.hypot(local.x, local.z);
        if (distance < 0.001) return 0;
        return clamp(local.x / distance, -1, 1);
    }

    /** Build the gain graph once the context exists. */
    private buildGraph(context: AudioContext): void {
        this.masterGain = context.createGain();
        this.masterGain.gain.value = this.volumes.master;
        this.masterGain.connect(context.destination);

        for (const bus of ['music', 'sfx', 'ambient', 'ui'] as Bus[]) {
            const gain = context.createGain();
            gain.gain.value = this.volumes[bus];
            gain.connect(this.masterGain);
            this.busGains.set(bus, gain);
        }
    }

    private playBuffer(key: string, buffer: AudioBuffer, bus: Bus, options: SoundOptions): void {
        if (!this.context) return;
        if (options.key) this.stop(options.key);

        const source = this.context.createBufferSource();
        source.buffer = buffer;
        source.loop = options.loop ?? false;
        const variance = options.rateVariance ?? 0;
        source.playbackRate.value = (options.rate ?? 1) * (1 + (Math.random() * 2 - 1) * variance);

        let node: AudioNode = source;
        if (options.pan !== undefined && this.context.createStereoPanner) {
            const panner = this.context.createStereoPanner();
            panner.pan.value = clamp(options.pan, -1, 1);
            node.connect(panner);
            node = panner;
        } else if (options.position) {
            const panner = this.context.createStereoPanner();
            panner.pan.value = this.panFromWorldPosition(options.position);
            node.connect(panner);
            node = panner;
        }

        const gain = this.context.createGain();
        gain.gain.value = clamp(options.volume ?? 1, 0, 1);
        node.connect(gain).connect(this.busGains.get(bus) ?? this.context.destination);

        const key2 = options.key ?? key;
        source.onended = () => {
            this.oneShots.delete(key2);
            options.onEnded?.();
        };
        source.start();
        this.oneShots.set(key2, source);

        // Do not let a leaked key grow the map forever.
        if (this.oneShots.size > CONSTANTS.AUDIO_DEFAULTS.VOICE_LIMIT) {
            // The ambient bed lives in the same map but is never a voice to evict.
            const oldest = [...this.oneShots.keys()].find((candidate) => candidate !== 'ambient');
            if (oldest !== undefined) this.stop(oldest);
        }
    }

    private fadeOutMusic(seconds: number): void {
        if (!this.musicSource || !this.musicGain || !this.context) return;
        const source = this.musicSource;
        const gain = this.musicGain;
        this.musicSource = undefined;
        this.musicGain = undefined;
        gain.gain.cancelScheduledValues(this.context.currentTime);
        gain.gain.linearRampToValueAtTime(0, this.context.currentTime + seconds);
        window.setTimeout(() => {
            try {
                source.stop();
            } catch {
                // Already stopped.
            }
        }, seconds * 1000 + 50);
    }

    /** Tear down the context. Only needed when the game is unmounted. */
    close(): void {
        this.stopAll();
        this.stopMusic(0);
        this.context?.close();
        this.context = undefined;
        this.masterGain = undefined;
        this.busGains.clear();
        this.buffers.clear();
    }
}
