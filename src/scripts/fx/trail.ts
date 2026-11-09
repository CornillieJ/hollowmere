import * as THREE from 'three';

/**
 * Ribbon trail behind a moving object.
 *
 * Samples the target's world position each frame and builds a vertical strip
 * through those points, which is exactly what a light wall or a light cycle
 * ribbon needs. With additive blending the tail fades by darkening its vertex
 * colours, so no per-vertex alpha is required.
 */
export type TrailOptions = {
    /** Number of samples kept, i.e. the trail length in frames. */
    length?: number;
    /** Height of the ribbon in meters. */
    height?: number;
    /** Colour at the head of the trail. */
    color?: THREE.ColorRepresentation;
    /** Vertical offset from the target's origin to the bottom of the ribbon. */
    offsetY?: number;
    /** Skip adding a sample when the target moved less than this many meters. */
    minDistance?: number;
    /** Additive blending makes the ribbon glow; false gives a solid wall. */
    additive?: boolean;
    /** Blend the trail towards the background instead of fading to black. */
    opacity?: number;
};

const DEFAULT_LENGTH = 120;

export class Trail {
    readonly object: THREE.Mesh;

    private readonly target: THREE.Object3D;
    private readonly geometry: THREE.BufferGeometry;
    private readonly material: THREE.MeshBasicMaterial;
    private readonly points: Float32Array;
    private readonly samples: THREE.Vector3[];
    private readonly capacity: number;
    private readonly height: number;
    private readonly offsetY: number;
    private readonly minDistance: number;
    private readonly color: THREE.Color;
    private count = 0;
    private head = 0;

    constructor(target: THREE.Object3D, options: TrailOptions = {}) {
        this.target = target;
        this.capacity = options.length ?? DEFAULT_LENGTH;
        this.height = options.height ?? 1.5;
        this.offsetY = options.offsetY ?? 0;
        this.minDistance = options.minDistance ?? 0.05;
        this.color = new THREE.Color(options.color ?? 0x59d3ff);
        this.samples = Array.from({ length: this.capacity }, () => new THREE.Vector3());

        this.points = new Float32Array(this.capacity * 2 * 3);
        const colors = new Float32Array(this.capacity * 2 * 3);
        const indices = new Uint16Array((this.capacity - 1) * 6);
        for (let index = 0; index < this.capacity - 1; index += 1) {
            const base = index * 2;
            const target = index * 6;
            indices[target] = base;
            indices[target + 1] = base + 1;
            indices[target + 2] = base + 2;
            indices[target + 3] = base + 2;
            indices[target + 4] = base + 1;
            indices[target + 5] = base + 3;
        }

        this.geometry = new THREE.BufferGeometry();
        this.geometry.setAttribute('position', new THREE.BufferAttribute(this.points, 3).setUsage(THREE.DynamicDrawUsage));
        this.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3).setUsage(THREE.DynamicDrawUsage));
        this.geometry.setIndex(new THREE.BufferAttribute(indices, 1));
        this.geometry.setDrawRange(0, 0);
        this.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);

        this.material = new THREE.MeshBasicMaterial({
            vertexColors: true,
            transparent: (options.opacity ?? 1) < 1,
            opacity: options.opacity ?? 1,
            side: THREE.DoubleSide,
            depthWrite: false,
            blending: options.additive === false ? THREE.NormalBlending : THREE.AdditiveBlending,
        });

        this.object = new THREE.Mesh(this.geometry, this.material);
        this.object.name = 'trail';
        this.object.frustumCulled = false;
        this.object.userData.tag = 'effects';
    }

    /** Take one sample and rebuild the ribbon. Call every frame. */
    update(): void {
        const current = this.target.getWorldPosition(new THREE.Vector3());
        const last = this.count > 0 ? this.samples[(this.head - 1 + this.capacity) % this.capacity] : undefined;
        if (!last || last.distanceToSquared(current) >= this.minDistance * this.minDistance) {
            this.samples[this.head]!.copy(current);
            this.head = (this.head + 1) % this.capacity;
            this.count = Math.min(this.count + 1, this.capacity);
        }
        this.rebuild();
    }

    /** Drop every sample, e.g. after a respawn so the wall does not stretch across the map. */
    reset(): void {
        this.count = 0;
        this.head = 0;
        this.geometry.setDrawRange(0, 0);
    }

    dispose(): void {
        this.geometry.dispose();
        this.material.dispose();
    }

    private rebuild(): void {
        if (this.count < 2) {
            this.geometry.setDrawRange(0, 0);
            return;
        }

        const positions = this.geometry.attributes.position!.array as Float32Array;
        const colors = this.geometry.attributes.color!.array as Float32Array;

        for (let index = 0; index < this.capacity; index += 1) {
            // Newest sample first, wrapped around the ring buffer.
            const sampleIndex = (this.head - 1 - index + this.capacity * 2) % this.capacity;
            const sample = this.samples[sampleIndex]!;
            const offset = index * 6;
            const fade = index < this.count ? 1 - index / this.count : 0;

            positions[offset] = sample.x;
            positions[offset + 1] = sample.y + this.offsetY;
            positions[offset + 2] = sample.z;
            positions[offset + 3] = sample.x;
            positions[offset + 4] = sample.y + this.offsetY + this.height;
            positions[offset + 5] = sample.z;

            colors[offset] = this.color.r * fade;
            colors[offset + 1] = this.color.g * fade;
            colors[offset + 2] = this.color.b * fade;
            colors[offset + 3] = this.color.r * fade;
            colors[offset + 4] = this.color.g * fade;
            colors[offset + 5] = this.color.b * fade;
        }

        this.geometry.attributes.position!.needsUpdate = true;
        this.geometry.attributes.color!.needsUpdate = true;
        this.geometry.setDrawRange(0, (this.count - 1) * 6);
    }
}
