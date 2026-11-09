import * as THREE from 'three';

import { SYSTEM_ORDER } from '../core/systems';
import { CurvePath } from '../helpers/curve';
import { Health } from './health';
import { createAvatar } from '../helpers/build';

/**
 * Things that walk a route and leak at the end.
 *
 * A convoy, an escort mission, a crowd heading for a door, the enemies in a tower
 * defence: they all follow a curve, take damage, and something happens when one
 * reaches the end. Deliberately not an AI: these never chase anybody.
 *
 * Installing it gives you a system, a spawn function and a list to read:
 *
 * ```ts
 * const walkers = addPathEnemies(game, {
 *     path: ROAD,                       // an array of waypoints, or a CurvePath
 *     onLeak: (enemy) => lives.add(-1),
 *     onKill: (enemy) => gold.add(enemy.definition.reward),
 * });
 * walkers.spawn({ id: 'scout', health: 60, speed: 3, reward: 8, color: 0xd9574f });
 * ```
 */
export type PathEnemyDefinition = {
    id: string;
    name?: string;
    health: number;
    /** Meters per second along the route. */
    speed: number;
    /** What the game gets for killing it. */
    reward?: number;
    /** Flat damage reduction per hit. */
    armor?: number;
    /** How much `onLeak` should care. Defaults to 1. */
    leak?: number;
    color?: THREE.ColorRepresentation;
    /** Drawn above the ground. */
    flying?: boolean;
    size?: number;
    /** Health multiplier, e.g. a later wave is tougher. */
    healthScale?: number;
};

export type PathEnemy = {
    definition: PathEnemyDefinition;
    root: THREE.Group;
    health: Health;
    /** Meters walked so far. */
    travelled: number;
    /** 0..1 along the route, 1 when it arrived. */
    progress: number;
    slowFactor: number;
    slowTimer: number;
    alive: boolean;
};

export type PathEnemyOptions = {
    /** Route waypoints in world space, or a ready made curve. */
    path: Array<THREE.Vector3 | Vec3> | CurvePath;
    /** Height above the route for flying types. Defaults to 1.6. */
    flyHeight?: number;
    /** Called when one reaches the end. */
    onLeak?: (enemy: PathEnemy, game: Game) => void;
    /** Called when one is killed. */
    onKill?: (enemy: PathEnemy, game: Game) => void;
    /** Called on any death, killed or leaked. */
    onRemoved?: (enemy: PathEnemy, game: Game) => void;
};

export type PathEnemiesHandle = {
    readonly path: CurvePath;
    /** Living walkers. */
    readonly enemies: PathEnemy[];
    /** Places one at the start of the route. */
    spawn: (definition: PathEnemyDefinition) => PathEnemy;
    /** Damage one, paying out the reward if it dies. */
    damage: (enemy: PathEnemy, amount: number) => number;
    /** Remove one without a reward or a leak. */
    remove: (enemy: PathEnemy) => void;
    /** Remove everything, e.g. on a restart. */
    clear: () => void;
    /** Total length of the route in meters. */
    length: () => number;
    dispose: () => void;
};

export function addPathEnemies(game: Game, options: PathEnemyOptions): PathEnemiesHandle {
    const path = options.path instanceof CurvePath ? options.path : new CurvePath(options.path, { mode: 'once', speed: 0, samples: 240 });
    const flyHeight = options.flyHeight ?? 1.6;
    const enemies: PathEnemy[] = [];

    function remove(enemy: PathEnemy): void {
        const index = enemies.indexOf(enemy);
        if (index >= 0) enemies.splice(index, 1);
        enemy.root.removeFromParent();
        options.onRemoved?.(enemy, game);
    }

    function damage(enemy: PathEnemy, amount: number): number {
        if (!enemy.alive) return 0;
        const applied = enemy.health.damage(Math.max(1, amount - (enemy.definition.armor ?? 0)));
        if (applied <= 0) return 0;

        game.events.emit('hit:dealt', { object: enemy.root, damage: applied, point: enemy.root.position.clone() });
        if (!enemy.health.isDead) return applied;

        enemy.alive = false;
        game.effects.particles.burst(enemy.root.position.clone(), { count: 16, color: enemy.definition.color ?? 0xd9574f, size: 0.09, speed: 3, lifetime: 0.4 });
        options.onKill?.(enemy, game);
        remove(enemy);
        return applied;
    }

    function spawn(definition: PathEnemyDefinition): PathEnemy {
        const size = definition.size ?? 1;
        const root = new THREE.Group();
        root.name = definition.id;
        root.userData.tag = 'walker';

        const body = createAvatar({ color: definition.color ?? 0xd9574f, height: 1.1 * size, radius: 0.28 * size });
        body.scale.multiplyScalar(0.85);
        root.add(body);
        game.scene.add(root);

        const start = path.positionAt(0);
        root.position.set(start.x, definition.flying ? flyHeight : 0, start.z);

        const enemy: PathEnemy = {
            definition,
            root,
            health: new Health({ max: Math.round(definition.health * (definition.healthScale ?? 1)) }),
            travelled: 0,
            progress: 0,
            slowFactor: 1,
            slowTimer: 0,
            alive: true,
        };
        enemies.push(enemy);
        return enemy;
    }

    game.systems.add({
        name: 'path-enemies',
        order: SYSTEM_ORDER.GAMEPLAY,
        update: (delta) => {
            if (!game.state.is('playing')) return;
            for (const enemy of [...enemies]) {
                if (!enemy.alive) continue;

                if (enemy.slowTimer > 0) {
                    enemy.slowTimer -= delta;
                    if (enemy.slowTimer <= 0) enemy.slowFactor = 1;
                }

                enemy.travelled += enemy.definition.speed * enemy.slowFactor * delta;
                enemy.progress = path.length <= 0 ? 1 : Math.min(enemy.travelled / path.length, 1);

                if (enemy.progress >= 1) {
                    enemy.alive = false;
                    options.onLeak?.(enemy, game);
                    remove(enemy);
                    continue;
                }

                const position = path.positionAt(enemy.progress);
                const tangent = path.tangentAt(enemy.progress);
                enemy.root.position.set(position.x, enemy.definition.flying ? flyHeight : 0, position.z);
                enemy.root.rotation.y = Math.atan2(tangent.x, tangent.z);
            }
        },
    });

    return {
        path,
        enemies,
        spawn,
        damage,
        remove,
        clear: () => {
            for (const enemy of [...enemies]) remove(enemy);
        },
        length: () => path.length,
        dispose: () => {
            for (const enemy of [...enemies]) remove(enemy);
        },
    };
}
