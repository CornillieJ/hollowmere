import * as THREE from 'three';

import { SYSTEM_ORDER } from '../core/systems';
import { onTap } from '../helpers/tap';
import type { Cell, Grid } from '../helpers/grid';
import type { CurvePath } from '../helpers/curve';
import type { PathEnemy } from './path-enemies';

/**
 * Towers on a grid that shoot whatever walks past.
 *
 * Give it a grid, a list of buildings and something to shoot at, and it handles
 * placement, the placement ring, range, targeting, upgrades, selling and the
 * shots. A tower defence, an RTS defence line and a farm's scarecrow cannon are
 * the same code with different numbers.
 *
 * ```ts
 * const towers = addGridTowers(game, {
 *     grid,
 *     path: ROAD,                  // used to keep buildings off the route
 *     targets: () => walkers.enemies,
 *     onDamage: (target, amount) => walkers.damage(target, amount),
 *     onSpend: (cost) => gold.trySpend(cost),
 * });
 * towers.spawn({ id: 'gun', name: 'Gun', cost: 60, range: 7, damage: 14, fireRate: 2.4 });
 * ```
 */
export type TowerDefinition = {
    id: string;
    name: string;
    cost: number;
    range: number;
    damage: number;
    /** Shots per second. */
    fireRate: number;
    color?: THREE.ColorRepresentation;
    /** Damage also lands within this radius of the target. */
    splash?: number;
    /** Slow the target to this fraction of its speed. */
    slow?: { factor: number; duration: number };
    /** Upgrade steps, in order. */
    upgrades?: Array<{ cost: number; damage: number; range: number; fireRate?: number }>;
    description?: string;
    icon?: string;
    /** Extra stat lines, shown in the toolbar and a detail pane. */
    stats?: string[];
};

export type Tower = {
    definition: TowerDefinition;
    cell: Cell;
    root: THREE.Group;
    turret: THREE.Object3D;
    level: number;
    cooldown: number;
    damage: number;
    range: number;
    fireRate: number;
};

export type GridTowerOptions = {
    grid: Grid;
    /** Route to keep clear of buildings. */
    path?: CurvePath;
    /** Clearance around the route in meters. Defaults to 2. */
    pathClearance?: number;
    /** Additional blocked cells. */
    blocked?: (cell: Cell) => boolean;
    /** What the towers may shoot at. Read it fresh, the list changes. */
    targets: () => PathEnemy[];
    /** Apply damage to a target. */
    onDamage: (target: PathEnemy, amount: number) => void;
    /** Pay for a tower or an upgrade. Return true when it was taken. */
    onSpend?: (amount: number) => boolean;
    /** Give money back, e.g. when a tower is sold. */
    onRefund?: (amount: number) => void;
    /** Called after a tower is built, upgraded or sold. */
    onChanged?: (towers: Tower[]) => void;
    /** Height the shots leave from, above the tower base. */
    muzzleHeight?: number;
    /** Base cell size used to size the tower meshes. Defaults to the grid spacing. */
};

export type GridTowersHandle = {
    readonly towers: Tower[];
    /** Cell size the towers are built at. */
    readonly cellSize: number;
    /** Build on a cell. Returns false when it is blocked or unaffordable. */
    place: (definition: TowerDefinition, cell: Cell) => boolean;
    /** True when a tower may be built on this cell. */
    canBuild: (cell: Cell) => boolean;
    /** Upgrade the tower on a cell. */
    upgrade: (cell: Cell) => boolean;
    /** Sell the tower on a cell, refunding part of what was paid. */
    sell: (cell: Cell) => boolean;
    /** The tower on a cell, `undefined` when the plot is empty. */
    at: (cell: Cell) => Tower | undefined;
    /** Start showing the placement ring for a definition. */
    beginPlacement: (definition: TowerDefinition) => void;
    /** Stop showing the placement ring. */
    endPlacement: () => void;
    /** The cell under the cursor right now. */
    hoveredCell: () => Cell | undefined;
    clear: () => void;
    dispose: () => void;
};

/** Fraction of what was paid that comes back when a tower is sold. */
export const SELL_REFUND = 0.7;

