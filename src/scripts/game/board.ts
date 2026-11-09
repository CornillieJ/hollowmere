import * as THREE from 'three';

import { SYSTEM_ORDER } from '../core/systems';
import { Grid, formatChessCell, type Cell } from '../helpers/grid';
import { createLabel } from '../helpers/text';
import { checkerTexture } from '../helpers/build';
import { onTap } from '../helpers/tap';
import { setUserData, tag } from '../helpers/object';
import { BoardHighlights, type BoardHighlightKind } from './board-highlights';

export type { BoardHighlightKind } from './board-highlights';

/**
 * A clickable grid board with pieces on it.
 *
 * Built for board games: everything is a cell or a piece, picking and moving is
 * handled, and the board marks the cells you tell it to. Picking raycasts the
 * board plane, so empty cells are clickable too, and it fires on release so a
 * camera drag never selects anything.
 *
 * The board animates on its own clock and keeps running while the game is not in
 * a simulating state, so a game that never enters `playing` still moves its
 * pieces. Pieces that are taken stay on screen until their exit animation ends.
 */
export type BoardOptions = {
    /** Cells along x and z. A chess board is 8 by 8. */
    columns?: number;
    rows?: number;
    /** Distance between cell centres in meters. */
    cellSize?: number;
    /** Height of the playing surface. */
    y?: number;
    /** Thickness of the base plate. */
    thickness?: number;
    /** Two colours, alternating. */
    colors?: [THREE.ColorRepresentation, THREE.ColorRepresentation];
    /** Colour of the frame around the cells. */
    frameColor?: THREE.ColorRepresentation;
    /** Draw file and rank labels around the board. */
    coordinates?: boolean;
    /** Parent object, defaults to the scene. */
    parent?: THREE.Object3D;
    /** Raise the selected piece a little. */
    liftSelected?: boolean;
    /** `-1` makes ranks climb up the screen for a camera on the +z side. Chess uses it. */
    zDirection?: 1 | -1;
    /** Seconds a piece takes to cross one cell. */
    moveSpeed?: number;
};

/** A piece placed on the board. */
export type BoardPiece<T = unknown> = {
    /** Object that gets moved around, usually a group holding meshes. */
    object: THREE.Object3D;
    /** Cell the piece currently occupies. */
    cell: Cell;
    /** Free-form data: colour, type, owner, whatever the game needs. */
    data: T;
    /** Called when the piece is captured. */
    onCaptured?: ((game: Game, piece: BoardPiece<T>) => void) | undefined;
};

export type MoveOptions = {
    /** When false, an occupied target blocks the move instead of capturing. */
    capture?: boolean;
    /** Skip the animation and place the piece immediately. */
    animate?: boolean;
    /** Height of the hop in cells. Knights use a high one, sliders a flat one. */
    arc?: number;
    /** Called when the piece arrives. */
    onArrive?: (() => void) | undefined;
};

type Motion = { from: THREE.Vector3; to: THREE.Vector3; elapsed: number; duration: number; arc: number; onArrive: (() => void) | undefined };
type Exit = { object: THREE.Object3D; age: number; delay: number; baseScale: THREE.Vector3; baseY: number };

const EXIT_TIME = 0.4;
const LIFT = 0.14;

export class Board<T = unknown> {
    readonly grid: Grid;
    readonly root: THREE.Group;
    readonly highlights: BoardHighlights;
    /** Every piece currently on the board. Captured pieces are already gone from it. */
    readonly pieces: BoardPiece<T>[] = [];
    /** Cell under the cursor, updated every frame. */
    hovered: Cell | undefined;
    /** Currently picked cell, `undefined` when nothing is picked. */
    selected: Cell | undefined;
    /** Cells the selected piece may move to. */
    legalTargets: Cell[] = [];

