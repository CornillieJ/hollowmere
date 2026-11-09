import * as THREE from 'three';

/**
 * GPU particle bursts.
 *
 * One `THREE.Points` object holds a fixed pool of particles, so spawning never
 * allocates. Add `system.object` to the scene once and call `update(delta)`
 * every frame.
 */
export type ParticleBurstOptions = {
    count?: number;
    color?: THREE.ColorRepresentation;
    /** Size in world units at one meter from the camera. */
    size?: number;
    /** Initial speed in meters per second. */
    speed?: number;
    /** Cone half angle in radians. `Math.PI` fills a sphere, 0 is a thin spray. */
    spread?: number;
    /** Centre direction of the burst. Defaults to straight up. */
    direction?: THREE.Vector3;
    /** Seconds a particle lives. */
    lifetime?: number;
    /** Randomises each lifetime by this fraction, 0.35 means plus or minus 35%. */
    lifetimeVariance?: number;
    /** Speed multiplier per second. Below 1 slows particles down. */
    damping?: number;
    /** Downward acceleration in meters per second squared. */
    gravity?: number;
    /** Shrink to zero over the lifetime instead of only fading. */
    shrink?: boolean;
};

type BurstSettings = Required<Omit<ParticleBurstOptions, 'direction'>> & { direction: THREE.Vector3 };

const DEFAULTS: BurstSettings = {
    count: 24,
    color: 0xffffff,
    size: 0.08,
    speed: 6,
    spread: Math.PI,
    direction: new THREE.Vector3(0, 1, 0),
    lifetime: 0.7,
    lifetimeVariance: 0.35,
    damping: 0.9,
    gravity: 0,
    shrink: true,
};

const VERTEX_SHADER = /* glsl */ `
attribute float size;
attribute float alpha;
attribute vec3 tint;
varying float vAlpha;
varying vec3 vTint;
void main() {
    vAlpha = alpha;
    vTint = tint;
    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = size * 320.0 / max(-viewPosition.z, 0.001);
    gl_Position = projectionMatrix * viewPosition;
}
`;

const FRAGMENT_SHADER = /* glsl */ `
varying float vAlpha;
varying vec3 vTint;
void main() {
    // Soft round sprite without needing a texture.
    vec2 offset = gl_PointCoord - vec2(0.5);
    float falloff = smoothstep(0.5, 0.05, length(offset));
    if (falloff <= 0.001) discard;
    gl_FragColor = vec4(vTint, vAlpha * falloff);
}
`;

export class ParticleSystem {
    readonly object: THREE.Points;

    private readonly maxParticles: number;
    private readonly positions: Float32Array;
    private readonly tints: Float32Array;
    private readonly sizes: Float32Array;
    private readonly alphas: Float32Array;
    private readonly velocities: Float32Array;
    private readonly ages: Float32Array;
    private readonly lifetimes: Float32Array;
    private readonly startSizes: Float32Array;
    private readonly dampings: Float32Array;
    private readonly gravities: Float32Array;
    private readonly shrinks: Uint8Array;
    private readonly geometry: THREE.BufferGeometry;
    private readonly material: THREE.ShaderMaterial;
    private cursor = 0;

    constructor(maxParticles = 1024) {
        this.maxParticles = maxParticles;
        this.positions = new Float32Array(maxParticles * 3);
        this.tints = new Float32Array(maxParticles * 3);
        this.velocities = new Float32Array(maxParticles * 3);
        this.sizes = new Float32Array(maxParticles);
        this.alphas = new Float32Array(maxParticles);
        this.ages = new Float32Array(maxParticles);
        this.lifetimes = new Float32Array(maxParticles);
        this.startSizes = new Float32Array(maxParticles);
        this.dampings = new Float32Array(maxParticles);
        this.gravities = new Float32Array(maxParticles);
        this.shrinks = new Uint8Array(maxParticles);

        this.geometry = new THREE.BufferGeometry();
        this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
        this.geometry.setAttribute('tint', new THREE.BufferAttribute(this.tints, 3).setUsage(THREE.DynamicDrawUsage));
        this.geometry.setAttribute('size', new THREE.BufferAttribute(this.sizes, 1).setUsage(THREE.DynamicDrawUsage));
        this.geometry.setAttribute('alpha', new THREE.BufferAttribute(this.alphas, 1).setUsage(THREE.DynamicDrawUsage));
        this.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);

        this.material = new THREE.ShaderMaterial({
            vertexShader: VERTEX_SHADER,
            fragmentShader: FRAGMENT_SHADER,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
        });

