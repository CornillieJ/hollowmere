import * as THREE from 'three';

import { SYSTEM_ORDER } from '../core/systems';
import type { EnemyManager } from '../game/enemies';
import type { PhysicsBody } from '../physics/physics';

//#region Barriers

/**
 * Things the player builds to hold enemies back: fences, barricades, planks over
 * a window. They block movement, wear out on their own, and enemies pressed up
 * against them tear them down. None of them last, which is the point.
 */
export type AddBarriersOptions = {
    enemies: EnemyManager;
    /** Builds one barrier's visual, origin on the ground, long side along x. */
    create?: () => THREE.Object3D;
    /** Collision box of one barrier. */
    size?: Vec3;
    /** Seconds a barrier stands with nobody touching it. */
    lifetime?: number;
    /** Seconds of contact it takes one enemy to break a fresh barrier. */
    toughness?: number;
    /** How close an enemy has to be to claw at it. */
    reach?: number;
    onBroken?: (barrier: Barrier) => void;
};

export type Barrier = {
    readonly object: THREE.Object3D;
    readonly body: PhysicsBody;
    /** 1 when new, 0 when it falls. */
    condition: number;
};

export type BarriersHandle = {
    readonly all: Barrier[];
    /** Put one down. */
    place: (position: Vec3, yaw: number) => Barrier;
    /** Put one down in front of the player, square to where they face. */
    placeInFront: (distance?: number) => Barrier | undefined;
    clear: () => void;
    dispose: () => void;
};

export function addBarriers(game: Game, options: AddBarriersOptions): BarriersHandle {
    const size = { x: options.size?.x ?? 2, y: options.size?.y ?? 1.2, z: options.size?.z ?? 0.25 };
    const lifetime = options.lifetime ?? 180;
    const toughness = options.toughness ?? 8;
    const reach = options.reach ?? 1.2;
    const barriers: Barrier[] = [];
    const local = new THREE.Vector3();

    const create = options.create ?? (() => defaultFence(size));

    function place(position: Vec3, yaw: number): Barrier {
        const object = create();
        object.position.set(position.x, position.y, position.z);
        object.rotation.y = yaw;
        game.scene.add(object);
        const body = game.physics.add({
            kind: 'fixed',
            shape: { type: 'box', size },
            position: new THREE.Vector3(position.x, position.y + size.y / 2, position.z),
            rotation: new THREE.Euler(0, yaw, 0),
            syncObject: false,
            tag: 'wall',
        });
        const barrier: Barrier = { object, body, condition: 1 };
        barriers.push(barrier);
        return barrier;
    }

    function remove(barrier: Barrier, broken: boolean): void {
        const index = barriers.indexOf(barrier);
        if (index < 0) return;
        barriers.splice(index, 1);
        game.physics.remove(barrier.body);
        barrier.object.removeFromParent();
        if (broken) {
            game.effects.particles.burst(barrier.object.position.clone().setY(0.6), { count: 16, color: 0x5a4632, size: 0.08, speed: 2.5, lifetime: 0.6 });
            options.onBroken?.(barrier);
        }
    }

    const removeSystem = game.systems.add({
        name: 'barriers',
        order: SYSTEM_ORDER.GAMEPLAY + 3,
        fixedUpdate: (step) => {
            for (const barrier of [...barriers]) {
                let wear = step / lifetime;
                for (const enemy of options.enemies.all) {
                    // Distance to the barrier's box, measured in its own frame.
                    local.copy(enemy.root.position);
                    barrier.object.worldToLocal(local);
                    const dx = Math.max(0, Math.abs(local.x) - size.x / 2);
                    const dz = Math.max(0, Math.abs(local.z) - size.z / 2);
                    if (Math.hypot(dx, dz) < reach) wear += step / toughness;
                }
                barrier.condition -= wear;
                // A worn fence sags, so the player can read its state from across the field.
                barrier.object.rotation.z = (1 - Math.max(0, barrier.condition)) * 0.18;
                if (barrier.condition <= 0) remove(barrier, true);
            }
        },
    });

    return {
        all: barriers,
        place,
        placeInFront: (distance = 1.6) => {
            const player = game.player;
            if (!player) return undefined;
            const yaw = player.root.rotation.y;
            const forward = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
            const spot = player.position.clone().addScaledVector(forward, distance);
            return place(spot, yaw);
        },
        clear: () => {
            for (const barrier of [...barriers]) remove(barrier, false);
        },
        dispose: () => {
            for (const barrier of [...barriers]) remove(barrier, false);
            removeSystem();
        },
    };
}

/** Two posts and two rails: reads as a fence at any resolution. */
function defaultFence(size: Vec3): THREE.Object3D {
    const group = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ color: 0x6b5238, roughness: 0.95 });
    for (const x of [-size.x / 2 + 0.08, size.x / 2 - 0.08]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.14, size.y, 0.14), wood);
        post.position.set(x, size.y / 2, 0);
        post.castShadow = true;
        group.add(post);
    }
    for (const y of [size.y * 0.4, size.y * 0.8]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(size.x, 0.1, 0.06), wood);
        rail.position.set(0, y, 0);
        rail.castShadow = true;
        group.add(rail);
    }
    return group;
}

//#endregion Barriers
