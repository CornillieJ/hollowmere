import * as THREE from 'three';

import type { Cell, Grid } from './grid';

/**
 * A\* pathfinding over the `Grid` helper.
 *
 * Costs are per cell, so terrain differences (road, mud, water) are just a
 * function. Diagonal movement is allowed by default and costs `sqrt(2)` scaled
 * by `diagonalCost`, and paths are smoothed so an NPC does not walk in stairsteps.
 *
 * The grid is small in every game this template targets, so the search keeps its
 * own open list as a sorted array: simpler than a binary heap and fast enough to
 * replan on demand for dozens of agents.
 */
export type PathCost = (cell: Cell) => number;

export type PathfindingOptions = {
    /** Return false for walls and other impassable cells. Defaults to everything walkable. */
    isWalkable?: (cell: Cell) => boolean;
    /** Extra cost per cell, e.g. water at 4 and road at 0.5. Defaults to 1. */
    cost?: PathCost;
    /** Allow diagonal steps. Defaults to true. */
    diagonals?: boolean;
    /**
     * Diagonals may not cut through two blocked orthogonals. On by default,
     * which is what stops a path squeezing between two walls.
     */
    noCornerCutting?: boolean;
    /** Multiplier applied to a diagonal step. Defaults to `Math.SQRT2`. */
    diagonalCost?: number;
    /** Give up after this many visited cells. Defaults to the whole grid. */
    maxVisited?: number;
};

export type PathResult = {
    /** Cells from start to goal, both included. */
    path: Cell[];
    /** True when the goal was reached. */
    complete: boolean;
    /** Cells examined, useful to spot an expensive map. */
    visited: number;
};

export type PathFollowOptions = {
    /** Distance in meters at which a waypoint counts as reached. */
    tolerance?: number;
    /** Optional grid used to smooth the path with line of sight checks. */
    grid?: Grid;
    /** Allow diagonal shortcuts when smoothing. Defaults to true. */
    diagonals?: boolean;
};

type Node = {
    cell: Cell;
    g: number;
    f: number;
    parent: Node | undefined;
};

const key = (cell: Cell): string => `${cell.x},${cell.z}`;

/** Chebyshev distance, the exact cost of a free diagonal path. */
function heuristic(a: Cell, b: Cell, diagonalCost: number): number {
    const dx = Math.abs(a.x - b.x);
    const dz = Math.abs(a.z - b.z);
    return Math.max(dx, dz) + (diagonalCost - 1) * Math.min(dx, dz);
}

/**
 * Find a path between two cells.
 * Returns an incomplete path (the best it found) when the goal is unreachable.
 */
export function findPath(grid: Grid, start: Cell, goal: Cell, options: PathfindingOptions = {}): PathResult {
    const isWalkable = options.isWalkable ?? (() => true);
    const cost = options.cost ?? (() => 1);
    const diagonals = options.diagonals ?? true;
    const noCornerCutting = options.noCornerCutting ?? true;
    const diagonalCost = options.diagonalCost ?? Math.SQRT2;

    if (!grid.contains(start) || !grid.contains(goal) || !isWalkable(start) || !isWalkable(goal)) {
        return { path: [], complete: false, visited: 0 };
    }

    const open: Node[] = [{ cell: start, g: 0, f: heuristic(start, goal, diagonalCost), parent: undefined }];
    const best = new Map<string, Node>([[key(start), open[0] as Node]]);
    const closed = new Set<string>();
    let visited = 0;
    const limit = options.maxVisited ?? grid.cellCount * 4;

    while (open.length > 0 && visited < limit) {
        // Cheapest by f, then by h so ties favour progress.
        let bestIndex = 0;
        for (let index = 1; index < open.length; index += 1) {
            const candidate = open[index] as Node;
            const current = open[bestIndex] as Node;
            if (candidate.f < current.f || (candidate.f === current.f && candidate.g > current.g)) bestIndex = index;
        }
        const node = open.splice(bestIndex, 1)[0] as Node;
        visited += 1;

        if (node.cell.x === goal.x && node.cell.z === goal.z) {
            return { path: rebuild(node), complete: true, visited };
        }

        closed.add(key(node.cell));
        for (const neighbour of neighboursOf(grid, node.cell, { diagonals, noCornerCutting, isWalkable })) {
            const neighbourKey = key(neighbour);
            if (closed.has(neighbourKey)) continue;

            const step = neighbour.x !== node.cell.x && neighbour.z !== node.cell.z ? diagonalCost : 1;
            const tentative = node.g + step * cost(neighbour);
            const existing = best.get(neighbourKey);
            if (existing && tentative >= existing.g) continue;

            const next: Node = { cell: neighbour, g: tentative, f: tentative + heuristic(neighbour, goal, diagonalCost), parent: node };
            best.set(neighbourKey, next);
            const index = open.findIndex((candidate) => candidate.cell.x === neighbour.x && candidate.cell.z === neighbour.z);
            if (index >= 0) open[index] = next;
            else open.push(next);
        }
    }

    // Unreachable: hand back the closest attempt so an agent still moves.
    let closest: Node | undefined;
    for (const node of best.values()) {
        if (!closest || heuristic(node.cell, goal, diagonalCost) < heuristic(closest.cell, goal, diagonalCost)) closest = node;
    }
    return { path: closest ? rebuild(closest) : [], complete: false, visited };
}

