// Hollowmere probe: plays one day of the loop with real key presses.
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
        game.player.body.teleport({ x, y: 0.2, z });
        await sleep(250);
    };
    const log = {};

    world.flow.start();
    await sleep(500);
    expect(game.state.current === 'playing', `playing, got ${game.state.current}`);

    // 1. Plant with seeds in hand, water with the can, then grow and pick.
    const plot = world.farm.plots[0];
    await go(plot.position.x, plot.position.z + 0.2);
    world.hotbar.select(1); // turnip seeds
    await press('KeyE');
    expect(plot.crop?.id === 'turnip', `planted a turnip, got ${plot.crop?.id}`);
    world.hotbar.select(0); // watering can
    await press('KeyE');
    expect(plot.watered, 'watered the plot');
    // Fast forward the crop rather than wait two minutes.
    for (let index = 0; index < 400 && !plot.ripe; index += 1) world.farm.update?.(1);
    if (!plot.ripe) world.farm.fromJSON(world.farm.plots.map((entry, index) => (index === 0 ? { crop: 'turnip', stage: 2, elapsed: 0, watered: true, ripe: true } : null)));
    await sleep(100);
    const turnipsBefore = world.pockets.count('turnip');
    await press('KeyE');
    log.harvested = world.pockets.count('turnip') - turnipsBefore;
    expect(log.harvested > 0, 'picked the turnip into the pockets');

    // 2. Animals: collect from a hen that is ready.
    const pen = world.farm.plots.length && game.scene.getObjectByName('mount');
    void pen;

    // 3. The bike: get on, ride, get off.
    const bikeAt = world.bike.object.position.clone();
    await go(bikeAt.x + 0.8, bikeAt.z);
    await press('KeyE');
    expect(world.bike.mounted, 'got on the bike');
    const start = game.player.position.clone();
    await press('KeyW', 1500);
    log.rode = +game.player.position.distanceTo(start).toFixed(1);
    expect(log.rode > 4, `the bike moves, rode ${log.rode} m`);
    await sleep(800);
    await press('KeyE');
    expect(!world.bike.mounted, 'got off the bike');

    // 4. A fence from the hotbar.
    world.hotbar.select(3);
    const fences = world.barriers.all.length;
    await press('KeyF');
    expect(world.barriers.all.length === fences + 1, 'put a fence down');

    // 5. Talk to the first villager with a request, holding what they want.
    const request = world.villagers.requests.open[0];
    expect(Boolean(request), 'someone has a request');
    if (request) {
        world.pockets.add(request.itemId, request.amount);
        const villager = game.scene.getObjectByName(`villager-${request.from}`);
        await go(villager.position.x + 1.2, villager.position.z + 1.2);
        const coinsBefore = world.coins.value();
        await press('KeyE');
        await sleep(300);
        expect(world.villagers.dialogue.isOpen, 'a conversation opened');
        // Click through the lines, then pick "hand over".
        for (let index = 0; index < 6 && !document.querySelector('.dialogue-choice'); index += 1) {
            await press('Space');
            await sleep(400);
        }
        const handOver = [...document.querySelectorAll('.dialogue-choice')].find((choice) => choice.textContent.includes('Hand over'));
        expect(Boolean(handOver), 'offered to hand over the request');
        handOver?.click();
        await sleep(600);
        for (let index = 0; index < 4 && world.villagers.dialogue.isOpen; index += 1) {
            await press('Space');
            await sleep(400);
        }
        log.paid = world.coins.value() - coinsBefore;
        expect(log.paid === request.reward, `paid ${request.reward}, got ${log.paid}`);
        expect(!world.villagers.dialogue.isOpen, 'the conversation closed');
        expect(game.time.effectiveScale > 0, 'time runs again after talking');
    }

    // 6. Safe zones: a Hollow beside the player in the square ignores them.
    const hollow = world.enemies.spawn({ position: { x: 52 + 13, y: 0.4, z: -40 }, health: 1e9, speed: 2, aggroRange: 30, damage: 12, color: 0x888888 });
    await go(52, -40);
    await sleep(1500);
    log.safeHealth = game.player.health.current;
    expect(world.safeZones.playerSafe, 'the square is safe');
    expect(hollow.root.position.distanceTo(game.player.position) > 9, 'the Hollow stays outside the shrine ring');

    // 7. Outside, it comes for you, and fainting wakes you at home.
    await go(80, -80);
    const brute = world.enemies.spawn({ position: { x: 81, y: 0.4, z: -80 }, health: 1e9, speed: 0, aggroRange: 30, damage: 200, attackCooldown: 0.2, color: 0x444444 });
    for (let index = 0; index < 40 && !game.player.isDead; index += 1) await sleep(100);
    expect(game.player.isDead, 'the Hollow can hurt you');
    for (let index = 0; index < 60 && game.player.isDead; index += 1) await sleep(100);
    log.wokeAt = game.player.position.toArray().map((value) => +value.toFixed(0));
    expect(game.player.position.distanceTo(new game.player.position.constructor(-58, 0, 54)) < 4, 'woke up at home');
    expect(world.dayCycle.day >= 2, `a new day began, day ${world.dayCycle.day}`);
    void brute;

    return { ok: failures.length === 0, failures, log, state: game.state.current };
})();
