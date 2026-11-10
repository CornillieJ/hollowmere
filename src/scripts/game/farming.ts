import { SYSTEM_ORDER } from '../core/systems';
import type { Farm, PlotState } from '../game/farm';
import type { BarriersHandle, HotbarHandle, InventoryHandle, ResourceHandle, ResourceNodesHandle } from '../kit';
import type { InventorySlot } from '../game/inventory';
import { SEED_TO_CROP, SHIPPABLE } from '../content/items';

/**
 * Working the field with whatever is in hand.
 *
 * Standing at a plot, the interact key does the obvious thing for the held item:
 * seeds plant, the watering can waters, and a ripe crop is picked whatever you
 * hold. The use key does the same at a plot, and elsewhere uses the item: a
 * fence kit puts a fence down in front of you, and the axe swings at the nearest
 * tree.
 */
export type FarmingOptions = {
    farm: Farm;
    pockets: InventoryHandle;
    hotbar: HotbarHandle;
    barriers: BarriersHandle;
    /** Puts items in the pockets, overflowing into the bag. */
    give: (itemId: string, amount: number) => boolean;
    /** Trees and other things to gather from, for the axe. */
    nodes: () => ResourceNodesHandle | undefined;
    onHarvest?: (itemId: string, amount: number) => void;
    /** Called when the farmer does something at a plot, for the motion and the splash. */
    onWork?: (kind: 'plant' | 'water' | 'pick', plot: PlotState) => void;
};

export function setupFarming(game: Game, options: FarmingOptions): { useHeld: (slot: InventorySlot) => void } {
    const { farm, pockets, hotbar } = options;

    const nearestPlot = (): PlotState | undefined => (game.player ? farm.nearestPlot(game.player.position, 1.7) : undefined);

    /** What the held item would do at this plot, if anything. */
    function plotAction(plot: PlotState): { label: string; run: () => void } | undefined {
        const held = hotbar.selectedId;
        if (plot.ripe) {
            return {
                label: `Pick the ${(plot.crop?.name ?? 'crop').toLowerCase()}`,
                run: () => {
                    const harvest = farm.harvest(plot);
                    if (!harvest) return;
                    options.onWork?.('pick', plot);
                    options.give(harvest.itemId, harvest.amount);
                    // The crop seeds itself: one back for the next planting, sometimes two.
                    if (harvest.seeds) {
                        options.give(harvest.seeds.itemId, harvest.seeds.amount);
                        game.toasts.push(`+${harvest.seeds.amount} seed${harvest.seeds.amount > 1 ? 's' : ''}`, { color: '#c8d8b0' });
                    }
                    options.onHarvest?.(harvest.itemId, harvest.amount);
                },
            };
        }
        if (!plot.crop && held && SEED_TO_CROP[held]) {
            const cropId = SEED_TO_CROP[held] as string;
            return {
                label: `Plant ${pockets.inventory.registry.resolve(held).name.toLowerCase()}`,
                run: () => {
                    if (pockets.remove(held, 1) && farm.plant(plot, cropId, false)) options.onWork?.('plant', plot);
                },
            };
        }
        if (plot.crop && !plot.watered && held === 'watering-can') return { label: 'Water', run: () => void (farm.water(plot) && options.onWork?.('water', plot)) };
        return undefined;
    }

    function plotHint(plot: PlotState): string {
        if (!plot.crop) return 'Empty plot (hold seeds)';
        if (!plot.watered) return 'Dry (hold the watering can)';
        return `${plot.crop.name}, growing`;
    }

    game.systems.add({
        name: 'farming',
        // After the interaction registry, which owns the prompt whenever it has a target.
        order: SYSTEM_ORDER.GAMEPLAY + 3,
        update: () => {
            if (game.interactions.focused || !game.state.is('playing')) return;
            const plot = nearestPlot();
            if (!plot) return;
            const action = plotAction(plot);
            if (!action) {
                game.prompts.show(plotHint(plot), '');
                return;
            }
            game.prompts.show(action.label, 'E');
            if (game.input.wasPressed('interact')) action.run();
        },
    });

    return {
        useHeld: (slot) => {
            const plot = nearestPlot();
            const action = plot ? plotAction(plot) : undefined;
            if (action) {
                action.run();
                return;
            }
            if (slot.itemId === 'fence-kit' && pockets.remove('fence-kit', 1)) {
                options.barriers.placeInFront(1.8);
                return;
            }
            if (slot.itemId === 'axe') {
                if (!options.nodes()?.hitNearest(2.6)) game.toasts.push('Stand next to a dead tree to chop it');
                return;
            }
            if (slot.itemId === 'watering-can') game.toasts.push('Stand at a planted plot to water it');
            else if (SEED_TO_CROP[slot.itemId]) game.toasts.push('Stand at an empty plot to plant');
        },
    };
}

/**
 * Sell all produce and cooked food carried. The bin is always there and never
 * haggles, so it pays less than the store does.
 * @returns The money made.
 */
export function shipEverything(inventories: InventoryHandle[], money: ResourceHandle, priceOf: (itemId: string) => number): number {
    let total = 0;
    for (const inventory of inventories) {
        for (const slot of [...inventory.inventory.slots]) {
            if (!SHIPPABLE.has(slot.itemId)) continue;
            total += Math.floor(priceOf(slot.itemId) * 0.8) * slot.amount;
            inventory.remove(slot.itemId, slot.amount);
        }
    }
    if (total > 0) money.add(total);
    return total;
}
