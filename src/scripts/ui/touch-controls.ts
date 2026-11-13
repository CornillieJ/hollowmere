import { div } from '../helpers/dom';
import type { TouchInput } from '../input/touch';

/**
 * On-screen controls for phones and tablets.
 *
 * A joystick on the left, action buttons on the right, and the rest of the
 * screen turns the camera by dragging. It writes into `input.touch`, so the
 * control schemes and the games never learn that a finger is involved.
 *
 * The controls appear when a touch is detected, or immediately when `always` is
 * set. Nothing here is drawn with WebGL: it is plain DOM, so it costs no draw
 * calls and scales with the device pixel ratio.
 */
export type TouchButton = {
    /** Input action the button presses, e.g. 'jump' or 'attack'. */
    action: string;
    /** Text or emoji on the button. */
    label: string;
    /** Bigger button, e.g. the primary action. */
    primary?: boolean;
    /** Hold to repeat, i.e. the action stays down while the finger is on it. */
    hold?: boolean;
};

export type TouchControlsOptions = {
    /** Buttons, in order. Defaults to jump, sprint, interact and attack. */
    buttons?: TouchButton[];
    /** Show the joystick. Defaults to true. */
    joystick?: boolean;
    /** Show the controls even before a touch is seen, e.g. in a mobile-only build. */
    always?: boolean;
    /** Radius of the joystick in CSS pixels. Defaults to 62. */
    joystickRadius?: number;
    /** Extra DOM buttons, e.g. "open bag", as `{ label, onClick }`. */
    actions?: Array<{ label: string; onClick: () => void; primary?: boolean }>;
    /** Where to mount. Defaults to the HUD screen. */
    screen?: string;
};

const DEFAULT_BUTTONS: TouchButton[] = [
    { action: 'jump', label: ':jump:', primary: true, hold: true },
    { action: 'sprint', label: ':run:', hold: true },
    { action: 'interact', label: ':hand:' },
];

export class TouchControls {
    readonly root: HTMLElement;

    private readonly touch: TouchInput;
    private readonly joystick: HTMLElement | undefined;
    private readonly knob: HTMLElement | undefined;
    private readonly radius: number;
    private readonly cleanup: Array<() => void> = [];
    private readonly buttonElements: HTMLElement[] = [];
    private stickPointer: number | undefined;
    private readonly origin = { x: 0, y: 0 };

    constructor(parent: HTMLElement, touch: TouchInput, options: TouchControlsOptions = {}) {
        this.touch = touch;
        this.radius = options.joystickRadius ?? 62;

        this.root = div('touch-controls is-hidden', undefined, parent);

        if (options.joystick !== false) {
            this.joystick = div('touch-stick', undefined, this.root);
            this.knob = div('touch-knob', undefined, this.joystick);
            this.bindJoystick();
        }

        const right = div('touch-buttons', undefined, this.root);
        for (const button of options.buttons ?? DEFAULT_BUTTONS) this.addButton(right, button);
        for (const action of options.actions ?? []) this.addAction(right, action);

        // A tap anywhere is also a click, which is how pointer lock and audio
        // unlock get their user gesture on a phone.
        this.cleanup.push(
            touch.onButton((action) => {
                for (const element of this.buttonElements) {
                    if (element.dataset.action === action) {
                        element.classList.add('is-down');
                        window.setTimeout(() => element.classList.remove('is-down'), 140);
                    }
                }
            }),
        );

        if (options.always) this.show();
        else this.watchForTouch();
    }

    /** True while the controls are on screen. */
    get isVisible(): boolean {
        return !this.root.classList.contains('is-hidden');
    }

    /** Every button element, for a test or for theming. */
    get buttons(): HTMLElement[] {
        return [...this.buttonElements];
    }

    show(): void {
        this.root.classList.remove('is-hidden');
    }

    hide(): void {
        this.root.classList.add('is-hidden');
    }

