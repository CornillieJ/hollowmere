import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

import * as CONSTANTS from '../Constants/Constants';
import type { EventBus } from '../core/events';
import { groupForTag } from './layers';

/**
 * Collider shapes accepted by the body helpers. Sizes are full extents in
 * meters, matching how you think about a box in three.js, not half-extents.
 */
export type ColliderShape =
    | { type: 'box'; size: Vec3 }
    | { type: 'sphere'; radius: number }
    | { type: 'capsule'; radius: number; height: number }
    | { type: 'cylinder'; radius: number; height: number };

export type PhysicsBodyKind = 'dynamic' | 'fixed' | 'kinematic';

export type PhysicsBodyOptions = {
    shape: ColliderShape;
    /** Defaults to 'dynamic'. */
    kind?: PhysicsBodyKind;
    position?: THREE.Vector3 | Vec3;
    /** Quaternion or Euler rotation, Euler order XYZ. */
    rotation?: THREE.Quaternion | THREE.Euler;
    /** Object the body drives. Omit for invisible physics volumes. */
    object?: THREE.Object3D | undefined;
    /** Set false to keep the object as the visual instead of the physics shape. */
    syncObject?: boolean;
    /**
     * Where the object sits relative to the body centre. A character model has its
     * origin at the feet while its capsule is centred, so it passes `y: -height / 2`.
     */
    syncOffset?: Vec3;
    /** Copy the body rotation onto the object. Characters turn their model themselves, so they pass false. */
    syncRotation?: boolean;
    mass?: number;
    friction?: number;
    restitution?: number;
    /** Sensors report overlaps but never block movement. */
    sensor?: boolean;
    /** Continuous collision detection, needed for fast small projectiles. */
    ccd?: boolean;
    gravityScale?: number;
    linearDamping?: number;
    angularDamping?: number;
    /** Prevent the body from rotating, make it upright like a crate. */
    fixedRotation?: boolean;
    /** Emit collision and trigger events for this body. */
    events?: boolean;
    /** Extra tag stored on the wrapper for your own filtering. */
    tag?: string;
    /**
     * Collision layers from `physics/layers.ts`. Defaults to the group for the
     * body's tag, or the default group. Set it to make bodies ignore each other.
     */
    groups?: number;
};

/** What a raycast or shape query found. */
export type RaycastHit = {
    /** Point of impact in world space. */
    point: THREE.Vector3;
    /** Surface normal at the impact. */
    normal: THREE.Vector3;
    /** Distance from the ray origin. */
    distance: number;
    /** The scene object the collider belongs to, when the body has one. */
    object: THREE.Object3D | undefined;
    /** The physics wrapper owning the collider. */
    body: PhysicsBody | undefined;
};

/**
 * One rigid body plus its main collider, kept in sync with an `Object3D`.
 * Created through `Physics.add`, never constructed directly.
 */
export class PhysicsBody {
    readonly rigidBody: RAPIER.RigidBody;
    readonly collider: RAPIER.Collider;
    readonly shape: ColliderShape;
    readonly kind: PhysicsBodyKind;
    /** `undefined` for invisible volumes. */
    object: THREE.Object3D | undefined;
    tag: string | undefined;
    /** Set by `Physics.step` for dynamic bodies; skipped again on demand. */
    syncObject: boolean;
    readonly syncOffset: Vec3;
    readonly syncRotation: boolean;

    constructor(init: {
        rigidBody: RAPIER.RigidBody;
        collider: RAPIER.Collider;
        shape: ColliderShape;
        kind: PhysicsBodyKind;
        object?: THREE.Object3D | undefined;
        syncObject: boolean;
        syncOffset?: Vec3 | undefined;
        syncRotation?: boolean | undefined;
        tag?: string | undefined;
    }) {
        this.rigidBody = init.rigidBody;
        this.collider = init.collider;
        this.shape = init.shape;
        this.kind = init.kind;
        this.object = init.object;
        this.syncObject = init.syncObject;
        this.syncOffset = init.syncOffset ?? { x: 0, y: 0, z: 0 };
        this.syncRotation = init.syncRotation ?? true;
        this.tag = init.tag;
    }

    get handle(): number {
        return this.rigidBody.handle;
    }

    get position(): THREE.Vector3 {
        const translation = this.rigidBody.translation();
        return new THREE.Vector3(translation.x, translation.y, translation.z);
    }

