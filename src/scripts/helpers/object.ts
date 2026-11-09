import * as THREE from 'three';

/**
 * Object3D housekeeping: finding, tagging, cloning, fading and disposal.
 *
 * The disposal helpers exist because three.js never frees GPU memory for you.
 * Dropping a mesh without `dispose` is the most common leak in a three.js game.
 */

/** Read `userData` with full typing. */
export function getUserData<K extends keyof GameUserData>(object: THREE.Object3D, key: K): GameUserData[K] | undefined {
    return object.userData[key];
}

/** Merge a partial `userData` into an object. `undefined` values are skipped, so defaults survive. */
export function setUserData(object: THREE.Object3D, data: GameUserDataInput): THREE.Object3D {
    for (const [key, value] of Object.entries(data)) {
        if (value !== undefined) object.userData[key] = value;
    }
    return object;
}

/** Tag an object so queries and gameplay code can group it, e.g. 'enemy'. */
export function tag(object: THREE.Object3D, value: string): THREE.Object3D {
    return setUserData(object, { tag: value });
}

/** True when the object carries the given tag. */
export function hasTag(object: THREE.Object3D, value: string): boolean {
    return getUserData(object, 'tag') === value;
}

/** Every descendant with the given tag, the root included when it matches. */
export function findByTag(root: THREE.Object3D, value: string): THREE.Object3D[] {
    const found: THREE.Object3D[] = [];
    if (hasTag(root, value)) found.push(root);
    root.traverse((child) => {
        if (child !== root && hasTag(child, value)) found.push(child);
    });
    return found;
}

/** First descendant with the given tag. */
export function findFirstByTag(root: THREE.Object3D, value: string): THREE.Object3D | undefined {
    return findByTag(root, value)[0];
}

/** Every descendant whose name contains `part`, e.g. all bones named 'hand'. */
export function findByName(root: THREE.Object3D, part: string): THREE.Object3D[] {
    const found: THREE.Object3D[] = [];
    root.traverse((child) => {
        if (child.name.toLowerCase().includes(part.toLowerCase())) found.push(child);
    });
    return found;
}

/** First descendant with an exact name match. */
export function findExact(root: THREE.Object3D, name: string): THREE.Object3D | undefined {
    return root.getObjectByName(name);
}

/** True when `object` is `ancestor` itself or nested inside it. */
export function isDescendantOf(object: THREE.Object3D, ancestor: THREE.Object3D): boolean {
    let current: THREE.Object3D | null = object;
    while (current) {
        if (current === ancestor) return true;
        current = current.parent;
    }
    return false;
}

/** Walk every mesh under `root`, skipping groups, lights and cameras. */
export function forEachMesh(root: THREE.Object3D, callback: (mesh: THREE.Mesh) => void): void {
    root.traverse((child) => {
        if (child instanceof THREE.Mesh) callback(child);
    });
}

/** World space bounding box of an object and its children. */
export function getBounds(object: THREE.Object3D, target = new THREE.Box3()): THREE.Box3 {
    return target.setFromObject(object);
}

/** Size of an object's bounding box, in world units. */
export function getSize(object: THREE.Object3D, target = new THREE.Vector3()): THREE.Vector3 {
    return getBounds(object).getSize(target);
}

/** Centre of an object's bounding box, in world space. */
export function getCenter(object: THREE.Object3D, target = new THREE.Vector3()): THREE.Vector3 {
    return getBounds(object).getCenter(target);
}

/** Count every object under a root, including the root itself. */
export function countObjects(root: THREE.Object3D): number {
    let total = 0;
    root.traverse(() => {
        total += 1;
    });
    return total;
}

/** Show or hide an object and everything under it. */
export function setVisibleDeep(object: THREE.Object3D, visible: boolean): THREE.Object3D {
    object.traverse((child) => {
        child.visible = visible;
    });
    return object;
}

/**
 * Give every mesh under `root` its own material instance.
 * Do this before fading one instance, or all instances change together.
 */
