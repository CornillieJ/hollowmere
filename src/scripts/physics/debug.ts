import * as THREE from 'three';

import type { Physics } from './physics';

/**
 * Wireframe visualisation of every collider in the world.
 *
 * Rapier hands back vertex and colour buffers, so this is a single
 * `LineSegments` that gets refilled each frame. Toggle it with
 * `game.debug.togglePhysics()` or the `debugPhysics` game option.
 */
export class PhysicsDebugView {
    readonly object: THREE.LineSegments;
    private readonly geometry: THREE.BufferGeometry;
    private readonly positions: THREE.BufferAttribute;
    private readonly colors: THREE.BufferAttribute;
    private readonly physics: Physics;
    private readonly maxVertices: number;

    constructor(physics: Physics, maxVertices = 60_000) {
        this.physics = physics;
        this.maxVertices = maxVertices;
        this.geometry = new THREE.BufferGeometry();
        this.positions = new THREE.BufferAttribute(new Float32Array(maxVertices * 3), 3);
        this.colors = new THREE.BufferAttribute(new Float32Array(maxVertices * 3), 3);
        this.positions.setUsage(THREE.DynamicDrawUsage);
        this.colors.setUsage(THREE.DynamicDrawUsage);
        this.geometry.setAttribute('position', this.positions);
        this.geometry.setAttribute('color', this.colors);
        this.geometry.setDrawRange(0, 0);

        const material = new THREE.LineBasicMaterial({ vertexColors: true, depthTest: true, toneMapped: false });
        this.object = new THREE.LineSegments(this.geometry, material);
        this.object.name = 'physics-debug';
        this.object.frustumCulled = false;
        this.object.renderOrder = 999;
    }

    /** Refill the line buffers from the current physics state. */
    update(): void {
        const buffers = this.physics.world.debugRender();
        const count = Math.min(buffers.vertices.length / 3, this.maxVertices);
        const positions = this.positions.array as Float32Array;
        const colors = this.colors.array as Float32Array;

        positions.set(buffers.vertices.subarray(0, count * 3));
        // Rapier writes RGBA per vertex, three wants three components per vertex.
        for (let index = 0; index < count * 4; index += 4) {
            const target = (index / 4) * 3;
            colors[target] = buffers.colors[index] ?? 1;
            colors[target + 1] = buffers.colors[index + 1] ?? 1;
            colors[target + 2] = buffers.colors[index + 2] ?? 1;
        }

        this.positions.needsUpdate = true;
        this.colors.needsUpdate = true;
        this.geometry.setDrawRange(0, count);
    }

    dispose(): void {
        this.geometry.dispose();
        (this.object.material as THREE.Material).dispose();
    }
}
