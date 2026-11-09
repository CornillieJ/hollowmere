import { div } from '../helpers/dom';
import { roundTo } from '../helpers/math';

/**
 * Developer overlay: frame stats, physics counts and free-form values.
 *
 * Toggle with `game.debug.toggle()`. Renderer stats come from three.js and the
 * body count from the Rapier world, so both stay honest without extra
 * bookkeeping. Gameplay code adds its own rows with `log(key, value)`.
 */
export class DebugOverlay {
    readonly root: HTMLElement;

    /** Rows contributed by gameplay code. */
    private readonly custom = new Map<string, string>();
    private visible = false;
    private physicsVisible = false;
    private accumulator = 0;
    private frames = 0;
    private fps = 0;
    private readonly onTogglePhysics: (visible: boolean) => void;

    /**
     * @param onTogglePhysics Called when the physics wireframe should be shown or hidden.
     */
    constructor(parent: HTMLElement, onTogglePhysics: (visible: boolean) => void = () => undefined) {
        this.onTogglePhysics = onTogglePhysics;
        this.root = div('debug-info is-hidden click-through', undefined, parent);
    }

    /** True while the overlay is on screen. */
    get isVisible(): boolean {
        return this.visible;
    }

    /** True while the physics wireframe is enabled. */
    get isPhysicsVisible(): boolean {
        return this.physicsVisible;
    }

    /** Show or hide the overlay. */
    toggle(visible = !this.visible): void {
        this.visible = visible;
        this.root.classList.toggle('is-hidden', !visible);
    }

    /** Show or hide the physics wireframe. */
    togglePhysics(visible = !this.physicsVisible): void {
        this.physicsVisible = visible;
        this.onTogglePhysics(visible);
    }

    /** Add or update a custom row. */
    log(key: string, value: unknown): void {
        this.custom.set(key, String(value));
    }

    /** Remove a custom row. */
    unlog(key: string): void {
        this.custom.delete(key);
    }

    /** Refresh the overlay text. Called by the debug system every frame. */
    update(delta: number, game: Game, playerPosition?: { x: number; y: number; z: number }): void {
        if (!this.visible) return;

        this.accumulator += delta;
        this.frames += 1;
        if (this.accumulator >= 0.5) {
            this.fps = this.frames / this.accumulator;
            this.accumulator = 0;
            this.frames = 0;
        }

        const render = game.renderer.info.render;
        const lines = [
            `fps      ${roundTo(this.fps, 0)}`,
            `frame    ${roundTo(delta * 1000, 2)} ms`,
            `calls    ${render.calls}`,
            `tris     ${render.triangles}`,
            `bodies   ${game.physics.bodies.size}`,
            `state    ${game.state.current}`,
        ];
        if (playerPosition) lines.push(`player   ${roundTo(playerPosition.x, 1)} ${roundTo(playerPosition.y, 1)} ${roundTo(playerPosition.z, 1)}`);
        for (const [key, value] of this.custom) lines.push(`${key.padEnd(8)} ${value}`);

        this.root.textContent = lines.join('\n');
    }

    dispose(): void {
        this.root.remove();
    }
}