    get quaternion(): THREE.Quaternion {
        const rotation = this.rigidBody.rotation();
        return new THREE.Quaternion(rotation.x, rotation.y, rotation.z, rotation.w);
    }

    /** Linear velocity in meters per second. */
    get velocity(): THREE.Vector3 {
        const linvel = this.rigidBody.linvel();
        return new THREE.Vector3(linvel.x, linvel.y, linvel.z);
    }

    set velocity(value: THREE.Vector3) {
        this.setVelocity(value);
    }

    /** Copy the object's current transform into the physics body. */
    pushFromObject(): void {
        if (!this.object) return;
        this.setPosition(this.object.position);
        this.setQuaternion(this.object.quaternion);
    }

    /** Move the body instantly. Use for teleports and respawns. */
    setPosition(position: THREE.Vector3 | Vec3): void {
        this.rigidBody.setTranslation(position, true);
    }

    setQuaternion(quaternion: THREE.Quaternion): void {
        this.rigidBody.setRotation(quaternion, true);
    }

    setVelocity(velocity: THREE.Vector3): void {
        this.rigidBody.setLinvel(velocity, true);
    }

    applyImpulse(impulse: THREE.Vector3, wake = true): void {
        this.rigidBody.applyImpulse(impulse, wake);
    }

    applyImpulseAt(impulse: THREE.Vector3, point: THREE.Vector3, wake = true): void {
        this.rigidBody.applyImpulseAtPoint(impulse, point, wake);
    }

    /** Turn the collider on or off without destroying the body. */
    setEnabled(enabled: boolean): void {
        this.collider.setEnabled(enabled);
    }

    /** Does the collider contain the given world point? */
    containsPoint(point: THREE.Vector3): boolean {
        return this.collider.containsPoint(point);
    }
}

/**
 * Thin wrapper around a Rapier world.
 *
 * Owns body creation, transform sync, collision events and debug rendering.
 * Queries that need more than a single ray live in `queries.ts`.
 */
export class Physics {
    readonly world: RAPIER.World;
    readonly gravity: THREE.Vector3;
    /** Bodies currently in the world, keyed by rigid body handle. */
    readonly bodies = new Map<number, PhysicsBody>();
    /** Fast lookup from collider handle to body, used by queries and events. */
    private readonly byCollider = new Map<number, PhysicsBody>();

    private readonly eventQueue: RAPIER.EventQueue;
    private readonly events: EventBus | undefined;
    private readonly onBodyRemoved: Array<(body: PhysicsBody) => void> = [];

    constructor(gravity: Vec3, events?: EventBus, step = CONSTANTS.PHYSICS_DEFAULTS.STEP) {
        this.world = new RAPIER.World(gravity);
        this.world.timestep = step;
        this.gravity = new THREE.Vector3(gravity.x, gravity.y, gravity.z);
        this.eventQueue = new RAPIER.EventQueue(true);
        this.events = events;
    }

    /** Create a rigid body with one collider, optionally attached to an object. */
    add(options: PhysicsBodyOptions): PhysicsBody {
        const kind = options.kind ?? 'dynamic';
        const descriptor = this.describeBody(kind, options);
        const rigidBody = this.world.createRigidBody(descriptor);

        const colliderDescriptor = this.describeCollider(options);
        const collider = this.world.createCollider(colliderDescriptor, rigidBody);
        if (options.events) collider.setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);

        const body = new PhysicsBody({
            rigidBody,
            collider,
            shape: options.shape,
            kind,
            object: options.object,
            syncObject: options.syncObject ?? true,
            syncOffset: options.syncOffset,
            syncRotation: options.syncRotation,
            tag: options.tag,
        });

