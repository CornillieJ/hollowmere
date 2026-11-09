import * as THREE from 'three';

import * as CONSTANTS from '../Constants/Constants';
import { SYSTEM_ORDER } from '../core/systems';
import { damp } from '../helpers/math';
import type { Player } from '../game/player';
import { CharacterMovement, type CharacterMovementOptions } from './character-movement';
import { PointerLook, type PointerLookOptions } from './pointer-look';

/**
 * First person camera and movement.
 *
 * WASD moves relative to where the camera looks, the character does not turn
 * with the mouse (there is nothing to see of it), and pointer lock is requested
 * on the first click. Add head bob, crouch and a sprint FOV kick with the
 * options.
 */
export type FirstPersonOptions = PointerLookOptions &
    CharacterMovementOptions & {
        /** Eye height above the feet while standing. */
        eyeHeight?: number;
        /** Eye height while crouching. */
        crouchEyeHeight?: number;
        /** Head bob amplitude in meters, 0 disables it. */
        headBob?: number;
        /** Head bob cycles per second at walking speed. */
        headBobFrequency?: number;
        /** Eye height smoothing when standing up or crouching down. */
        crouchSmoothing?: number;
        /** Field of view while sprinting, defaults to `CAMERA.FOV` plus a small kick. */
        sprintFov?: number;
        /** Local offset added in camera space, e.g. a weapon model offset. */
        cameraOffset?: THREE.Vector3;
        /** Extra field of view, added on top of the camera's own value. */
        fov?: number;
    };

export class FirstPersonController {
    readonly camera: THREE.PerspectiveCamera;
    readonly look: PointerLook;
    readonly movement: CharacterMovement;

    /** Local offset applied in camera space each frame. */
    cameraOffset: THREE.Vector3;

    private readonly game: Game;
    private readonly player: Player;
    private readonly eyeHeight: number;
    private readonly crouchEyeHeight: number;
    private readonly headBob: number;
    private readonly headBobFrequency: number;
    private readonly crouchSmoothing: number;
    private readonly baseFov: number;
    private readonly sprintFov: number;

    private currentEyeHeight: number;
    private bobTime = 0;
    private wishDirection = new THREE.Vector3();
    private sprintIntent = false;
    private crouchIntent = false;
    private jumpIntent = false;
    private readonly detach: () => void;

    constructor(game: Game, player: Player, options: FirstPersonOptions = {}) {
        this.game = game;
        this.player = player;
        this.camera = game.camera;

        const startYaw = options.yaw ?? player.root.rotation.y;
        this.look = new PointerLook(game, { ...options, yaw: startYaw });
        this.movement = new CharacterMovement(player.body, { faceDirection: false, ...options });

        this.eyeHeight = options.eyeHeight ?? CONSTANTS.PLAYER_DEFAULTS.EYE_HEIGHT;
        this.crouchEyeHeight = options.crouchEyeHeight ?? CONSTANTS.PLAYER_DEFAULTS.CROUCH_HEIGHT;
        this.headBob = options.headBob ?? CONSTANTS.MOVEMENT.HEAD_BOB;
        this.headBobFrequency = options.headBobFrequency ?? CONSTANTS.MOVEMENT.HEAD_BOB_FREQUENCY;
        this.crouchSmoothing = options.crouchSmoothing ?? 12;
        this.cameraOffset = options.cameraOffset ?? new THREE.Vector3();
        this.baseFov = options.fov ?? this.camera.fov;
        this.sprintFov = options.sprintFov ?? this.baseFov + CONSTANTS.CAMERA.FOV_KICK;
        this.currentEyeHeight = this.eyeHeight;

        player.eyeHeight = this.eyeHeight;
        player.root.rotation.y = startYaw;

        const unregister = game.systems.add({
            name: 'first-person-controls',
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

    /** Direction the camera looks along, updated from the current angles. */
    get forward(): THREE.Vector3 {
        return new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(this.look.pitch, this.look.yaw, 0, 'YXZ'));
    }

    /** Stop reading input and release pointer lock, e.g. for a menu. */
    setEnabled(enabled: boolean): void {
        this.look.enabled = enabled;
        this.game.systems.setEnabled('first-person-controls', enabled);
        if (!enabled) this.game.input.exitPointerLock();
    }

    /** Freeze the player but keep the frame running, e.g. during a dialogue. */
    setFrozen(frozen: boolean): void {
        this.player.frozen = frozen;
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
        this.crouchIntent = this.game.input.isDown('crouch');
        // Latched until a physics step consumes it: at high refresh rates most frames run no step.
        if (this.game.input.wasPressed('jump')) this.jumpIntent = true;

        const move = this.game.input.move;
        const forward = this.look.forward();
        const right = this.look.right();
        this.wishDirection.set(0, 0, 0).addScaledVector(forward, move.y).addScaledVector(right, move.x);

        const targetEye = this.crouchIntent ? this.crouchEyeHeight : this.eyeHeight;
        this.currentEyeHeight = damp(this.currentEyeHeight, targetEye, Math.exp(-this.crouchSmoothing), delta);
    }

    private fixedUpdate(step: number): void {
        if (this.player.frozen || this.player.isDead) {
            this.player.body.update(step);
            this.jumpIntent = false;
            return;
        }
        this.movement.move(this.wishDirection, step, {
            sprint: this.sprintIntent && this.crouchIntent === false,
            crouch: this.crouchIntent,
            jump: this.jumpIntent,
        });
        this.jumpIntent = false;
        if (this.player.body.justLanded) this.game.events.emit('player:land', { position: this.player.position });
    }

    private lateUpdate(delta: number): void {
        const camera = this.camera;
        this.look.applyTo(camera, delta);

        const eye = this.player.body.eyePosition(this.currentEyeHeight);
        this.updateHeadBob(delta);
        camera.position.copy(eye);

        if (this.headBob > 0) {
            const lateral = Math.sin(this.bobTime * 0.5) * this.headBob * 0.5;
            camera.position.y += Math.sin(this.bobTime) * this.headBob;
            camera.translateX(lateral);
        }

        if (this.cameraOffset.lengthSq() > 0) camera.position.add(this.cameraOffset.clone().applyQuaternion(camera.quaternion));

        // Sprinting widens the view slightly, which sells the speed more than the
        // speed itself does.
        const sprinting = this.sprintIntent && this.movement.isMoving && this.game.input.move.y > 0.1;
        const targetFov = sprinting ? this.sprintFov : this.baseFov;
        if (Math.abs(camera.fov - targetFov) > 0.01) {
            camera.fov = damp(camera.fov, targetFov, 0.02, delta);
            camera.updateProjectionMatrix();
        }
    }

    private updateHeadBob(delta: number): void {
        const moving = this.movement.isMoving && this.player.body.grounded;
        if (moving) {
            const speedRatio = this.player.body.speed / Math.max(this.movement.walkSpeed, 0.001);
            this.bobTime += delta * this.headBobFrequency * Math.min(speedRatio, 1.6);
        } else {
            this.bobTime = damp(this.bobTime, Math.round(this.bobTime / Math.PI) * Math.PI, 0.001, delta);
        }
    }

    //#endregion Frame work
}
