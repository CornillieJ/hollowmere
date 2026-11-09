import * as THREE from 'three';

/**
 * Grid maths for board games, tile maps and farm plots.
 *
 * Cells are addressed by integer `x` and `z`. World positions are the centre of
 * a cell, so a cell is `spacing` meters wide and `(0, 0)` sits at the world
 * origin unless you pass an offset.
 */
export type Cell = { x: number; z: number };

export type GridOptions = {
    /** Number of cells along x. */
    width: number;
    /** Number of cells along z. */
    depth: number;
    /** Distance between cell centres in meters. */
    spacing?: number;
    /** World position of cell `(0, 0)`. */
    origin?: THREE.Vector3 | Vec3;
    /** Cell height, only used by `cellToWorld` when `y` is not given. */
    y?: number;
    /**
     * Which way increasing `z` runs in the world. `-1` puts row 0 nearest a camera
     * that looks down the negative z axis, so row numbers climb up the screen.
     * A chess board needs it: with `1`, the board appears mirrored.
     */
    zDirection?: 1 | -1;
};

export class Grid {
    readonly width: number;
    readonly depth: number;
    readonly spacing: number;
    readonly origin: THREE.Vector3;
    readonly y: number;
    readonly zDirection: 1 | -1;

    constructor(options: GridOptions) {
        this.width = options.width;
        this.depth = options.depth;
        this.spacing = options.spacing ?? 1;
        const origin = options.origin ?? { x: 0, y: 0, z: 0 };
        this.origin = new THREE.Vector3(origin.x, origin.y, origin.z);
        this.y = options.y ?? this.origin.y;
        this.zDirection = options.zDirection ?? 1;
    }

    /** Number of cells in the grid. */
    get cellCount(): number {
        return this.width * this.depth;
    }

    /** True when the cell is inside the grid. */
    contains(cell: Cell): boolean {
        return cell.x >= 0 && cell.z >= 0 && cell.x < this.width && cell.z < this.depth;
    }

    /** Centre of a cell in world space. */
    cellToWorld(cell: Cell, y = this.y, out = new THREE.Vector3()): THREE.Vector3 {
        return out.set(this.origin.x + cell.x * this.spacing, y, this.origin.z + cell.z * this.spacing * this.zDirection);
    }

    /** Nearest cell to a world position. Always returns a valid cell, clamped to the grid. */
    worldToCell(position: THREE.Vector3 | Vec3): Cell {
        return {
            x: Math.round((position.x - this.origin.x) / this.spacing),
            z: Math.round(((position.z - this.origin.z) / this.spacing) * this.zDirection),
        };
    }

    /** Nearest cell to a world position, or `undefined` when it falls outside the grid. */
    worldToCellStrict(position: THREE.Vector3 | Vec3): Cell | undefined {
        const cell = this.worldToCell(position);
        return this.contains(cell) ? cell : undefined;
    }

    /** Cell to the north, east, south or west. `undefined` when it leaves the grid. */
    neighbour(cell: Cell, direction: 'north' | 'south' | 'east' | 'west'): Cell | undefined {
        const next: Cell =
            direction === 'north' ? { x: cell.x, z: cell.z - 1 } : direction === 'south' ? { x: cell.x, z: cell.z + 1 } : direction === 'east' ? { x: cell.x + 1, z: cell.z } : { x: cell.x - 1, z: cell.z };
        return this.contains(next) ? next : undefined;
    }

    /** All orthogonal neighbours that are inside the grid. */
    neighbours(cell: Cell): Cell[] {
        return (['north', 'south', 'east', 'west'] as const).map((direction) => this.neighbour(cell, direction)).filter((value): value is Cell => value !== undefined);
    }

    /** The eight cells around a cell, or the four orthogonal ones when `diagonals` is false. */
    surrounding(cell: Cell, diagonals = true): Cell[] {
        const found: Cell[] = [];
        const offsets = diagonals ? [-1, 0, 1] : [0, 1];
        for (const dx of offsets) {
            for (const dz of offsets) {
                if (dx === 0 && dz === 0) continue;
                if (!diagonals && dx !== 0 && dz !== 0) continue;
                const candidate = { x: cell.x + dx, z: cell.z + dz };
                if (this.contains(candidate)) found.push(candidate);
            }
        }
        return found;
    }

    /** Every cell in the grid, in row-major order. */
    cells(): Cell[] {
        const all: Cell[] = [];
        for (let z = 0; z < this.depth; z += 1) {
            for (let x = 0; x < this.width; x += 1) all.push({ x, z });
        }
        return all;
    }

    /** Index of a cell in a flat array, `-1` when outside the grid. */
    indexOf(cell: Cell): number {
        return this.contains(cell) ? cell.z * this.width + cell.x : -1;
    }

    /** Cell for a flat array index. */
    cellAt(index: number): Cell | undefined {
        if (index < 0 || index >= this.cellCount) return undefined;
        return { x: index % this.width, z: Math.floor(index / this.width) };
    }

    /** Centre of the whole grid in world space. */
    center(out = new THREE.Vector3()): THREE.Vector3 {
        return out.set(this.origin.x + ((this.width - 1) * this.spacing) / 2, this.y, this.origin.z + (((this.depth - 1) * this.spacing) / 2) * this.zDirection);
    }

    /** Manhatten distance between two cells. */
    static distance(a: Cell, b: Cell): number {
        return Math.abs(a.x - b.x) + Math.abs(a.z - b.z);
    }

    /** Chebyshev distance between two cells, the number of king moves. */
    static chebyshev(a: Cell, b: Cell): number {
        return Math.max(Math.abs(a.x - b.x), Math.abs(a.z - b.z));
    }
}

/** Parse 'e4' style chess notation into a cell, `undefined` when malformed. */
export function parseChessCell(notation: string): Cell | undefined {
    const match = /^([a-z])([1-9][0-9]*)$/i.exec(notation.trim());
    const letter = match?.[1]?.toLowerCase();
    const rankText = match?.[2];
    if (!letter || !rankText) return undefined;
    const rank = Number(rankText);
    if (Number.isNaN(rank)) return undefined;
    return { x: letter.charCodeAt(0) - 'a'.charCodeAt(0), z: rank - 1 };
}

/** Format a cell as chess notation, e.g. `{ x: 4, z: 3 }` becomes 'e4'. */
export function formatChessCell(cell: Cell): string {
    return `${String.fromCharCode('a'.charCodeAt(0) + cell.x)}${cell.z + 1}`;
}
