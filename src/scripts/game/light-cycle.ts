import * as THREE from 'three';

import { SYSTEM_ORDER } from '../core/systems';
import { Trail } from '../fx/trail';
import { DEFAULT_ARENA_SIZE, BlockBuilder, createAvatar } from '../helpers/build';
import { setUserData } from '../helpers/object';

/**
 * Light cycles in an arena.
 *
 * Each cycle drives forward on its own and leaves a lethal ribbon behind it.
 * Touching any ribbon, including your own, kills you. Steering is smooth rather
 * than the original's 90 degree snap, which reads much better with a free
 * camera, and `brakeKey` lets players slow down for the tight ones.
 *
 * Collision uses the trail polylines directly, so no physics bodies are needed
 * for the walls and a hundred samples per cycle cost almost nothing.
 */
export type LightCycleOptions = {
    position: THREE.Vector3 | Vec3;
    /** Colour of the cycle and its ribbon. */
    color?: THREE.ColorRepresentation;
    /** Meters per second. */
    speed?: number;
    /** Radians per second while steering. */
    turnRate?: number;
    /** Starting heading in radians. */
    yaw?: number;
    /** Height of the ribbon in meters. */
    trailHeight?: number;
    /** Drive this cycle with the keyboard. */
    player?: boolean;
    /** Drive this cycle with the built-in AI. */
    ai?: boolean;
    /** Name for the HUD and death messages. */
    name?: string;
};

export type LightCycle = {
    root: THREE.Group;
    trail: Trail;
    /** Unit heading on the ground plane. */
    heading: THREE.Vector3;
    yaw: number;
    speed: number;
    turnRate: number;
    alive: boolean;
    player: boolean;
    ai: boolean;
    name: string;
    color: THREE.Color;
    /** Polyline the cycle has drawn, one point every `sampleDistance` meters. */
    samples: THREE.Vector3[];
    /** Seconds until the AI is willing to turn again. */
    aiTurnTimer: number;
    /** Seconds since the last sample was pushed. */
    sampleTimer: number;
};

export type LightCycleArenaOptions = {
    /** Side length of the arena in meters. */
    size?: number;
    /** Wall height in meters. */
    wallHeight?: number;
    /** Speed of every cycle unless the cycle overrides it. */
    speed?: number;
    /** Distance between ribbon samples. Smaller is more accurate and slower. */
    sampleDistance?: number;
    /** Radius used when testing the head against ribbons. */
    headRadius?: number;
    /** Called when a cycle dies, with the cycle and the killer (`undefined` for a wall). */
    onDeath?: (cycle: LightCycle, killer: LightCycle | undefined) => void;
    /** Called once only one cycle is left. */
    onWinner?: (cycle: LightCycle) => void;
};

export class LightCycleArena {
    /** Every cycle, dead ones included until `clear`. */
    readonly cycles: LightCycle[] = [];
    /** Keyboard actions used to steer the player's cycle. */
    steerLeft = 'left';
    steerRight = 'right';
    brakeKey = 'crouch';
    boostKey = 'sprint';

    private readonly game: Game;
    private readonly options: Required<Pick<LightCycleArenaOptions, 'size' | 'sampleDistance' | 'headRadius'>> & LightCycleArenaOptions;
    private readonly builder: BlockBuilder;
    private readonly geometry = new THREE.BoxGeometry(0.5, 0.42, 1.1);
    private readonly materials = new Map<string, THREE.MeshStandardMaterial>();
    private readonly scratch = new THREE.Vector3();

