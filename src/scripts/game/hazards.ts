import * as THREE from 'three';

import { SYSTEM_ORDER } from '../core/systems';

/**
 * Damage volumes: lava, spikes, water you should not fall in, a laser grid.
 *
 * Every hazard is an axis aligned box. On each fixed step the player's capsule is
 * tested against them, so a hazard does not need a physics body and cannot be
 * tunneled through at speed. Two behaviours are supported:
 *
 * - `damage`: take hit points, with a knockback and an invulnerability window.
 * - `respawn`: immediately put the player back at the spawn point, which is what
 *   a spike pit wants.
 *
 * ```ts
 * addHazards(game, {
 *     hazards: [
 *         { position: { x: 0, y: -0.4, z: -6 }, size: { x: 8, y: 0.8, z: 4 }, kind: 'lava' },
 *         { position: { x: 4, y: 0.2, z: 0 }, size: { x: 2, y: 0.4, z: 2 }, kind: 'spikes', damage: 20 },
 *     ],
 * });
 * ```
 */
export type HazardKind = 'lava' | 'spikes' | 'water' | 'laser' | 'custom';

export type HazardDefinition = {
    position: THREE.Vector3 | Vec3;
    /** Full size of the volume. */
    size: THREE.Vector3 | Vec3;
    kind?: HazardKind;
    /** Damage per touch. Defaults to 34 for lava and spikes, 12 for water. */
    damage?: number;
    /** Respawn immediately instead of damaging. Defaults to true for water. */
    respawn?: boolean;
    /** Push the player away from the hazard centre with this speed. */
    knockback?: number;
    /** Seconds before the same hazard can hurt the player again. */
    cooldown?: number;
    /** Pure visual colour override. */
    color?: THREE.ColorRepresentation;
    /** Draw the volume. On by default; turn it off when a game has its own art. */
    visual?: boolean;
};

export type HazardOptions = {
    hazards: HazardDefinition[];
    /** Called when the player is hurt. */
    onHit?: (hazard: HazardDefinition, index: number) => void;
    /** Called when the player is respawned by a hazard. */
    onRespawn?: (hazard: HazardDefinition, index: number) => void;
};

export type HazardsHandle = {
    /** Index of the hazard that last hurt the player, -1 before any. */
    readonly lastHit: number;
    /** True when the point is inside any hazard. */
    contains: (point: THREE.Vector3) => boolean;
    clear: () => void;
    dispose: () => void;
};

/** Look of each hazard kind, so a game does not have to art direct them. */
const STYLE: Record<HazardKind, { color: number; emissive: number; opacity: number }> = {
    lava: { color: 0xff4a1f, emissive: 0xff2a00, opacity: 0.95 },
    spikes: { color: 0x9aa3ad, emissive: 0x000000, opacity: 1 },
    water: { color: 0x2e7bd6, emissive: 0x0b2a55, opacity: 0.65 },
    laser: { color: 0xff3b6b, emissive: 0xff0a3f, opacity: 0.8 },
    custom: { color: 0xb04ad9, emissive: 0x4a1060, opacity: 0.9 },
};

