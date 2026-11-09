import * as THREE from 'three';

import * as CONSTANTS from '../Constants/Constants';
import { tag as tagObject } from './object';
import { GROUP } from '../physics/layers';

/**
 * Grey-box level building.
 *
 * These create a mesh and, when asked, the matching static or dynamic collider
 * in one call. Good enough for prototypes, and the materials are shared per
 * colour so a hundred blockout boxes are still cheap.
 */
export type BuildOptions = {
    /** Full size of the box in meters. */
    size?: THREE.Vector3 | Vec3;
    position?: THREE.Vector3 | Vec3;
    rotation?: THREE.Euler | Vec3;
    color?: THREE.ColorRepresentation;
    /** `'fixed'` (default) creates an immovable collider, `'dynamic'` makes it fall, `'none'` skips physics. */
    physics?: 'fixed' | 'dynamic' | 'none';
    /** Group the object is added to instead of the scene. */
    parent?: THREE.Object3D;
    /** Grouping tag, e.g. 'wall' or 'platform'. */
    tag?: string;
    receiveShadow?: boolean;
    castShadow?: boolean;
    /** Reuse an existing material instead of the shared colour material. */
    material?: THREE.Material;
    roughness?: number;
    metalness?: number;
};

type Builder = {
    game: Game;
    scene: THREE.Object3D;
};

export class BlockBuilder {
    /** Where new blocks go: the scene by default, or the parent given to the constructor. */
    readonly scene: THREE.Object3D;
    /** Registry keyed by tag, so a level can be torn down in one call. */
    readonly groups = new Map<string, THREE.Group>();
    readonly sharedMaterials = new Map<string, THREE.MeshStandardMaterial>();

    private readonly game: Game;
    private readonly sources: THREE.Object3D[];
    private readonly geometries: THREE.BufferGeometry[] = [];

    constructor(game: Game, parent?: THREE.Object3D) {
        this.game = game;
        this.scene = parent ?? game.scene;
        this.sources = [this.scene];
    }

    /** The first parent, used as the default destination for new blocks. */
    private builder(): Builder {
        return { game: this.game, scene: this.sources[0] as THREE.Object3D };
    }

    /** Add a box. */
    box(options: BuildOptions = {}): THREE.Mesh {
        const size = options.size ?? { x: 1, y: 1, z: 1 };
        const geometry = new THREE.BoxGeometry(size.x, size.y, size.z);
        this.geometries.push(geometry);
        return this.finish(new THREE.Mesh(geometry, this.materialFor(options)), options, { type: 'box', size });
    }

    /** Add a sphere. */
    sphere(radius = 0.5, options: BuildOptions = {}): THREE.Mesh {
        const geometry = new THREE.SphereGeometry(radius, 20, 14);
        this.geometries.push(geometry);
        return this.finish(new THREE.Mesh(geometry, this.materialFor(options)), options, { type: 'sphere', radius });
    }

    /** Add an upright cylinder. */
    cylinder(radius = 0.5, height = 2, options: BuildOptions = {}): THREE.Mesh {
        const geometry = new THREE.CylinderGeometry(radius, radius, height, 20);
        this.geometries.push(geometry);
        return this.finish(new THREE.Mesh(geometry, this.materialFor(options)), options, { type: 'cylinder', radius, height });
    }

    /** Add a flat platform with a collider. */
    platform(size: number | { x: number; z: number }, y: number, thickness = 0.5, options: BuildOptions = {}): THREE.Mesh {
        const full = typeof size === 'number' ? { x: size, y: thickness, z: size } : { x: size.x, y: thickness, z: size.z };
        return this.box({ ...options, size: full, position: { x: options.position?.x ?? 0, y, z: options.position?.z ?? 0 } });
    }

    /** Add a ring of walls around a square area. */
    walls(areaSize: number, height = 4, thickness = 0.6, options: BuildOptions = {}): THREE.Mesh[] {
        const half = areaSize / 2;
        const positions: Array<{ x: number; z: number }> = [
            { x: 0, z: -half },
            { x: 0, z: half },
            { x: -half, z: 0 },
            { x: half, z: 0 },
        ];
        return positions.map((position, index) => {
            const size = index < 2 ? { x: areaSize + thickness, y: height, z: thickness } : { x: thickness, y: height, z: areaSize + thickness };
            return this.box({ ...options, size, position: { x: position.x, y: height / 2, z: position.z }, tag: options.tag ?? 'wall' });
        });
    }

    /** Add a straight flight of steps, e.g. up to a ledge. */
    stairs(steps: number, width: number, rise = 0.25, run = 0.4, options: BuildOptions = {}): THREE.Mesh[] {
        const created: THREE.Mesh[] = [];
        for (let index = 0; index < steps; index += 1) {
            const height = rise * (index + 1);
            created.push(
                this.box({
                    ...options,
                    size: { x: width, y: height, z: run },
                    position: { x: options.position?.x ?? 0, y: height / 2 + (options.position?.y ?? 0), z: (options.position?.z ?? 0) + index * run },
                    tag: options.tag ?? 'stair',
                }),
            );
        }
        return created;
    }

