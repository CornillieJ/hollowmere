import * as THREE from 'three';

import { SYSTEM_ORDER } from '../core/systems';
import type { EventBus } from '../core/events';

/**
 * Animation state machine over `THREE.AnimationMixer`.
 *
 * glTF characters come with clips named after their actions, and every project
 * rebuilds the same awkward wiring: fading between clips, one-shot clips that
 * return to the previous state, and the trap where a clip plays in the wrong
 * pose because it was started before the mixer knew about it.
 *
 *   const animator = new Animator(mixer, gltf.animations);
 *   animator.add('idle', 'Idle');
 *   animator.add('run', 'Run', { fade: 0.25 });
 *   animator.play('run');
 *   animator.playOnce('attack', 'Attack');
 */
export type AnimationStateOptions = {
    /** Seconds to crossfade into this state. */
    fade?: number;
    /** Playback rate. */
    timeScale?: number;
    /** Loop forever (default) or play once. */
    loop?: boolean;
    /** State to return to when a one shot clip finishes. */
    returnTo?: string;
};

export type AnimationState = AnimationStateOptions & {
    name: string;
    /** Clip name or clip object. */
    clip: string | THREE.AnimationClip;
    action: THREE.AnimationAction | undefined;
    loop: boolean;
    fade: number;
};

export class Animator {
    /** Name of the state currently playing, `undefined` before the first `play`. */
    current: string | undefined;

    private readonly mixer: THREE.AnimationMixer;
    private readonly states = new Map<string, AnimationState>();
    private readonly clips = new Map<string, THREE.AnimationClip>();
    private previous: string | undefined;
    private oneShot: AnimationState | undefined;
    private readonly finishedListener: (event: { action: THREE.AnimationAction }) => void;

    /**
     * @param mixer A mixer bound to the model root.
     * @param animations Clips from the glTF, or added later with `addClip`.
     * @param events Optional bus. `custom:animation:finished` is emitted when a
     *        one shot clip ends, carrying the state name.
     */
    constructor(mixer: THREE.AnimationMixer, animations: readonly THREE.AnimationClip[] = [], private readonly events?: EventBus) {
        this.mixer = mixer;
        for (const clip of animations) this.addClip(clip);

        this.finishedListener = (event) => {
            const name = this.nameOfAction(event.action);
            if (!name) return;
            if (this.oneShot && this.oneShot.name === name) {
                const returnTo = this.oneShot.returnTo ?? this.previous;
                this.oneShot = undefined;
                if (returnTo) this.play(returnTo, true);
                this.events?.emit('custom:animation:finished', { state: name });
            }
        };
        this.mixer.addEventListener('finished', this.finishedListener);
    }

    /**
     * Register a clip by name, e.g. from a second glTF.
     *
     * Anything that is not a real `AnimationClip` is ignored. A plain object with
     * a `name` and a `tracks` array looks close enough to fool a caller, and the
     * mixer fails much later with `tracks[i].createInterpolant is not a function`,
     * so it is cheaper to refuse it here.
     */
    addClip(clip: THREE.AnimationClip): void {
        if (!(clip instanceof THREE.AnimationClip)) {
            console.warn('[animator] ignoring a clip that is not an AnimationClip', clip);
            return;
        }
        this.clips.set(clip.name, clip);
    }

    /** Register a state that can be played. Returns the state for later tweaks. */
    add(name: string, clip: string | THREE.AnimationClip, options: AnimationStateOptions = {}): AnimationState {
        const state: AnimationState = {
            name,
            clip,
            action: undefined,
            fade: options.fade ?? 0.2,
            loop: options.loop ?? true,
            ...options,
        };
        this.states.set(name, state);
        return state;
    }

    /** All registered state names. */
    get stateNames(): string[] {
        return [...this.states.keys()];
    }

    /** True when the named state exists. */
    has(name: string): boolean {
        return this.states.has(name);
    }

    /**
     * Crossfade into a state.
     * @param restart Play from the start even when it is already current.
     */
    play(name: string, restart = false): boolean {
        const state = this.states.get(name);
        if (!state) {
            console.warn(`[animator] no state named "${name}"`);
            return false;
        }
        if (this.current === name && !restart) return true;

        const action = this.resolveAction(state);
        if (!action) return false;

        const previousAction = this.current ? this.states.get(this.current)?.action : undefined;
        action.reset();
        action.setEffectiveTimeScale(state.timeScale ?? 1);
        action.setEffectiveWeight(1);
        action.setLoop(state.loop ? THREE.LoopRepeat : THREE.LoopOnce, state.loop ? Infinity : 1);
        action.clampWhenFinished = !state.loop;
        action.play();

        if (previousAction && previousAction !== action) {
            previousAction.crossFadeTo(action, state.fade, false);
        }

        this.previous = this.current;
        this.current = name;
        return true;
    }

    /** Play a clip once, then fall back to `returnTo` or the previous state. */
    playOnce(name: string, options: AnimationStateOptions = {}): boolean {
        const state = this.states.get(name);
        if (!state) {
            console.warn(`[animator] no state named "${name}"`);
            return false;
        }
        this.oneShot = state;
        state.loop = false;
        if (options.returnTo !== undefined) state.returnTo = options.returnTo;
        return this.play(name, true);
    }

    /** Advance the mixer. Call once per frame. */
    update(delta: number): void {
        this.mixer.update(delta);
    }

    /** Register the update as a system, so a template never has to call `update`. */
    registerSystem(game: Game, order = SYSTEM_ORDER.GAMEPLAY): () => void {
        return game.systems.add({ name: 'animator', order, update: (delta) => this.update(delta) });
    }

    /** How far through the current clip the mixer is, in 0..1. */
    progress(): number {
        const action = this.current ? this.states.get(this.current)?.action : undefined;
        if (!action) return 0;
        const duration = action.getClip().duration;
        return duration <= 0 ? 0 : (action.time % duration) / duration;
    }

    dispose(): void {
        this.mixer.removeEventListener('finished', this.finishedListener);
        this.states.clear();
        this.clips.clear();
    }

    //#region Internals

    private resolveAction(state: AnimationState): THREE.AnimationAction | undefined {
        if (state.action) return state.action;
        const clip = typeof state.clip === 'string' ? this.clips.get(state.clip) ?? THREE.AnimationClip.findByName([...this.clips.values()], state.clip) : state.clip;
        if (!clip) {
            console.warn(`[animator] no animation clip named "${String(state.clip)}"`);
            return undefined;
        }
        state.action = this.mixer.clipAction(clip);
        return state.action;
    }

    private nameOfAction(action: THREE.AnimationAction): string | undefined {
        for (const state of this.states.values()) {
            if (state.action === action) return state.name;
        }
        return undefined;
    }

    //#endregion Internals
}

/**
 * Build a mixer and an animator from a loaded model in one call.
 * Returns both, because `SkeletonUtils.clone` needs its own mixer per instance.
 */
export function createAnimator(root: THREE.Object3D, animations: readonly THREE.AnimationClip[] | undefined, events?: EventBus): Animator {
    const mixer = new THREE.AnimationMixer(root);
    const animator = new Animator(mixer, animations ?? [], events);
    // glTF loaders hang the clips off the scene, which is the common case.
    // `cloneModel` restores real clips here, but a model that went through a
    // plain `clone()` may hold JSON copies, so only real clips are taken.
    const fromUserData = root.userData.animations as THREE.AnimationClip[] | undefined;
    for (const clip of fromUserData ?? []) animator.addClip(clip);
    return animator;
}
