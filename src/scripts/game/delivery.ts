import * as THREE from 'three';

import { SYSTEM_ORDER } from '../core/systems';
import { createLabel } from '../helpers/text';
import { Cooldown } from '../helpers/timing';

/**
 * Delivery orders with pickups, drop offs, a timer and a wallet.
 *
 * The chill loop of a courier game: a marker tells you where to collect, then
 * where to drop off, and you get paid on arrival. Everything is distance based,
 * so it works on foot, in a kart or on a bicycle with no changes.
 */
export type DeliveryOrder = {
    id: string;
    /** Where to collect the parcel. */
    pickup: THREE.Vector3;
    /** Where to leave it. */
    dropoff: THREE.Vector3;
    /** Money paid on delivery. */
    reward: number;
    /** Shown on the marker and in the toasts. */
    label?: string;
    /** Seconds allowed after pickup, `undefined` for no limit. */
    timeLimit?: number;
    /** Parcels can weigh differently: a heavier parcel slows the courier. */
    weight?: number;
};

export type DeliveryOptions = {
    /** Radius of the pickup and drop off markers in meters. */
    radius?: number;
    /** Parcels that can be carried at once. */
    capacity?: number;
    /** Money at the start, e.g. so the player can buy something. */
    startingMoney?: number;
    /** Height of the beacon above the target. */
    beaconHeight?: number;
    /** Automatic pick up and drop off when walking into the marker. */
    automatic?: boolean;
    /**
     * Where the courier is, read every frame for the automatic checks. Defaults
     * to the player: pass the van, the kart or the drone instead and the whole
     * loop works for a driving game with no parked fake player.
     */
    tracking?: () => THREE.Vector3;
    /** Called after a successful delivery. */
    onDelivered?: (game: Game, order: DeliveryOrder, total: number) => void;
    /** Called when a timer runs out. */
    onExpired?: (game: Game, order: DeliveryOrder) => void;
    /** Called when the last order is delivered. */
    onAllDelivered?: (game: Game, total: number) => void;
};

type Active = {
    order: DeliveryOrder;
    /** 0 while heading to the pickup, 1 once carrying and heading to the drop off. */
    stage: 0 | 1;
    timer: number;
};

export class DeliveryManager {
    /** Money earned so far. */
    money: number;
    /** Parcels currently carried. */
    carrying = 0;
    /** Parcels that can be carried at once. */
    capacity: number;
    /** Radius of a marker in meters. */
    radius: number;
    /** When false, use `pickupAt` and `dropoffAt` from your own interaction code. */
    automatic: boolean;

    private readonly game: Game;
    private readonly options: DeliveryOptions;
    private readonly active: Active[] = [];
    private readonly queue: DeliveryOrder[] = [];
    private readonly beacon: THREE.Group;
    private readonly beaconRing: THREE.Mesh;
    private readonly beaconLabel: ReturnType<typeof createLabel>;
    private readonly cooldown = new Cooldown(0.6, true);
    private nextId = 1;

