import type * as THREE from 'three';
import type Stats from 'stats.js';

import type { EventBus } from '../core/events';
import type { Time } from '../core/time';
import type { SystemRegistry } from '../core/systems';
import type { StateMachine } from '../core/state-machine';
import type { Input } from '../input/input';
import type { Physics } from '../physics/physics';
import type { AudioManager } from '../audio/audio';
import type { Hud } from '../ui/hud';
import type { Screens } from '../ui/screens';
import type { Menus } from '../ui/menus';
import type { Prompts } from '../ui/prompts';
import type { Toasts } from '../ui/toasts';
import type { DebugOverlay } from '../ui/debug-overlay';
import type { Player } from '../game/player';
import type { Inventory } from '../game/inventory';
import type { SaveStore } from '../game/save';
import type { Objectives } from '../game/objectives';
import type { InteractionRegistry } from '../game/interaction';
import type { ProjectileSystem } from '../game/projectiles';
import type { Assets } from '../helpers/assets';
import type { DeviceProfile, QualityLevel } from '../helpers/device';
import type { Effects } from '../fx/effects';

/**
 * Project-wide type definitions.
 *
 * Everything in this file is ambient (global) so modules never have to import
 * the core types to talk to each other. Module-local helper types stay inside
 * their own module.
 */

