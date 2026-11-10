import * as THREE from 'three';

import { SYSTEM_ORDER } from '../core/systems';
import type { EnemyManager } from '../game/enemies';

//#region Safe zones

/**
 * Places monsters will not enter, where they also lose interest in you: a
 * shrine, a lit porch, the farmhouse. Enemies steer around the edge instead of
 * pushing in, so a zone works without walls.
 */
export type SafeZone = { position: Vec3; radius: number; name?: string; /** Set false for a zone with no ring on the ground. */ ring?: boolean };

export type AddSafeZonesOptions = {
    enemies: EnemyManager;
    zones: SafeZone[];
    /** Draw a faint ring on the ground. Defaults to true. */
    showRing?: boolean;
    ringColor?: THREE.ColorRepresentation;
    onEnter?: (zone: SafeZone) => void;
    onLeave?: (zone: SafeZone) => void;
};

export type SafeZonesHandle = {
    readonly zones: SafeZone[];
    /** The zone a position is inside, if any. */
    zoneAt: (position: Vec3) => SafeZone | undefined;
    /** Is the player safe right now. */
    readonly playerSafe: boolean;
    /**
     * Add a zone, e.g. a candle the player just put down. With `seconds` it goes
     * out by itself. Returns a function that removes it.
     */
    add: (zone: SafeZone, options?: { seconds?: number; onExpire?: (zone: SafeZone) => void }) => () => void;
    remove: (zone: SafeZone) => void;
    /** Seconds a timed zone has left, `undefined` for a permanent one. */
    remaining: (zone: SafeZone) => number | undefined;
    dispose: () => void;
};

export function addSafeZones(game: Game, options: AddSafeZonesOptions): SafeZonesHandle {
    const zones = [...options.zones];
    const rings = new THREE.Group();
    rings.name = 'safe-zones';
    game.scene.add(rings);
    const ringMaterial = new THREE.MeshBasicMaterial({ color: options.ringColor ?? 0xffe2a0, transparent: true, opacity: 0.25, depthWrite: false });

    const zoneAt = (position: Vec3): SafeZone | undefined =>
        zones.find((zone) => (position.x - zone.position.x) ** 2 + (position.z - zone.position.z) ** 2 <= zone.radius * zone.radius);

    const ringOf = new Map<SafeZone, THREE.Mesh>();
    const timers = new Map<SafeZone, { left: number; onExpire: ((zone: SafeZone) => void) | undefined }>();
    const drawRing = (zone: SafeZone): void => {
        if (options.showRing === false || zone.ring === false) return;
        const ring = new THREE.Mesh(new THREE.RingGeometry(zone.radius - 0.12, zone.radius, 48), ringMaterial);
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(zone.position.x, zone.position.y + 0.03, zone.position.z);
        rings.add(ring);
        ringOf.set(zone, ring);
    };
    const remove = (zone: SafeZone): void => {
        const index = zones.indexOf(zone);
        if (index >= 0) zones.splice(index, 1);
        timers.delete(zone);
        const ring = ringOf.get(zone);
        ring?.geometry.dispose();
        ring?.removeFromParent();
        ringOf.delete(zone);
    };
    zones.forEach(drawRing);

    const outward = new THREE.Vector3();
    const removeRule = options.enemies.addRule({
        ignoresTarget: (target) => zoneAt(target) !== undefined,
        steer: (enemy, desired) => {
            const position = enemy.root.position;
            for (const zone of zones) {
                outward.set(position.x - zone.position.x, 0, position.z - zone.position.z);
                const distance = outward.length();
                const margin = zone.radius + 0.6;
                if (distance > margin) continue;
                outward.divideScalar(distance || 1);
                // Inside or on the edge: walk out, and never towards the centre.
                const inward = desired.dot(outward);
                if (inward < 0) desired.addScaledVector(outward, -inward);
                if (distance < zone.radius) desired.addScaledVector(outward, 2.5);
            }
        },
    });

    let current: SafeZone | undefined;
    const removeSystem = game.systems.add({
        name: 'safe-zones',
        order: SYSTEM_ORDER.GAMEPLAY + 4,
        update: (delta) => {
            for (const [timed, timer] of [...timers]) {
                timer.left -= delta;
                if (timer.left > 0) continue;
                remove(timed);
                timer.onExpire?.(timed);
            }
            const player = game.player;
            const zone = player ? zoneAt(player.position) : undefined;
            if (zone === current) return;
            if (current) options.onLeave?.(current);
            if (zone) options.onEnter?.(zone);
            current = zone;
        },
    });

    return {
        zones,
        zoneAt,
        get playerSafe() {
            return current !== undefined;
        },
        add: (zone, extra) => {
            zones.push(zone);
            drawRing(zone);
            if (extra?.seconds !== undefined) timers.set(zone, { left: extra.seconds, onExpire: extra.onExpire });
            return () => remove(zone);
        },
        remove,
        remaining: (zone) => timers.get(zone)?.left,
        dispose: () => {
            removeRule();
            removeSystem();
            for (const ring of rings.children) (ring as THREE.Mesh).geometry.dispose();
            ringMaterial.dispose();
            rings.removeFromParent();
        },
    };
}

//#endregion Safe zones
