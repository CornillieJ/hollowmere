import * as THREE from 'three';

import { SYSTEM_ORDER } from '../core/systems';
import { dampAngle } from '../helpers/math';
import { randomFloat } from '../helpers/random';
import type { InventoryHandle } from './inventory';

//#region Livestock

/**
 * Animals in a pen that make something on a timer: eggs, milk, wool. They
 * amble around inside the pen, and when their product is ready a prompt lets
 * the player collect it into an inventory.
 */
export type AnimalDefinition = {
    id: string;
    name: string;
    /** The animal's visual, origin on the ground, facing +z. */
    object: THREE.Object3D;
    /** Item id the animal makes. */
    product: string;
    /** Seconds between products. */
    every: number;
    /** Walking speed while ambling. */
    speed?: number;
};

export type AddLivestockOptions = {
    /** Centre and half size of the pen on x and z. */
    pen: { center: Vec3; halfSize: { x: number; z: number } };
    animals: AnimalDefinition[];
    inventory: InventoryHandle;
    /** Called when the player collects, e.g. for a sound or a toast. */
    onCollect?: (animal: AnimalDefinition, itemId: string) => void;
    /** Called every frame per animal with its speed, for walk animations. */
    animate?: (animal: AnimalDefinition, speed: number, delta: number) => void;
};

export type LivestockHandle = {
    /** Seconds until each animal's next product, by id. `0` means ready. */
    readyIn: (id: string) => number;
    dispose: () => void;
};

export function addLivestock(game: Game, options: AddLivestockOptions): LivestockHandle {
    const { center, halfSize } = options.pen;
    const state = new Map<string, { timer: number; target: THREE.Vector3; pause: number }>();
    const removers: Array<() => void> = [];
    const pickTarget = (): THREE.Vector3 =>
        new THREE.Vector3(center.x + randomFloat(-halfSize.x, halfSize.x) * 0.85, center.y, center.z + randomFloat(-halfSize.z, halfSize.z) * 0.85);

    for (const animal of options.animals) {
        const start = pickTarget();
        animal.object.position.copy(start);
        game.scene.add(animal.object);
        state.set(animal.id, { timer: animal.every * randomFloat(0.3, 1), target: pickTarget(), pause: 0 });
        removers.push(
            game.interactions.add(animal.object, {
                prompt: `Collect from ${animal.name}`,
                blockedPrompt: `${animal.name} has nothing yet`,
                range: 2,
                canInteract: () => (state.get(animal.id)?.timer ?? 1) <= 0,
                onInteract: () => {
                    const entry = state.get(animal.id);
                    if (!entry || entry.timer > 0) return;
                    if (options.inventory.add(animal.product, 1) > 0) {
                        game.toasts.push('No room to carry it', { color: '#ff9a9a' });
                        return;
                    }
                    entry.timer = animal.every;
                    options.onCollect?.(animal, animal.product);
                },
            }),
        );
    }

    removers.push(
        game.systems.add({
            name: 'livestock',
            order: SYSTEM_ORDER.GAMEPLAY + 2,
            update: (delta) => {
                for (const animal of options.animals) {
                    const entry = state.get(animal.id);
                    if (!entry) continue;
                    entry.timer = Math.max(0, entry.timer - delta);
                    const object = animal.object;
                    let speed = 0;
                    if (entry.pause > 0) {
                        entry.pause -= delta;
                    } else {
                        const toTarget = entry.target.clone().sub(object.position).setY(0);
                        if (toTarget.length() < 0.3) {
                            entry.target = pickTarget();
                            entry.pause = randomFloat(1, 5);
                        } else {
                            speed = animal.speed ?? 0.7;
                            object.position.addScaledVector(toTarget.normalize(), speed * delta);
                            object.rotation.y = dampAngle(object.rotation.y, Math.atan2(toTarget.x, toTarget.z), 0.05, delta);
                        }
                    }
                    options.animate?.(animal, speed, delta);
                }
            },
        }),
    );

    return {
        readyIn: (id) => state.get(id)?.timer ?? 0,
        dispose: () => {
            for (const remove of removers) remove();
            for (const animal of options.animals) animal.object.removeFromParent();
        },
    };
}

//#endregion Livestock