    /** Scatter random boxes inside a square area, to break up an open floor. */
    scatter(
        count: number,
        areaSize: number,
        options: BuildOptions & {
            minSize?: number;
            maxSize?: number;
            /** Keep this area clear, e.g. so the player never spawns inside a box. */
            avoid?: { position: THREE.Vector3 | Vec3; radius: number };
            onCreated?: (mesh: THREE.Mesh, index: number) => void;
        } = {},
    ): THREE.Mesh[] {
        const created: THREE.Mesh[] = [];
        const min = options.minSize ?? 0.8;
        const max = options.maxSize ?? 2.4;
        const avoidRadius = options.avoid?.radius ?? 0;
        const avoidPosition = options.avoid?.position;

        for (let index = 0; index < count; index += 1) {
            const size = { x: min + Math.random() * (max - min), y: min + Math.random() * (max - min), z: min + Math.random() * (max - min) };
            const half = areaSize / 2 - Math.max(size.x, size.z);

            let position = { x: 0, y: size.y / 2, z: 0 };
            for (let attempt = 0; attempt < 12; attempt += 1) {
                position = { x: (Math.random() * 2 - 1) * half, y: size.y / 2, z: (Math.random() * 2 - 1) * half };
                if (!avoidPosition) break;
                const dx = position.x - avoidPosition.x;
                const dz = position.z - avoidPosition.z;
                if (Math.hypot(dx, dz) >= avoidRadius) break;
            }

            const mesh = this.box({ ...options, size, position, rotation: { x: 0, y: Math.random() * Math.PI, z: 0 } });
            options.onCreated?.(mesh, index);
            created.push(mesh);
        }
        return created;
    }

    /** Remove and dispose everything this builder created. */
    clear(): void {
        for (const group of this.groups.values()) {
            group.removeFromParent();
            group.clear();
        }
        this.groups.clear();
    }

    dispose(): void {
        this.clear();
        for (const geometry of this.geometries) geometry.dispose();
        this.geometries.length = 0;
        for (const material of this.sharedMaterials.values()) material.dispose();
        this.sharedMaterials.clear();
    }

    //#region Internals

    private finish(mesh: THREE.Mesh, options: BuildOptions, shape: { type: 'box'; size: Vec3 } | { type: 'sphere'; radius: number } | { type: 'cylinder'; radius: number; height: number }): THREE.Mesh {
        const { game, scene } = this.builder();
        if (options.position) mesh.position.set(options.position.x, options.position.y, options.position.z);
        if (options.rotation) mesh.rotation.set(options.rotation.x, options.rotation.y, options.rotation.z);
        mesh.receiveShadow = options.receiveShadow ?? true;
        mesh.castShadow = options.castShadow ?? true;
        if (options.tag) {
            tagObject(mesh, options.tag);
            let group = this.groups.get(options.tag);
            if (!group) {
                group = new THREE.Group();
                group.name = `blocks-${options.tag}`;
                this.groups.set(options.tag, group);
                scene.add(group);
            }
            group.add(mesh);
        } else {
            scene.add(mesh);
        }

        const mode = options.physics ?? 'fixed';
        if (mode !== 'none') {
            const rotation = options.rotation ? new THREE.Euler(options.rotation.x, options.rotation.y, options.rotation.z) : undefined;
            game.physics.add({
                kind: mode,
                shape,
                position: mesh.position,
                ...(rotation ? { rotation } : {}),
                object: mesh,
                syncObject: mode === 'dynamic',
                ...(options.tag !== undefined ? { tag: options.tag } : {}),
                groups: GROUP.world,
                friction: 0.8,
            });
        }
        return mesh;
    }

    private materialFor(options: BuildOptions): THREE.Material {
        if (options.material) return options.material;
        const key = `${new THREE.Color(options.color ?? 0x9aa3ad).getHexString()}|${options.roughness ?? 0.85}|${options.metalness ?? 0.05}`;
        const cached = this.sharedMaterials.get(key);
        if (cached) return cached;
        const material = new THREE.MeshStandardMaterial({
            color: new THREE.Color(options.color ?? 0x9aa3ad),
            roughness: options.roughness ?? 0.85,
            metalness: options.metalness ?? 0.05,
        });
        this.sharedMaterials.set(key, material);
        return material;
    }

    //#endregion Internals
}

/**
 * A cheap humanoid stand-in: capsule body, sphere head, a nose to show facing.
 * Good enough to see where you are and which way you look, and it costs one
 * group with two meshes so it stays cheap in a crowd.
 */