    private readonly game: Game;
    private readonly cellSize: number;
    private readonly y: number;
    private readonly liftSelected: boolean;
    private readonly moveSpeed: number;
    private readonly motions = new Map<BoardPiece<T>, Motion>();
    private readonly exits: Exit[] = [];
    private readonly settleWaiters: Array<() => void> = [];
    private readonly clickListeners = new Set<(cell: Cell, piece: BoardPiece<T> | undefined) => void>();
    private readonly hoverListeners = new Set<(cell: Cell | undefined) => void>();
    private readonly disposables: Array<THREE.BufferGeometry | THREE.Material | THREE.Texture> = [];
    private readonly unsubscribers: Array<() => void> = [];
    private readonly plane: THREE.Plane;
    private readonly scratch = new THREE.Vector3();
    private hoverEnabled = true;

    constructor(game: Game, options: BoardOptions = {}) {
        this.game = game;
        this.cellSize = options.cellSize ?? 1;
        this.y = options.y ?? 0;
        this.liftSelected = options.liftSelected ?? true;
        this.moveSpeed = options.moveSpeed ?? 0.16;
        this.plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -this.y);

        this.grid = new Grid({
            width: options.columns ?? 8,
            depth: options.rows ?? 8,
            spacing: this.cellSize,
            origin: new THREE.Vector3(0, this.y, 0),
            y: this.y,
            zDirection: options.zDirection ?? 1,
        });

        this.root = new THREE.Group();
        this.root.name = 'board';
        (options.parent ?? game.scene).add(this.root);

        this.buildBase(options);
        this.highlights = new BoardHighlights(this.root, this.cellSize, this.y, (cell, y) => this.grid.cellToWorld(cell, y));
        if (options.coordinates ?? true) this.buildCoordinates();

