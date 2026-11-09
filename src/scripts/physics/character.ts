import * as THREE from 'three';
import type { KinematicCharacterController } from '@dimforge/rapier3d-compat';

import * as CONSTANTS from '../Constants/Constants';
import type { Physics, PhysicsBody } from './physics';

/**
 * A capsule that walks.
 *
 * Wraps Rapier's kinematic character controller, which handles sliding,
 * stair-stepping and ground snapping for you. Controls only set
 * `velocity`; `update` integrates gravity and moves the capsule.
 *
 * The canonical `position` is the bottom of the capsule (the feet), so spawning
 * a character at `y = 0` puts it on a floor that sits at `y = 0`.
 */
export type CharacterOptions = {
    position?: THREE.Vector3 | Vec3;
    /** Capsule radius in meters. */
    radius?: number;
    /** Total capsule height including the caps, in meters. */
    height?: number;
    /** Object the capsule drives, skipped while the controls own the transform. */
    object?: THREE.Object3D | undefined;
    /** Downward acceleration. Keep it separate from world gravity for snappier jumps. */
    gravity?: number;
    /** Upward speed applied when jumping, typically 6 to 9. */
    jumpSpeed?: number;
    /** How steep a slope can still be walked, in degrees. */
    maxSlopeDegrees?: number;
    /** Slope angle above which the character starts sliding down, in degrees. */
    minSlideDegrees?: number;
    /** Maximum ledge height the character steps over automatically. */
    autostep?: number;
    /** Push dynamic bodies the character walks into. */
    pushBodies?: boolean;
    /** Mass used when pushing dynamic bodies. */
    mass?: number;
    /** Freeze movement without removing the body. */
    frozen?: boolean;
    /** Physics tag for the capsule, used by queries and projectile filtering. */
    tag?: string;
};

export class CharacterBody {
    readonly body: PhysicsBody;
    readonly controller: KinematicCharacterController;
    /** Desired velocity in meters per second. Controls write to this. */
    readonly velocity = new THREE.Vector3();
    /**
     * Extra movement for this step, in meters, on top of the velocity.
     *
     * Whatever the character is standing on writes its own movement here, which
     * is how a moving platform carries a kinematic character. The value is
     * cleared after every step.
     */
    readonly carry = new THREE.Vector3();

    /**
     * Capsule size, fixed at construction. Changing it later would move the
     * collider away from the `position` maths, which reports the feet as
     * `centre - height / 2`, so it is deliberately read only: pass `radius` and
     * `height` to the constructor instead.
     */
    readonly radius: number;
    readonly height: number;
    gravity: number;
    jumpSpeed: number;
    frozen: boolean;

    /** True after the last movement when something solid was found underneath. */
    grounded = false;
    /** True on the single step where the character touched down. */
    justLanded = false;
    /** True on the single step where the ground disappeared. */
    justLeftGround = false;

    private wasGrounded = false;
    private readonly physics: Physics;
    private readonly scratch = new THREE.Vector3();

    constructor(physics: Physics, options: CharacterOptions = {}) {
        this.physics = physics;
        this.radius = options.radius ?? CONSTANTS.PLAYER_DEFAULTS.RADIUS;
        this.height = options.height ?? CONSTANTS.PLAYER_DEFAULTS.HEIGHT;
        this.gravity = options.gravity ?? CONSTANTS.MOVEMENT.GRAVITY;
        this.jumpSpeed = options.jumpSpeed ?? Math.sqrt(2 * Math.abs(this.gravity) * CONSTANTS.MOVEMENT.JUMP_HEIGHT);
        this.frozen = options.frozen ?? false;

        const position = options.position ?? { x: 0, y: 0, z: 0 };
        const feet = new THREE.Vector3(position.x, position.y, position.z);

        this.body = physics.add({
            kind: 'kinematic',
            shape: { type: 'capsule', radius: this.radius, height: this.height },
            position: new THREE.Vector3(feet.x, feet.y + this.height / 2, feet.z),
            object: options.object,
            syncObject: options.object !== undefined,
            // The model stands on its feet and turns itself; the capsule only carries it.
            syncOffset: { x: 0, y: -this.height / 2, z: 0 },
            syncRotation: false,
            friction: 0,
            tag: options.tag ?? 'character',
        });

        this.controller = physics.world.createCharacterController(CONSTANTS.PHYSICS_DEFAULTS.CHARACTER_OFFSET);
        this.controller.setMaxSlopeClimbAngle(THREE.MathUtils.degToRad(options.maxSlopeDegrees ?? CONSTANTS.PHYSICS_DEFAULTS.CHARACTER_MAX_SLOPE_DEGREES));
        this.controller.setMinSlopeSlideAngle(THREE.MathUtils.degToRad(options.minSlideDegrees ?? CONSTANTS.PHYSICS_DEFAULTS.CHARACTER_MIN_SLIDE_DEGREES));
        this.controller.enableAutostep(options.autostep ?? CONSTANTS.PHYSICS_DEFAULTS.AUTOSTEP_MAX_HEIGHT, CONSTANTS.PHYSICS_DEFAULTS.AUTOSTEP_MIN_WIDTH, true);
        this.controller.enableSnapToGround(CONSTANTS.PHYSICS_DEFAULTS.SNAP_TO_GROUND_DISTANCE);
        this.controller.setApplyImpulsesToDynamicBodies(options.pushBodies ?? false);
        if (options.mass !== undefined) this.controller.setCharacterMass(options.mass);
    }

