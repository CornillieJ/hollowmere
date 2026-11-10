import assert from 'node:assert/strict';

import { CraftingStation, type Recipe } from '../src/scripts/game/crafting';
import { Upgrades } from '../src/scripts/game/upgrades';
import { Storyline } from '../src/scripts/game/storyline';
import { RequestBoard } from '../src/scripts/game/requests';
import { createNoise2D, fbm } from '../src/scripts/helpers/noise';

/**
 * The pure logic behind the homestead blocks: crafting, upgrades, the guided
 * storyline, tiered requests and noise. The kit installers around them are
 * exercised in the browser by a game's probe.
 */

/** A bag that is just counts, which is all these classes ask of an inventory. */
function bag(contents: Record<string, number>) {
    return {
        contents,
        count: (id: string): number => contents[id] ?? 0,
        remove: (id: string, amount: number): boolean => {
            if ((contents[id] ?? 0) < amount) return false;
            contents[id] = (contents[id] ?? 0) - amount;
            return true;
        },
    };
}

//#region Crafting

const RECIPES: Recipe[] = [
    { id: 'soup', output: { itemId: 'soup' }, ingredients: [{ itemId: 'turnip', amount: 2 }, { itemId: 'wood', amount: 1 }], seconds: 10 },
    { id: 'pie', output: { itemId: 'pie', amount: 2 }, ingredients: [{ itemId: 'pumpkin', amount: 1 }], seconds: 5, tier: 2 },
];

const station = new CraftingStation({ recipes: RECIPES });
const pockets = bag({ turnip: 1, wood: 1 });
const pack = bag({ turnip: 3, pumpkin: 1 });

assert.deepEqual(station.missing(RECIPES[0] as Recipe, [pockets]), [{ itemId: 'turnip', amount: 1 }], 'one turnip short from the pockets alone');
assert.equal(station.start('pie', [pockets, pack]), false, 'a tier 2 recipe is locked on a tier 1 station');
assert.equal(station.start('soup', [pockets, pack]), true, 'ingredients are summed over every source');
assert.equal(pockets.contents.turnip, 0, 'the first source is emptied first');
assert.equal(pack.contents.turnip, 2, 'and the rest comes from the next');
assert.equal(station.start('soup', [pockets, pack]), false, 'one job at a time');

assert.equal(station.update(4), undefined);
assert.ok(Math.abs(station.progress - 0.4) < 1e-9);
assert.equal(station.update(6)?.id, 'soup', 'the step that finishes reports the recipe');
assert.deepEqual(station.ready, [{ itemId: 'soup', amount: 1 }]);

assert.deepEqual(station.collect(() => 1), [], 'nothing is taken when nothing fits');
assert.equal(station.ready.length, 1, 'and it stays on the station');
assert.deepEqual(station.collect(() => 0), [{ itemId: 'soup', amount: 1 }]);

station.tier = 2;
assert.equal(station.start('pie', [pack]), true);
const restored = new CraftingStation({ recipes: RECIPES });
restored.fromJSON(JSON.parse(JSON.stringify(station.toJSON())));
assert.equal(restored.tier, 2);
assert.equal(restored.job?.recipe.id, 'pie', 'a job survives a save');

//#endregion Crafting

//#region Upgrades

const applied: Record<string, number> = {};
const upgrades = new Upgrades([
    { id: 'field', name: 'More land', levels: [{ cost: 100 }, { cost: 250 }], apply: (level) => (applied.field = level) },
    { id: 'silo', name: 'Silo', levels: [{ cost: 50 }], requires: { id: 'field', level: 2 } },
]);
let money = 300;
const pay = (cost: number): boolean => {
    if (money < cost) return false;
    money -= cost;
    return true;
};

assert.equal(upgrades.visible('silo'), false, 'hidden until its requirement is met');
assert.equal(upgrades.buy('silo', pay), false);
assert.equal(upgrades.buy('field', pay), true);
assert.equal(applied.field, 1);
assert.equal(upgrades.buy('field', pay), false, 'not enough money for the second level');
assert.equal(money, 200, 'a refused purchase costs nothing');
money += 100;
assert.equal(upgrades.buy('field', pay), true);
assert.equal(upgrades.maxed('field'), true);
assert.equal(upgrades.buy('field', pay), false, 'nothing left to buy');
assert.equal(upgrades.visible('silo'), true);

