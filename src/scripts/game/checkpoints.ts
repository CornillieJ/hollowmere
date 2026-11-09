import * as THREE from 'three';

import { SYSTEM_ORDER } from '../core/systems';
import { createLabel } from '../helpers/text';
import { setUserData } from '../helpers/object';

/**
 * Checkpoints that remember where the player was last safe.
 *
 * Each checkpoint is a pad with a ring. Walking over it sets the player's spawn
 * point and marks it as reached. Race tracks use the same thing for laps: pass a
 * list of gates and get told when one is touched, in order.
 *
 * ```ts
 * const checkpoints = addCheckpoints(game, {
 *     points: [{ x: 6, y: 0, z: 12 }, { x: 18, y: 0, z: 4 }],
 *     onReach: (index) => toasts.push(`Checkpoint ${index + 1}`),
 * });
 * ```
 */
export type CheckpointOptions = {
    /** Positions of the pads. */
    points: Array<THREE.Vector3 | Vec3>;
    /** Radius of a pad in meters. Defaults to 1.4. */
    radius?: number;
    /** Set the player's spawn point when one is reached. Defaults to true. */
    setSpawn?: boolean;
    /** Require the pads to be visited in order. Defaults to false. */
    ordered?: boolean;
    /** Called when a pad is first reached. */
    onReach?: (index: number, checkpoint: Checkpoint) => void;
    /** Called when a pad is reached by a player who already has it. */
    onRepeat?: (index: number, checkpoint: Checkpoint) => void;
    /** Called when every pad has been reached. */
    onAll?: () => void;
    /** Colour of an untouched pad. */
    color?: THREE.ColorRepresentation;
    /** Colour once reached. */
    reachedColor?: THREE.ColorRepresentation;
    /** Show a floating number above each pad. Defaults to true. */
    labels?: boolean;
    /**
     * What the pads measure their distance to. Defaults to the player: pass a
     * vehicle or a kart and the same pads become race gates.
     */
    tracking?: () => THREE.Vector3;
};

export type Checkpoint = {
    index: number;
    position: THREE.Vector3;
    reached: boolean;
    object: THREE.Group;
    ring: THREE.Mesh;
    label: THREE.Object3D | undefined;
};

export type CheckpointsHandle = {
    readonly checkpoints: Checkpoint[];
    /** Index of the last pad reached, `-1` before any. */
    readonly lastReached: number;
    /** Number of pads reached. */
    readonly reachedCount: number;
    /** True when there is an ordered sequence and it is complete. */
    isComplete: () => boolean;
    /** Mark a pad as reached by code. */
    reach: (index: number) => void;
    /** Clear every pad, e.g. on a restart. */
    reset: () => void;
    dispose: () => void;
};

