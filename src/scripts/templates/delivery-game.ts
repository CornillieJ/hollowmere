import * as THREE from 'three';

import { SYSTEM_ORDER } from '../core/systems';
import { DeliveryManager, type DeliveryOptions, type DeliveryOrder } from '../game/delivery';
import { setupActionGame, createAndStart, type ActionGameOptions, type ActionGameWorld, refreshInventoryHud } from './action-game';
import { ThirdPersonController, type ThirdPersonOptions } from '../controls/third-person';
import type { Player } from '../game/player';

/**
 * Cozy delivery game.
 *
 * The loop of a courier game: walk or drive to a pickup marker, carry the
 * parcel to the drop off, get paid. No enemies, no timer unless you ask for
 * one, and the HUD shows the next target. Build a town with `build` or just
 * scatter blocks in the arena.
 */
export type DeliveryGameOptions = ActionGameOptions & {
    controls?: ThirdPersonOptions;
    /** Marker radius, capacity, money and callbacks. */
    delivery?: DeliveryOptions;
    /** Town layout: how many scattered buildings to drop in. */
    town?: { buildings?: number; size?: number } | false;
    /** Orders to queue at the start. */
    orders?: Array<Omit<DeliveryOrder, 'id'>>;
};

export type DeliveryWorld = ActionGameWorld & {
    controls: ThirdPersonController;
    delivery: DeliveryManager;
    /** Queue another order at runtime. */
    addOrder: (order: Omit<DeliveryOrder, 'id'>) => DeliveryOrder;
};

/** Configure an existing game as a delivery game. */
export function setupDeliveryGame(game: Game, options: DeliveryGameOptions = {}): DeliveryWorld {
    const world = setupActionGame(
        game,
        (hub: Game, player: Player) =>
            new ThirdPersonController(hub, player, {
                distance: 4.6,
                targetHeight: 1.5,
                shoulderOffset: 0.4,
                sprintFov: hub.camera.fov + 8,
                ...options.controls,
            }),
        { ...options, weapon: false, arena: options.arena ?? { size: 60, obstacles: 0 } },
    );

    const delivery = new DeliveryManager(game, {
        radius: 2.4,
        capacity: 2,
        onDelivered: (_game, order, total) => game.hud.setStat('money', `$${total}`, 'money'),
        onAllDelivered: () => game.events.emit('level:complete', { id: 'delivery' }),
        ...options.delivery,
    });

    if (options.town !== false) {
        const buildings = options.town?.buildings ?? 18;
        const size = options.town?.size ?? 54;
        world.builder.scatter(buildings, size, { color: 0x6f7a8c, tag: 'building', minSize: 3, maxSize: 7, avoid: { position: world.spawnPosition, radius: 5 } });
    }

    // Deliver from the start: a couple of orders so the HUD is never empty.
    const orders = options.orders ?? [
        { pickup: new THREE.Vector3(14, 0.5, 12), dropoff: new THREE.Vector3(-16, 0.5, -10), reward: 25, label: 'parcel', timeLimit: 90 },
        { pickup: new THREE.Vector3(-18, 0.5, 14), dropoff: new THREE.Vector3(18, 0.5, -14), reward: 40, label: 'crate', timeLimit: 120 },
        { pickup: new THREE.Vector3(0, 0.5, -20), dropoff: new THREE.Vector3(0, 0.5, 20), reward: 30, label: 'letter' },
    ];
    for (const order of orders) delivery.addOrder(order);

    game.hud.setCombatCountersVisible(false);
    game.hud.setStat('money', `$${delivery.money}`, 'money');

    // The courier is never carrying a weapon, but the sprint key still works.
    game.hud.setObjective('Pick up the next parcel');

    game.systems.add({
        name: 'delivery-hud',
        order: SYSTEM_ORDER.UI - 1,
        update: (_delta, hub) => {
            hub.hud.setStat('parcels', `${delivery.carrying}/${delivery.capacity}`, 'carrying');
            refreshInventoryHud(hub);
        },
    });

    const deliveryWorld: DeliveryWorld = { ...world, controls: world.controls as ThirdPersonController, delivery, addOrder: (order) => delivery.addOrder(order) };
    // The hub's world handle is the full one, so probes and games reach the
    // delivery manager through `game.world`, not just the action layer under it.
    game.world = deliveryWorld;
    if (options.build) void options.build(deliveryWorld);
    return deliveryWorld;
}

/** Create the game, set it up as a delivery game and start it. */
export async function createDeliveryGame(options: DeliveryGameOptions = {}): Promise<{ game: Game; world: DeliveryWorld }> {
    return createAndStart(options.game ?? {}, (game) => setupDeliveryGame(game, options));
}
