/**
 * Errands: characters ask for items, the player brings them, and gets paid.
 *
 * The delivery loop of a farming or courier game in one small class: requests
 * are drawn from a pool, each has a deadline in days, and handing one in takes
 * the items from an inventory and reports the reward. What a reward means
 * (money, friendship, an unlock) is up to the game.
 */
export type RequestTemplate = {
    /** Who may ask for this. Omit to let anyone ask. */
    from?: string[];
    itemId: string;
    /** A fixed amount, or a range to roll from. */
    amount: number | [number, number];
    /** Money paid per item. */
    pricePerItem: number;
    /** Friendship gained on delivery. */
    friendship?: number;
    /** Days to deliver. */
    days?: number;
    /** What they say when asking. `{amount}` and `{item}` are filled in. */
    text?: string;
    /**
     * Part of the reward, 0..1, the asker wants up front before the job is on.
     * It comes back with the pay, and is lost when the deadline passes.
     */
    deposit?: number;
    /** Asked only while this is true, e.g. the player owns the pot the dish needs. Keeps the board to things that can be done. */
    available?: () => boolean;
    /** Harder requests have a higher tier and stay away until the board reaches it. Defaults to 0. */
    tier?: number;
};

export type Request = {
    id: number;
    from: string;
    itemId: string;
    amount: number;
    reward: number;
    friendship: number;
    dueDay: number;
    text: string;
    tier: number;
    /** Money to put down before the job counts as taken. 0 for none. */
    deposit: number;
    /** False while a job with a deposit is only on offer. */
    accepted: boolean;
};

export type RequestBoardOptions = {
    templates: RequestTemplate[];
    /** Characters who can ask. */
    people: string[];
    /** At most this many open requests at once. */
    maxOpen?: number;
    /** The current day number. */
    day: () => number;
    /**
     * The highest tier that may be asked for right now. Defaults to one tier per
     * `deliveriesPerTier` finished requests, so the asks grow with the player.
     */
    tier?: () => number;
    /** Finished requests per tier when `tier` is not given. Defaults to 3. */
    deliveriesPerTier?: number;
    /** Item names for the request text. */
    itemName?: (itemId: string) => string;
    random?: () => number;
};

export type RequestInventory = {
    count: (itemId: string) => number;
    remove: (itemId: string, amount: number) => boolean;
};

export class RequestBoard {
    readonly open: Request[] = [];

    private readonly options: RequestBoardOptions;
    private readonly listeners = new Set<() => void>();
    private nextId = 1;
    /** Requests handed in so far. */
    completed = 0;

    constructor(options: RequestBoardOptions) {
        this.options = options;
    }

    /** Requests a person has open. */
    from(person: string): Request[] {
        return this.open.filter((request) => request.from === person);
    }

    /** The highest tier on offer right now. */
    get tier(): number {
        return this.options.tier?.() ?? Math.floor(this.completed / (this.options.deliveriesPerTier ?? 3));
    }

    /** Draw new requests until the board is full. Call it each morning. */
    refill(): Request[] {
        const random = this.options.random ?? Math.random;
        const added: Request[] = [];
        const max = this.options.maxOpen ?? 3;
        let attempts = 0;
        while (this.open.length < max && attempts < 20) {
            attempts += 1;
            const template = this.draw(random);
            if (!template) break;
            const candidates = (template.from ?? this.options.people).filter((person) => this.from(person).length === 0);
            const person = candidates[Math.floor(random() * candidates.length)];
            if (!person) continue;
            const amount = Array.isArray(template.amount) ? template.amount[0] + Math.floor(random() * (template.amount[1] - template.amount[0] + 1)) : template.amount;
            const name = this.options.itemName?.(template.itemId) ?? template.itemId;
            const request: Request = {
                id: this.nextId++,
                from: person,
                itemId: template.itemId,
                amount,
                reward: amount * template.pricePerItem,
                friendship: template.friendship ?? 30,
                dueDay: this.options.day() + (template.days ?? 3),
                text: (template.text ?? 'Could you bring me {amount} {item}?').replace('{amount}', String(amount)).replace('{item}', name),
                tier: template.tier ?? 0,
                deposit: Math.round(amount * template.pricePerItem * (template.deposit ?? 0)),
                accepted: !template.deposit,
            };
            this.open.push(request);
            added.push(request);
        }
        if (added.length > 0) this.notify();
        return added;
    }

    /** Drop requests past their deadline. Returns the ones that lapsed. */
    expire(): Request[] {
        const today = this.options.day();
        const lapsed = this.open.filter((request) => request.dueDay < today);
        if (lapsed.length === 0) return lapsed;
        for (const request of lapsed) this.open.splice(this.open.indexOf(request), 1);
        this.notify();
        return lapsed;
    }

    /** True when the inventory holds enough to hand the request in. */
    canFulfil(request: Request, inventory: RequestInventory): boolean {
        return request.accepted && inventory.count(request.itemId) >= request.amount;
    }

    /**
     * Take a job that asks for a deposit.
     * @param pay Takes the deposit and returns whether it could.
     */
    accept(request: Request, pay: (amount: number) => boolean): boolean {
        if (request.accepted) return true;
        if (!this.open.includes(request) || !pay(request.deposit)) return false;
        request.accepted = true;
        this.notify();
        return true;
    }

    /** Take the items and close the request. Returns it, or `undefined` when short. */
    fulfil(request: Request, inventory: RequestInventory): Request | undefined {
        if (!this.open.includes(request) || !this.canFulfil(request, inventory)) return undefined;
        if (!inventory.remove(request.itemId, request.amount)) return undefined;
        this.open.splice(this.open.indexOf(request), 1);
        this.completed += 1;
        this.notify();
        return request;
    }

    onChange(listener: () => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    toJSON(): { open: Request[]; nextId: number; completed: number } {
        return { open: this.open.map((request) => ({ ...request })), nextId: this.nextId, completed: this.completed };
    }

    fromJSON(data: { open?: Request[]; nextId?: number; completed?: number } | undefined): void {
        this.open.length = 0;
        this.open.push(...(data?.open ?? []).map((request) => ({ ...request, tier: request.tier ?? 0, deposit: request.deposit ?? 0, accepted: request.accepted ?? true })));
        this.nextId = data?.nextId ?? this.open.length + 1;
        this.completed = data?.completed ?? 0;
        this.notify();
    }

    /**
     * Pick a template that is unlocked and not already asked for. Higher tiers
     * weigh more, so the board leans towards the best the player can manage
     * while still mixing in easy ones.
     */
    private draw(random: () => number): RequestTemplate | undefined {
        const tier = this.tier;
        const unlocked = this.options.templates.filter((template) => (template.tier ?? 0) <= tier && template.available?.() !== false);
        const fresh = unlocked.filter((template) => !this.open.some((request) => request.itemId === template.itemId));
        const pool = fresh.length > 0 ? fresh : unlocked;
        const weight = (template: RequestTemplate): number => 1 + (template.tier ?? 0);
        let roll = random() * pool.reduce((total, template) => total + weight(template), 0);
        for (const template of pool) {
            roll -= weight(template);
            if (roll <= 0) return template;
        }
        return pool[pool.length - 1];
    }

    private notify(): void {
        for (const listener of this.listeners) listener();
    }
}
