import * as THREE from 'three';

import * as CONSTANTS from '../Constants/Constants';
import { SYSTEM_ORDER } from '../core/systems';
import { applySpread } from '../helpers/vector';
import { applyDamage } from './damage';
import { GROUP } from '../physics/layers';
import type { PhysicsBody, RaycastHit } from '../physics/physics';

/**
 * Pooled projectiles with swept hit detection.
 *
 * Bullets are dynamic rigid bodies with continuous collision detection, and
 * each physics step the system sweeps a short ray along the travelled segment
 * to find out what was hit. That gives exact hit points without needing a
 * collision event on every enemy.
 *
 * Everything is pooled: spawning never allocates a mesh, a body or a material.
 */
export type ProjectileSpawnOptions = {
    /** Start position in world space. */
    origin: THREE.Vector3;
    /** Unit direction of travel. */
    direction: THREE.Vector3;
    /** Extra speed added to the shooter's velocity, usually the player's. */
    inheritVelocity?: THREE.Vector3 | undefined;
    speed?: number | undefined;
    /** Radius of the projectile collider. */
    radius?: number | undefined;
    damage?: number | undefined;
    /** Maximum travel distance before the projectile disappears. */
    range?: number | undefined;
    /** Seconds before it disappears regardless of distance. */
    lifetime?: number | undefined;
    /** Collider and visual size. Defaults to `radius * 2`. */
    size?: number | undefined;
    color?: THREE.ColorRepresentation | undefined;
    /** Downward acceleration factor, 0 for a straight shot. */
    gravityScale?: number | undefined;
    /** Angle in radians that the shot is randomly fanned out by. */
    spread?: number | undefined;
    /** Tag whose objects are never hit, usually 'player'. */
    ignoreTag?: string | undefined;
    /** Only objects that report `userData.health` take damage. */
    damageableOnly?: boolean | undefined;
    /** Extra damage for hits in the upper quarter of the target. */
    headshotMultiplier?: number | undefined;
    /** Impulse applied to the target away from the impact. */
    knockback?: number | undefined;
    /** Body that fired this shot, always ignored, e.g. the shooter's capsule. */
    owner?: PhysicsBody | undefined;
    /**
     * Collision layers for the projectile. Defaults to the player's shot group,
     * which collides with the world and enemies but never with the player.
     * Enemies pass `GROUP.enemyProjectile`.
     */
    groups?: number;
    onHit?: ((hit: RaycastHit | undefined, projectile: Projectile) => void) | undefined;
};

/** Spawn options with the values the system fills in. */
export type ProjectileOptions = ProjectileSpawnOptions & {
    origin: THREE.Vector3;
    direction: THREE.Vector3;
    damage: number;
    range: number;
};

/** One live projectile. Returned by `spawn` so callers can track it. */
export type Projectile = {
    readonly id: number;
    /** Visual mesh, positioned from the physics body every frame. */
    readonly object: THREE.Mesh;
    readonly body: PhysicsBody;
    readonly direction: THREE.Vector3;
    options: ProjectileOptions;
    travelled: number;
    age: number;
    active: boolean;
};

type Slot = {
    id: number;
    mesh: THREE.Mesh;
    material: THREE.MeshBasicMaterial;
    body: PhysicsBody;
    projectile: Projectile;
    active: boolean;
    previous: THREE.Vector3;
    stalledSteps: number;
};

export type ProjectileSystemOptions = {
    /** Number of recycled projectiles. 64 is plenty for a shooter. */
    poolSize?: number;
    /** Tag applied to projectile bodies, so shooters can ignore them. */
    tag?: string;
};

export class ProjectileSystem {
    /** Enable or disable spawning, e.g. while a menu is open. */
    enabled = true;

    private readonly game: Game;
    private readonly slots: Slot[] = [];
    private readonly geometry: THREE.SphereGeometry;
    /** Extra length added to every sweep, so a hit exactly at the segment end still lands. */
    private readonly sweepMargin = 0.05;
    private readonly unregister: () => void;

