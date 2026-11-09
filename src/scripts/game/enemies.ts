import * as THREE from 'three';

import * as CONSTANTS from '../Constants/Constants';
import { SYSTEM_ORDER } from '../core/systems';
import { StateMachine } from '../core/state-machine';
import { Health } from './health';
import { setUserData } from '../helpers/object';
import { randomFloat } from '../helpers/random';
import { GROUP } from '../physics/layers';
import { PathFollower, findPathCells, type PathfindingOptions } from '../helpers/pathfinding';
import type { Cell, Grid } from '../helpers/grid';

/**
 * Simple enemies: idle, chase, attack, dead.
 *
 * One manager per scene and one system for all enemies, so twenty enemies cost
 * one loop. They are physics capsules, so they walk up ramps and cannot be
 * pushed through walls, and their health lives in `userData.health`, which means
 * `applyDamage` and the projectile system already work on them.
 */
export type EnemyState = 'idle' | 'chase' | 'attack' | 'dead';

export type EnemyOptions = {
    position: THREE.Vector3 | Vec3;
    /** Hit points. */
    health?: number;
    /** Movement speed in meters per second. */
    speed?: number;
    /** Melee damage per hit. */
    damage?: number;
    /** Distance at which the enemy starts chasing. */
    aggroRange?: number;
    /** Distance at which a melee attack lands. */
    attackRange?: number;
    /** Seconds between melee attacks. */
    attackCooldown?: number;
    /** Seconds between ranged shots. Omit for a melee-only enemy. */
    shootCooldown?: number;
    /** Seconds between ranged shots. */
    projectileSpeed?: number;
    color?: THREE.ColorRepresentation;
    radius?: number;
    height?: number;
    /** How far the enemy wanders before it sees the player. */
    wanderRadius?: number;
    /** Loot granted on death, handed to the manager's `onLoot` callback. */
    loot?: Array<{ itemId: string; amount?: number; chance?: number }>;
    /** Multiplier applied to the health bar colour, e.g. to mark an elite. */
    scale?: number;
    name?: string;
    /** A model to use instead of the capsule. Its origin sits on the ground, facing +z. */
    object?: THREE.Object3D;
};

/**
 * A rule every enemy obeys, e.g. "never enter a safe zone" or "stop chasing
 * someone standing in one". Rules stack; register them with `addRule`.
 */
export type EnemyRule = {
    /** True when enemies must not pursue a target at this position. */
    ignoresTarget?: (target: THREE.Vector3) => boolean;
    /** Adjust the desired velocity in place, e.g. to steer around a zone. */
    steer?: (enemy: Enemy, desired: THREE.Vector3, step: number) => void;
};

export type Enemy = {
    readonly id: number;
    readonly root: THREE.Group;
    readonly health: Health;
    readonly state: StateMachine<EnemyState>;
    readonly options: Required<Pick<EnemyOptions, 'speed' | 'damage' | 'aggroRange' | 'attackRange' | 'attackCooldown'>> & EnemyOptions;
    body: import('../physics/physics').PhysicsBody | undefined;
    attackTimer: number;
    shootTimer: number;
    /** Seconds until the navigation path is planned again. */
    repathTimer: number;
    /** Planned cell path, empty when navigation is off or the enemy is idle. */
    path: Cell[];
    wanderTarget: THREE.Vector3;
    homePosition: THREE.Vector3;
    dead: boolean;
};

export type EnemyManagerOptions = {
    /** Called when an enemy dies, e.g. to drop loot through a `PickupManager`. */
    onDeath?: (game: Game, enemy: Enemy) => void;
    /** Called when an enemy lands a hit on the player. */
    onAttack?: (game: Game, enemy: Enemy, damage: number) => void;
    /** Called every step with the enemy's speed, e.g. to drive walk and idle animations. */
    animate?: (enemy: Enemy, speed: number, step: number) => void;
    /**
     * Optional navigation grid. When given, chasing enemies plan a path around
     * obstacles instead of walking straight at the player, replanning a few times
     * a second rather than every frame.
     */
    navigation?: {
        grid: Grid;
        /** Blocked cells, e.g. walls and cover. Defaults to everything walkable. */
        isWalkable?: (cell: Cell) => boolean;
        /** How often to replan, in seconds. Defaults to 0.5. */
        replanInterval?: number;
        /** Extra pathfinding options, e.g. a cost function for rough terrain. */
        path?: PathfindingOptions;
    };
};

export class EnemyManager {
    /** Enable or disable all AI, e.g. while a menu is open. */
    enabled = true;

