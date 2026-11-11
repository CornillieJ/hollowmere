import { createNoise2D, fbm } from '../helpers/noise';
import type { TerrainFlat } from '../kit';

/**
 * Where everything is. The map is a square of `WORLD_HALF` meters each way that
 * loops back on itself, as dreams do: the farm low in the south west, the village on a rise
 * in the north east, one road between them with a lit chapel halfway, and dead
 * woods everywhere else. Paths branch off the road to the places worth finding.
 */
export const WORLD_HALF = 120;

export const FARM = {
    centre: { x: -47, z: 46 },
    house: { x: -64, z: 54, yaw: Math.PI / 2 },
    /** Where the player wakes, in front of the door. */
    door: { x: -58, z: 54 },
    /** The first field, and the land that can be bought later, at fixed places. */
    field: { x: -54, z: 34, columns: 4, rows: 3 },
    extraFields: [
        { x: -46.5, z: 34, columns: 4, rows: 3 },
        { x: -54, z: 28, columns: 9, rows: 2 },
    ],
    pen: { center: { x: -36, z: 52 }, halfSize: { x: 6, z: 5 } },
    coop: { x: -36, z: 60, yaw: Math.PI },
    barn: { x: -30, z: 38, yaw: -Math.PI / 2 },
    well: { x: -52, z: 50 },
    bike: { x: -50, z: 56, yaw: Math.PI / 2 },
    hearth: { x: -59, z: 48.5 },
    workbench: { x: -60, z: 59.5 },
    /** Three old trees at the yard's edge, close enough to learn the axe on. */
    orchard: [
        { x: -66, z: 40 },
        { x: -68.5, z: 45 },
        { x: -62, z: 35.5 },
    ],
};

export const VILLAGE = {
    center: { x: 52, z: -40 },
    /** The low wall that marks where the village ends. */
    wallRadius: 28,
    /** The house nobody lives in. It is the infirmary now. */
    infirmary: 3,
    store: { x: 40, z: -48, yaw: 0.5 },
    houses: [
        { x: 66, z: -50, yaw: -0.8, kind: 'a' },
        { x: 70, z: -30, yaw: -1.8, kind: 'b' },
        { x: 56, z: -18, yaw: Math.PI, kind: 'c' },
        { x: 34, z: -26, yaw: 2.2, kind: 'a' },
        { x: 52, z: -62, yaw: 0.1, kind: 'b' },
    ],
};

export const CHAPEL = { x: 6, z: 4, yaw: -0.6 };

/** Places off the road. Each has a path to it and a reason to go. */
export const PLACES = {
    /** The dark water the village is named for, down in a hollow. */
    pool: { x: 72, z: 44, radius: 17 },
    /** The highest ground on the map, above the mist, with the old tree. */
    lookout: { x: -70, z: -56 },
    /** Standing stones in the southern woods. Mushrooms like it there. */
    stones: { x: 6, z: 80, radius: 7 },
    /** What is left of the farm that was here before yours. */
    ruin: { x: -12, z: -62 },
    /** The village's dead, on a rise behind it. */
    graveyard: { x: 60, z: -86 },
};

/** The road as a polyline from the farm gate to the village square. */
export const ROAD: Array<{ x: number; z: number }> = [
    { x: -44, z: 46 },
    { x: -26, z: 30 },
    { x: -8, z: 16 },
    { x: 8, z: 0 },
    { x: 22, z: -16 },
    { x: 38, z: -30 },
    { x: 52, z: -40 },
];

/** Footpaths that branch off the road or the village. */
export const PATHS: Array<Array<{ x: number; z: number }>> = [
    [{ x: 22, z: -16 }, { x: 44, z: 6 }, { x: 60, z: 28 }, { x: PLACES.pool.x - 8, z: PLACES.pool.z - 12 }],
    [{ x: -8, z: 16 }, { x: -34, z: -10 }, { x: -56, z: -36 }, { x: PLACES.lookout.x, z: PLACES.lookout.z }],
    [{ x: -26, z: 30 }, { x: -14, z: 54 }, { x: PLACES.stones.x, z: PLACES.stones.z - 8 }],
    [{ x: 8, z: 0 }, { x: -2, z: -30 }, { x: PLACES.ruin.x, z: PLACES.ruin.z + 8 }],
    [{ x: 52, z: -40 }, { x: 56, z: -66 }, { x: PLACES.graveyard.x, z: PLACES.graveyard.z + 6 }],
];

/** Water level of the pool. */
export const POOL_LEVEL = -3.2;

/** Level ground for building on. The farm sits at 0 so plots and pens need no maths. */
export const FLATS: TerrainFlat[] = [
    { x: FARM.centre.x, z: FARM.centre.z, radius: 27, height: 0, blend: 16 },
    { x: VILLAGE.center.x, z: VILLAGE.center.z, radius: 31, height: 4, blend: 20 },
    { x: CHAPEL.x, z: CHAPEL.z, radius: 8, blend: 8 },
    { x: PLACES.stones.x, z: PLACES.stones.z, radius: 9, blend: 8 },
    { x: PLACES.ruin.x, z: PLACES.ruin.z, radius: 10, blend: 8 },
    { x: PLACES.graveyard.x, z: PLACES.graveyard.z, radius: 9, height: 9, blend: 14 },
    { x: PLACES.lookout.x, z: PLACES.lookout.z, radius: 6, height: 17, blend: 5 },
    // The bed of the pool: knee deep, so wading in is unpleasant, not fatal.
    { x: PLACES.pool.x, z: PLACES.pool.z, radius: 12, height: POOL_LEVEL - 0.7, blend: 16 },
];

