import * as THREE from 'three';

import * as CONSTANTS from '../Constants/Constants';
import { SYSTEM_ORDER } from '../core/systems';
import { Health } from './health';
import { CharacterBody } from '../physics/character';

/**
 * The thing the player controls.
 *
 * Holds the visible root, the physics capsule, health and lives. Movement is
 * left to whichever control scheme is active: it only sets
 * `player.body.velocity`. Death, respawn and the life count live here, so every
 * template gets identical behaviour.
 */
export type PlayerOptions = {
    /** Feet position of the first spawn. */
    position?: Vec3;
    /** Visual model, usually a loaded glTF clone. */
    object?: THREE.Object3D;
    radius?: number;
    height?: number;
    /** Eye height above the feet, used for first person cameras. */
    eyeHeight?: number;
    maxHealth?: number;
    lives?: number;
    /** Seconds spent dead before respawning. */
    respawnDelay?: number;
    /** Seconds of immunity after taking damage. */
    invulnerableAfterHit?: number;
    /** Health restored per second after `regenDelay` without damage. */
    regenPerSecond?: number;
    regenDelay?: number;
    /** Disable physics for puzzle style games where the player floats. */
    physics?: boolean;
};

export class Player {
    /** Visual root, added to the scene by the constructor. */
    readonly root: THREE.Group;
    /** Physics capsule. Always present, even for floating players. */
    readonly body: CharacterBody;
    readonly health: Health;

    lives: number;
    respawnDelay: number;
    eyeHeight: number;
    /** Where the player returns to on death. */
    spawnPoint: THREE.Vector3;
    /** Seconds left before an automatic respawn, `0` when alive. */
    respawnTimer = 0;

    private readonly game: Game;
    private readonly startingLives: number;
    private deathHandled = false;
    private frozenFlag = false;

    constructor(game: Game, options: PlayerOptions = {}) {
        this.game = game;
        this.lives = options.lives ?? CONSTANTS.GAMEPLAY.STARTING_LIVES;
        this.startingLives = this.lives;
        this.respawnDelay = options.respawnDelay ?? CONSTANTS.GAMEPLAY.RESPAWN_DELAY;
        this.eyeHeight = options.eyeHeight ?? CONSTANTS.PLAYER_DEFAULTS.EYE_HEIGHT;
        this.health = new Health({
            max: options.maxHealth ?? CONSTANTS.GAMEPLAY.MAX_HEALTH,
            invulnerableAfterHit: options.invulnerableAfterHit ?? 0,
            regenPerSecond: options.regenPerSecond ?? 0,
            regenDelay: options.regenDelay ?? CONSTANTS.GAMEPLAY.HEALTH_REGEN_DELAY,
        });

        const position = options.position ?? CONSTANTS.PLAYER_DEFAULTS.START_POSITION;
        this.spawnPoint = new THREE.Vector3(position.x, position.y, position.z);

        this.root = new THREE.Group();
        this.root.name = CONSTANTS.NAMES.PLAYER;
        this.root.userData.tag = 'player';
        if (options.object) this.root.add(options.object);
        game.scene.add(this.root);
        // Projectiles, hazards and explosions find health on `userData`. Going through
        // `damage` keeps the HUD and the damage events in step with any hit.
        const health = this.health;
        this.root.userData.health = {
            damage: (amount: number) => this.damage(amount),
            get isDead() {
                return health.isDead;
            },
            get current() {
                return health.current;
            },
            get max() {
                return health.max;
            },
        } satisfies DamageTarget;

        this.body = new CharacterBody(game.physics, {
            position: this.spawnPoint,
            radius: options.radius ?? CONSTANTS.PLAYER_DEFAULTS.RADIUS,
            height: options.height ?? CONSTANTS.PLAYER_DEFAULTS.HEIGHT,
            object: this.root,
            pushBodies: true,
            mass: 80,
            frozen: options.physics === false,
            // 'player' lets projectiles and enemies ignore the player's own capsule.
            tag: 'player',
        });

        this.bindHealthEvents();
        game.systems.add({
            name: 'player',
            order: SYSTEM_ORDER.GAMEPLAY,
            update: (delta) => this.update(delta),
        });
    }

    /** Feet position in world space. */
    get position(): THREE.Vector3 {
        return this.body.position;
    }

