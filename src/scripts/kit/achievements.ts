import { SYSTEM_ORDER } from '../core/systems';
import type { PanelRow } from '../ui/list-panel';

//#region Achievements

/**
 * Deeds worth a line on the screen: each has a check that is asked a few times
 * a second, and is earned once, for good. Earning one shows a toast and is
 * saved. `rows` lists them for a journal tab.
 *
 * ```ts
 * const deeds = addAchievements(game, {
 *     achievements: [{ id: 'first-dish', icon: '🍲', title: 'Something hot', description: 'Cook a dish.', done: () => cooked > 0 }],
 * });
 * ```
 */
export type Achievement = {
    id: string;
    title: string;
    description: string;
    icon?: string;
    /** True once it has been done. Not needed for one that is only ever awarded by hand. */
    done?: () => boolean;
    /** Keep the title and description secret until it is earned. */
    hidden?: boolean;
};

export type AddAchievementsOptions = {
    achievements: Achievement[];
    /** Save key. Defaults to `'achievements'`. */
    persist?: string;
    onEarned?: (achievement: Achievement) => void;
};

export type AchievementsHandle = {
    has: (id: string) => boolean;
    /** Award one by hand, e.g. from an event. Returns false when it was already earned. */
    award: (id: string) => boolean;
    readonly earned: number;
    readonly total: number;
    /** One row per achievement, earned ones first, for `addPanel`. */
    rows: () => PanelRow[];
    dispose: () => void;
};

export function addAchievements(game: Game, options: AddAchievementsOptions): AchievementsHandle {
    const earned = new Set<string>();
    const award = (id: string): boolean => {
        const achievement = options.achievements.find((entry) => entry.id === id);
        if (!achievement || earned.has(id)) return false;
        earned.add(id);
        game.toasts.push(`${achievement.icon ?? ':star:'} ${achievement.title}`, { color: '#ffe08a' });
        options.onEarned?.(achievement);
        return true;
    };

    let timer = 0;
    const removeSystem = game.systems.add({
        name: 'achievements',
        order: SYSTEM_ORDER.GAMEPLAY + 9,
        update: (delta) => {
            timer -= delta;
            if (timer > 0) return;
            timer = 0.5;
            for (const achievement of options.achievements) if (!earned.has(achievement.id) && achievement.done?.()) award(achievement.id);
        },
    });
    const removeSave = game.save.register(options.persist ?? 'achievements', {
        save: () => [...earned],
        load: (data) => {
            earned.clear();
            for (const id of Array.isArray(data) ? (data as string[]) : []) earned.add(id);
        },
    });

    return {
        has: (id) => earned.has(id),
        award,
        get earned() {
            return earned.size;
        },
        total: options.achievements.length,
        rows: () =>
            [...options.achievements]
                .sort((a, b) => Number(earned.has(b.id)) - Number(earned.has(a.id)))
                .map((achievement) => {
                    const got = earned.has(achievement.id);
                    const secret = achievement.hidden && !got;
                    return { icon: got ? (achievement.icon ?? ':star:') : '·', title: secret ? '???' : achievement.title, detail: secret ? 'Not found yet.' : achievement.description, dim: !got, ...(got ? { meta: 'Done' } : {}) };
                }),
        dispose: () => {
            removeSystem();
            removeSave();
        },
    };
}

//#endregion Achievements
