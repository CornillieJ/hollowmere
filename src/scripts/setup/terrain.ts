import * as THREE from 'three';

import type { Physics, PhysicsBody } from '../physics/physics';

/**
 * Ground with height: hills, hollows and flat pads to build on.
 *
 * Give it a height function and it builds the mesh, the physics collider and a
 * `heightAt` lookup that agree with each other, so a house, a tree or a spawn
 * point can always be put exactly on the ground:
 *
 * ```ts
 * const noise = createNoise2D(7);
 * const terrain = new Terrain(game.scene, game.physics, {
 *     size: 240,
 *     height: (x, z) => fbm(noise, x / 60, z / 60) * 8,
 *     flats: [{ x: -50, z: 40, radius: 24 }],          // a level farmyard
 *     color: (x, z, height, slope) => (slope > 0.5 ? 0x555048 : 0x6a7a55),
 * });
 * terrain.place(house, -50, 40);
 * ```
 */
export type TerrainFlat = {
    x: number;
    z: number;
    /** Fully level inside this radius. */
    radius: number;
    /** Height of the pad. Defaults to the natural height at its centre. */
    height?: number;
    /** Meters over which the pad eases back into the hills. */
    blend?: number;
};

export type TerrainOptions = {
    /** Footprint in meters; the terrain is a square centred on the origin. */
    size: number;
    /** Cells per side. Defaults to one cell per 2 meters. */
    segments?: number;
    /** The natural height at a point, before any flats. */
    height: (x: number, z: number) => number;
    /** Level pads for buildings, fields and anything else that wants flat ground. */
    flats?: TerrainFlat[];
    /** Colour per vertex, e.g. dirt on roads and stone on steep slopes. `slope` is 0 flat to 1 vertical. */
    color?: (x: number, z: number, height: number, slope: number) => THREE.ColorRepresentation;
    /** Tiling texture, multiplied with the vertex colours. */
    texture?: THREE.Texture;
    /** How often the texture repeats across the whole terrain. */
    textureRepeat?: number;
    roughness?: number;
    /** Faceted shading, for a low-poly look. */
    flatShading?: boolean;
    /** Add a heightfield collider, on by default when a physics world is given. */
    physics?: boolean;
};

export class Terrain {
    readonly mesh: THREE.Mesh;
    readonly size: number;
    readonly segments: number;
    /** The collider, when physics is on. */
    readonly body: PhysicsBody | undefined;

    private readonly heights: Float32Array;
    private readonly cell: number;

    constructor(scene: THREE.Scene, physics: Physics | undefined, options: TerrainOptions) {
        this.size = options.size;
        this.segments = options.segments ?? Math.max(2, Math.round(options.size / 2));
        this.cell = this.size / this.segments;
        const side = this.segments + 1;
        this.heights = new Float32Array(side * side);

        const flats = (options.flats ?? []).map((flat) => ({ ...flat, height: flat.height ?? options.height(flat.x, flat.z), blend: flat.blend ?? flat.radius * 0.6 }));
        for (let row = 0; row < side; row += 1) {
            for (let column = 0; column < side; column += 1) {
                const x = -this.size / 2 + column * this.cell;
                const z = -this.size / 2 + row * this.cell;
                let height = options.height(x, z);
                for (const flat of flats) {
                    const weight = 1 - THREE.MathUtils.smoothstep(Math.hypot(x - flat.x, z - flat.z), flat.radius, flat.radius + flat.blend);
                    if (weight > 0) height += (flat.height - height) * weight;
                }
                this.heights[row * side + column] = height;
            }
        }

        this.mesh = new THREE.Mesh(this.buildGeometry(options), this.buildMaterial(options));
        this.mesh.name = 'terrain';
        this.mesh.receiveShadow = true;
        this.mesh.userData.tag = 'ground';
        scene.add(this.mesh);

        if (physics && options.physics !== false) {
            this.body = physics.add({
                kind: 'fixed',
                shape: { type: 'heightfield', rows: this.segments, columns: this.segments, heights: this.heights, size: { x: this.size, z: this.size } },
                position: { x: 0, y: 0, z: 0 },
                syncObject: false,
                friction: 0.9,
                tag: 'ground',
            });
        }
    }

