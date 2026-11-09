import assert from 'node:assert/strict';

import { Pool } from '../src/scripts/helpers/pool';

{
    // Warm items come back before anything new is created.
    const pool = new Pool(() => ({ value: 0 }), (item) => { item.value = 0; }, 2);
    assert.equal(pool.size, 2);
    assert.equal(pool.available, 2);

    const a = pool.acquire();
    const b = pool.acquire();
    assert.equal(pool.available, 0);

    // Empty pool creates, and remembers.
    const c = pool.acquire();
    assert.equal(pool.size, 3);

    // A dirty item comes back clean: the reset runs on release.
    c.value = 5;
    pool.release(c);
    const reused = pool.acquire();
    assert.equal(reused, c);
    assert.equal(reused.value, 0);

    pool.release(a);
    pool.release(b);
    pool.release(reused);
    assert.equal(pool.available, 3);

    // use() gives the item back even when the callback throws.
    const before = pool.available;
    const threw = (() => {
        try {
            pool.use(() => {
                throw new Error('boom');
            });
        } catch {
            return true;
        }
        return false;
    })();
    assert.equal(threw, true);
    assert.equal(pool.available, before);

    void a;
    void b;
}

console.log('pool tests passed');