    /** Feet position in world space. */
    get position(): THREE.Vector3 {
        const translation = this.body.rigidBody.translation();
        return new THREE.Vector3(translation.x, translation.y - this.height / 2, translation.z);
    }

    set position(value: THREE.Vector3 | Vec3) {
        this.teleport(value);
    }

    /** The visual object the capsule drives, when one was given. */
    get object(): THREE.Object3D | undefined {
        return this.body.object;
    }

    /** Centre of the capsule, which is where the physics body sits. */
    get center(): THREE.Vector3 {
        const translation = this.body.rigidBody.translation();
        return new THREE.Vector3(translation.x, translation.y, translation.z);
    }

    /** Horizontal speed in meters per second, ignoring vertical velocity. */
    get speed(): number {
        return Math.hypot(this.velocity.x, this.velocity.z);
    }

    /** Eye position, `eyeHeight` above the feet. Used for first person cameras. */
    eyePosition(eyeHeight: number = CONSTANTS.PLAYER_DEFAULTS.EYE_HEIGHT, target = new THREE.Vector3()): THREE.Vector3 {
        return target.copy(this.position).setY(this.position.y + eyeHeight);
    }

    /** Move the capsule instantly, e.g. for respawns and teleports. */
    teleport(position: THREE.Vector3 | Vec3): void {
        this.body.setPosition({ x: position.x, y: position.y + this.height / 2, z: position.z });
        this.velocity.set(0, 0, 0);
    }

    /** Start a jump. Ignored while airborne unless `force` is set. */
    jump(speed = this.jumpSpeed, force = false): boolean {
        if (!this.grounded && !force) return false;
        this.velocity.y = speed;
        this.grounded = false;
        return true;
    }

    /** Copy the horizontal part of a direction into the velocity, keeping `y`. */
    setHorizontalVelocity(direction: THREE.Vector3, speed: number): void {
        this.velocity.x = direction.x * speed;
        this.velocity.z = direction.z * speed;
    }

    /**
     * Integrate gravity and move by one fixed step.
     * Call from a `fixedUpdate`, before `physics.step()`.
     */
    update(step: number): void {
        if (this.frozen) {
            this.velocity.set(0, 0, 0);
            return;
        }

        if (this.grounded && this.velocity.y <= 0) {
            // Small downward bias keeps the capsule glued to stairs and slopes.
            this.velocity.y = this.gravity * step;
        } else {
            this.velocity.y += this.gravity * step;
        }

        this.applyMovement(step);

        this.grounded = this.controller.computedGrounded();
        if (this.grounded && this.velocity.y < 0) this.velocity.y = 0;
        this.justLanded = this.grounded && !this.wasGrounded;
        this.justLeftGround = !this.grounded && this.wasGrounded && this.velocity.y <= 0;
        this.wasGrounded = this.grounded;
    }

    /** Ask the controller for the movement the capsule may actually perform. */
    private applyMovement(step: number): void {
        this.scratch.copy(this.velocity).multiplyScalar(step).add(this.carry);
        this.carry.set(0, 0, 0);
        this.controller.computeColliderMovement(this.body.collider, this.scratch);
        const applied = this.controller.computedMovement();
        const translation = this.body.rigidBody.translation();
        this.body.rigidBody.setNextKinematicTranslation({
            x: translation.x + applied.x,
            y: translation.y + applied.y,
            z: translation.z + applied.z,
        });

        const collisionCount = this.controller.numComputedCollisions();
        for (let index = 0; index < collisionCount; index += 1) {
            const collision = this.controller.computedCollision(index);
            if (!collision) continue;
            const normal = collision.normal1;
            // Cancel velocity into the wall so the character does not build up speed against it.
            const dot = this.velocity.x * normal.x + this.velocity.z * normal.z;
            if (dot < 0) {
                this.velocity.x -= normal.x * dot;
                this.velocity.z -= normal.z * dot;
            }
        }
    }

    /** Remove the body and the controller. */
    destroy(): void {
        this.physics.world.removeCharacterController(this.controller);
        this.physics.remove(this.body);
    }
}
