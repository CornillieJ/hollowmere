import * as THREE from 'three';

/**
 * Gamepad polling.
 *
 * The Gamepad API is state based, not event based, so `Input` calls `poll()`
 * once per frame. Sticks are dead-zoned and rescaling so a resting stick reads
 * exactly zero. Buttons are exposed as `Pad0`..`Pad16` codes so bindings and
 * `isDown` work the same way as for the keyboard.
 */

/** Standard gamepad button count worth tracking. */
const BUTTON_COUNT = 17;
/** Analog value above which a trigger counts as pressed. */
const TRIGGER_THRESHOLD = 0.5;

export class GamepadInput {
    /** Left stick as a -1..1 vector, y positive is forward. */
    readonly leftStick = new THREE.Vector2();
    /** Right stick as a -1..1 vector. */
    readonly rightStick = new THREE.Vector2();
    readonly triggers = { left: 0, right: 0 };

    /** True while at least one gamepad reports input. */
    connected = false;
    /** Index of the gamepad currently driving the game. */
    index = -1;
    /** Radial dead zone applied to the sticks. */
    deadzone = 0.16;

    private readonly down = new Set<string>();
    private readonly pressed = new Set<string>();
    private readonly released = new Set<string>();
    private readonly previous = new Set<string>();

    /** Read the browser gamepad state and diff it against the previous frame. */
    poll(): void {
        const gamepads = navigator.getGamepads?.() ?? [];
        const gamepad = this.pick(gamepads);
        this.pressed.clear();
        this.released.clear();

        if (!gamepad) {
            this.releaseAll();
            return;
        }

        this.connected = true;
        this.index = gamepad.index;
        this.leftStick.set(this.applyDeadzone(gamepad.axes[0] ?? 0), this.applyDeadzone(-(gamepad.axes[1] ?? 0)));
        this.rightStick.set(this.applyDeadzone(gamepad.axes[2] ?? 0), this.applyDeadzone(-(gamepad.axes[3] ?? 0)));
        this.triggers.left = gamepad.buttons[6]?.value ?? 0;
        this.triggers.right = gamepad.buttons[7]?.value ?? 0;

        this.down.clear();
        for (let index = 0; index < BUTTON_COUNT; index += 1) {
            const button = gamepad.buttons[index];
            if (!button) continue;
            const isActive = button.pressed || button.value > TRIGGER_THRESHOLD;
            if (isActive) this.down.add(`Pad${index}`);
        }

        for (const code of this.down) {
            if (!this.previous.has(code)) this.pressed.add(code);
        }
        for (const code of this.previous) {
            if (!this.down.has(code)) this.released.add(code);
        }
        this.previous.clear();
        for (const code of this.down) this.previous.add(code);
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

    /** Fire rumble on the active gamepad when it supports the actuator API. */
    rumble(strength = 0.5, durationMs = 120): void {
        const gamepad = (navigator.getGamepads?.() ?? [])[this.index];
        const actuator = (gamepad as unknown as { vibrationActuator?: { playEffect?: (type: string, options: object) => Promise<unknown> } } | null)?.vibrationActuator;
        actuator?.playEffect?.('dual-rumble', {
            duration: durationMs,
            weakMagnitude: strength,
            strongMagnitude: strength,
        })?.catch(() => undefined);
    }

    private pick(gamepads: ArrayLike<Gamepad | null>): Gamepad | null {
        if (this.index >= 0) {
            const preferred = gamepads[this.index];
            if (preferred?.connected) return preferred;
        }
        for (const gamepad of Array.from(gamepads)) {
            if (gamepad?.connected) return gamepad;
        }
        return null;
    }

    private releaseAll(): void {
        for (const code of this.previous) this.released.add(code);
        this.previous.clear();
        this.down.clear();
        this.leftStick.set(0, 0);
        this.rightStick.set(0, 0);
        this.triggers.left = 0;
        this.triggers.right = 0;
        this.connected = false;
        this.index = -1;
    }

    /** Rescale a raw axis so the dead zone edge maps to 0 and the end to 1. */
    private applyDeadzone(value: number): number {
        const magnitude = Math.abs(value);
        if (magnitude <= this.deadzone) return 0;
        const scaled = (magnitude - this.deadzone) / (1 - this.deadzone);
        return Math.sign(value) * Math.min(scaled, 1);
    }
}