export function createAvatar(options: { color?: THREE.ColorRepresentation; height?: number; radius?: number; headColor?: THREE.ColorRepresentation } = {}): THREE.Group {
    const height = options.height ?? 1.8;
    const radius = options.radius ?? 0.34;
    const group = new THREE.Group();
    group.name = 'avatar';

    const bodyMaterial = new THREE.MeshStandardMaterial({ color: new THREE.Color(options.color ?? 0x4f9bd9), roughness: 0.6 });
    const headMaterial = new THREE.MeshStandardMaterial({ color: new THREE.Color(options.headColor ?? options.color ?? 0x6fb6e8), roughness: 0.5 });

    const body = new THREE.Mesh(new THREE.CapsuleGeometry(radius, Math.max(height - radius * 2 - 0.34, 0.2), 8, 16), bodyMaterial);
    body.position.y = height / 2 - 0.17;
    body.castShadow = true;
    group.add(body);

    const head = new THREE.Mesh(new THREE.SphereGeometry(radius * 0.62, 16, 12), headMaterial);
    head.position.y = height - radius * 0.6;
    head.castShadow = true;
    group.add(head);

    // A nose makes the facing direction obvious without any UI.
    const nose = new THREE.Mesh(new THREE.ConeGeometry(radius * 0.18, radius * 0.5, 8), bodyMaterial);
    nose.rotation.x = Math.PI / 2;
    nose.position.set(0, height - radius * 0.6, radius * 0.62);
    group.add(nose);

    return group;
}

/**
 * A grey-box vehicle: a cab, a cargo box and four wheel meshes, in the -z
 * forward convention the `VehicleBody` drives in. The wheels are returned
 * separately because the controller moves them itself; add them to the scene
 * and sync them with `syncWheelMeshes`.
 */
export function createVehicleVisual(options: { color?: THREE.ColorRepresentation; panelColor?: THREE.ColorRepresentation; wheelRadius?: number } = {}): { root: THREE.Group; wheels: THREE.Mesh[] } {
    const paint = new THREE.MeshStandardMaterial({ color: new THREE.Color(options.color ?? 0xe07b39), roughness: 0.5, metalness: 0.1 });
    const panel = new THREE.MeshStandardMaterial({ color: new THREE.Color(options.panelColor ?? 0xece8dc), roughness: 0.7 });

    const root = new THREE.Group();
    root.name = 'vehicle-visual';

    const cargo = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.3, 1.9), panel);
    cargo.position.set(0, 0.3, 0.55);
    cargo.castShadow = true;
    root.add(cargo);

    const cab = new THREE.Mesh(new THREE.BoxGeometry(1.66, 0.85, 1.3), paint);
    cab.position.set(0, 0.08, -1.0);
    cab.castShadow = true;
    root.add(cab);

    const windshield = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.45, 0.06), new THREE.MeshStandardMaterial({ color: 0x9fd4e8, roughness: 0.1, metalness: 0.4 }));
    windshield.position.set(0, 0.28, -1.62);
    windshield.rotation.x = 0.25;
    root.add(windshield);

    const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.74, 0.22, 1.94), paint);
    stripe.position.set(0, 0.34, 0.55);
    root.add(stripe);

    const wheelRadius = options.wheelRadius ?? 0.34;
    const wheelGeometry = new THREE.CylinderGeometry(wheelRadius, wheelRadius, 0.26, 14);
    wheelGeometry.rotateZ(Math.PI / 2);
    const wheelMaterial = new THREE.MeshStandardMaterial({ color: 0x1c1f26, roughness: 0.9 });
    const wheels: THREE.Mesh[] = [];
    for (let index = 0; index < 4; index += 1) {
        const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
        wheel.castShadow = true;
        wheel.name = `wheel-${index}`;
        wheels.push(wheel);
    }
    return { root, wheels };
}

/** Checkerboard ground texture drawn on a canvas, for prototypes with no assets. */
export function checkerTexture(size = 512, squares = 8, colorA = '#8f9682', colorB = '#7d8472'): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext('2d');
    if (context) {
        const cell = size / squares;
        for (let y = 0; y < squares; y += 1) {
            for (let x = 0; x < squares; x += 1) {
                context.fillStyle = (x + y) % 2 === 0 ? colorA : colorB;
                context.fillRect(x * cell, y * cell, cell, cell);
            }
        }
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    return texture;
}

/** Default play area size for prototypes, in meters. */
export const DEFAULT_ARENA_SIZE = 40;

/** Default height of prototype arena walls. */
export const DEFAULT_WALL_HEIGHT = 5;

/** Default gravity-relative jump clearance used by platform templates. */
export const DEFAULT_STEP_RISE = CONSTANTS.MOVEMENT.JUMP_HEIGHT / 4;
