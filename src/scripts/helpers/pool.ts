/**
 * A generic object pool.
 *
 * Bullets, particles, floating texts and enemies all churn short-lived objects;
 * allocating them in the frame loop shows up as garbage collection hitches on
 * phones. A pool creates up front, reuses on release, and only grows when it
 * has to. `ProjectileSystem` pools internally the same way; this is the version
 * for everything else.
 *
 * ```ts
 * const pool = new Pool(() => new THREE.Vector3(), (v) => v.set(0, 0, 0), 32);
 * const v = pool.acquire();
 * v.set(1, 2, 3);
 * pool.release(v);
 * ```
 */
export class Pool<T> {
    private readonly free: T[] = [];
    private readonly create: () => T;
    private readonly reset: ((item: T) => void) | undefined;
    private total = 0;

    /**
     * @param create Make a fresh item when the pool is empty.
     * @param reset Clean an item on release, so the next acquire sees no history.
     * @param warm How many items to create up front.
     */
    constructor(create: () => T, reset?: (item: T) => void, warm = 0) {
        this.create = create;
        this.reset = reset;
        for (let index = 0; index < warm; index += 1) {
            this.free.push(create());
            this.total += 1;
        }
    }

    /** Take an item. Creates one when the pool is empty. */
    acquire(): T {
        const item = this.free.pop();
        if (item !== undefined) return item;
        this.total += 1;
        return this.create();
    }

    /** Give an item back. */
    release(item: T): void {
        this.reset?.(item);
        this.free.push(item);
    }

    /** Acquire, run, release, for code that needs an item for one expression. */
    use<R>(fn: (item: T) => R): R {
        const item = this.acquire();
        try {
            return fn(item);
        } finally {
            this.release(item);
        }
    }

    /** Items created so far, in use or free. */
    get size(): number {
        return this.total;
    }

    /** Items sitting idle. */
    get available(): number {
        return this.free.length;
    }
}
