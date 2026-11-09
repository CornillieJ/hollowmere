import * as THREE from 'three';

import * as CONSTANTS from '../Constants/Constants';
import { damp } from '../helpers/math';
import type { CharacterBody } from '../physics/character';

/**
 * Turns movement intent into character velocity.
 *
 * The control schemes differ only in how they build the direction vector.
 * Acceleration, sprinting, air control, turning and jumping are identical, so
 * they live here. Call `move` once per fixed step from the active scheme.
 */
export type CharacterMovementOptions = {
    walkSpeed?: number;
    sprintSpeed?: number;
    crouchSpeed?: number;
    /** How quickly the character reaches the target speed, higher is snappier. */
    acceleration?: number;
    /** Fraction of the target speed reachable while airborne. */
    airControl?: number;
    /** Disable jumping, e.g. for a top-down game. */
    jumpEnabled?: boolean;
    /** Vertical speed of a jump. Defaults to clearing `MOVEMENT.JUMP_HEIGHT`. */
    jumpSpeed?: number;
    /** Turn the object to face the movement direction, on by default. */
    faceDirection?: boolean;
    /** How fast the character turns, radians per second. */
    turnSpeed?: number;
};

export class CharacterMovement {
    walkSpeed: number;
    sprintSpeed: number;
    crouchSpeed: number;
    acceleration: number;
    airControl: number;
    jumpEnabled: boolean;
    jumpSpeed: number;
    faceDirection: boolean;
    turnSpeed: number;

    private readonly body: CharacterBody;
    private readonly target = new THREE.Vector3();
    private readonly scratch = new THREE.Vector3();

    constructor(body: CharacterBody, options: CharacterMovementOptions = {}) {
        this.body = body;
        this.walkSpeed = options.walkSpeed ?? CONSTANTS.MOVEMENT.WALK_SPEED;
        this.sprintSpeed = options.sprintSpeed ?? CONSTANTS.MOVEMENT.SPRINT_SPEED;
        this.crouchSpeed = options.crouchSpeed ?? CONSTANTS.MOVEMENT.CROUCH_SPEED;
        this.acceleration = options.acceleration ?? CONSTANTS.MOVEMENT.ACCELERATION;
        this.airControl = options.airControl ?? CONSTANTS.MOVEMENT.AIR_CONTROL;
        this.jumpEnabled = options.jumpEnabled ?? true;
        this.jumpSpeed = options.jumpSpeed ?? Math.sqrt(2 * Math.abs(body.gravity) * CONSTANTS.MOVEMENT.JUMP_HEIGHT);
        this.faceDirection = options.faceDirection ?? true;
        this.turnSpeed = options.turnSpeed ?? CONSTANTS.MOVEMENT.TURN_SPEED;
    }

    /** Current horizontal speed in meters per second. */
    get speed(): number {
        return this.body.speed;
    }

    /** True while the character moves faster than a slow walk. */
    get isMoving(): boolean {
        return this.body.speed > 0.4;
    }

    /** True when the character stands on something. */
    get grounded(): boolean {
        return this.body.grounded;
    }

    /**
     * Drive the body for one fixed step.
     * @param direction Desired movement direction in world space, `y` is ignored.
     * @param step Fixed step size in seconds.
     * @param intent Sprint, crouch and jump flags for this step.
     */
    move(direction: THREE.Vector3, step: number, intent: { sprint?: boolean; crouch?: boolean; jump?: boolean } = {}): void {
        const speed = intent.crouch ? this.crouchSpeed : intent.sprint ? this.sprintSpeed : this.walkSpeed;

        this.target.copy(direction).setY(0);
        if (this.target.lengthSq() > 1) this.target.normalize();
        this.target.multiplyScalar(speed);

        const rate = this.body.grounded ? this.acceleration : this.acceleration * this.airControl;
        // `damp` with the per-second factor gives a frame-rate independent approach.
        const smoothing = Math.exp(-rate);
        this.body.velocity.x = damp(this.body.velocity.x, this.target.x, smoothing, step);
        this.body.velocity.z = damp(this.body.velocity.z, this.target.z, smoothing, step);

        if (intent.jump && this.jumpEnabled) this.body.jump(this.jumpSpeed);
        if (this.faceDirection && this.target.lengthSq() > 0.01 && this.body.object) this.faceObject(this.body.object, this.target, step);

        this.body.update(step);
    }

    /** Add a one-off velocity, e.g. from a dash, a launch pad or knockback. */
    push(velocity: THREE.Vector3): void {
        this.body.velocity.add(velocity);
    }

    /** Turn an object towards a direction, without moving the body. */
    faceObject(object: THREE.Object3D, direction: THREE.Vector3, delta: number): void {
        this.scratch.copy(direction).setY(0);
        if (this.scratch.lengthSq() < 1e-6) return;
        const targetYaw = Math.atan2(this.scratch.x, this.scratch.z);
        let difference = targetYaw - object.rotation.y;
        while (difference > Math.PI) difference -= Math.PI * 2;
        while (difference < -Math.PI) difference += Math.PI * 2;
        const maxStep = this.turnSpeed * delta;
        object.rotation.y += Math.max(-maxStep, Math.min(maxStep, difference));
    }
}