/** Just the cells, for callers that do not care about the details. */
export function findPathCells(grid: Grid, start: Cell, goal: Cell, options: PathfindingOptions = {}): Cell[] {
    return findPath(grid, start, goal, options).path;
}

/** True when a straight line between two cells crosses no blocked cell. */
export function hasLineOfSight(grid: Grid, from: Cell, to: Cell, isWalkable: (cell: Cell) => boolean): boolean {
    // Bresenham over grid cells.
    let x = from.x;
    let z = from.z;
    const dx = Math.abs(to.x - x);
    const dz = Math.abs(to.z - z);
    const stepX = x < to.x ? 1 : -1;
    const stepZ = z < to.z ? 1 : -1;
    let error = dx - dz;

    for (;;) {
        if (x === to.x && z === to.z) return true;
        if (!(x === from.x && z === from.z) && !isWalkable({ x, z })) return false;
        const doubled = error * 2;
        if (doubled > -dz) {
            error -= dz;
            x += stepX;
        }
        if (doubled < dx) {
            error += dx;
            z += stepZ;
        }
    }
}

/** Drop waypoints that can be skipped, so an agent walks in straight lines. */
export function smoothPath(path: Cell[], grid: Grid, isWalkable: (cell: Cell) => boolean = () => true, options: PathFollowOptions = {}): Cell[] {
    if (path.length <= 2) return path;
    const diagonals = options.diagonals ?? true;
    const smoothed: Cell[] = [path[0] as Cell];
    let index = 0;

    while (index < path.length - 1) {
        let furthest = index + 1;
        for (let candidate = path.length - 1; candidate > index + 1; candidate -= 1) {
            const target = path[candidate] as Cell;
            if (!lineAllowed(path[index] as Cell, target, isWalkable, diagonals)) continue;
            furthest = candidate;
            break;
        }
        smoothed.push(path[furthest] as Cell);
        index = furthest;
    }
    void grid;
    return smoothed;
}

/**
 * Cells covered by a set of objects, as a lookup set.
 *
 * This is how a walkability test is built from real scenery: give it the cover
 * boxes a level builder created and the grid they sit on.
 *
 * @param padding Extra cells of clearance around each object, 0 by default.
 */
export function buildBlockedSet(objects: readonly THREE.Object3D[], grid: Grid, options: { padding?: number } = {}): Set<string> {
    const padding = Math.max(0, Math.round(options.padding ?? 0));
    const blocked = new Set<string>();
    const box = new THREE.Box3();

    for (const object of objects) {
        box.setFromObject(object);
        const min = grid.worldToCell({ x: box.min.x, y: 0, z: box.min.z });
        const max = grid.worldToCell({ x: box.max.x, y: 0, z: box.max.z });
        // A grid whose rows run along -z maps the box corners the other way round.
        const [lowZ, highZ] = min.z <= max.z ? [min.z, max.z] : [max.z, min.z];
        const [lowX, highX] = min.x <= max.x ? [min.x, max.x] : [max.x, min.x];
        for (let x = lowX - padding; x <= highX + padding; x += 1) {
            for (let z = lowZ - padding; z <= highZ + padding; z += 1) {
                blocked.add(`${x},${z}`);
            }
        }
    }
    return blocked;
}

