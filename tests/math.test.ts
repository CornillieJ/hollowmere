import assert from 'node:assert/strict';

import { clamp, damp, moveTowards, moveTowardsAngle, remap } from '../src/scripts/helpers/math';
import { angleXZBetween, applySpread, flatten } from '../src/scripts/helpers/vector';
import * as THREE from 'three';

/**
 * Example unit test.
 *
 * The assertion style is plain `node:assert/strict`: anything that throws fails
 * the run, so there is no framework to learn and no configuration to keep in
 * sync. Add more files as `tests/*.test.ts`.
 */

assert.equal(clamp(5, 0, 3), 3);
assert.equal(clamp(-5, 0, 3), 0);
assert.equal(clamp(2, 0, 3), 2);

assert.equal(remap(0.5, 0, 1, 0, 10), 5);
assert.equal(remap(5, 0, 0, 0, 10), 0, 'a zero width input range must not divide by zero');

assert.equal(moveTowards(0, 10, 3), 3);
assert.equal(moveTowards(0, 2, 3), 2, 'must not overshoot');

assert.ok(Math.abs(moveTowardsAngle(0.1, -0.1, 1) - -0.1) < 1e-9, 'shortest path wins');

// damp approaches the target and never overshoots.
let value = 0;
for (let index = 0; index < 200; index += 1) value = damp(value, 1, 0.001, 1 / 60);
assert.ok(value > 0.99 && value <= 1, `damp should converge, got ${value}`);

// Frame rate independence: a second of small steps lands in the same place as one big step.
let stepped = 0;
for (let index = 0; index < 60; index += 1) stepped = damp(stepped, 1, 0.5, 1 / 60);
const single = damp(0, 1, 0.5, 1);
assert.ok(Math.abs(stepped - single) < 1e-9, `damp must be frame rate independent: ${stepped} vs ${single}`);

const flat = flatten(new THREE.Vector3(3, 9, 4));
assert.equal(flat.y, 0);
assert.ok(Math.abs(flat.length() - 1) < 1e-9);

assert.ok(Math.abs(angleXZBetween(new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 0)) - Math.PI / 2) < 1e-9);

const spread = applySpread(new THREE.Vector3(0, 0, 1), 0.2);
assert.ok(spread.length() > 0.99 && spread.z > 0.9, 'spread should stay inside the cone');

// `out` used to alias the segment vector, so the projection read garbage.
{
    const { closestPointOnSegment, distanceToSegment } = await import('../src/scripts/helpers/distance');
    const start = new THREE.Vector3(0, 0, 0);
    const end = new THREE.Vector3(10, 0, 0);
    assert.deepEqual(closestPointOnSegment(new THREE.Vector3(4, 3, 0), start, end).toArray(), [4, 0, 0], 'projects onto the segment');
    assert.deepEqual(closestPointOnSegment(new THREE.Vector3(-5, 1, 0), start, end).toArray(), [0, 0, 0], 'clamps before the start');
    assert.equal(distanceToSegment(new THREE.Vector3(12, 0, 0), start, end), 2, 'and measures past the end');
}
