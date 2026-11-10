import * as THREE from 'three';

import * as CONSTANTS from '../Constants/Constants';
import { SYSTEM_ORDER } from '../core/systems';
import { clamp, damp } from '../helpers/math';
import type { Player } from '../game/player';
import { CharacterMovement, type CharacterMovementOptions } from './character-movement';
import { PointerLook, type PointerLookOptions } from './pointer-look';

/**
 * Over-the-shoulder third person camera.
 *
 * The character moves relative to the camera, turns to face its movement
 * direction, and the camera orbits on a pivot that follows the player with a
 * small lag. A sphere cast pulls the camera in when a wall would clip through
 * it, and the wheel changes the distance.
 */
export type ThirdPersonOptions = PointerLookOptions &
    CharacterMovementOptions & {
        /** Distance from the pivot to the camera in meters. */
        distance?: number;
        /** Minimum distance the wheel can zoom to. */
        minDistance?: number;
        /** Maximum distance the wheel can zoom to. */
        maxDistance?: number;
        /** Height above the player's feet that the camera looks at. */
        targetHeight?: number;
        /** How fast the pivot follows the player. Higher is tighter. */
        followDamping?: number;
        /** Radius used for the camera collision cast. */
        cameraRadius?: number;
        /** Sideways offset so the character does not cover the crosshair. */
        shoulderOffset?: number;
        /** Field of view while sprinting. */
        sprintFov?: number;
        /** Disable camera collision, e.g. in an open field with no walls. */
        cameraCollision?: boolean;
        /** Base field of view for this camera. */
        fov?: number;
    };

export class ThirdPersonController {
    readonly camera: THREE.PerspectiveCamera;
    readonly look: PointerLook;
    readonly movement: CharacterMovement;
    /**
     * Replaces walking for as long as it is set: a bike, a horse, a boat. It gets
     * the player's movement input every physics step and moves the body itself;
     * the camera, look and collision keep working as before.
     */
    movementOverride: ((step: number) => void) | undefined;

    /** Current orbit distance in meters. */
    distance: number;
    /** Height above the feet that the camera aims at. */
    targetHeight: number;
    shoulderOffset: number;

    private readonly game: Game;
    private readonly player: Player;
    private readonly minDistance: number;
    private readonly maxDistance: number;
    private readonly followDamping: number;
    private readonly cameraRadius: number;
    private readonly cameraCollision: boolean;
    private readonly baseFov: number;
    private readonly sprintFov: number;

    private readonly pivot = new THREE.Vector3();
    private readonly desired = new THREE.Vector3();
    private readonly forwardVector = new THREE.Vector3();
    private readonly scratch = new THREE.Vector3();
    private wishDirection = new THREE.Vector3();
    private sprintIntent = false;
    private jumpIntent = false;
    private readonly detach: () => void;