    private readonly game: Game;
    private readonly options: EnemyManagerOptions;
    private readonly enemies: Enemy[] = [];
    private readonly rules: EnemyRule[] = [];
    /** One follower per enemy, only used when a navigation grid is configured. */
    private readonly followers = new WeakMap<Enemy, PathFollower>();
    private readonly materials = new Map<string, THREE.MeshStandardMaterial>();
    private readonly bodyGeometry = new THREE.CapsuleGeometry(0.3, 1.1, 6, 12);
    private readonly headGeometry = new THREE.SphereGeometry(0.16, 10, 8);
    private nextId = 1;

    constructor(game: Game, options: EnemyManagerOptions = {}) {
        this.game = game;
        this.options = options;
        game.systems.add({
            name: 'enemies',
            order: SYSTEM_ORDER.GAMEPLAY,
            fixedUpdate: (step) => this.step(step),
        });
    }

    /** Add a rule every enemy obeys. Returns a function that removes it. */
    addRule(rule: EnemyRule): () => void {
        this.rules.push(rule);
        return () => {
            const index = this.rules.indexOf(rule);
            if (index >= 0) this.rules.splice(index, 1);
        };
    }

    /** True when enemies plan paths around obstacles. */
    get navigating(): boolean {
        return this.options.navigation !== undefined;
    }

    /** Living enemies. */
    get count(): number {
        return this.enemies.length;
    }

    get all(): Enemy[] {
        return this.enemies;
    }

    /** Add an enemy to the world. */
    spawn(options: EnemyOptions): Enemy {
        const radius = options.radius ?? 0.3;
        const height = options.height ?? 1.7;
        const scale = options.scale ?? 1;

        const root = new THREE.Group();
        root.name = options.name ?? `enemy-${this.nextId}`;
        root.position.set(options.position.x, options.position.y, options.position.z);
        root.scale.setScalar(scale);
        if (options.object) {
            root.add(options.object);
        } else if (options.color !== undefined) {
            const body = new THREE.Mesh(this.bodyGeometry, this.materialFor(options.color));
            body.castShadow = true;
            body.position.y = height / 2;
            root.add(body);
            const head = new THREE.Mesh(this.headGeometry, this.materialFor(0x1a1a1a));
            head.position.set(0, height + 0.1, 0.22);
            root.add(head);
        } else {
            // Invisible enemy: still a physics target, used for test dummies.
            root.visible = false;
        }
        setUserData(root, { tag: 'enemy', id: `enemy-${this.nextId}` });
        this.game.scene.add(root);

        const health = new Health({ max: options.health ?? 50, invulnerableAfterHit: 0.05 });
        root.userData.health = health;

        const body = this.game.physics.add({
            kind: 'dynamic',
            shape: { type: 'capsule', radius, height },
            position: new THREE.Vector3(root.position.x, root.position.y + height / 2, root.position.z),
            object: root,
            syncObject: true,
            syncOffset: { x: 0, y: -height / 2, z: 0 },
            syncRotation: false,
            fixedRotation: true,
            linearDamping: 6,
            angularDamping: 8,
            friction: 0.6,
            tag: 'enemy',
        });

        const enemy: Enemy = {
            id: this.nextId,
            root,
            health,
            state: new StateMachine<EnemyState>('idle'),
            options: {
                ...options,
                speed: options.speed ?? 2.6,
                damage: options.damage ?? 8,
                aggroRange: options.aggroRange ?? 16,
                attackRange: options.attackRange ?? 1.5,
                attackCooldown: options.attackCooldown ?? 1.1,
            },
            body,
            attackTimer: 0,
            shootTimer: randomFloat(0.4, 1.4),
            repathTimer: randomFloat(0, 0.4),
            path: [],
            wanderTarget: new THREE.Vector3().copy(root.position),
            homePosition: root.position.clone(),
            dead: false,
        };
        this.nextId += 1;
        if (this.options.navigation) this.followers.set(enemy, new PathFollower(this.options.navigation.grid, { tolerance: 0.4 }));

        health.onDeath(() => this.kill(enemy));
        health.onChange((current, max) => {
            if (current < max) this.game.effects.hitPuff(root.position.clone().setY(root.position.y + height * 0.6), 0xff5a5a);
        });
        this.enemies.push(enemy);
        return enemy;
    }

    /** Remove every enemy immediately. */
    clear(): void {
        for (const enemy of [...this.enemies]) this.remove(enemy, false);
    }

    /** Take one enemy out of the world quietly, with no death: e.g. one that wandered too far away. */
    despawn(enemy: Enemy): void {
        this.remove(enemy, false);
    }

