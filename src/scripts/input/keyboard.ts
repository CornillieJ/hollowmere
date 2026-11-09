/**
 * Keyboard state tracker.
 *
 * Records which physical keys (`KeyboardEvent.code`) are held, pressed this
 * frame and released this frame. `Input` builds its action layer on top.
 */
export class Keyboard {
    private readonly down = new Set<string>();
    private readonly pressed = new Set<string>();
    private readonly released = new Set<string>();
    private readonly changeListeners = new Set<(code: string, isDown: boolean) => void>();
    private readonly preventDefault: Set<string>;
    private readonly target: Window;
    private readonly onKeyDown: (event: KeyboardEvent) => void;
    private readonly onKeyUp: (event: KeyboardEvent) => void;
    private readonly onBlur: () => void;

    /**
     * @param preventDefaultCodes Key codes whose browser default is suppressed
     *        while the game has focus, e.g. `Space` to stop page scrolling.
     * @param target Window to listen on, replaceable for tests.
     */
    constructor(preventDefaultCodes: string[] = [], target: Window = window) {
        this.preventDefault = new Set(preventDefaultCodes);
        this.target = target;

        this.onKeyDown = (event) => {
            if (this.shouldIgnore(event)) return;
            if (this.preventDefault.has(event.code)) event.preventDefault();
            if (event.repeat) return;
            this.down.add(event.code);
            this.pressed.add(event.code);
            this.notify(event.code, true);
        };

        this.onKeyUp = (event) => {
            if (this.shouldIgnore(event)) return;
            this.down.delete(event.code);
            this.released.add(event.code);
            this.notify(event.code, false);
        };

        // Losing focus mid-key would otherwise leave keys stuck down.
        this.onBlur = () => this.down.clear();

        this.target.addEventListener('keydown', this.onKeyDown);
        this.target.addEventListener('keyup', this.onKeyUp);
        this.target.addEventListener('blur', this.onBlur);
    }

    /** Only track keys that belong to the document body, not to form fields. */
    private shouldIgnore(event: KeyboardEvent): boolean {
        const element = event.target as HTMLElement | null;
        if (!element) return false;
        const tag = element.tagName;
        return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || element.isContentEditable;
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

    /** Every currently held key code, useful for debugging and rebinding screens. */
    get keys(): string[] {
        return [...this.down];
    }

    /** Subscribe to any key going down or up. Returns an unsubscribe function. */
    onChange(listener: (code: string, isDown: boolean) => void): () => void {
        this.changeListeners.add(listener);
        return () => this.changeListeners.delete(listener);
    }

    /**
     * Swallow this frame's press of a key, so later readers do not see it. A
     * dialog that closes on Escape calls this, or the same press would pause.
     */
    consume(code: string): void {
        this.pressed.delete(code);
    }

    /** Clear the per-frame press and release edges. Called by `Input.endFrame`. */
    endFrame(): void {
        this.pressed.clear();
        this.released.clear();
    }

    private notify(code: string, isDown: boolean): void {
        for (const listener of [...this.changeListeners]) listener(code, isDown);
    }

    dispose(): void {
        this.target.removeEventListener('keydown', this.onKeyDown);
        this.target.removeEventListener('keyup', this.onKeyUp);
        this.target.removeEventListener('blur', this.onBlur);
        this.down.clear();
        this.changeListeners.clear();
    }
}
