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

/** Pixels of wheel travel that make one notch; a classic wheel sends about 100. */
const WHEEL_NOTCH = 90;
const WHEEL_LINE = 33;
const WHEEL_PAGE = 600;
/** Milliseconds of quiet that end one scroll gesture. */
const WHEEL_GESTURE_GAP = 180;
/** Shortest time between two counted steps, in milliseconds. */
const WHEEL_STEP_INTERVAL = 90;

export class Mouse {
    /** Cursor position in pixels, origin top-left. */
    readonly position = new THREE.Vector2();
    /** Cursor position in NDC, x and y in -1..1, origin centre. */
    readonly ndc = new THREE.Vector2();
    /** Movement since the last frame in pixels, only non-zero while pointer locked. */
    readonly movement = new THREE.Vector2();
    /**
     * Whole wheel notches this frame, positive scrolls down. Smooth wheels and
     * touchpads send dozens of tiny events per notch; they are added up and
     * counted as one step per notch's worth of travel.
     */
    readonly scroll: { delta: number; claimedBy: string | undefined } = { delta: 0, claimedBy: undefined };
    // `claimedBy` names the one thing the wheel is for right now, e.g. `'hotbar'`.
    // Camera controllers leave zoom alone while it is set, so one notch never
    // both changes the held item and moves the camera.

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
    private wheelTravel = 0;
    private lastWheel = 0;
    private lastStep = 0;
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
            // Normalise to pixels: some browsers report lines or pages instead.
            const pixels = event.deltaY * (event.deltaMode === 1 ? WHEEL_LINE : event.deltaMode === 2 ? WHEEL_PAGE : 1);
            const now = performance.now();
            // A pause ends a gesture: leftovers from the last flick must not tip the next one over.
            if (now - this.lastWheel > WHEEL_GESTURE_GAP) this.wheelTravel = 0;
            this.lastWheel = now;
            this.wheelTravel += pixels;
            while (Math.abs(this.wheelTravel) >= WHEEL_NOTCH) {
                const direction = Math.sign(this.wheelTravel);
                this.wheelTravel -= direction * WHEEL_NOTCH;
                // One step per notch, and a short refractory time so a single
                // flick of a free-spinning wheel never skips a whole row.
                if (now - this.lastStep < WHEEL_STEP_INTERVAL) continue;
                this.lastStep = now;
                this.scroll.delta += direction;
            }
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
