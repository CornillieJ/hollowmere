import * as THREE from 'three';

import * as CONSTANTS from '../Constants/Constants';
import { SYSTEM_ORDER } from '../core/systems';

/**
 * "Press E to use" interactions.
 *
 * Register an object with a prompt and a callback, and the registry does the
 * rest: it finds what the player is looking at (or standing next to), shows the
 * prompt, and fires the callback on the interact key.
 */
export type InteractableOptions = {
    /** Text shown in the prompt, e.g. "Open door". */
    prompt?: string;
    /** Key cap shown next to the text. Defaults to 'E'. */
    key?: string;
    /** Maximum distance in meters. Defaults to `GAMEPLAY.INTERACT_RANGE`. */
    range?: number;
    /** Disable after the first successful interaction. */
    once?: boolean;
    /** Start disabled; enable later with `setEnabled(object, true)`. */
    enabled?: boolean;
    /** Called when the player interacts. */
    onInteract: (object: THREE.Object3D, game: Game) => void;
    /**
     * Extra gate, e.g. "only when the player has a key".
     * When it returns false the prompt is replaced by `blockedPrompt`.
     */
    canInteract?: (game: Game) => boolean;
    /** Prompt shown while `canInteract` is false. */
    blockedPrompt?: string;
};

type Entry = {
    object: THREE.Object3D;
    options: InteractableOptions;
    used: boolean;
    enabled: boolean;
};

export type InteractionTarget = {
    object: THREE.Object3D;
    prompt: string;
    key: string;
    distance: number;
    blocked: boolean;
};

export class InteractionRegistry {
    /** Enable or disable the whole registry, e.g. while a menu is open. */
    enabled = true;

    private readonly game: Game;
    private readonly entries = new Map<THREE.Object3D, Entry>();
    private getOrigin: () => THREE.Vector3 = () => new THREE.Vector3();
    private getDirection: () => THREE.Vector3 = () => new THREE.Vector3(0, 0, 1);
    private current: InteractionTarget | undefined;

    constructor(game: Game) {
        this.game = game;
        game.systems.add({
            name: 'interaction',
            order: SYSTEM_ORDER.GAMEPLAY + 1,
            update: () => this.update(),
        });
    }

    /** What the player could interact with right now, `undefined` when nothing is in range. */
    get focused(): InteractionTarget | undefined {
        return this.current;
    }

    /** Register an object. Returns a function that unregisters it. */
    add(object: THREE.Object3D, options: InteractableOptions): () => void {
        this.entries.set(object, { object, options, used: false, enabled: options.enabled !== false });
        return () => this.remove(object);
    }

    /** Unregister an object. */
    remove(object: THREE.Object3D): void {
        this.entries.delete(object);
        if (this.current?.object === object) this.current = undefined;
    }

    has(object: THREE.Object3D): boolean {
        return this.entries.has(object);
    }

    /** Enable or disable a single interactable, e.g. while an NPC is talking. */
    setEnabled(object: THREE.Object3D, enabled: boolean): void {
        const entry = this.entries.get(object);
        if (entry) entry.enabled = enabled;
    }

    /** Everything currently registered. */
    get registered(): THREE.Object3D[] {
        return [...this.entries.keys()];
    }

    /** Forget every registration, e.g. when unloading a level. */
    clear(): void {
        this.entries.clear();
        this.current = undefined;
    }

    /**
     * Use the camera to decide what the player is looking at.
     * This is the right source for first and third person views.
     */
    useCamera(camera: THREE.PerspectiveCamera): void {
        this.getOrigin = () => camera.position;
        this.getDirection = () => camera.getWorldDirection(new THREE.Vector3());
    }

    /**
     * Use an arbitrary origin and direction, e.g. the player's chest and facing.
     * Useful for top-down and board games where there is no aim.
     */
    useSource(getOrigin: () => THREE.Vector3, getDirection: () => THREE.Vector3): void {
        this.getOrigin = getOrigin;
        this.getDirection = getDirection;
    }

    /** Fire the interaction for a specific object, ignoring range and aim. */
    trigger(object: THREE.Object3D): boolean {
        const entry = this.entries.get(object);
        if (!entry || !entry.enabled || (entry.options.once && entry.used)) return false;
        if (entry.options.canInteract && !entry.options.canInteract(this.game)) return false;

        entry.used = true;
        const prompt = entry.options.prompt ?? '';
        this.game.events.emit('interact', { object, prompt });
        entry.options.onInteract(object, this.game);
        if (entry.options.once) this.entries.delete(object);
        return true;
    }

    /** Recompute the focused target and show its prompt. Runs every frame. */
    update(): void {
        if (!this.enabled) {
            this.current = undefined;
            this.game.prompts.hide();
            return;
        }

        this.current = this.findTarget();
        if (!this.current) {
            this.game.prompts.hide();
            return;
        }

        if (this.current.blocked) {
            this.game.prompts.show(this.current.prompt, '');
        } else {
            this.game.prompts.show(this.current.prompt, this.current.key);
            if (this.game.input.wasPressed('interact')) this.trigger(this.current.object);
        }
    }

    /** Look along the ray first, then fall back to the closest object in range. */
    private findTarget(): InteractionTarget | undefined {
        const origin = this.getOrigin();
        const direction = this.getDirection();
        const exclude = this.game.player?.body.body;

        const hit = this.game.physics.raycast(origin, direction, 12, undefined, exclude);
        if (hit?.object) {
            const entry = this.findEntryUpwards(hit.object);
            const range = entry?.options.range ?? CONSTANTS.GAMEPLAY.INTERACT_RANGE;
            if (entry && hit.distance <= range) return this.describe(entry, hit.distance);
        }

        // Nothing under the crosshair: take the closest usable object around the origin.
        let best: { entry: Entry; distance: number } | undefined;
        for (const entry of this.entries.values()) {
            if (!entry.enabled || (entry.options.once && entry.used)) continue;
            const range = entry.options.range ?? CONSTANTS.GAMEPLAY.INTERACT_RANGE;
            const distance = entry.object.getWorldPosition(new THREE.Vector3()).distanceTo(origin);
            if (distance > range) continue;
            if (!best || distance < best.distance) best = { entry, distance };
        }
        return best ? this.describe(best.entry, best.distance) : undefined;
    }

    /** Walk up the parent chain to find a registered object. */
    private findEntryUpwards(object: THREE.Object3D): Entry | undefined {
        let current: THREE.Object3D | null = object;
        while (current) {
            const entry = this.entries.get(current);
            if (entry && entry.enabled && !(entry.options.once && entry.used)) return entry;
            current = current.parent;
        }
        return undefined;
    }

    private describe(entry: Entry, distance: number): InteractionTarget {
        const allowed = entry.options.canInteract ? entry.options.canInteract(this.game) : true;
        return {
            object: entry.object,
            prompt: allowed ? (entry.options.prompt ?? 'Use') : (entry.options.blockedPrompt ?? entry.options.prompt ?? 'Locked'),
            key: entry.options.key ?? 'E',
            distance,
            blocked: !allowed,
        };
    }
}
