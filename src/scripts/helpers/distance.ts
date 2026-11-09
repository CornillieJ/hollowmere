import * as THREE from 'three';

/**
 * Distance and proximity checks.
 *
 * All of them are cheap and allocation free. Prefer squared distances in hot
 * loops; the `squared` variants exist for exactly that.
 */

/** Straight line distance between two points. */
export function distance(a: THREE.Vector3 | Vec3, b: THREE.Vector3 | Vec3): number {
    return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
}

/** Squared distance, use when only comparing against a radius. */
export function distanceSquared(a: THREE.Vector3 | Vec3, b: THREE.Vector3 | Vec3): number {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dz = b.z - a.z;
    return dx * dx + dy * dy + dz * dz;
}

/** Distance ignoring height, which is what almost every gameplay check wants. */
export function distanceXZ(a: THREE.Vector3 | Vec3, b: THREE.Vector3 | Vec3): number {
    return Math.hypot(b.x - a.x, b.z - a.z);
}

/** Distance along a single axis. */
export function distanceAxis(a: THREE.Vector3 | Vec3, b: THREE.Vector3 | Vec3, axis: 'x' | 'y' | 'z'): number {
    return Math.abs(b[axis] - a[axis]);
}

/** True when the two points are within `radius` of each other. */
export function isWithinRadius(a: THREE.Vector3 | Vec3, b: THREE.Vector3 | Vec3, radius: number): boolean {
    return distanceSquared(a, b) <= radius * radius;
}

/** True when the two points are within `radius` horizontally, and `height` vertically. */
export function isWithinCylinder(a: THREE.Vector3 | Vec3, b: THREE.Vector3 | Vec3, radius: number, height: number): boolean {
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    return dx * dx + dz * dz <= radius * radius && Math.abs(b.y - a.y) <= height;
}

/** Angle in radians between two directions, both are normalised internally. */
export function angleBetween(a: THREE.Vector3, b: THREE.Vector3): number {
    const denominator = a.length() * b.length();
    if (denominator === 0) return 0;
    return Math.acos(THREE.MathUtils.clamp(a.dot(b) / denominator, -1, 1));
}

/** Angle in radians between two directions, ignoring the y component. */
export function angleBetweenXZ(a: THREE.Vector3, b: THREE.Vector3): number {
    const denominator = Math.hypot(a.x, a.z) * Math.hypot(b.x, b.z);
    if (denominator === 0) return 0;
    return Math.acos(THREE.MathUtils.clamp((a.x * b.x + a.z * b.z) / denominator, -1, 1));
}

/**
 * True when `target` sits inside the vision cone of `observer`.
 * @param observerPosition Eye position.
 * @param forward Direction the observer looks along, must be normalised.
 * @param targetPosition Point to test.
 * @param fieldOfView Radians of the full cone angle.
 * @param range Maximum distance.
 */
export function isInViewCone(observerPosition: THREE.Vector3, forward: THREE.Vector3, targetPosition: THREE.Vector3, fieldOfView: number, range: number): boolean {
    const toTarget = new THREE.Vector3().subVectors(targetPosition, observerPosition);
    if (toTarget.lengthSq() > range * range) return false;
    return angleBetween(forward, toTarget) <= fieldOfView / 2;
}

// Scratch vectors: `out` may alias an input, so the maths never writes into it early.
const SEGMENT = new THREE.Vector3();
const TO_POINT = new THREE.Vector3();

/** The closest point on the segment `start`..`end` to `point`. */
export function closestPointOnSegment(point: THREE.Vector3, start: THREE.Vector3, end: THREE.Vector3, out = new THREE.Vector3()): THREE.Vector3 {
    const segment = SEGMENT.subVectors(end, start);
    const lengthSq = segment.lengthSq();
    if (lengthSq === 0) return out.copy(start);
    const t = THREE.MathUtils.clamp(TO_POINT.subVectors(point, start).dot(segment) / lengthSq, 0, 1);
    return out.copy(start).addScaledVector(segment, t);
}

/** Distance from a point to a line segment. */
export function distanceToSegment(point: THREE.Vector3, start: THREE.Vector3, end: THREE.Vector3): number {
    return closestPointOnSegment(point, start, end).distanceTo(point);
}

/** Signed distance from a point to a plane, positive on the side the normal points to. */
export function signedDistanceToPlane(point: THREE.Vector3, planePoint: THREE.Vector3, planeNormal: THREE.Vector3): number {
    return point.clone().sub(planePoint).dot(planeNormal);
}

/** Squared distance from a point to the nearest point of an axis aligned box. */
export function distanceToBoxSquared(point: THREE.Vector3, box: THREE.Box3): number {
    const closest = new THREE.Vector3().set(
        THREE.MathUtils.clamp(point.x, box.min.x, box.max.x),
        THREE.MathUtils.clamp(point.y, box.min.y, box.max.y),
        THREE.MathUtils.clamp(point.z, box.min.z, box.max.z),
    );
    return closest.distanceToSquared(point);
}

/** The `nearest` object to `point`, or `undefined` for an empty list. */
export function closestTo<T extends THREE.Object3D>(point: THREE.Vector3 | Vec3, objects: readonly T[]): T | undefined {
    let best: T | undefined;
    let bestDistance = Infinity;
    for (const object of objects) {
        const candidate = distanceSquared(point, object.position);
        if (candidate < bestDistance) {
            bestDistance = candidate;
            best = object;
        }
    }
    return best;
}

/** Objects within `radius` of a point. Allocates one array, so not for every frame per entity. */
export function withinRadiusOf<T extends THREE.Object3D>(point: THREE.Vector3 | Vec3, objects: readonly T[], radius: number): T[] {
    const radiusSq = radius * radius;
    return objects.filter((object) => distanceSquared(point, object.position) <= radiusSq);
}

/** Manhattan distance, useful on grids where diagonal movement is not allowed. */
export function manhattanDistance(a: { x: number; z: number }, b: { x: number; z: number }): number {
    return Math.abs(b.x - a.x) + Math.abs(b.z - a.z);
}

/** Chebyshev distance, the number of king moves between two grid cells. */
export function chebyshevDistance(a: { x: number; z: number }, b: { x: number; z: number }): number {
    return Math.max(Math.abs(b.x - a.x), Math.abs(b.z - a.z));
}
