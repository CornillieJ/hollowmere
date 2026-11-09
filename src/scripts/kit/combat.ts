import { addPathEnemies as installPathEnemies, type PathEnemiesHandle, type PathEnemyOptions } from '../game/path-enemies';
import { addGridTowers as installGridTowers, type GridTowersHandle, type GridTowerOptions } from '../game/grid-towers';
import { WaveSpawner, type WaveSpawnerOptions } from '../game/spawner';

//#region Path enemies, towers and waves

/**
 * Walkers on a route: a convoy, an escort, a crowd, tower defence enemies.
 * See `game/path-enemies.ts` for the shape of the definitions.
 */
export function addPathEnemies(game: Game, options: PathEnemyOptions): PathEnemiesHandle {
    return installPathEnemies(game, options);
}

/** Towers on a grid that shoot whatever walks past. */
export function addGridTowers(game: Game, options: GridTowerOptions): GridTowersHandle {
    return installGridTowers(game, options);
}

/**
 * Waves of enemies, driven by a `spawn` callback.
 * Returns the spawner so a game can `start`, `skip` or inspect it.
 */
export function addWaves(game: Game, options: WaveSpawnerOptions): WaveSpawner {
    return new WaveSpawner(game, options);
}

//#endregion Path enemies, towers and waves