const reloaded = new Upgrades(upgrades.definitions);
reloaded.fromJSON({ field: 1 });
assert.equal(applied.field, 1, 'loading re-applies each level, also downwards');

//#endregion Upgrades

//#region Storyline

let planted = 0;
const events: string[] = [];
const story = new Storyline([
    { id: 'plant', objective: 'Plant 3', done: () => planted >= 3, progress: () => `${planted}/3` },
    { id: 'sleep', objective: 'Sleep', done: () => false, reward: () => events.push('reward') },
]);
story.onEvent((event) => events.push(`${event.type}:${event.step?.id ?? '-'}`));

story.update();
assert.equal(story.summary, 'Plant 3 (0/3)');
planted = 3;
story.update();
assert.equal(story.current?.id, 'sleep');
story.update();
story.complete();
assert.deepEqual(events, ['started:plant', 'completed:plant', 'started:sleep', 'reward', 'completed:sleep', 'finished:-']);
assert.equal(story.finished, true);
assert.equal(story.summary, '');

const resumed = new Storyline(story.steps);
resumed.fromJSON({ step: 'sleep' });
assert.equal(resumed.current?.id, 'sleep');
resumed.fromJSON({ step: null });
assert.equal(resumed.finished, true, 'a finished story stays finished after a load');

//#endregion Storyline

//#region Tiered requests

let roll = 0;
const board = new RequestBoard({
    templates: [
        { itemId: 'turnip', amount: 1, pricePerItem: 10 },
        { itemId: 'soup', amount: 1, pricePerItem: 40, tier: 1 },
    ],
    people: ['ann', 'bo', 'cy'],
    maxOpen: 1,
    deliveriesPerTier: 2,
    day: () => 1,
    random: () => {
        roll = (roll + 0.37) % 1;
        return roll;
    },
});

for (let delivery = 0; delivery < 2; delivery += 1) {
    board.refill();
    assert.equal(board.open[0]?.itemId, 'turnip', 'only tier 0 is asked for at the start');
    assert.ok(board.fulfil(board.open[0]!, bag({ turnip: 5 })));
}
assert.equal(board.tier, 1, 'two deliveries unlock the next tier');
const seen = new Set<string>();
for (let round = 0; round < 12; round += 1) {
    board.refill();
    seen.add(board.open[0]!.itemId);
    board.open.length = 0;
}
assert.ok(seen.has('soup'), 'the harder request now turns up');

// A job with a deposit is only on offer until the money is down.
const jobs = new RequestBoard({ templates: [{ itemId: 'pie', amount: 1, pricePerItem: 300, deposit: 0.33 }], people: ['ann'], maxOpen: 1, day: () => 1 });
jobs.refill();
const job = jobs.open[0]!;
assert.equal(job.deposit, 99, 'the deposit is a share of the pay');
assert.equal(job.accepted, false);
assert.equal(jobs.canFulfil(job, bag({ pie: 1 })), false, 'it cannot be handed in before it is taken');
assert.equal(jobs.accept(job, () => false), false, 'no money, no job');
assert.equal(jobs.accept(job, (amount) => amount === 99), true);
assert.ok(jobs.fulfil(job, bag({ pie: 1 })));

//#endregion Tiered requests

//#region Noise

const noise = createNoise2D(7);
assert.equal(noise(1.5, 2.25), createNoise2D(7)(1.5, 2.25), 'the same seed gives the same field');
assert.notEqual(noise(1.5, 2.25), createNoise2D(8)(1.5, 2.25));
for (let index = 0; index < 200; index += 1) {
    const value = fbm(noise, index * 0.37, index * 0.11);
    assert.ok(value >= -1 && value <= 1, 'fbm stays in range');
}
assert.ok(Math.abs(noise(3, 4) - noise(3.001, 4)) < 0.01, 'neighbouring points are close: the noise is smooth');

//#endregion Noise

console.log('homestead blocks ok');
