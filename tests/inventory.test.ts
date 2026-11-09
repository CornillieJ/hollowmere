import assert from 'node:assert/strict';

import { Inventory } from '../src/scripts/game/inventory';
import { ItemRegistry, type ItemDefinition } from '../src/scripts/game/items';

/**
 * The inventory state machine, without a browser.
 *
 * Items, costs, uses, gates and the shop are all pure logic, which is exactly
 * what this Node test path is for. The screen is verified separately in
 * `tools/probe-inventory.js`.
 */

const ITEMS: ItemDefinition[] = [
    { id: 'bread', name: 'Bread', category: 'consumable', price: 6, maxStack: 5, use: { onUse: () => undefined } },
    { id: 'healing-draught', name: 'Draught', category: 'consumable', price: 20, use: { cooldown: 2, canUse: ({ count }) => (count > 0 ? true : 'none left') } },
    { id: 'axe', name: 'Axe', category: 'tool', price: 80, maxStack: 1, requires: { level: 2 } },
    { id: 'key', name: 'Rusty key', category: 'quest', hidden: true },
    { id: 'blueprint', name: 'Blueprint', category: 'material', price: 60, requires: { unlocks: ['workshop'] } },
    { id: 'bomb', name: 'Bomb', category: 'consumable', price: 40, requires: { items: [{ id: 'bread', amount: 1 }] } },
];

const registry = new ItemRegistry(ITEMS);

//#region Adding and stacking

{
    const bag = new Inventory({ registry, capacity: 3 });
    assert.equal(bag.add('bread', 3), 0, 'everything fits');
    assert.equal(bag.count('bread'), 3);
    // Three are already carried and the stack holds five, so two fit and three
    // are handed back.
    assert.equal(bag.add('bread', 5), 3, 'only the remaining stack space is accepted');
    assert.equal(bag.count('bread'), 5, 'and stops at the stack limit');

    assert.equal(bag.add('axe', 1), 0);
    assert.equal(bag.add('key', 1), 0);
    assert.equal(bag.isFull, true, 'three distinct stacks fill a three slot bag');
    assert.equal(bag.add('blueprint', 1), 1, 'a new item does not fit in a full bag');

    assert.equal(bag.has('bread', 5), true);
    assert.equal(bag.remove('bread', 2), true);
    assert.equal(bag.count('bread'), 3);
    assert.equal(bag.remove('bread', 9), false, 'cannot remove more than is carried');
}

//#endregion Adding and stacking

//#region Using

{
    const bag = new Inventory({ registry });
    const uses: string[] = [];
    registry.get('bread')!.use!.onUse = ({ item, inventory }) => {
        uses.push(`${item.id} x${inventory.count(item.id)}`);
    };

    bag.add('bread', 2);
    assert.equal(bag.use('bread'), true, 'a consumable can be used');
    assert.deepEqual(uses, ['bread x2'], 'the handler sees the count before consumption');
    assert.equal(bag.count('bread'), 1, 'and the item is consumed');

    assert.equal(bag.use('bread'), true);
    assert.equal(bag.count('bread'), 0);
    assert.equal(bag.use('bread'), false, 'using what you do not have fails');
    assert.equal(bag.useBlockedReason('bread'), 'No Bread');

    // Cooldowns block a second use.
    bag.add('healing-draught', 2);
    assert.equal(bag.use('healing-draught'), true);
    assert.equal(bag.canUse('healing-draught'), false, 'the cooldown blocks it');
    assert.ok((bag.cooldownLeft('healing-draught') ?? 0) > 0, 'and reports time left');
    bag.update(3);
    assert.equal(bag.canUse('healing-draught'), true, 'the cooldown expires');

    // Tools are not consumed by default.
    bag.add('axe', 1);
    assert.equal(bag.isUnlocked('axe'), false, 'the axe needs level 2');
    assert.equal(bag.useBlockedReason('axe'), 'Axe is locked');
    bag.progressionLevel = 2;
    assert.equal(bag.isUnlocked('axe'), true);
}

//#endregion Using

//#region Costs and currency

{
    let gold = 100;
    const bag = new Inventory({
        registry,
        currency: {
            id: 'gold',
            get: () => gold,
            spend: (amount) => {
                if (gold < amount) return false;
                gold -= amount;
                return true;
            },
            earn: (amount) => {
                gold += amount;
            },
        },
    });

    assert.equal(bag.currencyBalance(), 100);
    assert.equal(bag.canAfford([{ id: 'gold', amount: 60 }, { id: 'bread', amount: 1 }]), false, 'the bread is missing');
    bag.add('bread', 1);
    assert.equal(bag.canAfford([{ id: 'gold', amount: 60 }, { id: 'bread', amount: 1 }]), true);

    assert.equal(bag.spend([{ id: 'gold', amount: 60 }, { id: 'bread', amount: 1 }]), true);
    assert.equal(gold, 40, 'the gold was taken');
    assert.equal(bag.count('bread'), 0, 'and the bread too');

    assert.equal(bag.spend([{ id: 'gold', amount: 999 }]), false, 'a cost you cannot pay changes nothing');
    assert.equal(gold, 40);

    // Shop: buy and sell.
    assert.equal(bag.buy('bread', 2), true, 'buy two bread for 12');
    assert.equal(gold, 28);
    assert.equal(bag.count('bread'), 2);
    assert.equal(bag.sell('bread', 1), true, 'sell one back for half price');
    assert.equal(gold, 31, 'six bread sells for three');
    assert.equal(bag.sellPrice('bread'), 3);
    assert.equal(bag.buyPrice('bread'), 6);

    // A locked item cannot be bought even with the money.
    gold = 500;
    assert.equal(bag.buy('axe', 1), false, 'the axe needs level 2');
    bag.progressionLevel = 2;
    assert.equal(bag.buy('axe', 1), true);
    assert.equal(gold, 420);
}

//#endregion Costs and currency

//#region Gates

{
    const bag = new Inventory({ registry });
    assert.equal(bag.isUnlocked('blueprint'), false, 'the blueprint needs an unlock');
    assert.equal(bag.lockedReason('blueprint'), 'Needs workshop');
    bag.unlock('workshop');
    assert.equal(bag.isUnlocked('blueprint'), true);

    assert.equal(bag.isUnlocked('bomb'), false, 'the bomb recipe needs an item');
    assert.equal(bag.lockedReason('bomb'), 'Needs 1 Bread');
    bag.add('bread', 1);
    assert.equal(bag.isUnlocked('bomb'), true);
}

//#endregion Gates

//#region Persistence

{
    const bag = new Inventory({ registry });
    bag.add('bread', 4);
    bag.unlock('workshop');
    bag.progressionLevel = 3;

    const data = bag.toJSON();
    const restored = new Inventory({ registry });
    restored.fromJSON(data);
    assert.equal(restored.count('bread'), 4, 'counts survive a save');
    assert.equal(restored.isUnlockedFlag('workshop'), true, 'unlocks survive a save');

    // Loading accepts exactly what `add` accepts: an item without a definition
    // (a coin picked up in the platformer) must not vanish across a save.
    restored.fromJSON({ slots: [{ id: 'ghost-item', amount: 9 }] });
    assert.equal(restored.count('ghost-item'), 9);
    assert.equal(restored.used, 1);
}

//#endregion Persistence
