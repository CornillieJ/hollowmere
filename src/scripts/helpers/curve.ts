import * as THREE from 'three';

import { damp } from './math';

/**
 * Paths for things that follow a route: camera rails, patrols, spawned traffic.
 *
 * A `CurvePath` wraps a `THREE.CatmullRomCurve3` with the parts games keep
 * needing: travel at a speed in meters per second, wrap or ping-pong, distance
 * queries, and an offset (side of the road, shoulder of the track).
 */
export type PathOptions = {
    /** Closed loop. Defaults to false, i.e. a line from the first point to the last. */
    closed?: boolean;
    /** 0 makes corners sharp, higher values are smoother. Defaults to 0.5. */
    tension?: number;
    /** Samples used for length calculations. Higher is more accurate. Defaults to 200. */
    samples?: number;
    /** End behaviour: stop at the end, wrap around, or turn back. */
    mode?: 'once' | 'loop' | 'ping-pong';
    /** Meters per second. */
    speed?: number;
    /** Offset to the right of the path, e.g. to drive on one side. */
    offset?: number;
};

export class CurvePath {
    readonly curve: THREE.CatmullRomCurve3;
    /** Loop, ping-pong or stop at the end. */
    mode: NonNullable<PathOptions['mode']>;
    /** Meters per second. */
    speed: number;
    /** Sideways offset in meters, positive is to the right of travel. */
    offset: number;

    private distance = 0;
    private goingForward = true;
    private readonly lengths: number[];
    private readonly total: number;
    private readonly samples: number;

    constructor(points: Array<THREE.Vector3 | Vec3>, options: PathOptions = {}) {
        const vectors = points.map((point) => new THREE.Vector3(point.x, point.y, point.z));
        this.curve = new THREE.CatmullRomCurve3(vectors, options.closed ?? false, 'catmullrom', options.tension ?? 0.5);
        this.mode = options.mode ?? (options.closed ? 'loop' : 'once');
        this.speed = options.speed ?? 4;
        this.offset = options.offset ?? 0;
        this.samples = options.samples ?? 200;

        // Arc length at each sample, so distance and time map to each other.
        const sampled = this.curve.getPoints(this.samples);
        this.lengths = [0];
        for (let index = 1; index < sampled.length; index += 1) {
            this.lengths.push((this.lengths[index - 1] as number) + (sampled[index] as THREE.Vector3).distanceTo(sampled[index - 1] as THREE.Vector3));
        }
        this.total = this.lengths[this.lengths.length - 1] as number;
    }

    /** Total length of the path in meters. */
    get length(): number {
        return this.total;
    }

    /** Distance travelled so far, in meters. */
    get travelled(): number {
        return this.distance;
    }

    /** Fraction of the path completed, in 0..1. */
    get progress(): number {
        return this.total <= 0 ? 0 : this.distance / this.total;
    }

    /** True when a one-pass path has reached its end. */
    get finished(): boolean {
        return this.mode === 'once' && this.distance >= this.total;
    }

    /** Jump to a fraction of the path. */
    seek(progress: number): void {
        this.distance = THREE.MathUtils.clamp(progress, 0, 1) * this.total;
    }

    /** Jump to a distance in meters. */
    seekDistance(meters: number): void {
        this.distance = THREE.MathUtils.clamp(meters, 0, this.total);
    }

    /**
     * Advance along the path and write the position into `out`.
     * @param delta Seconds since the last call.
     */
    update(delta: number): THREE.Vector3 {
        const step = this.speed * delta * (this.goingForward ? 1 : -1);
        this.distance += step;

        if (this.mode === 'loop' && this.total > 0) {
            this.distance = ((this.distance % this.total) + this.total) % this.total;
        } else if (this.mode === 'ping-pong' && this.total > 0) {
            if (this.distance > this.total) {
                this.distance = this.total - (this.distance - this.total);
                this.goingForward = false;
            } else if (this.distance < 0) {
                this.distance = -this.distance;
                this.goingForward = true;
            }
        } else {
            this.distance = THREE.MathUtils.clamp(this.distance, 0, this.total);
        }
        return this.positionAt(this.distance / Math.max(this.total, 1e-6));
    }

    /** World position at a fraction of the path, with the offset applied. */
    positionAt(progress: number, out = new THREE.Vector3()): THREE.Vector3 {
        this.curve.getPointAt(THREE.MathUtils.clamp(progress, 0, 1), out);
        if (this.offset !== 0) out.addScaledVector(this.rightAt(progress), this.offset);
        return out;
    }

    /** Unit tangent at a fraction of the path, i.e. the travel direction. */
    tangentAt(progress: number, out = new THREE.Vector3()): THREE.Vector3 {
        return this.curve.getTangentAt(THREE.MathUtils.clamp(progress, 0, 1), out).normalize();
    }

    /** Unit vector to the right of travel, flat on the ground plane. */
    rightAt(progress: number, out = new THREE.Vector3()): THREE.Vector3 {
        this.tangentAt(progress, out);
        return out.set(-out.z, 0, out.x).normalize();
    }

    /** Where the path is right now, offset applied. */
    get position(): THREE.Vector3 {
        return this.positionAt(this.progress);
    }

