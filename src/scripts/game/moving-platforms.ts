import * as THREE from 'three';

import { SYSTEM_ORDER } from '../core/systems';
import type { CharacterBody } from '../physics/character';

/**
 * Platforms that move, and the things standing on them.
 *
 * A kinematic character controller does not get pushed by geometry, so a moving
 * platform has to report its own motion to whatever is riding it. This system
 * moves each platform along its route and writes that movement into the rider's
 * `carry` vector, which the character adds to its step before colliding. The
 * result: you stand still on a platform and travel with it, and you can jump off
 * with your momentum intact.
 *
 * ```ts
 * const platforms = addMovingPlatforms(game, { riders: () => [game.player!.body] });
 * platforms.add({
 *     position: { x: 0, y: 2, z: 0 },
 *     waypoints: [{ x: 0, y: 2, z: 0 }, { x: 8, y: 2, z: 0 }],
 *     size: { x: 3, y: 0.4, z: 3 },
 *     speed: 2,
 *     wait: 0.6,
 * });
 * ```
 */
export type MovingPlatformOptions = {
    /** Starting position; also the first waypoint when `waypoints` is omitted. */
    position: THREE.Vector3 | Vec3;
    /** Route. The platform starts at the first point and moves through the rest. */
    waypoints?: Array<THREE.Vector3 | Vec3>;
    /** Full size of the platform in meters. */
    size?: THREE.Vector3 | Vec3;
    /** Meters per second. */
    speed?: number;
    /** Seconds to wait at each waypoint. */
    wait?: number;
    /** Loop back to the start, or go back and forth. Defaults to ping-pong. */
    mode?: 'loop' | 'ping-pong';
    /** Material colour. */
    color?: THREE.ColorRepresentation;
    /** Build a collider so characters stand on it. Defaults to true. */
    physics?: boolean;
    /** Optional object to move instead of a generated box, e.g. a loaded model. */
    object?: THREE.Object3D;
};

export type MovingPlatform = {
    readonly object: THREE.Object3D;
    readonly body: import('../physics/physics').PhysicsBody | undefined;
    /** Movement applied this step, in meters. */
    readonly delta: THREE.Vector3;
    position: THREE.Vector3;
    /** 0..1 along the current leg. */
    progress: number;
    /** Index of the waypoint being approached. */
    target: number;
};

export type MovingPlatformsOptions = {
    /** Characters that may ride. Read fresh every step. */
    riders?: () => CharacterBody[];
    /** Extra height allowed between feet and platform top, in meters. */
    snapTolerance?: number;
};

export type MovingPlatformsHandle = {
    readonly platforms: MovingPlatform[];
    add: (options: MovingPlatformOptions) => MovingPlatform;
    /** True when the character is standing on a platform this step. */
    riderPlatform: (body: CharacterBody) => MovingPlatform | undefined;
    clear: () => void;
    dispose: () => void;
};

