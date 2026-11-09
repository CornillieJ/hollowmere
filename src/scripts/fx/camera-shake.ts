import * as THREE from 'three';

import * as CONSTANTS from '../Constants/Constants';
import { clamp01 } from '../helpers/math';

/**
 * Trauma based camera shake.
 *
 * Every event adds trauma in 0..1; the shake then decays on its own. Squaring
 * the trauma before use keeps small hits subtle and big hits violent, which is
 * the trick that makes this feel right instead of random.
 *
 * Apply it after the camera controller has positioned the camera.
 */
export class CameraShake {
    /** Amount of shake left, 0..1. */
    trauma = 0;
    /** Trauma lost per second. */
    decay = CONSTANTS.FEEL.SHAKE_DECAY;
    /** Maximum position offset in meters at full trauma. */
    maxOffset = 0.25;
    /** Maximum roll in radians at full trauma. */
    maxRoll = 0.06;
    /** Field of view added at full trauma, e.g. 2 for an impact punch. */
    maxFovKick = 3;

    /** Position offset produced by the last `update`. */
    readonly offset = new THREE.Vector3();
    /** Roll produced by the last `update`, in radians. */
    roll = 0;
    /** Field of view delta produced by the last `update`. */
    fovKick = 0;

    private time = 0;
    private baseFov: number | undefined;

    /** Add trauma. Keep values around 0.2 for a hit and 1 for an explosion. */
    add(amount: number): void {
        this.trauma = clamp01(this.trauma + amount);
    }

    /** Wipe the shake instantly, e.g. on respawn. */
    clear(): void {
        this.trauma = 0;
        this.offset.set(0, 0, 0);
        this.roll = 0;
        this.fovKick = 0;
    }

    /** Recompute the offset from the current trauma. Call once per frame. */
    update(delta: number): void {
        this.time += delta;
        if (this.trauma <= 0) {
            this.offset.set(0, 0, 0);
            this.roll = 0;
            this.fovKick *= Math.max(0, 1 - delta * 8);
            return;
        }

        const amount = this.trauma * this.trauma;
        const noise = (seed: number) => Math.sin(this.time * 26 * (1 + seed * 0.3) + seed * 12.9898) * Math.cos(this.time * 17 * (1 + seed * 0.2) + seed * 4.1414);

        this.offset.set(noise(1) * this.maxOffset * amount, noise(2) * this.maxOffset * amount, noise(3) * this.maxOffset * 0.4 * amount);
        this.roll = noise(4) * this.maxRoll * amount;
        this.fovKick = this.maxFovKick * amount * 0.5 + this.fovKick * Math.max(0, 1 - delta * 8);

        this.trauma = Math.max(0, this.trauma - this.decay * delta);
    }

    /**
     * Push the computed shake onto a camera.
     * Call after every other system has moved the camera this frame.
     */
    applyTo(camera: THREE.PerspectiveCamera): void {
        camera.position.add(this.offset);
        if (this.roll !== 0) camera.rotateZ(this.roll);

        if (this.baseFov === undefined) this.baseFov = camera.fov;
        const target = this.baseFov + this.fovKick;
        if (Math.abs(camera.fov - target) > 0.01) {
            camera.fov = target;
            camera.updateProjectionMatrix();
        }
    }
}
