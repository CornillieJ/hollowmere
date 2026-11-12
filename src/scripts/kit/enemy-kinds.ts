import * as THREE from 'three';

import { SYSTEM_ORDER } from '../core/systems';
import type { Enemy, EnemyManager, EnemyOptions } from '../game/enemies';
import { pickWeighted, tuneOptions, type AlertGain, type EnemyTuning } from '../game/enemy-tuning';

//#region Enemy kinds

/**
 * Kinds of enemy with manners that change: a bestiary in one call.
 *
 * Each kind has its spawn options, a weight for how often it turns up, and
 * optional moods. The current mood ("night", "storm") and an alert level from
 * 0 to 1 (scent, noise) are functions; when they change, every living enemy is
 * retuned from the numbers it was made with. A kind can also stand still while
 * the camera looks at it.
 *
 * ```ts
 * const kinds = addEnemyKinds(game, {
 *     enemies: world.enemies,
 *     mood: () => (isNight() ? 'night' : undefined),
 *     alert: () => noise.level,
 *     kinds: {
 *         walker: { options: { speed: 1.4, aggroRange: 14 }, moods: { night: { scale: { speed: 1.25, aggroRange: 1.5 } } }, alert: { aggroRange: 0.7 } },
 *         watcher: { weight: 0.2, when: () => day() >= 5, options: { speed: 3.1, aggroRange: 26 }, frozenWhenWatched: true },
 *     },
 * });
 * addPopulation(game, { enemies: world.enemies, target, spawn: (position) => kinds.spawn(position) });
 * ```
 */
export type EnemyKind = {
    /** Spawn options, or a function for values rolled per enemy. `position` is filled in. */
    options: Omit<EnemyOptions, 'position'> | (() => Omit<EnemyOptions, 'position'>);
    /** How often it turns up against the others. Defaults to 1. */
    weight?: number;
    /** It only turns up while this holds. */
    when?: () => boolean;
    moods?: Record<string, EnemyTuning<EnemyOptions>>;
    /** What the alert level stretches, as the fraction added at alert 1. */
    alert?: AlertGain<EnemyOptions>;
    /** It stops while the camera has it in view. `range` defaults to 45 m, `cone` (cosine of the half angle) to 0.72. */
    frozenWhenWatched?: boolean | { range?: number; cone?: number };
    /** Called with each new one, e.g. to dress it or give it an animator. */
    onSpawn?: (enemy: Enemy) => void;
};

export type AddEnemyKindsOptions = {
    enemies: EnemyManager;
    kinds: Record<string, EnemyKind>;
    /** The name of the mood that holds now, if any. */
    mood?: () => string | undefined;
    /** 0..1. A change smaller than 0.05 is ignored. */
    alert?: () => number;
};

export type SpawnKindOptions = {
    /** Which kind. Drawn by weight when omitted. */
    kind?: string;
    /** Options for this one alone, over the kind's own. */
    options?: Partial<EnemyOptions>;
    /** Leave this one as made: no mood or alert ever changes it. */
    fixed?: boolean;
};

export type EnemyKindsHandle = {
    /** Draw a kind id by weight from those whose `when` holds. */
    pick: () => string;
    spawn: (position: THREE.Vector3 | Vec3, options?: SpawnKindOptions) => Enemy;
    kindOf: (enemy: Enemy) => string | undefined;
    /** How many of a kind are alive. */
    count: (kind: string) => number;
    /** Retune every living enemy now. */
    refresh: () => void;
    /** Drop the record of one, e.g. from `onDespawn`. Dead ones are dropped by themselves. */
    forget: (enemy: Enemy) => void;
    dispose: () => void;
};

type Made = { kind: string; base: EnemyOptions; fixed: boolean; speed: number };

export function addEnemyKinds(game: Game, options: AddEnemyKindsOptions): EnemyKindsHandle {
    const made = new Map<Enemy, Made>();
    let mood = options.mood?.();
    let alert = Math.max(0, Math.min(1, options.alert?.() ?? 0));
    const kindOf = (id: string): EnemyKind => {
        const kind = options.kinds[id];
        if (!kind) throw new Error(`addEnemyKinds: no kind called "${id}"`);
        return kind;
    };

    const tune = (enemy: Enemy, record: Made): void => {
        if (record.fixed) return;
        const kind = kindOf(record.kind);
        Object.assign(enemy.options, tuneOptions(record.base, mood ? kind.moods?.[mood] : undefined, kind.alert, alert));
        record.speed = enemy.options.speed;
    };
    const refresh = (): void => {
        for (const [enemy, record] of made) tune(enemy, record);
    };

    const toEnemy = new THREE.Vector3();
    const view = new THREE.Vector3();
    const removeSystem = game.systems.add({
        name: 'enemy-kinds',
        order: SYSTEM_ORDER.GAMEPLAY - 1,
        update: () => {
            const nextMood = options.mood?.();
            const nextAlert = Math.max(0, Math.min(1, options.alert?.() ?? 0));
            if (nextMood !== mood || Math.abs(nextAlert - alert) >= 0.05 || (nextAlert === 0 && alert !== 0)) {
                mood = nextMood;
                alert = nextAlert;
                refresh();
            }
            game.camera.getWorldDirection(view);
            for (const [enemy, record] of made) {
                if (enemy.dead) {
                    made.delete(enemy);
                    continue;
                }
                const watched = kindOf(record.kind).frozenWhenWatched;
                if (!watched) continue;
                const range = (typeof watched === 'object' ? watched.range : undefined) ?? 45;
                const cone = (typeof watched === 'object' ? watched.cone : undefined) ?? 0.72;
                toEnemy.copy(enemy.root.position).sub(game.camera.position);
                const seen = toEnemy.length() < range && toEnemy.normalize().dot(view) > cone;
                enemy.options.speed = seen ? 0.001 : record.speed;
            }
        },
    });

    const pick = (): string => pickWeighted(options.kinds) ?? (Object.keys(options.kinds)[0] as string);

    return {
        pick,
        spawn: (position, spawnOptions = {}) => {
            const id = spawnOptions.kind ?? pick();
            const kind = kindOf(id);
            const own = typeof kind.options === 'function' ? kind.options() : kind.options;
            const enemy = options.enemies.spawn({ ...own, ...spawnOptions.options, position });
            const record: Made = { kind: id, base: { ...enemy.options }, fixed: spawnOptions.fixed ?? false, speed: enemy.options.speed };
            made.set(enemy, record);
            tune(enemy, record);
            kind.onSpawn?.(enemy);
            return enemy;
        },
        kindOf: (enemy) => made.get(enemy)?.kind,
        count: (kind) => [...made].filter(([enemy, record]) => !enemy.dead && record.kind === kind).length,
        refresh,
        forget: (enemy) => void made.delete(enemy),
        dispose: () => {
            removeSystem();
            made.clear();
        },
    };
}

//#endregion Enemy kinds
