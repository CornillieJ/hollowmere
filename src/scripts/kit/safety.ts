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
    /** `line` is a thin circle at the edge. `glow` is a soft pool of light that fills the zone, for zones that are lamplight. Defaults to `line`. */
    ringStyle?: 'line' | 'glow';
    /** Height of the ground at a point. With it a glow is laid over uneven ground instead of lying flat. */
    ground?: (x: number, z: number) => number;
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
    const glowMaterial = options.ringStyle === 'glow' ? new THREE.MeshBasicMaterial({ color: options.ringColor ?? 0xffc98a, map: glowTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }) : undefined;
    const drawRing = (zone: SafeZone): void => {
        if (options.showRing === false || zone.ring === false) return;
        const ring = glowMaterial ? new THREE.Mesh(new THREE.RingGeometry(0, zone.radius, 40, 6), glowMaterial) : new THREE.Mesh(new THREE.RingGeometry(zone.radius - 0.12, zone.radius, 48), ringMaterial);
        ring.geometry.rotateX(-Math.PI / 2);
        if (glowMaterial && options.ground) {
            const points = ring.geometry.getAttribute('position');
            for (let index = 0; index < points.count; index += 1) points.setY(index, options.ground(zone.position.x + points.getX(index), zone.position.z + points.getZ(index)) - zone.position.y);
        }
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

/** Light on the ground: faint in the middle, a little stronger towards the edge, and gone at the edge itself. */
function glowTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const context = canvas.getContext('2d');
    if (context) {
        const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
        gradient.addColorStop(0, 'rgba(255,255,255,0.10)');
        gradient.addColorStop(0.7, 'rgba(255,255,255,0.13)');
        gradient.addColorStop(0.9, 'rgba(255,255,255,0.2)');
        gradient.addColorStop(1, 'rgba(255,255,255,0)');
        context.fillStyle = gradient;
        context.fillRect(0, 0, 128, 128);
    }
    return new THREE.CanvasTexture(canvas);
}
