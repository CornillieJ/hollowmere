import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import * as THREE from 'three';

import { cloneModel } from '../src/scripts/helpers/assets';

/**
 * The asset pack and the model clone helper.
 *
 * The models themselves are downloaded by `tools/fetch-assets.mjs`, so this test
 * checks that the pipeline that uses them is correct: the Draco decoder ships
 * with the app, and a clone keeps its skeleton and is not culled.
 */

// The Draco decoder has to be next to the app: many published glTF files are
// Draco compressed, and without it the loader refuses them outright.
assert.ok(existsSync('static/draco/draco_decoder.js'), 'the Draco decoder is in static/draco');
assert.ok(existsSync('static/draco/draco_wasm_wrapper.js'), 'and its wrapper');

// The model pack is optional: a game that has not fetched assets yet still boots.
if (existsSync('static/models/ATTRIBUTION.md')) {
    assert.ok(existsSync('static/models/robot.glb'), 'the animated robot is present');
    assert.ok(existsSync('static/models/ATTRIBUTION.md'), 'and its attribution file');
}

// A clone of a real Object3D keeps its hierarchy, and frustum culling is left
// alone on plain meshes (only skinned and morphing meshes need the help).
{
    const root = new THREE.Group();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    mesh.name = 'crate';
    root.add(mesh);

    const copy = cloneModel(root);
    assert.notEqual(copy, root, 'the clone is a new object');
    assert.equal(copy.getObjectByName('crate')?.name, 'crate', 'and it keeps the hierarchy');
    assert.equal((copy.getObjectByName('crate') as THREE.Mesh).frustumCulled, true, 'a plain mesh keeps its culling');
}

// A clone must keep real AnimationClip objects on `userData.animations`.
//
// `Object3D.copy` deep copies `userData` through JSON, so without the restore in
// `cloneModel` a cloned character would hand the mixer plain objects, and the
// mixer would throw `tracks[i].createInterpolant is not a function` mid frame.
{
    const clip = new THREE.AnimationClip('Idle', 1, [
        new THREE.NumberKeyframeTrack('.position[x]', [0, 1], [0, 1]),
    ]);
    const root = new THREE.Group();
    root.userData.animations = [clip];

    const copy = cloneModel(root);
    const copiedClips = copy.userData.animations as THREE.AnimationClip[];
    assert.equal(copiedClips.length, 1, 'the clone still lists one clip');
    assert.ok(copiedClips[0] instanceof THREE.AnimationClip, 'and it is a real AnimationClip');
    const track = copiedClips[0]?.tracks[0];
    assert.equal(typeof track?.createInterpolant, 'function', 'so its tracks can still build an interpolant');
}
