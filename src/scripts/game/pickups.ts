import * as THREE from 'three';

import * as CONSTANTS from '../Constants/Constants';
import { SYSTEM_ORDER } from '../core/systems';
import { randomFloat } from '../helpers/random';
import { setUserData } from '../helpers/object';

/**
 * Collectible items.
 *
 * One manager per scene, one system for all pickups, so a hundred coins cost a
 * hundred meshes and a single loop. Pickups can be taken by walking into them,
 * by pressing interact, or both.
 */
export type PickupKind = 'orb' | 'box' | 'capsule' | 'coin';

export type PickupOptions = {
    position: THREE.Vector3 | Vec3;
    /** Item granted on collection. Omit for a pure effect pickup. */
    itemId?: string;
    /** Amount of `itemId` granted, defaults to 1. */
    amount?: number;
    /** Health restored on collection. */
    heal?: number;
    /** How the pickup can be taken. `'touch'` by default. */
    collect?: 'touch' | 'interact' | 'both';
    kind?: PickupKind;
    color?: THREE.ColorRepresentation;
    /** Radius of the visual and of the touch trigger. */
    size?: number;
    /** Seconds per full spin. 0 disables spinning. */
    spin?: number;
    /** Vertical bob amplitude in meters. 0 disables it. */
    bob?: number;
    /** Text shown in the interact prompt. */
    prompt?: string;
    /** Floating text shown on collection, e.g. '+1 wood'. */
    collectText?: string;
    /** Called after the item is added to the inventory. */
    onCollect?: (game: Game, pickup: THREE.Object3D) => void;
};

type Entry = {
    object: THREE.Mesh;
    options: Required<Pick<PickupOptions, 'size' | 'spin' | 'bob' | 'collect'>> & PickupOptions;
    baseY: number;
    age: number;
    detachInteraction: (() => void) | undefined;
    collected: boolean;
};

export class PickupManager {
    /** Radius at which touch pickups are collected, in meters. */
    touchRadius = CONSTANTS.GAMEPLAY.PICKUP_RANGE / 2;

    private readonly game: Game;
    private readonly entries: Entry[] = [];
    private readonly materials = new Map<string, THREE.MeshStandardMaterial>();
    private readonly geometries = new Map<string, THREE.BufferGeometry>();

    constructor(game: Game) {
        this.game = game;
        game.systems.add({
            name: 'pickups',
            order: SYSTEM_ORDER.GAMEPLAY,
            update: (delta) => this.update(delta),
        });
    }

    /** Pickups still in the world. */
    get count(): number {
        return this.entries.length;
    }

    /** Every pickup object, for queries and objectives. */
    get objects(): THREE.Object3D[] {
        return this.entries.map((entry) => entry.object);
    }

    /** Add a pickup to the world. */
    spawn(options: PickupOptions & { position: THREE.Vector3 | Vec3 }): THREE.Mesh {
        const kind = options.kind ?? 'orb';
        const size = options.size ?? 0.35;
        const settings: Entry['options'] = {
            ...options,
            kind,
            size,
            spin: options.spin ?? 1.6,
            bob: options.bob ?? 0.12,
            collect: options.collect ?? 'touch',
        };

        const mesh = new THREE.Mesh(this.geometryFor(kind, size), this.materialFor(options.color ?? 0xffd166));
        mesh.position.set(options.position.x, options.position.y, options.position.z);
        mesh.castShadow = true;
        setUserData(mesh, { tag: 'pickup', itemId: options.itemId, amount: options.amount ?? 1, prompt: options.prompt ?? 'Pick up' });
        this.game.scene.add(mesh);

        const entry: Entry = {
            object: mesh,
            options: settings,
            baseY: mesh.position.y,
            age: randomFloat(0, Math.PI * 2),
            detachInteraction: undefined,
            collected: false,
        };

        if (settings.collect === 'interact' || settings.collect === 'both') {
            entry.detachInteraction = this.game.interactions.add(mesh, {
                prompt: options.prompt ?? 'Pick up',
                range: CONSTANTS.GAMEPLAY.PICKUP_RANGE,
                once: true,
                onInteract: (object) => this.collect(entry, object),
            });
        }

        this.entries.push(entry);
        return mesh;
    }

