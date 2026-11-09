import * as THREE from 'three';

import * as CONSTANTS from '../Constants/Constants';
import { clamp, damp } from '../helpers/math';

/**
 * Yaw and pitch accumulation with pointer lock.
 *
 * Shared by the first person, third person and top-down cameras so
 * sensitivity, inversion and the pitch clamp behave the same everywhere.
 */
export type PointerLookOptions = {
    /** Radians per pixel of mouse movement. */
    sensitivity?: number;
    invertY?: boolean;
    /** Lower and upper pitch limits in radians. */
    minPitch?: number;
    maxPitch?: number;
    /** Start angles in radians. */
    yaw?: number;
    pitch?: number;
    /** How quickly pitch follows the mouse, per second, e.g. 20. 0 for raw input. */
    smoothing?: number;
    /** Request pointer lock when the canvas is clicked. */
    lockOnClick?: boolean;
};

export class PointerLook {
    /** Horizontal angle in radians. */
    yaw: number;
    /** Vertical angle in radians, clamped between `minPitch` and `maxPitch`. */
    pitch: number;
    sensitivity: number;
    invertY: boolean;
    minPitch: number;
    maxPitch: number;
    smoothing: number;
    /** Set false to ignore input without unpausing, e.g. during a cutscene. */
    enabled = true;

    private readonly game: Game;
    private readonly smoothPitch = { value: 0 };
    private detachClick: (() => void) | undefined;

    constructor(game: Game, options: PointerLookOptions = {}) {
        this.game = game;
        this.yaw = options.yaw ?? 0;
        this.pitch = options.pitch ?? 0;
        this.smoothPitch.value = this.pitch;
        this.sensitivity = options.sensitivity ?? CONSTANTS.CAMERA.LOOK_SENSITIVITY;
        this.invertY = options.invertY ?? game.input.invertY;
        this.minPitch = options.minPitch ?? CONSTANTS.CAMERA.MIN_PITCH;
        this.maxPitch = options.maxPitch ?? CONSTANTS.CAMERA.MAX_PITCH;
        this.smoothing = options.smoothing ?? 0;

        if (options.lockOnClick !== false) this.lockOnClick();
    }

    /** Request pointer lock when the canvas is clicked, excluding UI clicks. */
    lockOnClick(element: HTMLElement = this.game.canvas): void {
        this.detachClick?.();
        const handler = () => this.game.input.requestPointerLock();
        element.addEventListener('click', handler);
        this.detachClick = () => element.removeEventListener('click', handler);
    }

    /** Consume one frame of look input. `delta` is `game.input.look`. */
    addLook(delta: THREE.Vector2): void {
        if (!this.enabled) return;
        const invert = this.invertY ? -1 : 1;
        this.yaw -= delta.x * this.sensitivity;
        this.pitch -= delta.y * this.sensitivity * invert;
        this.pitch = clamp(this.pitch, this.minPitch, this.maxPitch);
        // Keep the angle bounded so it never drifts into float noise.
        if (this.yaw > Math.PI) this.yaw -= Math.PI * 2;
        if (this.yaw < -Math.PI) this.yaw += Math.PI * 2;
    }

    /** Copy the accumulated angles onto a camera. */
    applyTo(camera: THREE.Camera, delta = 0): void {
        camera.rotation.order = 'YXZ';
        if (this.smoothing > 0 && delta > 0) {
            // `smoothing` is a rate (higher follows faster); damp wants the fraction left after one second.
            this.smoothPitch.value = damp(this.smoothPitch.value, this.pitch, Math.exp(-this.smoothing), delta);
            camera.rotation.set(this.smoothPitch.value, this.yaw, 0);
        } else {
            this.smoothPitch.value = this.pitch;
            camera.rotation.set(this.pitch, this.yaw, 0);
        }
    }

    /** Horizontal forward direction, flat on the ground plane. */
    forward(out = new THREE.Vector3()): THREE.Vector3 {
        return out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    }

    /** Horizontal right direction, flat on the ground plane. */
    right(out = new THREE.Vector3()): THREE.Vector3 {
        return out.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    }

    /** Turn the character to face a world direction, smoothed over time. */
    faceDirection(object: THREE.Object3D, direction: THREE.Vector3, speed: number, delta: number): void {
        if (direction.lengthSq() < 1e-6) return;
        const target = Math.atan2(direction.x, direction.z);
        let difference = target - object.rotation.y;
        while (difference > Math.PI) difference -= Math.PI * 2;
        while (difference < -Math.PI) difference += Math.PI * 2;
        object.rotation.y += clamp(difference, -speed * delta, speed * delta);
    }

    dispose(): void {
        this.detachClick?.();
    }
}