    set position(value: THREE.Vector3 | Vec3) {
        this.body.teleport(value);
    }

    /** Eye position, the anchor for a first person camera. */
    get eyePosition(): THREE.Vector3 {
        return this.body.eyePosition(this.eyeHeight);
    }

    /** Aim direction, taken from the visual root's forward axis. */
    get forward(): THREE.Vector3 {
        return new THREE.Vector3(0, 0, 1).applyQuaternion(this.root.quaternion);
    }

    /** True while alive and allowed to act. */
    get isAlive(): boolean {
        return !this.health.isDead;
    }

    /** True while dead and waiting to respawn. */
    get isDead(): boolean {
        return this.health.isDead;
    }

    /** True while the player may not move, e.g. during a death animation. */
    get frozen(): boolean {
        return this.frozenFlag;
    }

    set frozen(value: boolean) {
        this.frozenFlag = value;
        this.body.frozen = value;
    }

    /** Move the player instantly, e.g. after a teleport pad. */
    teleport(position: THREE.Vector3 | Vec3, keepVelocity = false): void {
        const velocity = this.body.velocity.clone();
        this.body.teleport(position);
        if (keepVelocity) this.body.velocity.copy(velocity);
        this.game.events.emit('player:respawn', { position: this.position });
    }

    /** Remember a new respawn point, e.g. at a checkpoint. */
    setSpawnPoint(position: THREE.Vector3 | Vec3): void {
        this.spawnPoint.set(position.x, position.y, position.z);
    }

    /** Apply damage, ignoring hits while invulnerable. */
    damage(amount: number, source?: THREE.Object3D): number {
        const applied = this.health.damage(amount);
        if (applied <= 0) return 0;
        this.game.events.emit('player:damage', { amount: applied, health: this.health.current });
        if (source) this.game.events.emit('hit:taken', { object: source, damage: applied });
        return applied;
    }

    /** Restore health. */
    heal(amount: number): void {
        const applied = this.health.heal(amount);
        if (applied > 0) this.game.events.emit('player:heal', { amount: applied, health: this.health.current });
    }

    /** Kill the player outright, e.g. from a kill trigger. */
    kill(): void {
        this.health.kill();
    }

    /** Remove a life and respawn, or end the run when no lives are left. */
    handleDeath(): void {
        if (this.deathHandled) return;
        this.deathHandled = true;
        this.lives = Math.max(0, this.lives - 1);
        this.game.events.emit('player:death', { livesLeft: this.lives });
        this.game.events.emit('player:lives', { lives: this.lives });
        this.frozen = true;

        if (this.lives <= 0) {
            this.game.state.set('dead');
            return;
        }
        this.respawnTimer = this.respawnDelay;
    }

    /** Put the player back at the spawn point at full health. */
    respawn(): void {
        this.deathHandled = false;
        this.frozen = false;
        this.respawnTimer = 0;
        this.health.reset();
        this.health.setInvulnerable(CONSTANTS.GAMEPLAY.INVULNERABLE_TIME);
        this.body.teleport(this.spawnPoint);
        this.game.events.emit('player:respawn', { position: this.position });
    }

    /** Reset lives, health and position, e.g. on a full restart. */
    restart(position?: THREE.Vector3 | Vec3): void {
        if (position) this.setSpawnPoint(position);
        this.lives = this.startingLives;
        this.game.events.emit('player:lives', { lives: this.lives });
        this.deathHandled = false;
        this.respawn();
    }

    /** Called by the player system every frame. */
    update(delta: number): void {
        this.health.update(delta);

        if (this.isDead) {
            if (this.respawnTimer > 0) {
                this.respawnTimer -= delta;
                if (this.respawnTimer <= 0) this.respawn();
            }
            return;
        }

        // Falling out of the world always costs health, so a missing floor is
        // noticeable instead of a silent infinite fall.
        if (this.position.y < CONSTANTS.GAMEPLAY.KILL_PLANE_Y) {
            this.damage(CONSTANTS.GAMEPLAY.FALL_DAMAGE);
            if (this.isAlive) this.teleport(this.spawnPoint);
        }
    }

    destroy(): void {
        this.body.destroy();
        this.root.removeFromParent();
    }

    private bindHealthEvents(): void {
        this.health.onDeath(() => this.handleDeath());
        this.health.onChange((current, max) => this.game.hud.setHealth(current, max));
    }
}
