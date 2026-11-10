/**
 * The kit: every building block, as one `add...` call.
 *
 * This is the module a game imports. Each function configures an existing piece
 * of the library for a specific purpose and hands back a small handle, so a game
 * reads as a list of installs plus its own rules:
 *
 * ```ts
 * const game = await createGame();
 * const gold = addResource(game, { id: 'gold', label: 'Gold', initial: 120 });
 * const bag = addInventory(game, {
 *     key: 'inventory',              // press I to open
 *     screen: 'modal',
 *     items: ITEMS,
 *     currency: { resource: gold },
 *     persist: 'bag',
 * });
 * const shop = addInventory(game, {
 *     mode: 'shop',
 *     screen: 'modal',
 *     items: ITEMS,
 *     catalogue: ['gun', 'cannon', 'frost'],
 *     currency: { resource: gold },
 * });
 * addToolbar(game, { entries: TOWERS.map(...), onSelect: (id) => shop.open() });
 * ```
 *
 * Nothing here creates a game for you: it installs behaviour into the one you
 * already have, which is what keeps each game's own code small.
 *
 * The installers live one concern per file: `resources`, `inventory`, `combat`,
 * `toolbar`, `placement`, `menus`, `touch`, `platforming`, `progression`,
 * `objectives` and `scene`. This barrel re-exports them so a game can still
 * import everything from `'../kit'`.
 */

export * from './resources';
export * from './inventory';
export * from './combat';
export * from './toolbar';
export * from './placement';
export * from './menus';
export * from './touch';
export * from './platforming';
export * from './progression';
export * from './objectives';
export * from './scene';
export * from './characters';
export * from './vehicle';
export * from './minimap';
export * from './look';
export * from './hotbar';
export * from './mount';
export * from './villagers';
export * from './safety';
export * from './barriers';
export * from './livestock';
export * from './terrain';
export * from './panel';
export * from './crafting';
export * from './upgrades';
export * from './story';
export * from './nodes';
export * from './population';
export * from './saves';
export * from './settings';
export * from './ground';
export * from './compass';
export * from './feedback';
