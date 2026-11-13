import { watchIcons } from './ui/icons';
import * as THREE from 'three';
import Stats from 'stats.js';

import * as CONSTANTS from './Constants/Constants';
import { EventBus } from './core/events';
import { Time } from './core/time';
import { SystemRegistry, SYSTEM_ORDER, type System } from './core/systems';
import { StateMachine } from './core/state-machine';
import { Input } from './input/input';
import { Physics, initPhysics } from './physics/physics';
import { PhysicsDebugView } from './physics/debug';
import { Assets } from './helpers/assets';
import { detectDevice, qualityFor, applyQuality, defaultQuality } from './helpers/device';
import { AudioManager } from './audio/audio';
import { Effects } from './fx/effects';
import { Screens } from './ui/screens';
import { Hud } from './ui/hud';
import { Menus } from './ui/menus';
import { Prompts } from './ui/prompts';
import { Toasts } from './ui/toasts';
import { DebugOverlay } from './ui/debug-overlay';
import { Inventory } from './game/inventory';
import { SaveStore } from './game/save';
import { Objectives, bridgeObjectivesToEvents } from './game/objectives';
import { InteractionRegistry } from './game/interaction';
import { ProjectileSystem } from './game/projectiles';

/**
 * Engine bootstrap.
 *
 * `createGame` builds the hub every other module receives, wires the physics and
 * debug systems, and leaves the loop stopped. `startGame` runs the loop. `init`
 * is the short form: create, run your setup, start.
 *
 * The loop order matters and is fixed here: sample input, run frame systems,
 * drain fixed physics steps, run camera systems, clear input edges, render.
 * Anything with different timing needs should register a system with an explicit
 * order instead of editing this file.
 */

const DEFAULTS = {
    fov: CONSTANTS.CAMERA.FOV,
    near: CONSTANTS.CAMERA.NEAR,
    far: CONSTANTS.CAMERA.FAR,
    shadows: true,
    maxPixelRatio: 2,
    stats: false,
    gravity: CONSTANTS.PHYSICS_DEFAULTS.GRAVITY,
    physicsStep: CONSTANTS.PHYSICS_DEFAULTS.STEP,
    maxSubSteps: CONSTANTS.PHYSICS_DEFAULTS.MAX_SUB_STEPS,
    debugPhysics: false,
    exposeDebug: true,
    simulateWhen: ['playing'] as GameStatus[],
} as const;

