import * as THREE from 'three';

import { SYSTEM_ORDER } from '../core/systems';
import { damp, moveTowardsAngle } from '../helpers/math';
import { PointerLook, type PointerLookOptions } from './pointer-look';
import type { CharacterBody } from '../physics/character';

/**
 * Platformer controls: run, jump, and the three things every platformer needs.
 *
 * - **Coyote time**: you can still jump for a moment after walking off a ledge.
 * - **Jump buffering**: a jump pressed just before landing happens on landing.
 * - **Variable height**: releasing the jump key early cuts the rise short.
 *
 * Optional extras that cost almost nothing to turn on: a double jump, a higher
 * jump while sprinting, and an air dash. The camera is a follow camera behind
 * the character that reads `look.yaw`, so the same input works in a corridor or
 * on an open course.
 *
 * The character is NOT turned by movement: a platformer character faces the way
 * it moves, so `faceDirection` is on by default.
 */
export type PlatformerOptions = PointerLookOptions & {
    /** Ground speed in meters per second. */
    speed?: number;
    /** Speed while sprinting. */
    sprintSpeed?: number;
    /** Speed while crouching. */
    crouchSpeed?: number;
    /** How quickly the character reaches full speed. */
    acceleration?: number;
    /** Fraction of normal control while airborne. 1 keeps full air control. */
    airControl?: number;
    /** Peak jump height in meters. */
    jumpHeight?: number;
    /** Upward speed used for the jump, worked out from `jumpHeight` when omitted. */
    jumpSpeed?: number;
    /** Grace period after leaving a ledge, in seconds. */
    coyoteTime?: number;
    /** How long a jump press is remembered, in seconds. */
    jumpBuffer?: number;
    /** Multiplier applied to upward speed when the jump key is released early. */
    jumpCut?: number;
    /** Extra jumps in the air, 0 by default, 1 for a double jump. */
    airJumps?: number;
    /** Turn the character towards its movement direction. */
    faceDirection?: boolean;
    /** How fast the character turns, radians per second. */
    turnSpeed?: number;
    /** Camera distance behind the character. */
    cameraDistance?: number;
    /** Camera height above the character's feet. */
    cameraHeight?: number;
    /** How high up the character the camera looks at. */
    cameraLookHeight?: number;
    /** How quickly the camera catches up. */
    cameraDamping?: number;
    /** Pull the camera in when a wall is in the way. */
    cameraCollision?: boolean;
};

export class PlatformerController {
    readonly look: PointerLook;
    readonly body: CharacterBody;

    /** True while the character may jump, including coyote time. */
    canJump = true;
    /** Jumps left before touching the ground. */
    airJumpsLeft = 0;
    /** True on the step a jump starts. */
    justJumped = false;

    private coyoteTimer = 0;
    private bufferTimer = 0;

    private readonly game: Game;
    private readonly camera: THREE.PerspectiveCamera;
    private readonly speed: number;
    private readonly sprintSpeed: number;
    private readonly crouchSpeed: number;
    private readonly acceleration: number;
    private readonly airControl: number;
    private readonly jumpSpeed: number;
    private readonly coyoteTime: number;
    private readonly jumpBuffer: number;
    private readonly jumpCut: number;
    private readonly airJumps: number;
    private readonly faceDirection: boolean;
    private readonly turnSpeed: number;
    private readonly cameraDistance: number;
    private readonly cameraHeight: number;
    private readonly cameraLookHeight: number;
    private readonly cameraDamping: number;
    private readonly cameraCollision: boolean;
    private readonly airJumpsTotal: number;

    private wishDirection = new THREE.Vector3();
    private readonly desired = new THREE.Vector3();
    private readonly pivot = new THREE.Vector3();
    private readonly cameraGoal = new THREE.Vector3();
    private sprinting = false;
    private crouching = false;
    private jumping = false;
    private readonly detach: () => void;

    constructor(game: Game, body: CharacterBody, options: PlatformerOptions = {}) {
        this.game = game;
        this.body = body;
        this.camera = game.camera;

        this.look = new PointerLook(game, { pitch: options.pitch ?? -0.18, ...options });
        this.speed = options.speed ?? 5.2;
        this.sprintSpeed = options.sprintSpeed ?? 8;
        this.crouchSpeed = options.crouchSpeed ?? 2.6;
        this.acceleration = options.acceleration ?? 34;
        this.airControl = options.airControl ?? 0.75;
        this.jumpSpeed = options.jumpSpeed ?? Math.sqrt(2 * Math.abs(body.gravity) * (options.jumpHeight ?? 2.1));
        this.coyoteTime = options.coyoteTime ?? 0.12;
        this.jumpBuffer = options.jumpBuffer ?? 0.14;
        this.jumpCut = options.jumpCut ?? 0.45;
        this.airJumps = options.airJumps ?? 0;
        this.airJumpsTotal = this.airJumps;
        this.faceDirection = options.faceDirection ?? true;
        this.turnSpeed = options.turnSpeed ?? 14;
        this.cameraDistance = options.cameraDistance ?? 7;
        this.cameraHeight = options.cameraHeight ?? 3.4;
        this.cameraLookHeight = options.cameraLookHeight ?? 1.2;
        this.cameraDamping = options.cameraDamping ?? 7;
        this.cameraCollision = options.cameraCollision ?? true;

        this.pivot.copy(body.position).setY(body.position.y + this.cameraLookHeight);

        const unregister = game.systems.add({
            name: 'platformer-controls',
            order: SYSTEM_ORDER.CONTROL,
            update: (delta) => this.update(delta),
            fixedUpdate: (step) => this.fixedUpdate(step),
            lateUpdate: (delta) => this.lateUpdate(delta),
        });
        this.detach = () => {
            unregister();
            this.look.dispose();
        };
    }

