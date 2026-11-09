import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

import type { Physics, PhysicsBody, RaycastHit } from './physics';

/**
 * Scene queries that go beyond a single ray.
 *
 * Everything here takes the `Physics` wrapper, so gameplay code never touches
 * Rapier directly.
 */

/** Optional filter shared by every query: return false to skip a body. */
export type QueryFilter = (body: PhysicsBody) => boolean;

/** Options accepted by the shape queries. */
export type ShapeQueryOptions = {
    /** Predicate used to skip bodies, e.g. only hit bodies tagged 'enemy'. */
    filter?: QueryFilter | undefined;
    /** Body to ignore, usually the caster. */
    exclude?: PhysicsBody | undefined;
    /** Ignore sensor colliders, true by default. */
    ignoreSensors?: boolean;
    /** Stop after the first hit instead of collecting them all. */
    firstOnly?: boolean;
};

/**
 * Cast a ray and collect every hit along it, sorted near to far.
 * @param physics World to query.
 * @param origin Ray start in world space.
 * @param direction Ray direction, does not need to be normalised.
 * @param maxDistance Maximum travel in meters.
 */
export function raycastAll(physics: Physics, origin: THREE.Vector3, direction: THREE.Vector3, maxDistance = 100, options: ShapeQueryOptions = {}): RaycastHit[] {
    const length = direction.length();
    if (length === 0) return [];
    const normalized = direction.clone().divideScalar(length);
    const ray = new RAPIER.Ray(origin, normalized);
    const hits: RaycastHit[] = [];

    physics.world.intersectionsWithRay(
        ray,
        maxDistance,
        true,
        (intersection) => {
            const body = physics.bodyFromCollider(intersection.collider.handle);
            if (options.exclude && body === options.exclude) return true;
            if (options.ignoreSensors !== false && intersection.collider.isSensor()) return true;
            if (options.filter && (!body || !options.filter(body))) return true;

            hits.push({
                point: origin.clone().addScaledVector(normalized, intersection.timeOfImpact),
                normal: new THREE.Vector3(intersection.normal.x, intersection.normal.y, intersection.normal.z),
                distance: intersection.timeOfImpact,
                object: body?.object,
                body,
            });
            return !options.firstOnly;
        },
        undefined,
        undefined,
        options.exclude?.collider,
        options.exclude?.rigidBody,
    );

    hits.sort((a, b) => a.distance - b.distance);
    return hits;
}

/**
 * Sweep a sphere along a direction, like a thick raycast.
 * Good for shooting and for "can the camera fit here" checks.
 */
export function sphereCast(physics: Physics, origin: THREE.Vector3, radius: number, direction: THREE.Vector3, maxDistance = 100, options: ShapeQueryOptions = {}): RaycastHit | undefined {
    const length = direction.length();
    if (length === 0) return undefined;
    const normalized = direction.clone().divideScalar(length);
    const shape = new RAPIER.Ball(radius);
    const hit = physics.world.castShape(
        origin,
        { x: 0, y: 0, z: 0, w: 1 },
        normalized,
        shape,
        maxDistance,
        1,
        true,
        undefined,
        undefined,
        options.exclude?.collider,
        options.exclude?.rigidBody,
        options.filter ? (collider) => physics.matches(collider, options.filter as QueryFilter) : undefined,
    );
    if (!hit) return undefined;
    const body = physics.bodyFromCollider(hit.collider.handle);
    if (!body) return undefined;
    return {
        point: origin.clone().addScaledVector(normalized, hit.time_of_impact),
        normal: new THREE.Vector3(hit.normal1.x, hit.normal1.y, hit.normal1.z),
        distance: hit.time_of_impact,
        object: body.object,
        body,
    };
}

/** Every body whose collider overlaps a sphere, e.g. an explosion blast radius. */
export function overlapSphere(physics: Physics, center: THREE.Vector3, radius: number, options: ShapeQueryOptions = {}): PhysicsBody[] {
    const found: PhysicsBody[] = [];
    const seen = new Set<number>();
    physics.world.intersectionsWithShape(
        center,
        { x: 0, y: 0, z: 0, w: 1 },
        new RAPIER.Ball(radius),
        (collider) => {
            const body = physics.bodyFromCollider(collider.handle);
            if (!body || seen.has(body.handle)) return true;
            if (options.exclude && body === options.exclude) return true;
            seen.add(body.handle);
            if (options.filter && !options.filter(body)) return true;
            found.push(body);
            return true;
        },
        undefined,
        undefined,
        options.exclude?.collider,
        options.exclude?.rigidBody,
    );
    return found;
}

/** True when nothing blocks the straight line between two points. */
export function hasLineOfSight(physics: Physics, from: THREE.Vector3, to: THREE.Vector3, options: ShapeQueryOptions = {}): boolean {
    const direction = to.clone().sub(from);
    const distance = direction.length();
    if (distance === 0) return true;
    const hit = physics.raycast(from, direction, distance, options.filter, options.exclude);
    return !hit || hit.distance >= distance - 1e-3;
}

/** Ground check: cast a short ray downwards from `position`. */
export function checkGround(physics: Physics, position: THREE.Vector3, distance = 1.2, options: ShapeQueryOptions = {}): RaycastHit | undefined {
    return physics.raycast(position, new THREE.Vector3(0, -1, 0), distance, options.filter, options.exclude);
}

/** Distance to the first solid surface below a point, `undefined` when there is none. */
export function distanceToGround(physics: Physics, position: THREE.Vector3, maxDistance = 50): number | undefined {
    return physics.raycast(position, new THREE.Vector3(0, -1, 0), maxDistance)?.distance;
}

/** Every body whose tag matches, wrapped into a filter you can pass to any query. */
export function tagFilter(...tags: string[]): QueryFilter {
    return (body) => body.tag !== undefined && tags.includes(body.tag);
}

/** Filter that only keeps bodies whose object is still attached to the given root. */
export function descendantFilter(root: THREE.Object3D): QueryFilter {
    return (body) => {
        if (!body.object) return false;
        let current: THREE.Object3D | null = body.object;
        while (current) {
            if (current === root) return true;
            current = current.parent;
        }
        return false;
    };
}
