import type { PhysicsBodyOptions } from './physics';

/**
 * Collision layers.
 *
 * Rapier packs a collider's layer membership and the mask of layers it collides
 * with into one 32 bit number: the high 16 bits are "who am I", the low 16 bits
 * are "who do I touch". Two colliders interact only when each one's mask
 * contains the other's membership.
 *
 * That is what stops a bullet from hitting the player who fired it, and what
 * lets a template turn off enemy-versus-enemy pushing without any extra code.
 */
export const LAYER = {
    /** Anything that did not ask for a layer. Collides with everything. */
    DEFAULT: 1 << 0,
    PLAYER: 1 << 1,
    ENEMY: 1 << 2,
    PROJECTILE: 1 << 3,
    /** Static level geometry. */
    WORLD: 1 << 4,
    /** Triggers and sensors that only report overlaps. */
    TRIGGER: 1 << 5,
    /** Decorations and effects that nothing collides with. */
    EFFECT: 1 << 6,
} as const;

/** Every layer. Useful as a mask in tests and for the default layer. */
export const ALL_LAYERS = 0xffff;

/** Combine a membership layer and a collision mask into one Rapier group value. */
export function groups(membership: number, collidesWith: number = ALL_LAYERS): number {
    return ((membership << 16) | collidesWith) >>> 0;
}

/** Ready made groups for the common cases. */
export const GROUP = {
    /** Anything that did not opt in. */
    default: groups(LAYER.DEFAULT, ALL_LAYERS),
    /** The player's capsule, collides with the world and enemies. */
    player: groups(LAYER.PLAYER, ALL_LAYERS),
    /** Enemies, collides with everything including each other. */
    enemy: groups(LAYER.ENEMY, ALL_LAYERS),
    /** Static level geometry, collides with everything. */
    world: groups(LAYER.WORLD, ALL_LAYERS),
    /** A shot fired by the player: hits the world, enemies and props, never the player. */
    playerProjectile: groups(LAYER.PROJECTILE, ALL_LAYERS & ~LAYER.PLAYER),
    /** A shot fired by an enemy: hits the world and the player, never other enemies. */
    enemyProjectile: groups(LAYER.PROJECTILE, ALL_LAYERS & ~LAYER.ENEMY),
    /** Pickups and other props that nothing should bump into. */
    trigger: groups(LAYER.TRIGGER, LAYER.PLAYER | LAYER.ENEMY | LAYER.PROJECTILE),
} as const;

/** Group presets keyed by body tag, so helpers can pick a reasonable default. */
export const GROUP_FOR_TAG: Record<string, number> = {
    player: GROUP.player,
    enemy: GROUP.enemy,
    ground: GROUP.world,
    wall: GROUP.world,
    cover: GROUP.world,
    stair: GROUP.world,
    character: GROUP.player,
};

/**
 * The group a body should use: an explicit `groups` value wins, then the preset
 * for its tag, then the default group.
 */
export function groupForTag(tag: string | undefined, explicit?: number): number {
    if (explicit !== undefined) return explicit;
    return tag ? (GROUP_FOR_TAG[tag] ?? GROUP.default) : GROUP.default;
}

/** Narrow helper so call sites read well: `{ groups: GROUP.enemy }`. */
export type CollisionGroupOption = Pick<PhysicsBodyOptions, 'groups'>;