        this.object = new THREE.Points(this.geometry, this.material);
        this.object.name = 'particles';
        this.object.frustumCulled = false;
        this.object.userData.tag = 'effects';
    }

    /** Particles that still have alpha left. */
    get activeCount(): number {
        let alive = 0;
        for (let slot = 0; slot < this.maxParticles; slot += 1) if (this.alphas[slot]! > 0) alive += 1;
        return alive;
    }

    /** Spawn a burst of particles at a world position. */
    burst(position: THREE.Vector3, options: ParticleBurstOptions = {}): void {
        const settings: BurstSettings = { ...DEFAULTS, ...options };
        const tint = new THREE.Color(settings.color);
        const count = Math.max(1, Math.floor(settings.count));
        const orientation = coneOrientation(settings.direction);

        for (let index = 0; index < count; index += 1) {
            const slot = this.cursor;
            this.cursor = (this.cursor + 1) % this.maxParticles;
            const offset = slot * 3;

            this.positions[offset] = position.x;
            this.positions[offset + 1] = position.y;
            this.positions[offset + 2] = position.z;

            const scatter = randomInCone(settings.spread).applyQuaternion(orientation);
            const speed = settings.speed * (0.4 + Math.random() * 0.6);
            this.velocities[offset] = scatter.x * speed;
            this.velocities[offset + 1] = scatter.y * speed;
            this.velocities[offset + 2] = scatter.z * speed;

            this.tints[offset] = tint.r;
            this.tints[offset + 1] = tint.g;
            this.tints[offset + 2] = tint.b;

            this.startSizes[slot] = settings.size * (0.6 + Math.random() * 0.8);
            this.sizes[slot] = this.startSizes[slot]!;
            this.alphas[slot] = 1;
            this.ages[slot] = 0;
            this.lifetimes[slot] = Math.max(0.05, settings.lifetime * (1 + (Math.random() * 2 - 1) * settings.lifetimeVariance));
            this.dampings[slot] = settings.damping;
            this.gravities[slot] = settings.gravity;
            this.shrinks[slot] = settings.shrink ? 1 : 0;
        }

        this.markDirty();
    }

    /** Advance every particle by `delta` seconds. */
    update(delta: number): void {
        let touched = false;

        for (let slot = 0; slot < this.maxParticles; slot += 1) {
            if (this.alphas[slot]! <= 0) continue;
            touched = true;

            const age = this.ages[slot]! + delta;
            const lifetime = this.lifetimes[slot]!;
            if (age >= lifetime) {
                this.alphas[slot] = 0;
                continue;
            }
            this.ages[slot] = age;

            const offset = slot * 3;
            const speedFactor = Math.pow(this.dampings[slot]!, delta);
            this.velocities[offset + 1] = this.velocities[offset + 1]! * speedFactor + this.gravities[slot]! * delta;
            this.velocities[offset] = this.velocities[offset]! * speedFactor;
            this.velocities[offset + 2] = this.velocities[offset + 2]! * speedFactor;

            this.positions[offset] = this.positions[offset]! + this.velocities[offset]! * delta;
            this.positions[offset + 1] = this.positions[offset + 1]! + this.velocities[offset + 1]! * delta;
            this.positions[offset + 2] = this.positions[offset + 2]! + this.velocities[offset + 2]! * delta;

            const t = age / lifetime;
            this.alphas[slot] = 1 - t * t;
            if (this.shrinks[slot] === 1) this.sizes[slot] = this.startSizes[slot]! * (1 - t);
        }

        if (touched) this.markDirty();
    }

    /** Kill every particle immediately, e.g. when leaving a level. */
    clear(): void {
        this.alphas.fill(0);
        this.markDirty();
    }

    dispose(): void {
        this.geometry.dispose();
        this.material.dispose();
    }

    private markDirty(): void {
        this.geometry.attributes.position!.needsUpdate = true;
        this.geometry.attributes.tint!.needsUpdate = true;
        this.geometry.attributes.size!.needsUpdate = true;
        this.geometry.attributes.alpha!.needsUpdate = true;
    }
}

/** A random unit vector inside a cone around +Y, given a half angle. */
function randomInCone(halfAngle: number): THREE.Vector3 {
    const cosLimit = Math.cos(THREE.MathUtils.clamp(halfAngle, 0, Math.PI));
    const cosTheta = 1 - Math.random() * (1 - cosLimit);
    const sinTheta = Math.sqrt(Math.max(0, 1 - cosTheta * cosTheta));
    const phi = Math.random() * Math.PI * 2;
    return new THREE.Vector3(sinTheta * Math.cos(phi), cosTheta, sinTheta * Math.sin(phi));
}

/** Rotation that turns the +Y cone axis onto `direction`. */
function coneOrientation(direction: THREE.Vector3): THREE.Quaternion {
    const axis = new THREE.Vector3(direction.x, direction.y, direction.z);
    if (axis.lengthSq() === 0) return new THREE.Quaternion();
    axis.normalize();
    return new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis);
}
