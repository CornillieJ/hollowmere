import { SYSTEM_ORDER } from '../core/systems';
import type { Farm, PlotState } from '../game/farm';
import type { BarriersHandle, HotbarHandle, InventoryHandle, ResourceNodesHandle } from '../kit';
import type { InventorySlot } from '../game/inventory';
import { SEED_TO_CROP } from '../content/items';

/**
 * Working the field with whatever is in hand.
 *
 * Standing at a plot, the interact key does the obvious thing: a ripe crop is
 * picked, an empty plot is planted with the seeds in hand (or the first seeds
 * carried), and a dry one is watered if the can is in a pocket. The right tool
 * comes to hand by itself, and holding the key works along a row while walking. The use key does the same at a plot, and elsewhere uses the item: a
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
    /** The watering can: how many waterings are left in it, and taking one out. */
    water: { left: () => number; use: () => void };
    /** False when the farmer is too tired to work. */
    enabled?: () => boolean;
    onHarvest?: (itemId: string, amount: number, seeds: number, plot: PlotState) => void;
    /** Called when the farmer does something at a plot, for the motion and the splash. */
    onWork?: (kind: 'plant' | 'water' | 'pick', plot: PlotState) => void;
};

export function setupFarming(game: Game, options: FarmingOptions): { useHeld: (slot: InventorySlot) => void } {
    const { farm, pockets, hotbar } = options;

    const nearestPlot = (): PlotState | undefined => (game.player ? farm.nearestPlot(game.player.position, 1.7) : undefined);

    /** What the held item would do at this plot, if anything. */
    function plotAction(plot: PlotState): { label: string; run: () => void } | undefined {
        const held = hotbar.selectedId;
        /** Bring a pocket item to hand, so the farmer is seen holding what they use. */
        const take = (itemId: string): void => hotbar.select(pockets.inventory.slots.findIndex((slot) => slot.itemId === itemId));
        // The seeds in hand, or failing that the first seeds in a pocket.
        const seeds = held && SEED_TO_CROP[held] ? held : pockets.inventory.slots.find((slot) => SEED_TO_CROP[slot.itemId])?.itemId;
        if (plot.ripe) {
            return {
                label: `Pick the ${(plot.crop?.name ?? 'crop').toLowerCase()}`,
                run: () => {
                    const harvest = farm.harvest(plot);
                    if (!harvest) return;
                    options.onWork?.('pick', plot);
                    options.give(harvest.itemId, harvest.amount);
                    // The crop seeds itself: one back for the next planting, sometimes two.
                    if (harvest.seeds) options.give(harvest.seeds.itemId, harvest.seeds.amount);
                    options.onHarvest?.(harvest.itemId, harvest.amount, harvest.seeds?.amount ?? 0, plot);
                },
            };
        }
        if (!plot.crop && seeds) {
            const cropId = SEED_TO_CROP[seeds] as string;
            return {
                label: `Plant ${pockets.inventory.registry.resolve(seeds).name.toLowerCase()}`,
                run: () => {
                    if (pockets.remove(seeds, 1) && farm.plant(plot, cropId, false)) options.onWork?.('plant', plot);
                },
            };
        }
        if (plot.crop && !plot.watered && pockets.count('watering-can') > 0 && options.water.left() > 0) {
            return {
                label: `Water (${options.water.left()} left in the can)`,
                run: () => {
                    take('watering-can');
                    if (!farm.water(plot)) return;
                    options.water.use();
                    options.onWork?.('water', plot);
                },
            };
        }
        return undefined;
    }

    function plotHint(plot: PlotState): string {
        if (!plot.crop) return 'Empty plot (no seeds in your pockets)';
        if (!plot.watered) return pockets.count('watering-can') > 0 ? 'Dry. The can is empty: fill it at the well' : 'Dry (the watering can is not in your pockets)';
        return `${plot.crop.name}, growing`;
    }

    let lastPlot: PlotState | undefined;
    let sinceWork = 0;

    game.systems.add({
        name: 'farming',
        // After the interaction registry, which owns the prompt whenever it has a target.
        order: SYSTEM_ORDER.GAMEPLAY + 3,
        update: () => {
            if (game.interactions.focused || !game.state.is('playing') || options.enabled?.() === false) return;
            const plot = nearestPlot();
            if (!plot) return;
            const action = plotAction(plot);
            if (!action) {
                game.prompts.show(plotHint(plot), '');
                return;
            }
            game.prompts.show(action.label, 'E');
            // Holding the key works down a row: each plot once, a beat apart. Doing a
            // second thing to the same plot (pick, then replant) takes a fresh press.
            sinceWork += game.time.delta;
            const pressed = game.input.wasPressed('interact');
            const held = game.input.isDown('interact') && plot !== lastPlot && sinceWork > 0.16;
            if (!pressed && !held) return;
            lastPlot = plot;
            sinceWork = 0;
            action.run();
        },
    });

    return {
        useHeld: (slot) => {
            if (options.enabled?.() === false) return;
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
