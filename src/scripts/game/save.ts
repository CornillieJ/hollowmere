/**
 * Save and load, with pluggable providers.
 *
 * Systems register a provider once and then forget about persistence: `save`
 * collects everything into one JSON blob and `load` hands each provider its own
 * slice back. Storage defaults to `localStorage`, but the interface is small
 * enough to swap for IndexedDB or a server later.
 */
export type SaveProvider = {
    /** Return anything JSON-serialisable. */
    save: () => unknown;
    /** Receive what `save` returned earlier. Guard against unknown shapes. */
    load: (data: unknown) => void;
};

export type SaveEnvelope = {
    version: number;
    /** Unix milliseconds. */
    timestamp: number;
    slot: string;
    /** Names of the providers that contributed. */
    providers: string[];
    data: Record<string, unknown>;
};

/** Storage backend. `localStorage` by default; satisfy this to use something else. */
export interface SaveBackend {
    get(key: string): string | null;
    set(key: string, value: string): void;
    remove(key: string): void;
    keys(): string[];
}

class LocalStorageBackend implements SaveBackend {
    constructor(private readonly prefix: string) {}

    get(key: string): string | null {
        return window.localStorage.getItem(this.prefix + key);
    }

    set(key: string, value: string): void {
        window.localStorage.setItem(this.prefix + key, value);
    }

    remove(key: string): void {
        window.localStorage.removeItem(this.prefix + key);
    }

    keys(): string[] {
        const found: string[] = [];
        for (let index = 0; index < window.localStorage.length; index += 1) {
            const key = window.localStorage.key(index);
            if (key?.startsWith(this.prefix)) found.push(key.slice(this.prefix.length));
        }
        return found;
    }
}

export type SaveStoreOptions = {
    /** Prefix for storage keys, keeps several projects apart on one origin. */
    namespace?: string;
    /** Schema version, stored with every write. */
    version?: number;
    /** Replace the storage backend, e.g. with an in-memory stub for tests. */
    backend?: SaveBackend;
};

export class SaveStore {
    readonly version: number;

    private readonly backend: SaveBackend;
    private readonly providers = new Map<string, SaveProvider>();

    constructor(options: SaveStoreOptions = {}) {
        this.version = options.version ?? 1;
        this.backend = options.backend ?? new LocalStorageBackend(`${options.namespace ?? 'threejs-game'}:save:`);
    }

    /**
     * Register a provider under a key.
     * Returns a function that unregisters it again.
     */
    register(key: string, provider: SaveProvider): () => void {
        this.providers.set(key, provider);
        return () => this.providers.delete(key);
    }

    /** True when a slot has data. */
    exists(slot = 'default'): boolean {
        return this.backend.get(slot) !== null;
    }

    /** Slots with data, useful for a "continue" button. */
    slots(): string[] {
        return this.backend.keys();
    }

    /** Timestamp of a slot in milliseconds, `undefined` when empty. */
    timestamp(slot = 'default'): number | undefined {
        return this.readEnvelope(slot)?.timestamp;
    }

    /**
     * Collect every provider and write the slot.
     * @returns True on success, false when storage refused the write.
     */
    save(slot = 'default'): boolean {
        const data: Record<string, unknown> = {};
        for (const [key, provider] of this.providers) {
            try {
                data[key] = provider.save();
            } catch (error) {
                console.error(`[save] provider "${key}" threw while saving`, error);
            }
        }
        const envelope: SaveEnvelope = {
            version: this.version,
            timestamp: Date.now(),
            slot,
            providers: [...this.providers.keys()],
            data,
        };
        try {
            this.backend.set(slot, JSON.stringify(envelope));
        } catch (error) {
            console.error('[save] could not write the save file', error);
            return false;
        }
        return true;
    }

    /**
     * Read a slot and hand each provider its slice.
     * @returns True when a save was found and applied.
     */
    load(slot = 'default'): boolean {
        const envelope = this.readEnvelope(slot);
        if (!envelope) return false;
        for (const [key, provider] of this.providers) {
            try {
                provider.load(envelope.data[key]);
            } catch (error) {
                console.error(`[save] provider "${key}" threw while loading`, error);
            }
        }
        return true;
    }

    /** Delete a slot. */
    remove(slot = 'default'): void {
        this.backend.remove(slot);
    }

    /** Delete every slot in this namespace. */
    clear(): void {
        for (const slot of this.slots()) this.remove(slot);
    }

    /** Export a slot as a string, e.g. to hand it to the player. */
    export(slot = 'default'): string | undefined {
        return this.backend.get(slot) ?? undefined;
    }

    /** Import a string produced by `export`. */
    import(slot: string, serialised: string): boolean {
        try {
            const parsed = JSON.parse(serialised) as SaveEnvelope;
            if (typeof parsed !== 'object' || parsed === null) return false;
            this.backend.set(slot, serialised);
            return true;
        } catch {
            return false;
        }
    }

    private readEnvelope(slot: string): SaveEnvelope | undefined {
        const raw = this.backend.get(slot);
        if (!raw) return undefined;
        try {
            const parsed = JSON.parse(raw) as SaveEnvelope;
            if (parsed.version !== undefined && parsed.version > this.version) {
                console.warn(`[save] slot "${slot}" was written by a newer version (${parsed.version} > ${this.version})`);
            }
            return parsed;
        } catch (error) {
            console.error(`[save] slot "${slot}" is not valid JSON`, error);
            return undefined;
        }
    }
}
