import * as THREE from 'three';

import { SYSTEM_ORDER } from '../core/systems';
import { Grid, type Cell } from '../helpers/grid';
import { setUserData } from '../helpers/object';

/**
 * Farming plots with crops that grow over real time.
 *
 * A crop definition says how many stages it has and how long each stage takes.
 * A plot holds one crop, remembers whether it was watered today and exposes
 * `harvest` once it is ripe. The manager is deliberately dumb: it never touches
 * the inventory itself, it just reports what came out.
 */
export type CropDefinition = {
    id: string;
    name?: string;
    /** Produce item id granted on harvest, defaults to the crop id. */
    produce?: string;
    /** Amount of produce per harvest. */
    yield?: number;
    /** Growth stages, including the ripe one. Two is the minimum. */
    stages?: number;
    /** Seconds per stage, per stage index. The last entry repeats. */
    stageSeconds?: number[];
    /** Seeds item id consumed when planting. */
    seed?: string;
    /** Watering doubles the growth speed for the rest of the day. */
    needsWater?: boolean;
    /** Colour ramp from seedling to ripe, one entry per stage. */
    colors?: THREE.ColorRepresentation[];
    /** Height of the crop at full growth, in meters. */
    height?: number;
    /** Seeds handed back on harvest, so a field can keep itself going. Defaults to 0. */
    seedReturn?: number;
    /** Chance of one extra seed on top, 0..1. */
    bonusSeedChance?: number;
};

export type PlotState = {
    cell: Cell;
    /** World position of the plot centre. */
    position: THREE.Vector3;
    /** Crop currently planted, `undefined` when the plot is empty. */
    crop: CropDefinition | undefined;
    /** 0 based growth stage. */
    stage: number;
    /** Seconds accumulated in the current stage. */
    elapsed: number;
    /** Watered since the last day rollover. */
    watered: boolean;
    /** True when the crop can be harvested. */
    ripe: boolean;
    /** Soil mesh, moved and recoloured as the crop grows. */
    soil: THREE.Mesh;
    /** Crop mesh, scaled with growth. */
    plant: THREE.Mesh;
    /** Which field the plot belongs to: 0 is the first one. */
    field: number;
    /** False while its field is not in use yet; such a plot is hidden and cannot be worked. */
    active: boolean;
};

/** An extra block of plots somewhere else, e.g. land bought later. */
export type FieldLayout = { origin: Vec3; columns: number; rows: number };

export type FarmOptions = {
    /** Plot layout, defaults to a 5 by 4 grid of 1 meter plots. */
    columns?: number;
    rows?: number;
    plotSize?: number;
    /** World position of the first plot. */
    origin?: THREE.Vector3 | Vec3;
    crops?: CropDefinition[];
    /** A fresh plot needs tilling before it can be planted. */
    tilling?: boolean;
    /**
     * More fields at fixed places. They start hidden; `setActiveFields` opens
     * them, which is how a "buy more land" upgrade works.
     */
    extraFields?: FieldLayout[];
    /** No toasts for planting, watering, ripening and picking: the game shows those itself. */
    quiet?: boolean;
    /** Ground colours: before tilling, tilled and dry, and watered. */
    soil?: { untilled?: THREE.ColorRepresentation; dry?: THREE.ColorRepresentation; wet?: THREE.ColorRepresentation };
};

export class Farm {
    readonly grid: Grid;
    readonly plots: PlotState[] = [];
    /** Crop definitions by id. */
    readonly crops = new Map<string, CropDefinition>();

    private readonly game: Game;
    private readonly root: THREE.Group;
    private readonly plotSize: number;
    private readonly soilGeometry: THREE.BoxGeometry;
    private readonly plantGeometry: THREE.ConeGeometry;
    private readonly untilledMaterial: THREE.MeshStandardMaterial;
    /** Tilled earth that still needs water. */
    private readonly tilledMaterial: THREE.MeshStandardMaterial;
    /** Watered earth: darker, so a glance tells which plots are done. */
    private readonly soilMaterial: THREE.MeshStandardMaterial;
    private readonly plantMaterials = new Map<string, THREE.MeshStandardMaterial>();
    private readonly listeners = new Set<(plot: PlotState) => void>();
    private fieldsInUse = 1;
    private readonly quiet: boolean;

