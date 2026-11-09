import * as THREE from 'three';
import { gsap } from 'gsap';

import * as CONSTANTS from '../Constants/Constants';

/**
 * Tweened animation on top of GSAP.
 *
 * GSAP runs its own ticker, so nothing here needs calling from the game loop.
 * Pausing the game sets the global timeline's time scale, which freezes every
 * tween at once: see `setTweenSpeed`.
 *
 * Every helper returns the tween, so callers can `kill()` it early.
 */
export type TweenCallback = () => void;

/**
 * Attach an optional completion callback to tween vars.
 * GSAP's types reject `onComplete: undefined`, and `exactOptionalPropertyTypes`
 * is on in this project, so the key is only added when there is a callback.
 */
function withComplete<T extends object>(vars: T, onComplete?: TweenCallback): T {
    if (onComplete) (vars as { onComplete?: TweenCallback }).onComplete = onComplete;
    return vars;
}

/** Scale all tweens, 0 freezes them. Use for pause and slow motion. */
export function setTweenSpeed(scale: number): void {
    gsap.globalTimeline.timeScale(scale);
}

/** Freeze every running tween. */
export function pauseTweens(): void {
    setTweenSpeed(0);
}

/** Resume tweens at normal speed. */
export function resumeTweens(): void {
    setTweenSpeed(1);
}

/** Cancel every tween targeting an object or property bag. */
export function killTweensOf(target: object): void {
    gsap.killTweensOf(target);
}

/** Cancel every running tween in the game. */
export function killAllTweens(): void {
    gsap.globalTimeline.clear();
}

/** True while a tween on the target is still running. */
export function isTweening(target: object): boolean {
    return gsap.isTweening(target);
}

/** Tween to a position over `duration` seconds. */
export function animatePosition(object: THREE.Object3D, to: THREE.Vector3 | Vec3, duration: number = CONSTANTS.FEEL.TWEEN_DEFAULT, onComplete?: TweenCallback): gsap.core.Tween {
    return gsap.to(object.position, withComplete({ x: to.x, y: to.y, z: to.z, duration, ease: 'power2.out' }, onComplete));
}

/** Tween to a rotation in radians. */
export function animateRotation(object: THREE.Object3D, to: THREE.Euler | THREE.Vector3 | Vec3, duration: number = CONSTANTS.FEEL.TWEEN_DEFAULT, onComplete?: TweenCallback): gsap.core.Tween {
    return gsap.to(object.rotation, withComplete({ x: to.x, y: to.y, z: to.z, duration, ease: 'power2.out' }, onComplete));
}

/** Tween to a scale. Pass a single number to scale uniformly. */
export function animateScale(object: THREE.Object3D, to: number | THREE.Vector3 | Vec3, duration: number = CONSTANTS.FEEL.TWEEN_DEFAULT, onComplete?: TweenCallback): gsap.core.Tween {
    const target = typeof to === 'number' ? { x: to, y: to, z: to } : to;
    return gsap.to(object.scale, withComplete({ x: target.x, y: target.y, z: target.z, duration, ease: 'power2.out' }, onComplete));
}

/** Tween position and rotation together, then snap to the exact target values. */
export function animatePositionAndRotation(object: THREE.Object3D, toPosition: THREE.Vector3 | Vec3, toRotation: THREE.Euler | Vec3, duration: number = CONSTANTS.FEEL.TWEEN_DEFAULT, onComplete?: TweenCallback): gsap.core.Timeline {
    const timeline = gsap.timeline({
        onComplete: () => {
            object.position.set(toPosition.x, toPosition.y, toPosition.z);
            object.rotation.set(toRotation.x, toRotation.y, toRotation.z);
            if (onComplete) onComplete();
        },
    });
    timeline.to(object.position, { x: toPosition.x, y: toPosition.y, z: toPosition.z, duration, ease: 'power2.inOut' }, 0);
    timeline.to(object.rotation, { x: toRotation.x, y: toRotation.y, z: toRotation.z, duration, ease: 'power2.inOut' }, 0);
    return timeline;
}

/** Punch the scale up and back down, for a pop / hit feedback. */
export function animatePop(object: THREE.Object3D, amount = 1.25, duration = 0.18): gsap.core.Timeline {
    const base = object.scale.clone();
    const timeline = gsap.timeline();
    timeline.to(object.scale, { x: base.x * amount, y: base.y * amount, z: base.z * amount, duration: duration / 2, ease: 'power2.out' });
    timeline.to(object.scale, { x: base.x, y: base.y, z: base.z, duration: duration / 2, ease: 'power2.in' });
    return timeline;
}

/** Shake an object's position locally, e.g. an item in a menu. */
export function animateShake(object: THREE.Object3D, strength = 0.08, duration = 0.35): gsap.core.Timeline {
    const origin = object.position.clone();
    const timeline = gsap.timeline({ onComplete: () => object.position.copy(origin) });
    const steps = 6;
    for (let index = 0; index < steps; index += 1) {
        const decay = 1 - index / steps;
        timeline.to(object.position, {
            x: origin.x + (Math.random() * 2 - 1) * strength * decay,
            y: origin.y + (Math.random() * 2 - 1) * strength * decay,
            z: origin.z + (Math.random() * 2 - 1) * strength * decay,
            duration: duration / steps,
            ease: 'none',
        });
    }
    return timeline;
}

/** Tween a numeric property of any object, e.g. a light's intensity. */
export function animateValue(target: object, property: string, to: number, duration: number = CONSTANTS.FEEL.TWEEN_DEFAULT, onComplete?: TweenCallback): gsap.core.Tween {
    return gsap.to(target, withComplete({ [property]: to, duration, ease: 'power2.out' }, onComplete));
}

/** Run a callback after a delay, still respecting `setTweenSpeed`. */
export function delay(seconds: number, onComplete: TweenCallback): gsap.core.Tween {
    return gsap.delayedCall(seconds, onComplete);
}

/** Run an action every `seconds`, returning a handle with `kill()`. */
export function repeat(seconds: number, action: () => void): gsap.core.Tween {
    return gsap.to({}, { repeat: -1, duration: seconds, onRepeat: action });
}

/** Fade the opacity of every material under `object`. Requires unique materials. */
export function animateOpacity(object: THREE.Object3D, to: number, duration: number = CONSTANTS.FEEL.FADE_DEFAULT, onComplete?: TweenCallback): gsap.core.Timeline {
    const materials: THREE.Material[] = [];
    object.traverse((child) => {
        const mesh = child as Partial<THREE.Mesh>;
        if (Array.isArray(mesh.material)) materials.push(...mesh.material);
        else if (mesh.material) materials.push(mesh.material);
    });

    const timeline = gsap.timeline(withComplete({}, onComplete));
    for (const material of materials) {
        material.transparent = true;
        timeline.to(material, { opacity: to, duration, ease: 'power2.out' }, 0);
    }
    return timeline;
}
