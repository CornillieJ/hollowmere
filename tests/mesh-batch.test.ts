import assert from 'node:assert/strict';
import * as THREE from 'three';

import { batchStaticMeshes, countDrawCalls, scatterInstances } from '../src/scripts/helpers/mesh-batch';

/**
 * Batching has to keep the geometry and drop the draw calls, and it must not
 * touch objects that opted out. None of this needs a renderer, so it runs in
 * Node.
 */

const scene = new THREE.Scene();
const material = new THREE.MeshStandardMaterial({ name: 'rock' });

// Sixty four blocks sharing one material.
for (let index = 0; index < 64; index += 1) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
    mesh.position.set(index % 8, 0, Math.floor(index / 8));
    scene.add(mesh);
}
assert.equal(countDrawCalls(scene), 64, 'sixty four meshes to start');

const results = batchStaticMeshes([...scene.children]);
assert.equal(results.length, 1, 'one material means one merged mesh');
assert.equal(results[0]?.merged, 64, 'all sixty four were merged');
assert.equal(countDrawCalls(scene), 1, 'one draw call after batching');
assert.ok((results[0]?.triangles ?? 0) === 64 * 12, 'a box is twelve triangles, times sixty four');

// The merged geometry must still be a box at the right size.
const merged = results[0]?.object as THREE.Mesh;
merged.geometry.computeBoundingBox();
const size = merged.geometry.boundingBox?.getSize(new THREE.Vector3());
assert.ok(size && Math.abs(size.x - 8) < 1e-6, `merged width covers all eight columns, got ${size?.x}`);
assert.ok(size && Math.abs(size.z - 8) < 1e-6, 'merged depth covers all eight rows');

// Objects that opted out are left alone.
const keep = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
keep.userData.noBatch = true;
scene.add(keep);
const second = batchStaticMeshes([...scene.children]);
assert.equal(second.length, 0, 'a single leftover mesh has nothing to merge with');
assert.equal(countDrawCalls(scene), 2, 'the opted out mesh survives, plus the earlier batch');
assert.ok(scene.getObjectByName('batch-rock'), 'a merged mesh is named after its material');

// Instancing: one mesh, many transforms.
const template = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), material);
template.name = 'tree';
scene.add(template);
const instanced = scatterInstances(template, 40, { width: 20, depth: 20, y: 1 }, { random: () => 0.5 });
assert.equal(instanced.merged, 40, 'forty instances');
assert.equal(instanced.object.name, 'instanced-tree');
assert.equal((instanced.object as THREE.InstancedMesh).count, 40);
assert.equal(countDrawCalls(scene), 3, 'the instanced mesh is one of them');
assert.equal(template.parent, null, 'the template is removed once instanced');
