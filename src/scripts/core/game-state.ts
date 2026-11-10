import { setTweenSpeed } from '../helpers/animation';
import { UI_TEXT } from '../Constants/Constants';
import type { MenuConfig } from '../ui/menus';

/**
 * The state machine every game needs.
 *
 * Wires menu, playing, paused, dead and victory to the systems that depend on
 * them: input is released while a menu is open, tweens freeze, the HUD hides,
 * and Escape toggles pause. Games only have to supply what "start", "restart"
 * and "quit" mean for them.
 */
export type GameFlowOptions = {
    /** Window title used in the default menus. */
    title?: string;
    subtitle?: string;
    /** Control hint under the main menu's buttons. */
    hint?: string;
    /** Go straight to playing instead of showing the main menu. */
    autoStart?: boolean;
    /** Menu button shown only when a save exists. */
    continueLabel?: string;
    onContinue?: (game: Game) => void;
    onStart?: (game: Game) => void;
    onPause?: (game: Game) => void;
    onResume?: (game: Game) => void;
    onRestart?: (game: Game) => void;
    onQuit?: (game: Game) => void;
    /** Called when the player runs out of lives. */
    onDeath?: (game: Game) => void;
    /** Called when the level is completed. */
    onVictory?: (game: Game) => void;
    /** Replace the generated menus entirely by passing your own. */
    mainMenu?: MenuConfig;
    pauseMenu?: MenuConfig;
    deathMenu?: MenuConfig;
    victoryMenu?: MenuConfig;
    /** States that keep simulating the world. Defaults to `['playing']`. */
    simulateWhen?: GameStatus[];
    /** States in which the HUD is visible. Defaults to playing, paused, dead and victory. */
    hudWhen?: GameStatus[];
    /** States in which the crosshair is visible. Defaults to playing. */
    crosshairWhen?: GameStatus[];
    /** Turn pointer lock on when playing. Defaults to true. */
    pointerLock?: boolean;
    /**
     * Let the flow show its own menus. Set false when a game draws its UI on the
     * canvas and would rather not have a DOM panel appear over it.
     */
    showMenus?: boolean;
};

/** Ids of the flow's menus, for a game that re-registers one with `game.menus.register`. */
export const MAIN_MENU = 'main-menu';
export const PAUSE_MENU = 'pause-menu';
export const DEATH_MENU = 'death-menu';
export const VICTORY_MENU = 'victory-menu';

export class GameFlow {
    readonly game: Game;
    private readonly options: GameFlowOptions;

    private blockedLastFrame = false;

    constructor(game: Game, options: GameFlowOptions = {}) {
        this.game = game;
        this.options = options;

        game.options.simulateWhen = options.simulateWhen ?? ['playing'];
        this.registerMenus();
        this.registerStates();

        game.systems.add({
            name: 'game-flow',
            order: -200,
            // Must keep running while paused, otherwise Escape could never resume.
            always: true,
            update: () => this.handleHotkeys(),
        });
        if (options.showMenus !== false) game.menus.onOpen(() => game.input.exitPointerLock());
        // The browser spends the Escape that ends pointer lock and never reports it,
        // so losing the lock while playing is the pause request.
        if (options.pointerLock !== false) {
            let wasLocked = false;
            game.input.onPointerLock((locked) => {
                // Only a real loss counts: a refused request also reports "unlocked".
                const lost = wasLocked && !locked;
                wasLocked = locked;
                if (lost && game.state.is('playing') && !game.screens.blocksInput) this.pause();
            });
        }
        // Every template reports a win the same way, so the flow shows the win screen for all of them.
        game.events.on('level:complete', () => {
            if (game.state.is('playing')) this.win();
        });
    }

    /** Show the main menu, or start straight away with `autoStart`. */
    open(): void {
        if (this.options.autoStart) this.start();
        else this.game.state.set('menu');
    }

    /** Leave the menu and begin playing. */
    start(): void {
        this.options.onStart?.(this.game);
        this.game.state.set('playing');
    }

    /** Pause the game, e.g. from a menu button. */
    pause(): void {
        if (!this.game.state.is('playing')) return;
        this.game.state.set('paused');
    }

    /** Resume from pause. */
    resume(): void {
        if (!this.game.state.is('paused')) return;
        this.game.state.set('playing');
    }

    /** Toggle between playing and paused. */
    togglePause(): void {
        if (this.game.state.is('playing')) this.pause();
        else if (this.game.state.is('paused')) this.resume();
    }

    /** Run the restart callback, then start playing. */
    restart(): void {
        this.options.onRestart?.(this.game);
        this.game.state.set('playing', true);
    }

    /** Show the level complete screen. */
    win(): void {
        this.game.state.set('victory');
    }

    /** Show the death screen. */
    die(): void {
        this.game.state.set('dead');
    }

    /** Return to the main menu. */
    quit(): void {
        this.options.onQuit?.(this.game);
        this.game.state.set('menu');
    }

    //#region Internals

