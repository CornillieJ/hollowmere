import * as THREE from 'three';

import { SYSTEM_ORDER } from '../core/systems';
import type { Cell, Grid } from '../helpers/grid';

//#region Placement

export type AddPlacementOptions = {
    /** Grid to snap to. */
    grid: Grid;
    /** Item the player places. Its cost is paid through `spend` if given. */
    id: string;
    /** Cells that may not be used, e.g. the road in a tower defence. */
    blocked?: (cell: Cell) => boolean;
    /** Called when a valid cell is chosen. Return false to refuse the placement. */
    onPlace: (cell: Cell) => boolean;
    /** Radius drawn around the cursor. */
    radius?: number;
    /** Colour of the preview ring. */
    color?: THREE.ColorRepresentation;
    /** Cells that may be used at all. Defaults to every cell in the grid. */
    canPlace?: (cell: Cell) => boolean;
};

export type PlacementHandle = {
    /** True while the ghost follows the cursor. */
    readonly active: boolean;
    start: () => void;
    stop: () => void;
    /** Cell currently under the cursor. */
    hovered: () => Cell | undefined;
    dispose: () => void;
};

/**
 * Click a grid cell to place something, with a ring showing the footprint.
 *
 * The ring follows the cursor, turns red over cells that will not work, and a
 * click calls back with the cell. Tower defence turrets, farm plots, RTS
 * buildings and village decorations are all this.
 */
export function addPlacement(game: Game, options: AddPlacementOptions): PlacementHandle {
    const group = new THREE.Group();
    group.name = `placement-${options.id}`;
    game.scene.add(group);

    const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.96, 1, 44),
        new THREE.MeshBasicMaterial({ color: options.color ?? 0x59d3ff, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.visible = false;
    group.add(ring);

    let active = false;

    const cellUnderCursor = (): Cell | undefined => {
        game.raycaster.setFromCamera(game.input.mouse.ndc, game.camera);
        const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        const point = new THREE.Vector3();
        if (!game.raycaster.ray.intersectPlane(plane, point)) return undefined;
        return options.grid.worldToCellStrict(point);
    };

    const isValid = (cell: Cell | undefined): boolean => {
        if (!cell || !options.grid.contains(cell)) return false;
        if (options.canPlace && !options.canPlace(cell)) return false;
        if (options.blocked?.(cell)) return false;
        return true;
    };

    // pointerdown, not mousedown: a tap on a phone is the same gesture as a
    // left click, and only the pointer event fires for both.
    const onPointerDown = (event: PointerEvent): void => {
        if (!active || event.button !== 0 || !game.state.is('playing')) return;
        // A press on an in-canvas menu must not also place a building.
        if (game.input.pointerOverUi) return;
        const cell = cellUnderCursor();
        if (!isValid(cell) || !cell) return;
        if (options.onPlace(cell)) stop();
    };
    game.canvas.addEventListener('pointerdown', onPointerDown);

    function stop(): void {
        active = false;
        ring.visible = false;
    }

    game.systems.add({
        name: `placement-${options.id}`,
        order: SYSTEM_ORDER.GAMEPLAY + 1,
        always: true,
        lateUpdate: () => {
            if (!active) return;
            const cell = cellUnderCursor();
            ring.visible = game.state.is('playing');
            if (!cell) {
                ring.visible = false;
                return;
            }
            ring.position.copy(options.grid.cellToWorld(cell)).setY(0.05);
            ring.scale.setScalar(options.radius ?? 1);
            (ring.material as THREE.MeshBasicMaterial).color.set(isValid(cell) ? 0x6ce09a : 0xff5a5a);
        },
    });

    return {
        get active() {
            return active;
        },
        start: () => {
            active = true;
        },
        stop,
        hovered: () => (active ? cellUnderCursor() : undefined),
        dispose: () => {
            game.canvas.removeEventListener('pointerdown', onPointerDown);
            ring.geometry.dispose();
            (ring.material as THREE.Material).dispose();
            group.removeFromParent();
        },
    };
}

//#endregion Placement
