import * as THREE from 'three';

import { fitModel } from '../helpers/transform';
import { Random } from '../helpers/random';
import { CHAPEL, CLEARINGS, FARM, ROAD, VILLAGE, WORLD_HALF } from '../content/world';

/**
 * Builds Hollowmere: ground, road, buildings, woods, lamps and shrines.
 *
 * Models come from `static/models` through a manifest of target sizes. Each one
 * has a primitive stand-in, so a missing download never leaves a hole in the
 * world, it just leaves a box where a barn should be.
 */
type ModelEntry = { url: string; height?: number; length?: number; yaw?: number };

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
    /** Positions with a light, for the night mood to warm up. */
    lamps: THREE.PointLight[];
    /** Every solid collider the builder made, for enemy steering and debug. */
    solids: THREE.Box3[];
};

// Seeded, so the woods and the graves stand in the same places every visit.
const seeded = new Random(7);
const random = (): number => seeded.next();

/** Load a model sized by the manifest, or build the stand-in when it fails. */
async function model(game: Game, entry: ModelEntry, fallback: () => THREE.Object3D): Promise<THREE.Object3D> {
    try {
        const loaded = await game.assets.loadModel(entry.url);
        return fitModel(loaded, entry.height !== undefined ? { height: entry.height } : { length: entry.length ?? 1 }, entry.yaw ?? 0);
    } catch {
        return fallback();
    }
}

/** A solid box around an object, so the player and the Hollow walk around it. */
function solid(game: Game, object: THREE.Object3D, refs: WorldRefs, shrink = 0.85): void {
    object.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(object);
    const size = box.getSize(new THREE.Vector3());
    const centre = box.getCenter(new THREE.Vector3());
    game.physics.add({
        kind: 'fixed',
        shape: { type: 'box', size: { x: size.x * shrink, y: size.y, z: size.z * shrink } },
        position: centre,
        syncObject: false,
        tag: 'wall',
    });
    refs.solids.push(box);
}

function place(object: THREE.Object3D, at: { x: number; z: number; yaw?: number }, parent: THREE.Object3D): THREE.Object3D {
    object.position.set(at.x, 0, at.z);
    object.rotation.y = at.yaw ?? 0;
    parent.add(object);
    return object;
}

export async function buildWorld(game: Game): Promise<WorldRefs> {
    const refs: WorldRefs = { lamps: [], solids: [] };
    const root = new THREE.Group();
    root.name = 'hollowmere';
    game.scene.add(root);

    buildRoad(root);
    const woods = buildWoods(game, root);

    const tasks: Array<Promise<unknown>> = [];
    const add = (entry: ModelEntry, fallback: () => THREE.Object3D, at: { x: number; z: number; yaw?: number }, collide = true): void => {
        tasks.push(
            model(game, entry, fallback).then((object) => {
                place(object, at, root);
                if (collide) solid(game, object, refs);
            }),
        );
    };

    // The farm.
    add(MODELS.cottage, () => boxHouse(0x8a7a66, 0x4a3a32), FARM.house);
    add(MODELS.barn, () => boxHouse(0x6a3a2e, 0x3a2a24, 7), FARM.barn);
    add(MODELS.coop, () => boxHouse(0x8a6a4a, 0x4a3a2a, 2.5), FARM.coop);
    add(MODELS.well, () => stoneWell(), FARM.well);
    add(MODELS.hay, () => haystack(), { x: -33, z: 44 }, false);
    add(MODELS.cart, () => haystack(), { x: -44, z: 58, yaw: 0.6 }, true);
    penFence(game, root);

    // The village.
    add(MODELS.store, () => boxHouse(0x6a6050, 0x3a2e28, 9), VILLAGE.store);
    for (const house of VILLAGE.houses) {
        const entry = house.kind === 'a' ? MODELS.houseA : house.kind === 'b' ? MODELS.houseB : MODELS.houseC;
        add(entry, () => boxHouse(0x7a7064, 0x3a3030), house);
    }

    // Lamps: the farm porch, the chapel, the square and a few along the road.
    const lampSpots = [
        { x: FARM.door.x + 2, z: FARM.door.z - 3 },
        { x: -36, z: 44 },
        { x: CHAPEL.x + 2, z: CHAPEL.z + 2 },
        { x: VILLAGE.center.x + 6, z: VILLAGE.center.z + 6 },
        { x: VILLAGE.center.x - 6, z: VILLAGE.center.z - 6 },
        { x: VILLAGE.center.x + 6, z: VILLAGE.center.z - 6 },
        { x: -20, z: 26 },
        { x: 28, z: -20 },
    ];
    for (const spot of lampSpots) {
        add(MODELS.lantern, () => lampPost(), spot, false);
        const light = new THREE.PointLight(0xffb36b, 0, 14, 1.6);
        light.position.set(spot.x, 2.4, spot.z);
        root.add(light);
        refs.lamps.push(light);
    }

    root.add(chapel(CHAPEL));
    root.add(shrine(VILLAGE.center));
    solid(game, root.children[root.children.length - 2] as THREE.Object3D, refs, 0.6);

    // Graves: along the road near the chapel, and a crooked row behind the village.
    const graves = [
        ...[0, 1, 2, 3, 4].map((index) => ({ x: CHAPEL.x - 5 + index * 1.6, z: CHAPEL.z + 7 + (index % 2) * 0.6, yaw: (random() - 0.5) * 0.4 })),
        ...[0, 1, 2, 3, 4, 5].map((index) => ({ x: VILLAGE.center.x - 14 + index * 2, z: VILLAGE.center.z - 30 + (index % 3), yaw: (random() - 0.5) * 0.5 })),
    ];
    graves.forEach((spot, index) => add(index % 3 === 0 ? MODELS.graveDamaged : MODELS.grave, () => haystack(), spot, false));

    await Promise.all([...tasks, woods]);
    return refs;
}

