import { Minimap, type MinimapOptions } from '../ui/minimap';

//#region Minimap

/**
 * A corner minimap. Hand it what to follow, how the world reads from above
 * (`drawStatic`) and what moves (`markers`), and it stays out of the way.
 *
 * ```ts
 * addMinimap(game, {
 *     follow: () => van.vehicle.position,
 *     heading: () => van.vehicle.yaw,
 *     rotate: true,
 *     markers: () => [
 *         { position: van.vehicle.position, color: '#ffffff', heading: van.vehicle.yaw, size: 5 },
 *         ...(target ? [{ position: target, color: '#ffd166', size: 4 }] : []),
 *     ],
 *     drawStatic: drawRoads,
 * });
 * ```
 */
export function addMinimap(game: Game, options: MinimapOptions = {}): Minimap {
    return new Minimap(game, options);
}

//#endregion Minimap
