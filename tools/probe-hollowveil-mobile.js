// Hollowveil on a phone: the plates fit, nothing lies on anything else, and the pockets fold away.
//   node tools/smoke.mjs http://localhost:5260/ tools/probe-hollowveil-mobile.js --mobile
(async () => {
    const game = window.__game;
    const world = game.world;
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const failures = [];
    const expect = (condition, message) => condition || failures.push(message);

    world.saves.newGame();
    world.finds.chance = 0;
    // Weather comes when it likes: not during a test.
    world.weather.hold(true);
    await sleep(700);
    const selfBox = () => document.querySelector('.dialogue-self:not(.is-hidden)');
    const read = () => selfBox() && document.body.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ', bubbles: true }));
    for (let presses = 0; presses < 40 && selfBox(); presses += 1) {
        read();
        await sleep(200);
    }
    const reader = setInterval(read, 150);
    await sleep(800);

    // Everything that is on the screen while playing, and whether any two of them touch.
    const WATCH = ['.hv-quest', '.hv-clock', '.hv-place', '.hud-bar', '.compass', '.fullscreen-button', '.hotbar', '.touch-stick', '.touch-buttons', '.prompt'];
    const boxes = [];
    for (const selector of WATCH) {
        const element = document.querySelector(selector);
        if (!element || element.closest('.is-hidden') || getComputedStyle(element).display === 'none') continue;
        const rect = element.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) boxes.push({ selector, rect });
    }
    const overlaps = [];
    for (let i = 0; i < boxes.length; i += 1) {
        for (let j = i + 1; j < boxes.length; j += 1) {
            const a = boxes[i].rect;
            const b = boxes[j].rect;
            if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) overlaps.push(`${boxes[i].selector} x ${boxes[j].selector}`);
        }
    }
    expect(overlaps.length === 0, `nothing overlaps: ${overlaps.join(', ')}`);
    const outside = boxes.filter(({ rect }) => rect.left < 0 || rect.top < 0 || rect.right > innerWidth || rect.bottom > innerHeight).map((box) => box.selector);
    expect(outside.length === 0, `nothing runs off the screen: ${outside.join(', ')}`);
    expect(boxes.some((box) => box.selector === '.hv-quest') && boxes.some((box) => box.selector === '.hv-clock'), 'both plates are shown');

    // The pockets are folded behind the button that shows what is in the hand.
    const held = document.querySelector('.hv-held');
    const pockets = document.querySelector('.hotbar');
    const shown = () => getComputedStyle(pockets).display !== 'none';
    expect(Boolean(held), 'there is a button for what is in the hand');
    expect(!shown(), 'the pockets are folded away on a phone');
    expect(held?.textContent.includes(':item-watering-can:'), `the button shows the watering can, got ${held?.textContent}`);
    held?.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 97, bubbles: true }));
    expect(shown(), 'a tap on it opens the pockets');
    // A tap is a press and then a click.
    const axe = pockets.querySelectorAll('.hotbar-slot')[1];
    axe.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 96, bubbles: true }));
    axe.click();
    await sleep(200);
    expect(!shown() && world.hotbar.selectedId === 'axe', 'choosing something takes it in hand and folds them again');
    expect(held?.textContent.includes(':item-axe:'), 'and the button shows it');
    expect(!document.querySelector('.hv-quest').textContent.includes('J for'), 'no keyboard hints in the task');

    // Every window can be closed without a keyboard.
    world.shop.open();
    await sleep(200);
    const cross = document.querySelector('.inventory:not(.is-hidden) .inventory-close');
    expect(Boolean(cross) && cross.getBoundingClientRect().width >= 40, 'the store has a cross big enough for a thumb');
    cross?.click();
    await sleep(200);
    expect(!world.shop.isOpen, 'and it closes the store');
    world.crate.open();
    await sleep(200);
    const wrap = document.querySelector('.list-panel-wrap:not(.is-hidden)');
    wrap?.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 95, bubbles: true }));
    await sleep(200);
    expect(!world.crate.isOpen, 'a tap beside a window closes it');

    clearInterval(reader);
    return { ok: failures.length === 0, failures, boxes: boxes.length };
})();
