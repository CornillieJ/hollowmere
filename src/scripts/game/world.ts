import * as THREE from 'three';

import { fitModel } from '../helpers/transform';
import { Random } from '../helpers/random';
import { buildPlaces, type PlaceSpots } from './places';
import { modelled } from './models';
import { addTerrain, type Terrain } from '../kit';
import { CHAPEL, CLEARINGS, FARM, FLATS, POOL_LEVEL, PLACES, VILLAGE, WORLD_HALF, distanceToPath, distanceToRoad, naturalHeight } from '../content/world';
import { createNoise2D } from '../helpers/noise';

/**
 * Builds Hollowveil: the valley, the road, buildings, woods, lamps, the village
 * wall and the places off the road.
 *
 * Models come from `static/models` through a manifest of target sizes. Each one
 * has a primitive stand-in, so a missing download never leaves a hole in the
 * world, it just leaves a box where a barn should be.
 */
export type ModelEntry = { url: string; height?: number; length?: number; yaw?: number };

export const MODELS = {
    cottage: { url: 'models/buildings/cottage.glb', length: 9 },
    houseA: { url: 'models/buildings/house_a.glb', length: 9 },
    houseB: { url: 'models/buildings/house_b.glb', length: 9 },
    houseC: { url: 'models/buildings/house_c.glb', length: 10 },
    store: { url: 'models/buildings/store.glb', length: 11 },
    barn: { url: 'models/buildings/barn.glb', length: 9 },
    coop: { url: 'models/buildings/chicken_coop.glb', length: 3 },
    well: { url: 'models/props/well.glb', height: 2.6 },
    fence: { url: 'models/props/fence.glb', length: 4 },
    lantern: { url: 'models/props/post_lantern.glb', height: 2.8 },
    hay: { url: 'models/props/hay.glb', length: 1.6 },
    cart: { url: 'models/props/cart.glb', length: 3 },
    grave: { url: 'models/props/grave.glb', height: 1.1 },
    graveDamaged: { url: 'models/props/grave_damaged.glb', height: 1 },
    treeBare: { url: 'models/nature/dead_tree_bare.glb', height: 9 },
    treeLarge: { url: 'models/nature/dead_tree_large_kay.glb', height: 11 },
    treeSmall: { url: 'models/nature/dead_tree_small_kay.glb', height: 6 },
} satisfies Record<string, ModelEntry>;

export type WorldRefs = {
    terrain: Terrain;
    /** Positions with a light, for the night mood to warm up. */
    lamps: THREE.PointLight[];
    /** Every solid collider the builder made, for enemy steering and debug. */
    solids: THREE.Box3[];
    /** Standing trees, for the axe. */
    trees: THREE.Object3D[];
    /** Things to walk up to, placed by the builder and wired up by the game. */
    spots: PlaceSpots & { hearth: THREE.Object3D; workbench: THREE.Object3D };
};

// Seeded, so the woods and the graves stand in the same places every visit.
const seeded = new Random(7);
const random = (): number => seeded.next();
let terrain: Terrain;

/** Load a model sized by the manifest, or build the stand-in when it fails. */
export async function model(game: Game, entry: ModelEntry, fallback: () => THREE.Object3D): Promise<THREE.Object3D> {
    try {
        const loaded = await game.assets.loadModel(entry.url);
        return fitModel(loaded, entry.height !== undefined ? { height: entry.height } : { length: entry.length ?? 1 }, entry.yaw ?? 0);
    } catch {
        return fallback();
    }
}

/** The band of height that is in the way of somebody walking: over a doorstep, under the eaves. */
const KNEE = 0.45;
const HEAD = 1.5;
const CORNERS = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()] as const;
const CORNER = new THREE.Vector3();
const UPRIGHT = new THREE.Vector3(0, 1, 0);

/**
 * The box a walker bumps into: every face of the object that passes through
 * the band between knee and head, measured with the object's turn taken off.
 * Eaves, awnings and the crown of a roof hang over ground that can be walked
 * on, and steps and porch boards lie under the feet, so both are left out.
 */
