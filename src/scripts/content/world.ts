/**
 * Where everything is. The map is a square of `WORLD_HALF` meters each way:
 * the farm in the south west, the village in the north east, one road between
 * them with a lit chapel halfway, and dead woods everywhere else.
 */
export const WORLD_HALF = 120;

export const FARM = {
    house: { x: -64, z: 54, yaw: Math.PI / 2 },
    /** Where the player wakes, in front of the door. */
    door: { x: -58, z: 54 },
    field: { x: -54, z: 34, columns: 6, rows: 4 },
    pen: { center: { x: -36, z: 52 }, halfSize: { x: 6, z: 5 } },
    coop: { x: -36, z: 60, yaw: Math.PI },
    barn: { x: -30, z: 38, yaw: -Math.PI / 2 },
    well: { x: -52, z: 50 },
    bike: { x: -50, z: 56, yaw: Math.PI / 2 },
    shipping: { x: -47, z: 44 },
};

export const VILLAGE = {
    center: { x: 52, z: -40 },
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

/** Monsters will not enter these, and lose interest in anyone inside. */
export const SAFE_ZONES = [
    { position: { x: FARM.door.x, y: 0, z: FARM.door.z }, radius: 7, name: 'Home' },
    { position: { x: CHAPEL.x, y: 0, z: CHAPEL.z }, radius: 6, name: 'Wayside chapel' },
    { position: { x: VILLAGE.center.x, y: 0, z: VILLAGE.center.z }, radius: 11, name: 'Village shrine' },
    { position: { x: -36, y: 0, z: 44 }, radius: 4, name: 'Barn lamp' },
];

/** Clearings the woods leave alone. */
export const CLEARINGS = [
    { x: -48, z: 46, radius: 26 },
    { x: VILLAGE.center.x, z: VILLAGE.center.z, radius: 32 },
    { x: CHAPEL.x, z: CHAPEL.z, radius: 9 },
];