    constructor(game: Game, options: DeliveryOptions = {}) {
        this.game = game;
        this.options = options;
        this.money = options.startingMoney ?? 0;
        this.capacity = options.capacity ?? 2;
        this.radius = options.radius ?? 2.2;
        this.automatic = options.automatic ?? true;

        this.beacon = new THREE.Group();
        this.beacon.name = 'delivery-beacon';
        this.beaconRing = new THREE.Mesh(
            new THREE.TorusGeometry(1, 0.08, 8, 32),
            new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.85 }),
        );
        this.beaconRing.rotation.x = Math.PI / 2;
        this.beacon.add(this.beaconRing);

        const beam = new THREE.Mesh(
            new THREE.CylinderGeometry(0.35, 0.9, 6, 12, 1, true),
            new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false }),
        );
        beam.position.y = 3;
        this.beacon.add(beam);

        this.beaconLabel = createLabel('', { fontSize: 0.5, color: 0xffe9a8, outlineWidth: 0.04, outlineColor: 0x000000 });
        this.beaconLabel.position.y = (options.beaconHeight ?? 4.2);
        this.beacon.add(this.beaconLabel);
        this.beacon.visible = false;
        game.scene.add(this.beacon);

        game.systems.add({
            name: 'delivery',
            order: SYSTEM_ORDER.GAMEPLAY + 4,
            update: (delta) => this.update(delta),
        });
    }

    /** Orders waiting to be started. */
    get pending(): number {
        return this.queue.length + this.active.length;
    }

    /** The order the beacon currently points at. */
    get currentOrder(): DeliveryOrder | undefined {
        return this.active[0]?.order;
    }

    /** Queue an order. It starts as soon as there is capacity. */
    addOrder(order: Omit<DeliveryOrder, 'id'> & { id?: string }): DeliveryOrder {
        const full: DeliveryOrder = { id: order.id ?? `order-${this.nextId++}`, ...order };
        this.queue.push(full);
        this.game.toasts.push(`New delivery: ${full.label ?? 'parcel'}`, { color: '#ffd166' });
        this.refreshObjective();
        return full;
    }

    /** Collect the current parcel by hand, e.g. from an interaction prompt. */
    pickupAt(position: THREE.Vector3 | Vec3): boolean {
        const entry = this.active[0];
        if (!entry || entry.stage !== 0) return false;
        if (this.carrying >= this.capacity) {
            this.game.toasts.push('Hands full', { color: '#ff9a9a' });
            return false;
        }
        if (this.distanceTo(entry.order.pickup, position) > this.radius) return false;
        this.advance(entry);
        return true;
    }

    /** Leave the parcel at the drop off by hand. */
    dropoffAt(position: THREE.Vector3 | Vec3): boolean {
        const entry = this.active[0];
        if (!entry || entry.stage !== 1) return false;
        if (this.distanceTo(entry.order.dropoff, position) > this.radius) return false;
        this.complete(entry);
        return true;
    }

    /** Remove every order and hide the beacon. */
    clear(): void {
        this.active.length = 0;
        this.queue.length = 0;
        this.carrying = 0;
        this.beacon.visible = false;
        this.refreshObjective();
    }

    dispose(): void {
        this.clear();
        this.beacon.removeFromParent();
        this.beaconRing.geometry.dispose();
        (this.beaconRing.material as THREE.Material).dispose();
    }

    //#region Internals

    private update(delta: number): void {
        this.cooldown.update(delta);
        this.stepQueue();

        const entry = this.active[0];
        if (!entry) {
            this.beacon.visible = false;
            return;
        }

        const target = entry.stage === 0 ? entry.order.pickup : entry.order.dropoff;
        this.beacon.visible = true;
        this.beacon.position.set(target.x, 0.1, target.z);
        this.beaconRing.rotation.z += delta * 1.4;
        const pulse = 1 + Math.sin(this.game.time.elapsed * 3) * 0.08;
        this.beaconRing.scale.setScalar(pulse);

        if (entry.order.timeLimit !== undefined) {
            entry.timer -= delta;
            if (entry.timer <= 0) {
                this.game.toasts.push(`Order expired: ${entry.order.label ?? entry.order.id}`, { color: '#ff9a9a' });
                this.options.onExpired?.(this.game, entry.order);
                this.active.shift();
                this.refreshObjective();
                return;
            }
        }

        if (!this.automatic) return;
        if (this.cooldown.ready === false) return;
        const position = this.courierPosition();
        if (!position) return;

        if (entry.stage === 0 && this.distanceTo(entry.order.pickup, position) <= this.radius && this.carrying < this.capacity) {
            this.advance(entry);
        } else if (entry.stage === 1 && this.distanceTo(entry.order.dropoff, position) <= this.radius) {
            this.complete(entry);
        }
    }

    /** Start as many queued orders as the capacity allows. */
    private stepQueue(): void {
        while (this.queue.length > 0 && this.carrying + this.active.length < this.capacity) {
            const order = this.queue.shift() as DeliveryOrder;
            this.active.push({ order, stage: 0, timer: order.timeLimit ?? 0 });
        }
    }

    private advance(entry: Active): void {
        entry.stage = 1;
        this.carrying += 1;
        entry.timer = entry.order.timeLimit ?? 0;
        this.game.toasts.push(`Collected ${entry.order.label ?? 'parcel'}`, { color: '#9fe7ff' });
        this.game.effects.particles.burst(entry.order.pickup.clone().setY(1), { count: 14, color: 0x9fe7ff, size: 0.07, speed: 3, lifetime: 0.4 });
        this.cooldown.trigger(0.6);
        this.refreshObjective();
    }

    private complete(entry: Active): void {
        this.money += entry.order.reward;
        this.carrying = Math.max(0, this.carrying - 1);
        this.active.splice(this.active.indexOf(entry), 1);
        this.game.toasts.push(`Delivered: +$${entry.order.reward}`, { color: '#b6f5b6' });
        this.game.effects.particles.burst(entry.order.dropoff.clone().setY(1), { count: 24, color: 0xffd166, size: 0.1, speed: 4, lifetime: 0.6 });
        this.game.hud.setStat('money', `$${this.money}`, 'money');
        this.options.onDelivered?.(this.game, entry.order, this.money);
        this.game.events.emit('delivery:completed', { id: entry.order.id, reward: entry.order.reward, total: this.money });
        this.cooldown.trigger(0.6);
        this.refreshObjective();

        if (this.pending === 0) this.options.onAllDelivered?.(this.game, this.money);
    }

    private refreshObjective(): void {
        const entry = this.active[0];
        if (!entry) {
            if (this.pending === 0) this.game.hud.setObjective('');
            this.beaconLabel.text = '';
            return;
        }
        const text = entry.stage === 0 ? `Pick up ${entry.order.label ?? 'parcel'}` : `Deliver ${entry.order.label ?? 'parcel'}`;
        this.beaconLabel.text = text;
        this.beaconLabel.sync();
        this.game.hud.setObjective(entry.order.timeLimit !== undefined && entry.stage === 1 ? `${text} (${Math.ceil(entry.timer)}s)` : text);
    }

    private distanceTo(point: THREE.Vector3, position: THREE.Vector3 | Vec3): number {
        return Math.hypot(position.x - point.x, position.z - point.z);
    }

    /** Where the courier is right now: the tracker, or the living player. */
    private courierPosition(): THREE.Vector3 | undefined {
        if (this.options.tracking) return this.options.tracking();
        const player = this.game.player;
        return player && !player.isDead ? player.position : undefined;
    }

    //#endregion Internals
}

/** Where the courier should go next, for a minimap or an arrow. */
export function currentDeliveryTarget(manager: DeliveryManager): THREE.Vector3 | undefined {
    const order = manager.currentOrder;
    if (!order) return undefined;
    return manager.carrying > 0 ? order.dropoff : order.pickup;
}