    constructor(game: Game, options: ProjectileSystemOptions = {}) {
        this.game = game;
        const poolSize = options.poolSize ?? CONSTANTS.PROJECTILE.POOL_SIZE;
        const tag = options.tag ?? 'projectile';
        this.geometry = new THREE.SphereGeometry(1, 10, 8);

        for (let index = 0; index < poolSize; index += 1) {
            const material = new THREE.MeshBasicMaterial({ color: 0xffe9a8, toneMapped: false });
            const mesh = new THREE.Mesh(this.geometry, material);
            mesh.name = `${tag}-${index}`;
            mesh.visible = false;
            mesh.frustumCulled = false;
            game.scene.add(mesh);

            const body = game.physics.add({
                kind: 'dynamic',
                shape: { type: 'sphere', radius: CONSTANTS.PROJECTILE.RADIUS },
                object: mesh,
                syncObject: true,
                ccd: true,
                events: false,
                friction: 0,
                restitution: 0,
                angularDamping: 0,
                linearDamping: 0,
                gravityScale: 0,
                tag,
                groups: GROUP.playerProjectile,
            });
            body.setEnabled(false);

            const projectile: Projectile = {
                id: index + 1,
                object: mesh,
                body,
                direction: new THREE.Vector3(0, 0, 1),
                options: {
                    origin: new THREE.Vector3(),
                    direction: new THREE.Vector3(0, 0, 1),
                    damage: CONSTANTS.PROJECTILE.DAMAGE,
                    range: CONSTANTS.PROJECTILE.RANGE,
                },
                travelled: 0,
                age: 0,
                active: false,
            };
            this.slots.push({ id: index + 1, mesh, material, body, projectile, active: false, previous: new THREE.Vector3(), stalledSteps: 0 });
        }

        this.unregister = game.systems.add({
            name: 'projectiles',
            order: SYSTEM_ORDER.PHYSICS_SYNC + 2,
            fixedUpdate: (step) => this.step(step),
        });
    }

    /** Number of projectiles in flight. */
    get activeCount(): number {
        return this.slots.reduce((total, slot) => total + (slot.active ? 1 : 0), 0);
    }

    /** Live projectiles, for advanced use such as homing behaviour. */
    get active(): Projectile[] {
        return this.slots.filter((slot) => slot.active).map((slot) => slot.projectile);
    }

    /** Fire a projectile. Returns `undefined` when the pool is exhausted. */
    spawn(options: ProjectileSpawnOptions & { direction: THREE.Vector3 }): Projectile | undefined {
        if (!this.enabled) return undefined;
        const slot = this.slots.find((candidate) => !candidate.active);
        if (!slot) {
            console.warn('[projectiles] pool exhausted, dropping a shot');
            return undefined;
        }

        const speed = options.speed ?? CONSTANTS.PROJECTILE.SPEED;
        const radius = options.radius ?? CONSTANTS.PROJECTILE.RADIUS;
        const size = options.size ?? radius * 2;
        const direction = options.spread ? applySpread(options.direction, options.spread) : options.direction.clone().normalize();

        slot.active = true;
        slot.mesh.visible = true;
        slot.mesh.scale.setScalar(size / 2);
        slot.material.color.set(options.color ?? 0xffe9a8);
        slot.body.collider.setRadius(radius);
        slot.body.setEnabled(true);
        slot.body.collider.setCollisionGroups(options.groups ?? GROUP.playerProjectile);
        slot.body.setPosition(options.origin);
        slot.body.setQuaternion(new THREE.Quaternion());

        const velocity = direction.clone().multiplyScalar(speed);
        if (options.inheritVelocity) velocity.add(options.inheritVelocity);
        slot.body.setVelocity(velocity);

        const projectile = slot.projectile;
        projectile.direction.copy(direction);
        projectile.options = { ...options, damage: options.damage ?? CONSTANTS.PROJECTILE.DAMAGE, range: options.range ?? CONSTANTS.PROJECTILE.RANGE };
        projectile.travelled = 0;
        projectile.age = 0;
        projectile.active = true;

        slot.previous.copy(options.origin);
        slot.stalledSteps = 0;
        slot.mesh.position.copy(options.origin);
        this.game.events.emit('projectile:spawned', { id: projectile.id, object: slot.mesh });
        return projectile;
    }