function footprint(object: THREE.Object3D): THREE.Box3 {
    const yaw = object.rotation.y;
    object.rotation.y = 0;
    object.updateMatrixWorld(true);
    const whole = new THREE.Box3().setFromObject(object);
    const band = new THREE.Box3();
    // Something lower than the band is all in the way, e.g. a trough.
    const floor = whole.min.y + Math.min(KNEE, (whole.max.y - whole.min.y) * 0.4);
    const ceiling = whole.min.y + HEAD;
    object.traverse((child) => {
        const mesh = child as THREE.Mesh;
        const positions = mesh.isMesh ? mesh.geometry?.getAttribute('position') : undefined;
        if (!positions || mesh.userData.billboard) return;
        const index = mesh.geometry.getIndex();
        const count = index ? index.count : positions.count;
        for (let face = 0; face + 2 < count; face += 3) {
            let low = Infinity;
            let high = -Infinity;
            for (let corner = 0; corner < 3; corner += 1) {
                const point = CORNERS[corner] as THREE.Vector3;
                point.fromBufferAttribute(positions, index ? index.getX(face + corner) : face + corner).applyMatrix4(mesh.matrixWorld);
                low = Math.min(low, point.y);
                high = Math.max(high, point.y);
            }
            if (high < floor || low > ceiling) continue;
            for (const point of CORNERS) band.expandByPoint(point);
        }
    });
    object.rotation.y = yaw;
    object.updateMatrixWorld(true);
    if (band.isEmpty()) return whole;
    // As tall as the whole thing: nobody is meant to get onto a roof by its eaves.
    band.min.y = whole.min.y;
    band.max.y = whole.max.y;
    return band;
}

/**
 * A solid box around an object, so the player and the Hollow walk around it.
 * It turns with the object, and is measured again when a stand-in is swapped
 * for its model, which is rarely the same size.
 */
