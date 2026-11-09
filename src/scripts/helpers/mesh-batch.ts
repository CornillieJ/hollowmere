import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

import { dispose, forEachMesh } from './object';

/**
 * Draw call batching for static scenery.
 *
 * A forest of a thousand identical trees is a thousand draw calls, which is what
 * actually kills frame time in a three.js scene. This merges meshes that share a
 * material into one, and can also turn many copies of one model into a single
 * `InstancedMesh`.
 *
 * What it costs: a merged mesh cannot be moved or hidden on its own, and it has
 * one bounding box, so it is only right for things that never change. Use it for
 * rocks, trees, fences and rubble, not for gameplay objects.
 */
export type BatchResult = {
    /** Merged or instanced object, already added to the parent. */
    object: THREE.Object3D;
    /** Draw calls collapsed into this one. */
    merged: number;
    /** Triangles in the result. */
    triangles: number;
};

/**
 * Merge every mesh under `sources` that shares a material into one mesh per
 * material, then remove the sources.
 *
 * @param sources Objects to merge. Their world transforms are baked in.
 * @param parent Where the merged meshes go. Defaults to the first source's parent.
 */
export function batchStaticMeshes(sources: THREE.Object3D[], parent?: THREE.Object3D): BatchResult[] {
    /** Geometry copies per material, each tagged with the mesh it came from. */
    const byMaterial = new Map<THREE.Material, Array<{ mesh: THREE.Mesh; geometry: THREE.BufferGeometry }>>();

    for (const source of sources) {
        forEachMesh(source, (mesh) => {
            // Opted out, or a multi material mesh, which cannot share one batch.
            if (mesh.userData.noBatch === true) return;
            if (Array.isArray(mesh.material)) return;
            mesh.updateWorldMatrix(true, false);
            const geometry = mesh.geometry.clone();
            geometry.applyMatrix4(mesh.matrixWorld);
            const list = byMaterial.get(mesh.material) ?? [];
            list.push({ mesh, geometry });
            byMaterial.set(mesh.material, list);
        });
    }

    const results: BatchResult[] = [];
    const target = parent ?? (sources[0]?.parent ?? undefined);

    for (const [material, entries] of byMaterial) {
        // One mesh on its own is already one draw call: leave it where it is.
        if (entries.length < 2) {
            for (const entry of entries) entry.geometry.dispose();
            continue;
        }

        const merged = mergeGeometries(entries.map((entry) => entry.geometry), false);
        for (const entry of entries) entry.geometry.dispose();
        if (!merged) continue;

        const mesh = new THREE.Mesh(merged, material);
        mesh.name = `batch-${material.name || material.type}`;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.userData.tag = 'batched';
        if (target) target.add(mesh);
        results.push({ object: mesh, merged: entries.length, triangles: merged.index ? merged.index.count / 3 : merged.attributes.position!.count / 3 });

        // The originals are redundant now their geometry lives inside the batch.
        for (const entry of entries) {
            dispose(entry.mesh);
            entry.mesh.removeFromParent();
        }
    }

    // Drop any source object left empty, but never a mesh whose geometry was kept.
    for (const source of sources) {
        if (!(source instanceof THREE.Mesh) && source.children.length === 0) source.removeFromParent();
    }

    return results;
}

export type InstanceOptions = {
    /** Where to place the copies. Their rotation (Euler) and scale are used too. */
    transforms: Array<{ position: THREE.Vector3 | Vec3; rotation?: THREE.Euler | Vec3; scale?: number | THREE.Vector3 }>;
    /** Add the instanced mesh to this parent, defaults to the source's parent. */
    parent?: THREE.Object3D;
    /** Keep the original object as a template copy. False removes it. */
    keepSource?: boolean;
    castShadow?: boolean;
    receiveShadow?: boolean;
};

/**
 * Replace many copies of one object with a single `InstancedMesh`.
 *
 * The source is expected to be a mesh, or a group whose meshes share one
 * material. Anything else is left alone and reported as zero instances merged.
 */
export function instanceCopies(source: THREE.Object3D, options: InstanceOptions): BatchResult {
    const meshes: THREE.Mesh[] = [];
    forEachMesh(source, (mesh) => {
        meshes.push(mesh);
    });
    if (meshes.length === 0) return { object: source, merged: 0, triangles: 0 };

    // One geometry: use the first mesh. More than one is out of scope here.
    const template = meshes[0] as THREE.Mesh;
    const count = options.transforms.length;
    const instanced = new THREE.InstancedMesh(template.geometry, Array.isArray(template.material) ? (template.material[0] as THREE.Material) : template.material, count);
    instanced.name = `instanced-${source.name || 'mesh'}`;
    instanced.castShadow = options.castShadow ?? true;
    instanced.receiveShadow = options.receiveShadow ?? false;
    instanced.userData.tag = 'instanced';

    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    source.updateWorldMatrix(true, false);

    options.transforms.forEach((transform, index) => {
        const position = new THREE.Vector3(transform.position.x, transform.position.y, transform.position.z);
        const rotation = transform.rotation ? new THREE.Euler(transform.rotation.x, transform.rotation.y, transform.rotation.z) : new THREE.Euler();
        if (typeof transform.scale === 'number') scale.setScalar(transform.scale);
        else if (transform.scale) scale.set(transform.scale.x, transform.scale.y, transform.scale.z);
        else scale.setScalar(1);

        quaternion.setFromEuler(rotation);
        matrix.compose(position, quaternion, scale);
        // Bake in anything the source itself was carrying (its own offset).
        instanced.setMatrixAt(index, matrix.premultiply(source.matrixWorld));
    });
    instanced.instanceMatrix.needsUpdate = true;
    instanced.computeBoundingSphere();

    const parent = options.parent ?? source.parent;
    if (parent) parent.add(instanced);
    if (options.keepSource !== true) {
        dispose(source);
        source.removeFromParent();
    }

    const geometry = template.geometry;
    return { object: instanced, merged: count, triangles: (geometry.index ? geometry.index.count / 3 : geometry.attributes.position!.count / 3) * count };
}

/**
 * Scatter `count` copies of a template object as one instanced mesh.
 * The template is removed unless `keepSource` is set.
 */
export function scatterInstances(source: THREE.Object3D, count: number, area: { width: number; depth: number; y?: number }, options: { parent?: THREE.Object3D; random?: () => number; keepSource?: boolean; minScale?: number; maxScale?: number } = {}): BatchResult {
    const random = options.random ?? Math.random;
    const minScale = options.minScale ?? 1;
    const maxScale = options.maxScale ?? 1;
    const y = area.y ?? 0;

    const transforms = Array.from({ length: count }, () => ({
        position: { x: (random() - 0.5) * area.width, y, z: (random() - 0.5) * area.depth },
        rotation: { x: 0, y: random() * Math.PI * 2, z: 0 },
        scale: minScale + random() * (maxScale - minScale),
    }));

    return instanceCopies(source, { transforms, ...(options.parent ? { parent: options.parent } : {}), ...(options.keepSource !== undefined ? { keepSource: options.keepSource } : {}) });
}

/** How many draw calls a subtree costs, which is the number this file exists to lower. */
export function countDrawCalls(root: THREE.Object3D): number {
    let meshes = 0;
    forEachMesh(root, () => {
        meshes += 1;
    });
    return meshes;
}