    /** Remove a pickup without granting it, e.g. when a level is unloaded. */
    remove(object: THREE.Object3D): void {
        const index = this.entries.findIndex((entry) => entry.object === object);
        if (index < 0) return;
        const entry = this.entries[index] as Entry;
        this.entries.splice(index, 1);
        entry.detachInteraction?.();
        entry.object.removeFromParent();
    }

    /** Remove every pickup. */
    clear(): void {
        for (const entry of [...this.entries]) this.remove(entry.object);
    }

    dispose(): void {
        this.clear();
        for (const material of this.materials.values()) material.dispose();
        for (const geometry of this.geometries.values()) geometry.dispose();
        this.materials.clear();
        this.geometries.clear();
    }

    //#region Internals

    private update(delta: number): void {
        const player = this.game.player;
        const playerPosition = player && !player.isDead ? player.position : undefined;

        for (const entry of [...this.entries]) {
            entry.age += delta;
            const spin = entry.options.spin;
            if (spin > 0) entry.object.rotation.y += (delta * Math.PI * 2) / spin;
            if (entry.options.bob > 0) entry.object.position.y = entry.baseY + Math.sin(entry.age * 2.2) * entry.options.bob;

            if (entry.options.collect === 'interact') continue;
            if (!playerPosition) continue;
            const reach = this.touchRadius + entry.options.size + (player ? player.body.radius : 0);
            if (playerPosition.distanceToSquared(entry.object.position) <= reach * reach) this.collect(entry, entry.object);
        }
    }

    private collect(entry: Entry, object: THREE.Object3D): void {
        if (entry.collected) return;
        entry.collected = true;
        entry.detachInteraction?.();

        const amount = entry.options.amount ?? 1;
        const itemId = entry.options.itemId;
        if (itemId) {
            const leftover = this.game.inventory.add(itemId, amount);
            if (leftover > 0) this.game.events.emit('inventory:full', { itemId: itemId });
            else this.game.events.emit('inventory:changed', { itemId: itemId, amount: amount, total: this.game.inventory.count(itemId) });
        }
        if (entry.options.heal) this.game.player?.heal(entry.options.heal);

        this.game.events.emit('pickup:collected', { itemId: itemId ?? '', amount: amount, object: object });
        this.game.effects.particles.burst(object.position, { count: 16, color: entry.options.color ?? 0xffd166, size: 0.07, speed: 3.5, lifetime: 0.4 });
        if (entry.options.collectText) this.game.effects.text(object.position, entry.options.collectText, { color: 0xffe9a8 });

        const index = this.entries.indexOf(entry);
        if (index >= 0) this.entries.splice(index, 1);
        object.removeFromParent();
        entry.options.onCollect?.(this.game, object);
    }

    private geometryFor(kind: PickupKind, size: number): THREE.BufferGeometry {
        // Keyed by size too: a big coin and a small coin are different geometry.
        const key = `${kind}:${size}`;
        const cached = this.geometries.get(key);
        if (cached) return cached;
        const geometry =
            kind === 'box'
                ? new THREE.BoxGeometry(size * 1.6, size * 1.6, size * 1.6)
                : kind === 'capsule'
                  ? new THREE.CapsuleGeometry(size * 0.6, size * 1.2, 6, 12)
                  : kind === 'coin'
                    ? new THREE.CylinderGeometry(size, size, size * 0.22, 20)
                    : new THREE.IcosahedronGeometry(size, 1);
        this.geometries.set(key, geometry);
        return geometry;
    }

    private materialFor(color: THREE.ColorRepresentation): THREE.MeshStandardMaterial {
        const key = new THREE.Color(color).getHexString();
        const cached = this.materials.get(key);
        if (cached) return cached;
        const material = new THREE.MeshStandardMaterial({
            color: new THREE.Color(color),
            emissive: new THREE.Color(color),
            emissiveIntensity: 0.45,
            roughness: 0.35,
            metalness: 0.1,
        });
        this.materials.set(key, material);
        return material;
    }

    //#endregion Internals
}
