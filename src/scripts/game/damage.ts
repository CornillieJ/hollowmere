import * as THREE from 'three';

/**
 * Damage delivery.
 *
 * An object is damageable when it carries a `DamageTarget` in
 * `userData.health` (see `game/health.ts`). `applyDamage` walks up the parents
 * so you can put health on a group and shoot its child meshes.
 */

/** Find the health container for an object, walking up the parent chain. */
export function findDamageTarget(object: THREE.Object3D): { root: THREE.Object3D; health: DamageTarget } | undefined {
    let current: THREE.Object3D | null = object;
    while (current) {
        const health = current.userData.health as DamageTarget | undefined;
        if (health) return { root: current, health };
        current = current.parent;
    }
    return undefined;
}

export type DamageOptions = {
    /** Where the hit landed, used for effects and knockback. */
    point?: THREE.Vector3 | undefined;
    /** Who caused the damage, forwarded to the events. */
    source?: THREE.Object3D | undefined;
    /** Extra damage for hits in the upper quarter of the target. */
    headshotMultiplier?: number | undefined;
    /** Push the target away from `point` with this impulse strength. */
    knockback?: number | undefined;
};

export type DamageResult = {
    /** Damage actually applied, 0 when nothing was damageable. */
    applied: number;
    /** True when this hit killed the target. */
    killed: boolean;
    /** The object that owned the health. */
    root: THREE.Object3D | undefined;
};

/**
 * Apply damage to whatever is under an object.
 * Emits `hit:dealt` and, when the target dies, `entity:killed`.
 */
export function applyDamage(game: Game, object: THREE.Object3D, amount: number, options: DamageOptions = {}): DamageResult {
    const target = findDamageTarget(object);
    if (!target) return { applied: 0, killed: false, root: undefined };

    let total = amount;
    if (options.headshotMultiplier && options.headshotMultiplier !== 1 && options.point) {
        // Reward hitting the upper part of the object's bounding box.
        const box = new THREE.Box3().setFromObject(target.root);
        const height = Math.max(box.max.y - box.min.y, 0.001);
        const upper = (options.point.y - box.min.y) / height;
        if (upper > 0.75) total *= options.headshotMultiplier;
    }

    const applied = target.health.damage(total);
    if (applied <= 0) return { applied: 0, killed: false, root: target.root };

    game.events.emit('hit:dealt', { object: target.root, damage: applied, point: options.point });
    if (options.source) game.events.emit('hit:taken', { object: options.source, damage: applied });

    if (options.knockback && options.point) {
        const body = target.root.userData.physicsBody as { applyImpulse?: (impulse: THREE.Vector3) => void } | undefined;
        const impulse = target.root.position.clone().sub(options.point).setY(0.2).normalize().multiplyScalar(options.knockback);
        body?.applyImpulse?.(impulse);
    }

    const killed = target.health.isDead;
    if (killed) game.events.emit('entity:killed', { object: target.root });
    return { applied, killed, root: target.root };
}

/** True when the object or any of its ancestors can take damage. */
export function isDamageable(object: THREE.Object3D): boolean {
    return findDamageTarget(object) !== undefined;
}

/**
 * Area damage, e.g. an explosion.
 * Uses a physics sphere overlap when a radius is given, so it respects walls.
 */
export function applyAreaDamage(game: Game, center: THREE.Vector3, radius: number, amount: number, options: DamageOptions & { falloff?: boolean } = {}): DamageResult[] {
    const results: DamageResult[] = [];
    const seen = new Set<THREE.Object3D>();

    const bodies = game.physics.withTag('damageable');
    const candidates = bodies.length > 0 ? bodies : [...game.physics.bodies.values()];

    for (const body of candidates) {
        if (!body.object || seen.has(body.object)) continue;
        const distance = body.object.position.distanceTo(center);
        if (distance > radius) continue;
        if (!isDamageable(body.object)) continue;
        seen.add(body.object);

        const scaled = options.falloff === false ? amount : amount * (1 - distance / Math.max(radius, 0.001));
        results.push(applyDamage(game, body.object, scaled, { ...options, point: body.object.position.clone() }));
    }
    return results;
}
