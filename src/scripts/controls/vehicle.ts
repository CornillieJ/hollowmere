import * as THREE from 'three';

import { SYSTEM_ORDER } from '../core/systems';
import { clamp, damp, dampAngle } from '../helpers/math';
import type { VehicleBody } from '../physics/vehicle';

/**
 * Drive a `VehicleBody`: WASD or the left stick for throttle and steering,
 * Space for the brake, and a chase camera that swings in behind the car.
 *
 * Dragging the pointer peeks around the car; the peek slides back to dead
 * astern, which is what you want while parking a van. On a phone the joystick
 * is the wheel and the jump button is the brake.
 */
export type VehicleControllerOptions = {
    /** Camera distance in meters. */
    distance?: number;
    /** Camera height above the chassis. */
    height?: number;
    /** How fast the camera swings behind the car. Higher is tighter. */
    alignDamping?: number;
    /** Extra field of view at top speed. */
    speedFovKick?: number;
    /** Speed at which the kick is fully in, km/h. */
    kickSpeed?: number;
    /** Throttle key overrides, e.g. for a second driver. */
    brakeAction?: string;
};

export class VehicleController {
    readonly vehicle: VehicleBody;

    private readonly game: Game;
    private readonly camera: THREE.PerspectiveCamera;
    private readonly distance: number;
    private readonly height: number;
    private readonly alignDamping: number;
    private readonly fovKick: number;
    private readonly kickSpeed: number;
    private readonly brakeAction: string;
    private readonly baseFov: number;
    private readonly detach: () => void;

    private cameraYaw: number;
    private peekYaw = 0;
    private readonly desired = new THREE.Vector3();
    private readonly target = new THREE.Vector3();

    constructor(game: Game, vehicle: VehicleBody, options: VehicleControllerOptions = {}) {
        this.game = game;
        this.vehicle = vehicle;
        this.camera = game.camera;
        this.distance = options.distance ?? 7.5;
        this.height = options.height ?? 3.2;
        this.alignDamping = options.alignDamping ?? 3.2;
        this.fovKick = options.speedFovKick ?? 9;
        this.kickSpeed = options.kickSpeed ?? 70;
        this.brakeAction = options.brakeAction ?? 'jump';
        this.baseFov = this.camera.fov;
        this.cameraYaw = vehicle.yaw;

        const unregister = game.systems.add({
            name: 'vehicle-controls',
            order: SYSTEM_ORDER.CONTROL,
            update: (delta) => this.update(delta),
            lateUpdate: (delta) => this.lateUpdate(delta),
        });
        this.detach = () => unregister();
    }

    dispose(): void {
        this.detach();
    }

    //#region Frame work

    private update(delta: number): void {
        const input = this.game.input;
        this.vehicle.drive({
            throttle: input.move.y,
            steer: -input.move.x,
            brake: input.isDown(this.brakeAction) || input.isDown('crouch') ? 1 : 0,
        });

        // Dragging peeks around the car; the peek decays back to dead astern.
        this.peekYaw = clamp(this.peekYaw - input.look.x * 0.0035, -Math.PI, Math.PI);
        this.peekYaw = damp(this.peekYaw, 0, 0.35, delta);

        const speed = Math.abs(this.vehicle.speed);
        // Reverse the trailing side when backing up, so the camera stays behind.
        const reversing = this.vehicle.speed < -0.5 && input.move.y < 0;
        const goalYaw = this.vehicle.yaw + this.peekYaw + (reversing ? Math.PI : 0);
        // The heading wraps at ±π, so a plain damp would swing the camera a full turn there.
        this.cameraYaw = dampAngle(this.cameraYaw, goalYaw, Math.exp(-this.alignDamping), delta * (1 + speed * 0.05));
    }

    private lateUpdate(delta: number): void {
        const forward = new THREE.Vector3(Math.sin(this.cameraYaw), 0, Math.cos(this.cameraYaw));
        this.target.copy(this.vehicle.position).add(new THREE.Vector3(0, this.height * 0.45, 0));
        this.desired.copy(this.vehicle.position).addScaledVector(forward, -this.distance).add(new THREE.Vector3(0, this.height, 0));

        // Keep the camera out of the ground and the buildings.
        const ground = this.game.physics.raycast(this.target, this.desired.clone().sub(this.target).normalize(), this.target.distanceTo(this.desired), undefined, this.vehicle.chassis);
        if (ground && ground.distance < this.target.distanceTo(this.desired)) {
            this.desired.copy(this.target).addScaledVector(this.desired.clone().sub(this.target).normalize(), Math.max(ground.distance - 0.3, 0.5));
        }

        this.camera.position.copy(this.desired);
        this.camera.lookAt(this.target);

        const targetFov = this.baseFov + this.fovKick * Math.min(1, this.vehicle.speedKmh / this.kickSpeed);
        if (Math.abs(this.camera.fov - targetFov) > 0.05) {
            this.camera.fov = damp(this.camera.fov, targetFov, 0.03, delta);
            this.camera.updateProjectionMatrix();
        }
    }

    //#endregion Frame work
}