export function makeMaterialsUnique(root: THREE.Object3D): THREE.Object3D {
    forEachMesh(root, (mesh) => {
        mesh.material = Array.isArray(mesh.material) ? mesh.material.map((material) => material.clone()) : mesh.material.clone();
    });
    return root;
}

/**
 * Fade every material under `root`.
 * Call `makeMaterialsUnique` first when several objects share a material.
 */
export function setOpacity(root: THREE.Object3D, opacity: number): THREE.Object3D {
    const value = THREE.MathUtils.clamp(opacity, 0, 1);
    forEachMesh(root, (mesh) => {
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const material of materials) {
            material.transparent = value < 1;
            material.opacity = value;
            material.needsUpdate = true;
        }
    });
    return root;
}

/** Replace an object in the scene while keeping its world transform. */
export function replaceWith(previous: THREE.Object3D, next: THREE.Object3D): THREE.Object3D {
    next.position.copy(previous.position);
    next.quaternion.copy(previous.quaternion);
    next.scale.copy(previous.scale);
    next.name = previous.name;
    previous.parent?.add(next);
    previous.removeFromParent();
    return next;
}

/**
 * Remember an object's current transform in `userData`.
 * `resetRemembered` restores it later, which is how you undo an animation or a grab.
 */
export function rememberTransform(object: THREE.Object3D): THREE.Object3D {
    object.userData.initialPosition = object.position.clone();
    object.userData.initialRotation = object.rotation.clone();
    object.userData.initialScale = object.scale.clone();
    return object;
}

/** Restore the transform stored by `rememberTransform`, if there is one. */
export function resetRememberedTransform(object: THREE.Object3D): boolean {
    const position = object.userData.initialPosition as THREE.Vector3 | undefined;
    const rotation = object.userData.initialRotation as THREE.Euler | undefined;
    const scale = object.userData.initialScale as THREE.Vector3 | undefined;
    if (!position && !rotation && !scale) return false;
    if (position) object.position.copy(position);
    if (rotation) object.rotation.copy(rotation);
    if (scale) object.scale.copy(scale);
    return true;
}

/** Restore the remembered transform of every descendant of `root` that has one. */
export function resetRememberedTransforms(root: THREE.Object3D, includeRoot = true): number {
    let restored = 0;
    if (includeRoot && resetRememberedTransform(root)) restored += 1;
    root.traverse((child) => {
        if (child !== root && resetRememberedTransform(child)) restored += 1;
    });
    return restored;
}

/** Release the GPU memory held by a geometry and its attributes. */
export function disposeGeometry(geometry: THREE.BufferGeometry): void {
    geometry.dispose();
}

/** Release a material and every texture hanging off it. */
export function disposeMaterial(material: THREE.Material): void {
    for (const value of Object.values(material)) {
        if (value && typeof value === 'object' && 'isTexture' in value && (value as THREE.Texture).isTexture) {
            (value as THREE.Texture).dispose();
        }
    }
    material.dispose();
}

/** Release the GPU memory of an object and everything under it. */
export function dispose(object: THREE.Object3D): void {
    object.traverse((child) => {
        const mesh = child as Partial<THREE.Mesh>;
        mesh.geometry?.dispose();
        if (Array.isArray(mesh.material)) mesh.material.forEach(disposeMaterial);
        else if (mesh.material) disposeMaterial(mesh.material);
    });
}

/** Remove an object from its parent and free its GPU memory. */
export function destroy(object: THREE.Object3D): void {
    object.removeFromParent();
    dispose(object);
}

/**
 * Empty a group, freeing GPU memory and detaching event objects.
 * This is the correct way to tear down a level or a pooled batch of objects.
 */
export function clearGroup(group: THREE.Object3D, releaseMemory = true): void {
    for (const child of [...group.children]) {
        group.remove(child);
        if (releaseMemory) dispose(child);
    }
}
