import type { VillagerTopic } from '../kit';
import type { PanelRow } from '../ui/list-panel';
import { REGULARS, type Favour, type Regular } from '../content/regulars';

/**
 * Regulars: a standing order from everybody who has taken to the farmer, a
 * dish they teach, and a favour that lasts.
 *
 * All three are reached through the villager's own list of things to say, as
 * pinned topics, so nothing happens that nobody said out loud.
 */
export type RegularsOptions = {
    day: () => number;
    hearts: (id: string) => number;
    nameOf: (id: string) => string;
    itemName: (itemId: string) => string;
    have: (itemId: string) => number;
    take: (itemId: string, amount: number) => boolean;
    /** What the stall would pay for one, for working out the pay. */
    stallPrice: (itemId: string) => number;
    format: (amount: number) => string;
    /** Called when a villager teaches their dish, for the fanfare. */
    onTaught: (regular: Regular) => void;
    /** What has been taught changed, by a lesson or by a load: bring the pot's recipes in line. */
    onRecipesChanged: () => void;
    onFavour: (regular: Regular) => void;
    /** Called when a regular order is handed over, with the pay before any bonus. */
    onDelivered: (regular: Regular, itemId: string, amount: number, pay: number) => void;
    /** A new order has come round. */
    onOpened: (regular: Regular, itemId: string, first: boolean) => void;
    onLapsed: (regular: Regular, itemId: string) => void;
};

type Order = {
    /** The day it came round, or 0 while there is none. */
    opened: number;
    /** The day the next one comes round. */
    next: number;
    filled: number;
};

export type RegularsHandle = {
    /** Pinned topics to add to a villager's own. */
    topicsFor: (id: string) => VillagerTopic[];
    /** What their order is for right now, and whether it is waiting to be filled. */
    orderOf: (id: string) => { itemId: string; amount: number; open: boolean; dueDay: number; pay: number } | undefined;
    has: (favour: Favour) => boolean;
    taught: (id: string) => boolean;
    /** Call each morning: opens the orders that have come round and lets the stale ones lapse. */
    newDay: () => void;
    /** The item ids somebody's open order is for, so nothing sells them by accident. */
    wanted: (itemId: string) => string | undefined;
    /** Rows for the notebook. */
    rows: () => PanelRow[];
    toJSON: () => unknown;
    fromJSON: (data: unknown) => void;
};

/** Days an order waits before the villager gives up on it. */
const PATIENCE = 3;
/** A regular order pays this much over what the stall would. */
const PREMIUM = 1.7;

