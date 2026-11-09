import * as THREE from 'three';

import { SYSTEM_ORDER } from '../core/systems';
import { setUserData } from '../helpers/object';
import type { PhysicsBody } from '../physics/physics';

/**
 * Linked portals.
 *
 * Crossing a portal's plane teleports you to its partner and re-orients your
 * momentum, so you come out the far side still moving the way you were. This is
 * plane-crossing based rather than collider based, which is what makes it feel
 * like a portal instead of a trapdoor.
 *
 * Frame maths, in one line: the transform from portal A to portal B is
 * `pb + qb * qa⁻¹ * (p - pa)`, and velocity and orientation use the same
 * `qb * qa⁻¹` rotation. The portal normal points out of its front face.
 */
export type PortalOptions = {
    /** Radius of the opening in meters. */
    radius?: number;
    /** Direction the portal faces, pointing out of its front face. */
    normal?: THREE.Vector3 | Vec3;
    color?: THREE.ColorRepresentation;
    /** Id used in events and for pairing. Generated when omitted. */
    id?: string;
};

export type Portal = {
    id: string;
    object: THREE.Group;
    position: THREE.Vector3;
    /** Unit normal, pointing out of the front face. */
    normal: THREE.Vector3;
    /** Quaternion mapping portal-local space to world space. */
    quaternion: THREE.Quaternion;
    radius: number;
    /** The portal this one leads to. */
    exit: Portal | undefined;
    /** Seconds of cooldown, set after a teleport to avoid ping-ponging. */
    cooldown: number;
    /** The solid rim colliders, removed with the portal. */
    colliders: PhysicsBody[];
};

export type PortalManagerOptions = {
    /** Radians per second the ring spins. */
    spinSpeed?: number;
    /** Seconds a portal stays inert after a teleport. */
    cooldown?: number;
    /** Called after a teleport, e.g. to re-aim a camera. */
    onTeleported?: (entity: THREE.Object3D, from: Portal, to: Portal) => void;
};

export class PortalManager {
    /** Objects that may travel through portals. The player is added automatically. */
    readonly travellers = new Set<THREE.Object3D>();
    readonly portals: Portal[] = [];

    private readonly game: Game;
    private readonly options: PortalManagerOptions;
    /** Last signed distance per traveller per portal, keyed `${object.id}|${portal.id}`. */
    private readonly lastSide = new Map<string, number>();
    private readonly scratch = new THREE.Vector3();
    private readonly rotation = new THREE.Quaternion();
    private nextId = 1;

    constructor(game: Game, options: PortalManagerOptions = {}) {
        this.game = game;
        this.options = options;
        game.systems.add({
            name: 'portals',
            order: SYSTEM_ORDER.GAMEPLAY + 3,
            update: (delta) => this.update(delta),
        });
    }

    /** Create a linked pair. Both directions work. */
    createPair(
        a: { position: THREE.Vector3 | Vec3; normal?: THREE.Vector3 | Vec3; color?: THREE.ColorRepresentation; radius?: number },
        b: { position: THREE.Vector3 | Vec3; normal?: THREE.Vector3 | Vec3; color?: THREE.ColorRepresentation; radius?: number },
    ): [Portal, Portal] {
        const first = this.create({ ...a, color: a.color ?? 0xff8a3d });
        const second = this.create({ ...b, color: b.color ?? 0x59d3ff });
        first.exit = second;
        second.exit = first;
        return [first, second];
    }

