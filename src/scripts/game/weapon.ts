import * as THREE from 'three';

import * as CONSTANTS from '../Constants/Constants';
import { SYSTEM_ORDER } from '../core/systems';
import { Cooldown } from '../helpers/timing';
import type { ProjectileSystem } from './projectiles';

/**
 * A gun the player can fire.
 *
 * Handles fire rate, hold-to-fire, spread, muzzle flash, magazines, reserve
 * ammo from the inventory and reloads. Templates create one and it wires itself
 * to the `attack` and `reload` actions, so no template needs its own shoot code.
 */
export type WeaponOptions = {
    damage?: number;
    /** Muzzle velocity in meters per second. */
    speed?: number;
    /** Shots per second. */
    fireRate?: number;
    /** Cone half angle in radians added to every shot. */
    spread?: number;
    /** Hold to keep firing. False makes one shot per click. */
    automatic?: boolean;
    /** Colour of the projectile and its impact sparks. */
    color?: THREE.ColorRepresentation;
    /** Projectile size in meters. */
    size?: number;
    /** Maximum travel distance. */
    range?: number;
    /** Inventory item consumed per shot. Omit for unlimited ammo. */
    ammoItem?: string;
    /** Rounds in one magazine. Omit for no magazine, ammo is spent directly. */
    magazineSize?: number;
    /** Seconds a reload takes. */
    reloadTime?: number;
    /** Extra damage for hits in the upper quarter of a target. */
    headshotMultiplier?: number;
    /** Impulse applied to whatever is hit. */
    knockback?: number;
    /** Shake added to the camera per shot. */
    recoil?: number;
    /** Where the shots come from, `'camera'` by default. */
    origin?: 'camera' | (() => THREE.Vector3);
    /**
     * Direction the shots travel. Defaults to the camera's forward vector; a
     * top-down shooter overrides it with the direction to the mouse.
     */
    direction?: () => THREE.Vector3;
    /** Fires `'projectile'` (travelling) or `'hitscan'` (instant) shots. */
    mode?: 'projectile' | 'hitscan';
    /** Tag that shots ignore, defaults to `'player'`. */
    ignoreTag?: string;
    /** Called whenever the ammo count changes, for the HUD. */
    onAmmoChange?: (magazine: number | undefined, reserve: number | undefined) => void;
    /** Called when a shot is fired, e.g. to play a sound or add a muzzle flash. */
    onFire?: (origin: THREE.Vector3, direction: THREE.Vector3) => void;
    /** Called when the trigger is pulled with an empty magazine. */
    onEmpty?: () => void;
};

export class Weapon {
    /** Set false to stop firing, e.g. while a menu is open. */
    enabled = true;
    /** Rounds left in the magazine, `undefined` when there is no magazine. */
    magazine: number | undefined;
    /** True while a reload is in progress. */
    reloading = false;

    readonly options: Required<Pick<WeaponOptions, 'damage' | 'speed' | 'fireRate' | 'spread' | 'automatic' | 'range' | 'size' | 'color' | 'reloadTime' | 'mode' | 'ignoreTag'>> & WeaponOptions;

    private readonly game: Game;
    private readonly projectiles: ProjectileSystem;
    private readonly fireCooldown: Cooldown;
    private readonly reloadCooldown: Cooldown;
    private readonly originScratch = new THREE.Vector3();
    private readonly directionScratch = new THREE.Vector3();

    constructor(game: Game, options: WeaponOptions = {}) {
        this.game = game;
        this.projectiles = game.projectiles;
        this.options = {
            ...options,
            damage: options.damage ?? CONSTANTS.PROJECTILE.DAMAGE,
            speed: options.speed ?? CONSTANTS.PROJECTILE.SPEED,
            fireRate: options.fireRate ?? CONSTANTS.PROJECTILE.FIRE_RATE,
            spread: options.spread ?? 0.01,
            automatic: options.automatic ?? true,
            range: options.range ?? CONSTANTS.PROJECTILE.RANGE,
            size: options.size ?? CONSTANTS.PROJECTILE.RADIUS * 2,
            color: options.color ?? 0xffe9a8,
            reloadTime: options.reloadTime ?? 1.4,
            mode: options.mode ?? 'projectile',
            ignoreTag: options.ignoreTag ?? 'player',
        };
        this.magazine = options.magazineSize;
        this.fireCooldown = new Cooldown(1 / this.options.fireRate, true);
        this.reloadCooldown = new Cooldown(this.options.reloadTime, true);

        game.systems.add({
            name: 'weapon',
            order: SYSTEM_ORDER.GAMEPLAY + 2,
            update: (delta) => this.update(delta),
        });
        this.notifyAmmo();
    }