    constructor(game: Game, player: Player, options: ThirdPersonOptions = {}) {
        this.game = game;
        this.player = player;
        this.camera = game.camera;

        this.distance = options.distance ?? CONSTANTS.CAMERA.THIRD_PERSON_DISTANCE;
        this.minDistance = options.minDistance ?? CONSTANTS.CAMERA.THIRD_PERSON_MIN_DISTANCE;
        this.maxDistance = options.maxDistance ?? CONSTANTS.CAMERA.THIRD_PERSON_DISTANCE * 2.5;
        this.targetHeight = options.targetHeight ?? CONSTANTS.CAMERA.THIRD_PERSON_HEIGHT;
        this.followDamping = options.followDamping ?? CONSTANTS.CAMERA.FOLLOW_DAMPING;
        this.cameraRadius = options.cameraRadius ?? 0.35;
        this.cameraCollision = options.cameraCollision ?? true;
        this.shoulderOffset = options.shoulderOffset ?? 0;
        this.baseFov = options.fov ?? this.camera.fov;
        this.sprintFov = options.sprintFov ?? this.baseFov + CONSTANTS.CAMERA.FOV_KICK;

        this.look = new PointerLook(game, { ...options, pitch: options.pitch ?? -0.25 });
        this.movement = new CharacterMovement(player.body, options);

        this.pivot.copy(player.position).setY(player.position.y + this.targetHeight);

        const unregister = game.systems.add({
            name: 'third-person-controls',
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

    /** Feet position of the controlled player. */
    get position(): THREE.Vector3 {
        return this.player.position;
    }

    set position(value: THREE.Vector3 | Vec3) {
        this.player.body.teleport(value);
    }

    /** Extra degrees of field of view, e.g. growing with a vehicle's speed. Set it every frame or once. */
    fovBoost = 0;

    /** Direction the camera looks along. Used for aiming and interaction. */
    get forward(): THREE.Vector3 {
        return this.camera.getWorldDirection(new THREE.Vector3());
    }

    /** Stop reading input and release pointer lock, e.g. for a menu. */
    setEnabled(enabled: boolean): void {
        this.look.enabled = enabled;
        this.game.systems.setEnabled('third-person-controls', enabled);
        if (!enabled) this.game.input.exitPointerLock();
    }

    /** Register the camera as the source for interaction and projectile aim. */
    useCameraForAiming(): void {
        this.game.interactions.useCamera(this.camera);
    }

    dispose(): void {
        this.detach();
    }

    //#region Frame work

    private update(delta: number): void {
        this.look.addLook(this.game.input.look);
        this.sprintIntent = this.game.input.isDown('sprint');
        // Latched until a physics step consumes it: at high refresh rates most frames run no step.
        if (this.game.input.wasPressed('jump')) this.jumpIntent = true;

        const move = this.game.input.move;
        const forward = this.look.forward();
        const right = this.look.right();
        this.wishDirection.set(0, 0, 0).addScaledVector(forward, move.y).addScaledVector(right, move.x);

        // Wheel zoom.
        const scroll = this.game.input.mouse.scroll.delta;
        if (scroll !== 0 && !this.game.input.mouse.scroll.claimedBy) this.distance = clamp(this.distance + scroll * 0.6, this.minDistance, this.maxDistance);

        const targetHeight = this.player.position.y + this.targetHeight;
        this.scratch.set(this.player.position.x, targetHeight, this.player.position.z);
        this.pivot.x = damp(this.pivot.x, this.scratch.x, Math.exp(-this.followDamping), delta);
        this.pivot.y = damp(this.pivot.y, this.scratch.y, Math.exp(-this.followDamping * 0.6), delta);
        this.pivot.z = damp(this.pivot.z, this.scratch.z, Math.exp(-this.followDamping), delta);
    }

    private fixedUpdate(step: number): void {
        if (this.player.frozen || this.player.isDead) {
            this.player.body.update(step);
            this.jumpIntent = false;
            return;
        }
        if (this.movementOverride) {
            this.movementOverride(step);
            this.jumpIntent = false;
            return;
        }
        this.movement.move(this.wishDirection, step, {
            sprint: this.sprintIntent,
            crouch: this.game.input.isDown('crouch'),
            jump: this.jumpIntent,
        });
        this.jumpIntent = false;
    }

    private lateUpdate(delta: number): void {
        const camera = this.camera;
        // Camera forward from the orbit angles, so both share one convention.
        this.forwardVector.set(0, 0, -1).applyEuler(new THREE.Euler(this.look.pitch, this.look.yaw, 0, 'YXZ'));

        this.desired.copy(this.pivot).addScaledVector(this.forwardVector, -this.distance);

        if (this.shoulderOffset !== 0) {
            const right = this.look.right();
            this.desired.addScaledVector(right, this.shoulderOffset);
        }

        if (this.cameraCollision) {
            const toCamera = this.desired.clone().sub(this.pivot);
            const distance = toCamera.length();
            const hit = this.game.physics.raycast(this.pivot, toCamera, distance, undefined, this.player.body.body);
            if (hit && hit.distance < distance) {
                this.desired.copy(this.pivot).addScaledVector(toCamera.normalize(), Math.max(hit.distance - this.cameraRadius, 0.1));
            }
        }

        camera.position.copy(this.desired);
        camera.lookAt(this.pivot);
        // lookAt leaves the roll at zero, which is what a third person camera wants.

        const sprinting = this.sprintIntent && this.movement.isMoving;
        const targetFov = (sprinting ? this.sprintFov : this.baseFov) + this.fovBoost;
        if (Math.abs(camera.fov - targetFov) > 0.01) {
            camera.fov = damp(camera.fov, targetFov, 0.02, delta);
            camera.updateProjectionMatrix();
        }
    }

    //#endregion Frame work
}