    /** Create one portal. Link it by setting `exit`, or use `createPair`. */
    create(options: PortalOptions & { position: THREE.Vector3 | Vec3 }): Portal {
        const radius = options.radius ?? 1.1;
        const normal = options.normal ? new THREE.Vector3(options.normal.x, options.normal.y, options.normal.z).normalize() : new THREE.Vector3(0, 0, 1);
        const id = options.id ?? `portal-${this.nextId++}`;

        const object = new THREE.Group();
        object.name = id;
        object.position.set(options.position.x, options.position.y, options.position.z);
        object.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
        setUserData(object, { tag: 'portal', portalId: id });
        this.game.scene.add(object);

        const color = new THREE.Color(options.color ?? 0x59d3ff);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, radius * 0.09, 10, 32), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.9, roughness: 0.4 }));
        ring.name = 'ring';
        object.add(ring);

        const surface = new THREE.Mesh(new THREE.CircleGeometry(radius * 0.95, 32), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false }));
        surface.name = 'surface';
        object.add(surface);

        object.add(new THREE.PointLight(color, 5, radius * 8, 2));

        const portal: Portal = { id, object, position: object.position.clone(), normal, quaternion: object.quaternion.clone(), radius, exit: undefined, cooldown: 0, colliders: [] };
        this.portals.push(portal);

        // The rim is solid, the opening is not. One slab per side, or the
        // collider would cover the opening itself and nobody could ever cross.
        // Only the sides get a slab: the opening has to reach the floor so a
        // walking character steps through, and a character capsule is taller
        // than the ring is high, so a top slab would catch their head. Above
        // the opening the radial distance check already refuses the teleport.
        const yaw = Math.atan2(normal.x, normal.z);
        const rotation = new THREE.Euler(0, yaw, 0);
        const outer = radius * 1.25;
        const inner = radius * 0.78;
        const slab = (local: THREE.Vector3, size: { x: number; y: number; z: number }): void => {
            portal.colliders.push(this.game.physics.add({
                kind: 'fixed',
                shape: { type: 'box', size },
                position: portal.position.clone().add(local.applyEuler(rotation)),
                rotation,
                syncObject: false,
                tag: 'wall',
            }));
        };
        const side = (outer + inner) / 2;
        const width = outer - inner;
        slab(new THREE.Vector3(-side, 0, 0), { x: width, y: outer * 2, z: 0.14 });
        slab(new THREE.Vector3(side, 0, 0), { x: width, y: outer * 2, z: 0.14 });
        return portal;
    }

    /** Let an object travel through portals. Returns an unsubscribe function. */
    track(object: THREE.Object3D): () => void {
        this.travellers.add(object);
        return () => this.travellers.delete(object);
    }

    /**
     * Teleport an object from one portal to its partner, keeping its momentum.
     * @param velocity Optional velocity to rotate in place, e.g. a character body's.
     */
    teleport(entity: THREE.Object3D, from: Portal, to: Portal, velocity?: THREE.Vector3): boolean {
        const rotation = this.rotation.copy(from.quaternion).invert().premultiply(to.quaternion);

        const offset = this.scratch.copy(entity.position).sub(from.position).applyQuaternion(rotation);
        entity.position.copy(to.position).add(offset).addScaledVector(to.normal, 0.2);
        entity.quaternion.premultiply(rotation);
        entity.updateMatrixWorld();
        if (velocity) velocity.applyQuaternion(rotation);

        from.cooldown = this.options.cooldown ?? 0.3;
        to.cooldown = this.options.cooldown ?? 0.3;
        this.lastSide.clear();
        this.game.events.emit('custom:portal:teleport', { from: from.id, to: to.id });
        this.options.onTeleported?.(entity, from, to);
        return true;
    }

    /** Teleport the player, moving the physics capsule with them. */
    teleportPlayer(from: Portal, to: Portal): boolean {
        const player = this.game.player;
        if (!player) return false;
        const velocity = player.body.velocity.clone();
        this.teleport(player.root, from, to, velocity);
        player.body.teleport(player.root.position);
        player.body.velocity.copy(velocity);
        // Keep the visual root's yaw in step with the rotated quaternion.
        player.root.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), player.root.rotation.y);
        return true;
    }

    /** Remove every portal. */
    clear(): void {
        for (const portal of this.portals) {
            portal.object.removeFromParent();
            for (const collider of portal.colliders) this.game.physics.remove(collider);
        }
        this.portals.length = 0;
        this.travellers.clear();
        this.lastSide.clear();
    }

    dispose(): void {
        this.clear();
    }

    //#region Internals

    private update(delta: number): void {
        const player = this.game.player;
        if (player && !player.isDead) this.travellers.add(player.root);

        for (const portal of this.portals) {
            portal.cooldown = Math.max(0, portal.cooldown - delta);
            const ring = portal.object.getObjectByName('ring');
            const surface = portal.object.getObjectByName('surface');
            const spin = this.options.spinSpeed ?? 0.8;
            if (ring) ring.rotation.z += delta * spin;
            if (surface) surface.rotation.z -= delta * spin * 1.6;
        }

        for (const entity of this.travellers) {
            if (!entity.parent) continue;
            for (const portal of this.portals) {
                if (portal.cooldown > 0 || !portal.exit) continue;
                // The player's root is at the feet; the body's centre is what passes through the ring.
                const point = player && entity === player.root ? player.body.center : entity.position;
                const side = this.signedDistance(point, portal);
                const key = `${entity.id}|${portal.id}`;
                const previous = this.lastSide.get(key);
                this.lastSide.set(key, side);

                if (previous === undefined || !(previous > 0) || side > 0) continue;
                if (this.radialDistance(point, portal) > portal.radius) continue;

                if (player && entity === player.root) this.teleportPlayer(portal, portal.exit);
                else this.teleport(entity, portal, portal.exit);
                break;
            }
        }
    }

    /** Signed distance along the portal normal: positive in front, negative behind. */
    private signedDistance(position: THREE.Vector3, portal: Portal): number {
        return this.scratch.copy(position).sub(portal.position).dot(portal.normal);
    }

    /** Distance from the portal axis: how far off centre a traveller is. */
    private radialDistance(position: THREE.Vector3, portal: Portal): number {
        const offset = this.scratch.copy(position).sub(portal.position);
        offset.addScaledVector(portal.normal, -offset.dot(portal.normal));
        return offset.length();
    }

    //#endregion Internals
}
