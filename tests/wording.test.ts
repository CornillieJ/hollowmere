import assert from 'node:assert/strict';

import { ITEMS } from '../src/scripts/content/items';
import { forThumbs } from '../src/scripts/game/wording';

const KEYS = /\b(WASD|Shift|Tab)\b|\b([Pp]ress|[Hh]old|with) [EFJ]\b/;

for (const item of ITEMS) {
    const line = forThumbs(item.description ?? '');
    assert.ok(!KEYS.test(line), `${item.id} still names a key on a phone: ${line}`);
}

assert.equal(forThumbs('Press E at a tree, or hold E and walk.'), 'Tap ✋ at a tree, or hold ✋ and walk.');
assert.equal(forThumbs('Walk with WASD, look with the mouse. Hold Shift to run.'), 'Walk with the stick on the left, drag the screen to look, hold ≫ to run.');
assert.equal(forThumbs('Nothing to press here.'), 'Nothing to press here.');