        const unregister = game.systems.add({
            name: 'board',
            order: SYSTEM_ORDER.GAMEPLAY,
            // The board is a view: it must keep animating in menus and while a
            // dialog is open, or a move made just before one would freeze.
            always: true,
            update: (delta) => this.update(delta),
            lateUpdate: () => this.updateHover(),
        });
        this.unsubscribers.push(unregister);
        this.unsubscribers.push(
            onTap(game.canvas, (tap) => this.clickAt(tap.clientX, tap.clientY), {
                ignore: (event) => event.target !== game.canvas || game.input.pointerOverUi,
            }),
        );
    }

    //#region Queries

    /** Centre of a cell in world space. */
    cellToWorld(cell: Cell, out = new THREE.Vector3()): THREE.Vector3 {
        return this.grid.cellToWorld(cell, this.y, out);
    }

    /** Cell under a world position, clamped into the grid. */
    worldToCell(position: THREE.Vector3 | Vec3): Cell {
        return this.grid.worldToCell(position);
    }

    /** True when the cell is inside the board. */
    contains(cell: Cell): boolean {
        return this.grid.contains(cell);
    }

    /** Piece on a cell, `undefined` when the cell is empty. */
    pieceAt(cell: Cell): BoardPiece<T> | undefined {
        return this.pieces.find((piece) => piece.cell.x === cell.x && piece.cell.z === cell.z);
    }

    /** Cell a piece occupies, `undefined` when it is not on the board. */
    cellOf(piece: BoardPiece<T> | THREE.Object3D): Cell | undefined {
        const found = 'cell' in piece ? piece : this.pieces.find((entry) => entry.object === piece);
        return found?.cell;
    }

    /** True while any piece is travelling or leaving the board. */
    get isAnimating(): boolean {
        return this.motions.size > 0 || this.exits.length > 0;
    }

    /** Resolves once every move and capture animation has finished. */
    whenSettled(): Promise<void> {
        if (!this.isAnimating) return Promise.resolve();
        return new Promise((resolve) => this.settleWaiters.push(resolve));
    }

    //#endregion Queries

    //#region Pieces

    /** Place a piece on the board. `data` is yours to define. */
    addPiece(cell: Cell, object: THREE.Object3D, data?: T): BoardPiece<T> {
        const piece: BoardPiece<T> = { object, cell: { ...cell }, data: data as T };
        this.root.add(object);
        object.position.copy(this.cellToWorld(cell));
        tag(object, 'piece');
        this.pieces.push(piece);
        return piece;
    }

    /** Remove a piece from the board at once, without capturing it. */
    removePiece(piece: BoardPiece<T>): void {
        const index = this.pieces.indexOf(piece);
        if (index >= 0) this.pieces.splice(index, 1);
        this.motions.delete(piece);
        piece.object.removeFromParent();
    }

    /**
     * Move a piece to a cell, capturing whatever stands there.
     * Returns false when `capture: false` and the target is occupied.
     */
    movePiece(piece: BoardPiece<T>, cell: Cell, options: MoveOptions = {}): boolean {
        const occupant = this.pieceAt(cell);
        const duration = this.travelTime(piece.cell, cell);
        if (occupant && occupant !== piece) {
            if (options.capture === false) return false;
            this.capture(occupant, options.animate === false ? 0 : duration * 0.75);
        }

        piece.cell = { ...cell };
        const target = this.cellToWorld(cell);
        if (options.animate === false) {
            this.motions.delete(piece);
            piece.object.position.copy(target);
            options.onArrive?.();
            return true;
        }
        this.motions.set(piece, { from: piece.object.position.clone(), to: target, elapsed: 0, duration, arc: options.arc ?? 0.35, onArrive: options.onArrive });
        return true;
    }

    /** Take a piece off the board. It shrinks away, then its object is removed. */
    capture(piece: BoardPiece<T>, delay = 0): void {
        const index = this.pieces.indexOf(piece);
        if (index < 0) return;
        this.pieces.splice(index, 1);
        this.motions.delete(piece);
        this.exits.push({ object: piece.object, age: 0, delay, baseScale: piece.object.scale.clone(), baseY: piece.object.position.y });
        piece.onCaptured?.(this.game, piece);
    }

    /** Remove every piece and marker, without animation. */
    clear(): void {
        for (const piece of [...this.pieces]) this.removePiece(piece);
        for (const exit of this.exits.splice(0)) exit.object.removeFromParent();
        this.motions.clear();
        this.select(undefined);
        this.setLegalTargets([]);
        this.highlights.clear();
        this.resolveWaiters();
    }

    //#endregion Pieces

    //#region Selection and markers

    /** Pick a cell, or clear the selection with `undefined`. */
    select(cell: Cell | undefined): void {
        this.selected = cell ? { ...cell } : undefined;
        this.highlights.set('select', cell ? [cell] : []);
        this.refreshTargets();
    }

    /** Cells the selected piece may move to. Shown as dots, or rings on captures. */
    setLegalTargets(cells: Cell[]): void {
        this.legalTargets = cells.map((cell) => ({ ...cell }));
        this.refreshTargets();
    }

    /** Mark cells with a kind, replacing earlier markers of that kind. */
    setHighlights(kind: BoardHighlightKind, cells: Cell[]): void {
        this.highlights.set(kind, cells);
    }

    /** Draw a one-off highlight, e.g. a check marker. */
    addHighlight(cell: Cell, kind: BoardHighlightKind = 'hover'): void {
        this.highlights.add(kind, cell);
    }

    /** Remove the one-off markers: everything except selection and legal moves. */
    clearHighlights(): void {
        for (const kind of ['hover', 'check', 'last'] as const) this.highlights.clear(kind);
    }

    /** Show or hide the cursor marker, e.g. on a touch device. */
    setHoverEnabled(enabled: boolean): void {
        this.hoverEnabled = enabled;
        if (!enabled) this.highlights.clear('hover');
    }

    //#endregion Selection and markers

    //#region Input

    /** Called on a tap or left click, with the piece under the cursor if there is one. */
    onCellClick(listener: (cell: Cell, piece: BoardPiece<T> | undefined) => void): () => void {
        this.clickListeners.add(listener);
        return () => this.clickListeners.delete(listener);
    }

    /** Called when the hovered cell changes. */
    onHoverChange(listener: (cell: Cell | undefined) => void): () => void {
        this.hoverListeners.add(listener);
        return () => this.hoverListeners.delete(listener);
    }

    /** Act as if a cell was clicked. The same path a tap takes, for tools and tests. */
    click(cell: Cell): void {
        if (!this.contains(cell)) return;
        this.hovered = { ...cell };
        const piece = this.pieceAt(cell);
        this.game.events.emit('custom:board:click', { cell, piece });
        for (const listener of [...this.clickListeners]) listener(cell, piece);
    }

    /**
     * Grid cell under a screen position.
     *
     * Taps use their own coordinates rather than `hovered`, which is recomputed
     * once per frame: a player who moves and clicks inside one frame would
     * otherwise act on the previous cell.
     */
    cellFromScreen(clientX: number, clientY: number): Cell | undefined {
        const rect = this.game.canvas.getBoundingClientRect();
        this.game.raycaster.setFromCamera(new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1), this.game.camera);
        if (!this.game.raycaster.ray.intersectPlane(this.plane, this.scratch)) return undefined;
        return this.grid.worldToCellStrict(this.scratch);
    }

    /** Cell under the cursor right now, used by tools and tests. */
    cellFromCursor(): Cell | undefined {
        const mouse = this.game.input.mouse;
        const rect = this.game.canvas.getBoundingClientRect();
        return this.cellFromScreen(mouse.position.x + rect.left, mouse.position.y + rect.top);
    }

    //#endregion Input

    dispose(): void {
        this.clear();
        for (const unsubscribe of this.unsubscribers) unsubscribe();
        this.highlights.dispose();
        for (const item of this.disposables) item.dispose();
        this.root.removeFromParent();
    }

    /** Chess notation for a cell, e.g. 'e4'. Handy for logs and saves. */
    static notation(cell: Cell): string {
        return formatChessCell(cell);
    }

    /** Tag helper so board pieces are findable through the scene graph. */
    static markPiece(object: THREE.Object3D, data: Record<string, unknown>): THREE.Object3D {
        setUserData(object, data as GameUserDataInput);
        return object;
    }

    //#region Internals

    private clickAt(clientX: number, clientY: number): void {
        const cell = this.cellFromScreen(clientX, clientY);
        if (cell) this.click(cell);
    }

    private travelTime(from: Cell, to: Cell): number {
        const distance = Math.max(Math.abs(from.x - to.x), Math.abs(from.z - to.z));
        return Math.min(0.9, 0.22 + this.moveSpeed * Math.sqrt(Math.max(distance, 1)));
    }

    private refreshTargets(): void {
        const moves = this.legalTargets.filter((cell) => !this.pieceAt(cell));
        const attacks = this.legalTargets.filter((cell) => this.pieceAt(cell));
        this.highlights.set('move', moves);
        this.highlights.set('attack', attacks);
    }

    private update(delta: number): void {
        const dt = Math.min(delta, 0.1);
        const selected = this.selected ? this.pieceAt(this.selected) : undefined;

        for (const piece of this.pieces) {
            const motion = this.motions.get(piece);
            if (motion) {
                this.advance(piece, motion, dt);
                continue;
            }
            // Resting pieces ease to their home, so a lift or a correction is never a snap.
            const lift = this.liftSelected && piece === selected ? LIFT * this.cellSize : 0;
            const home = this.cellToWorld(piece.cell, this.scratch);
            home.y += lift;
            piece.object.position.lerp(home, 1 - Math.exp(-dt * 18));
        }

        for (let index = this.exits.length - 1; index >= 0; index -= 1) {
            const exit = this.exits[index] as Exit;
            exit.age += dt;
            const t = Math.min(Math.max((exit.age - exit.delay) / EXIT_TIME, 0), 1);
            exit.object.scale.copy(exit.baseScale).multiplyScalar(1 - t * t);
            exit.object.position.y = exit.baseY - t * 0.15;
            if (t >= 1) {
                exit.object.removeFromParent();
                this.exits.splice(index, 1);
            }
        }

        if (this.settleWaiters.length > 0 && !this.isAnimating) this.resolveWaiters();
    }

    private advance(piece: BoardPiece<T>, motion: Motion, dt: number): void {
        motion.elapsed += dt;
        const t = Math.min(motion.elapsed / motion.duration, 1);
        const eased = t * t * (3 - 2 * t);
        piece.object.position.lerpVectors(motion.from, motion.to, eased);
        piece.object.position.y += Math.sin(t * Math.PI) * this.cellSize * motion.arc;
        if (t < 1) return;
        this.motions.delete(piece);
        piece.object.position.copy(motion.to);
        motion.onArrive?.();
    }

    private resolveWaiters(): void {
        for (const resolve of this.settleWaiters.splice(0)) resolve();
    }

    private updateHover(): void {
        const cell = this.hoverEnabled && !this.game.input.pointerOverUi ? this.cellFromCursor() : undefined;
        this.highlights.set('hover', cell ? [cell] : []);
        if ((cell?.x ?? -1) === (this.hovered?.x ?? -1) && (cell?.z ?? -1) === (this.hovered?.z ?? -1)) return;
        this.hovered = cell;
        for (const listener of this.hoverListeners) listener(cell);
    }

    private buildBase(options: BoardOptions): void {
        const thickness = options.thickness ?? 0.25;
        const [light, dark] = options.colors ?? [0xe8e2d4, 0x4a4a52];
        const squares = Math.max(this.grid.width, this.grid.depth);
        const texture = checkerTexture(512, squares, `#${new THREE.Color(light).getHexString()}`, `#${new THREE.Color(dark).getHexString()}`);
        this.disposables.push(texture);

        // The plate covers the cells exactly, so its centre is the grid centre.
        const centre = this.grid.center();
        const width = this.grid.width * this.cellSize;
        const depth = this.grid.depth * this.cellSize;

        const plate = this.addMesh(new THREE.BoxGeometry(width, thickness, depth), new THREE.MeshStandardMaterial({ map: texture, roughness: 0.55, metalness: 0.02 }));
        plate.name = 'board-base';
        plate.receiveShadow = true;
        plate.position.set(centre.x, this.y - thickness / 2, centre.z);

        // A static collider means a player can stand on the board and nothing falls through it.
        this.game.physics.add({
            kind: 'fixed',
            shape: { type: 'box', size: { x: width, y: thickness, z: depth } },
            position: new THREE.Vector3(centre.x, this.y - thickness / 2, centre.z),
            object: plate,
            syncObject: false,
            tag: 'ground',
        });

        const frame = this.addMesh(new THREE.BoxGeometry(width + 0.5, thickness * 1.15, depth + 0.5), new THREE.MeshStandardMaterial({ color: options.frameColor ?? 0x2b2b31, roughness: 0.5, metalness: 0.15 }));
        frame.name = 'board-frame';
        frame.receiveShadow = true;
        // Flush with the playing surface, so the coordinates printed on it sit level with the squares.
        frame.position.set(centre.x, this.y - (thickness * 1.15) / 2 - 0.001, centre.z);
    }

    private addMesh(geometry: THREE.BufferGeometry, material: THREE.Material): THREE.Mesh {
        const mesh = new THREE.Mesh(geometry, material);
        this.root.add(mesh);
        this.disposables.push(geometry, material);
        return mesh;
    }

    private buildCoordinates(): void {
        // "Outside" depends on which way the rows run, so step away from the board in grid terms.
        const outside = this.cellSize * 0.72 * this.grid.zDirection;
        const margin = this.cellSize * 0.72;
        const place = (text: string, x: number, z: number): void => {
            const label = createLabel(text, { fontSize: 0.2, color: 0xd9cfbd });
            label.position.set(x, this.y + 0.004, z);
            label.rotation.x = -Math.PI / 2;
            this.root.add(label);
        };
        for (let x = 0; x < this.grid.width; x += 1) {
            const near = this.grid.cellToWorld({ x, z: 0 }, this.y);
            const far = this.grid.cellToWorld({ x, z: this.grid.depth - 1 }, this.y);
            place(String.fromCharCode(97 + x), near.x, near.z - outside);
            place(String.fromCharCode(97 + x), far.x, far.z + outside);
        }
        for (let z = 0; z < this.grid.depth; z += 1) {
            const near = this.grid.cellToWorld({ x: 0, z }, this.y);
            const far = this.grid.cellToWorld({ x: this.grid.width - 1, z }, this.y);
            place(String(z + 1), near.x - margin, near.z);
            place(String(z + 1), far.x + margin, far.z);
        }
    }

    //#endregion Internals
}