    /**
     * Fire from the camera, i.e. from where the crosshair points.
     * This is the call a first or third person template uses.
     */
    spawnFromCamera(options: Omit<ProjectileSpawnOptions, 'origin' | 'direction'> & { origin?: THREE.Vector3 } = {}): Projectile | undefined {
        const camera = this.game.camera;
        const direction = camera.getWorldDirection(new THREE.Vector3());
        const origin = options.origin ?? camera.position.clone().addScaledVector(direction, 0.4);
        return this.spawn({ ...options, origin, direction });
    }

    /**
     * Fire in the direction an object faces, from just in front of it.
     * This is the call a turret, an enemy or a vehicle weapon uses.
     */
    spawnForward(from: THREE.Object3D, options: Omit<ProjectileSpawnOptions, 'origin' | 'direction'> & { direction?: THREE.Vector3; muzzleOffset?: number; up?: number } = {}): Projectile | undefined {
        const direction = options.direction ?? from.getWorldDirection(new THREE.Vector3());
        const origin = from.getWorldPosition(new THREE.Vector3()).addScaledVector(direction, options.muzzleOffset ?? 0.6);
        if (options.up) origin.y += options.up;
        return this.spawn({ ...options, origin, direction });
    }

    /**
     * Instant hit with no travelling body. Cheaper and always accurate, at the
     * cost of visible travel time, which suits snipers and top-down shooters.
     */
    hitscan(options: {
        origin: THREE.Vector3;
        direction: THREE.Vector3;
        range?: number | undefined;
        damage?: number | undefined;
        ignoreTag?: string | undefined;
        color?: THREE.ColorRepresentation | undefined;
        headshotMultiplier?: number | undefined;
    }): RaycastHit | undefined {
        const range = options.range ?? CONSTANTS.PROJECTILE.RANGE;
        const hit = this.game.physics.raycast(options.origin, options.direction, range, (body) => this.canHit(body, options.ignoreTag, false));
        this.applyHit(hit, options);
        return hit;
    }

    /** Sweep one segment, e.g. a melee swing or a laser beam that is not a body. */
    sweep(
        origin: THREE.Vector3,
        direction: THREE.Vector3,
        distance: number,
        options: { damage?: number | undefined; ignoreTag?: string | undefined; color?: THREE.ColorRepresentation | undefined; damageableOnly?: boolean | undefined; headshotMultiplier?: number | undefined } = {},
    ): RaycastHit | undefined {
        const hit = this.game.physics.raycast(origin, direction, distance, (body) => this.canHit(body, options.ignoreTag, options.damageableOnly));
        this.applyHit(hit, options);
        return hit;
    }

    /** Despawn every projectile, e.g. when the level restarts. */
    clear(): void {
        for (const slot of this.slots) this.despawn(slot, undefined);
    }

    dispose(): void {
        this.unregister();
        for (const slot of this.slots) {
            this.despawn(slot, undefined);
            this.game.physics.remove(slot.body);
            slot.mesh.removeFromParent();
            slot.material.dispose();
        }
        this.geometry.dispose();
        this.slots.length = 0;
    }

