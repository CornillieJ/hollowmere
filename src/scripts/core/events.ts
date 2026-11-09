import type * as THREE from 'three';

/**
 * Typed publish/subscribe bus.
 *
 * Systems talk through events instead of importing each other, which keeps the
 * dependency graph shallow. `GameEvents` declares the events the engine itself
 * emits; add your own under the `custom:` prefix without touching this file.
 */
export type GameEvents = {
    'state:changed': { from: GameStatus; to: GameStatus };
    'player:damage': { amount: number; health: number };
    'player:heal': { amount: number; health: number };
    'player:death': { livesLeft: number };
    'player:respawn': { position: THREE.Vector3 };
    'player:lives': { lives: number };
    'player:jump': { position: THREE.Vector3 };
    'player:land': { position: THREE.Vector3 };
    'pickup:collected': { itemId: string; amount: number; object: THREE.Object3D };
    'inventory:changed': { itemId: string; amount: number; total: number };
    'inventory:full': { itemId: string };
    'objective:added': { id: string; text: string };
    'objective:completed': { id: string; text: string };
    'save:written': { slot: string };
    'save:loaded': { slot: string };
    'save:missing': { slot: string };
    'level:complete': { id: string };
    'delivery:completed': { id: string; reward: number; total: number };
    'hit:dealt': { object: THREE.Object3D; damage: number; point: THREE.Vector3 | undefined };
    'hit:taken': { object: THREE.Object3D; damage: number };
    'entity:killed': { object: THREE.Object3D };
    'interact': { object: THREE.Object3D; prompt: string };
    'projectile:spawned': { id: number; object: THREE.Object3D };
    'projectile:hit': { id: number; object: THREE.Object3D; point: THREE.Vector3 };
    'trigger:entered': { trigger: THREE.Object3D; other: THREE.Object3D };
    'trigger:exited': { trigger: THREE.Object3D; other: THREE.Object3D };
    'audio:ready': { unlocked: boolean };
    'camera:shake': { strength: number };
} & Record<`custom:${string}`, unknown>;

type Handler<P> = (payload: P) => void;

export class EventBus<M extends Record<string, unknown> = GameEvents> {
    private readonly handlers = new Map<keyof M, Set<Handler<never>>>();

    /** Subscribe to an event. Returns an unsubscribe function. */
    on<K extends keyof M>(type: K, handler: Handler<M[K]>): () => void {
        let set = this.handlers.get(type);
        if (!set) {
            set = new Set();
            this.handlers.set(type, set);
        }
        set.add(handler as Handler<never>);
        return () => this.off(type, handler);
    }

    /** Subscribe to the next occurrence of an event only. */
    once<K extends keyof M>(type: K, handler: Handler<M[K]>): () => void {
        const off = this.on(type, (payload) => {
            off();
            handler(payload);
        });
        return off;
    }

    /** Remove one handler, or every handler for the event when none is given. */
    off<K extends keyof M>(type: K, handler?: Handler<M[K]>): void {
        if (!handler) {
            this.handlers.delete(type);
            return;
        }
        this.handlers.get(type)?.delete(handler as Handler<never>);
    }

    /** Emit an event to every current subscriber. A throwing handler never blocks the rest. */
    emit<K extends keyof M>(type: K, payload: M[K]): void {
        const set = this.handlers.get(type);
        if (!set) return;
        for (const handler of [...set]) {
            try {
                (handler as Handler<M[K]>)(payload);
            } catch (error) {
                console.error(`[events] handler for "${String(type)}" threw`, error);
            }
        }
    }

    /** Number of subscribers for an event, mainly useful in tests. */
    listenerCount<K extends keyof M>(type: K): number {
        return this.handlers.get(type)?.size ?? 0;
    }

    /** Drop every subscription. */
    clear(): void {
        this.handlers.clear();
    }
}