export function solid(game: Game, object: THREE.Object3D, refs: { solids: THREE.Box3[] }, shrink = 0.97): void {
    const outline = new THREE.Box3();
    refs.solids.push(outline);
    let body: ReturnType<Game['physics']['add']> | undefined;
    const build = (): void => {
        if (body) game.physics.remove(body);
        const yaw = object.rotation.y;
        const box = footprint(object);
        const size = box.getSize(new THREE.Vector3());
        const origin = object.getWorldPosition(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3()).sub(origin).applyAxisAngle(UPRIGHT, yaw).add(origin);
        body = game.physics.add({ kind: 'fixed', shape: { type: 'box', size: { x: size.x * shrink, y: size.y, z: size.z * shrink } }, position: center, rotation: new THREE.Euler(0, yaw, 0), object, syncObject: false, tag: 'wall' });
        // What the Hollow steer round: the upright box that holds the turned one.
        outline.makeEmpty();
        for (const [x, z] of [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const) {
            CORNER.set((x * size.x * shrink) / 2, 0, (z * size.z * shrink) / 2).applyAxisAngle(UPRIGHT, yaw).add(center);
            outline.expandByPoint(CORNER.clone().setY(box.min.y));
            outline.expandByPoint(CORNER.clone().setY(box.max.y));
        }
    };
    build();
    object.addEventListener('modelled' as never, build);
}

/** Stand an object on the ground at a spot. */
export function place<T extends THREE.Object3D>(object: T, at: { x: number; z: number; yaw?: number }, parent: THREE.Object3D): T {
    terrain.place(object, at.x, at.z);
    object.rotation.y = at.yaw ?? 0;
    parent.add(object);
    return object;
}

export async function buildWorld(game: Game): Promise<WorldRefs> {
    terrain = addTerrain(game, {
        size: WORLD_HALF * 2 + 10,
        segments: 166,
        height: naturalHeight,
        flats: FLATS,
        color: paint,
        texture: groundTexture(),
        textureRepeat: 64,
    });
    const root = new THREE.Group();
    root.name = 'hollowveil';
    game.scene.add(root);
    const solids: THREE.Box3[] = [];
    const lamps: THREE.PointLight[] = [];

    const tasks: Array<Promise<unknown>> = [];
    const add = (entry: ModelEntry, fallback: () => THREE.Object3D, at: { x: number; z: number; yaw?: number }, collide = true): void => {
        tasks.push(
            model(game, entry, fallback).then((object) => {
                place(object, at, root);
                if (collide) solid(game, object, { solids });
            }),
        );
    };
    const lamp = (spot: { x: number; z: number }): void => {
        add(MODELS.lantern, () => lampPost(), spot, false);
        const light = new THREE.PointLight(0xffb36b, 0, 14, 1.6);
        terrain.place(light, spot.x, spot.z, 2.4);
        root.add(light);
        lamps.push(light);
    };

    // The farm.
    solid(game, place(modelled(game, 'farmhouse', boxHouse(0x8a7a66, 0x4a3a32, 6.5)), FARM.house, root), { solids });
    add(MODELS.barn, () => boxHouse(0x6a3a2e, 0x3a2a24, 7), FARM.barn);
    add(MODELS.coop, () => boxHouse(0x8a6a4a, 0x4a3a2a, 2.5), FARM.coop);
    add(MODELS.well, () => stoneWell(), FARM.well);
    add(MODELS.hay, () => haystack(), { x: -38.6, z: 41.6 }, false);
    add(MODELS.cart, () => haystack(), { x: -44, z: 58, yaw: 0.6 }, true);
    penFence(game, root);
    const hearth = place(modelled(game, 'hearth', buildHearth()), FARM.hearth, root);
    solid(game, hearth, { solids });
    const workbench = place(modelled(game, 'workbench', buildWorkbench()), { ...FARM.workbench, yaw: Math.PI / 2 }, root);
    solid(game, workbench, { solids });
    const fire = new THREE.PointLight(0xff8a3a, 6, 9, 1.6);
    fire.position.set(FARM.hearth.x, 0.9, FARM.hearth.z);
    root.add(fire);

    // The village.
    add(MODELS.store, () => boxHouse(0x6a6050, 0x3a2e28, 9), VILLAGE.store);
    for (const house of VILLAGE.houses) {
        const entry = house.kind === 'a' ? MODELS.houseA : house.kind === 'b' ? MODELS.houseB : MODELS.houseC;
        add(entry, () => boxHouse(0x7a7064, 0x3a3030), house);
    }
    villageWall(game, root);

    // Lamps: the farm porch, the chapel, the square, the gate and a few along the road.
    for (const spot of [
        { x: FARM.door.x + 2, z: FARM.door.z - 3 },
        { x: -36, z: 44 },
        { x: CHAPEL.x + 2, z: CHAPEL.z + 2 },
        { x: VILLAGE.center.x + 6, z: VILLAGE.center.z + 6 },
        { x: VILLAGE.center.x - 6, z: VILLAGE.center.z - 6 },
        { x: VILLAGE.center.x + 6, z: VILLAGE.center.z - 6 },
        { x: -20, z: 26 },
        { x: 27, z: -19 },
        { x: PLACES.lookout.x + 1.5, z: PLACES.lookout.z + 1.5 },
    ]) {
        lamp(spot);
    }

    const chapelHut = place(modelled(game, 'chapel', chapel()), CHAPEL, root);
    solid(game, chapelHut, { solids });
    solid(game, place(modelled(game, 'shrine', shrine()), VILLAGE.center, root), { solids });

    const trees = buildWoods(game, root);
    const spots = buildPlaces(game, { root, terrain, solids, add, random });

    await Promise.all([...tasks, trees.loaded]);
    return { terrain, lamps, solids, trees: trees.objects, spots: { ...spots, hearth, workbench } };
}

//#region Ground

const tint = createNoise2D(5);
const GRASS = new THREE.Color(0x66704f);
const DRY = new THREE.Color(0x77745a);
const MUD = new THREE.Color(0x4a4236);
const ROCK = new THREE.Color(0x56534e);
const ROAD_DIRT = new THREE.Color(0x6a5640);
const COBBLE = new THREE.Color(0x8b8780);
const YARD = new THREE.Color(0x7a6a4c);
const RUTS = new THREE.Color(0x3a2c1e);
const SHORE = new THREE.Color(0x2c302a);
const scratch = new THREE.Color();

/**
 * The ground's colour, which is most of the level design: pale cobbles mean
 * village, packed earth means farm, the brown line is the way between them, and
 * the thin ones lead somewhere worth going.
 */
function paint(x: number, z: number, height: number, slope: number): THREE.Color {
    const patch = tint(x / 9, z / 9);
    scratch.copy(GRASS).lerp(DRY, THREE.MathUtils.clamp(height / 14 + patch * 0.25, 0, 1));
    if (patch < -0.35) scratch.lerp(MUD, 0.6);
    scratch.lerp(ROCK, THREE.MathUtils.smoothstep(slope, 0.1, 0.3));
    scratch.lerp(SHORE, 1 - THREE.MathUtils.smoothstep(height, POOL_LEVEL - 0.2, POOL_LEVEL + 1.6));

    const yard = Math.hypot(x - FARM.centre.x, z - FARM.centre.z);
    scratch.lerp(YARD, (1 - THREE.MathUtils.smoothstep(yard, 21, 26)) * 0.8);
    scratch.lerp(ROAD_DIRT, (1 - THREE.MathUtils.smoothstep(distanceToPath(x, z), 0.9, 2)) * 0.85);
    const road = distanceToRoad(x, z);
    scratch.lerp(ROAD_DIRT, 1 - THREE.MathUtils.smoothstep(road, 2.2, 3.4));
    // On the yard's packed earth the road would be lost: worn darker there, so the way out reads from the field.
    scratch.lerp(RUTS, (1 - THREE.MathUtils.smoothstep(road, 2, 3.2)) * (1 - THREE.MathUtils.smoothstep(yard, 30, 44)));
    // Cobbles last: inside the wall the ground is plainly not the wild.
    const village = Math.hypot(x - VILLAGE.center.x, z - VILLAGE.center.z);
    scratch.lerp(COBBLE, 1 - THREE.MathUtils.smoothstep(village, VILLAGE.wallRadius - 2.5, VILLAGE.wallRadius - 0.5));
    return scratch;
}

/** Mottled light grey, painted small so the PS1 picture keeps it chunky. The terrain's vertex colours tint it. */
export function groundTexture(): THREE.CanvasTexture {
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext('2d') as CanvasRenderingContext2D;
    const noiseSource = new Random(3);
    const noise = (): number => noiseSource.next();
    for (let y = 0; y < size; y += 1) {
        for (let x = 0; x < size; x += 1) {
            const n = noise();
            const dark = Math.sin(x * 0.11) * Math.cos(y * 0.09) + noise() * 0.6 > 0.7;
            const value = (dark ? 170 : 205) + n * 50;
            context.fillStyle = `rgb(${value | 0},${value | 0},${value | 0})`;
            context.fillRect(x, y, 1, 1);
        }
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.magFilter = THREE.NearestFilter;
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
}

/** A low stone wall round the village, open where the road and the graveyard path come in. */
function villageWall(game: Game, root: THREE.Object3D): void {
    const stone = new THREE.MeshStandardMaterial({ color: 0x6f6b64, roughness: 1, flatShading: true });
    const { center, wallRadius } = VILLAGE;
    const pieces = 54;
    const length = (Math.PI * 2 * wallRadius) / pieces;
    // Gaps face the road from the farm and the path to the graves.
    const gaps = [Math.atan2(38 - center.x, -30 - center.z), Math.atan2(56 - center.x, -66 - center.z)];
    const posts: Array<{ x: number; z: number }> = [];
    for (let index = 0; index < pieces; index += 1) {
        const angle = (index / pieces) * Math.PI * 2;
        const gapDistance = Math.min(...gaps.map((gap) => Math.abs(Math.atan2(Math.sin(angle - gap), Math.cos(angle - gap)))));
        const x = center.x + Math.sin(angle) * wallRadius;
        const z = center.z + Math.cos(angle) * wallRadius;
        if (gapDistance < 0.11) continue;
        if (gapDistance < 0.2) posts.push({ x, z });
        const height = 0.8 + random() * 0.35;
        const piece = new THREE.Mesh(new THREE.BoxGeometry(length + 0.15, height, 0.55), stone);
        terrain.place(piece, x, z, height / 2 - 0.1);
        piece.rotation.y = angle + Math.PI / 2;
        piece.castShadow = true;
        root.add(piece);
        game.physics.add({ kind: 'fixed', shape: { type: 'box', size: { x: length + 0.15, y: 1.6, z: 0.55 } }, position: piece.position, rotation: piece.rotation, syncObject: false, tag: 'wall' });
    }
    // Tall posts with a lit lantern either side of each way in.
    const glow = new THREE.MeshStandardMaterial({ color: 0xffc070, emissive: 0xffa040, emissiveIntensity: 2 });
    for (const spot of posts) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.6, 2.6, 0.6), stone);
        terrain.place(post, spot.x, spot.z, 1.3);
        const light = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), glow);
        light.position.y = 1.5;
        post.add(light);
        root.add(post);
    }
}

