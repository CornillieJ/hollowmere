import * as THREE from 'three';

import { SYSTEM_ORDER } from '../core/systems';
import type { SafeZonesHandle } from '../kit';

/**
 * Lanterns the farmer puts up and keeps in oil.
 *
 * The Veil thickens away from any light and as the day wears on, so the road
 * to the village is at its worst exactly when a late delivery walks it. A
 * lantern is a post with a lamp: while it has oil it is a small ring they will
 * not enter and a hole in the fog. Oil burns down by the hour whether or not
 * anybody is there to see it, so a lit road is something to keep up, not
 * something to finish.
 */
export type LanternsOptions = {
    safeZones: SafeZonesHandle;
    /** Stand a point on the ground. */
    ground: (x: number, z: number) => THREE.Vector3;
    /** The hour since the first midnight. */
    now: () => number;
    have: (itemId: string) => number;
    take: (itemId: string, amount: number) => boolean;
    give: (itemId: string, amount: number) => void;
    /** Why a lantern may not stand here, or nothing when it may. */
    refuse?: (position: THREE.Vector3) => string | undefined;
    onPlaced?: (lantern: Lantern) => void;
    onFilled?: (lantern: Lantern) => void;
};

export type Lantern = { object: THREE.Group; position: THREE.Vector3; /** The hour the oil runs out. */ until: number };

export type LanternsHandle = {
    readonly lanterns: Lantern[];
    /** Put one up in front of the farmer, out of what is carried. */
    place: () => boolean;
    /** Put one up at a spot with this many hours of oil, e.g. from a save. */
    add: (x: number, z: number, hours: number) => Lantern;
    lit: (lantern: Lantern) => boolean;
    hoursLeft: (lantern: Lantern) => number;
    /** Distance from a point to the edge of the nearest lit lantern's ring. Infinity with none lit. */
    distanceToLight: (position: { x: number; z: number }) => number;
    toJSON: () => Array<{ x: number; z: number; until: number }>;
    fromJSON: (data: unknown) => void;
};

export const LANTERN = {
    /** Hours of light in one flask of oil, and the most a lamp holds. */
    hoursPerOil: 24,
    maxHours: 48,
    /** They keep this far off a lit one. */
    radius: 4.5,
    /** The fog is thin this far round a lit one. */
    clearing: 16,
    /** As many as the valley will stand. */
    max: 10,
    /** Closer together than this is a waste of oil. */
    spacing: 9,
};

