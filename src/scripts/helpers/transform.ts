import * as THREE from 'three';

import { angleDifference, clamp, moveTowardsAngle } from './math';

/**
 * Placing and orienting objects.
 *
 * These cover the small chores that otherwise get copy-pasted into every
 * project: put something on the ground, make it face a target, drop it in a
 * ring, attach it without it jumping.
 */

/** Where an object's feet should sit relative to its origin. */
export type OriginAnchor = 'center' | 'bottom' | 'top';

/** Move an object to a position. Accepts a vector or a plain literal. */
export function place(object: THREE.Object3D, position: THREE.Vector3 | Vec3): THREE.Object3D {
    object.position.set(position.x, position.y, position.z);
    return object;
}

/** Move an object to a position, offset by `distance` along its own forward axis. */
export function placeForward(object: THREE.Object3D, position: THREE.Vector3, distance: number): THREE.Object3D {
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(object.quaternion);
    return place(object, position.clone().addScaledVector(forward, distance));
}

/** Set only the yaw of an object, keeping pitch and roll. */
export function faceAngle(object: THREE.Object3D, yaw: number): THREE.Object3D {
    object.rotation.set(0, yaw, 0);
    return object;
}

/** Turn an object so its forward axis points from `from` towards `to`, flat on the ground. */
export function lookAtXZ(object: THREE.Object3D, target: THREE.Vector3 | Vec3, from = object.position): THREE.Object3D {
    const dx = target.x - from.x;
    const dz = target.z - from.z;
    if (dx === 0 && dz === 0) return object;
    return faceAngle(object, Math.atan2(dx, dz));
}

/** Turn an object so its forward axis points at a target, including pitch. */
export function lookAtPoint(object: THREE.Object3D, target: THREE.Vector3 | Vec3): THREE.Object3D {
    object.lookAt(target.x, target.y, target.z);
    return object;
}

/** Smoothly turn an object towards a yaw angle along the shortest path. */
export function turnTowards(object: THREE.Object3D, yaw: number, speed: number, delta: number): THREE.Object3D {
    object.rotation.y = moveTowardsAngle(object.rotation.y, yaw, speed * delta);
    return object;
}

/** How far `object` still has to turn to reach `yaw`, in radians. */
export function remainingTurn(object: THREE.Object3D, yaw: number): number {
    return angleDifference(object.rotation.y, yaw);
}

/** Drop an object onto a surface, keeping its origin `anchor` at the surface. */
export function snapToGround(object: THREE.Object3D, surfaceY: number, anchor: OriginAnchor = 'bottom'): THREE.Object3D {
    if (anchor === 'bottom') {
        const box = new THREE.Box3().setFromObject(object);
        object.position.y = surfaceY - (box.min.y - object.position.y);
    } else if (anchor === 'top') {
        const box = new THREE.Box3().setFromObject(object);
        object.position.y = surfaceY - (box.max.y - object.position.y);
    } else {
        object.position.y = surfaceY;
    }
    return object;
}

/** Place `count` copies of a factory in a ring of `radius`, facing the centre. */
export function ringLayout(count: number, radius: number, factory: (index: number) => THREE.Object3D, parent?: THREE.Object3D, y = 0): THREE.Object3D[] {
    const created: THREE.Object3D[] = [];
    for (let index = 0; index < count; index += 1) {
        const angle = (index / count) * Math.PI * 2;
        const object = factory(index);
        object.position.set(Math.sin(angle) * radius, y, Math.cos(angle) * radius);
        lookAtXZ(object, new THREE.Vector3(0, y, 0));
        parent?.add(object);
        created.push(object);
    }
    return created;
}

/** Place `count` copies on a `columns x rows` grid with the given spacing. */
export function gridLayout(count: number, columns: number, spacing: number, factory: (index: number) => THREE.Object3D, parent?: THREE.Object3D): THREE.Object3D[] {
    const created: THREE.Object3D[] = [];
    for (let index = 0; index < count; index += 1) {
        const column = index % columns;
        const row = Math.floor(index / columns);
        const object = factory(index);
        object.position.set((column - (columns - 1) / 2) * spacing, 0, row * spacing);
        parent?.add(object);
        created.push(object);
    }
    return created;
}

/**
 * Reparent an object without moving it.
 * three.js `add` keeps local coordinates; this keeps world coordinates.
 */
export function attachKeepingWorld(object: THREE.Object3D, parent: THREE.Object3D): THREE.Object3D {
    object.applyMatrix4(parent.matrixWorld.clone().invert());
    object.updateMatrixWorld();
    const localMatrix = object.matrix.clone();
    parent.add(object);
    object.matrix.copy(localMatrix);
    object.matrix.decompose(object.position, object.quaternion, object.scale);
    object.updateMatrixWorld();
    return object;
}

/** Name a freshly created object in one line, then hand it back for chaining. */
export function named<T extends THREE.Object3D>(object: T, name: string): T {
    object.name = name;
    return object;
}

/** Freeze or unfreeze an object from receiving matrix updates, e.g. static props. */
export function setStatic(object: THREE.Object3D, isStatic: boolean): THREE.Object3D {
    object.matrixAutoUpdate = !isStatic;
    if (isStatic) object.updateMatrix();
    return object;
}

/** Scale an object to a target size on its longest axis, e.g. import a model at 2 meters tall. */
export function scaleToSize(object: THREE.Object3D, targetSize: number): THREE.Object3D {
    const box = new THREE.Box3().setFromObject(object);
    const size = box.getSize(new THREE.Vector3());
    const longest = Math.max(size.x, size.y, size.z);
    if (longest > 0) object.scale.multiplyScalar(targetSize / longest);
    return object;
}

/** Clamp an object's position into an axis aligned box, keeping it inside a level. */
export function clampToBounds(object: THREE.Object3D, min: THREE.Vector3, max: THREE.Vector3): THREE.Object3D {
    object.position.set(clamp(object.position.x, min.x, max.x), clamp(object.position.y, min.y, max.y), clamp(object.position.z, min.z, max.z));
    return object;
}

/** Copy position, rotation and scale from a snapshot taken with `captureTransform`. */
export function restoreTransform(object: THREE.Object3D, snapshot: TransformSnapshot): THREE.Object3D {
    object.position.copy(snapshot.position);
    object.rotation.copy(snapshot.rotation);
    object.scale.copy(snapshot.scale);
    object.updateMatrix();
    return object;
}

/** Snapshot an object's transform so it can be restored later. */
export type TransformSnapshot = { position: THREE.Vector3; rotation: THREE.Euler; scale: THREE.Vector3 };

export function captureTransform(object: THREE.Object3D): TransformSnapshot {
    return { position: object.position.clone(), rotation: object.rotation.clone(), scale: object.scale.clone() };
}
