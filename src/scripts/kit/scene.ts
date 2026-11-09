import { setupSceneDefaults, type SceneDefaultsOptions } from '../setup/setup-scene';

//#region Scene

/** Scene defaults in one call: lights, sky, fog and ground with physics. */
export function addScene(game: Game, options: SceneDefaultsOptions = {}): ReturnType<typeof setupSceneDefaults> {
    return setupSceneDefaults(game.scene, game.renderer, game.physics, options);
}

//#endregion Scene
