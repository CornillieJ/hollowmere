import * as THREE from 'three';

/**
 * Mouse and pointer-lock tracker.
 *
 * Tracks button edges, the cursor position in pixels and in normalised device
 * coordinates (for ray picking), scroll steps, and pointer-lock movement deltas
 * used for camera look.
 */

/** Mouse buttons exposed as key codes so `Input` can treat them like keys. */
export const MOUSE_CODES = ['Mouse0', 'Mouse1', 'Mouse2', 'Mouse3', 'Mouse4'] as const;

export class Mouse {
    /** Cursor position in pixels, origin top-left. */
    readonly position = new THREE.Vector2();
    /** Cursor position in NDC, x and y in -1..1, origin centre. */
    readonly ndc = new THREE.Vector2();
    /** Movement since the last frame in pixels, only non-zero while pointer locked. */
    readonly movement = new THREE.Vector2();
    /** Wheel steps accumulated this frame, positive scrolls down. */
    readonly scroll = { delta: 0 };

    private readonly down = new Set<string>();
    private readonly pressed = new Set<string>();
    private readonly released = new Set<string>();
    private locked = false;
    private readonly listeners = new Map<string, Set<() => void>>();
    private readonly element: HTMLElement;
    private readonly lockTarget: HTMLElement;
    private readonly onMouseMove: (event: MouseEvent) => void;
    private readonly onMouseDown: (event: MouseEvent) => void;
    private readonly onMouseUp: (event: MouseEvent) => void;
    private readonly onWheel: (event: WheelEvent) => void;
    private readonly onContextMenu: (event: MouseEvent) => void;
    private readonly onLockChange: () => void;
    private readonly onLockError: () => void;

    /**
     * @param element Element used for cursor coordinates and button events.
     * @param lockTarget Element that requests pointer lock, usually the canvas.
     */
    constructor(element: HTMLElement, lockTarget: HTMLElement = element) {
        this.element = element;
        this.lockTarget = lockTarget;

        this.onMouseMove = (event) => {
            const rect = this.element.getBoundingClientRect();
            this.position.set(event.clientX - rect.left, event.clientY - rect.top);
            this.ndc.set((this.position.x / rect.width) * 2 - 1, -(this.position.y / rect.height) * 2 + 1);
            if (this.locked) this.movement.x += event.movementX;
            if (this.locked) this.movement.y += event.movementY;
        };

        this.onMouseDown = (event) => {
            const code = MOUSE_CODES[event.button];
            if (!code) return;
            if (event.button === 2) event.preventDefault();
            this.down.add(code);
            this.pressed.add(code);
        };

        this.onMouseUp = (event) => {
            const code = MOUSE_CODES[event.button];
            if (!code) return;
            this.down.delete(code);
            this.released.add(code);
        };

        this.onWheel = (event) => {
            this.scroll.delta += Math.sign(event.deltaY);
        };

        this.onContextMenu = (event) => {
            // Right button is a game action, never a browser menu.
            if (this.locked) event.preventDefault();
        };

        this.onLockChange = () => {
            this.locked = document.pointerLockElement === this.lockTarget;
            if (!this.locked) this.down.clear();
            this.emit(this.locked ? 'lock' : 'unlock');
        };

        this.onLockError = () => {
            console.warn('[input] pointer lock request was rejected');
            this.emit('lockerror');
        };

        window.addEventListener('mousemove', this.onMouseMove);
        this.element.addEventListener('mousedown', this.onMouseDown);
        window.addEventListener('mouseup', this.onMouseUp);
        this.element.addEventListener('wheel', this.onWheel, { passive: true });
        this.element.addEventListener('contextmenu', this.onContextMenu);
        document.addEventListener('pointerlockchange', this.onLockChange);
        document.addEventListener('pointerlockerror', this.onLockError);
    }

    get isLocked(): boolean {
        return this.locked;
    }

    isDown(code: string): boolean {
        return this.down.has(code);
    }

    wasPressed(code: string): boolean {
        return this.pressed.has(code);
    }

    wasReleased(code: string): boolean {
        return this.released.has(code);
    }

    /**
     * Ask the browser to lock the pointer. Must be called from a user gesture,
     * so wire it to a click handler rather than to game start.
     */
    requestLock(): void {
        if (this.locked) return;
        // iOS Safari has no pointer lock at all, and a touch screen has nothing to lock.
        if (typeof this.lockTarget.requestPointerLock !== 'function' || window.matchMedia('(pointer: coarse)').matches) return;
        try {
            const request = this.lockTarget.requestPointerLock() as unknown;
            // Chrome returns a promise, Firefox returns undefined.
            if (request instanceof Promise) request.catch(() => undefined);
        } catch {
            // Outside a user gesture some browsers throw instead of rejecting.
        }
    }

    exitLock(): void {
        if (document.pointerLockElement === this.lockTarget) document.exitPointerLock();
    }

    /** Subscribe to `'lock'`, `'unlock'` or `'lockerror'`. Returns an unsubscribe function. */
    on(type: 'lock' | 'unlock' | 'lockerror', listener: () => void): () => void {
        let set = this.listeners.get(type);
        if (!set) {
            set = new Set();
            this.listeners.set(type, set);
        }
        set.add(listener);
        return () => set.delete(listener);
    }

    /** Clear per-frame edges and movement. Called by `Input.endFrame`. */
    endFrame(): void {
        this.pressed.clear();
        this.released.clear();
        this.movement.set(0, 0);
        this.scroll.delta = 0;
    }

    private emit(type: string): void {
        for (const listener of [...(this.listeners.get(type) ?? [])]) listener();
    }

    dispose(): void {
        window.removeEventListener('mousemove', this.onMouseMove);
        this.element.removeEventListener('mousedown', this.onMouseDown);
        window.removeEventListener('mouseup', this.onMouseUp);
        this.element.removeEventListener('wheel', this.onWheel);
        this.element.removeEventListener('contextmenu', this.onContextMenu);
        document.removeEventListener('pointerlockchange', this.onLockChange);
        document.removeEventListener('pointerlockerror', this.onLockError);
        this.listeners.clear();
    }
}
