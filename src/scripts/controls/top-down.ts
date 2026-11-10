import * as THREE from 'three';

import * as CONSTANTS from '../Constants/Constants';
import { SYSTEM_ORDER } from '../core/systems';
import { clamp, damp } from '../helpers/math';
import type { Player } from '../game/player';
import { CharacterMovement, type CharacterMovementOptions } from './character-movement';
import { PointerLook, type PointerLookOptions } from './pointer-look';

/**
 * Top-down camera with screen relative movement.
 *
 * Good for twin stick shooters, farming games and anything viewed from above.
 * Set `fixedYaw` to lock the rotation for an isometric board game view, or
 * leave `rotateWithMouse` on to spin the world around the player.
 */
export type TopDownOptions = PointerLookOptions &
    CharacterMovementOptions & {
        /** Distance from the camera to the player, in meters. */
        height?: number;
        minHeight?: number;
        maxHeight?: number;
        /** Downward tilt in radians. Sharper than -PI/2 keeps some depth. */
        pitch?: number;
        /** Lock the camera rotation to this yaw, for an isometric view. */
        fixedYaw?: number;
        /** Rotate the camera with the mouse, off by default. */
        rotateWithMouse?: boolean;
        /** How fast the camera follows the player. */
        followDamping?: number;
        /** How far the camera leads in the direction of travel, in meters. */
        lookAhead?: number;
        /** Wheel steps per meter of zoom. */
        zoomSpeed?: number;
        /** Base field of view for this camera. */
        fov?: number;
    };

export class TopDownController {
    readonly camera: THREE.PerspectiveCamera;
    readonly look: PointerLook;
    readonly movement: CharacterMovement;

    /** Distance from the player to the camera. */
    height: number;
    /** Downward tilt in radians. */
    pitch: number;
    /** Camera rotation in radians, ignored while `fixedYaw` is set. */
    yaw: number;
    fixedYaw: number | undefined;
    rotateWithMouse: boolean;
    lookAhead: number;

    private readonly game: Game;
    private readonly player: Player;
    private readonly minHeight: number;
    private readonly maxHeight: number;
    private readonly followDamping: number;
    private readonly zoomSpeed: number;
    private readonly focalPoint = new THREE.Vector3();
    private readonly desired = new THREE.Vector3();
    private readonly scratch = new THREE.Vector3();
    private readonly leadScratch = new THREE.Vector3();
    private readonly forwardVector = new THREE.Vector3();
    private readonly rightVector = new THREE.Vector3();
    private readonly wishDirection = new THREE.Vector3();
    private sprintIntent = false;
    private jumpIntent = false;
    private readonly detach: () => void;

    constructor(game: Game, player: Player, options: TopDownOptions = {}) {
        this.game = game;
        this.player = player;
        this.camera = game.camera;

        this.height = options.height ?? CONSTANTS.CAMERA.TOP_DOWN_HEIGHT;
        this.minHeight = options.minHeight ?? CONSTANTS.CAMERA.TOP_DOWN_MIN_HEIGHT;
        this.maxHeight = options.maxHeight ?? CONSTANTS.CAMERA.TOP_DOWN_MAX_HEIGHT;
        this.pitch = options.pitch ?? CONSTANTS.CAMERA.TOP_DOWN_PITCH;
        this.yaw = options.yaw ?? 0;
        this.fixedYaw = options.fixedYaw;
        this.rotateWithMouse = options.rotateWithMouse ?? false;
        this.lookAhead = options.lookAhead ?? 0;
        this.followDamping = options.followDamping ?? CONSTANTS.CAMERA.FOLLOW_DAMPING;
        this.zoomSpeed = options.zoomSpeed ?? 1.2;

        this.look = new PointerLook(game, { ...options, lockOnClick: false });
        this.look.pitch = this.pitch;
        this.movement = new CharacterMovement(player.body, { faceDirection: true, ...options });

        this.focalPoint.copy(player.position);

        const unregister = game.systems.add({
            name: 'top-down-controls',
            order: SYSTEM_ORDER.CONTROL,
            update: (delta) => this.update(delta),
            fixedUpdate: (step) => this.fixedUpdate(step),
            lateUpdate: () => this.lateUpdate(),
        });
        this.detach = () => {
            unregister();
            this.look.dispose();
        };
    }

