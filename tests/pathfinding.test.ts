import assert from 'node:assert/strict';

import * as THREE from 'three';

import { Grid } from '../src/scripts/helpers/grid';
import { buildBlockedSet, findPath, findPathCells, hasLineOfSight, isBlocked, smoothPath, walkableUnlessBlocked, PathFollower } from '../src/scripts/helpers/pathfinding';

/**
 * A\* over the grid helper.
 *
 * Everything here is pure logic, so it runs in Node with no browser: exactly the
 * kind of thing the unit test path exists for.
 */

const grid = new Grid({ width: 8, depth: 8, spacing: 1 });

//#region Straightforward paths

{
    const result = findPath(grid, { x: 0, z: 0 }, { x: 3, z: 0 });
    assert.ok(result.complete, 'a clear path must be found');
    assert.equal(result.path.length, 4, 'three steps means four cells');
    assert.deepEqual(result.path[0], { x: 0, z: 0 });
    assert.deepEqual(result.path[result.path.length - 1], { x: 3, z: 0 });
    // Every step is one cell in one direction.
    for (let index = 1; index < result.path.length; index += 1) {
        const previous = result.path[index - 1];
        const current = result.path[index];
        assert.equal(Math.abs(current!.x - previous!.x) + Math.abs(current!.z - previous!.z), 1, 'orthogonal steps only');
    }
}

//#endregion Straightforward paths

//#region Walls

{
    // A vertical wall with one gap at z = 3.
    const isWalkable = (cell: { x: number; z: number }): boolean => !(cell.x === 2 && cell.z !== 3);
    const result = findPath(grid, { x: 0, z: 0 }, { x: 5, z: 0 }, { isWalkable });
    assert.ok(result.complete, 'the path must go around the wall through the gap');
    assert.ok(result.path.some((cell) => cell.x === 2 && cell.z === 3), 'the path uses the gap');
    assert.ok(result.path.every(isWalkable), 'no cell on the path is blocked');
}

{
    // Fully walled off: the search must give up and say so.
    const isWalkable = (cell: { x: number; z: number }): boolean => cell.x !== 2;
    const result = findPath(grid, { x: 0, z: 0 }, { x: 5, z: 0 }, { isWalkable });
    assert.equal(result.complete, false, 'an unreachable goal is reported, not faked');
    assert.ok(result.path.length > 0, 'the partial path still helps an agent move closer');
    assert.ok(result.path.every(isWalkable), 'the partial path stays on walkable cells');
}

{
    // A blocked start or goal is a hard no.
    assert.equal(findPath(grid, { x: 0, z: 0 }, { x: 9, z: 0 }).path.length, 0, 'off grid goal');
    assert.equal(findPath(grid, { x: 0, z: 0 }, { x: 3, z: 3 }, { isWalkable: (cell) => cell.x !== 3 }).path.length, 0, 'blocked goal');
}

//#endregion Walls

//#region Cost and corner cutting

{
    // A mud cell that costs a lot should be walked around if possible.
    const cost = (cell: { x: number; z: number }): number => (cell.x === 1 && cell.z === 0 ? 20 : 1);
    const result = findPath(grid, { x: 0, z: 0 }, { x: 4, z: 0 }, { cost });
    assert.ok(!result.path.some((cell) => cell.x === 1 && cell.z === 0), 'expensive cells are avoided');
}

{
    // Corner cutting: two diagonal walls with a gap that a diagonal step would
    // squeeze through. With noCornerCutting the step is disallowed.
    const blocked = new Set(['1,0', '0,1']);
    const isWalkable = (cell: { x: number; z: number }): boolean => !blocked.has(`${cell.x},${cell.z}`);
    const strict = findPath(grid, { x: 0, z: 0 }, { x: 1, z: 1 }, { isWalkable, noCornerCutting: true });
    assert.ok(strict.path.every(isWalkable), 'a corner cutting step is never taken');

    const loose = findPath(grid, { x: 0, z: 0 }, { x: 1, z: 1 }, { isWalkable, noCornerCutting: false });
    assert.equal(loose.path.length, 2, 'allowing corner cutting squeezes through in one step');
}

//#endregion Cost and corner cutting

//#region Line of sight and smoothing