//#endregion Ground

//#region Woods

function buildWoods(game: Game, root: THREE.Object3D): { objects: THREE.Object3D[]; loaded: Promise<void> } {
    const bark = new THREE.MeshStandardMaterial({ color: 0x2e2824, roughness: 1, flatShading: true });
    const spots = [
        ...FARM.orchard.map((spot) => terrain.point(spot.x, spot.z)),
        ...terrain.scatter(
            170,
            random,
            (x, z, _height, slope) =>
                slope < 0.12 && Math.max(Math.abs(x), Math.abs(z)) < WORLD_HALF - 3 && distanceToRoad(x, z) > 6 && distanceToPath(x, z) > 3 && !CLEARINGS.some((clearing) => Math.hypot(x - clearing.x, z - clearing.z) < clearing.radius),
        ),
    ];
    // Each tree is a holder placed now, so the axe has its targets before the models arrive.
    const objects = spots.map((spot) => {
        const holder = new THREE.Group();
        holder.position.copy(spot);
        holder.rotation.y = random() * Math.PI * 2;
        holder.scale.setScalar(0.8 + random() * 0.5);
        root.add(holder);
        return holder;
    });
    // Three downloaded trees, each fitted once and then cloned: the clones share
    // geometry, so the whole wood costs three models.
    const loaded = Promise.all([MODELS.treeBare, MODELS.treeLarge, MODELS.treeSmall].map((entry) => model(game, entry, () => deadTree(bark, entry.height ?? 8)))).then((kinds) => {
        for (const holder of objects) {
            const kind = kinds[Math.floor(random() * kinds.length)] as THREE.Object3D;
            holder.add(random() < 0.25 ? deadTree(bark, 5 + random() * 7) : kind.clone());
        }
    });
    return { objects, loaded };
}