export function setupLanterns(game: Game, options: LanternsOptions): LanternsHandle {
    const lanterns: Lantern[] = [];
    const zones = new Map<Lantern, () => void>();
    const lights = new Map<Lantern, { light: THREE.PointLight; glass: THREE.Mesh }>();
    const detach = new Map<Lantern, () => void>();
    const wood = new THREE.MeshStandardMaterial({ color: 0x3a2e24, roughness: 1, flatShading: true });
    const dark = new THREE.MeshStandardMaterial({ color: 0x1c1814, roughness: 1, flatShading: true });

    const hoursLeft = (lantern: Lantern): number => Math.max(0, lantern.until - options.now());
    const lit = (lantern: Lantern): boolean => hoursLeft(lantern) > 0;

    const add = (x: number, z: number, hours: number): Lantern => {
        const position = options.ground(x, z);
        const object = new THREE.Group();
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.9, 0.12), wood);
        post.position.y = 0.95;
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.08), wood);
        arm.position.set(0.2, 1.85, 0);
        const cap = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.06, 0.3), dark);
        cap.position.set(0.4, 1.74, 0);
        const glass = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.28, 0.22), new THREE.MeshStandardMaterial({ color: 0x3a3428, emissive: 0xffa040, emissiveIntensity: 0, roughness: 1 }));
        glass.position.set(0.4, 1.57, 0);
        const light = new THREE.PointLight(0xffb36b, 0, 13, 1.6);
        light.position.set(0.4, 1.6, 0);
        for (const part of [post, arm, cap]) part.castShadow = true;
        object.add(post, arm, cap, glass, light);
        object.position.copy(position);
        object.rotation.y = (x * 7 + z * 13) % (Math.PI * 2);
        game.scene.add(object);

        const lantern: Lantern = { object, position, until: options.now() + hours };
        lanterns.push(lantern);
        lights.set(lantern, { light, glass });
        const off = game.interactions.add(object, {
            prompt: () => {
                const left = hoursLeft(lantern);
                const canFill = options.have('lamp-oil') > 0 && left <= LANTERN.maxHours - LANTERN.hoursPerOil;
                return canFill ? `Fill the lantern (${left > 0 ? `${Math.ceil(left)}h of oil left` : 'it is out'})` : `Take the lantern down (${left > 0 ? `${Math.ceil(left)}h of oil left` : 'it is out'})`;
            },
            range: 2.2,
            onInteract: () => {
                const left = hoursLeft(lantern);
                if (options.have('lamp-oil') > 0 && left <= LANTERN.maxHours - LANTERN.hoursPerOil && options.take('lamp-oil', 1)) {
                    lantern.until = options.now() + left + LANTERN.hoursPerOil;
                    options.onFilled?.(lantern);
                    return;
                }
                remove(lantern);
                options.give('lantern', 1);
            },
        });
        detach.set(lantern, off);
        return lantern;
    };

    const remove = (lantern: Lantern): void => {
        zones.get(lantern)?.();
        zones.delete(lantern);
        lights.delete(lantern);
        detach.get(lantern)?.();
        detach.delete(lantern);
        lantern.object.removeFromParent();
        lanterns.splice(lanterns.indexOf(lantern), 1);
    };

    const place = (): boolean => {
        const player = game.player;
        if (!player) return false;
        const yaw = player.root.rotation.y;
        const spot = options.ground(player.position.x + Math.sin(yaw) * 1.2, player.position.z + Math.cos(yaw) * 1.2);
        const refusal =
            options.refuse?.(spot) ??
            (lanterns.length >= LANTERN.max
                ? `${LANTERN.max} lanterns is as many as you can keep in oil`
                : lanterns.some((other) => other.position.distanceTo(spot) < LANTERN.spacing)
                  ? 'Too close to another lantern'
                  : undefined);
        if (refusal) {
            game.toasts.push(refusal, { color: '#c8a0a0' });
            return false;
        }
        if (!options.take('lantern', 1)) return false;
        // It comes with a flask in it.
        options.onPlaced?.(add(spot.x, spot.z, LANTERN.hoursPerOil));
        return true;
    };

    game.systems.add({
        name: 'lanterns',
        order: SYSTEM_ORDER.GAMEPLAY - 4,
        update: () => {
            const player = game.player;
            for (const lantern of lanterns) {
                const burning = lit(lantern);
                // The ring comes and goes with the oil.
                if (burning && !zones.has(lantern)) zones.set(lantern, options.safeZones.add({ position: { x: lantern.position.x, y: lantern.position.y, z: lantern.position.z }, radius: LANTERN.radius, name: 'Lantern' }));
                if (!burning && zones.has(lantern)) {
                    zones.get(lantern)?.();
                    zones.delete(lantern);
                }
                const parts = lights.get(lantern);
                if (!parts) continue;
                const left = hoursLeft(lantern);
                // The last 3 hours it gutters, which is the warning to bring oil.
                const flicker = left < 3 ? 0.45 + Math.abs(Math.sin(game.time.elapsed * 7 + lantern.position.x)) * 0.55 : 1;
                const near = player ? player.position.distanceTo(lantern.position) < 55 : false;
                parts.light.intensity = burning && near ? 9 * flicker : 0;
                (parts.glass.material as THREE.MeshStandardMaterial).emissiveIntensity = burning ? 2.6 * flicker : 0;
            }
        },
    });

    return {
        lanterns,
        place,
        add,
        lit,
        hoursLeft,
        distanceToLight: (position) => {
            let best = Infinity;
            for (const lantern of lanterns) if (lit(lantern)) best = Math.min(best, Math.hypot(position.x - lantern.position.x, position.z - lantern.position.z));
            return best;
        },
        toJSON: () => lanterns.map((lantern) => ({ x: lantern.position.x, z: lantern.position.z, until: lantern.until })),
        fromJSON: (data) => {
            for (const lantern of [...lanterns]) remove(lantern);
            if (!Array.isArray(data)) return;
            for (const saved of data as Array<{ x?: number; z?: number; until?: number }>) {
                if (typeof saved.x !== 'number' || typeof saved.z !== 'number') continue;
                add(saved.x, saved.z, 0).until = saved.until ?? 0;
            }
        },
    };
}