export function addMovingPlatforms(game: Game, options: MovingPlatformsOptions = {}): MovingPlatformsHandle {
    const platforms: MovingPlatform[] = [];
    const snapTolerance = options.snapTolerance ?? 0.35;

    function add(platformOptions: MovingPlatformOptions): MovingPlatform {
        const size = platformOptions.size ?? { x: 3, y: 0.4, z: 3 };
        const start = platformOptions.position;

        let object = platformOptions.object;
        if (!object) {
            const material = new THREE.MeshStandardMaterial({ color: platformOptions.color ?? 0x8a93a6, roughness: 0.7, metalness: 0.15 });
            object = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), material);
            object.castShadow = true;
            object.receiveShadow = true;
            game.scene.add(object);
        }
        object.position.set(start.x, start.y, start.z);
        object.name = object.name || 'moving-platform';
        // The footprint is needed every step to work out who is standing on it.
        object.userData.platformSize = { x: size.x, y: size.y, z: size.z };

        const body =
            platformOptions.physics === false
                ? undefined
                : game.physics.add({
                      kind: 'kinematic',
                      shape: { type: 'box', size },
                      position: object.position.clone(),
                      object,
                      syncObject: false,
                      tag: 'platform',
                  });

        const route = (platformOptions.waypoints ?? [start]).map((point) => new THREE.Vector3(point.x, point.y, point.z));
        const platform: MovingPlatform = {
            object,
            body,
            delta: new THREE.Vector3(),
            position: object.position.clone(),
            progress: 0,
            target: route.length > 1 ? 1 : 0,
        };
        // The route travels with the platform so `add` can stay a pure factory.
        ROUTES.set(platform, {
            route,
            speed: platformOptions.speed ?? 2,
            wait: platformOptions.wait ?? 0,
            mode: platformOptions.mode ?? 'ping-pong',
            forward: true,
            waitTimer: 0,
        });
        platforms.push(platform);
        return platform;
    }

    /** True when `body` stands on `platform` right now. */
    function standingOn(body: CharacterBody, platform: MovingPlatform): boolean {
        const size = platform.object.userData.platformSize as Vec3 | undefined;
        const halfX = (size?.x ?? 3) / 2 + body.radius * 0.6;
        const halfZ = (size?.z ?? 3) / 2 + body.radius * 0.6;
        const top = platform.position.y + (size?.y ?? 0.4) / 2;
        const feet = body.position;

        if (Math.abs(feet.x - platform.position.x) > halfX) return false;
        if (Math.abs(feet.z - platform.position.z) > halfZ) return false;
        // Feet near the top surface, and not far above it.
        return feet.y <= top + snapTolerance && feet.y >= top - snapTolerance - 0.2;
    }

    const riderPlatform = (body: CharacterBody): MovingPlatform | undefined => platforms.find((platform) => standingOn(body, platform));

    game.systems.add({
        name: 'moving-platforms',
        // Platforms move before characters integrate their step.
        order: SYSTEM_ORDER.CONTROL - 1,
        fixedUpdate: (step) => {
            for (const platform of platforms) {
                const route = ROUTES.get(platform);
                if (!route) continue;

                const previous = platform.position.clone();
                if (route.route.length < 2) continue;

                if (route.waitTimer > 0) {
                    route.waitTimer = Math.max(0, route.waitTimer - step);
                } else {
                    const goal = route.route[platform.target] as THREE.Vector3;
                    const toGoal = goal.clone().sub(platform.position);
                    const distance = toGoal.length();
                    const travel = route.speed * step;

                    if (distance <= travel) {
                        platform.position.copy(goal);
                        platform.progress = 0;
                        route.waitTimer = route.wait;
                        platform.target = nextTarget(platform, route);
                    } else {
                        platform.position.addScaledVector(toGoal.normalize(), travel);
                        platform.progress = 1 - (distance - travel) / Math.max(distance, 1e-6);
                    }
                }

                platform.delta.copy(platform.position).sub(previous);
                platform.object.position.copy(platform.position);

                if (platform.body) {
                    // A kinematic body wants the next transform, not a teleport:
                    // that way the physics engine knows it moved and resolves
                    // contacts against the motion instead of snapping through.
                    platform.body.rigidBody.setNextKinematicTranslation({
                        x: platform.position.x,
                        y: platform.position.y,
                        z: platform.position.z,
                    });
                }
            }

            // Carry the riders. This happens after the platforms moved and before
            // the characters integrate, which is the only order that works.
            for (const rider of options.riders?.() ?? []) {
                if (!rider.grounded) continue;
                for (const platform of platforms) {
                    if (platform.delta.lengthSq() === 0) continue;
                    if (!standingOn(rider, platform)) continue;
                    rider.carry.add(platform.delta);
                    break;
                }
            }
        },
        // The object follows the logical position exactly: the fixed step already
        // runs at 60 Hz, and damping here would only add lag.
        lateUpdate: () => {
            for (const platform of platforms) platform.object.position.copy(platform.position);
        },
    });

    return {
        platforms,
        add,
        riderPlatform,
        clear: () => {
            for (const platform of [...platforms]) {
                platform.object.removeFromParent();
                if (platform.body) game.physics.remove(platform.body);
            }
            platforms.length = 0;
        },
        dispose: () => {
            for (const platform of [...platforms]) {
                platform.object.removeFromParent();
                if (platform.body) game.physics.remove(platform.body);
            }
            platforms.length = 0;
        },
    };
}

/** Route state, kept out of the public platform object. */
type Route = {
    route: THREE.Vector3[];
    speed: number;
    wait: number;
    mode: 'loop' | 'ping-pong';
    forward: boolean;
    waitTimer: number;
};

const ROUTES = new WeakMap<MovingPlatform, Route>();

function nextTarget(platform: MovingPlatform, route: Route): number {
    if (route.mode === 'loop') return (platform.target + 1) % route.route.length;
    if (route.forward) {
        if (platform.target >= route.route.length - 1) {
            route.forward = false;
            return platform.target - 1;
        }
        return platform.target + 1;
    }
    if (platform.target <= 0) {
        route.forward = true;
        return platform.target + 1;
    }
    return platform.target - 1;
}