        this.bodies.set(rigidBody.handle, body);
        this.byCollider.set(collider.handle, body);
        if (options.object) options.object.userData.physicsBody = body;
        return body;
    }

    /** Fill in every default the caller left out. */
    private describeBody(kind: PhysicsBodyKind, options: PhysicsBodyOptions): RAPIER.RigidBodyDesc {
        const descriptor = kind === 'dynamic' ? RAPIER.RigidBodyDesc.dynamic() : kind === 'kinematic' ? RAPIER.RigidBodyDesc.kinematicPositionBased() : RAPIER.RigidBodyDesc.fixed();

        const position = toVec3(options.position ?? { x: 0, y: 0, z: 0 });
        descriptor.setTranslation(position.x, position.y, position.z);

        const rotation = toQuaternion(options.rotation);
        if (rotation) descriptor.setRotation({ x: rotation.x, y: rotation.y, z: rotation.z, w: rotation.w });

        descriptor.setLinearDamping(options.linearDamping ?? 0.05);
        descriptor.setAngularDamping(options.angularDamping ?? 0.1);
        // Mass goes on the collider, not `setAdditionalMass`: doing both would
        // count it twice, once as body mass and once as collider mass.

        if (options.ccd) descriptor.setCcdEnabled(true);
        if (options.fixedRotation) descriptor.lockRotations();
        if (options.gravityScale !== undefined) descriptor.setGravityScale(options.gravityScale);
        return descriptor;
    }

    private describeCollider(options: PhysicsBodyOptions): RAPIER.ColliderDesc {
        const shape = options.shape;
        let descriptor: RAPIER.ColliderDesc;
        switch (shape.type) {
            case 'sphere':
                descriptor = RAPIER.ColliderDesc.ball(shape.radius);
                break;
            case 'capsule':
                descriptor = RAPIER.ColliderDesc.capsule(Math.max(shape.height / 2 - shape.radius, 0.01), shape.radius);
                break;
            case 'cylinder':
                descriptor = RAPIER.ColliderDesc.cylinder(shape.height / 2, shape.radius);
                break;
            default:
                descriptor = RAPIER.ColliderDesc.cuboid(shape.size.x / 2, shape.size.y / 2, shape.size.z / 2);
                break;
        }

        descriptor.setFriction(options.friction ?? CONSTANTS.PHYSICS_DEFAULTS.FRICTION);
        descriptor.setRestitution(options.restitution ?? CONSTANTS.PHYSICS_DEFAULTS.RESTITUTION);
        descriptor.setCollisionGroups(groupForTag(options.tag, options.groups));
        if (options.sensor) descriptor.setSensor(true);
        if (options.mass !== undefined) descriptor.setMass(options.mass);
        return descriptor;
    }

    /**
     * Add a static box for the given object, sized from its bounding box.
     * Handy for turning an imported glTF scene into level geometry.
     */
    addStaticFromObject(object: THREE.Object3D, options: Partial<PhysicsBodyOptions> = {}): PhysicsBody {
        const box = new THREE.Box3().setFromObject(object);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        return this.add({
            kind: 'fixed',
            shape: { type: 'box', size: { x: size.x, y: size.y, z: size.z } },
            position: center,
            object,
            syncObject: false,
            ...options,
        });
    }

    /** Replace the object of an existing body, e.g. after a mesh swap. */
    attach(colliderHandle: number, object: THREE.Object3D): void {
        const body = this.byCollider.get(colliderHandle);
        if (!body) return;
        body.object = object;
    }

    /** Body owning a collider handle, or `undefined` when it is not tracked. */
    bodyFromCollider(colliderHandle: number): PhysicsBody | undefined {
        return this.byCollider.get(colliderHandle);
    }

    /** Body owning a rigid body handle. */
    bodyFromRigidBody(rigidBodyHandle: number): PhysicsBody | undefined {
        return this.bodies.get(rigidBodyHandle);
    }

    /** Remove a body and its collider. Call it, or you leak physics memory. */
    remove(body: PhysicsBody): void {
        if (!this.bodies.has(body.handle)) return;
        this.byCollider.delete(body.collider.handle);
        this.bodies.delete(body.handle);
        if (body.object?.userData.physicsBody === body) body.object.userData.physicsBody = undefined;
        this.world.removeRigidBody(body.rigidBody);
        for (const listener of this.onBodyRemoved) listener(body);
    }

    /** Called whenever a body is removed, so systems can drop their references. */
    onRemoved(listener: (body: PhysicsBody) => void): () => void {
        this.onBodyRemoved.push(listener);
        return () => {
            const index = this.onBodyRemoved.indexOf(listener);
            if (index >= 0) this.onBodyRemoved.splice(index, 1);
        };
    }

    /** Step the simulation and copy results back into the scene objects. */
    step(): void {
        this.world.step(this.eventQueue);
        this.syncObjects();
        this.drainEvents();
    }

    /** Push every dynamic body's transform into its object. */
    syncObjects(): void {
        for (const body of this.bodies.values()) {
            if (!body.syncObject || body.kind === 'fixed') continue;
            if (!body.object) continue;
            const translation = body.rigidBody.translation();
            const offset = body.syncOffset;
            body.object.position.set(translation.x + offset.x, translation.y + offset.y, translation.z + offset.z);
            if (!body.syncRotation) continue;
            const rotation = body.rigidBody.rotation();
            body.object.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);
        }
    }

    private drainEvents(): void {
        if (!this.events) return;
        this.eventQueue.drainCollisionEvents((first, second, started) => {
            const a = this.byCollider.get(first);
            const b = this.byCollider.get(second);
            const objectA = a?.object;
            const objectB = b?.object;
            if (!objectA || !objectB) return;
            const aIsSensor = a?.collider.isSensor();
            const bIsSensor = b?.collider.isSensor();

            if (aIsSensor) {
                this.events?.emit(started ? 'trigger:entered' : 'trigger:exited', { trigger: objectA, other: objectB });
            }
            if (bIsSensor) {
                this.events?.emit(started ? 'trigger:entered' : 'trigger:exited', { trigger: objectB, other: objectA });
            }
        });
    }

    /**
     * Cast one ray and return the first hit.
     * @param origin Ray start in world space.
     * @param direction Ray direction, does not need to be normalised.
     * @param maxDistance Maximum travel distance in meters.
     * @param filter Optional predicate, return false to skip a collider.
     * @param exclude Body to ignore, usually the shooter itself.
     */
    raycast(origin: THREE.Vector3, direction: THREE.Vector3, maxDistance = 100, filter?: (body: PhysicsBody) => boolean, exclude?: PhysicsBody): RaycastHit | undefined {
        const length = direction.length();
        if (length === 0) return undefined;
        const normalized = direction.clone().divideScalar(length);
        const ray = new RAPIER.Ray(origin, normalized);
        const hit = this.world.castRayAndGetNormal(ray, maxDistance, true, undefined, undefined, exclude?.collider, exclude?.rigidBody, filter ? (collider) => this.matches(collider, filter) : undefined);
        if (!hit) return undefined;
        return this.toHit(origin, normalized, hit.collider, hit.timeOfImpact, hit.normal);
    }

    /** Collider for a Rapier collider object, resolved through the registry. */
    matches(collider: RAPIER.Collider, filter: (body: PhysicsBody) => boolean): boolean {
        const body = this.byCollider.get(collider.handle);
        return body ? filter(body) : false;
    }

    /** Build a `RaycastHit` from a Rapier hit. */
    toHit(origin: THREE.Vector3, direction: THREE.Vector3, collider: RAPIER.Collider, distance: number, normal?: RAPIER.Vector): RaycastHit {
        const body = this.byCollider.get(collider.handle);
        const point = origin.clone().addScaledVector(direction, distance);
        return {
            point,
            normal: normal ? new THREE.Vector3(normal.x, normal.y, normal.z) : direction.clone().negate(),
            distance,
            object: body?.object,
            body,
        };
    }

    /** Convenience: a ground plane at `y` with the given half extents. */
    addGround(size = 100, y = 0): PhysicsBody {
        return this.add({
            kind: 'fixed',
            shape: { type: 'box', size: { x: size, y: 0.5, z: size } },
            position: { x: 0, y: y - 0.25, z: 0 },
            friction: 0.9,
            tag: 'ground',
        });
    }

    /** Bodies tagged with the given tag. */
    withTag(tag: string): PhysicsBody[] {
        return [...this.bodies.values()].filter((body) => body.tag === tag);
    }

    /** Release the world and every Rapier allocation it owns. */
    dispose(): void {
        this.eventQueue.free();
        this.world.free();
        this.bodies.clear();
        this.byCollider.clear();
    }
}

/** Normalise a `Vector3 | Vec3` into a plain vector literal. */
export function toVec3(value: THREE.Vector3 | Vec3): { x: number; y: number; z: number } {
    return { x: value.x, y: value.y, z: value.z };
}

/** Normalise a quaternion or Euler into a quaternion literal, `undefined` when nothing was given. */
export function toQuaternion(value: THREE.Quaternion | THREE.Euler | undefined): THREE.Quaternion | undefined {
    if (!value) return undefined;
    return value instanceof THREE.Quaternion ? value.clone() : new THREE.Quaternion().setFromEuler(value);
}

/** Load the Rapier wasm module. Must resolve before `new Physics(...)`. */
export async function initPhysics(): Promise<void> {
    await RAPIER.init();
}