//#region Ground and road

/** Mottled grass and mud, painted small so the PS1 picture keeps it chunky. */
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
            const mud = Math.sin(x * 0.11) * Math.cos(y * 0.09) + noise() * 0.6 > 0.7;
            const r = mud ? 64 + n * 14 : 58 + n * 22;
            const g = mud ? 56 + n * 10 : 66 + n * 24;
            const b = mud ? 44 + n * 8 : 46 + n * 12;
            context.fillStyle = `rgb(${r | 0},${g | 0},${b | 0})`;
            context.fillRect(x, y, 1, 1);
        }
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(60, 60);
    texture.magFilter = THREE.NearestFilter;
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
}

function buildRoad(root: THREE.Object3D): void {
    const material = new THREE.MeshStandardMaterial({ color: 0x4a3e32, roughness: 1, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    for (let index = 0; index < ROAD.length - 1; index += 1) {
        const a = ROAD[index] as { x: number; z: number };
        const b = ROAD[index + 1] as { x: number; z: number };
        const length = Math.hypot(b.x - a.x, b.z - a.z);
        // Overlap the joints so the road has no gaps at the bends.
        const segment = new THREE.Mesh(new THREE.PlaneGeometry(4.2, length + 4), material);
        segment.rotation.x = -Math.PI / 2;
        segment.rotation.z = -Math.atan2(b.x - a.x, b.z - a.z);
        segment.position.set((a.x + b.x) / 2, 0.02, (a.z + b.z) / 2);
        segment.receiveShadow = true;
        root.add(segment);
    }
}

/** Shortest distance from a point to the road, for keeping trees off it. */
export function distanceToRoad(x: number, z: number): number {
    let best = Infinity;
    for (let index = 0; index < ROAD.length - 1; index += 1) {
        const a = ROAD[index] as { x: number; z: number };
        const b = ROAD[index + 1] as { x: number; z: number };
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz)));
        best = Math.min(best, Math.hypot(x - (a.x + dx * t), z - (a.z + dz * t)));
    }
    return best;
}

//#endregion Ground and road

//#region Woods

async function buildWoods(game: Game, root: THREE.Object3D): Promise<void> {
    const bark = new THREE.MeshStandardMaterial({ color: 0x2e2824, roughness: 1, flatShading: true });
    // Three downloaded trees, each fitted once and then cloned: the clones share
    // geometry, so a hundred trees cost three models.
    const kinds = await Promise.all(
        [MODELS.treeBare, MODELS.treeLarge, MODELS.treeSmall].map((entry) => model(game, entry, () => deadTree(bark, entry.height ?? 8))),
    );
    let planted = 0;
    for (let attempt = 0; attempt < 900 && planted < 150; attempt += 1) {
        const x = (random() * 2 - 1) * (WORLD_HALF - 4);
        const z = (random() * 2 - 1) * (WORLD_HALF - 4);
        if (CLEARINGS.some((clearing) => Math.hypot(x - clearing.x, z - clearing.z) < clearing.radius)) continue;
        if (distanceToRoad(x, z) < 6) continue;
        // Mostly the downloaded kinds, with a few procedural ones mixed in for variety.
        const kind = kinds[Math.floor(random() * kinds.length)] as THREE.Object3D;
        const tree = random() < 0.25 ? deadTree(bark, 5 + random() * 7) : kind.clone();
        tree.position.set(x, 0, z);
        tree.rotation.y = random() * Math.PI * 2;
        tree.scale.setScalar(0.8 + random() * 0.5);
        root.add(tree);
        game.physics.add({ kind: 'fixed', shape: { type: 'cylinder', radius: 0.45, height: 4 }, position: new THREE.Vector3(x, 2, z), syncObject: false, tag: 'wall' });
        planted += 1;
    }
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

function boxHouse(wall: number, roof: number, width = 8): THREE.Object3D {
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

function haystack(): THREE.Object3D {
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
function chapel(at: { x: number; z: number; yaw: number }): THREE.Object3D {
    const group = boxHouse(0x3e3a34, 0x1e1c1a, 4);
    group.position.set(at.x, 0, at.z);
    group.rotation.y = at.yaw;
    const glow = new THREE.MeshStandardMaterial({ color: 0xffd8a0, emissive: 0xffa040, emissiveIntensity: 2.5 });
    const window = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.8, 0.05), glow);
    window.position.set(0, 1.9, 1.52);
    const candle = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.3, 0.12), glow);
    candle.position.set(0.6, 0.15, 1.9);
    group.add(window, candle);
    return group;
}

/** The village shrine: a dark stone with offerings round its foot. */
function shrine(at: { x: number; z: number }): THREE.Object3D {
    const group = new THREE.Group();
    group.position.set(at.x, 0, at.z);
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

function railFence(length: number): THREE.Object3D {
    const group = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 1 });
    for (const y of [0.45, 0.9]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(length, 0.1, 0.06), wood);
        rail.position.y = y;
        group.add(rail);
    }
    return group;
}

//#endregion Stand-ins and small builds
