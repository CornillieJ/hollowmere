import * as THREE from 'three';

import { SYSTEM_ORDER } from '../core/systems';
import { dampAngle, damp } from '../helpers/math';
import type { ThirdPersonController } from '../controls/third-person';

//#region Mount

/**
 * Something the player climbs on and rides: a bike, a horse, a cart.
 *
 * Arcade handling on top of the player's own character body, so riding keeps
 * every collision, slope and step rule the player already has, and getting off
 * leaves the mount parked where it stopped. W and S throttle and brake, A and D
 * steer, and steering needs speed, the way a bike does.
 */
export type AddMountOptions = {
    /** The mount's visual. Its origin sits on the ground, facing +z. */
    object: THREE.Object3D;
    /** The controller whose walking the ride replaces. */
    controller: ThirdPersonController;
    position?: Vec3;
    /** Heading in radians, 0 faces +z. */
    yaw?: number;
    /** Top speed in meters per second. */
    maxSpeed?: number;
    reverseSpeed?: number;
    /** Meters per second gained per second at full throttle. */
    acceleration?: number;
    /** Meters per second lost per second when braking. */
    brake?: number;
    /** Speed lost per second when coasting, as a fraction. */
    drag?: number;
    /** Radians per second of steering at speed. */
    turnRate?: number;
    /** How far the mount leans into a turn, in radians. */
    lean?: number;
    /** Where the rider's feet sit relative to the mount origin. */
    seat?: Vec3;
    /** Prompt shown when the player can get on. */
    prompt?: string;
    /** Prompt shown while riding. Getting off owns the interact key until then. */
    dismountPrompt?: string;
    /** Turn the camera behind the mount while the mouse is idle. Defaults to true. */
    followCamera?: boolean;
    onMount?: () => void;
    onDismount?: () => void;
};

export type MountHandle = {
    readonly object: THREE.Object3D;
    readonly mounted: boolean;
    /** Signed speed in meters per second. */
    readonly speed: number;
    mount: () => void;
    dismount: () => void;
    dispose: () => void;
};

export function addMount(game: Game, options: AddMountOptions): MountHandle {
    const { object, controller } = options;
    const maxSpeed = options.maxSpeed ?? 11;
    const reverseSpeed = options.reverseSpeed ?? 2.5;
    const acceleration = options.acceleration ?? 7;
    const brake = options.brake ?? 14;
    const drag = options.drag ?? 0.6;
    const turnRate = options.turnRate ?? 2.4;
    const leanAmount = options.lean ?? 0.3;
    const seat = new THREE.Vector3(options.seat?.x ?? 0, options.seat?.y ?? 0.45, options.seat?.z ?? 0);

    const parked = new THREE.Group();
    parked.name = 'mount';
    parked.add(object);
    parked.position.set(options.position?.x ?? 0, options.position?.y ?? 0, options.position?.z ?? 0);
    parked.rotation.y = options.yaw ?? 0;
    game.scene.add(parked);

    let mounted = false;
    let speed = 0;
    let heading = parked.rotation.y;
    let lean = 0;
    let idleLook = 0;
    const direction = new THREE.Vector3();

    // Registered only while parked: a ridden mount sits inside the player and would
    // otherwise hold the focus, and with it the key that gets the player off.
    let removeInteraction = (): void => undefined;
    const offerRide = (): void => {
        removeInteraction = game.interactions.add(parked, { prompt: options.prompt ?? 'Ride', range: 2.2, onInteract: () => mount() });
    };
    offerRide();
    /** The rider's own visuals, raised onto the seat while riding. */
    const riderParts: THREE.Object3D[] = [];

    function mount(): void {
        const player = game.player;
        if (mounted || !player) return;
        mounted = true;
        speed = 0;
        heading = parked.rotation.y;
        removeInteraction();
        player.body.teleport(parked.position);
        // The mount rides inside the player's root, which is what the body moves.
        // The root stays on the ground; the rider is lifted onto the seat.
        riderParts.length = 0;
        riderParts.push(...player.root.children);
        for (const part of riderParts) part.position.add(seat);
        player.root.add(parked);
        parked.position.set(0, 0, 0);
        parked.rotation.set(0, 0, 0);
        player.root.rotation.y = heading;
        controller.movementOverride = ride;
        controller.movement.faceDirection = false;
        // While riding, the interact key means "get off": nothing else may grab it.
        game.interactions.enabled = false;
        options.onMount?.();
    }

    function dismount(): void {
        const player = game.player;
        if (!mounted || !player) return;
        mounted = false;
        for (const part of riderParts) part.position.sub(seat);
        riderParts.length = 0;
        controller.movementOverride = undefined;
        controller.movement.faceDirection = true;
        game.interactions.enabled = true;
        game.prompts.hide();
        player.body.velocity.set(0, 0, 0);
        // Park where the ride stopped, and step off to the side.
        const feet = player.position;
        game.scene.add(parked);
        parked.position.copy(feet);
        parked.rotation.set(0, heading, 0);
        const side = new THREE.Vector3(Math.cos(heading), 0, -Math.sin(heading)).multiplyScalar(1.1);
        player.body.teleport(feet.clone().add(side));
        offerRide();
        options.onDismount?.();
    }

    function ride(step: number): void {
        const player = game.player;
        if (!player) return;
        const throttle = game.input.move.y;
        const steer = game.input.move.x;

        if (throttle > 0) speed = Math.min(maxSpeed, speed + acceleration * throttle * step);
        else if (throttle < 0) speed = speed > 0.2 ? Math.max(0, speed - brake * -throttle * step) : Math.max(-reverseSpeed, speed - acceleration * 0.5 * -throttle * step);
        else speed *= Math.max(0, 1 - drag * step);

        // A standing bike barely turns; a moving one turns at full rate.
        const grip = Math.min(1, Math.abs(speed) / 3);
        heading -= steer * turnRate * grip * step * Math.sign(speed || 1);
        direction.set(Math.sin(heading), 0, Math.cos(heading));
        player.body.setHorizontalVelocity(direction, speed);
        player.body.update(step);
        // Walls stop a bike: read back what the body actually managed.
        const actual = player.body.speed;
        if (actual < Math.abs(speed) - 0.5) speed = Math.sign(speed) * actual;

        player.root.rotation.y = heading;
        lean = damp(lean, -steer * leanAmount * grip, 0.02, step);
        parked.rotation.z = lean;
    }

    const removeSystem = game.systems.add({
        name: 'mount',
        order: SYSTEM_ORDER.CONTROL + 1,
        update: (delta) => {
            if (!mounted) return;
            game.prompts.show(options.dismountPrompt ?? 'Get off', 'E');
            if (game.input.wasPressed('interact')) {
                // Swallow the press, or the parked mount would take it and climb straight back on.
                game.input.consume('interact');
                dismount();
                return;
            }
            if (options.followCamera === false) return;
            // Swing the camera behind the mount, but only once the player stops steering it by hand.
            const looking = Math.abs(game.input.look.x) + Math.abs(game.input.look.y) > 0.5;
            idleLook = looking ? 0 : idleLook + delta;
            if (idleLook > 0.6 && Math.abs(speed) > 1) {
                const behind = Math.atan2(-Math.sin(heading), -Math.cos(heading));
                controller.look.yaw = dampAngle(controller.look.yaw, behind, 0.15, delta);
            }
        },
    });

    return {
        object: parked,
        get mounted() {
            return mounted;
        },
        get speed() {
            return speed;
        },
        mount,
        dismount,
        dispose: () => {
            dismount();
            removeInteraction();
            removeSystem();
            parked.removeFromParent();
        },
    };
}

//#endregion Mount
