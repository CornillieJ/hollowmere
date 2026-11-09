/**
 * Keep the 3D view centred in the part of the screen that UI does not cover.
 *
 * A side panel over the canvas would otherwise hide half the board, and moving
 * the camera target to compensate breaks the moment the camera orbits. A view
 * offset shifts the projection itself, so orbiting, zooming and picking all stay
 * correct.
 */
export type ViewInset = { left?: number; right?: number; top?: number; bottom?: number };

/**
 * Reserve screen space for UI. Pass a function to recompute on every resize,
 * e.g. a panel on the right on desktop and along the bottom on a phone.
 * Returns a function that removes the inset again.
 */
export function setViewInset(game: Game, inset: ViewInset | ((width: number, height: number) => ViewInset)): () => void {
    const apply = (): void => {
        const width = game.sizes.width;
        const height = game.sizes.height;
        const value = typeof inset === 'function' ? inset(width, height) : inset;
        const shiftX = ((value.right ?? 0) - (value.left ?? 0)) / 2;
        const shiftY = ((value.bottom ?? 0) - (value.top ?? 0)) / 2;
        game.camera.setViewOffset(width, height, shiftX, shiftY, width, height);
    };
    apply();
    window.addEventListener('resize', apply);
    return () => {
        window.removeEventListener('resize', apply);
        game.camera.clearViewOffset();
    };
}
