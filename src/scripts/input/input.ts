import * as THREE from 'three';

import { Keyboard } from './keyboard';
import { Mouse } from './mouse';
import { GamepadInput } from './gamepad';
import { TouchInput } from './touch';

/**
 * The single input surface the rest of the game talks to.
 *
 * Gameplay code asks questions like `input.isDown('jump')` or reads
 * `input.move`, never the raw keyboard or mouse. Rebinding, gamepad support and
 * the "menus ignore movement" rule all live here.
 */

/** Key codes whose browser default is suppressed so they never scroll the page. */
const PREVENT_DEFAULT = ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'];

/** Standard action names. Bindings accept any string, these are just the defaults. */
export const DEFAULT_BINDINGS: Record<string, string[]> = {
    forward: ['KeyW', 'ArrowUp', 'Pad12'],
    back: ['KeyS', 'ArrowDown', 'Pad13'],
    left: ['KeyA', 'ArrowLeft', 'Pad14'],
    right: ['KeyD', 'ArrowRight', 'Pad15'],
    jump: ['Space', 'Pad0'],
    sprint: ['ShiftLeft', 'ShiftRight', 'Pad10'],
    crouch: ['ControlLeft', 'KeyC', 'Pad1'],
    interact: ['KeyE', 'Pad2'],
    use: ['KeyF', 'Pad3'],
    attack: ['Mouse0', 'Pad7', 'Pad5'],
    aim: ['Mouse2', 'Pad6'],
    reload: ['KeyR', 'Pad4'],
    inventory: ['KeyI', 'Pad8'],
    shop: ['KeyB'],
    journal: ['KeyJ'],
    map: ['KeyM'],
    pause: ['Escape', 'Pad9'],
    confirm: ['Enter', 'Space', 'Pad0'],
    cancel: ['Escape', 'Pad1'],
};

/** A gamepad stick reads -1..1; scale it up to feel like mouse pixels. */
const GAMEPAD_LOOK_SCALE = 14;

export class Input {
    readonly keyboard: Keyboard;
    readonly mouse: Mouse;
    readonly gamepad: GamepadInput;
    /** Touch and drag input. Present on every platform, used by phones. */
    readonly touch: TouchInput;

    /** Movement intent, x right, y forward, length clamped to 1. */
    readonly move = new THREE.Vector2();
    /** Look delta in mouse-pixel equivalents. Multiply by a sensitivity per camera. */
    readonly look = new THREE.Vector2();
    /** Movement intent before clamping, kept for controllers that want raw analog. */
    readonly rawMove = new THREE.Vector2();

    /**
     * Input gates. Every gate must be open for input to count, so the game flow,
     * an open menu and a cutscene can each disable input without stomping on one
     * another. Writing to `enabled` sets the `'default'` gate.
     */
    private readonly gates = new Map<string, boolean>([['default', true]]);
    /** Flip when a control scheme should be disabled, e.g. while a cutscene plays. */
    invertY = false;
    /** Multiplier applied to gamepad stick look input. */
    gamepadLookScale = GAMEPAD_LOOK_SCALE;
    /**
     * Look around by dragging when pointer lock is not active. On by default: it
     * is the only way a touch screen, or a browser that refuses pointer lock, can
     * turn the camera.
     */
    dragLook = true;

    private readonly bindings = new Map<string, string[]>();

    constructor(canvas: HTMLElement) {
        this.keyboard = new Keyboard(PREVENT_DEFAULT);
        this.mouse = new Mouse(canvas, canvas);
        this.gamepad = new GamepadInput();
        this.touch = new TouchInput(canvas);
        this.resetBindings();
    }

    /** True when every gate is open. */
    get enabled(): boolean {
        for (const open of this.gates.values()) {
            if (!open) return false;
        }
        return true;
    }

    /** Close or open the default gate, i.e. "the game is playable right now". */
    set enabled(value: boolean) {
        this.gates.set('default', value);
    }

    /**
     * Set a named gate. Use one per reason input should pause, e.g.
     * `input.setGate('screens', false)` while a menu is up.
     */
    setGate(name: string, open: boolean): void {
        this.gates.set(name, open);
    }

    /** True when a named gate is open. */
    gate(name: string): boolean {
        return this.gates.get(name) ?? true;
    }

    /** Restore every default binding, keeping custom ones untouched. */
    resetBindings(): void {
        this.bindings.clear();
        for (const [action, codes] of Object.entries(DEFAULT_BINDINGS)) {
            this.bindings.set(action, [...codes]);
        }
    }

    /** Replace the key codes bound to an action. */
    bind(action: string, codes: string[]): void {
        this.bindings.set(action, [...codes]);
    }

    /** Add one key code to an action without removing the existing ones. */
    addBinding(action: string, code: string): void {
        const codes = this.bindings.get(action) ?? [];
        if (!codes.includes(code)) codes.push(code);
        this.bindings.set(action, codes);
    }

    /** Remove an action entirely. */
    unbind(action: string): void {
        this.bindings.delete(action);
    }

    /** The codes currently bound to an action, useful for a rebinding UI. */
    codesFor(action: string): string[] {
        return [...(this.bindings.get(action) ?? [])];
    }