const noise = createNoise2D(11);
const bump = (x: number, z: number, at: { x: number; z: number }, radius: number): number => Math.exp(-((x - at.x) ** 2 + (z - at.z) ** 2) / (radius * radius));

/** The lie of the land before the flats: rolling ground, one hill, one hollow, and a rim. */
export function naturalHeight(x: number, z: number): number {
    let height = 2 + fbm(noise, x / 75, z / 75, { octaves: 3 }) * 6;
    height += bump(x, z, PLACES.lookout, 30) * 15;
    return height;
}

/** Shortest distance from a point to a polyline. */
export function distanceToLine(line: Array<{ x: number; z: number }>, x: number, z: number): number {
    let best = Infinity;
    for (let index = 0; index < line.length - 1; index += 1) {
        const a = line[index] as { x: number; z: number };
        const b = line[index + 1] as { x: number; z: number };
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz)));
        best = Math.min(best, Math.hypot(x - (a.x + dx * t), z - (a.z + dz * t)));
    }
    return best;
}

export const distanceToRoad = (x: number, z: number): number => distanceToLine(ROAD, x, z);
export const distanceToPath = (x: number, z: number): number => Math.min(...PATHS.map((path) => distanceToLine(path, x, z)));

/** Monsters will not enter these, and lose interest in anyone inside. Heights are filled in from the terrain. */
export const SAFE_ZONES = [
    { position: { x: FARM.door.x, y: 0, z: FARM.door.z }, radius: 8, name: 'Home' },
    { position: { x: CHAPEL.x, y: 0, z: CHAPEL.z }, radius: 6, name: 'Wayside chapel' },
    { position: { x: VILLAGE.center.x, y: 0, z: VILLAGE.center.z }, radius: 11, name: 'Village shrine' },
    { position: { x: -36, y: 0, z: 44 }, radius: 4, name: 'Barn lamp' },
    { position: { x: PLACES.lookout.x, y: 0, z: PLACES.lookout.z }, radius: 5, name: 'Lookout lamp' },
];

/**
 * Ground the Hollow keep to. Each has its own few, who wander it and will not
 * be led far from it, so there is never a corner of the valley that has been
 * emptied by drawing them all somewhere else.
 */
export const HAUNTS = [
    { name: 'graveyard', x: PLACES.graveyard.x - 3, y: 0, z: PLACES.graveyard.z + 1, count: 3, radius: 8 },
    { name: 'pool', x: PLACES.pool.x - 15, y: 0, z: PLACES.pool.z - 6, count: 2, radius: 9 },
    { name: 'stones', x: PLACES.stones.x, y: 0, z: PLACES.stones.z, count: 2, radius: 6 },
    { name: 'ruin', x: PLACES.ruin.x + 3, y: 0, z: PLACES.ruin.z - 2, count: 2, radius: 7 },
    { name: 'road', x: 30, y: 0, z: -20, count: 1, radius: 4 },
    // The open ground between the road and the pool, and the deep woods either side of the valley.
    { name: 'plains', x: 34, y: 0, z: 26, count: 3, radius: 15 },
    { name: 'north woods', x: -44, y: 0, z: -22, count: 3, radius: 15 },
    { name: 'south woods', x: -22, y: 0, z: 78, count: 2, radius: 12 },
    { name: 'east woods', x: 84, y: 0, z: -4, count: 2, radius: 12 },
];

/** Clearings the woods leave alone. */
export const CLEARINGS = [
    { x: FARM.centre.x, z: FARM.centre.z, radius: 27 },
    { x: VILLAGE.center.x, z: VILLAGE.center.z, radius: 33 },
    { x: CHAPEL.x, z: CHAPEL.z, radius: 9 },
    { x: PLACES.pool.x, z: PLACES.pool.z, radius: PLACES.pool.radius + 4 },
    { x: PLACES.stones.x, z: PLACES.stones.z, radius: 10 },
    { x: PLACES.ruin.x, z: PLACES.ruin.z, radius: 10 },
    { x: PLACES.graveyard.x, z: PLACES.graveyard.z, radius: 10 },
    { x: PLACES.lookout.x, z: PLACES.lookout.z, radius: 7 },
];

/** Where Pell stands on the lookout: at the edge, looking out over the fog at the farm he used to have. */
export const PELL_SPOT = { x: PLACES.lookout.x + 1, z: PLACES.lookout.z + 3.4, yaw: Math.atan2(FARM.door.x - PLACES.lookout.x, FARM.door.z - PLACES.lookout.z) };

/**
 * The valley has no edge. Past this distance from the middle the fog closes in,
 * and whoever keeps walking comes out of it on the far side.
 */
export const WRAP_AT = WORLD_HALF - 8;

/** The doorstep of a village house: a few steps out towards the square, facing it. */
export function homeOf(house: number): { x: number; z: number; yaw: number } {
    const spot = VILLAGE.houses[house] as { x: number; z: number };
    const dx = VILLAGE.center.x - spot.x;
    const dz = VILLAGE.center.z - spot.z;
    const distance = Math.hypot(dx, dz);
    return { x: spot.x + (dx / distance) * 7, z: spot.z + (dz / distance) * 7, yaw: Math.atan2(dx, dz) };
}