    /** Feet position. */
    get position(): THREE.Vector3 {
        return this.body.position;
    }

    set position(value: THREE.Vector3 | Vec3) {
        this.body.teleport(value);
    }

    /** Horizontal speed in meters per second. */
    get speedNow(): number {
        return this.body.speed;
    }

    /** True while standing on something. */
    get grounded(): boolean {
        return this.body.grounded;
    }

    /** Stop reading input, e.g. while a menu is open. */
    setEnabled(enabled: boolean): void {
        this.look.enabled = enabled;
        this.game.systems.setEnabled('platformer-controls', enabled);
        if (!enabled) this.game.input.exitPointerLock();
    }

    /** Push the character, e.g. from a spring or an explosion. */
    launch(velocity: THREE.Vector3): void {
        this.body.velocity.add(velocity);
        this.body.grounded = false;
    }

    dispose(): void {
        this.detach();
    }

    //#region Frame work

    private update(delta: number): void {
        this.look.addLook(this.game.input.look);
        const input = this.game.input;

        this.sprinting = input.isDown('sprint');
        this.crouching = input.isDown('crouch');
        this.jumping = input.isDown('jump');

        // Buffer the press, so a jump slightly before landing still counts.
        if (input.wasPressed('jump')) this.bufferTimer = this.jumpBuffer;

        const move = input.move;
        const yaw = this.look.yaw;
        // Movement is relative to the camera, flat on the ground.
        const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
        const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
        this.wishDirection.set(0, 0, 0).addScaledVector(forward, move.y).addScaledVector(right, move.x);
        if (this.wishDirection.lengthSq() > 1) this.wishDirection.normalize();
    }

    private fixedUpdate(step: number): void {
        this.coyoteTimer = Math.max(0, this.coyoteTimer - step);
        this.bufferTimer = Math.max(0, this.bufferTimer - step);
        this.justJumped = false;

        if (this.body.grounded) {
            this.coyoteTimer = this.coyoteTime;
            this.airJumpsLeft = this.airJumpsTotal;
        }

        // A jump is allowed while grounded, inside the coyote window, or with an
        // air jump left.
        this.canJump = this.body.grounded || this.coyoteTimer > 0 || this.airJumpsLeft > 0;
        if (this.bufferTimer > 0 && this.canJump) this.performJump();

        // Variable height: releasing the key while rising cuts the jump short.
        if (!this.jumping && this.body.velocity.y > 0) this.body.velocity.y *= this.jumpCut;

        const target = (this.crouching ? this.crouchSpeed : this.sprinting ? this.sprintSpeed : this.speed) * (this.wishDirection.lengthSq() > 0 ? 1 : 0);
        const rate = this.body.grounded ? this.acceleration : this.acceleration * this.airControl;
        this.desired.copy(this.wishDirection).multiplyScalar(target);
        const smoothing = Math.exp(-rate);
        this.body.velocity.x = damp(this.body.velocity.x, this.desired.x, smoothing, step);
        this.body.velocity.z = damp(this.body.velocity.z, this.desired.z, smoothing, step);

        if (this.faceDirection && this.wishDirection.lengthSq() > 0.01 && this.body.object) {
            const yaw = Math.atan2(this.wishDirection.x, this.wishDirection.z);
            this.body.object.rotation.y = moveTowardsAngle(this.body.object.rotation.y, yaw, this.turnSpeed * step);
        }

        this.body.update(step);
    }

    private performJump(): void {
        this.bufferTimer = 0;
        this.justJumped = true;

        if (this.body.grounded || this.coyoteTimer > 0) {
            this.body.velocity.y = this.jumpSpeed;
            this.coyoteTimer = 0;
            this.body.grounded = false;
            return;
        }

        if (this.airJumpsLeft > 0) {
            this.airJumpsLeft -= 1;
            this.body.velocity.y = this.jumpSpeed;
        }
    }

    private lateUpdate(delta: number): void {
        const camera = this.camera;
        this.look.applyTo(camera, delta);

        const target = this.body.position;
        this.cameraGoal.copy(target).setY(target.y + this.cameraLookHeight);
        this.pivot.x = damp(this.pivot.x, this.cameraGoal.x, Math.exp(-this.cameraDamping), delta);
        this.pivot.y = damp(this.pivot.y, this.cameraGoal.y, Math.exp(-this.cameraDamping * 0.65), delta);
        this.pivot.z = damp(this.pivot.z, this.cameraGoal.z, Math.exp(-this.cameraDamping), delta);

        // Camera sits behind the character along the look direction.
        const forward = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(this.look.pitch, this.look.yaw, 0, 'YXZ'));
        const goal = this.pivot.clone().addScaledVector(forward, -this.cameraDistance).setY(this.pivot.y + this.cameraHeight - this.cameraLookHeight);

        if (this.cameraCollision) {
            const toCamera = goal.clone().sub(this.pivot);
            const distance = toCamera.length();
            const hit = this.game.physics.raycast(this.pivot, toCamera, distance, undefined, this.body.body);
            if (hit && hit.distance < distance) goal.copy(this.pivot).addScaledVector(toCamera.normalize(), Math.max(hit.distance - 0.3, 0.4));
        }

        camera.position.copy(goal);
        camera.lookAt(this.pivot);
    }

    //#endregion Frame work
}
