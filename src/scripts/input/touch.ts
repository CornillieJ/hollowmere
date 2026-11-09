import * as THREE from 'three';

/**
 * Touch and drag input.
 *
 * Pointer events cover touch, pen and mouse, so this is one implementation of
 * "the player is dragging on the screen". It feeds three things:
 *
 * - `lookDelta`: a drag that is not on a control moves the camera.
 * - `move`: a virtual stick, written by the on-screen joystick.
 * - `buttons`: virtual actions, written by the on-screen buttons.
 *
 * `Input` merges all three with the keyboard, mouse and gamepad, so a control
 * scheme never has to know whether the player is on a phone.
 */

/** An area on screen that should not start a look drag, in CSS pixels. */
export type ControlZone = { x: number; y: number; radius: number };

export class TouchInput {
    /** Drag movement since the last frame, in pixels. */
    readonly lookDelta = new THREE.Vector2();
    /** Virtual stick, x right and y forward, each in -1..1. */
    readonly stick = new THREE.Vector2();

    /** Pointer id of the look drag, `undefined` when not dragging. */
    lookPointer: number | undefined;

    /** Zones that belong to on-screen controls. A drag on one is not a look. */
    readonly zones: ControlZone[] = [];

    private readonly tracked = new Map<number, { x: number; y: number }>();
    private readonly buttons = new Set<string>();
    private readonly pressed = new Set<string>();
    private readonly released = new Set<string>();
    private readonly listeners = new Set<(type: string) => void>();
    private readonly element: HTMLElement;
    private enabledFlag = true;

    /** Sensitivity of a touch drag relative to a mouse. */
    dragSensitivity = 1.6;
    /** How far a finger must move before it counts as a drag rather than a tap. */
    tapSlop = 12;

    private readonly onPointerDown: (event: PointerEvent) => void;
    private readonly onPointerMove: (event: PointerEvent) => void;
    private readonly onPointerUp: (event: PointerEvent) => void;
    private readonly onContextMenu: (event: Event) => void;

    constructor(element: HTMLElement) {
        this.element = element;

        this.onPointerDown = (event) => {
            if (event.pointerType === 'mouse' && event.button !== 0) return;
            if (event.pointerType !== 'mouse') this.touchSeen = true;
            this.tracked.set(event.pointerId, { x: event.clientX, y: event.clientY });

            // A pointer that starts inside a control zone belongs to that control.
            if (this.touchSeen && this.inControlZone(event.clientX, event.clientY)) return;
            if (this.lookPointer === undefined) this.lookPointer = event.pointerId;
        };

        this.onPointerMove = (event) => {
            const previous = this.tracked.get(event.pointerId);
            if (!previous) return;
            const dx = event.clientX - previous.x;
            const dy = event.clientY - previous.y;
            previous.x = event.clientX;
            previous.y = event.clientY;

            if (this.lookPointer === undefined || event.pointerId !== this.lookPointer) return;
            this.lookDelta.x += dx * this.dragSensitivity;
            this.lookDelta.y += dy * this.dragSensitivity;
        };

        this.onPointerUp = (event) => {
            this.tracked.delete(event.pointerId);
            if (event.pointerId === this.lookPointer) this.lookPointer = undefined;
        };

        // Stop the browser's own gestures fighting the game.
        this.onContextMenu = (event) => event.preventDefault();

        element.addEventListener('pointerdown', this.onPointerDown);
        window.addEventListener('pointermove', this.onPointerMove, { passive: true });
        window.addEventListener('pointerup', this.onPointerUp);
        window.addEventListener('pointercancel', this.onPointerUp);
        element.addEventListener('contextmenu', this.onContextMenu);
    }

    /** True after the first non-mouse pointer, so a game can reveal its controls. */
    private touchSeen = false;

    get hasTouch(): boolean {
        return this.touchSeen;
    }

    get isDragging(): boolean {
        return this.lookPointer !== undefined;
    }

    get enabled(): boolean {
        return this.enabledFlag;
    }

    set enabled(value: boolean) {
        this.enabledFlag = value;
        if (!value) {
            this.lookDelta.set(0, 0);
            this.stick.set(0, 0);
            this.buttons.clear();
        }
    }

    /** True when the point is inside a registered control zone. */
    inControlZone(x: number, y: number): boolean {
        return this.zones.some((zone) => Math.hypot(x - zone.x, y - zone.y) <= zone.radius);
    }

    /** Register a zone. Returns a function that unregisters it. */
    addZone(zone: ControlZone): () => void {
        this.zones.push(zone);
        return () => {
            const index = this.zones.indexOf(zone);
            if (index >= 0) this.zones.splice(index, 1);
        };
    }

    /** Set the virtual stick, called by the joystick UI. */
    setStick(x: number, y: number): void {
        this.stick.set(THREE.MathUtils.clamp(x, -1, 1), THREE.MathUtils.clamp(y, -1, 1));
    }

    /** Press or release a virtual action, called by the button UI. */
    setButton(action: string, down: boolean): void {
        if (!this.enabledFlag) return;
        const wasDown = this.buttons.has(action);
        if (down && !wasDown) {
            this.buttons.add(action);
            this.pressed.add(action);
            this.notify(action);
        } else if (!down && wasDown) {
            this.buttons.delete(action);
            this.released.add(action);
        }
    }

    isDown(action: string): boolean {
        return this.enabledFlag && this.buttons.has(action);
    }

    wasPressed(action: string): boolean {
        return this.enabledFlag && this.pressed.has(action);
    }

    wasReleased(action: string): boolean {
        return this.enabledFlag && this.released.has(action);
    }

    /** Every action a virtual button is holding. */
    get heldActions(): string[] {
        return [...this.buttons];
    }

    /** Subscribe to button presses, for a UI that highlights on press. */
    onButton(listener: (action: string) => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    /** Clear the per-frame edges. Called by `Input.endFrame`. */
    endFrame(): void {
        this.lookDelta.set(0, 0);
        this.pressed.clear();
        this.released.clear();
    }

    /** True while the player is holding a finger on the screen. */
    get pointerCount(): number {
        return this.tracked.size;
    }

    private notify(action: string): void {
        for (const listener of [...this.listeners]) listener(action);
    }

    dispose(): void {
        this.element.removeEventListener('pointerdown', this.onPointerDown);
        window.removeEventListener('pointermove', this.onPointerMove);
        window.removeEventListener('pointerup', this.onPointerUp);
        window.removeEventListener('pointercancel', this.onPointerUp);
        this.element.removeEventListener('contextmenu', this.onContextMenu);
        this.tracked.clear();
        this.listeners.clear();
    }
}
