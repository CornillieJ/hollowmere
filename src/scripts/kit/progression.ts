import type { ResourceHandle } from './resources';

//#region Progression

export type ProgressionOptions = {
    /** Level to start at. Defaults to 1. */
    level?: number;
    /** XP already earned. */
    xp?: number;
    /** XP needed to go from level `n` to `n + 1`. Defaults to a gentle curve. */
    xpForLevel?: (level: number) => number;
    /** Highest level. Infinity by default. */
    maxLevel?: number;
    /** Show a HUD row. Defaults to true. */
    showInHud?: boolean;
    /** Unlock ids the player starts with. */
    unlocked?: string[];
    /** Called on every level up, e.g. to tell an inventory its new level. */
    onLevelUp?: (level: number, game: Game) => void;
    /** Called when a new unlock id is set. */
    onUnlock?: (id: string, game: Game) => void;
    /** A resource to mirror the level into, e.g. a HUD counter. */
    resource?: ResourceHandle;
};

export type ProgressionHandle = {
    level: () => number;
    xp: () => number;
    /** XP still needed for the next level. */
    xpToNext: () => number;
    /** Fraction of the way to the next level, 0..1. */
    progress: () => number;
    /** Add XP, levelling up as often as the amount allows. */
    addXp: (amount: number) => number;
    setLevel: (level: number) => void;
    /** Set an unlock id, e.g. 'workshop' or 'boss-defeated'. */
    unlock: (id: string) => void;
    isUnlocked: (id: string) => boolean;
    /** Every unlock id currently set. */
    unlocks: () => string[];
    /** True when the level is at least `level`. */
    atLeast: (level: number) => boolean;
    dispose: () => void;
};

/**
 * Levels, XP and unlock flags.
 *
 * Progression is deliberately separate from the things it gates: an inventory
 * asks `isUnlocked('workshop')`, a door asks `atLeast(3)`. Wire `onLevelUp` and
 * `onUnlock` to push the new state into whatever cares.
 */
export function addProgression(game: Game, options: ProgressionOptions = {}): ProgressionHandle {
    const xpForLevel = options.xpForLevel ?? ((level) => 50 + (level - 1) * 40);
    const maxLevel = options.maxLevel ?? Infinity;
    let level = Math.min(options.level ?? 1, maxLevel);
    let xp = options.xp ?? 0;
    const unlocks = new Set(options.unlocked ?? []);

    const paint = (): void => {
        options.resource?.set(level);
        if (options.showInHud !== false) {
            game.hud.setStat('level', `Lv ${level}`, 'level');
            game.hud.setStat('xp', `${xp}/${xpForLevel(level)}`, 'xp');
        }
    };

    paint();

    function levelUp(): void {
        while (level < maxLevel && xp >= xpForLevel(level)) {
            xp -= xpForLevel(level);
            level += 1;
            game.toasts.push(`Level ${level}`, { color: '#9fe7ff' });
            game.events.emit('custom:level-up', { level });
            options.onLevelUp?.(level, game);
        }
        paint();
    }

    return {
        level: () => level,
        xp: () => xp,
        xpToNext: () => Math.max(0, xpForLevel(level) - xp),
        progress: () => {
            const needed = xpForLevel(level);
            return needed <= 0 ? 1 : Math.min(1, xp / needed);
        },
        addXp: (amount) => {
            xp += Math.max(0, amount);
            levelUp();
            return level;
        },
        setLevel: (next) => {
            level = Math.min(Math.max(1, next), maxLevel);
            xp = 0;
            paint();
        },
        unlock: (id) => {
            if (unlocks.has(id)) return;
            unlocks.add(id);
            game.toasts.push(`Unlocked: ${id.replace(/[-_]/g, ' ')}`, { color: '#b6f5b6' });
            game.events.emit('custom:unlock', { id });
            options.onUnlock?.(id, game);
            paint();
        },
        isUnlocked: (id) => unlocks.has(id),
        unlocks: () => [...unlocks],
        atLeast: (needed) => level >= needed,
        dispose: () => {
            game.hud.removeStat('level');
            game.hud.removeStat('xp');
        },
    };
}

//#endregion Progression