    isDown(action: string): boolean {
        if (!this.enabled) return false;
        if (this.touch.isDown(action)) return true;
        return this.codesFor(action).some((code) => this.isCodeDown(code));
    }

    wasPressed(action: string): boolean {
        if (!this.enabled) return false;
        if (this.touch.wasPressed(action)) return true;
        return this.codesFor(action).some((code) => this.isCodePressed(code));
    }

    wasReleased(action: string): boolean {
        if (!this.enabled) return false;
        if (this.touch.wasReleased(action)) return true;
        return this.codesFor(action).some((code) => this.isCodeReleased(code));
    }

    /**
     * Press check that ignores the gates. For the few keys that must work while
     * input is closed: pause and resume, and the key that closes the panel it
     * opened. Gameplay must never use this.
     */
    wasPressedUngated(action: string): boolean {
        if (this.touch.wasPressed(action)) return true;
        return this.codesFor(action).some((code) => this.isCodePressed(code));
    }

    /** Swallow this frame's press of an action, so nothing later in the frame reacts to it too. */
    consume(action: string): void {
        for (const code of this.codesFor(action)) this.keyboard.consume(code);
    }

    /** How many of an action's bindings are held, useful for multi-modifier inputs. */
    downCount(action: string): number {
        if (!this.enabled) return 0;
        return this.codesFor(action).filter((code) => this.isCodeDown(code)).length;
    }

    /** Raw lookup by key code, for the rare binding that is not an action. */
    isCodeDown(code: string): boolean {
        if (!this.enabled) return false;
        return this.keyboard.isDown(code) || this.mouse.isDown(code) || this.gamepad.isDown(code);
    }

    private isCodePressed(code: string): boolean {
        return this.keyboard.wasPressed(code) || this.mouse.wasPressed(code) || this.gamepad.wasPressed(code);
    }

    private isCodeReleased(code: string): boolean {
        return this.keyboard.wasReleased(code) || this.mouse.wasReleased(code) || this.gamepad.wasReleased(code);
    }

    get pointerLocked(): boolean {
        return this.mouse.isLocked;
    }

    get usingGamepad(): boolean {
        return this.gamepad.connected;
    }

    /** Request pointer lock. Must run inside a user gesture, e.g. a click handler. */
    requestPointerLock(): void {
        this.mouse.requestLock();
    }

    exitPointerLock(): void {
        this.mouse.exitLock();
    }

    /** Subscribe to pointer-lock changes. Returns an unsubscribe function. */
    onPointerLock(listener: (locked: boolean) => void): () => void {
        const offLock = this.mouse.on('lock', () => listener(true));
        const offUnlock = this.mouse.on('unlock', () => listener(false));
        return () => {
            offLock();
            offUnlock();
        };
    }

    /**
     * Sample devices and rebuild `move` and `look`.
     * Runs as the first system of every frame, before anything reads input.
     */
    update(): void {
        this.gamepad.poll();

        // Movement comes from the action bindings only, so rebinding a key really moves it.
        const enabled = this.enabled;
        let x = (this.isDown('right') ? 1 : 0) - (this.isDown('left') ? 1 : 0);
        let y = (this.isDown('forward') ? 1 : 0) - (this.isDown('back') ? 1 : 0);

        if (enabled) {
            x += this.gamepad.leftStick.x;
            y += this.gamepad.leftStick.y;
        }

        // The on-screen stick is an ordinary analogue source, like a gamepad.
        if (enabled && this.touch.stick.lengthSq() > 0) {
            x += this.touch.stick.x;
            y += this.touch.stick.y;
        }

        this.rawMove.set(x, y);
        this.move.set(x, y);
        if (this.move.lengthSq() > 1) this.move.normalize();

        this.look.set(0, 0);
        // A closed gate means a menu or dialog is up: nothing may steer the player or the camera.
        if (!enabled) return;

        this.look.set(this.mouse.movement.x, this.mouse.movement.y);
        // A drag on a touch screen, or with the mouse while pointer lock is off.
        if (this.dragLook && !this.mouse.isLocked) {
            this.look.x += this.touch.lookDelta.x;
            this.look.y += this.touch.lookDelta.y;
        }
        if (this.gamepad.rightStick.lengthSq() > 0) {
            this.look.x += this.gamepad.rightStick.x * this.gamepadLookScale;
            this.look.y += this.gamepad.rightStick.y * this.gamepadLookScale;
        }
        if (this.invertY) this.look.y *= -1;
    }

    /** Clear per-frame edges. Runs as the last system of every frame. */
    endFrame(): void {
        this.keyboard.endFrame();
        this.mouse.endFrame();
        this.touch.endFrame();
    }

    /**
     * True while the pointer is over an in-canvas UI widget. Click handlers that
     * act on the world must check this, or a menu button would also build a tower.
     */
    pointerOverUi = false;

    /** True when the player has used a touch screen at least once. */
    get hasTouch(): boolean {
        return this.touch.hasTouch;
    }

    dispose(): void {
        this.keyboard.dispose();
        this.mouse.dispose();
        this.touch.dispose();
    }
}