declare global {
    export type Sizes = {
        width: number;
        height: number;
    };

    /** Dev handles set when `exposeDebug` is on, for the console and for tests. */
    export interface Window {
        __game?: Game | undefined;
        /** The demo picker, so `tools/smoke.mjs` can loop over every demo. */
        __gallery?: { available: string[]; currentKey: string | undefined; start: (key: string) => Promise<unknown> } | undefined;
    }

    /** High level game phases. Extend by widening this union or by adding custom states at runtime. */
    export type GameStatus = 'boot' | 'menu' | 'playing' | 'paused' | 'dead' | 'victory';

    /** Options accepted by `createGame`. All of them have a sane default. */
    export type GameOptions = {
        /** Canvas selector or element. Falls back to `canvas.webgl`, then creates one. */
        canvas?: string | HTMLCanvasElement;
        /** Where UI modules mount. Falls back to `#ui-root`, then creates one. */
        uiRoot?: string | HTMLElement;
        /** Field of view for the main perspective camera. */
        fov?: number;
        near?: number;
        far?: number;
        /** Enable shadows on the renderer. */
        shadows?: boolean;
        /** Upper bound for `renderer.setPixelRatio`. */
        maxPixelRatio?: number;
        /** Show the stats.js FPS panel. */
        stats?: boolean;
        /** Physics gravity vector. */
        gravity?: Vec3;
        /** Fixed physics step in seconds. */
        physicsStep?: number;
        /** Max physics substeps per frame, prevents the spiral of death. */
        maxSubSteps?: number;
        /** Render the rapier collider wireframe. */
        debugPhysics?: boolean;
        /** Expose the game object on `window.__game` for dev tooling. */
        exposeDebug?: boolean;
        /** Game states that should keep updating the world. */
        simulateWhen?: GameStatus[];
    };

    /** `createGame` result options with every optional field resolved. */
    export type ResolvedGameOptions = {
        canvas: HTMLCanvasElement;
        uiRoot: HTMLElement;
        fov: number;
        near: number;
        far: number;
        shadows: boolean;
        maxPixelRatio: number;
        stats: boolean;
        gravity: Vec3;
        physicsStep: number;
        maxSubSteps: number;
        debugPhysics: boolean;
        exposeDebug: boolean;
        simulateWhen: GameStatus[];
    };

    /** A plain vector literal, used where a class instance would be overkill. */
    export type Vec3 = { x: number; y: number; z: number };

    /**
     * The hub every module receives. Sub-systems are created once during boot and
     * never replaced, so holding a reference for a whole game is safe.
     */
    export type Game = {
        canvas: HTMLCanvasElement;
        uiRoot: HTMLElement;
        renderer: THREE.WebGLRenderer;
        scene: THREE.Scene;
        camera: THREE.PerspectiveCamera;
        sizes: Sizes;
        /** Asset loading, with caching and progress. */
        assets: Assets;
        /** What we are running on: screen size, touch, pixel ratio headroom. */
        device: DeviceProfile;
        /** Current quality level. Change it with `applyQuality`. */
        quality: QualityLevel;
        /** Particle bursts, camera shake, screen flash and floating text. */
        effects: Effects;
        /** Raw three.js clock, useful for effects that want wall-clock time. */
        clock: THREE.Clock;
        time: Time;
        events: EventBus;
        input: Input;
        physics: Physics;
        audio: AudioManager;
        /** Named UI layers: 'hud', 'menu', 'modal', 'overlay' or your own. */
        screens: Screens;
        hud: Hud;
        menus: Menus;
        prompts: Prompts;
        toasts: Toasts;
        debug: DebugOverlay;
        systems: SystemRegistry;
        state: StateMachine<GameStatus>;
        /** Set by `createPlayer`, `undefined` for games without a player. */
        player: Player | undefined;
        inventory: Inventory;
        save: SaveStore;
        objectives: Objectives;
        interactions: InteractionRegistry;
        projectiles: ProjectileSystem;
        /** Shared raycaster for screen-space picking; reset it before every use. */
        raycaster: THREE.Raycaster;
        /** Published by templates so dev tools and tests can reach the world object. */
        world?: unknown;
        /**
         * Replaces the plain `renderer.render(scene, camera)` of the loop. Post
         * effects set it; leave it undefined to render straight to the screen.
         */
        renderScene?: (() => void) | undefined;
        stats: Stats | undefined;
        options: ResolvedGameOptions;
    };

    /** Called once after boot to build the world. */
    export type SetupFunction = (game: Game) => void | Promise<void>;
    /** Called every frame with the frame delta (seconds), total elapsed and the game hub. */
    export type FrameFunction = (delta: number, elapsed: number, game: Game) => void;
    /** Called every fixed physics step. */
    export type PhysicsStepFunction = (step: number, game: Game) => void;

    /**
     * Anything damageable. `game/health.ts` implements it; put an instance in
     * `userData.health` and `applyDamage` will find it.
     */
    export type DamageTarget = {
        damage: (amount: number) => number;
        readonly isDead: boolean;
        readonly current: number;
        readonly max: number;
    };

    /**
     * Conventional `userData` shape for scene objects. None of it is required:
     * helpers only read the keys they care about, so you can use a subset.
     */
    export type GameUserData = {
        /** Stable identifier, used by save/load and by find-by-name helpers. */
        id?: string;
        /** Free-form grouping tag, e.g. 'enemy', 'pickup', 'ui'. */
        tag?: string;
        /** Health of this object, read by `applyDamage`. */
        health?: DamageTarget;
        /** False for decorative meshes that should be skipped by fade/collect helpers. */
        interactive?: boolean;
        /** Label shown in the interaction prompt. */
        prompt?: string;
        /** Item id granted when this object is picked up. */
        itemId?: string;
        /** Number of items in one pickup. */
        amount?: number;
        /** Marks the object as a valid shift-click target for anything that collects. */
        pickup?: boolean;
        /** Seconds the object survives after being spawned, `0` means forever. */
        lifetime?: number;
        /** Marked by the portal helpers, holds the exit portal object. */
        portalExit?: THREE.Object3D;
        /** Id of the portal pair, used to avoid instant re-teleporting. */
        portalId?: string;
        /** Effects should ignore this object when it already has them. */
        hasEffect?: boolean;
        /** Original transform, restored by reset helpers. */
        initialPosition?: THREE.Vector3;
        initialRotation?: THREE.Euler;
        initialScale?: THREE.Vector3;
    };

    /**
     * `GameUserData` with every field also accepting `undefined`.
     * `setUserData` skips undefined values, so this is the shape callers write.
     */
    export type GameUserDataInput = { [K in keyof GameUserData]?: GameUserData[K] | undefined };
}

export {};