/** Build a game hub. Awaits the physics wasm module; everything else is synchronous. */
export async function createGame(options: GameOptions = {}): Promise<Game> {
    await initPhysics();

    const canvas = resolveCanvas(options.canvas);
    const uiRoot = resolveUiRoot(options.uiRoot);
    // `:name:` in any UI text is drawn as a registered icon.
    watchIcons(uiRoot);
    const sizes: Sizes = { width: window.innerWidth, height: window.innerHeight };
    // A phone at device pixel ratio 3 has nine times the pixels of a 1080p
    // desktop. Everything below is sized from this profile instead of assuming.
    const device = detectDevice();

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    const quality = defaultQuality(device);
    const qualitySettings = qualityFor(quality, device);
    const pixelRatioCap = options.maxPixelRatio ?? Math.min(qualitySettings.pixelRatio, device.maxPixelRatio);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, pixelRatioCap));
    renderer.setSize(sizes.width, sizes.height);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = options.shadows ?? (DEFAULTS.shadows && qualitySettings.shadows);
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // The frame renders more than once per frame (the game scene, then the canvas
    // UI overlay). Left on, `renderer.info` would report only the last pass, so
    // every draw call and triangle count in the game would be a lie.
    renderer.info.autoReset = false;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(options.fov ?? DEFAULTS.fov, sizes.width / sizes.height, options.near ?? DEFAULTS.near, options.far ?? DEFAULTS.far);

    const events = new EventBus();
    const time = new Time();
    const physics = new Physics(options.gravity ?? DEFAULTS.gravity, events, options.physicsStep ?? DEFAULTS.physicsStep);
    const audio = new AudioManager(camera);
    const systems = new SystemRegistry();
    const state = new StateMachine<GameStatus>('boot');
    state.onChange((to, from) => events.emit('state:changed', { from: from ?? 'boot', to }));

    let debugView: PhysicsDebugView | undefined;
    const debug = new DebugOverlay(uiRoot, (visible) => {
        if (visible && !debugView) {
            debugView = new PhysicsDebugView(physics);
            scene.add(debugView.object);
        }
        if (debugView) debugView.object.visible = visible;
    });

    // Every UI module mounts into a named screen, so a game can reason about
    // what is on top and what should block input.
    const screens = new Screens(uiRoot);
    const hud = new Hud(screens.layer('hud'));
    const menus = new Menus(screens.layer('menu'), { show: () => screens.show('menu', menus), hide: () => screens.hide('menu', menus) });
    const prompts = new Prompts(screens.layer('hud'));
    // Toasts get the top layer: a refusal shown under an open shop would never be read.
    const toasts = new Toasts(screens.layer('notices'));
    screens.show('notices');

    // `game` has to exist before these can be built, so the two circular members
    // are filled in right after the literal.
    const resolved: ResolvedGameOptions = {
        canvas,
        uiRoot,
        fov: options.fov ?? DEFAULTS.fov,
        near: options.near ?? DEFAULTS.near,
        far: options.far ?? DEFAULTS.far,
        shadows: options.shadows ?? DEFAULTS.shadows,
        maxPixelRatio: options.maxPixelRatio ?? Math.min(qualitySettings.pixelRatio, device.maxPixelRatio),
        stats: options.stats ?? DEFAULTS.stats,
        gravity: options.gravity ?? DEFAULTS.gravity,
        physicsStep: options.physicsStep ?? DEFAULTS.physicsStep,
        maxSubSteps: options.maxSubSteps ?? DEFAULTS.maxSubSteps,
        debugPhysics: options.debugPhysics ?? DEFAULTS.debugPhysics,
        exposeDebug: options.exposeDebug ?? DEFAULTS.exposeDebug,
        simulateWhen: options.simulateWhen ?? [...DEFAULTS.simulateWhen],
    };

    const game: Game = {
        canvas,
        uiRoot,
        renderer,
        scene,
        camera,
        sizes,
        clock: new THREE.Clock(),
        time,
        events,
        input: undefined as unknown as Input,
        physics,
        audio,
        screens,
        hud,
        menus,
        prompts,
        toasts,
        debug,
        systems,
        state,
        player: undefined,
        inventory: new Inventory(),
        save: new SaveStore(),
        objectives: new Objectives((summary) => hud.setObjective(summary)),
        interactions: undefined as unknown as InteractionRegistry,
        projectiles: undefined as unknown as ProjectileSystem,
        effects: undefined as unknown as Effects,
        assets: new Assets(),
        raycaster: new THREE.Raycaster(),
        stats: undefined,
        options: resolved,
        device,
        quality,
    };

    game.input = new Input(canvas);
    game.effects = new Effects(game, { maxParticles: qualitySettings.particles });
    bridgeObjectivesToEvents(game);
    // Menus and modals own the keyboard while they are up; gameplay input has
    // its own gate, so the two never fight over `input.enabled`.
    screens.bindInput(game.input);
    // A panel needs the mouse: free it while one is up, and take it back after.
    let relock = false;
    screens.onChange(() => {
        if (screens.blocksInput) {
            if (game.input.pointerLocked) {
                relock = true;
                game.input.exitPointerLock();
            }
        } else if (relock) {
            relock = false;
            if (game.state.is('playing')) game.input.requestPointerLock();
        }
    });
    game.interactions = new InteractionRegistry(game);
    game.projectiles = new ProjectileSystem(game);

    // Physics runs after every control scheme has written its velocity.
    systems.add({ name: 'physics', order: SYSTEM_ORDER.PHYSICS_SYNC, fixedUpdate: () => physics.step() });
    systems.add({ name: 'debug-overlay', order: SYSTEM_ORDER.UI, update: (delta) => debug.update(delta, game, game.player?.position) });
    systems.add({
        name: 'debug-physics-view',
        order: SYSTEM_ORDER.EFFECTS,
        lateUpdate: () => {
            if (debugView?.object.visible) debugView.update();
        },
    });

    if (resolved.stats) {
        const stats = new Stats();
        stats.showPanel(0);
        document.body.appendChild(stats.dom);
        game.stats = stats;
    }

    window.addEventListener('resize', () => resize(game));
    document.addEventListener('visibilitychange', () => {
        // A hidden tab stops rAF, which would otherwise give one huge delta on return.
        // Only the gap is dropped: elapsed time keeps counting, so timers and lap clocks stay valid.
        if (!document.hidden) time.skipGap();
    });

    if (resolved.exposeDebug) {
        window.__game = game;
        if (resolved.debugPhysics) debug.togglePhysics(true);
    }

    return game;
}

/**
 * The short form: create the game, run `setup`, start the loop.
 * `onFrame` is registered as an ordinary system at `SYSTEM_ORDER.GAMEPLAY`.
 */