    constructor(game: Game, options: FarmOptions = {}) {
        this.game = game;
        this.plotSize = options.plotSize ?? 1;
        this.quiet = options.quiet ?? false;
        const columns = options.columns ?? 5;
        const rows = options.rows ?? 4;
        const origin = options.origin ?? { x: -((columns - 1) * this.plotSize) / 2, y: 0.05, z: -((rows - 1) * this.plotSize) / 2 };

        this.grid = new Grid({ width: columns, depth: rows, spacing: this.plotSize, origin, y: origin.y });
        this.root = new THREE.Group();
        this.root.name = 'farm';
        game.scene.add(this.root);

        this.soilGeometry = new THREE.BoxGeometry(this.plotSize * 0.92, 0.12, this.plotSize * 0.92);
        this.plantGeometry = new THREE.ConeGeometry(this.plotSize * 0.26, 1, 7);
        this.untilledMaterial = new THREE.MeshStandardMaterial({ color: options.soil?.untilled ?? 0x6b5137, roughness: 1 });
        this.tilledMaterial = new THREE.MeshStandardMaterial({ color: options.soil?.dry ?? 0x5a4430, roughness: 1 });
        this.soilMaterial = new THREE.MeshStandardMaterial({ color: options.soil?.wet ?? 0x2e2218, roughness: 0.7 });

        for (const crop of options.crops ?? []) this.defineCrop(crop);

        this.addField(this.grid, origin.y, 0, options.tilling === true);
        (options.extraFields ?? []).forEach((layout, index) => {
            const grid = new Grid({ width: layout.columns, depth: layout.rows, spacing: this.plotSize, origin: layout.origin, y: layout.origin.y });
            this.addField(grid, layout.origin.y, index + 1, options.tilling === true);
        });
        this.setActiveFields(1);

        game.systems.add({
            name: 'farm',
            order: SYSTEM_ORDER.GAMEPLAY,
            update: (delta) => this.update(delta),
        });
    }

    /** How many fields are in use, counting the first. */
    get activeFields(): number {
        return this.fieldsInUse;
    }

    /** Open the first `count` fields and close the rest. A closed field keeps its crops for when it reopens. */
    setActiveFields(count: number): void {
        this.fieldsInUse = Math.max(1, count);
        for (const plot of this.plots) {
            plot.active = plot.field < this.fieldsInUse;
            plot.soil.visible = plot.active;
            plot.plant.visible = plot.active && plot.crop !== undefined;
        }
    }

    private addField(grid: Grid, y: number, field: number, untilled: boolean): void {
        for (const cell of grid.cells()) {
            const position = grid.cellToWorld(cell, y);
            const soil = new THREE.Mesh(this.soilGeometry, untilled ? this.untilledMaterial : this.tilledMaterial);
            soil.position.copy(position);
            soil.receiveShadow = true;
            soil.castShadow = false;
            setUserData(soil, { tag: 'plot' });
            this.root.add(soil);

            const plant = new THREE.Mesh(this.plantGeometry, this.plantMaterial(0x5da35d));
            plant.visible = false;
            plant.castShadow = true;
            plant.position.copy(position);
            this.root.add(plant);

            this.plots.push({ cell, position, crop: undefined, stage: 0, elapsed: 0, watered: false, ripe: false, soil, plant, field, active: true });
        }
    }

    /** Register a crop type. */
    defineCrop(crop: CropDefinition): void {
        this.crops.set(crop.id, {
            yield: 1,
            stages: 3,
            stageSeconds: [12, 12, 12],
            needsWater: true,
            height: 0.9,
            ...crop,
        });
    }

    /** The plot at a cell of the first field, `undefined` when it is outside it. */
    plotAt(cell: Cell): PlotState | undefined {
        return this.plots.find((plot) => plot.field === 0 && plot.cell.x === cell.x && plot.cell.z === cell.z);
    }

    /** Nearest plot to a world position, `undefined` when nothing is close. */
    nearestPlot(position: THREE.Vector3 | Vec3, maxDistance = 1.5): PlotState | undefined {
        let best: PlotState | undefined;
        let bestDistance = maxDistance;
        for (const plot of this.plots) {
            if (!plot.active) continue;
            const distance = plot.position.distanceTo(position instanceof THREE.Vector3 ? position : new THREE.Vector3(position.x, position.y, position.z));
            if (distance < bestDistance) {
                bestDistance = distance;
                best = plot;
            }
        }
        return best;
    }

