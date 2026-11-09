import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { gsap } from 'gsap';

import { SYSTEM_ORDER } from '../core/systems';

/**
 * Mouse driven orbit camera, straight from the three.js addons.
 *
 * Not a gameplay controller: use it for level previews, main menu dioramas and
 * board games where the player inspects a scene instead of walking in it.
 */
export type OrbitOptions = {
    /** Point the camera orbits around. */
    target?: THREE.Vector3 | Vec3;
    minDistance?: number;
    maxDistance?: number;
    /** Slow automatic spin, good for a menu backdrop. */
    autoRotate?: boolean;
    autoRotateSpeed?: number;
    /** Inertia after releasing the mouse. */
    enableDamping?: boolean;
    /** Share of the remaining glide removed per 1/60 s. Higher stops sooner. */
    dampingFactor?: number;
    minPolarAngle?: number;
    maxPolarAngle?: number;
    enablePan?: boolean;
    /** Pan parallel to the screen instead of across the ground. */
    screenSpacePanning?: boolean;
    /** Ignore input, e.g. while a menu is open. */
    enabled?: boolean;
    /** Distance from the target when the controller starts. */
    distance?: number;
};

export class OrbitController {
    readonly controls: OrbitControls;

    private readonly game: Game;
    private readonly detach: () => void;
    private readonly releaseGuard: () => void;
    private tween: gsap.core.Tween | undefined;

    constructor(game: Game, options: OrbitOptions = {}) {
        this.game = game;
        this.controls = new OrbitControls(game.camera, game.canvas);
        this.releaseGuard = guardPointerDrag(game.canvas);
        this.controls.enableDamping = options.enableDamping ?? true;
        const damping = options.dampingFactor ?? 0.12;
        this.controls.dampingFactor = damping;
        this.controls.minDistance = options.minDistance ?? 2;
        this.controls.maxDistance = options.maxDistance ?? 60;
        this.controls.maxPolarAngle = options.maxPolarAngle ?? Math.PI / 2.05;
        if (options.minPolarAngle !== undefined) this.controls.minPolarAngle = options.minPolarAngle;
        this.controls.enablePan = options.enablePan ?? true;
        this.controls.screenSpacePanning = options.screenSpacePanning ?? true;
        this.controls.autoRotate = options.autoRotate ?? false;
        this.controls.autoRotateSpeed = options.autoRotateSpeed ?? 0.6;
        this.controls.enabled = options.enabled ?? true;

        if (options.target) this.controls.target.set(options.target.x, options.target.y, options.target.z);
        if (options.distance !== undefined) {
            const direction = game.camera.position.clone().sub(this.controls.target).normalize();
            game.camera.position.copy(this.controls.target).addScaledVector(direction, options.distance);
        }
        this.controls.update();

        const unregister = game.systems.add({
            name: 'orbit-controls',
            order: SYSTEM_ORDER.CAMERA,
            lateUpdate: (delta) => {
                // OrbitControls damps per frame, so the glide would last four times
                // as long at 30 fps as at 120. Scale it to real time instead.
                this.controls.dampingFactor = 1 - Math.pow(1 - damping, Math.min(delta, 0.1) * 60);
                this.controls.update();
            },
        });
        this.detach = () => unregister();
    }

    /** Turn the controller on or off, e.g. from a menu. */
    setEnabled(enabled: boolean): void {
        this.controls.enabled = enabled;
        this.game.systems.setEnabled('orbit-controls', enabled);
    }

    /** Move the orbit centre. */
    setTarget(target: THREE.Vector3 | Vec3): void {
        this.controls.target.set(target.x, target.y, target.z);
        this.controls.update();
    }

    /** Frame a point at a given distance, e.g. when a board game loads. */
    focus(target: THREE.Vector3 | Vec3, distance?: number): void {
        this.setTarget(target);
        if (distance === undefined) return;
        const direction = this.game.camera.position.clone().sub(this.controls.target).normalize();
        this.game.camera.position.copy(this.controls.target).addScaledVector(direction, distance);
        this.controls.update();
    }