export async function init(setup: SetupFunction = () => undefined, onFrame: FrameFunction = () => undefined, options: GameOptions = {}): Promise<Game> {
    const game = await createGame(options);
    await setup(game);
    game.systems.add({ name: 'user-frame', order: SYSTEM_ORDER.GAMEPLAY, update: (delta, hub) => onFrame(delta, hub.time.elapsed, hub) });
    startGame(game);
    return game;
}

/** Start the render loop. Safe to call more than once. */
export function startGame(game: Game): void {
    if (running.has(game)) return;
    running.add(game);

    const { renderer, scene, camera, time, systems, input } = game;

    renderer.setAnimationLoop(() => {
        const delta = time.advance();
        renderer.info.reset();
        input.update();

        const simulate = game.options.simulateWhen.includes(game.state.current);
        const include = (system: System) => simulate || system.always === true || (system.order ?? 0) >= SYSTEM_ORDER.EFFECTS;

        systems.update(delta, game, include);
        if (simulate) time.stepFixed(game.options.physicsStep, game.options.maxSubSteps, (step) => systems.fixedUpdate(step, game));
        systems.lateUpdate(delta, game, include);

        input.endFrame();
        if (game.renderScene) game.renderScene();
        else renderer.render(scene, camera);
        // In-canvas UI draws on top of the game, in its own pass, so it never
        // fights the scene's depth buffer or its camera.
        for (const overlay of overlays) {
            if (overlay.scene.children.length === 0) continue;
            renderer.autoClear = false;
            renderer.render(overlay.scene, overlay.camera);
            renderer.autoClear = true;
        }
        game.stats?.update();
    });
}

/** Stop the render loop. The game hub stays usable. */
export function stopGame(game: Game): void {
    if (!running.has(game)) return;
    running.delete(game);
    game.renderer.setAnimationLoop(null);
}

/** Release everything: loop, physics world, listeners and UI. */
export function disposeGame(game: Game): void {
    stopGame(game);
    game.systems.clear();
    game.effects.dispose();
    game.projectiles.dispose();
    game.interactions.clear();
    game.input.dispose();
    game.audio.close();
    game.physics.dispose();
    game.assets.dispose();
    game.hud.root.remove();
    game.menus.dispose();
    game.prompts.dispose();
    game.toasts.dispose();
    game.debug.dispose();
    game.state.set('boot');
    if (window.__game === game) window.__game = undefined;
}

const running = new WeakSet<Game>();

/**
 * Overlay scenes, drawn after the game scene on the same canvas. `CanvasUi`
 * registers here, which is how a three.js menu can live inside the game's canvas
 * rather than in a DOM layer above it.
 */
const overlays: Array<{ scene: THREE.Scene; camera: THREE.Camera }> = [];

/**
 * Register a scene to be drawn after the game scene.
 * Returns a function that removes it again.
 */
export function addOverlay(overlay: { scene: THREE.Scene; camera: THREE.Camera }): () => void {
    overlays.push(overlay);
    return () => {
        const index = overlays.indexOf(overlay);
        if (index >= 0) overlays.splice(index, 1);
    };
}

/** Keep the renderer, camera and UI in sync with the window size. */
export function resize(game: Game): void {
    game.sizes.width = window.innerWidth;
    game.sizes.height = window.innerHeight;
    game.camera.aspect = game.sizes.width / game.sizes.height;
    game.camera.updateProjectionMatrix();
    game.renderer.setSize(game.sizes.width, game.sizes.height);
    game.renderer.setPixelRatio(Math.min(window.devicePixelRatio, game.options.maxPixelRatio));
}

/** Re-exported so a game can change quality without importing two modules. */
export { applyQuality };

function resolveCanvas(selector: GameOptions['canvas']): HTMLCanvasElement {
    if (selector instanceof HTMLCanvasElement) return selector;
    const found = selector ? document.querySelector<HTMLCanvasElement>(selector) : document.querySelector<HTMLCanvasElement>('canvas.webgl');
    if (found) return found;
    const canvas = document.createElement('canvas');
    canvas.classList.add('webgl');
    document.body.appendChild(canvas);
    return canvas;
}

function resolveUiRoot(selector: GameOptions['uiRoot']): HTMLElement {
    if (selector instanceof HTMLElement) return selector;
    const found = selector ? document.querySelector<HTMLElement>(selector) : document.querySelector<HTMLElement>('#ui-root');
    if (found) return found;
    const root = document.createElement('div');
    root.id = 'ui-root';
    document.body.appendChild(root);
    return root;
}