    /**
     * Plant a crop.
     * @returns False when the plot is occupied, the crop is unknown, or the seeds are missing.
     */
    plant(plot: PlotState, cropId: string, consumeSeed = true): boolean {
        const crop = this.crops.get(cropId);
        if (!crop || plot.crop) return false;
        if (consumeSeed && crop.seed && !this.game.inventory.has(crop.seed, 1)) {
            this.say(`No ${crop.name ?? cropId} seeds`, { color: '#ff9a9a' });
            return false;
        }
        if (consumeSeed && crop.seed) this.game.inventory.remove(crop.seed, 1);

        plot.crop = crop;
        plot.stage = 0;
        plot.elapsed = 0;
        plot.watered = false;
        plot.ripe = false;
        plot.plant.visible = true;
        plot.plant.position.y = plot.position.y;
        plot.plant.scale.set(0.25, 0.25, 0.25);
        plot.plant.material = this.plantMaterial(crop.colors?.[0] ?? 0x5da35d);
        plot.soil.material = this.tilledMaterial;
        this.say(`Planted ${crop.name ?? cropId}`);
        this.notify(plot);
        return true;
    }

    /** Water a plot: crops grow twice as fast until the next day. */
    water(plot: PlotState): boolean {
        if (plot.watered) return false;
        plot.watered = true;
        plot.soil.material = this.soilMaterial;
        this.say('Watered');
        this.notify(plot);
        return true;
    }

    /**
     * Harvest a ripe plot.
     * @returns The produce and any seeds that came with it, or `undefined` when the crop is not ready.
     */
    harvest(plot: PlotState): { itemId: string; amount: number; seeds?: { itemId: string; amount: number } } | undefined {
        if (!plot.crop || !plot.ripe) return undefined;
        const crop = plot.crop;
        const itemId = crop.produce ?? crop.id;
        const amount = crop.yield ?? 1;

        plot.crop = undefined;
        plot.stage = 0;
        plot.elapsed = 0;
        plot.ripe = false;
        plot.watered = false;
        plot.plant.visible = false;
        plot.soil.material = this.tilledMaterial;

        this.say(`Harvested ${amount} ${itemId}`, { color: '#b6f5b6' });
        this.game.effects.particles.burst(plot.position.clone().setY(plot.position.y + 0.4), { count: 14, color: 0x8ce09a, size: 0.06, speed: 2.5, lifetime: 0.4 });
        this.notify(plot);
        const seedCount = (crop.seedReturn ?? 0) + (crop.bonusSeedChance !== undefined && Math.random() < crop.bonusSeedChance ? 1 : 0);
        return crop.seed && seedCount > 0 ? { itemId, amount, seeds: { itemId: crop.seed, amount: seedCount } } : { itemId, amount };
    }

    /** Mark every plot dry again, e.g. when a new day starts. */
    newDay(): void {
        for (const plot of this.plots) {
            plot.watered = false;
            plot.soil.material = this.tilledMaterial;
        }
    }

    /** The field as save data: one entry per plot, empty ones as null. */
    toJSON(): Array<{ crop: string; stage: number; elapsed: number; watered: boolean; ripe: boolean } | null> {
        return this.plots.map((plot) => (plot.crop ? { crop: plot.crop.id, stage: plot.stage, elapsed: Math.round(plot.elapsed * 10) / 10, watered: plot.watered, ripe: plot.ripe } : null));
    }

    /** Bring a saved field back, repainting soil and plants to match. */
    fromJSON(data: Array<{ crop: string; stage: number; elapsed: number; watered: boolean; ripe: boolean } | null>): void {
        for (const [index, plot] of this.plots.entries()) {
            const saved = data[index];
            const crop = saved ? this.crops.get(saved.crop) : undefined;
            if (!saved || !crop) {
                plot.crop = undefined;
                plot.stage = 0;
                plot.elapsed = 0;
                plot.ripe = false;
                plot.plant.visible = false;
                plot.soil.material = this.tilledMaterial;
                plot.watered = false;
                continue;
            }
            plot.crop = crop;
            plot.stage = saved.stage;
            plot.elapsed = saved.elapsed;
            plot.watered = saved.watered;
            plot.ripe = saved.ripe;
            plot.plant.visible = plot.active;
            const stages = Math.max(2, crop.stages ?? 3);
            const progress = (plot.stage + 1) / stages;
            plot.plant.scale.setScalar(0.25 + progress * 0.75);
            plot.plant.position.y = plot.position.y + (crop.height ?? 0.9) * progress * 0.5;
            const ramp = crop.colors;
            if (ramp && ramp.length > 0) plot.plant.material = this.plantMaterial(ramp[Math.min(plot.stage, ramp.length - 1)] ?? 0x5da35d);
            plot.soil.material = plot.watered ? this.soilMaterial : this.tilledMaterial;
        }
    }