    /** Camera rotation used for movement and aiming. */
    get activeYaw(): number {
        return this.fixedYaw ?? this.yaw;
    }

    /** Horizontal camera forward, the direction "up" on screen. */
    get forward(): THREE.Vector3 {
        return new THREE.Vector3().set(-Math.sin(this.activeYaw), 0, -Math.cos(this.activeYaw));
    }

    get position(): THREE.Vector3 {
        return this.player.position;
    }

    set position(value: THREE.Vector3 | Vec3) {
        this.player.body.teleport(value);
    }

    setEnabled(enabled: boolean): void {
        this.look.enabled = enabled;
        this.game.systems.setEnabled('top-down-controls', enabled);
    }

    /**
     * World point on the player's floor plane under a screen position.
     * Twin stick shooters use this to turn the mouse into an aim direction.
     */
    aimAtScreenPoint(ndc: THREE.Vector2, out = new THREE.Vector3()): THREE.Vector3 {
        this.game.raycaster.setFromCamera(ndc, this.camera);
        const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -this.player.position.y);
        this.game.raycaster.ray.intersectPlane(plane, out);
        return out;
    }

    dispose(): void {
        this.detach();
    }

    //#region Frame work

    private update(delta: number): void {
        if (this.rotateWithMouse && this.fixedYaw === undefined) {
            this.look.addLook(this.game.input.look);
            this.yaw = this.look.yaw;
            this.look.pitch = this.pitch;
        }

        this.sprintIntent = this.game.input.isDown('sprint');
        // Latched until a physics step consumes it: at high refresh rates most frames run no step.
        if (this.game.input.wasPressed('jump')) this.jumpIntent = true;

        const move = this.game.input.move;
        const yaw = this.activeYaw;
        this.forwardVector.set(-Math.sin(yaw), 0, -Math.cos(yaw));
        this.rightVector.set(Math.cos(yaw), 0, -Math.sin(yaw));
        this.wishDirection.set(0, 0, 0).addScaledVector(this.forwardVector, move.y).addScaledVector(this.rightVector, move.x);

        const scroll = this.game.input.mouse.scroll.delta;
        if (scroll !== 0 && !this.game.input.mouse.scroll.claimedBy) this.height = clamp(this.height + scroll * this.zoomSpeed, this.minHeight, this.maxHeight);

        this.scratch.copy(this.player.position);
        if (this.lookAhead > 0 && this.wishDirection.lengthSq() > 0.01) {
            this.scratch.addScaledVector(this.leadScratch.copy(this.wishDirection).normalize(), this.lookAhead);
        }
        this.focalPoint.x = damp(this.focalPoint.x, this.scratch.x, Math.exp(-this.followDamping), delta);
        this.focalPoint.y = damp(this.focalPoint.y, this.scratch.y, Math.exp(-this.followDamping * 0.4), delta);
        this.focalPoint.z = damp(this.focalPoint.z, this.scratch.z, Math.exp(-this.followDamping), delta);
    }

    private fixedUpdate(step: number): void {
        if (this.player.frozen || this.player.isDead) {
            this.player.body.update(step);
            this.jumpIntent = false;
            return;
        }
        this.movement.move(this.wishDirection, step, {
            sprint: this.sprintIntent,
            jump: this.jumpIntent,
        });
        this.jumpIntent = false;
    }

    private lateUpdate(): void {
        const yaw = this.activeYaw;
        // Unit vector from the focal point towards the camera.
        const cosPitch = Math.cos(this.pitch);
        const offset = new THREE.Vector3(-Math.sin(yaw) * cosPitch, Math.sin(this.pitch), -Math.cos(yaw) * cosPitch).multiplyScalar(-this.height);
        this.desired.copy(this.focalPoint).add(offset);
        // Never let the camera dip below the floor it is looking at.
        this.desired.y = Math.max(this.desired.y, this.focalPoint.y + 1);

        this.camera.position.copy(this.desired);
        this.camera.lookAt(this.focalPoint);
    }

    //#endregion Frame work
}