    /** Reserve ammo left in the inventory, `undefined` for unlimited ammo. */
    get reserve(): number | undefined {
        return this.options.ammoItem ? this.game.inventory.count(this.options.ammoItem) : undefined;
    }

    /** True when the weapon can fire right now. */
    get canFire(): boolean {
        if (!this.enabled || this.reloading || !this.fireCooldown.ready) return false;
        return this.magazine === undefined || this.magazine > 0;
    }

    /** Fire one shot, ignoring the fire rate. Returns false when it could not fire. */
    fireNow(): boolean {
        const origin = this.resolveOrigin();
        const direction = this.resolveDirection();
        if (this.magazine !== undefined && this.magazine <= 0) {
            this.options.onEmpty?.();
            this.startReload();
            return false;
        }

        this.fireCooldown.trigger(1 / this.options.fireRate);
        if (this.magazine !== undefined) this.magazine -= 1;

        const common = {
            origin,
            direction,
            damage: this.options.damage,
            range: this.options.range,
            color: this.options.color,
            spread: this.options.spread,
            ignoreTag: this.options.ignoreTag,
            headshotMultiplier: this.options.headshotMultiplier,
            knockback: this.options.knockback,
            owner: this.game.player?.body.body,
        };

        if (this.options.mode === 'hitscan') this.projectiles.hitscan(common);
        else this.projectiles.spawn({ ...common, speed: this.options.speed, size: this.options.size });

        const muzzlePosition = origin.clone().addScaledVector(direction, 0.5);
        this.game.effects.muzzle(muzzlePosition, direction);
        if (this.options.recoil) this.game.effects.shake.add(this.options.recoil);
        this.options.onFire?.(origin, direction);
        this.notifyAmmo();

        if (this.magazine === 0) this.startReload();
        return true;
    }

    /** Begin a reload, pulling rounds from the inventory. */
    startReload(): boolean {
        if (this.reloading || this.options.magazineSize === undefined) return false;
        if (this.magazine === this.options.magazineSize) return false;

        const ammoItem = this.options.ammoItem;
        if (ammoItem) {
            const reserve = this.game.inventory.count(ammoItem);
            if (reserve <= 0) {
                this.options.onEmpty?.();
                return false;
            }
        }
        this.reloading = true;
        this.reloadCooldown.trigger(this.options.reloadTime);
        return true;
    }

    /** Add rounds to the magazine without playing the reload. */
    refill(): void {
        if (this.options.magazineSize === undefined) return;
        this.magazine = this.options.magazineSize;
        this.notifyAmmo();
    }

    private update(delta: number): void {
        this.fireCooldown.update(delta);
        this.reloadCooldown.update(delta);

        if (this.reloading) {
            if (!this.reloadCooldown.ready) return;
            this.reloading = false;
            this.finishReload();
        }

        if (this.game.input.wasPressed('reload')) this.startReload();
        if (!this.enabled) return;

        const wantsToFire = this.options.automatic ? this.game.input.isDown('attack') : this.game.input.wasPressed('attack');
        if (wantsToFire && this.canFire) this.fireNow();
    }

    private finishReload(): void {
        const size = this.options.magazineSize;
        if (size === undefined) return;
        const ammoItem = this.options.ammoItem;
        if (!ammoItem) {
            this.magazine = size;
        } else {
            const needed = size - (this.magazine ?? 0);
            const available = this.game.inventory.count(ammoItem);
            const taken = Math.min(needed, available);
            if (taken > 0 && this.game.inventory.remove(ammoItem, taken)) this.magazine = (this.magazine ?? 0) + taken;
        }
        this.notifyAmmo();
    }

    private resolveOrigin(): THREE.Vector3 {
        const custom = this.options.origin;
        if (typeof custom === 'function') return custom();
        return this.originScratch.copy(this.game.camera.position).addScaledVector(this.resolveDirection(), 0.5);
    }

    /** Shot direction: the override when given, otherwise the camera forward. */
    private resolveDirection(): THREE.Vector3 {
        const custom = this.options.direction;
        if (custom) {
            const direction = custom();
            if (direction.lengthSq() > 0) return direction.normalize();
        }
        return this.game.camera.getWorldDirection(this.directionScratch);
    }

    private notifyAmmo(): void {
        this.options.onAmmoChange?.(this.magazine, this.reserve);
    }

    /** Damage per shot, exposed so a pickup can upgrade the weapon. */
    get damage(): number {
        return this.options.damage;
    }

    set damage(value: number) {
        this.options.damage = value;
    }

    /** Shots per second, exposed for upgrades and debug overlays. */
    get fireRate(): number {
        return this.options.fireRate;
    }

    set fireRate(value: number) {
        this.options.fireRate = Math.max(0.05, value);
    }
}