    /**
     * Glide the camera around the target to a new angle, e.g. to look at a board
     * from the other side. Angles are in radians: azimuth 0 looks from +z towards
     * -z, polar 0 is straight down. Omitted values keep their current value.
     */
    orbitTo(view: { azimuth?: number; polar?: number; distance?: number }, duration = 0.8): Promise<void> {
        const target = this.controls.target;
        const offset = this.game.camera.position.clone().sub(target);
        const from = new THREE.Spherical().setFromVector3(offset);
        const to = { theta: view.azimuth ?? from.theta, phi: view.polar ?? from.phi, radius: view.distance ?? from.radius };
        // Take the short way round.
        const turn = Math.atan2(Math.sin(to.theta - from.theta), Math.cos(to.theta - from.theta));
        const state = { t: 0 };
        const spherical = new THREE.Spherical();
        this.tween?.kill();

        return new Promise((resolve) => {
            const apply = (): void => {
                spherical.set(from.radius + (to.radius - from.radius) * state.t, from.phi + (to.phi - from.phi) * state.t, from.theta + turn * state.t);
                this.game.camera.position.copy(target).add(offset.setFromSpherical(spherical));
                this.controls.update();
            };
            if (duration <= 0) {
                state.t = 1;
                apply();
                resolve();
                return;
            }
            this.tween = gsap.to(state, { t: 1, duration, ease: 'power2.inOut', onUpdate: apply, onComplete: () => resolve() });
        });
    }

    dispose(): void {
        this.detach();
        this.releaseGuard();
        this.tween?.kill();
        this.controls.dispose();
    }
}

/**
 * OrbitControls ends a drag only when `pointerup` reaches the canvas, and it
 * throws when the browser has already forgotten the pointer (a synthetic event,
 * or a release that landed on a DOM panel). Either way the drag state would
 * stick and the camera would keep following the mouse after the button is up.
 *
 * Two guards fix that: the capture calls cannot throw, and a window level
 * listener replays any release or cancel the canvas never saw.
 */
function guardPointerDrag(element: HTMLElement): () => void {
    const marker = element as unknown as Record<string, unknown>;
    if (marker.__dragGuarded) return () => undefined;
    marker.__dragGuarded = true;

    const setCapture = element.setPointerCapture.bind(element);
    const releaseCapture = element.releasePointerCapture.bind(element);
    element.setPointerCapture = (pointerId: number): void => {
        try {
            setCapture(pointerId);
        } catch {
            // Stale pointer: the drag works, the window listener ends it.
        }
    };
    element.releasePointerCapture = (pointerId: number): void => {
        try {
            releaseCapture(pointerId);
        } catch {
            // Already released, which is the state we wanted.
        }
    };

    const down = new Set<number>();
    const track = (event: PointerEvent): void => void down.add(event.pointerId);
    const replayRelease = (event: PointerEvent): void => {
        if (!down.delete(event.pointerId)) return;
        // Only when the canvas did not get the event itself; otherwise OrbitControls already ended the drag.
        if (event.target === element) return;
        element.dispatchEvent(new PointerEvent('pointerup', { pointerId: event.pointerId, pointerType: event.pointerType, button: event.button, clientX: event.clientX, clientY: event.clientY, bubbles: true }));
    };
    const releaseAll = (): void => {
        for (const pointerId of down) element.dispatchEvent(new PointerEvent('pointerup', { pointerId, bubbles: true }));
        down.clear();
    };

    element.addEventListener('pointerdown', track, true);
    element.addEventListener('pointerup', (event) => down.delete(event.pointerId));
    window.addEventListener('pointerup', replayRelease);
    window.addEventListener('pointercancel', replayRelease);
    window.addEventListener('blur', releaseAll);
    return () => {
        window.removeEventListener('pointerup', replayRelease);
        window.removeEventListener('pointercancel', replayRelease);
        window.removeEventListener('blur', releaseAll);
        element.removeEventListener('pointerdown', track, true);
        marker.__dragGuarded = false;
    };
}
