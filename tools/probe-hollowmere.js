// Hollowmere probe: plays the first day with real key presses, then the rest of the loop.
//   node tools/smoke.mjs http://localhost:5260/ tools/probe-hollowmere.js
(async () => {
    const game = window.__game;
    const world = game.world;
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const failures = [];
    const expect = (condition, message) => condition || failures.push(message);
    const press = async (code, hold = 60) => {
        window.dispatchEvent(new KeyboardEvent('keydown', { code, key: code.replace('Key', '').toLowerCase(), bubbles: true }));
        await sleep(hold);
        window.dispatchEvent(new KeyboardEvent('keyup', { code, key: code.replace('Key', '').toLowerCase(), bubbles: true }));
        await sleep(120);
    };
    const go = async (x, z) => {
        game.player.body.teleport({ x, y: world.terrain.heightAt(x, z) + 0.2, z });
        await sleep(250);
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
    await sleep(500);
    expect(game.state.current === 'playing', `playing, got ${game.state.current}`);
    expect(step() === 'wake', `the story starts at waking, got ${step()}`);
    await sleep(600);
    expect(!document.querySelector('.subtitles').classList.contains('is-hidden'), 'the farmer thinks aloud at the start');

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
    await sleep(300);
    expect(step() === 'chop', `the story moved on to chopping, got ${step()}`);

    // 2. Chop a tree at the yard's edge.
    const tree = world.nodes.nodes[0];
    await go(tree.object.position.x + 1.2, tree.object.position.z);
    hold('watering-can');
    await press('KeyE');
    expect(!tree.depleted && tree.hitsLeft === 4, 'a tree ignores anything but the axe');
    hold('axe');
    for (let swing = 0; swing < 4; swing += 1) await press('KeyE');
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
    await go(47.2, -34.8);
    log.villageHeight = +game.player.position.y.toFixed(1);
    expect(Math.abs(log.villageHeight - 4) < 0.3, `the village stands 4 m up, player at ${log.villageHeight}`);
    await sleep(300);
    expect(step() === 'meet', `the story wants the shopkeeper, got ${step()}`);
    const choices = () => [...document.querySelectorAll('.dialogue-choice')];
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
        expect(!world.villagers.dialogue.isOpen, 'the conversation closed');
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
    expect(world.saves.save(), 'the game saves');
    const saved = { coins: world.coins.value(), wood: have('wood'), tier: world.cookpot.station.tier };
    world.coins.set(1);
    world.cookpot.station.tier = 1;
    world.farm.setActiveFields(1);
    world.nodes.restore();
    game.save.load('hollowmere');
    expect(world.coins.value() === saved.coins, 'coins come back from the save');
    expect(world.cookpot.station.tier === saved.tier, 'the pot comes back from the save');
    expect(world.farm.activeFields === 2, 'bought land comes back from the save');
    expect(world.nodes.nodes[0].depleted, 'the felled tree is still felled after a load');
    expect(step() === 'sleep', 'the story resumes at the same step');

    // 13. Settings apply and stick.
    world.settings.set('vhs', false);
    world.settings.set('look', 0.5);
    expect(world.settings.get('vhs') === false, 'the VHS filter can be turned off');
    expect(Math.abs(world.controls.look.sensitivity - 0.0006) < 1e-9, 'sensitivity follows the setting');
    expect(JSON.parse(localStorage.getItem('hollowmere:settings')).vhs === false, 'settings are remembered');
    world.settings.set('vhs', true);

    // 14. Outside, it comes for you, and fainting wakes you at home on a new day.
    const day = world.dayCycle.day;
    await go(80, -80);
    world.enemies.spawn({ position: at(81, -80), health: 1e9, speed: 0, aggroRange: 30, damage: 200, attackCooldown: 0.2, color: 0x444444 });
    for (let index = 0; index < 40 && !game.player.isDead; index += 1) await sleep(100);
    expect(game.player.isDead, 'the Hollow can hurt you');
    for (let index = 0; index < 60 && game.player.isDead; index += 1) await sleep(100);
    await sleep(300);
    log.wokeAt = game.player.position.toArray().map((value) => +value.toFixed(0));
    expect(Math.hypot(game.player.position.x + 58, game.player.position.z - 54) < 4, 'woke up at home');
    expect(world.dayCycle.day === day + 1, `a new day began, day ${world.dayCycle.day}`);
    expect(world.story.finished, 'sleeping finished the first day of the story');

    // 15. Back at the title screen there is a save to continue.
    world.flow.quit();
    await sleep(300);
    const continueButton = [...document.querySelectorAll('.menu:not(.is-hidden) .menu-button')].find((button) => button.textContent.startsWith('Continue'));
    log.continueLabel = continueButton?.textContent;
    expect(Boolean(continueButton) && !continueButton.classList.contains('is-hidden'), 'the title screen offers Continue');

    return { ok: failures.length === 0, failures, log, state: game.state.current };
})();