    /** Add a button after construction. */
    addButton(parent: HTMLElement = this.root.querySelector<HTMLElement>('.touch-buttons') ?? this.root, button: TouchButton): HTMLElement {
        const element = div(`touch-button${button.primary ? ' is-primary' : ''}`, button.label, parent);
        element.dataset.action = button.action;
        this.buttonElements.push(element);

        const press = (event: PointerEvent): void => {
            event.preventDefault();
            event.stopPropagation();
            capturePointer(element, event.pointerId);
            this.touch.setButton(button.action, true);
            element.classList.add('is-down');
        };
        const release = (event: PointerEvent): void => {
            event.preventDefault();
            event.stopPropagation();
            this.touch.setButton(button.action, false);
            element.classList.remove('is-down');
        };

        element.addEventListener('pointerdown', press);
        element.addEventListener('pointerup', release);
        element.addEventListener('pointercancel', release);
        // Buttons sit above the canvas, so a drag that starts here is not a look.
        const rect = element.getBoundingClientRect();
        this.cleanup.push(this.touch.addZone({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, radius: Math.max(rect.width, rect.height) }));
        return element;
    }

    /** Add a button that runs a callback instead of pressing an action. */
    addAction(parent: HTMLElement, action: { label: string; onClick: () => void; primary?: boolean }): HTMLElement {
        const element = div(`touch-button${action.primary ? ' is-primary' : ''}`, action.label, parent);
        const handler = (event: PointerEvent): void => {
            event.preventDefault();
            event.stopPropagation();
            action.onClick();
        };
        element.addEventListener('pointerdown', handler);
        this.cleanup.push(this.touch.addZone({ x: element.getBoundingClientRect().left + 30, y: element.getBoundingClientRect().top + 30, radius: 60 }));
        return element;
    }

    dispose(): void {
        for (const off of this.cleanup) off();
        this.cleanup.length = 0;
        this.root.remove();
    }

    //#region Internals

    private watchForTouch(): void {
        const onFirstTouch = (event: PointerEvent): void => {
            if (event.pointerType === 'mouse') return;
            this.show();
            window.removeEventListener('pointerdown', onFirstTouch);
        };
        window.addEventListener('pointerdown', onFirstTouch);
        this.cleanup.push(() => window.removeEventListener('pointerdown', onFirstTouch));

        // A coarse pointer means a phone or a tablet even before any touch.
        if (typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches) this.show();
    }

    private bindJoystick(): void {
        const element = this.joystick;
        if (!element) return;

        const start = (event: PointerEvent): void => {
            event.preventDefault();
            event.stopPropagation();
            this.stickPointer = event.pointerId;
            capturePointer(element, event.pointerId);
            const rect = element.getBoundingClientRect();
            this.origin.x = rect.left + rect.width / 2;
            this.origin.y = rect.top + rect.height / 2;
            element.classList.add('is-active');
            move(event);
        };

        const move = (event: PointerEvent): void => {
            if (this.stickPointer !== event.pointerId) return;
            const dx = (event.clientX - this.origin.x) / this.radius;
            const dy = (event.clientY - this.origin.y) / this.radius;
            const length = Math.hypot(dx, dy);
            const scale = length > 1 ? 1 / length : 1;
            // Screen y is down, forward is up.
            this.touch.setStick(dx * scale, -dy * scale);
            if (this.knob) this.knob.style.transform = `translate(-50%, -50%) translate(${dx * scale * this.radius * 0.6}px, ${dy * scale * this.radius * 0.6}px)`;
        };

        const end = (event: PointerEvent): void => {
            if (this.stickPointer !== event.pointerId) return;
            this.stickPointer = undefined;
            this.touch.setStick(0, 0);
            element.classList.remove('is-active');
            if (this.knob) this.knob.style.transform = 'translate(-50%, -50%)';
        };

        element.addEventListener('pointerdown', start);
        element.addEventListener('pointermove', move);
        element.addEventListener('pointerup', end);
        element.addEventListener('pointercancel', end);

        const rect = element.getBoundingClientRect();
        this.cleanup.push(this.touch.addZone({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, radius: this.radius * 1.6 }));
    }

    //#endregion Internals
}

/**
 * Pointer capture keeps the button receiving moves even if the finger slides off
 * it. It throws for a pointer the browser no longer knows about, which happens
 * with synthetic events, so it is best effort.
 */
function capturePointer(element: HTMLElement, pointerId: number): void {
    try {
        element.setPointerCapture?.(pointerId);
    } catch {
        // No such pointer: carry on without capture.
    }
}

/** Screen size at which a device counts as small enough for touch controls. */
export const TOUCH_BREAKPOINT = 900;

/** True when this looks like a touch device, so a game can default its options. */
export function isTouchDevice(): boolean {
    if (typeof window === 'undefined') return false;
    if (typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches) return true;
    return 'ontouchstart' in window && Math.min(window.innerWidth, window.innerHeight) < TOUCH_BREAKPOINT;
}