    /** Empty every plot, e.g. for a new game. */
    clearField(): void {
        this.fromJSON([]);
    }

    /** Called whenever a plot changes, for HUD refreshes. */
    onChange(listener: (plot: PlotState) => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    /** How many plots are ripe right now. */
    get ripeCount(): number {
        return this.plots.filter((plot) => plot.ripe).length;
    }

    /** How many plots have something growing. */
    get plantedCount(): number {
        return this.plots.filter((plot) => plot.crop !== undefined).length;
    }

    dispose(): void {
        this.root.removeFromParent();
        this.soilGeometry.dispose();
        this.plantGeometry.dispose();
        this.soilMaterial.dispose();
        this.untilledMaterial.dispose();
        this.tilledMaterial.dispose();
        for (const material of this.plantMaterials.values()) material.dispose();
    }

    //#region Internals

    private update(delta: number): void {
        for (const plot of this.plots) {
            const crop = plot.crop;
            if (!crop) continue;
            const stages = Math.max(2, crop.stages ?? 3);
            if (plot.stage >= stages - 1) {
                plot.ripe = true;
                continue;
            }

            const perStage = (crop.stageSeconds ?? [12])[Math.min(plot.stage, (crop.stageSeconds ?? [12]).length - 1)] ?? 12;
            const speed = crop.needsWater !== false && !plot.watered ? 0.45 : 1;
            plot.elapsed += delta * speed;

            if (plot.elapsed < perStage) continue;
            plot.elapsed = 0;
            plot.stage += 1;

            const progress = (plot.stage + 1) / stages;
            plot.plant.scale.set(0.25 + progress * 0.75, 0.25 + progress * 0.75, 0.25 + progress * 0.75);
            plot.plant.position.y = plot.position.y + (crop.height ?? 0.9) * progress * 0.5;
            const ramp = crop.colors;
            if (ramp && ramp.length > 0) plot.plant.material = this.plantMaterial(ramp[Math.min(plot.stage, ramp.length - 1)] ?? 0x5da35d);
            if (plot.stage >= stages - 1) {
                plot.ripe = true;
                this.say(`${crop.name ?? crop.id} is ready`, { color: '#ffe08a' });
            }
            this.notify(plot);
        }
    }

    private plantMaterial(colorValue: THREE.ColorRepresentation): THREE.MeshStandardMaterial {
        const key = new THREE.Color(colorValue).getHexString();
        const cached = this.plantMaterials.get(key);
        if (cached) return cached;
        const material = new THREE.MeshStandardMaterial({ color: new THREE.Color(colorValue), roughness: 0.8 });
        this.plantMaterials.set(key, material);
        return material;
    }

    /** A toast, unless the game asked for quiet because it gives its own feedback. */
    private say(message: string, options?: { color?: string }): void {
        if (!this.quiet) this.game.toasts.push(message, options);
    }

    private notify(plot: PlotState): void {
        for (const listener of this.listeners) listener(plot);
    }

    //#endregion Internals
}

/** A couple of crops that look right without any assets. */
export const STARTER_CROPS: CropDefinition[] = [
    { id: 'turnip', name: 'Turnip', seed: 'turnip-seed', produce: 'turnip', stages: 3, stageSeconds: [8, 8, 8], height: 0.5, colors: [0x6fbf6f, 0x8fd18f, 0xb9e8b9] },
    { id: 'corn', name: 'Corn', seed: 'corn-seed', produce: 'corn', yield: 2, stages: 4, stageSeconds: [10, 10, 10, 10], height: 1.6, colors: [0x7cc06a, 0x9ad07a, 0xd6d16a, 0xf0e08a] },
    { id: 'pumpkin', name: 'Pumpkin', seed: 'pumpkin-seed', produce: 'pumpkin', stages: 4, stageSeconds: [14, 14, 14, 14], height: 0.7, colors: [0x86c46f, 0xa8cf6f, 0xe0a34a, 0xf08a2a] },
];
