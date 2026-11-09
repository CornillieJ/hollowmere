import * as THREE from 'three';

import type { Cell } from '../helpers/grid';

/**
 * Cell markers for a board: selection, legal moves, captures, last move, check.
 *
 * One geometry and one material per kind, shared by every marker, so showing the
 * moves of a queen costs a handful of meshes and no allocations worth measuring.
 * Markers are grouped by kind, which lets a game replace "the legal moves" without
 * touching "the check marker".
 */
export type BoardHighlightKind = 'select' | 'move' | 'attack' | 'hover' | 'check' | 'last';

type KindStyle = { color: number; opacity: number; shape: 'square' | 'dot' | 'ring' };

const STYLES: Record<BoardHighlightKind, KindStyle> = {
    select: { color: 0x59d3ff, opacity: 0.55, shape: 'square' },
    move: { color: 0x6ce09a, opacity: 0.75, shape: 'dot' },
    attack: { color: 0xff5a5a, opacity: 0.8, shape: 'ring' },
    hover: { color: 0xffffff, opacity: 0.2, shape: 'square' },
    check: { color: 0xff2d2d, opacity: 0.6, shape: 'square' },
    last: { color: 0xffd66b, opacity: 0.35, shape: 'square' },
};

/** Lift above the board surface, enough to beat depth fighting at any zoom. */
const LIFT = 0.012;

export class BoardHighlights {
    readonly group = new THREE.Group();

    private readonly kinds = new Map<BoardHighlightKind, { material: THREE.MeshBasicMaterial; geometry: THREE.BufferGeometry; markers: THREE.Mesh[]; cells: Cell[] }>();
    private readonly place: (cell: Cell, y: number) => THREE.Vector3;
    private readonly y: number;

    constructor(parent: THREE.Object3D, cellSize: number, y: number, place: (cell: Cell, y: number) => THREE.Vector3) {
        this.y = y;
        this.place = place;
        this.group.name = 'board-highlights';
        // Markers never take part in picking: the board picks by plane, not by mesh.
        this.group.raycast = () => undefined;
        parent.add(this.group);

        for (const kind of Object.keys(STYLES) as BoardHighlightKind[]) {
            const style = STYLES[kind];
            const material = new THREE.MeshBasicMaterial({ color: style.color, transparent: true, opacity: style.opacity, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
            this.kinds.set(kind, { material, geometry: createShape(style.shape, cellSize), markers: [], cells: [] });
        }
    }

    /** Replace every marker of one kind. An empty list clears it. */
    set(kind: BoardHighlightKind, cells: readonly Cell[]): void {
        const entry = this.kinds.get(kind);
        if (!entry) return;
        while (entry.markers.length < cells.length) {
            const marker = new THREE.Mesh(entry.geometry, entry.material);
            marker.renderOrder = 2;
            marker.raycast = () => undefined;
            this.group.add(marker);
            entry.markers.push(marker);
        }
        entry.markers.forEach((marker, index) => {
            const cell = cells[index];
            marker.visible = cell !== undefined;
            if (cell) marker.position.copy(this.place(cell, this.y + LIFT));
        });
        entry.cells = cells.map((cell) => ({ ...cell }));
    }

    /** Add one marker to a kind without disturbing the others of that kind. */
    add(kind: BoardHighlightKind, cell: Cell): void {
        const current = this.cells(kind);
        if (current.some((other) => other.x === cell.x && other.z === cell.z)) return;
        this.set(kind, [...current, cell]);
    }

    /** Cells currently marked with a kind. */
    cells(kind: BoardHighlightKind): Cell[] {
        return this.kinds.get(kind)?.cells.map((cell) => ({ ...cell })) ?? [];
    }

    clear(kind?: BoardHighlightKind): void {
        if (kind) this.set(kind, []);
        else for (const key of this.kinds.keys()) this.set(key, []);
    }

    dispose(): void {
        for (const entry of this.kinds.values()) {
            entry.geometry.dispose();
            entry.material.dispose();
        }
        this.group.removeFromParent();
    }
}

function createShape(shape: KindStyle['shape'], cellSize: number): THREE.BufferGeometry {
    const geometry =
        shape === 'dot'
            ? new THREE.CircleGeometry(cellSize * 0.17, 24)
            : shape === 'ring'
              ? new THREE.RingGeometry(cellSize * 0.36, cellSize * 0.46, 32)
              : new THREE.PlaneGeometry(cellSize, cellSize);
    geometry.rotateX(-Math.PI / 2);
    return geometry;
}