    /**
     * Place an object on the path and aim it along the travel direction.
     * This is the call a rail camera or a patrol unit makes.
     */
    place(object: THREE.Object3D, delta: number, options: { face?: boolean; turnSpeed?: number } = {}): void {
        const position = this.update(delta);
        const tangent = this.tangentAt(this.progress, TANGENT_SCRATCH);
        if (options.turnSpeed !== undefined && options.turnSpeed > 0) {
            const target = Math.atan2(tangent.x, tangent.z);
            let difference = target - object.rotation.y;
            while (difference > Math.PI) difference -= Math.PI * 2;
            while (difference < -Math.PI) difference += Math.PI * 2;
            object.rotation.y += THREE.MathUtils.clamp(difference, -options.turnSpeed * delta, options.turnSpeed * delta);
        } else if (options.face !== false) {
            object.lookAt(position.x + tangent.x, position.y, position.z + tangent.z);
        }
        object.position.copy(position);
    }

    /** Progress of the point on the path closest to a world position. */
    closestProgress(position: THREE.Vector3 | Vec3, samples = 60): { progress: number; distance: number } {
        const target = position instanceof THREE.Vector3 ? position : new THREE.Vector3(position.x, position.y, position.z);
        let best = { progress: 0, distance: Infinity };
        const scratch = new THREE.Vector3();
        for (let index = 0; index <= samples; index += 1) {
            const candidate = index / samples;
            const distance = this.positionAt(candidate, scratch).distanceToSquared(target);
            if (distance < best.distance) best = { progress: candidate, distance: Math.sqrt(distance) };
        }
        return best;
    }

    /** The points the curve is drawn through, for a debug line or a minimap. */
    points(divisions = 120): THREE.Vector3[] {
        return this.curve.getPoints(divisions);
    }

    /** A `Line` for debugging a path in the scene. */
    createDebugLine(color: THREE.ColorRepresentation = 0xff00ff): THREE.Line {
        const geometry = new THREE.BufferGeometry().setFromPoints(this.points());
        const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color }));
        line.name = 'debug-path';
        return line;
    }
}

const TANGENT_SCRATCH = new THREE.Vector3();

/**
 * A camera that rides a path and always looks at a target, with damping so it
 * does not feel bolted to a rail. Good for cutscenes, menu backdrops and a
 * "drone shot" while a level loads.
 */
export class RailCamera {
    readonly path: CurvePath;
    /** How quickly the camera catches up to the path, 0 is instant. */
    damping = 0;
    /** What the camera aims at, updated by the caller each frame. */
    readonly lookAt = new THREE.Vector3();

    private readonly scratch = new THREE.Vector3();

    constructor(path: CurvePath, lookAt: THREE.Vector3 | Vec3 = { x: 0, y: 1, z: 0 }) {
        this.path = path;
        this.lookAt.set(lookAt.x, lookAt.y, lookAt.z);
    }

    /** Move along the rail and aim at `lookAt`. */
    update(camera: THREE.Camera, delta: number): void {
        const target = this.path.update(delta);
        if (this.damping > 0) {
            camera.position.set(
                damp(camera.position.x, target.x, this.damping, delta),
                damp(camera.position.y, target.y, this.damping, delta),
                damp(camera.position.z, target.z, this.damping, delta),
            );
        } else {
            camera.position.copy(target);
        }
        camera.lookAt(this.scratch.copy(this.lookAt));
    }
}

/**
 * A flat ribbon along the path, for roads, rivers and race tracks.
 *
 * Built as a triangle strip rather than a tube: a tube is a cylinder, so half of
 * it is under the ground and anything standing on the path disappears inside it.
 * This sits on the surface, flat, with the UVs repeated along its length so a
 * texture tiles.
 *
 * @param width Width in meters.
 * @param options Divisions along the path, how much it repeats the UVs, and an offset from the ground.
 */
export function createRibbon(path: CurvePath, width: number, options: { divisions?: number; repeat?: number; y?: number } = {}): THREE.Mesh {
    const divisions = options.divisions ?? Math.max(24, Math.round(path.length * 2));
    const y = options.y ?? 0.02;
    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    const half = width / 2;
    const repeat = options.repeat ?? path.length / (width * 2);

    const point = new THREE.Vector3();
    const tangent = new THREE.Vector3();
    const right = new THREE.Vector3();

    for (let index = 0; index <= divisions; index += 1) {
        const progress = index / divisions;
        path.positionAt(progress, point);
        path.tangentAt(progress, tangent);
        // Perpendicular on the ground plane, so the ribbon stays flat.
        right.set(-tangent.z, 0, tangent.x).normalize();
        if (right.lengthSq() < 0.5) right.set(1, 0, 0);

        positions.push(point.x - right.x * half, y, point.z - right.z * half);
        positions.push(point.x + right.x * half, y, point.z + right.z * half);
        const v = progress * repeat;
        uvs.push(0, v, 1, v);

        if (index < divisions) {
            const base = index * 2;
            indices.push(base, base + 1, base + 2, base + 2, base + 1, base + 3);
        }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: 0x8a7f6a, roughness: 0.95 }));
    mesh.name = 'ribbon';
    mesh.receiveShadow = true;
    return mesh;
}

/** True when the path has enough points to be drawn, i.e. a useful guard. */
export function isValidPath(points: Array<THREE.Vector3 | Vec3>, closed = false): boolean {
    return points.length >= (closed ? 3 : 2);
}