    /** The nearest living enemy to a position, or `undefined`. */
    nearest(position: THREE.Vector3 | Vec3, maxDistance = Infinity): Enemy | undefined {
        let best: Enemy | undefined;
        let bestDistance = maxDistance;
        for (const enemy of this.enemies) {
            const distance = enemy.root.position.distanceTo(position instanceof THREE.Vector3 ? position : new THREE.Vector3(position.x, position.y, position.z));
            if (distance < bestDistance) {
                bestDistance = distance;
                best = enemy;
            }
        }
        return best;
    }

    dispose(): void {
        this.clear();
        for (const material of this.materials.values()) material.dispose();
        this.bodyGeometry.dispose();
        this.headGeometry.dispose();
    }

    //#region Internals

    private step(step: number): void {
        if (!this.enabled) return;
        const player = this.game.player;
        const candidate = player && !player.isDead ? player.position : undefined;
        // A target in a safe place is not a target at all.
        const playerPosition = candidate && !this.rules.some((rule) => rule.ignoresTarget?.(candidate)) ? candidate : undefined;
        const eyeHeight = player ? player.eyeHeight * 0.6 : 0;

        for (const enemy of [...this.enemies]) {
            if (enemy.dead || !enemy.body) continue;
            // Health drives the invulnerability window and regeneration; without
            // this call an enemy would stay invulnerable after the first hit.
            enemy.health.update(step);
            enemy.attackTimer = Math.max(0, enemy.attackTimer - step);
            enemy.shootTimer = Math.max(0, enemy.shootTimer - step);

            const position = enemy.root.position;
            const toPlayer = playerPosition ? playerPosition.clone().add(new THREE.Vector3(0, eyeHeight, 0)).sub(position.clone().setY(position.y + 0.9)) : undefined;
            const distanceToPlayer = toPlayer?.length() ?? Infinity;

            enemy.state.set(distanceToPlayer <= enemy.options.attackRange ? 'attack' : distanceToPlayer <= enemy.options.aggroRange ? 'chase' : 'idle');

            const velocity = enemy.body.velocity;
            const desired = new THREE.Vector3();

            if (enemy.state.is('chase') && toPlayer) {
                desired.copy(this.chaseDirection(enemy, playerPosition, toPlayer, step)).setY(0).normalize().multiplyScalar(enemy.options.speed);
            } else if (enemy.state.is('idle')) {
                enemy.path.length = 0;
                enemy.repathTimer = 0;
                if (position.distanceToSquared(enemy.wanderTarget) < 1) {
                    enemy.wanderTarget
                        .copy(enemy.homePosition)
                        .add(new THREE.Vector3(randomFloat(-1, 1), 0, randomFloat(-1, 1)).normalize().multiplyScalar(randomFloat(1, enemy.options.wanderRadius ?? 4)));
                }
                desired.copy(enemy.wanderTarget).sub(position).setY(0).normalize().multiplyScalar(enemy.options.speed * 0.35);
            }

            for (const rule of this.rules) rule.steer?.(enemy, desired, step);
            enemy.body.setVelocity(new THREE.Vector3(desired.x, velocity.y, desired.z));
            this.options.animate?.(enemy, Math.hypot(desired.x, desired.z), step);

            if (desired.lengthSq() > 0.01) {
                const targetYaw = Math.atan2(desired.x, desired.z);
                let difference = targetYaw - enemy.root.rotation.y;
                while (difference > Math.PI) difference -= Math.PI * 2;
                while (difference < -Math.PI) difference += Math.PI * 2;
                enemy.root.rotation.y += THREE.MathUtils.clamp(difference, -8 * step, 8 * step);
            }

            if (enemy.state.is('attack')) this.attack(enemy, player, toPlayer);
            else if (enemy.options.shootCooldown !== undefined && toPlayer && distanceToPlayer <= enemy.options.aggroRange) this.shoot(enemy, toPlayer);
        }
    }

