import * as THREE from 'three';

import { createAnimator, type Animator } from '../helpers/animation-state';
import { scaleToSize } from '../helpers/transform';
import { createAvatar } from '../helpers/build';

/**
 * An animated glTF character that drops into a `Player` or any other object.
 *
 * The platformer, the third person template and anything else that wants a real
 * character instead of the capsule avatar shares this. It loads the model,
 * scales it to a height, maps logical states ('idle', 'run', 'jump') onto
 * whatever the clip names happen to be, and swaps clips when the state changes.
 *
 * A placeholder capsule avatar is shown until the file arrives, so the game is
 * playable while the model is in flight, and stays playable when it is missing.
 */
export type AnimatedAvatarOptions = {
    /** Model url, e.g. 'models/robot.glb'. */
    url: string;
    /** Target height in meters. Defaults to 1.8. */
    height?: number;
    /** Extra yaw, e.g. Math.PI for a model authored facing +z. */
    yaw?: number;
    /**
     * Map a logical state onto clip name fragments, first match wins:
     * `{ idle: ['idle', 'stand'], run: ['run', 'walk'], jump: ['jump'] }`.
     */
    states?: Record<string, string[]>;
    /** State to play from the start. Defaults to the first key of `states`. */
    initialState?: string;
    /** Content shown until the model arrives. Defaults to the capsule avatar. */
    placeholder?: THREE.Object3D;
    /** Cast and receive shadows. Defaults to true. */
    shadows?: boolean;
    /** Called when the real model has replaced the placeholder. */
    onLoaded?: (model: THREE.Object3D, animator: Animator) => void;
    /** Called when the load failed, e.g. to toast about the asset pack. */
    onFailed?: (error: unknown) => void;
};

export type AnimatedAvatar = {
    /** The group to hand to a `Player` or add to the scene. */
    readonly object: THREE.Group;
    /** Crossfade to a state from `options.states`. Ignored while loading. */
    setState: (state: string) => void;
    /** The state last passed to `setState`. */
    readonly state: string;
    /** Resolves true once the model is on stage, false when the load failed. */
    readonly ready: Promise<boolean>;
    /** The clip player, available once `ready` resolved true. */
    animator: Animator | undefined;
    dispose: () => void;
};

/** Load a model and wire its clips to named states. See `AnimatedAvatarOptions`. */
export function createAnimatedAvatar(game: Game, options: AnimatedAvatarOptions): AnimatedAvatar {
    const object = new THREE.Group();
    object.name = 'animated-avatar';

    const placeholder = options.placeholder ?? createAvatar({ color: 0x4f9bd9, height: options.height ?? 1.8 });
    object.add(placeholder);

    const avatar: AnimatedAvatar = {
        object,
        setState: (state) => {
            if (state === current) return;
            current = state;
            const clip = clipFor(state);
            if (avatar.animator && clip) avatar.animator.play(clip, true);
        },
        get state() {
            return current;
        },
        ready: load(),
        animator: undefined,
        dispose: () => {
            avatar.animator?.dispose();
            object.removeFromParent();
        },
    };

    let current = options.initialState ?? Object.keys(options.states ?? { idle: [] })[0] ?? 'idle';
    let clips: readonly THREE.AnimationClip[] = [];

    /** First clip whose name contains one of the state's fragments. */
    function clipFor(state: string): string | undefined {
        const fragments = options.states?.[state] ?? [state];
        return clips.find((clip) => fragments.some((fragment) => clip.name.toLowerCase().includes(fragment)))?.name ?? clips[0]?.name;
    }

    async function load(): Promise<boolean> {
        try {
            const model = await game.assets.cloneModel(options.url);
            scaleToSize(model, options.height ?? 1.8);
            if (options.yaw) model.rotation.y = options.yaw;
            model.traverse((child) => {
                const mesh = child as THREE.Mesh;
                if (!mesh.isMesh) return;
                mesh.castShadow = options.shadows ?? true;
                mesh.receiveShadow = options.shadows ?? true;
            });

            object.remove(placeholder);
            object.add(model);

            clips = game.assets.animationsOf(options.url);
            const animator = createAnimator(model, clips, game.events);
            for (const clip of clips) animator.add(clip.name, clip);
            const start = clipFor(current);
            if (start) animator.play(start);
            animator.registerSystem(game);
            avatar.animator = animator;
            options.onLoaded?.(model, animator);
            return true;
        } catch (error) {
            console.warn('[avatar] could not load', options.url, error);
            options.onFailed?.(error);
            return false;
        }
    }

    return avatar;
}
