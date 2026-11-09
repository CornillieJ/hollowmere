import { Objectives, type ObjectiveOptions } from '../game/objectives';

//#region Objectives

/** Objectives, with the HUD line and the level:complete event wired up. */
export function addObjectives(game: Game): Objectives {
    // The hub already made one during boot; this is the documented entry point.
    return game.objectives;
}

/** Add an objective in one call. */
export function addObjective(game: Game, id: string, text: string, options: ObjectiveOptions = {}): void {
    game.objectives.add(id, text, options);
}

/** Mark an objective done, so a game reads `completeObjective(game, 'find-axe')`. */
export function completeObjective(game: Game, id: string): void {
    game.objectives.complete(id);
}

//#endregion Objectives
