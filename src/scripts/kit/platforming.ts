import { PlatformerController, type PlatformerOptions } from '../controls/platformer';
import { addMovingPlatforms as installMovingPlatforms, type MovingPlatformsHandle, type MovingPlatformsOptions } from '../game/moving-platforms';
import { addCheckpoints as installCheckpoints, type CheckpointsHandle, type CheckpointOptions } from '../game/checkpoints';
import { addHazards as installHazards, type HazardOptions, type HazardsHandle } from '../game/hazards';
import type { CharacterBody } from '../physics/character';

//#region Platforming

/**
 * Platformer controls: run, jump, coyote time, jump buffering, variable height.
 * Returns the controller, which also owns the follow camera.
 */
export function addPlatformerControls(game: Game, body: CharacterBody, options: PlatformerOptions = {}): PlatformerController {
    return new PlatformerController(game, body, options);
}

/** Moving platforms that carry whoever stands on them. */
export function addMovingPlatforms(game: Game, options: MovingPlatformsOptions = {}): MovingPlatformsHandle {
    return installMovingPlatforms(game, options);
}

/** Checkpoints that remember the last safe spot and light up when reached. */
export function addCheckpoints(game: Game, options: CheckpointOptions): CheckpointsHandle {
    return installCheckpoints(game, options);
}

/** Lava, spikes, water and laser grids. */
export function addHazards(game: Game, options: HazardOptions): HazardsHandle {
    return installHazards(game, options);
}

//#endregion Platforming
