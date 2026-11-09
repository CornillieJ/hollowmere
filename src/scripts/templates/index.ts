/**
 * Game templates.
 *
 * Each one is a complete game: call `createXGame()` and you are playing, or
 * `setupXGame(game, options)` when you want to compose your own boot sequence
 * or combine two templates in one scene.
 *
 * The five styles this suite was built to cover:
 *  - `createDeliveryGame`  cozy courier runs, in the spirit of Easy Delivery Co.
 *  - `createBoardGame`     clickable grids and turns, the basis for 3D chess
 *  - `createTronGame`      light cycles with lethal ribbons, third person Tron
 *  - `createFarmGame`      crops, a day cycle and a shop, Harvest Moon style
 *  - `createPortalGame`    physics puzzles across linked portals, Portal style
 *  - `createTowerDefense`  build along a route, waves, money and lives
 *
 * Plus the general purpose ones: first person, third person, top-down, twin
 * stick and wave survival arenas.
 */

//#region Shared building blocks
export {
    setupActionGame,
    buildArena,
    spawnEnemy,
    refreshInventoryHud,
    createAndStart,
    type ActionGameOptions,
    type ActionGameWorld,
    type ArenaOptions,
    type ActionControls,
} from './action-game';
//#endregion Shared building blocks

//#region Character games
export { setupFirstPersonGame, createFirstPersonGame, isLookingAt, type FirstPersonGameOptions, type FirstPersonWorld } from './first-person-game';
export { setupThirdPersonGame, createThirdPersonGame, aimDirection, type ThirdPersonGameOptions, type ThirdPersonWorld } from './third-person-game';
export { setupTopDownGame, createTopDownGame, mouseWorldPoint, mouseDirection, type TopDownGameOptions, type TopDownWorld } from './top-down-game';
export { setupTwinStickGame, createTwinStickGame, type TwinStickGameOptions, type TwinStickWorld } from './twin-stick-game';
export { setupArenaShooter, createArenaShooter, type ArenaShooterOptions, type ArenaShooterWorld, type ArenaView } from './arena-shooter';
//#endregion Character games

//#region Genre templates
export { setupBoardGame, createBoardGame, rayCells, knightCells, kingCells, BOARD_MOVE_LIMIT, type BoardGameOptions, type BoardGameWorld } from './board-game';
export { setupPortalGame, createPortalGame, buildChamber, type PortalGameOptions, type PortalWorld } from './portal';
export { setupFarmGame, createFarmGame, CROP_PRICES, type FarmGameOptions, type FarmWorld } from './farm';
export { setupTronGame, createTronGame, addRival, type TronGameOptions, type TronWorld } from './tron';
export { setupDeliveryGame, createDeliveryGame, type DeliveryGameOptions, type DeliveryWorld } from './delivery-game';
export {
    setupTowerDefense,
    createTowerDefense,
    buildGround,
    SELL_REFUND,
    TOWER_DEFENSE_CONTROLS,
    type TowerDefenseOptions,
    type TowerDefenseWorld,
    type TowerDefinition,
    type Tower,
    type WaveConfig,
} from './tower-defense';
//#endregion Genre templates