export function addHazards(game: Game, options: HazardOptions): HazardsHandle {
    const entries = options.hazards.map((hazard) => {
        const size = { x: hazard.size.x, y: hazard.size.y, z: hazard.size.z };
        const kind = hazard.kind ?? 'lava';
        const style = STYLE[kind];
        const box = new THREE.Box3().setFromCenterAndSize(
            new THREE.Vector3(hazard.position.x, hazard.position.y, hazard.position.z),
            new THREE.Vector3(size.x, size.y, size.z),
        );

        let mesh: THREE.Mesh | undefined;
        if (hazard.visual !== false) {
            const material =
                kind === 'spikes'
                    ? new THREE.MeshStandardMaterial({ color: style.color, roughness: 0.5, metalness: 0.4 })
                    : new THREE.MeshStandardMaterial({ color: style.color, emissive: style.emissive, emissiveIntensity: 0.7, transparent: style.opacity < 1, opacity: style.opacity, roughness: 0.4 });
            mesh =
                kind === 'spikes'
                    ? spikeField(size, material)
                    : new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), material);
            mesh.name = `hazard-${kind}`;
            mesh.position.set(hazard.position.x, hazard.position.y, hazard.position.z);
            mesh.receiveShadow = false;
            game.scene.add(mesh);
        }

        return {
            hazard,
            kind,
            box,
            mesh,
            cooldown: 0,
            damage: hazard.damage ?? (kind === 'water' ? 12 : kind === 'laser' ? 26 : 34),
            respawn: hazard.respawn ?? kind === 'water',
            touchCooldown: hazard.cooldown ?? 0.8,
        };
    });

    let lastHit = -1;

    const removeSystem = game.systems.add({
        name: 'hazards',
        order: SYSTEM_ORDER.GAMEPLAY + 3,
        fixedUpdate: (step) => {
            for (const entry of entries) entry.cooldown = Math.max(0, entry.cooldown - step);
            if (!game.state.is('playing')) return;

            const player = game.player;
            if (!player || !player.isAlive) return;

            // Test the capsule as a box around the feet, which is close enough for
            // a hazard and much cheaper than a shape query.
            const feet = player.position;
            const capsule = new THREE.Box3(
                new THREE.Vector3(feet.x - player.body.radius, feet.y, feet.z - player.body.radius),
                new THREE.Vector3(feet.x + player.body.radius, feet.y + player.body.height, feet.z + player.body.radius),
            );

            for (const [index, entry] of entries.entries()) {
                if (entry.cooldown > 0 || !entry.box.intersectsBox(capsule)) continue;

                entry.cooldown = entry.touchCooldown;
                lastHit = index;
                options.onHit?.(entry.hazard, index);

                if (entry.respawn) {
                    player.teleport(player.spawnPoint);
                    game.effects.flash(0.3, STYLE[entry.kind].color, 0.25);
                    game.effects.shake.add(0.3);
                    options.onRespawn?.(entry.hazard, index);
                } else {
                    player.damage(entry.damage);
                    game.effects.flash(0.2, STYLE[entry.kind].color, 0.18);
                    game.effects.shake.add(0.25);
                    if (entry.hazard.knockback) {
                        const away = feet.clone().sub(entry.box.getCenter(new THREE.Vector3())).setY(0.4).normalize();
                        player.body.velocity.addScaledVector(away, entry.hazard.knockback);
                    }
                }
                break;
            }
        },
    });

    function removeAll(): void {
        for (const entry of entries) {
            if (!entry.mesh) continue;
            entry.mesh.removeFromParent();
            entry.mesh.geometry.dispose();
            (entry.mesh.material as THREE.Material).dispose();
        }
        entries.length = 0;
    }

    return {
        get lastHit() {
            return lastHit;
        },
        contains: (point: THREE.Vector3) => entries.some((entry) => entry.box.containsPoint(point)),
        clear: () => removeAll(),
        dispose: () => {
            removeAll();
            removeSystem();
        },
    };
}

/** A bed of cones, so a spike hazard reads as spikes and not as a grey box. */
function spikeField(size: { x: number; y: number; z: number }, material: THREE.Material): THREE.Mesh {
    const spacing = 0.5;
    const columns = Math.max(1, Math.floor(size.x / spacing));
    const rows = Math.max(1, Math.floor(size.z / spacing));
    const geometry = new THREE.ConeGeometry(spacing * 0.3, size.y, 6);
    const count = columns * rows;
    const mesh = new THREE.InstancedMesh(geometry, material, count);
    const matrix = new THREE.Matrix4();

    let index = 0;
    for (let column = 0; column < columns; column += 1) {
        for (let row = 0; row < rows; row += 1) {
            const x = -size.x / 2 + spacing / 2 + column * spacing;
            const z = -size.z / 2 + spacing / 2 + row * spacing;
            matrix.makeTranslation(x, 0, z);
            mesh.setMatrixAt(index, matrix);
            index += 1;
        }
    }
    mesh.instanceMatrix.needsUpdate = true;
    return mesh;
}
