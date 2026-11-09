import { TouchControls, type TouchControlsOptions } from '../ui/touch-controls';

//#region Touch controls

/**
 * On-screen joystick and buttons for phones, wired into `input.touch` so the
 * control schemes never learn that a finger is involved.
 */
export function addTouchControls(game: Game, options: TouchControlsOptions = {}): TouchControls {
    const parent = game.screens.layer(options.screen ?? 'hud');
    return new TouchControls(parent, game.input.touch, options);
}

//#endregion Touch controls
