import assert from 'node:assert/strict';

/**
 * Progression maths.
 *
 * Levels and XP are pure logic, so they belong here next to the other logic
 * tests. The installers themselves are verified in the browser probe.
 */

/** The default curve from `addProgression`, repeated so it can be asserted. */
const xpForLevel = (level: number): number => 50 + (level - 1) * 40;

let level = 1;
let xp = 0;
const levelUps: number[] = [];

function addXp(amount: number, maxLevel = Infinity): void {
    xp += amount;
    while (level < maxLevel && xp >= xpForLevel(level)) {
        xp -= xpForLevel(level);
        level += 1;
        levelUps.push(level);
    }
}

assert.equal(xpForLevel(1), 50);
assert.equal(xpForLevel(2), 90, 'each level costs forty more');

addXp(49);
assert.equal(level, 1, 'not quite there');
assert.equal(xp, 49);

addXp(1);
assert.equal(level, 2, 'a level up at the threshold');
assert.equal(xp, 0, 'and the surplus carries over exactly');

// A big grant can cross several levels and keeps the remainder. From level 2 the
// costs are 90, 130 and 170, so 280 XP buys two levels and leaves 60.
addXp(280);
assert.deepEqual(levelUps, [2, 3, 4], 'two level ups in one grant');
assert.equal(level, 4);
assert.equal(xp, 60, 'the leftover XP is kept');

// The cap stops at the ceiling and keeps the XP.
level = 1;
xp = 0;
levelUps.length = 0;
addXp(10_000, 3);
assert.equal(level, 3, 'the level cap holds');
assert.ok(xp > 0, 'unspent XP stays banked at the cap');