    private handleHotkeys(): void {
        const { input, screens, state } = this.game;
        // Ungated: input is closed outside play, yet pause must still resume, from a pad too.
        const pauseKey = input.keyboard.wasPressed('Escape') || input.wasPressedUngated('pause');

        // An open panel owns Escape; it closes itself and the game keeps running. The
        // panel closes on the key event, before this frame, so what counts is whether
        // one was up on the previous frame.
        const wasBlocked = this.blockedLastFrame;
        this.blockedLastFrame = screens.blocksInput;
        if (state.is('playing') && pauseKey && !screens.blocksInput && !wasBlocked) this.pause();
        else if (state.is('paused') && pauseKey) this.resume();
        else if (state.is('victory', 'dead') && (input.keyboard.wasPressed('Enter') || input.wasPressedUngated('jump'))) this.restart();
    }

    private registerStates(): void {
        const { game } = this;

        game.state
            .define('menu', {
                enter: () => {
                    if (this.options.showMenus !== false) game.menus.show(MAIN_MENU);
                    this.applyUi('menu');
                },
            })
            .define('playing', {
                enter: () => {
                    if (this.options.showMenus !== false) game.menus.hide();
                    this.applyUi('playing');
                    if (this.options.pointerLock !== false) game.input.requestPointerLock();
                    this.options.onResume?.(game);
                },
                exit: () => this.options.onPause?.(game),
            })
            .define('paused', {
                enter: () => {
                    if (this.options.showMenus !== false) game.menus.show(PAUSE_MENU);
                    this.applyUi('paused');
                },
            })
            .define('dead', {
                enter: () => {
                    if (this.options.showMenus !== false) game.menus.show(DEATH_MENU);
                    this.applyUi('dead');
                    this.options.onDeath?.(game);
                },
            })
            .define('victory', {
                enter: () => {
                    if (this.options.showMenus !== false) game.menus.show(VICTORY_MENU);
                    this.applyUi('victory');
                    this.options.onVictory?.(game);
                },
            });
    }

    /** Keep input, tweens, HUD and crosshair in step with the current state. */
    private applyUi(state: GameStatus): void {
        const { game } = this;
        const simulating = (this.options.simulateWhen ?? ['playing']).includes(state);

        game.input.enabled = simulating;
        setTweenSpeed(simulating ? 1 : 0);

        const hudStates = this.options.hudWhen ?? ['playing', 'paused', 'dead', 'victory'];
        game.hud.setVisible(hudStates.includes(state));

        const crosshairStates = this.options.crosshairWhen ?? ['playing'];
        game.hud.setCrosshair(crosshairStates.includes(state), false);

        game.prompts.hide();
    }

    private registerMenus(): void {
        const { game, options } = this;
        // With `showMenus: false` the game draws its own UI, so there is nothing
        // to register and nothing to appear over the canvas.
        if (options.showMenus === false) return;
        const title = options.title ?? 'Three.js Game';
        const subtitle = options.subtitle;

        if (options.mainMenu) {
            game.menus.register(MAIN_MENU, options.mainMenu);
        } else {
            game.menus.register(MAIN_MENU, {
                title,
                ...(subtitle !== undefined ? { subtitle } : {}),
                buttons: [
                    ...(game.save.slots().length > 0 && options.onContinue
                        ? [
                              {
                                  label: options.continueLabel ?? UI_TEXT.CONTINUE,
                                  primary: true,
                                  action: () => {
                                      options.onContinue?.(game);
                                      game.state.set('playing');
                                  },
                              },
                          ]
                        : []),
                    {
                        label: UI_TEXT.START,
                        primary: game.save.slots().length === 0 || !options.onContinue,
                        action: () => this.start(),
                    },
                ],
                hint: options.hint ?? 'WASD to move, mouse to look, Escape to pause',
            });
        }

        game.menus.register(
            PAUSE_MENU,
            options.pauseMenu ?? {
                title: UI_TEXT.PAUSED,
                buttons: [
                    { label: UI_TEXT.RESUME, primary: true, action: () => this.resume() },
                    { label: UI_TEXT.RESTART, action: () => this.restart() },
                    { label: UI_TEXT.MAIN_MENU, action: () => this.quit() },
                ],
            },
        );

        game.menus.register(
            DEATH_MENU,
            options.deathMenu ?? {
                title: UI_TEXT.YOU_DIED,
                buttons: [
                    { label: UI_TEXT.RESTART, primary: true, action: () => this.restart() },
                    { label: UI_TEXT.MAIN_MENU, action: () => this.quit() },
                ],
            },
        );

        game.menus.register(
            VICTORY_MENU,
            options.victoryMenu ?? {
                title: UI_TEXT.VICTORY,
                buttons: [
                    { label: UI_TEXT.RESTART, primary: true, action: () => this.restart() },
                    { label: UI_TEXT.MAIN_MENU, action: () => this.quit() },
                ],
            },
        );
    }

    //#endregion Internals
}

/**
 * Convenience wrapper: create a flow, show the main menu and hand it back.
 * Templates call this and then wire their own start and restart callbacks.
 */
export function setupGameFlow(game: Game, options: GameFlowOptions = {}): GameFlow {
    const flow = new GameFlow(game, options);
    flow.open();
    return flow;
}