export function addGridTowers(game: Game, options: GridTowerOptions): GridTowersHandle {
    const towers: Tower[] = [];
    const cellSize = options.grid.spacing;
    const muzzleHeight = options.muzzleHeight ?? 0.85;
    let pending: TowerDefinition | undefined;

    const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.96, 1, 44),
        new THREE.MeshBasicMaterial({ color: 0x59d3ff, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.visible = false;
    game.scene.add(ring);

    function at(cell: Cell): Tower | undefined {
        return towers.find((tower) => tower.cell.x === cell.x && tower.cell.z === cell.z);
    }

    function canBuild(cell: Cell): boolean {
        if (!options.grid.contains(cell) || at(cell) || options.blocked?.(cell)) return false;
        if (!options.path) return true;
        const clearance = options.pathClearance ?? 2;
        return options.path.closestProgress(options.grid.cellToWorld(cell), 40).distance >= clearance;
    }

    /** Cell under the cursor, or under a screen point such as a tap. */
    function hoveredCell(clientX?: number, clientY?: number): Cell | undefined {
        const rect = game.canvas.getBoundingClientRect();
        const ndc =
            clientX === undefined || clientY === undefined
                ? game.input.mouse.ndc
                : new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
        game.raycaster.setFromCamera(ndc, game.camera);
        const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        const point = new THREE.Vector3();
        if (!game.raycaster.ray.intersectPlane(plane, point)) return undefined;
        return options.grid.worldToCellStrict(point);
    }

    function place(definition: TowerDefinition, cell: Cell): boolean {
        if (!canBuild(cell)) return false;
        if (options.onSpend && !options.onSpend(definition.cost)) return false;

        const root = new THREE.Group();
        root.position.copy(options.grid.cellToWorld(cell));
        root.name = `tower-${definition.id}`;

        const base = new THREE.Mesh(
            new THREE.CylinderGeometry(cellSize * 0.34, cellSize * 0.42, 0.5, 12),
            new THREE.MeshStandardMaterial({ color: 0x4a5260, roughness: 0.6, metalness: 0.3 }),
        );
        base.position.y = 0.25;
        base.castShadow = true;
        base.receiveShadow = true;
        root.add(base);

        const turret = new THREE.Group();
        turret.position.y = 0.72;
        const barrel = new THREE.Mesh(
            new THREE.BoxGeometry(0.2, 0.2, cellSize * 0.45),
            new THREE.MeshStandardMaterial({ color: definition.color ?? 0x59d3ff, emissive: definition.color ?? 0x59d3ff, emissiveIntensity: 0.3, roughness: 0.4, metalness: 0.3 }),
        );
        barrel.position.z = cellSize * 0.18;
        barrel.castShadow = true;
        turret.add(barrel);
        root.add(turret);
        game.scene.add(root);

        towers.push({ definition, cell: { ...cell }, root, turret, level: 0, cooldown: 0, damage: definition.damage, range: definition.range, fireRate: definition.fireRate });
        game.effects.particles.burst(root.position.clone().setY(0.6), { count: 14, color: definition.color ?? 0x59d3ff, size: 0.07, speed: 2.5, lifetime: 0.35 });
        options.onChanged?.(towers);
        return true;
    }

    function upgrade(cell: Cell): boolean {
        const tower = at(cell);
        const step = tower?.definition.upgrades?.[tower.level];
        if (!tower || !step) return false;
        if (options.onSpend && !options.onSpend(step.cost)) return false;

        tower.level += 1;
        tower.damage = step.damage;
        tower.range = step.range;
        tower.fireRate = step.fireRate ?? tower.fireRate;
        tower.root.scale.setScalar(1 + tower.level * 0.08);
        game.effects.text(tower.root.position.clone().setY(tower.root.position.y + 1.7), `Level ${tower.level + 1}`, { color: 0x9fe7ff });
        options.onChanged?.(towers);
        return true;
    }

    function sell(cell: Cell): boolean {
        const tower = at(cell);
        if (!tower) return false;
        const spent = tower.definition.cost + (tower.definition.upgrades ?? []).slice(0, tower.level).reduce((total, step) => total + step.cost, 0);
        const refund = Math.round(spent * SELL_REFUND);
        options.onRefund?.(refund);
        towers.splice(towers.indexOf(tower), 1);
        tower.root.removeFromParent();
        game.toasts.push(`Sold for $${refund}`);
        options.onChanged?.(towers);
        return true;
    }

    /** Towers shoot whichever target is furthest along the route. */
    function furthestInRange(tower: Tower): PathEnemy | undefined {
        let best: PathEnemy | undefined;
        for (const target of options.targets()) {
            if (!target.alive) continue;
            if (target.root.position.distanceTo(tower.root.position) > tower.range) continue;
            if (!best || target.progress > best.progress) best = target;
        }
        return best;
    }

    function fire(tower: Tower, target: PathEnemy): void {
        const origin = tower.root.position.clone().setY(tower.root.position.y + muzzleHeight);
        const point = target.root.position.clone().setY(target.root.position.y + 0.5);

        const beam = new THREE.Line(
            new THREE.BufferGeometry().setFromPoints([origin, point]),
            new THREE.LineBasicMaterial({ color: tower.definition.color ?? 0x59d3ff, transparent: true, opacity: 0.9 }),
        );
        beam.name = 'tower-beam';
        game.scene.add(beam);
        let age = 0;
        const unregister = game.systems.add({
            name: 'tower-beam-fade',
            order: SYSTEM_ORDER.EFFECTS,
            update: (delta) => {
                age += delta;
                (beam.material as THREE.LineBasicMaterial).opacity = Math.max(0, 0.9 - age * 6);
                if (age < 0.16) return;
                unregister();
                beam.geometry.dispose();
                (beam.material as THREE.Material).dispose();
                beam.removeFromParent();
            },
        });

        options.onDamage(target, tower.damage);

        if (tower.definition.splash) {
            for (const other of options.targets()) {
                if (other === target || !other.alive) continue;
                if (other.root.position.distanceTo(point) <= tower.definition.splash) options.onDamage(other, tower.damage * 0.6);
            }
        }
        if (tower.definition.slow) {
            target.slowFactor = tower.definition.slow.factor;
            target.slowTimer = tower.definition.slow.duration;
        }
    }

    // Click a plot to build the pending tower; a built tower upgrades, or sells
    // with the sprint key held. pointerdown covers both a mouse click and a tap.
    // On release, not press: a drag that turns the camera must not build or sell.
    // The tap's own point is used, because a finger never sends a hover first.
    const stopTaps = onTap(
        game.canvas,
        (tap) => {
            if (!game.state.is('playing')) return;
            const cell = hoveredCell(tap.clientX, tap.clientY);
            if (!cell) return;

            const tower = at(cell);
            if (tower) {
                // Selling is the deliberate action, so it is checked before upgrading.
                if (game.input.isDown('sprint')) sell(cell);
                else upgrade(cell);
                return;
            }
            if (pending) place(pending, cell);
        },
        { ignore: (event) => event.target !== game.canvas || game.input.pointerOverUi },
    );

    game.systems.add({
        name: 'grid-tower-targeting',
        order: SYSTEM_ORDER.GAMEPLAY + 1,
        update: (delta) => {
            for (const tower of towers) {
                tower.cooldown = Math.max(0, tower.cooldown - delta);
                const target = furthestInRange(tower);
                if (target) tower.turret.lookAt(target.root.position.x, tower.root.position.y + 0.72, target.root.position.z);
                if (tower.cooldown > 0 || !target) continue;
                tower.cooldown = 1 / Math.max(tower.fireRate, 0.01);
                fire(tower, target);
            }
        },
        lateUpdate: () => {
            ring.visible = pending !== undefined && game.state.is('playing');
            if (!pending) return;
            const cell = hoveredCell();
            if (!cell) {
                ring.visible = false;
                return;
            }
            ring.position.copy(options.grid.cellToWorld(cell)).setY(0.05);
            ring.scale.setScalar(pending.range);
            (ring.material as THREE.MeshBasicMaterial).color.set(canBuild(cell) ? 0x6ce09a : 0xff5a5a);
        },
    });

    return {
        towers,
        cellSize,
        place,
        canBuild,
        upgrade,
        sell,
        at,
        beginPlacement: (definition) => {
            pending = definition;
        },
        endPlacement: () => {
            pending = undefined;
            ring.visible = false;
        },
        hoveredCell,
        clear: () => {
            for (const tower of [...towers]) {
                towers.splice(towers.indexOf(tower), 1);
                tower.root.removeFromParent();
            }
            options.onChanged?.(towers);
        },
        dispose: () => {
            stopTaps();
            for (const tower of towers) tower.root.removeFromParent();
            towers.length = 0;
            ring.geometry.dispose();
            (ring.material as THREE.Material).dispose();
            ring.removeFromParent();
        },
    };
}
