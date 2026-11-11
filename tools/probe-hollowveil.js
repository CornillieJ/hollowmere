// Hollowveil probe: plays the first day with real key presses, then the rest of the loop.
//   node tools/smoke.mjs http://localhost:5260/ tools/probe-hollowveil.js
(async () => {
    const game = window.__game;
    const world = game.world;
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const failures = [];
    const expect = (condition, message) => condition || failures.push(message);
    // The farmer's own lines hold the game; nothing is pressed until they are read.
    let started = false;
    const quiet = async () => {
        for (let waited = 0; waited < 8000 && started && world.narration.speaking; waited += 50) await sleep(50);
    };
    const press = async (code, hold = 60) => {
        await quiet();
        document.body.dispatchEvent(new KeyboardEvent('keydown', { code, key: code.replace('Key', '').toLowerCase(), bubbles: true }));
        await sleep(hold);
        document.body.dispatchEvent(new KeyboardEvent('keyup', { code, key: code.replace('Key', '').toLowerCase(), bubbles: true }));
        await sleep(120);
    };
    const go = async (x, z) => {
        await quiet();
        game.player.body.teleport({ x, y: world.terrain.heightAt(x, z) + 0.2, z });
        // Arriving somewhere may set the farmer talking; wait until that has been read.
        await sleep(750);
        await quiet();
        await sleep(400);
    };
    const hold = (id) => world.hotbar.select(world.pockets.inventory.slots.findIndex((slot) => slot.itemId === id));
    const have = (id) => world.pockets.count(id) + world.bag.count(id);
    const step = () => world.story.story.current?.id;
    const until = async (condition, timeout = 3000) => {
        for (let waited = 0; waited < timeout && !condition(); waited += 50) await sleep(50);
    };
    const log = {};

    // 0. A new game from the title screen.
    expect(game.state.current === 'menu', `starts on the title screen, got ${game.state.current}`);
    expect(!document.querySelector('.menu:not(.is-hidden) .menu-dynamic:not(.is-hidden)'), 'no Continue button without a save');
    world.saves.newGame();
    await sleep(700);
    expect(game.state.current === 'playing', `playing, got ${game.state.current}`);
    // The opening is spoken in a box that holds the game until it is read.
    const selfBox = () => document.querySelector('.dialogue-self:not(.is-hidden)');
    expect(Boolean(selfBox()) && selfBox().textContent.includes('You'), 'the farmer speaks the opening in a dialogue box');
    expect(game.time.effectiveScale === 0 && game.screens.blocksInput, 'the game waits while the opening is read');
    log.introPresses = 0;
    for (; log.introPresses < 30 && selfBox(); log.introPresses += 1) {
        await press('Space');
        await sleep(150);
    }
    expect(!selfBox() && log.introPresses >= 5, `the opening closes once every line is read, after ${log.introPresses} presses`);
    expect(game.time.effectiveScale > 0, 'and the game runs again');
    expect(step() === 'wake', `the story starts at waking, got ${step()}`);
    // From here on the probe reads the farmer's own lines as soon as they come up.
    started = true;
    expect(world.bag.inventory.capacity === 3, `the backpack starts with 3 slots, got ${world.bag.inventory.capacity}`);
    // The rest of the run carries a lot at once.
    world.upgrades.upgrades.set('bag', 3);
    expect(world.bag.inventory.capacity === 16, 'a bigger backpack has more slots');
    const reader = setInterval(() => {
        if (selfBox()) document.body.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ', bubbles: true }));
    }, 120);

    // 1. Plant 3, water 3.
    const plots = world.farm.plots.filter((plot) => plot.active);
    expect(plots.length === 12, `the first field has 12 plots, got ${plots.length}`);
    for (const plot of plots.slice(0, 3)) {
        await go(plot.position.x, plot.position.z + 0.2);
        hold('turnip-seed');
        await press('KeyE');
        hold('watering-can');
        await press('KeyE');
    }
    expect(world.farm.plantedCount === 3, `planted 3, got ${world.farm.plantedCount}`);
    expect(plots[0].watered, 'watered the plot');
    expect(world.can.left === 2, `3 waterings out of a can of 5 leave 2, got ${world.can.left}`);
    world.can.left = 0;
    await go(-52, 51.6);
    await press('KeyE');
    await until(() => world.can.left === 5);
    expect(world.can.left === 5, `the well fills the can, got ${world.can.left}`);
    await sleep(300);
    expect(step() === 'chop', `the story moved on to chopping, got ${step()}`);

    // 2. Chop a tree at the yard's edge.
    const tree = world.nodes.nodes[0];
    await go(tree.object.position.x + 1.2, tree.object.position.z);
    hold('watering-can');
    await press('KeyE');
    expect(tree.hitsLeft === 3 && world.hotbar.selectedId === 'axe', 'the axe comes to hand by itself at a tree');
    await press('KeyE');
    await press('KeyE');
    await press('KeyE');
    log.wood = have('wood');
    expect(tree.depleted, 'four swings fell the tree');
    expect(log.wood >= 2, `the tree gave wood, got ${log.wood}`);
    expect(!tree.object.visible, 'the felled tree is gone, a stump is left');

    // 3. Fast forward the crops, pick them, and get seeds back.
    world.farm.fromJSON(world.farm.plots.map((plot, index) => (index < 3 ? { crop: 'turnip', stage: 2, elapsed: 0, watered: true, ripe: true } : null)));
    const seedsBefore = have('turnip-seed');
    for (const plot of plots.slice(0, 3)) {
        await go(plot.position.x, plot.position.z + 0.2);
        await press('KeyE');
    }
    log.turnips = have('turnip');
    log.seedsBack = have('turnip-seed') - seedsBefore;
    expect(log.turnips === 3, `picked 3 turnips, got ${log.turnips}`);
    expect(log.seedsBack >= 3 && log.seedsBack <= 6, `each harvest gives 1 or 2 seeds, got ${log.seedsBack}`);
    await sleep(300);
    expect(step() === 'cook', `the story moved on to cooking, got ${step()}`);

    // 3b. Holding E works down a row, with whatever is in hand: the seeds are found by themselves.
    hold('axe');
    const plantedBefore = world.farm.plantedCount;
    await quiet();
    document.body.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE', key: 'e', bubbles: true }));
    for (const plot of plots.slice(4, 7)) {
        game.player.body.teleport({ x: plot.position.x, y: 0.2, z: plot.position.z + 0.2 });
        await sleep(450);
    }
    document.body.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyE', key: 'e', bubbles: true }));
    log.rowPlanted = world.farm.plantedCount - plantedBefore;
    expect(log.rowPlanted === 3, `holding E plants along the row, planted ${log.rowPlanted}`);
    world.farm.fromJSON(world.farm.plots.map(() => null));

    // 4. Cook soup at the fire.
    const hearth = world.cookpot;
    await go(-59, 50.2);
    await press('KeyE');
    expect(hearth.panel.isOpen, 'the cooking panel opened');
    const cook = [...document.querySelectorAll('.list-panel-row')].find((row) => row.textContent.includes('Turnip soup'));
    expect(Boolean(cook), 'turnip soup is listed');
    expect([...document.querySelectorAll('.list-panel-row.is-dim')].some((row) => row.textContent.includes('Omelette')), 'tier 2 recipes show as locked');
    cook?.querySelector('.list-panel-action')?.click();
    await sleep(200);
    expect(hearth.station.busy, 'the soup is on the fire');
    expect(have('turnip') === 1 && have('wood') === log.wood - 1, 'cooking took 2 turnips and 1 wood');
    hearth.station.update(30);
    await press('Escape');
    expect(!hearth.panel.isOpen && game.state.current === 'playing', 'Escape closes the panel without pausing');
    await sleep(200);
    await press('KeyE');
    await until(() => have('turnip-soup') === 1);
    log.soup = have('turnip-soup');
    expect(log.soup === 1, `took the soup off the fire, got ${log.soup}`);
    await sleep(300);
    expect(step() === 'ride', `the story moved on to the ride, got ${step()}`);

    // 5. The bike: get on, ride, get off.
    const bikeAt = world.bike.object.position.clone();
    await go(bikeAt.x + 0.8, bikeAt.z);
    await press('KeyE');
    expect(world.bike.mounted, 'got on the bike');
    const start = game.player.position.clone();
    // Long enough that a slow frame or two under a busy machine cannot fail it.
    await press('KeyW', 2600);
    log.rode = +game.player.position.distanceTo(start).toFixed(1);
    expect(log.rode > 4, `the bike moves, rode ${log.rode} m`);
    await sleep(800);
    await press('KeyE');
    expect(!world.bike.mounted, 'got off the bike');

    // 6. The village is up on its rise; the shopkeeper talks, and has things to ask about.
    // Midday, so everyone is out in the square and nobody is mid-walk next to someone else.
    world.dayCycle.setHour(12);
    world.villagers.snapToSchedule();
    await go(47.2, -34.8);
    log.villageHeight = +game.player.position.y.toFixed(1);
    expect(Math.abs(log.villageHeight - 4) < 0.3, `the village stands 4 m up, player at ${log.villageHeight}`);
    await sleep(300);
    expect(step() === 'meet', `the story wants the shopkeeper, got ${step()}`);
    const choices = () => [...document.querySelectorAll('.dialogue:not(.is-hidden) .dialogue-choice')];
    const talkUntilChoices = async () => {
        await press('KeyE');
        await sleep(300);
        for (let index = 0; index < 8 && choices().length === 0; index += 1) {
            await press('Space');
            await sleep(350);
        }
    };
    await talkUntilChoices();
    expect(world.villagers.dialogue.isOpen, 'a conversation opened');
    log.choices = choices().map((choice) => choice.textContent);
    expect(log.choices.some((label) => label.includes('Ask ')), 'there are things to ask about');
    expect(!log.choices.some((label) => label.includes('Give ')), 'nobody takes gifts');
    choices().find((choice) => choice.textContent.includes('Ask '))?.click();
    await sleep(300);
    for (let index = 0; index < 8 && choices().length === 0; index += 1) {
        await press('Space');
        await sleep(350);
    }
    expect(choices().length > 0, 'the conversation returns to the list after a topic');
    choices().find((choice) => choice.textContent.includes('Goodbye'))?.click();
    await sleep(400);
    expect(!world.villagers.dialogue.isOpen, 'goodbye ends it');
    expect(world.villagers.hasMet('barnaby'), 'met the shopkeeper');

    // 7. Hand a villager what they asked for, out of the backpack.
    const request = world.villagers.requests.open[0];
    expect(Boolean(request) && request.tier === 0, 'the first requests are the easy tier');
    if (request) {
        world.bag.add(request.itemId, request.amount);
        const villager = game.scene.getObjectByName(`villager-${request.from}`);
        await go(villager.position.x + 1.2, villager.position.z + 1.2);
        const coinsBefore = world.coins.value();
        await talkUntilChoices();
        const handOver = choices().find((choice) => choice.textContent.includes('Hand over'));
        expect(Boolean(handOver), 'offered to hand over the request');
        handOver?.click();
        await sleep(500);
        for (let index = 0; index < 6 && choices().length === 0; index += 1) {
            await press('Space');
            await sleep(350);
        }
        choices().find((choice) => choice.textContent.includes('Goodbye'))?.click();
        await sleep(400);
        // The story pays a little on the first delivery, on top of the request.
        log.paid = world.coins.value() - coinsBefore;
        expect(log.paid >= request.reward, `paid at least ${request.reward}, got ${log.paid}`);
        expect(world.villagers.requests.completed === 1, 'the delivery was counted');
        expect(Math.abs(world.dayCycle.hour - 15) < 0.5, `a delivery takes 3 hours: it is ${world.dayCycle.clock}`);
        expect(!world.villagers.dialogue.isOpen, 'the conversation closed');
        await sleep(200);
        await quiet();
        expect(game.time.effectiveScale > 0, 'time runs again after talking');
    }
    await sleep(300);
    expect(step() === 'sleep', `the story ends the day with sleep, got ${step()}`);

    // 8. The order book: land, a pot, a hen.
    world.coins.add(1000);
    expect(world.upgrades.buy('field'), 'bought the east field');
    expect(world.farm.plots.filter((plot) => plot.active).length === 24, 'the east field opened 12 more plots');
    expect(world.upgrades.buy('pot') && world.cookpot.station.tier === 2, 'the iron pot raises the cooking tier');
    expect(world.upgrades.buy('seeds'), 'bought corn seeds for the store');
    expect(world.upgrades.buy('hen'), 'bought a hen');
    await sleep(1500);
    log.hens = game.scene.children.filter((child) => child.parent && false).length;
    expect(world.upgrades.level('hen') === 1, 'the hen is on the books');

    // 9. The notebook lists the request board and the recipes.
    await press('KeyJ');
    expect(world.journal.isOpen, 'J opens the notebook');
    expect(document.querySelector('.list-panel-wrap:not(.is-hidden)')?.textContent.includes('Requests'), 'the notebook lists requests');
    await press('KeyJ');
    expect(!world.journal.isOpen, 'J closes it again');

    // 10. A fence from the hotbar.
    hold('fence-kit');
    const fences = world.barriers.all.length;
    await press('KeyF');
    await until(() => world.barriers.all.length === fences + 1);
    expect(world.barriers.all.length === fences + 1, 'put a fence down');

    // 11. Safe zones: a Hollow beside the player in the square ignores them.
    const at = (x, z) => ({ x, y: world.terrain.heightAt(x, z) + 0.4, z });
    const hollow = world.enemies.spawn({ position: at(52 + 13, -40), health: 1e9, speed: 2, aggroRange: 30, damage: 12, color: 0x888888 });
    await go(52, -40);
    await sleep(1500);
    expect(world.safeZones.playerSafe, 'the square is safe');
    expect(hollow.root.position.distanceTo(game.player.position) > 9, 'the Hollow stays outside the shrine ring');
    log.roaming = world.population.count;

    // 12. Save, spoil the state, load: everything comes back.
    world.pockets.add('wheat', 2);
    world.dropInWorld('wheat', 2);
    world.pockets.remove('wheat', 2);
    expect(world.drops.size === 1, 'a dropped stack lies on the ground');
    expect(world.saves.save(), 'the game saves');
    for (const pickup of [...world.drops.keys()]) world.pickups.remove(pickup);
    const saved = { coins: world.coins.value(), wood: have('wood'), tier: world.cookpot.station.tier };
    world.coins.set(1);
    world.cookpot.station.tier = 1;
    world.farm.setActiveFields(1);
    world.nodes.restore();
    game.save.load('hollowveil-farm');
    expect(world.coins.value() === saved.coins, 'coins come back from the save');
    expect(world.cookpot.station.tier === saved.tier, 'the pot comes back from the save');
    expect(world.farm.activeFields === 2, 'bought land comes back from the save');
    expect(world.nodes.nodes[0].depleted, 'the felled tree is still felled after a load');
    expect(step() === 'sleep', 'the story resumes at the same step');
    expect(world.drops.size === 1 && world.pickups.objects.length >= 1, 'what was dropped is still lying there after a load');
    for (const pickup of [...world.drops.keys()]) world.pickups.remove(pickup);
    world.drops.clear();

    // 13. Settings apply and stick.
    world.settings.set('vhs', false);
    world.settings.set('look', 0.5);
    expect(world.settings.get('vhs') === false, 'the VHS filter can be turned off');
    expect(Math.abs(world.controls.look.sensitivity - 0.0006) < 1e-9, 'sensitivity follows the setting');
    expect(JSON.parse(localStorage.getItem('hollowveil-farm:settings')).vhs === false, 'settings are remembered');
    world.settings.set('vhs', true);

    // 13b. A grave candle makes a small safe ring that burns down.
    await go(20, 40);
    hold('candle');
    const zonesBefore = world.safeZones.zones.length;
    await press('KeyF');
    await until(() => world.safeZones.playerSafe);
    expect(world.safeZones.zones.length === zonesBefore + 1 && world.safeZones.playerSafe, 'a lit candle is a safe place');
    expect(have('candle') === 0, 'lighting it used the candle up');

    // 13c. Villagers go home at night and come back out by day.
    const wren = game.scene.getObjectByName('villager-wren');
    const byDay = wren.position.clone();
    world.dayCycle.setHour(22);
    world.villagers.snapToSchedule();
    log.wrenWalksHome = +wren.position.distanceTo(byDay).toFixed(0);
    expect(log.wrenWalksHome > 8, `Wren is on her doorstep at night, ${log.wrenWalksHome} m from the square spot`);
    world.dayCycle.setHour(12);
    await sleep(600);
    expect(wren.position.distanceTo(byDay) < log.wrenWalksHome, 'and walks back out when the day comes');
    world.villagers.snapToSchedule();

    // 13d. The mailbox: nothing on day 1, a letter from day 2, read in the dialogue box.
    expect(!world.letters.waiting, 'no letter on the first day');
    await go(-58, 55.5);
    await press('KeyE');
    await until(() => world.morning.isOpen);
    expect(world.morning.isOpen, 'going to bed shows the morning summary');
    expect(document.querySelector('.list-panel-wrap:not(.is-hidden)')?.textContent.includes('Requests filled'), 'the summary adds the day up');
    [...document.querySelectorAll('.list-panel-wrap:not(.is-hidden) .list-panel-action')].find((button) => button.textContent === 'Get up')?.click();
    await sleep(300);
    expect(!world.morning.isOpen && world.dayCycle.day === 2, `woke on day 2, got day ${world.dayCycle.day}`);
    expect(world.letters.waiting, 'a letter is waiting on day 2');
    await go(-56.5, 56.2);
    await press('KeyE');
    await sleep(300);
    for (let index = 0; index < 10 && world.letters.read === 0; index += 1) {
        await press('Space');
        await sleep(300);
    }
    expect(world.letters.read === 1, `read the first letter, read ${world.letters.read}`);
    await sleep(200);
    await quiet();
    expect(game.time.effectiveScale > 0, 'time runs again after reading');

    // 13e. The tall one at the bend stands still and does no harm.
    world.population.clear();
    const pell = game.scene.getObjectByName('pell');
    await go(pell.position.x + 1.5, pell.position.z + 1);
    const healthBefore = game.player.health.current;
    await press('KeyE');
    await sleep(800);
    expect(game.player.health.current === healthBefore && !world.letters.metPell, 'Pell does not hurt, and does not speak before the last letter');

    // 13f. The pool is slow going.
    await go(72, 44);
    await sleep(900);
    expect(world.controls.movement.speedScale < 0.7, `wading slows the farmer, scale ${world.controls.movement.speedScale.toFixed(2)}`);
    await go(52, -40);
    await sleep(900);
    expect(world.controls.movement.speedScale > 0.9, 'and dry ground does not');

    // 13ff. Fullscreen: a button on screen and an entry in the settings.
    expect(Boolean(document.querySelector('.fullscreen-button.is-top-right')), 'there is a fullscreen button');
    world.flow.pause();
    await sleep(200);
    world.settings.open();
    await sleep(200);
    expect([...document.querySelectorAll('.menu:not(.is-hidden) .menu-button')].some((button) => button.textContent.startsWith('Fullscreen')), 'the settings offer fullscreen');
    world.flow.resume();
    await sleep(300);

    // 13g. The wheel picks a hotbar slot and leaves the camera alone.
    await quiet();
    const zoom = world.controls.distance;
    world.hotbar.select(0);
    game.canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: 100, bubbles: true }));
    await sleep(250);
    expect(world.controls.distance === zoom, 'scrolling does not zoom while the hotbar has the wheel');
    expect(world.hotbar.selectedId !== 'watering-can', 'scrolling moves along the hotbar');

    // 13h. Nothing a day depends on can be thrown or sold away.
    const packOpen = () => document.querySelector('.pack-wrap:not(.is-hidden)');
    const point = (element, type, x, y) => element.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: x, clientY: y, pointerId: 1 }));
    const centre = (element) => {
        const box = element.getBoundingClientRect();
        return [box.left + box.width / 2, box.top + box.height / 2];
    };
    await press('Tab');
    await sleep(200);
    expect(Boolean(packOpen()), 'Tab opens the backpack');
    expect(packOpen().querySelector('.pack-stats').textContent.includes('Health'), 'the stats sit on top');
    expect(packOpen().querySelectorAll('.pack-section').length === 2, 'backpack and pockets each have a grid');
    // Click the axe: a menu with what can be done, and no way to drop it.
    const axeSlot = packOpen().querySelector('[data-item="axe"]');
    point(axeSlot, 'pointerdown', ...centre(axeSlot));
    point(axeSlot, 'pointerup', ...centre(axeSlot));
    await sleep(150);
    const menuButtons = [...document.querySelectorAll('.pack-menu:not(.is-hidden) button')].map((button) => button.textContent);
    expect(menuButtons.some((label) => label.includes('To backpack')) && !menuButtons.some((label) => label.includes('Drop')), `the axe can be moved but not dropped, menu: ${menuButtons}`);
    await press('Escape');
    expect(Boolean(packOpen()) && !document.querySelector('.pack-menu:not(.is-hidden)'), 'Escape closes the item menu first');
    // Drag wood out of the window: it lies on the ground.
    world.pockets.add('wood', 2);
    await sleep(150);
    const woodBefore = have('wood');
    const woodSlot = packOpen().querySelector('[data-item="wood"]');
    const [wx, wy] = centre(woodSlot);
    point(woodSlot, 'pointerdown', wx, wy);
    point(woodSlot, 'pointermove', wx + 30, wy);
    point(packOpen(), 'pointermove', 8, 8);
    point(packOpen(), 'pointerup', 8, 8);
    await sleep(200);
    expect(have('wood') < woodBefore, `dragging out of the window drops the stack, wood ${woodBefore} then ${have('wood')}`);
    // Drag between the grids.
    const seedSlot = packOpen().querySelector('.pack-section:nth-child(2) [data-item]');
    const seedId = seedSlot.dataset.item;
    const emptyBag = packOpen().querySelector('.pack-section:nth-child(1) .pack-slot.is-empty');
    const [sx, sy] = centre(seedSlot);
    const [ex, ey] = centre(emptyBag);
    point(seedSlot, 'pointerdown', sx, sy);
    point(seedSlot, 'pointermove', sx + 20, sy);
    point(packOpen(), 'pointermove', ex, ey);
    point(packOpen(), 'pointerup', ex, ey);
    await sleep(200);
    expect(world.bag.count(seedId) > 0 && world.pockets.count(seedId) === 0, `dragging onto the other grid moves the stack (${seedId})`);
    world.bag.moveTo(world.pockets, seedId);
    await press('Tab');
    await sleep(200);
    expect(!packOpen() && game.state.current === 'playing', 'Tab closes what it opened');
    await press('Tab');
    await sleep(200);
    await press('Escape');
    await sleep(200);
    expect(!packOpen() && game.state.current === 'playing', 'Escape closes the backpack and does not pause');
    // Dragging one item onto another swaps them.
    await press('Tab');
    await sleep(200);
    const slotsNow = [...packOpen().querySelectorAll('.pack-section:nth-child(2) [data-item]')];
    const [firstId, secondId] = [slotsNow[0].dataset.item, slotsNow[1].dataset.item];
    const [ax, ay] = centre(slotsNow[0]);
    const [bx, by] = centre(slotsNow[1]);
    point(slotsNow[0], 'pointerdown', ax, ay);
    point(slotsNow[0], 'pointermove', ax + 20, ay);
    point(packOpen(), 'pointermove', bx, by);
    point(packOpen(), 'pointerup', bx, by);
    await sleep(200);
    const swapped = world.pockets.inventory.slots.slice(0, 2).map((slot) => slot.itemId);
    expect(swapped[0] === secondId && swapped[1] === firstId, `dragging onto another item swaps them: ${firstId},${secondId} became ${swapped}`);
    await press('Tab');
    await sleep(200);
    // The store sells the next backpack up, and it is worn at once.
    world.upgrades.upgrades.set('bag', 0);
    world.coins.add(200);
    const coinsBeforeBag = world.coins.value();
    expect(world.shop.buy('backpack-1'), 'the store sells a bigger backpack');
    expect(world.bag.inventory.capacity === 6 && world.coins.value() === coinsBeforeBag - 150 && have('backpack-1') === 0, `it costs 150 and is worn at once, capacity ${world.bag.inventory.capacity}`);
    world.upgrades.upgrades.set('bag', 3);
    // Tab closes any window, the notebook included.
    await press('KeyJ');
    await press('Tab');
    await sleep(200);
    expect(!world.journal.isOpen && !packOpen(), 'Tab closes the notebook without opening the backpack');
    world.chestPack.open();
    await sleep(150);
    expect(packOpen()?.querySelectorAll('.pack-section').length === 3, 'the barn chest shows chest, backpack and pockets');
    world.chestPack.close();
    world.pockets.add('turnip', 2);
    world.shop.open();
    await sleep(200);
    document.querySelector('.inventory:not(.is-hidden) [data-item="turnip"]')?.click();
    await sleep(150);
    const shopButtons = [...document.querySelectorAll('.inventory:not(.is-hidden) .inventory-actions button')].map((button) => button.textContent);
    expect(shopButtons.some((label) => label.startsWith('Sell')) && !shopButtons.some((label) => label.startsWith('Buy')), `the store buys what you carry, buttons: ${shopButtons}`);
    expect(!document.querySelector('.inventory:not(.is-hidden) [data-item="axe"]'), 'the store does not offer to buy your axe');
    world.shop.close();

    // 13i. A farmer with nothing left is given seeds, once a day.
    const stash = { coins: world.coins.value(), field: world.farm.toJSON() };
    for (const inventory of [world.pockets, world.bag]) for (const slot of [...inventory.inventory.slots]) if (/seed|turnip|wheat/.test(slot.itemId)) inventory.remove(slot.itemId, slot.amount);
    world.farm.clearField();
    world.coins.set(0);
    await sleep(900);
    expect(have('turnip-seed') === 3, `seeds turn up on the doorstep, got ${have('turnip-seed')}`);
    world.pockets.remove('turnip-seed', 3);
    await sleep(900);
    expect(have('turnip-seed') === 0, 'but only once a day');
    world.coins.set(stash.coins);
    world.farm.fromJSON(stash.field);
    expect(world.villagers.requests.tier <= world.cookpot.station.tier, 'requests never outrun the pot');

    // 13j. The valley gets worse by the day, and the settings can calm the picture.
    expect(world.omens.showing > 0 && world.hunting(), `signs of trouble appear from day 2, showing ${world.omens.showing}`);
    for (const id of ['psx', 'mist']) world.settings.set(id, false);
    world.settings.set('shimmer', 0);
    await sleep(300);
    for (const id of ['psx', 'mist']) world.settings.set(id, true);
    world.settings.set('shimmer', 0.6);

    // 13jj. Night: 3 times as many are wanted, and the ones about turn on the farmer.
    world.dayCycle.setHour(12);
    await sleep(300);
    const roamersByDay = world.hollowTarget();
    const roamer = world.spawnKind(40, 40, 'walker');
    const dayTemper = { speed: roamer.options.speed, aggro: roamer.options.aggroRange, drift: roamer.options.drift };
    world.dayCycle.setHour(22);
    await sleep(400);
    expect(world.hollowTarget() === roamersByDay * 3, `night wants 3 times the roamers: ${roamersByDay} by day, ${world.hollowTarget()} by night`);
    expect(roamer.options.speed > dayTemper.speed && roamer.options.aggroRange > dayTemper.aggro && roamer.options.drift > dayTemper.drift, 'at night they are quicker, see farther and close in harder');
    expect(roamer.options.speed < 4.5, `and still slower than a walking farmer, ${roamer.options.speed.toFixed(2)} m/s`);
    expect(document.querySelector('.hud').textContent.includes('Night'), 'the clock says it is night');
    world.dayCycle.setHour(12);
    await sleep(400);
    expect(roamer.options.speed === dayTemper.speed, 'and calm down again by day');

    // 13j2. Three in the morning: the clock stops and only bed is left.
    world.dayCycle.setHour(2.99);
    await sleep(600);
    await quiet();
    expect(world.dayCycle.stalled && world.dayCycle.clock === '03:00', `the clock stops at 3, it says ${world.dayCycle.clock}`);
    await sleep(1200);
    expect(world.dayCycle.clock === '03:00', 'and stays there');
    expect(document.querySelector('.banner').textContent.includes('You need to sleep'), 'a banner says to sleep');
    await go(-52, 51.6);
    world.can.left = 1;
    await press('KeyE');
    await sleep(200);
    expect(world.can.left === 1, 'nothing else can be used at 3 in the morning');
    const dayAt3 = world.dayCycle.day;
    await go(-58, 55.5);
    await press('KeyE');
    await until(() => world.morning.isOpen);
    world.morning.close();
    expect(!world.dayCycle.stalled && world.dayCycle.day === dayAt3 && world.dayCycle.hour >= 6, `bed still works, and wakes on the same day: day ${world.dayCycle.day}, ${world.dayCycle.clock}`);
    world.dayCycle.setHour(12);
    await sleep(300);

    // 13k. One of them winds up before it hits, the hit shows, and there is a breather after it.
    world.population.clear();
    game.player.heal(100);
    await go(20, 62);
    const striker = world.spawnKind(21.2, 62, 'walker');
    await until(() => striker.attackProgress > 0, 6000);
    expect(striker.attackProgress > 0 && game.player.health.current === 100, 'it raises its arms before the blow lands');
    await until(() => game.player.health.current < 100, 3000);
    log.hit = 100 - game.player.health.current;
    expect(log.hit === 25, `the blow costs 25 health, cost ${log.hit}`);
    expect(game.player.health.isInvulnerable, 'the farmer cannot be hit again straight away');
    expect(document.querySelector('.damage-vignette').classList.contains('is-hit'), 'the screen edges flash on a hit');
    await sleep(1200);
    expect(game.player.health.current === 75, `no second hit inside the breather, health ${game.player.health.current}`);
    world.population.clear();
    world.enemies.clear();

    // 13l. Work has motions: the axe swings, and riding is sitting.
    world.body.play('swing');
    await sleep(200);
    expect(Math.abs(world.body.hand.rotation.x) > 0.8, 'the axe arm comes up for a swing');

    // 14. Outside, they kill. The farmer wakes in the infirmary 3 days on, with only the tools.
    world.population.clear();
    game.player.heal(100);
    const day = world.dayCycle.day;
    world.pockets.add('turnip', 4);
    await go(80, -80);
    world.enemies.spawn({ position: at(81, -80), health: 1e9, speed: 0, aggroRange: 30, damage: 200, attackCooldown: 0.2, color: 0x444444 });
    await until(() => game.player.isDead, 5000);
    expect(game.player.isDead, 'the Hollow can kill you');
    await until(() => game.state.current === 'dead', 4000);
    expect(game.state.current === 'dead', `a death screen comes up, state ${game.state.current}`);
    const wakeUp = [...document.querySelectorAll('.menu:not(.is-hidden) .menu-button')].find((button) => button.textContent === 'Wake up');
    expect(Boolean(wakeUp), 'the death screen offers to wake up');
    wakeUp?.click();
    await sleep(600);
    log.wokeAt = game.player.position.toArray().map((value) => +value.toFixed(0));
    expect(game.state.current === 'playing' && !game.player.isDead, 'awake again');
    expect(Math.hypot(game.player.position.x - 52, game.player.position.z + 40) < 26, `woke inside the village, at ${log.wokeAt}`);
    expect(world.dayCycle.day === day + 3, `3 days are gone: day ${day} became ${world.dayCycle.day}`);
    log.kept = [...world.pockets.inventory.slots, ...world.bag.inventory.slots].map((slot) => slot.itemId).sort();
    expect(log.kept.join() === 'axe,watering-can', `only the tools are left, got ${log.kept}`);
    world.chest.add('turnip', 1);
    expect(world.story.story.current?.id === 'regular', `the story is on to the days after, got ${world.story.story.current?.id}`);

    // 14b. Pell on the hill: the way home, with a clock on it.
    const pellNow = game.scene.getObjectByName('pell');
    expect(Math.hypot(pellNow.position.x + 70, pellNow.position.z + 56) < 8, 'Pell stands on the lookout hill');
    expect(world.escape.waiting, `from day 3 Pell has something to say, day ${world.dayCycle.day}`);
    world.dayCycle.setHour(12);
    world.population.clear();
    world.coins.set(700);
    const pellChoices = async () => {
        await go(pellNow.position.x + 1.4, pellNow.position.z + 0.6);
        await press('KeyE');
        await sleep(300);
        for (let index = 0; index < 30 && choices().length === 0; index += 1) {
            await press('Space');
            await sleep(200);
        }
        return choices();
    };
    const offerChoices = await pellChoices();
    offerChoices.find((choice) => choice.textContent.includes('Yes'))?.click();
    await sleep(300);
    for (let index = 0; index < 6 && world.villagers.dialogue.isOpen === false && document.querySelector('.dialogue:not(.is-hidden):not(.dialogue-self)'); index += 1) {
        await press('Space');
        await sleep(250);
    }
    await sleep(400);
    await quiet();
    expect(world.escape.pledge.state === 'running' && world.escape.pledge.daysLeft === 60, `saying yes starts 60 days, state ${world.escape.pledge.state}, ${world.escape.pledge.daysLeft} days`);
    expect(document.querySelector('.hud').textContent.includes('60d'), 'the countdown shows on the HUD');
    (await pellChoices()).find((choice) => choice.textContent.includes('Burn 500'))?.click();
    await sleep(300);
    for (let index = 0; index < 6 && document.querySelector('.dialogue:not(.is-hidden):not(.dialogue-self)'); index += 1) {
        await press('Space');
        await sleep(250);
    }
    expect(world.escape.pledge.remaining === 11500 && world.coins.value() === 200, `500 burned: ${world.escape.pledge.remaining} left, purse ${world.coins.value()}`);

    // 14c. The valley loops.
    await quiet();
    game.player.body.teleport({ x: 118, y: world.terrain.heightAt(118, 10) + 0.2, z: 10 });
    await sleep(350);
    expect(document.querySelector('.veil').classList.contains('is-closed') && game.player.position.x > 100, 'the Veil covers the screen before the farmer is moved');
    await until(() => game.player.position.x < 0, 3000);
    expect(!world.narration.speaking, 'nothing is said until the far side can be seen');
    await until(() => world.narration.speaking || world.tally.wrapped > 0, 4000);
    expect(game.player.position.x < -100, `walking out east comes in from the west, x ${game.player.position.x.toFixed(0)}`);

    // 14d. A bad day: they ring the village, and are gone by morning.
    world.happenings.trigger('siege');
    await sleep(400);
    await quiet();
    log.siege = world.happenings.gathered;
    expect(log.siege >= 12, `a siege gathers a crowd round the wall, ${log.siege}`);
    world.happenings.newDay();
    world.enemies.clear();
    expect(world.deeds.has('harvest') && world.deeds.has('died') && world.deeds.has('bargain'), 'deeds are kept');

    // 14e. Barnaby's collection crate: a window that says what it is, sells the spare and keeps what was asked for.
    {
        const crate = world.crate;
        const asked = world.villagers.requests.open.map((request) => request.itemId);
        const spare = ['pumpkin', 'corn', 'wheat', 'turnip', 'wood'].find((id) => !asked.includes(id));
        const wanted = asked.find((id) => crate.priceOf(id) > 0);
        world.bag.add(spare, 3);
        if (wanted) world.pockets.add(wanted, 1);
        const wantedBefore = wanted ? have(wanted) : 0;
        await go(world.crateSpot.x + 1.2, world.crateSpot.z);
        await press('KeyE');
        await until(() => crate.isOpen);
        const text = document.querySelector('.list-panel-wrap:not(.is-hidden) .list-panel')?.textContent ?? '';
        expect(crate.isOpen && text.includes('Sell from home'), 'E at the crate opens a window that explains it');
        expect(!wanted || text.includes('asked for this'), 'what a villager asked for is marked');
        const before = world.coins.value();
        const made = crate.sendSpare();
        expect(made >= crate.priceOf(spare) * 3 && world.coins.value() === before + made, `the crate pays for the spare, ${made}`);
        expect(have(spare) === 0, 'and takes it out of the backpack too');
        expect(!wanted || have(wanted) === wantedBefore, 'what was asked for stays in the pockets');
        expect(crate.priceOf(spare) < world.shop.inventory.sellPrice(spare), 'it pays less than the stall');
        crate.close();
        await sleep(200);
        log.crate = made;
    }

    // 14e2. The barn has an inside, and the stall buys out of the backpack.
    {
        await go(world.barn.floor.x - 12, world.barn.floor.z);
        world.barn.enter();
        await sleep(900);
        await quiet();
        expect(world.barn.inside && game.player.position.y > 60, 'the barn door leads to a room of its own');
        expect(document.querySelector('.hv-place')?.textContent.includes('barn'), 'the plate names the barn');
        const height = game.player.position.y;
        await sleep(600);
        expect(Math.abs(game.player.position.y - height) < 0.5, 'the floor holds');
        world.barn.leave();
        await sleep(900);
        expect(!world.barn.inside && game.player.position.y < 20, 'and the door inside leads back to the yard');

        world.bag.add('pumpkin', 2);
        const before = world.coins.value();
        const made = world.scales.send('pumpkin');
        expect(made === world.shop.inventory.sellPrice('pumpkin') * 2 && world.coins.value() === before + made, `the stall pays its full price out of the backpack, ${made}`);
    }

    // 14f. The plates: the task top left, the day, hour and purse top right.
    {
        const quest = document.querySelector('.hv-quest').getBoundingClientRect();
        const clock = document.querySelector('.hv-clock').getBoundingClientRect();
        expect(quest.left < 40 && quest.top < 80, 'the task is pinned top left');
        expect(clock.right > innerWidth - 90 && clock.top < 80, 'the clock hangs top right');
        const clockText = document.querySelector('.hv-clock').textContent;
        expect(/Day|Night/.test(clockText) && /\d\d:\d\d/.test(clockText) && clockText.includes(`${world.coins.value()}c`), `the clock shows the day, the hour and the purse: ${clockText}`);
    }

    // 15. Back at the title screen there is a save to continue.
    world.flow.quit();
    await sleep(300);
    const continueButton = [...document.querySelectorAll('.menu:not(.is-hidden) .menu-button')].find((button) => button.textContent.startsWith('Continue'));
    log.continueLabel = continueButton?.textContent;
    expect(Boolean(continueButton) && !continueButton.classList.contains('is-hidden'), 'the title screen offers Continue');

    clearInterval(reader);
    return { ok: failures.length === 0, failures, log, state: game.state.current };
})();