    constructor(game: Game, options: LightCycleArenaOptions = {}) {
        this.game = game;
        this.options = { size: options.size ?? DEFAULT_ARENA_SIZE, sampleDistance: options.sampleDistance ?? 0.3, headRadius: options.headRadius ?? 0.45, ...options };

        this.builder = new BlockBuilder(game);
        this.builder.walls(this.options.size, this.options.wallHeight ?? 4, 0.6, { color: 0x1b1b26, tag: 'wall' });

        // A neon floor grid, drawn as one plane with a canvas texture.
        const floor = this.builder.platform(this.options.size, 0.05, 0.1, { color: 0x101020, tag: 'ground', receiveShadow: true });
        floor.material = new THREE.MeshStandardMaterial({ color: 0x0c0c18, roughness: 0.4, metalness: 0.5 });

        game.systems.add({
            name: 'light-cycles',
            order: SYSTEM_ORDER.GAMEPLAY,
            fixedUpdate: (step) => this.fixedUpdate(step),
            update: (delta) => this.update(delta),
        });
    }

    /** Add a cycle to the arena. */
    spawn(options: LightCycleOptions): LightCycle {
        const color = new THREE.Color(options.color ?? 0x59d3ff);
        const yaw = options.yaw ?? 0;

        const root = new THREE.Group();
        root.name = options.name ?? `cycle-${this.cycles.length + 1}`;
        root.position.set(options.position.x, 0.32, options.position.z);
        root.rotation.y = yaw;
        setUserData(root, { tag: 'cycle' });
        this.game.scene.add(root);

        const body = new THREE.Mesh(this.geometry, this.material(color));
        body.castShadow = true;
        root.add(body);

        const light = new THREE.PointLight(color, 3, 8, 2);
        light.position.y = 0.4;
        root.add(light);

        const trail = new Trail(root, { height: options.trailHeight ?? 1.2, color, additive: true, length: 400, offsetY: 0.1, minDistance: 0.25 });
        this.game.scene.add(trail.object);

        const cycle: LightCycle = {
            root,
            trail,
            heading: new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)),
            yaw,
            speed: options.speed ?? this.options.speed ?? 14,
            turnRate: options.turnRate ?? 2.1,
            alive: true,
            player: options.player ?? false,
            ai: options.ai ?? false,
            name: root.name,
            color,
            samples: [],
            aiTurnTimer: 0,
            sampleTimer: 0,
        };
        this.cycles.push(cycle);
        return cycle;
    }

    /** Check every cycle against every ribbon. Exposed for tests. */
    resolveCollisions(): void {
        const radius = this.options.headRadius;
        const radiusSq = radius * radius;

        for (const cycle of this.cycles) {
            if (!cycle.alive) continue;
            const head = this.scratch.copy(cycle.root.position).setY(0);
            let killer: LightCycle | undefined;

            for (const other of this.cycles) {
                if (!other.alive) continue;
                const samples = other.samples;
                for (let index = 0; index < samples.length; index += 2) {
                    const sample = samples[index] as THREE.Vector3;
                    if (sample.distanceToSquared(head) > radiusSq) continue;
                    // Ignore the newest samples behind your own head, or you would
                    // die the instant you started driving.
                    if (other === cycle && index > samples.length - 8) continue;
                    killer = other;
                    break;
                }
                if (killer) break;
            }

            if (killer || !this.insideArena(cycle.root.position)) this.kill(cycle, killer);
        }
    }

    /** Remove every cycle and its ribbon. */
    clear(): void {
        for (const cycle of this.cycles) {
            cycle.root.removeFromParent();
            cycle.trail.object.removeFromParent();
            cycle.trail.dispose();
        }
        this.cycles.length = 0;
    }

    /** Cycles still driving. */
    get aliveCount(): number {
        return this.cycles.reduce((total, cycle) => total + (cycle.alive ? 1 : 0), 0);
    }

    dispose(): void {
        this.clear();
        this.builder.dispose();
        this.geometry.dispose();
        for (const material of this.materials.values()) material.dispose();
    }

    /** True while the position is inside the arena walls. */
    insideArena(position: THREE.Vector3): boolean {
        const half = this.options.size / 2 - 0.5;
        return Math.abs(position.x) <= half && Math.abs(position.z) <= half;
    }

    //#region Internals

    private update(_delta: number): void {
        for (const cycle of this.cycles) {
            if (!cycle.alive) continue;
            cycle.trail.update();
        }
    }

    private fixedUpdate(step: number): void {
        for (const cycle of this.cycles) {
            if (!cycle.alive) continue;
            this.steer(cycle, step);

            const speed = this.currentSpeed(cycle);
            cycle.root.position.addScaledVector(cycle.heading, speed * step);
            cycle.root.position.y = 0.32;
            cycle.root.rotation.y = cycle.yaw;

            // Sample the ribbon every few centimeters of travel.
            cycle.sampleTimer += speed * step;
            if (cycle.sampleTimer >= this.options.sampleDistance) {
                cycle.sampleTimer = 0;
                cycle.samples.push(cycle.root.position.clone());
            }
        }

        this.resolveCollisions();
    }

    private steer(cycle: LightCycle, step: number): void {
        const input = this.game.input;
        if (cycle.player) {
            if (input.isDown(this.steerLeft)) cycle.yaw -= cycle.turnRate * step;
            if (input.isDown(this.steerRight)) cycle.yaw += cycle.turnRate * step;
        } else if (cycle.ai) {
            cycle.aiTurnTimer -= step;
            if (cycle.aiTurnTimer <= 0) {
                cycle.aiTurnTimer = THREE.MathUtils.lerp(0.6, 2.2, Math.random());
                const wallDanger = !this.insideArena(cycle.root.position.clone().addScaledVector(cycle.heading, 6));
                const ribbonDanger = this.somethingAhead(cycle, 5);
                if (wallDanger || ribbonDanger || Math.random() < 0.35) {
                    cycle.yaw += (Math.random() < 0.5 ? -1 : 1) * (Math.PI / 2);
                }
            }
        }
        cycle.heading.set(Math.sin(cycle.yaw), 0, Math.cos(cycle.yaw));
    }

    private currentSpeed(cycle: LightCycle): number {
        if (!cycle.player) return cycle.speed;
        if (this.game.input.isDown(this.boostKey)) return cycle.speed * 1.5;
        if (this.game.input.isDown(this.brakeKey)) return cycle.speed * 0.55;
        return cycle.speed;
    }

    /** True when any ribbon sample sits within `distance` straight ahead. */
    private somethingAhead(cycle: LightCycle, distance: number): boolean {
        const ahead = cycle.root.position.clone().addScaledVector(cycle.heading, distance);
        for (const other of this.cycles) {
            if (other === cycle) continue;
            for (let index = 0; index < other.samples.length; index += 3) {
                if ((other.samples[index] as THREE.Vector3).distanceToSquared(ahead) < 4) return true;
            }
        }
        return false;
    }

    private kill(cycle: LightCycle, killer: LightCycle | undefined): void {
        if (!cycle.alive) return;
        cycle.alive = false;
        cycle.root.visible = false;
        // A dead cycle's wall stops colliding, so it must stop showing too.
        cycle.trail.object.visible = false;
        this.game.effects.explosion(cycle.root.position.clone().setY(0.6), 3, cycle.color);
        this.game.effects.text(cycle.root.position.clone().setY(1.6), `${cycle.name} derezzed`, { color: 0xff8a8a });
        this.options.onDeath?.(cycle, killer);

        if (this.aliveCount === 1) {
            const winner = this.cycles.find((candidate) => candidate.alive);
            if (winner) this.options.onWinner?.(winner);
        }
    }

    private material(color: THREE.Color): THREE.MeshStandardMaterial {
        const key = color.getHexString();
        const cached = this.materials.get(key);
        if (cached) return cached;
        const material = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.6, roughness: 0.35, metalness: 0.4 });
        this.materials.set(key, material);
        return material;
    }

    //#endregion Internals
}

/** A ready made rider mesh for a cycle, when a plain box is too plain. */
export function createRider(color: THREE.ColorRepresentation = 0xffffff): THREE.Object3D {
    return createAvatar({ color, height: 1.2, radius: 0.25 });
}
