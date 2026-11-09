/**
 * Tap detection: a press and release that did not turn into a drag.
 *
 * Camera controls own the drag, a game owns the tap. Firing on release instead
 * of on press is what lets both live on one canvas: the press is ambiguous until
 * the pointer has either moved or lifted.
 */
export type TapOptions = {
    /** Pointer travel in pixels that still counts as a tap. Touch is given extra. */
    slop?: number;
    /** Longest press in milliseconds that still counts as a tap. */
    maxDuration?: number;
    /** Ignore a press that starts here, e.g. when it landed on UI. */
    ignore?: (event: PointerEvent) => boolean;
};

export type TapEvent = { clientX: number; clientY: number; pointerType: string; event: PointerEvent };

const DEFAULT_SLOP = 6;
const TOUCH_SLOP = 14;
const DEFAULT_DURATION = 600;

/**
 * Listen for taps on an element. Returns an unsubscribe function.
 * Only the primary button counts, and a second finger cancels the tap so a pinch
 * never selects anything.
 */
export function onTap(element: HTMLElement, handler: (tap: TapEvent) => void, options: TapOptions = {}): () => void {
    const maxDuration = options.maxDuration ?? DEFAULT_DURATION;
    let press: { id: number; x: number; y: number; time: number; slop: number } | undefined;

    const down = (event: PointerEvent): void => {
        if (!event.isPrimary) {
            press = undefined;
            return;
        }
        if (event.button !== 0 || options.ignore?.(event)) return;
        const slop = options.slop ?? (event.pointerType === 'touch' ? TOUCH_SLOP : DEFAULT_SLOP);
        press = { id: event.pointerId, x: event.clientX, y: event.clientY, time: performance.now(), slop };
    };

    const move = (event: PointerEvent): void => {
        if (!press || event.pointerId !== press.id) return;
        if (Math.hypot(event.clientX - press.x, event.clientY - press.y) > press.slop) press = undefined;
    };

    const up = (event: PointerEvent): void => {
        const current = press;
        press = undefined;
        if (!current || event.pointerId !== current.id) return;
        if (performance.now() - current.time > maxDuration) return;
        if (Math.hypot(event.clientX - current.x, event.clientY - current.y) > current.slop) return;
        handler({ clientX: event.clientX, clientY: event.clientY, pointerType: event.pointerType, event });
    };

    const cancel = (): void => {
        press = undefined;
    };

    element.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('blur', cancel);
    return () => {
        element.removeEventListener('pointerdown', down);
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', cancel);
        window.removeEventListener('blur', cancel);
    };
}
