import * as THREE from 'three';

import { Upgrades, type UpgradeDefinition } from '../game/upgrades';
import type { PanelRow } from '../ui/list-panel';
import { addPanel, type PanelHandle } from './panel';
import type { ResourceHandle } from './resources';

//#region Upgrades

/**
 * An upgrade shop: a list of lasting improvements bought with a resource.
 *
 * ```ts
 * const upgrades = addUpgrades(game, {
 *     title: 'Farm upgrades',
 *     currency: coins,
 *     upgrades: [
 *         { id: 'field', name: 'More land', icon: '🌱', levels: [{ cost: 120 }, { cost: 300 }], apply: (level) => farm.setFields(1 + level) },
 *     ],
 * });
 * upgrades.open();
 * ```
 */
export type AddUpgradesOptions = {
    title: string;
    upgrades: UpgradeDefinition[];
    currency: ResourceHandle;
    /** How a price reads. Defaults to the bare number. */
    format?: (amount: number) => string;
    /** Something in the world to open the list from. */
    object?: THREE.Object3D;
    prompt?: string;
    range?: number;
    /** Save key. Defaults to `'upgrades'`. */
    persist?: string;
    onBought?: (definition: UpgradeDefinition, level: number) => void;
};

export type UpgradesHandle = {
    readonly upgrades: Upgrades;
    readonly panel: PanelHandle;
    level: (id: string) => number;
    buy: (id: string) => boolean;
    open: () => void;
    dispose: () => void;
};

export function addUpgrades(game: Game, options: AddUpgradesOptions): UpgradesHandle {
    const upgrades = new Upgrades(options.upgrades);
    const format = options.format ?? ((amount: number) => String(amount));

    const buy = (id: string): boolean => {
        const bought = upgrades.buy(id, (cost) => options.currency.trySpend(cost));
        const definition = upgrades.definition(id);
        if (bought && definition) {
            const level = upgrades.level(id);
            game.toasts.push(`Bought: ${definition.levels[level - 1]?.name ?? definition.name}`, { color: '#d8e8b0' });
            options.onBought?.(definition, level);
        }
        return bought;
    };

    const rows = (): PanelRow[] =>
        upgrades.definitions
            .filter((definition) => upgrades.visible(definition.id))
            .map((definition) => {
                const level = upgrades.level(definition.id);
                const next = upgrades.next(definition.id);
                const steps = definition.levels.length;
                const row: PanelRow = {
                    title: `${next?.name ?? definition.name}${steps > 1 ? ` (${level}/${steps})` : ''}`,
                    detail: next?.description ?? definition.description ?? '',
                    ...(definition.icon !== undefined ? { icon: definition.icon } : {}),
                };
                if (next) {
                    row.meta = format(next.cost);
                    row.action = { label: 'Buy', enabled: options.currency.value() >= next.cost, onPress: () => void buy(definition.id) };
                } else {
                    row.dim = true;
                    row.meta = 'Owned';
                }
                return row;
            });

    const panel = addPanel(game, { title: options.title, rows, footer: () => `You have ${format(options.currency.value())}` });
    const removers: Array<() => void> = [];
    if (options.object) removers.push(game.interactions.add(options.object, { prompt: options.prompt ?? options.title, range: options.range ?? 2.6, onInteract: () => panel.open() }));
    removers.push(
        game.save.register(options.persist ?? 'upgrades', {
            save: () => upgrades.toJSON(),
            load: (data) => upgrades.fromJSON(data as Record<string, number> | undefined),
        }),
    );

    return {
        upgrades,
        panel,
        level: (id) => upgrades.level(id),
        buy,
        open: () => panel.open(),
        dispose: () => {
            for (const remove of removers) remove();
            panel.dispose();
        },
    };
}

export type { UpgradeDefinition, UpgradeLevel } from '../game/upgrades';

//#endregion Upgrades
