import * as THREE from 'three';

import { damp } from './math';

/**
 * Vector math on top of three.js. Everything here writes into an optional
 * `out` vector so hot loops do not allocate.
 */

/** A reusable scratch vector. Create one per function, never share across calls. */
export function scratch(): THREE.Vector3 {
    return new THREE.Vector3();
}

/** Copy `value` into `out` when given, otherwise into a new vector. */
export function vector(value: THREE.Vector3 | Vec3, out?: THREE.Vector3): THREE.Vector3 {
    return (out ?? new THREE.Vector3()).set(value.x, value.y, value.z);
}

/** Linear interpolation between two points. `t` is not clamped. */
export function lerpVector(from: THREE.Vector3, to: THREE.Vector3, t: number, out = new THREE.Vector3()): THREE.Vector3 {
    return out.copy(from).lerp(to, t);
}

/** Frame-rate independent move towards a target point. */
export function dampVector(from: THREE.Vector3, to: THREE.Vector3, smoothing: number, delta: number, out = new THREE.Vector3()): THREE.Vector3 {
    return out.set(damp(from.x, to.x, smoothing, delta), damp(from.y, to.y, smoothing, delta), damp(from.z, to.z, smoothing, delta));
}

/** Limit a vector's length, e.g. cap a movement vector to walking speed. */
export function clampLength(value: THREE.Vector3, maxLength: number, out = new THREE.Vector3()): THREE.Vector3 {
    out.copy(value);
    const lengthSq = out.lengthSq();
    if (lengthSq > maxLength * maxLength && lengthSq > 0) out.multiplyScalar(maxLength / Math.sqrt(lengthSq));
    return out;
}

/** Normalise, returning a zero vector when the input has no length. */
export function normalized(value: THREE.Vector3, out = new THREE.Vector3()): THREE.Vector3 {
    out.copy(value);
    return out.lengthSq() > 0 ? out.normalize() : out.set(0, 0, 0);
}

/** The direction from `from` to `to`, normalised. */
export function directionBetween(from: THREE.Vector3, to: THREE.Vector3, out = new THREE.Vector3()): THREE.Vector3 {
    return normalized(out.copy(to).sub(from));
}

/** Signed angle around the Y axis from `from` to `to`, in radians. */
export function angleXZBetween(from: THREE.Vector3, to: THREE.Vector3): number {
    return Math.atan2(to.x - from.x, to.z - from.z);
}

/** Signed angle around the Y axis that a vector points along. */
export function angleXZ(value: THREE.Vector3): number {
    return Math.atan2(value.x, value.z);
}

/** A unit vector pointing along a yaw angle, flat on the ground plane. */
export function fromAngleXZ(yaw: number, out = new THREE.Vector3()): THREE.Vector3 {
    return out.set(Math.sin(yaw), 0, Math.cos(yaw));
}

/** Zero out the Y component, then optionally renormalise. */
export function flatten(value: THREE.Vector3, normalize = true, out = new THREE.Vector3()): THREE.Vector3 {
    out.copy(value).setY(0);
    return normalize && out.lengthSq() > 0 ? out.normalize() : out;
}

/** Rotate a vector around an arbitrary axis by an angle in radians. */
export function rotateAround(value: THREE.Vector3, axis: THREE.Vector3, angle: number, out = new THREE.Vector3()): THREE.Vector3 {
    return out.copy(value).applyAxisAngle(axis, angle);
}

/** Perpendicular to `value` on the XZ plane, e.g. for a strafe direction. */
export function perpendicularXZ(value: THREE.Vector3, out = new THREE.Vector3()): THREE.Vector3 {
    return out.set(value.z, 0, -value.x);
}

/** Reflect a direction off a surface normal. */
export function reflect(direction: THREE.Vector3, normal: THREE.Vector3, out = new THREE.Vector3()): THREE.Vector3 {
    return out.copy(direction).reflect(normal);
}

/** Project `value` onto the plane described by the normal. */
export function projectOnPlane(value: THREE.Vector3, normal: THREE.Vector3, out = new THREE.Vector3()): THREE.Vector3 {
    return out.copy(value).projectOnPlane(normal);
}

/** The component of `value` along `axis`, as a scalar. */
export function componentAlong(value: THREE.Vector3, axis: THREE.Vector3): number {
    return value.dot(axis);
}

/** Interpolate a direction on the unit sphere, useful for smooth aim. */
export function slerpDirection(from: THREE.Vector3, to: THREE.Vector3, t: number, out = new THREE.Vector3()): THREE.Vector3 {
    return out.copy(from).normalize().lerp(to, t).normalize();
}

/** True when every component is finite, i.e. no NaN or Infinity leaked in. */
export function isFinite3(value: THREE.Vector3): boolean {
    return Number.isFinite(value.x) && Number.isFinite(value.y) && Number.isFinite(value.z);
}

/** Fan a direction out into a cone, `spread` in radians. Used for weapon spread. */
export function applySpread(direction: THREE.Vector3, spread: number, out = new THREE.Vector3()): THREE.Vector3 {
    if (spread <= 0) return out.copy(direction);
    const up = Math.abs(direction.y) > 0.99 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const tangent = new THREE.Vector3().crossVectors(direction, up).normalize();
    const bitangent = new THREE.Vector3().crossVectors(direction, tangent).normalize();
    const offset = new THREE.Vector3()
        .addScaledVector(tangent, (Math.random() * 2 - 1) * spread)
        .addScaledVector(bitangent, (Math.random() * 2 - 1) * spread);
    return out.copy(direction).add(offset).normalize();
}
