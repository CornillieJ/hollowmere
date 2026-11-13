import * as THREE from 'three';

import { addPanel, type InventoryHandle, type PanelHandle, type ResourceHandle } from '../kit';
import type { PanelRow } from '../ui/list-panel';
import { SHIPPABLE } from '../content/items';
import { modelled } from './models';
import { solid } from './world';

/**
 * A place that buys what the farmer carries, out of the pockets and the backpack alike.
 *
 * There are two. Barnaby's collection crate by the mailbox is the one way to
 * turn a surplus into coins without the ride to the village, and pays less
 * for it. The scales on his stall pay the full stall price. Both open the same
 * window: every stack is listed with what it fetches, and whatever a villager
 * is waiting for is marked and kept out of "sell all", because they pay more.
 */
export type CrateOptions = {
    position: THREE.Vector3;
    yaw?: number;
    /** Everything the farmer carries, in the order it is taken from. */
    carried: InventoryHandle[];
    coins: ResourceHandle;
    /** What the stall pays for one. */
    stallPrice: (itemId: string) => number;
    /** The part of the stall price paid here. Defaults to `CRATE_SHARE`. A function can change with events. */
    share?: number | (() => number);
    title?: string;
    /** The first row of the window: what this place is for. */
    intro?: { title: string; detail: string };
    prompt?: string;
    /** Who pays, for the toast. */
    payer?: string;
    /** The model in `static/models/props`. */
    model?: string;
    /** Give the crate a solid box, and list it here for the Hollow to steer round. */
    solids?: THREE.Box3[];
    /** Who has asked for this item, if anybody has. */
    wantedBy: (itemId: string) => string | undefined;
    format: (amount: number) => string;
    onSent?: (coins: number) => void;
};

export type CrateHandle = PanelHandle & {
    readonly object: THREE.Object3D;
    /** What one of these fetches in the crate. */
    priceOf: (itemId: string) => number;
    /** Send every stack of one item. Returns the coins made. */
    send: (itemId: string) => number;
    /** Send everything nobody has asked for. Returns the coins made. */
    sendSpare: () => number;
};

/** The crate's share of the stall's buying price: somebody has to come and fetch it. */
export const CRATE_SHARE = 0.8;

export function setupCrate(game: Game, options: CrateOptions): CrateHandle {
    const { carried, coins, format } = options;
    const shareNow = (): number => (typeof options.share === 'function' ? options.share() : (options.share ?? CRATE_SHARE));
    const payer = options.payer ?? "Barnaby's crate";
    const priceOf = (itemId: string): number => Math.floor(options.stallPrice(itemId) * shareNow());

    /** One line per kind of thing, however many stacks and bags it is spread over. */
    const stock = (): Array<{ itemId: string; name: string; icon: string; amount: number; wanted: string | undefined }> => {
        const lines = new Map<string, { itemId: string; name: string; icon: string; amount: number; wanted: string | undefined }>();
        for (const handle of carried) {
            for (const slot of handle.inventory.slots) {
                if (!SHIPPABLE.has(slot.itemId)) continue;
                const line = lines.get(slot.itemId) ?? { itemId: slot.itemId, name: slot.definition.name, icon: slot.definition.icon ?? ':box:', amount: 0, wanted: options.wantedBy(slot.itemId) };
                line.amount += slot.amount;
                lines.set(slot.itemId, line);
            }
        }
        return [...lines.values()];
    };

    const send = (itemId: string): number => {
        let amount = 0;
        for (const handle of carried) {
            const held = handle.count(itemId);
            if (held > 0 && handle.remove(itemId, held)) amount += held;
        }
        const made = priceOf(itemId) * amount;
        if (made > 0) {
            coins.add(made);
            options.onSent?.(made);
        }
        return made;
    };
    const sendSpare = (): number => {
        const made = stock()
            .filter((line) => !line.wanted)
            .reduce((total, line) => total + send(line.itemId), 0);
        game.toasts.push(made > 0 ? `${payer} paid ${format(made)}` : 'Nothing to send', { color: made > 0 ? '#d8e8b0' : '#c0b0a0' });
        return made;
    };

    const panel = addPanel(game, {
        title: options.title ?? "Barnaby's collection crate",
        rows: (): PanelRow[] => {
            const lines = stock();
            const spare = lines.filter((line) => !line.wanted);
            const total = spare.reduce((sum, line) => sum + priceOf(line.itemId) * line.amount, 0);
            return [
                {
                    icon: ':box:',
                    title: options.intro?.title ?? 'Sell from home, for a little less',
                    detail: options.intro?.detail ?? (shareNow() < 1 ? 'For crops, food and wood you have too much of. Barnaby pays at once, but less than at his stall. A villager who asked for something pays far more.' : 'For crops, food and wood you have too much of. You are in the green book: Barnaby pays the full stall price here. A villager who asked for something still pays far more.'),
                },
                { heading: true, title: 'What you carry' },
                ...(lines.length === 0 ? [{ title: 'Nothing the crate takes.', detail: 'It does not take tools, seeds or the things you keep.', dim: true }] : []),
                ...lines.map((line) => ({
                    icon: line.icon,
                    title: `${line.name} ×${line.amount}`,
                    detail: line.wanted ? `${line.wanted} asked for this` : shareNow() < 1 ? `${format(priceOf(line.itemId))} each (stall: ${format(options.stallPrice(line.itemId))})` : `${format(priceOf(line.itemId))} each`,
                    meta: format(priceOf(line.itemId) * line.amount),
                    action: {
                        label: line.wanted ? 'Sell anyway' : 'Sell',
                        onPress: () => {
                            const made = send(line.itemId);
                            game.toasts.push(`${payer} paid ${format(made)}`, { color: '#d8e8b0' });
                        },
                    },
                })),
                ...(spare.length > 1 ? [{ title: 'Everything nobody asked for', meta: format(total), action: { label: 'Sell all', onPress: () => void sendSpare() } }] : []),
            ];
        },
        footer: () => `You have ${format(coins.value())}`,
    });

    const object = new THREE.Group();
    const box = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.8, 0.8), new THREE.MeshStandardMaterial({ color: 0x5a4430, roughness: 1, flatShading: true }));
    box.position.y = 0.4;
    box.castShadow = true;
    object.add(box);
    modelled(game, options.model ?? 'postcrate', object);
    object.position.copy(options.position);
    object.rotation.y = options.yaw ?? 0;
    game.scene.add(object);
    if (options.solids) solid(game, object, { solids: options.solids }, 1);
    game.interactions.add(object, { prompt: options.prompt ?? "Open Barnaby's collection crate", range: 2.2, onInteract: () => panel.open() });

    return Object.assign(panel, { object, priceOf, send, sendSpare });
}
