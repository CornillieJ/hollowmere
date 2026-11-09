/**
 * Friendship with characters: points, hearts, and once-a-day rules for talking
 * and gifts, the Harvest Moon way.
 *
 * Pure logic, no scene: it only needs to know what day it is.
 */
export type GiftTaste = 'loved' | 'liked' | 'neutral' | 'disliked';

export type RelationshipOptions = {
    /** Points per heart. */
    pointsPerHeart?: number;
    maxHearts?: number;
    /** Points for the first chat of the day. */
    talkPoints?: number;
    giftPoints?: Partial<Record<GiftTaste, number>>;
    /** The current day number, so talks and gifts can be limited per day. */
    day: () => number;
};

type Record_ = { points: number; talkedOn: number; giftedOn: number };

const DEFAULT_GIFT_POINTS: Record<GiftTaste, number> = { loved: 80, liked: 45, neutral: 15, disliked: -20 };

export class Relationships {
    private readonly records = new Map<string, Record_>();
    private readonly options: Required<Omit<RelationshipOptions, 'giftPoints'>> & { giftPoints: Record<GiftTaste, number> };
    private readonly listeners = new Set<(id: string, points: number, hearts: number) => void>();

    constructor(options: RelationshipOptions) {
        this.options = {
            pointsPerHeart: options.pointsPerHeart ?? 100,
            maxHearts: options.maxHearts ?? 10,
            talkPoints: options.talkPoints ?? 10,
            day: options.day,
            giftPoints: { ...DEFAULT_GIFT_POINTS, ...options.giftPoints },
        };
    }

    points(id: string): number {
        return this.record(id).points;
    }

    hearts(id: string): number {
        return Math.min(this.options.maxHearts, Math.floor(this.points(id) / this.options.pointsPerHeart));
    }

    /** Fraction towards the next heart, 0..1, for a progress bar. */
    progress(id: string): number {
        return (this.points(id) % this.options.pointsPerHeart) / this.options.pointsPerHeart;
    }

    /** Add or remove points directly, e.g. for finishing a request. */
    add(id: string, amount: number): void {
        const record = this.record(id);
        const cap = this.options.pointsPerHeart * this.options.maxHearts;
        record.points = Math.max(0, Math.min(cap, record.points + amount));
        for (const listener of this.listeners) listener(id, record.points, this.hearts(id));
    }

    /** The first chat of the day counts; the rest are just chats. Returns the points gained. */
    talk(id: string): number {
        const record = this.record(id);
        if (record.talkedOn === this.options.day()) return 0;
        record.talkedOn = this.options.day();
        this.add(id, this.options.talkPoints);
        return this.options.talkPoints;
    }

    canGift(id: string): boolean {
        return this.record(id).giftedOn !== this.options.day();
    }

    /** One gift per day per character. Returns the points it was worth, or `undefined` when refused. */
    gift(id: string, taste: GiftTaste): number | undefined {
        if (!this.canGift(id)) return undefined;
        this.record(id).giftedOn = this.options.day();
        const points = this.options.giftPoints[taste];
        this.add(id, points);
        return points;
    }

    onChange(listener: (id: string, points: number, hearts: number) => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    toJSON(): Array<{ id: string; points: number; talkedOn: number; giftedOn: number }> {
        return [...this.records].map(([id, record]) => ({ id, ...record }));
    }

    fromJSON(data: Array<{ id: string; points: number; talkedOn?: number; giftedOn?: number }> | undefined): void {
        this.records.clear();
        for (const entry of data ?? []) this.records.set(entry.id, { points: entry.points, talkedOn: entry.talkedOn ?? -1, giftedOn: entry.giftedOn ?? -1 });
    }

    private record(id: string): Record_ {
        let record = this.records.get(id);
        if (!record) {
            record = { points: 0, talkedOn: -1, giftedOn: -1 };
            this.records.set(id, record);
        }
        return record;
    }
}