    /**
     * Direction to chase in. With a navigation grid this follows a planned path
     * around obstacles; without one it walks straight at the player.
     */
    private chaseDirection(enemy: Enemy, playerPosition: THREE.Vector3 | undefined, toPlayer: THREE.Vector3, step: number): THREE.Vector3 {
        const navigation = this.options.navigation;
        if (!navigation || !playerPosition) return toPlayer;

        const follower = this.followers.get(enemy);
        if (!follower) return toPlayer;

        enemy.repathTimer -= step;
        if (enemy.repathTimer <= 0) {
            // Replan a few times a second, not every frame: the player rarely moves
            // more than one cell in that time.
            enemy.repathTimer = navigation.replanInterval ?? 0.5;
            const startCell = navigation.grid.worldToCellStrict(enemy.root.position);
            const goalCell = navigation.grid.worldToCellStrict(playerPosition);
            if (startCell && goalCell) {
                const options: PathfindingOptions = { ...navigation.path };
                if (navigation.isWalkable) options.isWalkable = navigation.isWalkable;
                enemy.path = findPathCells(navigation.grid, startCell, goalCell, options);
                follower.setPath(enemy.path);
            }
        }

        // The follower returns nothing once the path is used up, which happens when
        // the enemy is close enough to steer straight at the player.
        const direction = follower.directionFrom(enemy.root.position);
        if (!direction) return toPlayer;
        return TEMP_DIRECTION.set(direction.x, 0, direction.z);
    }

    private attack(enemy: Enemy, player: Game['player'], toPlayer: THREE.Vector3 | undefined): void {
        if (!player || !toPlayer || enemy.attackTimer > 0) return;
        enemy.attackTimer = enemy.options.attackCooldown;
        player.damage(enemy.options.damage, enemy.root);
        this.game.effects.shakeCamera(0.18);
        this.options.onAttack?.(this.game, enemy, enemy.options.damage);
    }

    private shoot(enemy: Enemy, toPlayer: THREE.Vector3): void {
        if (enemy.shootTimer > 0) return;
        enemy.shootTimer = enemy.options.shootCooldown ?? 1.6;
        const origin = enemy.root.position.clone().setY(enemy.root.position.y + 1.1);
        this.game.projectiles.spawn({
            origin,
            direction: toPlayer.clone().normalize(),
            speed: enemy.options.projectileSpeed ?? 18,
            damage: Math.max(4, enemy.options.damage * 0.6),
            color: 0xff7a7a,
            ignoreTag: 'enemy',
            size: 0.18,
            groups: GROUP.enemyProjectile,
        });
        this.game.effects.muzzle(origin, toPlayer.clone().normalize());
    }

    private kill(enemy: Enemy): void {
        if (enemy.dead) return;
        enemy.dead = true;
        enemy.state.set('dead');
        this.game.effects.particles.burst(enemy.root.position.clone().setY(enemy.root.position.y + 0.9), {
            count: 34,
            color: enemy.options.color ?? 0xff7a7a,
            size: 0.12,
            speed: 5,
            spread: Math.PI,
            lifetime: 0.55,
        });
        this.options.onDeath?.(this.game, enemy);
        this.remove(enemy, true);    }

    private remove(enemy: Enemy, keepRoot: boolean): void {
        const index = this.enemies.indexOf(enemy);
        if (index >= 0) this.enemies.splice(index, 1);
        if (enemy.body) {
            this.game.physics.remove(enemy.body);
            enemy.body = undefined;
        }
        if (!keepRoot) enemy.root.removeFromParent();
        else this.fadeAndRemove(enemy.root);
    }

    private fadeAndRemove(root: THREE.Group): void {
        let elapsed = 0;
        const unregister = this.game.systems.add({
            name: `enemy-despawn-${root.name}`,
            order: SYSTEM_ORDER.EFFECTS,
            update: (delta) => {
                elapsed += delta;
                root.position.y -= delta * 0.6;
                root.scale.multiplyScalar(1 - delta * 1.4);
                if (elapsed < 0.6) return;
                unregister();
                root.removeFromParent();
            },
        });
    }

    private materialFor(color: THREE.ColorRepresentation): THREE.MeshStandardMaterial {
        const key = new THREE.Color(color).getHexString();
        const cached = this.materials.get(key);
        if (cached) return cached;
        const material = new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: 0.55, metalness: 0.05 });
        this.materials.set(key, material);
        return material;
    }

    //#endregion Internals
}

/** Scratch vector for path following, so chasing allocates nothing per frame. */
const TEMP_DIRECTION = new THREE.Vector3();

/** Tag used to keep enemies from shooting each other. */
export const ENEMY_TAG = 'enemy';

/** Default health for an enemy, useful when a template exposes a difficulty slider. */
export const DEFAULT_ENEMY_HEALTH = 50;

/** Default melee damage, scaled by difficulty in the arena template. */
export const DEFAULT_ENEMY_DAMAGE = 8;

/** Shared constant so templates do not invent their own aggro range. */
export const DEFAULT_AGGRO_RANGE = CONSTANTS.GAMEPLAY.INTERACT_RANGE * 5;