export function setupRegulars(options: RegularsOptions): RegularsHandle {
    const orders = new Map<string, Order>(REGULARS.map((regular) => [regular.id, { opened: 0, next: 0, filled: 0 }]));
    const taught = new Set<string>();
    const favours = new Set<Favour>();
    const byId = (id: string): Regular | undefined => REGULARS.find((regular) => regular.id === id);
    const orderState = (id: string): Order => orders.get(id) as Order;

    /** Their own dish once they have taught it; the plain favourite until then. */
    const wants = (regular: Regular): { itemId: string; amount: number } => (taught.has(regular.id) ? { itemId: regular.teaches.output.itemId, amount: regular.amount } : { itemId: regular.favourite, amount: regular.amount });
    const payFor = (itemId: string, amount: number): number => Math.round(options.stallPrice(itemId) * amount * PREMIUM);

    const orderOf: RegularsHandle['orderOf'] = (id) => {
        const regular = byId(id);
        if (!regular || options.hearts(id) < 1) return undefined;
        const state = orderState(id);
        const { itemId, amount } = wants(regular);
        return { itemId, amount, open: state.opened > 0, dueDay: state.opened > 0 ? state.opened + PATIENCE - 1 : state.next, pay: payFor(itemId, amount) };
    };

    const newDay = (): void => {
        const day = options.day();
        for (const regular of REGULARS) {
            const state = orderState(regular.id);
            if (options.hearts(regular.id) < 1) continue;
            const { itemId } = wants(regular);
            if (state.opened > 0 && day >= state.opened + PATIENCE) {
                state.opened = 0;
                state.next = day + 2;
                options.onLapsed(regular, itemId);
            }
            if (state.opened === 0 && day >= state.next) {
                state.opened = day;
                options.onOpened(regular, itemId, state.filled === 0 && state.next === 0);
            }
        }
    };

    const topicsFor = (id: string): VillagerTopic[] => {
        const regular = byId(id);
        if (!regular) return [];
        return [
            {
                id: 'regular-order',
                pinned: true,
                label: () => {
                    const order = orderOf(id);
                    return order ? `Hand over the regular order (${order.amount} ${options.itemName(order.itemId).toLowerCase()})` : 'The regular order';
                },
                visible: () => {
                    const order = orderOf(id);
                    return Boolean(order?.open) && options.have(order?.itemId ?? '') >= (order?.amount ?? 1);
                },
                lines: () => [regular.thanks[orderState(id).filled % regular.thanks.length] as string],
                after: () => {
                    const order = orderOf(id);
                    const state = orderState(id);
                    if (!order?.open || !options.take(order.itemId, order.amount)) return;
                    state.opened = 0;
                    state.next = options.day() + regular.every;
                    state.filled += 1;
                    options.onDelivered(regular, order.itemId, order.amount, order.pay);
                },
            },
            {
                id: 'regular-teach',
                pinned: true,
                label: regular.teachLabel,
                minHearts: 2,
                visible: () => !taught.has(id),
                lines: regular.teachLines,
                after: () => {
                    if (taught.has(id)) return;
                    taught.add(id);
                    options.onRecipesChanged();
                    options.onTaught(regular);
                },
            },
            {
                id: 'regular-favour',
                pinned: true,
                label: regular.favour.label,
                minHearts: 3,
                visible: () => !favours.has(regular.favour.id),
                lines: regular.favour.lines,
                after: () => {
                    if (favours.has(regular.favour.id)) return;
                    favours.add(regular.favour.id);
                    options.onFavour(regular);
                },
            },
        ];
    };

    return {
        topicsFor,
        orderOf,
        has: (favour) => favours.has(favour),
        taught: (id) => taught.has(id),
        newDay,
        wanted: (itemId) => {
            const regular = REGULARS.find((candidate) => {
                const order = orderOf(candidate.id);
                return order?.open && order.itemId === itemId;
            });
            return regular ? options.nameOf(regular.id) : undefined;
        },
        rows: () => {
            const known = REGULARS.filter((regular) => options.hearts(regular.id) >= 1);
            const rows: PanelRow[] = [{ heading: true, title: 'Regulars' }];
            if (known.length === 0) rows.push({ title: 'Nobody yet', detail: 'Whoever you reach 1 heart with starts a regular order: their favourite, every few days, for far more than the stall pays.', dim: true });
            for (const regular of known) {
                const order = orderOf(regular.id);
                if (!order) continue;
                const hearts = options.hearts(regular.id);
                const item = options.itemName(order.itemId).toLowerCase();
                const next = taught.has(regular.id) ? (favours.has(regular.favour.id) ? `Favour: ${regular.favour.title}. ${regular.favour.text}` : hearts >= 3 ? 'Has a favour to offer: go and ask.' : 'At 3 hearts: a favour that lasts.') : hearts >= 2 ? 'Will teach you a dish: go and ask.' : 'At 2 hearts: teaches you a dish.';
                rows.push({
                    icon: order.open ? ':alert:' : ':basket:',
                    title: `${options.nameOf(regular.id)}: ${order.amount} ${item}`,
                    detail: `${order.open ? `Waiting for it now, until the end of day ${order.dueDay}. Hand it over when you talk.` : `Comes round again on day ${order.dueDay}.`} ${next}`,
                    meta: options.format(order.pay),
                    ...(order.open ? {} : { dim: true }),
                });
            }
            return rows;
        },
        toJSON: () => ({ orders: Object.fromEntries(orders), taught: [...taught], favours: [...favours] }),
        fromJSON: (data) => {
            const saved = (data ?? {}) as { orders?: Record<string, Partial<Order>>; taught?: string[]; favours?: Favour[] };
            for (const [id, state] of orders) Object.assign(state, { opened: 0, next: 0, filled: 0 }, saved.orders?.[id]);
            taught.clear();
            favours.clear();
            for (const id of saved.taught ?? []) if (byId(id)) taught.add(id);
            for (const favour of saved.favours ?? []) favours.add(favour);
            options.onRecipesChanged();
        },
    };
}