    /** One physics step for every live projectile. */
    private step(step: number): void {
        for (const slot of this.slots) {
            if (!slot.active) continue;
            const projectile = slot.projectile;
            projectile.age += step;

            const position = slot.body.position;
            projectile.travelled += slot.previous.distanceTo(position);

            // Sweep the segment the projectile just crossed, so a fast shot
            // cannot tunnel through a thin wall.
            // Contacts from the step that just ran are exact, so they are the
            // primary test. The sweep is the backstop for a shot that moved past
            // everything between two steps.
            const contact = this.findContact(slot, projectile);
            const segment = position.clone().sub(slot.previous);
            const distance = segment.length();
            const hit =
                contact !== undefined
                    ? this.hitFromBody(contact, position, segment)
                    : distance > 1e-5
                      ? this.game.physics.raycast(
                            slot.previous,
                            segment,
                            distance + this.sweepMargin,
                            (body) => this.canHit(body, projectile.options.ignoreTag, projectile.options.damageableOnly, projectile.options.owner),
                            slot.body,
                        )
                      : undefined;
            slot.previous.copy(position);

            if (hit) {
                this.applyHit(hit, projectile.options);
                this.despawn(slot, hit);
                continue;
            }

            // A projectile that stopped moving is resting on or inside geometry.
            slot.stalledSteps = distance < 1e-4 ? slot.stalledSteps + 1 : 0;

            const exceededRange = projectile.travelled >= projectile.options.range;
            const exceededLife = projectile.options.lifetime !== undefined && projectile.age >= projectile.options.lifetime;
            if (exceededRange || exceededLife || slot.stalledSteps > 3) this.despawn(slot, undefined);
        }
    }

    /** The first collider this projectile is touching, filtered like a shot. */
    private findContact(slot: Slot, projectile: Projectile): PhysicsBody | undefined {
        let found: PhysicsBody | undefined;
        this.game.physics.world.contactPairsWith(slot.body.collider, (other) => {
            if (found) return;
            const body = this.game.physics.bodyFromCollider(other.handle);
            if (!body || body.handle === slot.body.handle) return;
            if (!this.canHit(body, projectile.options.ignoreTag, projectile.options.damageableOnly, projectile.options.owner)) return;
            found = body;
        });
        return found;
    }

    /** Build a hit record from a touched body, using the projectile's own transform. */
    private hitFromBody(body: PhysicsBody, position: THREE.Vector3, segment: THREE.Vector3): RaycastHit {
        const normal = segment.lengthSq() > 0 ? segment.clone().normalize().negate() : new THREE.Vector3(0, 1, 0);
        return { point: position.clone(), normal, distance: 0, object: body.object, body };
    }

    /** Apply damage and effects for a hit, shared by every kind of shot. */
    private applyHit(
        hit: RaycastHit | undefined,
        options: { damage?: number | undefined; color?: THREE.ColorRepresentation | undefined; headshotMultiplier?: number | undefined; knockback?: number | undefined },
    ): void {
        if (!hit) return;
        if (hit.object) {
            applyDamage(this.game, hit.object, options.damage ?? CONSTANTS.PROJECTILE.DAMAGE, {
                point: hit.point,
                headshotMultiplier: options.headshotMultiplier,
                knockback: options.knockback,
            });
        }
        if (options.color === undefined) this.game.effects.impact(hit.point);
        else this.game.effects.impact(hit.point, { color: options.color });
    }

    private canHit(body: PhysicsBody, ignoreTag: string | undefined, damageableOnly: boolean | undefined, owner?: PhysicsBody): boolean {
        if (owner && body.handle === owner.handle) return false;
        if (ignoreTag && body.tag === ignoreTag) return false;
        if (damageableOnly && !body.object?.userData.health) return false;
        return true;
    }

    private despawn(slot: Slot, hit: RaycastHit | undefined): void {
        if (!slot.active) return;
        slot.active = false;
        slot.projectile.active = false;
        slot.mesh.visible = false;
        slot.body.setEnabled(false);
        slot.body.setVelocity(new THREE.Vector3());
        if (hit) this.game.events.emit('projectile:hit', { id: slot.projectile.id, object: hit.object ?? slot.mesh, point: hit.point });
        slot.projectile.options.onHit?.(hit, slot.projectile);
    }
}
