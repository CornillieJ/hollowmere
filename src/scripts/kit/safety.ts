import * as THREE from 'three';

import { SYSTEM_ORDER } from '../core/systems';
import type { EnemyManager } from '../game/enemies';

//#region Safe zones

/**
 * Places monsters will not enter, where they also lose interest in you: a
 * shrine, a lit porch, the farmhouse. Enemies steer around the edge instead of
 * pushing in, so a zone works without walls.
 */
export type SafeZone = { position: Vec3; radius: number; name?: string };

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
    add: (zone: SafeZone) => void;
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

    const drawRing = (zone: SafeZone): void => {
        if (options.showRing === false) return;
        const ring = new THREE.Mesh(new THREE.RingGeometry(zone.radius - 0.12, zone.radius, 48), ringMaterial);
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(zone.position.x, zone.position.y + 0.03, zone.position.z);
        rings.add(ring);
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
        update: () => {
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
        add: (zone) => {
            zones.push(zone);
            drawRing(zone);
        },
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