/** What a felled tree leaves behind. */
export function stump(): THREE.Object3D {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.42, 0.5, 6), new THREE.MeshStandardMaterial({ color: 0x3a3028, roughness: 1, flatShading: true }));
    mesh.geometry.translate(0, 0.25, 0);
    return mesh;
}

/** A bare, crooked tree: a leaning trunk and a few forked branches. */
function deadTree(material: THREE.Material, height: number): THREE.Object3D {
    const tree = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.38, height, 5), material);
    trunk.position.y = height / 2;
    trunk.rotation.z = (random() - 0.5) * 0.2;
    trunk.castShadow = true;
    tree.add(trunk);
    const branches = 3 + Math.floor(random() * 4);
    for (let index = 0; index < branches; index += 1) {
        const length = height * (0.25 + random() * 0.3);
        const branch = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.1, length, 4), material);
        const pivot = new THREE.Group();
        pivot.position.y = height * (0.45 + random() * 0.5);
        pivot.rotation.y = random() * Math.PI * 2;
        pivot.rotation.z = 0.6 + random() * 0.6;
        branch.position.y = length / 2;
        branch.castShadow = true;
        pivot.add(branch);
        tree.add(pivot);
    }
    return tree;
}

//#endregion Woods

//#region Stand-ins and small builds

