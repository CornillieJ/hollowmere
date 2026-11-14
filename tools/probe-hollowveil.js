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
    world.finds.chance = 0;
    // Weather comes when it likes: not during a test.
    world.weather.hold(true);
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
    await quiet();
    expect(step() === 'note', `the story points at the paper by the field, got ${step()}`);
    // 3a. Nobody leaves the farm before the paper is read, and the lamplight is not drawn before a Hollow is seen.
    const paper = game.scene.getObjectByName('bloody-note');
    await sleep(700);
    expect(paper.visible, 'the paper lies by the field once the first crop is in');
    await go(-20, 30);
    await sleep(400);
    await quiet();
    expect(Math.hypot(game.player.position.x + 47, game.player.position.z - 46) < 27.5, `the farm cannot be left yet, at ${game.player.position.x.toFixed(1)}, ${game.player.position.z.toFixed(1)}`);
    expect(!game.scene.getObjectByName('safe-zones').visible, 'no lamplight on the ground before a Hollow has been seen');
    await go(paper.position.x + 0.5, paper.position.z + 0.5);
    await press('KeyE');
    await sleep(400);
    await quiet();
    await sleep(700);
    expect(step() === 'cook' && !paper.visible, `reading it moves the story on to cooking, got ${step()}`);
    {
        const spot = game.player.position;
        const forward = new (game.camera.position.constructor)(0, 0, -1).applyQuaternion(game.camera.quaternion);
        const shown = world.spawnKind(spot.x + forward.x * 14, spot.z + forward.z * 14, 'walker');
        await sleep(1200);
        await quiet();
        expect(game.scene.getObjectByName('safe-zones').visible, 'seeing the first Hollow brings the lamplight out');
        world.population.clear();
        world.enemies.despawn(shown);
    }

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
    // 4b. It is hot out of the pot, and the plate says so.
    await quiet();
    expect(world.warmth.heatOf('turnip-soup') === 'hot' && world.warmth.heatOf('turnip') === undefined, 'a dish is hot when it leaves the pot; a turnip has no temperature');
    await sleep(200);
    expect(document.querySelector('.hv-basket')?.textContent.includes('Turnip soup') && document.querySelector('.hv-basket-line.is-hot'), 'the basket line under the task shows it hot');
    expect(world.warmth.bonus('turnip-soup') === 0.3, 'hot food pays 30% more');
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

    // 13h2. What the village wants today pays double at the stall, and the chalkboard says so.
    expect(world.scales.priceOf(world.craving()) === world.shop.inventory.sellPrice(world.craving()) * 2, `today's craving (${world.craving()}) pays double at the stall`);
    expect(game.scene.getObjectByName('chalkboard') !== undefined, 'a chalkboard stands by the store');

    // 13h3. Things come up out of the field: the unseen ones first, and the notebook counts them.
    {
        const first = world.dig(game.player.position, true);
        await sleep(300);
        await quiet();
        const second = world.dig(game.player.position, true);
        await sleep(300);
        await quiet();
        expect(first === 'find-button' && second === 'find-coin' && world.found.size === 2, `the field gives up its things in order: ${first}, ${second}`);
        expect(have('find-button') === 1 && world.scales.priceOf('find-coin') >= 60, 'they are carried, and the stall buys them');
        for (const id of ['find-button', 'find-coin']) for (const inventory of [world.pockets, world.bag]) inventory.remove(id, 1);
    }

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
    expect(world.dayCycle.day === day + 2, `2 days are gone: day ${day} became ${world.dayCycle.day}`);
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
    expect(world.escape.pledge.state === 'running' && world.escape.met, `the count runs by itself and Pell has explained it, state ${world.escape.pledge.state}`);
    expect(world.escape.pledge.daysLeft <= 25 && world.escape.pledge.daysLeft > 15, `25 days from the morning the note came: ${world.escape.pledge.daysLeft} left`);
    expect(document.querySelector('.hud').textContent.includes(`${world.escape.pledge.daysLeft}d`), 'the countdown shows on the HUD');
    (await pellChoices()).find((choice) => choice.textContent.includes('Burn 500'))?.click();
    await sleep(300);
    for (let index = 0; index < 6 && document.querySelector('.dialogue:not(.is-hidden):not(.dialogue-self)'); index += 1) {
        await press('Space');
        await sleep(250);
    }
    expect(world.escape.pledge.remaining === 5500 && world.coins.value() === 200, `500 burned: ${world.escape.pledge.remaining} left, purse ${world.coins.value()}`);

    // A quarter of the price turns the old tree green, once.
    world.coins.add(1000);
    world.escape.pledge.pay(1000);
    await sleep(600);
    expect(world.tally.burned === 1, `a quarter burned is marked: ${world.tally.burned}`);
    await quiet();

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
    // Counted at once: the farmer is on the hill, and those too far off to be seen are let go again.
    log.siege = world.happenings.gathered;
    await sleep(400);
    await quiet();
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

    // 14e3. Food cools by the hour, and a hot delivery pays more.
    {
        const { warmth, dayCycle } = world;
        world.pockets.remove('turnip-soup', have('turnip-soup'));
        await sleep(100);
        dayCycle.setHour(8);
        world.pockets.add('turnip-soup', 1);
        warmth.collected('turnip-soup', 1);
        expect(warmth.heatOf('turnip-soup') === 'hot' && Math.abs(warmth.hoursLeft('turnip-soup') - 4) < 0.2, 'fresh soup is hot for 4 hours');
        dayCycle.setHour(13);
        expect(warmth.heatOf('turnip-soup') === 'warm' && warmth.bonus('turnip-soup') === 0.12, 'after 5 hours it is warm');
        dayCycle.setHour(19);
        expect(warmth.heatOf('turnip-soup') === 'cold' && warmth.bonus('turnip-soup') === 0, 'after 11 hours it is cold');
        // A fresh bowl in with a cold one: the two together are warm.
        world.pockets.add('turnip-soup', 1);
        warmth.collected('turnip-soup', 1);
        expect(warmth.heatOf('turnip-soup') === 'warm', `one fresh bowl and one cold one make a warm basket, got ${warmth.heatOf('turnip-soup')}`);
        expect(warmth.scent() === 2, `2 warm bowls smell of 2, got ${warmth.scent()}`);
        // They smell it: hot food widens how far off they notice, and brings more of them.
        {
            await go(34, 62);
            const sniffer = world.spawnKind(74, 62, 'walker');
            await sleep(700);
            const calm = sniffer.options.aggroRange;
            const calmTarget = world.hollowTarget();
            world.pockets.add('bread', 4);
            warmth.collected('bread', 4);
            await sleep(900);
            expect(world.scentLevel() === 1, `4 hot loaves and 2 warm bowls smell as strong as it gets, ${world.scentLevel()} in ${world.safeZones.zoneAt(game.player.position)?.name}`);
            expect(sniffer.options.aggroRange > calm * 1.3, `they notice from further off: ${calm} to ${sniffer.options.aggroRange}`);
            expect(world.hollowTarget() > calmTarget, 'and more of them come');
            expect(document.querySelector('.hv-basket')?.textContent.includes('smell'), 'the basket line says they smell it');
            world.pockets.remove('bread', 4);
            await sleep(900);
            expect(sniffer.options.aggroRange < calm * 1.3, 'with the basket lighter they lose interest again');
            await quiet();
        }
        // Out of the hands, it has no heat left to keep.
        world.pockets.remove('turnip-soup', 2);
        await sleep(150);
        world.pockets.add('turnip-soup', 1);
        expect(warmth.heatOf('turnip-soup') === 'cold', 'a dish that left the hands is cold when it comes back');
        world.pockets.remove('turnip-soup', 1);
        dayCycle.setHour(10);
    }

    // 14e3. Veilblooms: shut by day, open at night, 1 flower a night each.
    {
        const { blooms, dayCycle } = world;
        dayCycle.setHour(12);
        await sleep(1800);
        expect(blooms.blooms.length >= 8 && blooms.blooms.every((bloom) => !bloom.open), 'the veilblooms are shut by day');
        dayCycle.setHour(22);
        world.population.clear();
        const spot = blooms.blooms[2].position;
        await go(spot.x + 0.9, spot.z + 0.6);
        await sleep(1800);
        const before = have('veilbloom');
        await press('KeyE');
        await sleep(300);
        await quiet();
        expect(have('veilbloom') === before + 1, `a veilbloom is picked at night, got ${have('veilbloom') - before}`);
        await sleep(1500);
        await press('KeyE');
        await sleep(200);
        expect(have('veilbloom') === before + 1 && !blooms.blooms[2].open, 'and that plant gives no more that night');
        // The dog came after the first night, and it smells them before they are seen.
        expect(world.dog.object.visible && world.dog.object.position.distanceTo(game.player.position) < 8, 'the dog has turned up and keeps close');
        const smelled = world.spawnKind(spot.x + 12, spot.z + 3, 'walker');
        await sleep(900);
        await quiet();
        expect(world.dog.alert, 'the dog goes stiff when a Hollow is near');
        world.enemies.despawn(smelled);
        world.pockets.remove('veilbloom', have('veilbloom'));
        world.bag.remove('veilbloom', 9);
        dayCycle.setHour(10);
        world.population.clear();
    }

    // 14e4. The Veil thickens far from light and late; a lantern makes a hole in it and a ring they keep out of.
    {
        const { lanterns, dayCycle } = world;
        dayCycle.setHour(12);
        await go(40, 96);
        const noonFar = world.veilAt(game.player.position);
        dayCycle.setHour(22);
        const nightFar = world.veilAt(game.player.position);
        expect(nightFar > 1.7 && noonFar < 1.3, `far from any light the Veil is thick at night (${nightFar.toFixed(2)}) and thin at noon (${noonFar.toFixed(2)}) near ${world.safeZones.zones.map((zone) => `${zone.name}@${Math.round(Math.hypot(zone.position.x - game.player.position.x, zone.position.z - game.player.position.z))}`).join(',')}`);
        expect(world.veilAt({ x: -58, y: 0, z: 54 }) === 1, 'on the porch it is as thin as it gets');
        world.pockets.add('lantern', 1);
        world.pockets.add('lamp-oil', 2);
        hold('lantern');
        await press('KeyF');
        await sleep(400);
        await quiet();
        expect(lanterns.lanterns.length === 1 && have('lantern') === 0, 'F puts the lantern up');
        const lantern = lanterns.lanterns[0];
        expect(Math.abs(lanterns.hoursLeft(lantern) - 24) < 0.5, 'it comes with a day of oil');
        await sleep(300);
        expect(world.safeZones.zoneAt(lantern.position)?.name === 'Lantern', 'its light is a ring they keep out of');
        expect(world.veilAt(lantern.position) < 1.05, `and the Veil is thin round it, ${world.veilAt(lantern.position).toFixed(2)}`);
        await go(lantern.position.x + 0.8, lantern.position.z);
        await press('KeyE');
        expect(have('lamp-oil') === 1 && Math.abs(lanterns.hoursLeft(lantern) - 48) < 0.5, `a flask adds a day, ${lanterns.hoursLeft(lantern).toFixed(1)}h`);
        // Out of oil it is only a post.
        lantern.until = dayCycle.day * 24 + dayCycle.hour - 1;
        await sleep(300);
        expect(!world.safeZones.zoneAt(lantern.position) && world.veilAt(lantern.position) > 1.7, 'out of oil the ring and the clearing are gone');
        // Saved and loaded, it stands where it stood. With no oil in the pocket, E takes it down.
        const kept = lanterns.toJSON();
        lanterns.fromJSON(kept);
        expect(lanterns.lanterns.length === 1, 'a lantern comes back from a save');
        world.pockets.remove('lamp-oil', 1);
        await go(lanterns.lanterns[0].position.x + 0.8, lanterns.lanterns[0].position.z);
        await press('KeyE');
        expect(lanterns.lanterns.length === 0 && have('lantern') === 1, 'E without oil takes it down again');
        world.pockets.remove('lantern', 1);
        dayCycle.setHour(10);
    }

    // 14e5. Regulars: a standing order at 1 heart, a dish at 2, a favour at 3.
    {
        const { regulars, villagers, dayCycle } = world;
        const hearts = villagers.relationships;
        dayCycle.setHour(10);
        villagers.snapToSchedule();
        await sleep(300);
        hearts.add('wren', -1000);
        expect(regulars.orderOf('wren') === undefined, 'a stranger keeps no regular order');
        hearts.add('wren', 120);
        regulars.newDay();
        await sleep(300);
        await quiet();
        const order = regulars.orderOf('wren');
        expect(order?.open && order.itemId === 'boiled-egg' && order.amount === 2, `at 1 heart Wren's order comes round: ${JSON.stringify(order)}`);
        expect(order.pay > world.shop.inventory.sellPrice('boiled-egg') * 2 * 1.5, `it pays well over the stall, ${order.pay}`);
        expect(world.crate.isOpen === false && regulars.wanted('boiled-egg') === 'Wren', 'the crate will know it is spoken for');
        const wren = game.scene.getObjectByName('villager-wren');
        const pick = async (text) => {
            await go(wren.position.x + 1.2, wren.position.z + 1.2);
            await talkUntilChoices();
            const choice = choices().find((option) => option.textContent.includes(text));
            choice?.click();
            await sleep(500);
            for (let index = 0; index < 8 && choices().length === 0; index += 1) {
                await press('Space');
                await sleep(350);
            }
            choices().find((option) => option.textContent.includes('Goodbye'))?.click();
            await sleep(500);
            await quiet();
            return Boolean(choice);
        };
        expect(!(await pick('regular order')), 'with nothing to hand over the order is not offered');
        world.pockets.add('boiled-egg', 2);
        world.warmth.collected('boiled-egg', 2);
        const before = world.coins.value();
        const hourBefore = dayCycle.hour;
        expect(await pick('regular order'), 'with the eggs in hand it is');
        const paid = world.coins.value() - before;
        expect(paid === Math.round(order.pay * 1.3) && have('boiled-egg') === 0, `handed over hot it pays the order and 30% more: ${paid} for ${order.pay}`);
        expect(!regulars.orderOf('wren').open && regulars.orderOf('wren').dueDay === dayCycle.day + 3, 'and the next one comes round in 3 days');
        expect(Math.abs(dayCycle.hour - hourBefore - 3) < 0.4, 'the call took 3 hours');
        // 2 hearts: she teaches her dish, and the order changes to it.
        hearts.add('wren', 200 - hearts.points('wren'));
        dayCycle.setHour(10);
        expect(!world.potRecipes.some((recipe) => recipe.id === 'turnip-mash'), 'turnip mash is not known yet');
        expect(await pick('favourite'), 'at 2 hearts she can be asked what she likes');
        expect(regulars.taught('wren') && world.potRecipes.some((recipe) => recipe.id === 'turnip-mash'), 'the pot can make turnip mash now');
        expect(regulars.orderOf('wren').itemId === 'turnip-mash', 'and her order is for mash from now on');
        // 3 hearts: a favour that lasts.
        hearts.add('wren', 300 - hearts.points('wren'));
        dayCycle.setHour(10);
        expect(await pick('buried half'), 'at 3 hearts she offers a favour');
        expect(regulars.has('seeds'), 'Wren leaves seeds from now on');
        // The others' favours do what they say.
        const kept = regulars.toJSON();
        regulars.fromJSON({ ...kept, favours: ['seeds', 'ledger', 'shortcut', 'cosy', 'guard'] });
        expect(world.crate.priceOf('pumpkin') === world.shop.inventory.sellPrice('pumpkin'), 'in the green book the crate pays the stall price');
        expect(world.visitHours() === 2, 'the short way round makes a call 2 hours');
        dayCycle.setHour(8);
        world.pockets.add('bread', 1);
        world.warmth.collected('bread', 1);
        expect(Math.abs(world.warmth.hoursLeft('bread') - 6) < 0.2, 'the cosy keeps a dish hot for 6 hours');
        world.pockets.remove('bread', 1);
        regulars.fromJSON(kept);
        expect(regulars.taught('wren') && world.potRecipes.some((recipe) => recipe.id === 'turnip-mash') && world.visitHours() === 3, 'what was taught and granted comes back from a save, and no more');
        // Left too long, an order lapses.
        hearts.add('fen', 120);
        regulars.newDay();
        const day = dayCycle.day;
        dayCycle.day = day + 3;
        const fenBefore = hearts.points('fen');
        regulars.newDay();
        expect(!regulars.orderOf('fen').open && hearts.points('fen') < fenBefore, 'an order left 3 days lapses and costs some goodwill');
        dayCycle.day = day;
        dayCycle.setHour(10);
        await quiet();
    }

    // 14e6. The valley goes wrong by degrees.
    {
        const { wrongness, dayCycle } = world;
        const day = dayCycle.day;
        const scarecrow = () => game.scene.getObjectByName('scarecrow') ?? wrongness.scarecrowObject;
        wrongness.fromJSON(undefined);
        dayCycle.day = 2;
        dayCycle.setHour(10);
        expect(wrongness.level === 0 && wrongness.sign.text()[1] === 'not far', `on day 2 only the signpost has changed: ${wrongness.sign.text()[1]}`);
        expect(wrongness.newDay().length === 0 && wrongness.scarecrowSteps === 0, 'and nothing happens in the night');
        // Day 9: the scarecrow walks, things are done in the night, the label over the task changes.
        dayCycle.day = 10;
        const planted = world.farm.plots.filter((plot) => plot.active && plot.crop && !plot.ripe);
        for (const plot of planted) plot.watered = false;
        const rows = wrongness.newDay();
        expect(wrongness.scarecrowSteps === 1, 'the scarecrow is a step nearer the house in the morning');
        expect(rows.length === 1 && (planted.length === 0 || planted.every((plot) => plot.watered)), `something was done in the night: ${rows[0]?.title}`);
        expect(wrongness.noticed.has('night'), 'which goes in the notebook');
        expect(wrongness.questLabel().includes('who you are'), `the label over the task has changed: ${wrongness.questLabel()}`);
        await sleep(300);
        expect(document.querySelector('.hv-quest').dataset.label.includes('who you are'), 'and the plate shows it');
        // Near the scarecrow the farmer notices, and can carry it back.
        const post = { x: -48, z: 40.2 };
        await go(post.x - 2.4, post.z + 3.6);
        await sleep(600);
        await quiet();
        expect(wrongness.noticed.has('scarecrow'), 'near it, the farmer notices the scarecrow has moved');
        await press('KeyE');
        await sleep(200);
        expect(wrongness.scarecrowSteps === 0, 'E carries it back to its post');
        // The signpost.
        await go(-28.5, 30.3);
        await press('KeyE');
        await sleep(400);
        await quiet();
        expect(wrongness.noticed.has('sign') && wrongness.sign.text()[1] === 'we like you', `the signpost says something else: ${wrongness.sign.text().join(' / ')}`);
        // Yesterday.
        wrongness.talked('fen');
        dayCycle.day = 12;
        expect(wrongness.denial('fen') === undefined, 'nobody denies a talk that was not yesterday');
        dayCycle.day = 11;
        expect(String(wrongness.denial('fen')).includes('did not see you yesterday'), 'Fen denies yesterday');
        await sleep(400);
        await quiet();
        expect(wrongness.noticed.has('denial'), 'and the farmer notes it');
        // The house that is not there.
        wrongness.force('house');
        expect(wrongness.house.visible, 'there is a house in the woods by the road');
        await go(wrongness.house.position.x + 8, wrongness.house.position.z);
        await sleep(500);
        await quiet();
        expect(!wrongness.house.visible && wrongness.noticed.has('house'), 'walked up to, it is not there');
        // Somebody on the road at dusk.
        dayCycle.setHour(20);
        await go(8, 0);
        wrongness.force('double');
        await sleep(500);
        expect(wrongness.double.visible && wrongness.double.position.distanceTo(game.player.position) >= 29, 'at dusk somebody stands a way down the road');
        await go(wrongness.double.position.x + 5, wrongness.double.position.z + 5);
        await sleep(500);
        await quiet();
        expect(!wrongness.double.visible && wrongness.noticed.has('double'), 'reached, there is nobody');
        // The clock.
        wrongness.force('clock');
        await sleep(350);
        expect(Boolean(document.querySelector('.hv-clock-time.is-slipping')) && wrongness.clock() !== undefined, 'the clock slips for a moment');
        await sleep(1500);
        expect(!document.querySelector('.hv-clock-time.is-slipping'), 'and is right again');
        expect(wrongness.rows().length >= 6, 'what was noticed is listed in the notebook');
        const kept = wrongness.toJSON();
        wrongness.fromJSON(kept);
        expect(wrongness.noticed.size >= 5, 'and comes back from a save');
        dayCycle.day = day;
        dayCycle.setHour(10);
        wrongness.fromJSON({ noticed: [...wrongness.noticed] });
        await quiet();
    }

    // 14e7. Staying: the last day passes, the farmer sleeps on it, and nothing is wrong any more.
    {
        const { ending, wrongness, escape, dayCycle } = world;
        expect(escape.pledge.state === 'running', `the bargain is on, ${escape.pledge.state}`);
        const day = dayCycle.day;
        dayCycle.day = escape.pledge.deadline + 1;
        await sleep(500);
        await quiet();
        expect(escape.pledge.state === 'missed', 'the last day passes unpaid');
        dayCycle.setHour(22);
        world.goToBedNow();
        await sleep(400);
        expect(ending.playing && document.querySelector('.ending.is-stay.is-open'), 'going to bed after that plays the ending for staying');
        expect(game.time.effectiveScale === 0, 'and the valley holds still under it');
        const firstCard = document.querySelector('.ending-text').textContent;
        let cards = 0;
        for (; cards < 12 && document.querySelector('.ending-button').classList.contains('is-hidden'); cards += 1) {
            ending.next();
            await sleep(60);
        }
        expect(cards === 7 && firstCard.includes('soup'), `7 cards are read before the last one, ${cards}`);
        expect(document.querySelector('.ending-tally').textContent.includes('Days in Hollowveil'), 'the last card adds the life up');
        expect(document.querySelector('.ending-button').textContent === 'Go on living here', 'and offers to go on');
        document.querySelector('.ending-button').click();
        await sleep(300);
        expect(!ending.playing && world.morning.isOpen, 'then it is morning, like any other');
        world.morning.close();
        await sleep(200);
        expect(world.tally.stayed > 0 && world.deeds.has('stayed'), 'staying is kept');
        expect(wrongness.sign.text()[1] === 'home' && wrongness.questLabel() === 'Today' && wrongness.scarecrowSteps === 0, 'nothing is wrong any more');
        dayCycle.setHour(22);
        world.goToBedNow();
        await sleep(300);
        expect(!ending.playing && world.morning.isOpen, 'the ending plays once');
        world.morning.close();
        dayCycle.day = day;
        dayCycle.setHour(10);
        await quiet();
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

    // 14g. Weather: each kind says what it does and does it.
    {
        const { weather, dayCycle } = world;
        dayCycle.setHour(10);
        const dry = world.farm.plots.find((plot) => plot.active && plot.crop && !plot.ripe && !plot.watered);
        weather.force('rain', 3);
        await sleep(500);
        expect(weather.id === 'rain' && weather.cooling === 1.5, `it rains, and food cools faster: ${weather.id} ${weather.cooling}`);
        expect(/Rain/.test(document.querySelector('.banner')?.textContent ?? ''), `a banner says what rain does: ${document.querySelector('.banner')?.textContent}`);
        expect(/Rain/.test(document.querySelector('.hv-basket')?.textContent ?? ''), 'and the line stays under the task');
        expect(!dry || dry.watered, 'the rain waters what was dry');
        weather.force('thick', 3);
        await sleep(400);
        const compass = document.querySelector('.compass');
        expect(compass.classList.contains('is-hidden') || getComputedStyle(compass).display === 'none', 'a thick Veil takes the compass away');
        weather.force('clear', 3);
        await sleep(400);
        expect(weather.hollow === 0.5 && !(compass.classList.contains('is-hidden') || getComputedStyle(compass).display === 'none'), 'a clear night halves them, and the compass is back');
        weather.stop();
        await sleep(200);
        expect(weather.id === undefined && weather.hollow === 1 && weather.line === '', 'and then it is over');
    }

    // 14h. Sounds that lie: each can be heard, and none of them is anything.
    {
        for (const id of ['steps', 'knock', 'voice']) world.whispers.play(id);
        await sleep(600);
        await quiet();
        expect(world.whispers.heard.steps === 1 && world.whispers.heard.knock === 1 && world.whispers.heard.voice === 1, 'steps, a knock and a voice');
    }

    // 14i. The pool keeps what the farmer carried when they died, and gives it back after dark.
    {
        const { pool, dayCycle } = world;
        world.pockets.add('bread', 2);
        world.bag.add('wood', 3);
        // An earlier death in this run may have left things in the water already.
        const inPool = (id) => pool.kept.find((entry) => entry.itemId === id)?.amount ?? 0;
        const breadBefore = have('bread') + inPool('bread');
        const woodBefore = have('wood') + inPool('wood');
        const day = dayCycle.day;
        world.wakeFromDeath();
        await sleep(400);
        if (world.morning.isOpen) world.morning.close();
        await quiet();
        expect(have('bread') === 0 && have('wood') === 0 && have('axe') === 1, 'dying empties the pockets and the backpack, but not of tools');
        expect(pool.kept.find((entry) => entry.itemId === 'bread')?.amount === breadBefore && pool.kept.find((entry) => entry.itemId === 'wood')?.amount === woodBefore, `the pool has it all: ${JSON.stringify(pool.kept)}`);
        dayCycle.day = day;
        dayCycle.setHour(12);
        await go(pool.reachSpot.x, pool.reachSpot.z);
        await sleep(300);
        expect(/Look into the water/.test(document.querySelector('.prompt')?.textContent ?? ''), `by day the water can only be looked into: ${document.querySelector('.prompt')?.textContent}`);
        await press('KeyE');
        expect(have('bread') === 0, 'and gives nothing');
        dayCycle.setHour(22);
        await sleep(500);
        expect(/Reach into the water/.test(document.querySelector('.prompt')?.textContent ?? ''), `after dark a hand can go in: ${document.querySelector('.prompt')?.textContent}`);
        await press('KeyE');
        await sleep(300);
        await quiet();
        expect(have('bread') === breadBefore && have('wood') === woodBefore && pool.kept.length === 0, `everything comes back: ${have('bread')} bread, ${have('wood')} wood, ${JSON.stringify(pool.kept)}`);
        dayCycle.setHour(10);
    }

    // 14j. The loop: the field has the night too, the can grows, and the plot to be worked is framed.
    {
        const { farm, dayCycle } = world;
        const plot = farm.plots.find((candidate) => candidate.active && !candidate.crop);
        farm.plant(plot, 'turnip', false);
        farm.water(plot);
        dayCycle.setHour(21);
        world.goToBedNow();
        await sleep(500);
        expect(plot.ripe, `a watered turnip planted at 9 in the evening is ripe by morning, stage ${plot.stage}`);
        expect(/ripened in the night/.test(document.querySelector('.panel:not(.is-hidden)')?.textContent ?? document.body.textContent), 'and the morning says so');
        if (world.morning.isOpen) world.morning.close();
        await quiet();
        world.coins.add(500);
        expect(world.upgrades.buy('can') && world.can.left === 10, `a bigger can holds 10 and comes full, got ${world.can.left}`);
        await go(plot.position.x, plot.position.z + 0.2);
        await sleep(300);
        const marker = game.scene.getObjectByName('plot-marker');
        expect(marker.visible && Math.abs(marker.position.x - plot.position.x) < 0.01, 'the plot in reach is framed');
        await go(-58, 54);
        await sleep(300);
        expect(!marker.visible, 'and the frame goes away off the field');
    }

    // 14k. The day's plan, a late call, the basket, the scarecrow and the quarters of the price.
    {
        const { farm, dayCycle, warmth, bike, scarecrows, escape } = world;
        // A late call pays half as much again.
        dayCycle.setHour(22);
        world.villagers.snapToSchedule();
        world.villagers.requests.refill();
        const request = world.villagers.requests.open.find((open) => open.accepted);
        expect(Boolean(request), 'somebody wants something');
        if (request) {
            world.bag.add(request.itemId, request.amount);
            const villager = game.scene.getObjectByName(`villager-${request.from}`);
            await go(villager.position.x + 1.2, villager.position.z + 1.2);
            const before = world.coins.value();
            await talkUntilChoices();
            choices().find((choice) => choice.textContent.includes('Hand over'))?.click();
            await sleep(500);
            for (let index = 0; index < 6 && choices().length === 0; index += 1) {
                await press('Space');
                await sleep(350);
            }
            choices().find((choice) => choice.textContent.includes('Goodbye'))?.click();
            await sleep(400);
            await quiet();
            log.lateCall = [world.coins.value() - before, request.reward];
            expect(world.coins.value() - before >= Math.round(request.reward * 1.5), `a call after dark pays half as much again: ${world.coins.value() - before} for a ${request.reward} request`);
        }
        // The morning says what the day holds.
        world.goToBedNow();
        await sleep(500);
        const morningText = world.morning.isOpen ? document.body.textContent : '';
        expect(/Today/.test(morningText) && /ready to pick|empty/.test(morningText), `the morning lists the day ahead (open: ${world.morning.isOpen})`);
        if (world.morning.isOpen) world.morning.close();
        await quiet();
        // The basket: a ride costs a dish half the heat a walk would.
        dayCycle.setHour(9);
        world.pockets.add('bread', 1);
        warmth.collected('bread', 1);
        await sleep(200);
        const left = warmth.hoursLeft('bread');
        bike.mount();
        await sleep(200);
        dayCycle.advance(0.5);
        await sleep(200);
        dayCycle.advance(0.5);
        await sleep(200);
        bike.dismount();
        const lost = left - warmth.hoursLeft('bread');
        log.basket = Math.round(lost * 100) / 100;
        expect(lost > 0.3 && lost < 0.8, `an hour in the basket costs about half an hour of heat, cost ${lost}`);
        world.pockets.remove('bread', 1);
        // The scarecrow.
        const plot = farm.plots.find((candidate) => candidate.active && candidate.cell.x === 1 && candidate.cell.z === 1 && candidate.field === 0);
        for (const each of farm.plots.filter((candidate) => candidate.active && candidate.field === 0 && !candidate.crop)) farm.plant(each, 'turnip', false);
        farm.newDay();
        if (world.pockets.add('scarecrow', 1) > 0) world.bag.add('scarecrow', 1);
        await go(plot.position.x + 0.3, plot.position.z + 0.3);
        scarecrows.place();
        await sleep(300);
        await quiet();
        expect(scarecrows.count === 1 && have('scarecrow') === 0, `the scarecrow stands in the field: ${scarecrows.count}, carried ${have('scarecrow')}`);
        dayCycle.setHour(21);
        world.goToBedNow();
        await sleep(500);
        const wet = farm.plots.filter((candidate) => candidate.active && candidate.field === 0 && candidate.watered).length;
        log.wept = wet;
        expect(wet >= 8, `by morning the plots round it are wet: ${wet}`);
        if (world.morning.isOpen) world.morning.close();
        await quiet();
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