/** A walkability test from the set produced by `buildBlockedSet`. */
export function walkableUnlessBlocked(blocked: ReadonlySet<string>): (cell: Cell) => boolean {
    return (cell) => !blocked.has(`${cell.x},${cell.z}`);
}

/** True when the cell is in the set, i.e. blocked. */
export function isBlocked(blocked: ReadonlySet<string>, cell: Cell): boolean {
    return blocked.has(`${cell.x},${cell.z}`);
}

/** A tiny stateful follower: hand it a path and ask it for a direction each frame. */
export class PathFollower {
    /** Waypoints left to walk, in order. */
    path: Cell[] = [];
    /** Index of the waypoint currently being walked to. */
    index = 0;

    constructor(
        private readonly grid: Grid,
        private readonly options: PathFollowOptions = {},
    ) {}

    /** True when there is nothing left to walk. */
    get finished(): boolean {
        return this.index >= this.path.length;
    }

    /** Replace the path. Pass an empty array to stop. */
    setPath(path: Cell[]): void {
        this.path = this.options.grid ? smoothPath(path, this.grid, () => true, this.options) : path;
        this.index = 0;
    }

    /** Centre of the waypoint being walked to, or `undefined` when finished. */
    get target(): { x: number; y: number; z: number } | undefined {
        const cell = this.path[this.index];
        return cell ? this.grid.cellToWorld(cell) : undefined;
    }

    /**
     * Direction from a world position to the current waypoint.
     * @returns A normalised vector, and advances the waypoint when close enough.
     */
    directionFrom(position: { x: number; y: number; z: number }, out = { x: 0, y: 0, z: 0 }): { x: number; y: number; z: number } | undefined {
        const tolerance = this.options.tolerance ?? 0.35;
        while (this.index < this.path.length) {
            const cell = this.path[this.index] as Cell;
            const target = this.grid.cellToWorld(cell);
            const dx = target.x - position.x;
            const dz = target.z - position.z;
            const distance = Math.hypot(dx, dz);
            if (distance > tolerance) {
                return Object.assign(out, { x: dx / distance, y: 0, z: dz / distance });
            }
            this.index += 1;
        }
        return undefined;
    }
}

//#region Internals

function neighboursOf(grid: Grid, cell: Cell, options: Required<Pick<PathfindingOptions, 'diagonals' | 'noCornerCutting'>> & { isWalkable: (cell: Cell) => boolean }): Cell[] {
    const found: Cell[] = [];
    for (let dx = -1; dx <= 1; dx += 1) {
        for (let dz = -1; dz <= 1; dz += 1) {
            if (dx === 0 && dz === 0) continue;
            const diagonal = dx !== 0 && dz !== 0;
            if (diagonal && !options.diagonals) continue;

            const candidate = { x: cell.x + dx, z: cell.z + dz };
            if (!grid.contains(candidate) || !options.isWalkable(candidate)) continue;

            if (diagonal && options.noCornerCutting) {
                const sideA = { x: cell.x + dx, z: cell.z };
                const sideB = { x: cell.x, z: cell.z + dz };
                if (!options.isWalkable(sideA) || !options.isWalkable(sideB)) continue;
            }
            found.push(candidate);
        }
    }
    return found;
}

function rebuild(node: Node): Cell[] {
    const path: Cell[] = [];
    let current: Node | undefined = node;
    while (current) {
        path.push(current.cell);
        current = current.parent;
    }
    return path.reverse();
}

function lineAllowed(from: Cell, to: Cell, isWalkable: (cell: Cell) => boolean, diagonals: boolean): boolean {
    const steps = Math.max(Math.abs(to.x - from.x), Math.abs(to.z - from.z));
    if (steps === 0) return true;
    const dx = (to.x - from.x) / steps;
    const dz = (to.z - from.z) / steps;
    if (!diagonals && dx !== 0 && dz !== 0) return false;

    for (let index = 1; index < steps; index += 1) {
        const cell = { x: Math.round(from.x + dx * index), z: Math.round(from.z + dz * index) };
        if (!isWalkable(cell)) return false;
    }
    return true;
}

//#endregion Internals
