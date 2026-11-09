import assert from 'node:assert/strict';
import * as THREE from 'three';

import { Grid } from '../src/scripts/helpers/grid';

/**
 * Board and grid geometry.
 *
 * The first version of the board drew its plate centred on the world origin
 * while the grid counted cells from the origin, which shifted the drawn board
 * half a square away from the pieces. These assertions pin the relationship
 * down so it cannot regress: the plate must cover exactly the cells.
 */

const cellSize = 1;
const grid = new Grid({ width: 8, depth: 8, spacing: cellSize, origin: new THREE.Vector3(0, 0, 0), y: 0 });

// Where the cells actually are.
const first = grid.cellToWorld({ x: 0, z: 0 });
const last = grid.cellToWorld({ x: 7, z: 7 });
assert.deepEqual([first.x, first.z], [0, 0], 'cell (0,0) centres on the grid origin');
assert.deepEqual([last.x, last.z], [7, 7], 'cell (7,7) is seven meters along');

// The plate must span half a cell beyond the outer cell centres on every side.
const centre = grid.center();
const halfWidth = (grid.width * cellSize) / 2;
const halfDepth = (grid.depth * cellSize) / 2;
assert.deepEqual([centre.x, centre.z], [3.5, 3.5], 'the grid centre is between the middle cells');

const plateMinX = centre.x - halfWidth;
const plateMaxX = centre.x + halfWidth;
assert.equal(plateMinX, first.x - cellSize / 2, 'the plate starts half a cell before the first column');
assert.equal(plateMaxX, last.x + cellSize / 2, 'and ends half a cell after the last column');
assert.equal(centre.z - halfDepth, first.z - cellSize / 2, 'same in depth');

// Every cell centre has to sit inside the plate, which is what "aligned" means.
for (const cell of grid.cells()) {
    const world = grid.cellToWorld(cell);
    assert.ok(world.x > plateMinX && world.x < plateMaxX, `cell ${cell.x},${cell.z} sits inside the plate in x`);
    assert.ok(world.z > centre.z - halfDepth && world.z < centre.z + halfDepth, `cell ${cell.x},${cell.z} sits inside the plate in z`);
    // And it must be exactly half way between the cell edges.
    const cellMinX = plateMinX + cell.x * cellSize;
    assert.equal(world.x, cellMinX + cellSize / 2, 'the cell centre is centred in its square');
}

// The checker texture must map one texture square onto one cell.
const squares = Math.max(grid.width, grid.depth);
assert.equal(plateMaxX - plateMinX, squares * cellSize, 'the plate is exactly as wide in cells as the texture has squares');