export function boxHouse(wall: number, roof: number, width = 8): THREE.Object3D {
    const group = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(width, 3.4, width * 0.75), new THREE.MeshStandardMaterial({ color: wall, roughness: 1, flatShading: true }));
    body.position.y = 1.7;
    const cap = new THREE.Mesh(new THREE.ConeGeometry(width * 0.72, 2.4, 4), new THREE.MeshStandardMaterial({ color: roof, roughness: 1, flatShading: true }));
    cap.position.y = 4.6;
    cap.rotation.y = Math.PI / 4;
    for (const mesh of [body, cap]) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        group.add(mesh);
    }
    return group;
}

function stoneWell(): THREE.Object3D {
    const group = new THREE.Group();
    const stone = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1, 0.9, 8, 1, true), new THREE.MeshStandardMaterial({ color: 0x6a6660, roughness: 1, side: THREE.DoubleSide, flatShading: true }));
    stone.position.y = 0.45;
    group.add(stone);
    return group;
}

export function haystack(): THREE.Object3D {
    const hay = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.9, 0.9), new THREE.MeshStandardMaterial({ color: 0x9a8a52, roughness: 1 }));
    hay.position.y = 0.45;
    return hay;
}

function lampPost(): THREE.Object3D {
    const group = new THREE.Group();
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.14, 2.6, 0.14), new THREE.MeshStandardMaterial({ color: 0x2a2420 }));
    post.position.y = 1.3;
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.36, 0.3), new THREE.MeshStandardMaterial({ color: 0xffc070, emissive: 0xffa040, emissiveIntensity: 2 }));
    lamp.position.y = 2.5;
    group.add(post, lamp);
    return group;
}

/** The wayside chapel: a dark stone hut with a lit window and a candle that never goes out. */
function chapel(): THREE.Object3D {
    const group = boxHouse(0x3e3a34, 0x1e1c1a, 4);
    const glow = new THREE.MeshStandardMaterial({ color: 0xffd8a0, emissive: 0xffa040, emissiveIntensity: 2.5 });
    const window = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.8, 0.05), glow);
    window.position.set(0, 1.9, 1.52);
    const candle = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.3, 0.12), glow);
    candle.position.set(0.6, 0.15, 1.9);
    group.add(window, candle);
    return group;
}

/** The village shrine: a dark stone with offerings round its foot. */
function shrine(): THREE.Object3D {
    const group = new THREE.Group();
    const stone = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.8, 3.2, 5), new THREE.MeshStandardMaterial({ color: 0x3a3836, roughness: 1, flatShading: true }));
    stone.position.y = 1.6;
    stone.castShadow = true;
    group.add(stone);
    for (let index = 0; index < 6; index += 1) {
        const angle = (index / 6) * Math.PI * 2;
        const candle = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.22 + (index % 3) * 0.08, 0.1), new THREE.MeshStandardMaterial({ color: 0xfff2d0, emissive: 0xffc070, emissiveIntensity: 3 }));
        candle.position.set(Math.cos(angle) * 1.1, 0.15, Math.sin(angle) * 1.1);
        group.add(candle);
    }
    return group;
}