    /** Ground height at a point. Outside the terrain it returns the nearest edge. */
    heightAt(x: number, z: number): number {
        const side = this.segments + 1;
        const fx = THREE.MathUtils.clamp((x + this.size / 2) / this.cell, 0, this.segments);
        const fz = THREE.MathUtils.clamp((z + this.size / 2) / this.cell, 0, this.segments);
        const column = Math.min(this.segments - 1, Math.floor(fx));
        const row = Math.min(this.segments - 1, Math.floor(fz));
        const tx = fx - column;
        const tz = fz - row;
        const at = (r: number, c: number): number => this.heights[r * side + c] as number;
        const near = at(row, column) + (at(row, column + 1) - at(row, column)) * tx;
        const far = at(row + 1, column) + (at(row + 1, column + 1) - at(row + 1, column)) * tx;
        return near + (far - near) * tz;
    }

    /** The up direction of the ground at a point. */
    normalAt(x: number, z: number, out = new THREE.Vector3()): THREE.Vector3 {
        const step = this.cell * 0.5;
        return out.set(this.heightAt(x - step, z) - this.heightAt(x + step, z), step * 2, this.heightAt(x, z - step) - this.heightAt(x, z + step)).normalize();
    }

    /** Steepness at a point: 0 is level, 1 is a wall. */
    slopeAt(x: number, z: number): number {
        return 1 - this.normalAt(x, z, SCRATCH).y;
    }

    /** A point on the ground. */
    point(x: number, z: number, lift = 0): THREE.Vector3 {
        return new THREE.Vector3(x, this.heightAt(x, z) + lift, z);
    }

    /** Stand an object on the ground at a point, and hand it back. */
    place<T extends THREE.Object3D>(object: T, x: number, z: number, lift = 0): T {
        object.position.set(x, this.heightAt(x, z) + lift, z);
        return object;
    }

    /** True when a point is on the terrain, with an optional margin from the edge. */
    contains(x: number, z: number, margin = 0): boolean {
        const half = this.size / 2 - margin;
        return Math.abs(x) <= half && Math.abs(z) <= half;
    }

    /**
     * Pick spots on the ground, e.g. for trees or rocks.
     * @param accept Return false to refuse a spot: too steep, on a road, in a clearing.
     */
    scatter(count: number, random: () => number, accept?: (x: number, z: number, height: number, slope: number) => boolean, margin = 2): THREE.Vector3[] {
        const spots: THREE.Vector3[] = [];
        for (let attempt = 0; attempt < count * 8 && spots.length < count; attempt += 1) {
            const x = (random() * 2 - 1) * (this.size / 2 - margin);
            const z = (random() * 2 - 1) * (this.size / 2 - margin);
            const height = this.heightAt(x, z);
            if (accept && !accept(x, z, height, this.slopeAt(x, z))) continue;
            spots.push(new THREE.Vector3(x, height, z));
        }
        return spots;
    }

    dispose(): void {
        this.mesh.removeFromParent();
        this.mesh.geometry.dispose();
        (this.mesh.material as THREE.Material).dispose();
    }

    //#region Internals

    private buildGeometry(options: TerrainOptions): THREE.BufferGeometry {
        const side = this.segments + 1;
        const positions = new Float32Array(side * side * 3);
        const uvs = new Float32Array(side * side * 2);
        const colors = options.color ? new Float32Array(side * side * 3) : undefined;
        const repeat = options.textureRepeat ?? this.size / 4;
        const color = new THREE.Color();
        for (let row = 0; row < side; row += 1) {
            for (let column = 0; column < side; column += 1) {
                const index = row * side + column;
                const x = -this.size / 2 + column * this.cell;
                const z = -this.size / 2 + row * this.cell;
                const height = this.heights[index] as number;
                positions.set([x, height, z], index * 3);
                uvs.set([(column / this.segments) * repeat, (row / this.segments) * repeat], index * 2);
                if (colors && options.color) {
                    color.set(options.color(x, z, height, this.slopeAt(x, z)));
                    colors.set([color.r, color.g, color.b], index * 3);
                }
            }
        }
        const indices: number[] = [];
        for (let row = 0; row < this.segments; row += 1) {
            for (let column = 0; column < this.segments; column += 1) {
                const a = row * side + column;
                const b = a + side;
                indices.push(a, b, a + 1, b, b + 1, a + 1);
            }
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
        if (colors) geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geometry.setIndex(indices);
        geometry.computeVertexNormals();
        return geometry;
    }

    private buildMaterial(options: TerrainOptions): THREE.MeshStandardMaterial {
        if (options.texture) {
            options.texture.wrapS = THREE.RepeatWrapping;
            options.texture.wrapT = THREE.RepeatWrapping;
        }
        return new THREE.MeshStandardMaterial({
            color: 0xffffff,
            map: options.texture ?? null,
            vertexColors: options.color !== undefined,
            roughness: options.roughness ?? 0.95,
            flatShading: options.flatShading ?? false,
        });
    }

    //#endregion Internals
}

const SCRATCH = new THREE.Vector3();
