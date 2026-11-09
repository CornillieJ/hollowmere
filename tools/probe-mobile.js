/**
 * Mobile probe: run with `node tools/smoke.mjs <url> tools/probe-mobile.js --mobile`.
 *
 * Verifies the touch layer, not just the boot: the controls must be visible on a
 * coarse-pointer device, a joystick drag must move the input stick, and a touch
 * button must press its action.
 */
(() => {
    const game = window.__game;
    if (!game) return { ok: false, reason: 'no game' };

    const controls = document.querySelector('.touch-controls');
    const visible = controls && !controls.classList.contains('is-hidden');

    const stick = document.querySelector('.touch-stick');
    const button = document.querySelector('.touch-button');

    // Drive the joystick with synthetic pointer events and read the stick back.
    let stickMoved = false;
    if (stick) {
        const rect = stick.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const down = new PointerEvent('pointerdown', { pointerId: 99, clientX: cx, clientY: cy, bubbles: true });
        stick.dispatchEvent(down);
        const move = new PointerEvent('pointermove', { pointerId: 99, clientX: cx + 40, clientY: cy - 40, bubbles: true });
        stick.dispatchEvent(move);
        stickMoved = game.input.touch.stick.length() > 0.3;
        stick.dispatchEvent(new PointerEvent('pointerup', { pointerId: 99, clientX: cx + 40, clientY: cy - 40, bubbles: true }));
    }

    // Press the first touch button and check the action edge.
    let buttonPressed = false;
    let pressedAction = null;
    if (button) {
        const action = button.dataset.action;
        const rect = button.getBoundingClientRect();
        button.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 98, clientX: rect.left + 5, clientY: rect.top + 5, bubbles: true }));
        buttonPressed = game.input.touch.isDown(action) || game.input.touch.wasPressed(action);
        pressedAction = action;
        button.dispatchEvent(new PointerEvent('pointerup', { pointerId: 98, clientX: rect.left + 5, clientY: rect.top + 5, bubbles: true }));
    }

    return {
        // A game without a joystick (Tron steers with buttons) skips the stick check.
        ok: Boolean(visible && (stick ? stickMoved : true) && buttonPressed),
        device: `${game.device.kind} touch=${game.device.touch}`,
        quality: game.quality,
        controlsVisible: Boolean(visible),
        buttons: document.querySelectorAll('.touch-button').length,
        stickMoved,
        buttonPressed,
        pressedAction,
    };
})();