/** A fence round the animal pen, in the downloaded fence model when there is one. */
function penFence(game: Game, root: THREE.Object3D): void {
    const { center, halfSize } = FARM.pen;
    const sides: Array<{ x: number; z: number; yaw: number; length: number }> = [
        { x: center.x, z: center.z - halfSize.z, yaw: 0, length: halfSize.x * 2 },
        { x: center.x, z: center.z + halfSize.z, yaw: 0, length: halfSize.x * 2 },
        { x: center.x - halfSize.x, z: center.z, yaw: Math.PI / 2, length: halfSize.z * 2 },
        // The east side has a gap for a gate.
        { x: center.x + halfSize.x, z: center.z - halfSize.z * 0.55, yaw: Math.PI / 2, length: halfSize.z * 0.9 },
    ];
    for (const side of sides) {
        const pieces = Math.max(1, Math.round(side.length / 4));
        for (let index = 0; index < pieces; index += 1) {
            const offset = (index - (pieces - 1) / 2) * (side.length / pieces);
            const x = side.x + Math.cos(side.yaw) * offset;
            const z = side.z - Math.sin(side.yaw) * offset;
            void model(game, MODELS.fence, () => railFence(side.length / pieces)).then((fence) => place(fence, { x, z, yaw: side.yaw }, root));
        }
        game.physics.add({
            kind: 'fixed',
            shape: { type: 'box', size: { x: side.length, y: 1.2, z: 0.2 } },
            position: new THREE.Vector3(side.x, 0.6, side.z),
            rotation: new THREE.Euler(0, side.yaw, 0),
            syncObject: false,
            tag: 'wall',
        });
    }
}

export function railFence(length: number): THREE.Object3D {
    const group = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 1 });
    for (const y of [0.45, 0.9]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(length, 0.1, 0.06), wood);
        rail.position.y = y;
        group.add(rail);
    }
    return group;
}

/** The hearth by the farmhouse: a ring of stones, a fire, and the pot over it. */
function buildHearth(): THREE.Object3D {
    const group = new THREE.Group();
    const stone = new THREE.MeshStandardMaterial({ color: 0x5c5852, roughness: 1, flatShading: true });
    for (let index = 0; index < 8; index += 1) {
        const angle = (index / 8) * Math.PI * 2;
        const rock = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.26, 0.3), stone);
        rock.position.set(Math.cos(angle) * 0.62, 0.13, Math.sin(angle) * 0.62);
        rock.rotation.y = -angle;
        group.add(rock);
    }
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.6, 5), new THREE.MeshStandardMaterial({ color: 0xffb040, emissive: 0xff7a20, emissiveIntensity: 3 }));
    flame.position.y = 0.36;
    flame.name = 'flame';
    const iron = new THREE.MeshStandardMaterial({ color: 0x1c1b1a, roughness: 0.8, flatShading: true });
    for (let index = 0; index < 3; index += 1) {
        const angle = (index / 3) * Math.PI * 2;
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.9, 4), iron);
        leg.position.set(Math.cos(angle) * 0.42, 0.9, Math.sin(angle) * 0.42);
        leg.rotation.set(Math.sin(angle) * 0.42, 0, -Math.cos(angle) * 0.42);
        group.add(leg);
    }
    const pot = new THREE.Mesh(new THREE.SphereGeometry(0.36, 7, 5, 0, Math.PI * 2, Math.PI * 0.32, Math.PI * 0.68), iron);
    pot.position.y = 1;
    pot.name = 'pot';
    group.add(flame, pot);
    return group;
}

/** A rough bench with a vice and a saw, for turning wood into fences. */
function buildWorkbench(): THREE.Object3D {
    const group = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 1, flatShading: true });
    const top = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.12, 0.8), wood);
    top.position.y = 0.85;
    group.add(top);
    for (const x of [-0.8, 0.8]) {
        for (const z of [-0.32, 0.32]) {
            const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.85, 0.1), wood);
            leg.position.set(x, 0.42, z);
            group.add(leg);
        }
    }
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.9, 6), new THREE.MeshStandardMaterial({ color: 0x3a3028, roughness: 1 }));
    log.rotation.z = Math.PI / 2;
    log.position.set(0.2, 1.03, 0);
    group.add(log);
    return group;
}

//#endregion Stand-ins and small builds
