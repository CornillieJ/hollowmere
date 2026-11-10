import { Terrain, type TerrainOptions } from '../setup/terrain';

//#region Terrain

/**
 * Hills instead of a flat plane: mesh, collider and height lookup in one call.
 * Pass `scene: { groundSize: 0 }` to the template so the flat ground stays out.
 */
export function addTerrain(game: Game, options: TerrainOptions): Terrain {
    return new Terrain(game.scene, game.physics, options);
}

export type { Terrain, TerrainFlat, TerrainOptions } from '../setup/terrain';

//#endregion Terrain