export function addCheckpoints(game: Game, options: CheckpointOptions): CheckpointsHandle {
    const radius = options.radius ?? 1.4;
    const ordered = options.ordered ?? false;
    const unknown = 0x59d3ff;
    const doneColor = options.reachedColor ?? 0x6ce09a;
    const checkpoints: Checkpoint[] = [];
    let lastReached = -1;
    let announcedAll = false;

    for (const [index, point] of options.points.entries()) {
        const object = new THREE.Group();
        object.position.set(point.x, point.y, point.z);
        object.name = `checkpoint-${index}`;
        setUserData(object, { tag: 'checkpoint' });
        game.scene.add(object);

        const ring = new THREE.Mesh(
            new THREE.TorusGeometry(radius, 0.09, 8, 32),
            new THREE.MeshStandardMaterial({ color: options.color ?? unknown, emissive: options.color ?? unknown, emissiveIntensity: 0.5, roughness: 0.5 }),
        );
        ring.rotation.x = Math.PI / 2;
        ring.position.y = 0.08;
        object.add(ring);

        const disc = new THREE.Mesh(
            new THREE.CircleGeometry(radius * 0.92, 28),
            new THREE.MeshBasicMaterial({ color: options.color ?? unknown, transparent: true, opacity: 0.16, depthWrite: false }),
        );
        disc.rotation.x = -Math.PI / 2;
        disc.position.y = 0.03;
        object.add(disc);

        let label: THREE.Object3D | undefined;
        if (options.labels ?? true) {
            label = createLabel(String(index + 1), { fontSize: 0.9, color: options.color ?? unknown, outlineWidth: 0.05, outlineColor: 0x000000 });
            label.position.y = 1.8;
            label.userData.billboard = true;
            object.add(label);
        }

        checkpoints.push({ index, position: new THREE.Vector3(point.x, point.y, point.z), reached: false, object, ring, label });
    }

    /** Colour a pad according to whether it has been reached. */
    function paint(checkpoint: Checkpoint): void {
        const material = checkpoint.ring.material as THREE.MeshStandardMaterial;
        material.color.set(checkpoint.reached ? doneColor : (options.color ?? unknown));
        material.emissive.set(checkpoint.reached ? doneColor : (options.color ?? unknown));
    }

    function reach(index: number): void {
        const checkpoint = checkpoints[index];
        if (!checkpoint) return;
        if (checkpoint.reached) {
            options.onRepeat?.(index, checkpoint);
            return;
        }
        // In ordered mode a pad only counts when it is the next one.
        if (ordered && index !== checkpoints.filter((entry) => entry.reached).length) return;

        checkpoint.reached = true;
        lastReached = index;
        paint(checkpoint);
        game.effects.particles.burst(checkpoint.position.clone().setY(0.6), { count: 20, color: doneColor, size: 0.08, speed: 3.5, lifetime: 0.5 });
        if (checkpoint.label) setLabelColour(checkpoint.label, doneColor);

        if (options.setSpawn !== false && game.player) {
            // Spawn slightly above the pad so respawning cannot clip into it.
            game.player.setSpawnPoint({ x: checkpoint.position.x, y: checkpoint.position.y + 0.2, z: checkpoint.position.z });
        }

        options.onReach?.(index, checkpoint);

        if (!announcedAll && checkpoints.every((entry) => entry.reached)) {
            announcedAll = true;
            options.onAll?.();
        }
    }

    game.systems.add({
        name: 'checkpoints',
        order: SYSTEM_ORDER.GAMEPLAY + 2,
        update: (delta) => {
            if (!game.state.is('playing')) return;
            const position = options.tracking?.() ?? (game.player?.isAlive ? game.player.position : undefined);
            if (!position) return;

            for (const checkpoint of checkpoints) {
                // A slow pulse, so the pads read as alive from a distance.
                checkpoint.ring.scale.setScalar(1 + Math.sin(game.time.elapsed * 2 + checkpoint.index) * 0.04);
                if (checkpoint.reached) continue;
                const distance = checkpoint.position.distanceTo(position);
                if (distance > radius) continue;
                reach(checkpoint.index);
            }
            void delta;
        },
        lateUpdate: () => {
            if (!game.player) return;
            for (const checkpoint of checkpoints) {
                if (!checkpoint.label) continue;
                checkpoint.label.quaternion.copy(game.camera.quaternion);
            }
        },
    });

    return {
        checkpoints,
        get lastReached() {
            return lastReached;
        },
        get reachedCount() {
            return checkpoints.filter((checkpoint) => checkpoint.reached).length;
        },
        isComplete: () => checkpoints.every((checkpoint) => checkpoint.reached),
        reach,
        reset: () => {
            lastReached = -1;
            announcedAll = false;
            for (const checkpoint of checkpoints) {
                checkpoint.reached = false;
                paint(checkpoint);
                if (checkpoint.label) setLabelColour(checkpoint.label, options.color ?? unknown);
            }
        },
        dispose: () => {
            for (const checkpoint of checkpoints) checkpoint.object.removeFromParent();
            checkpoints.length = 0;
        },
    };
}

/** Colour a troika label, whatever type the helper returned. */
function setLabelColour(label: THREE.Object3D, color: THREE.ColorRepresentation): void {
    const text = label as THREE.Mesh & { color?: THREE.ColorRepresentation; sync?: () => void };
    if ('color' in text) text.color = color;
    text.sync?.();
}