{
    const open = (): boolean => true;
    assert.ok(hasLineOfSight(grid, { x: 0, z: 0 }, { x: 5, z: 0 }, open), 'an empty row is clear');
    assert.ok(!hasLineOfSight(grid, { x: 0, z: 0 }, { x: 5, z: 0 }, (cell) => cell.x !== 3), 'a wall blocks the line');

    const path = findPathCells(grid, { x: 0, z: 0 }, { x: 6, z: 6 });
    const smoothed = smoothPath(path, grid);
    assert.ok(smoothed.length <= path.length, 'smoothing never adds waypoints');
    assert.deepEqual(smoothed[0], { x: 0, z: 0 }, 'the start is kept');
    assert.deepEqual(smoothed[smoothed.length - 1], { x: 6, z: 6 }, 'the goal is kept');
    assert.ok(smoothed.length < path.length, 'a diagonal run collapses into fewer waypoints');
}

//#endregion Line of sight and smoothing

//#region Follower

{
    const follower = new PathFollower(grid);
    follower.setPath(findPathCells(grid, { x: 0, z: 0 }, { x: 4, z: 0 }));
    assert.equal(follower.finished, false);

    // Walk towards the waypoint in small steps until the path runs out.
    let position = { x: 0, y: 0, z: 0 };
    let steps = 0;
    while (!follower.finished && steps < 100) {
        const direction = follower.directionFrom(position);
        if (!direction) break;
        position = { x: position.x + direction.x * 0.25, y: 0, z: position.z + direction.z * 0.25 };
        steps += 1;
    }
    assert.equal(follower.finished, true, 'the follower reaches the end of the path');
    assert.ok(Math.abs(position.x - 4) < 0.4, `the follower lands on the goal, got x=${position.x}`);
    // It stops within the tolerance of the last waypoint, so the exact number of
    // steps depends on that tolerance rather than being fixed.
    assert.ok(steps >= 14 && steps <= 17, `about sixteen quarter meter steps, got ${steps}`);

    follower.setPath([]);
    assert.equal(follower.finished, true, 'clearing the path finishes the follower');
    assert.equal(follower.directionFrom({ x: 0, y: 0, z: 0 }), undefined, 'no direction when finished');
}

//#endregion Follower


//#region Blocked set from real scenery

{
    // Two cover boxes at known world positions, on a grid whose origin is centred.
    const arena = new Grid({ width: 10, depth: 10, spacing: 1, origin: { x: -5, y: 0, z: -5 } });
    const box = (x: number, z: number): THREE.Mesh => {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1));
        mesh.position.set(x, 1, z);
        return mesh;
    };

    const blocked = buildBlockedSet([box(0, 0), box(3, -2)], arena);
    assert.ok(blocked.size >= 2, 'both boxes block at least one cell each');
    assert.ok(isBlocked(blocked, arena.worldToCell({ x: 0, y: 0, z: 0 })), 'the first box cell is blocked');
    assert.ok(isBlocked(blocked, arena.worldToCell({ x: 3, y: 0, z: -2 })), 'the second box cell is blocked');

    const walkable = walkableUnlessBlocked(blocked);
    const blockedCell = arena.worldToCell({ x: 0, y: 0, z: 0 });
    assert.equal(walkable(blockedCell), false, 'the walkability test rejects blocked cells');

    // A path across the arena must route around the blockage.
    const start = arena.worldToCell({ x: -4, y: 0, z: 0 });
    const goal = arena.worldToCell({ x: 4, y: 0, z: 0 });
    const result = findPath(arena, start, goal, { isWalkable: walkable });
    assert.ok(result.complete, 'a route exists around two boxes');
    assert.ok(
        result.path.every((cell) => walkable(cell)),
        'no step of the planned route stands on a blocked cell',
    );
    assert.ok(
        !result.path.some((cell) => isBlocked(blocked, cell)),
        'the route avoids the cover entirely',
    );
}

//#endregion Blocked set from real scenery

const mirrored = new Grid({ width: 8, depth: 8, spacing: 1, zDirection: -1 });
assert.deepEqual(mirrored.cellToWorld({ x: 2, z: 3 }).toArray(), [2, 0, -3], 'a mirrored grid runs rows down the negative z axis');
assert.deepEqual(mirrored.worldToCell({ x: 2, y: 0, z: -3 }), { x: 2, z: 3 }, 'and maps back');
assert.equal(mirrored.center().z, -3.5, 'with its centre on the same side');
