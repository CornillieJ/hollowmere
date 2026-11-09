//#region Imports

import { DemoGallery, type DemoEntry } from './demos/gallery';

//#endregion Imports

/**
 * Entry point.
 *
 * Without a query parameter this boots the gallery: a picker with every template
 * in `scripts/demos`, which is the fastest way to see what the suite can do.
 * Pass `?demo=<key>` to jump straight into one, e.g. `?demo=chess`.
 *
 * To start a real project, replace the body of `main` with a single template
 * call, for example:
 *
 * ```ts
 * import { createThirdPersonGame } from './templates/third-person-game';
 * void createThirdPersonGame({ title: 'My game', autoStart: false });
 * ```
 */

//#region Demo list

/**
 * Every template has a demo. The keys are the `?demo=` values. The modules are
 * imported lazily, so the browser only downloads the game you actually pick.
 */
const DEMOS: Record<string, DemoEntry> = {
    'third-person': {
        name: 'Third person arena',
        description: 'Over the shoulder camera, weapon, drones to shoot and energy cells to collect.',
        load: () => import('./demos/third-person'),
    },
    'first-person': {
        name: 'First person range',
        description: 'Pointer locked camera, jump, sprint, head bob and a semi auto rifle.',
        load: () => import('./demos/first-person'),
    },
    'top-down': {
        name: 'Top down field',
        description: 'Camera above the player, screen relative movement, mouse turns the view.',
        load: () => import('./demos/top-down'),
    },
    'twin-stick': {
        name: 'Twin stick arena',
        description: 'Top-down shooter: the character faces the mouse, shots fly flat, waves arrive.',
        load: () => import('./demos/twin-stick'),
    },
    arena: {
        name: 'Wave survival',
        description: 'Five waves in a walled arena, cleared one at a time.',
        load: () => import('./demos/arena'),
    },
    mist: {
        name: 'Mist',
        description: 'The horror look: height mist with drifting banks, a PS1 picture and a VHS tape.',
        load: () => import('./demos/mist'),
    },
    chess: {
        name: 'Chess',
        description: 'Eight by eight board, orbit camera, real piece movement and captures.',
        load: () => import('./demos/board'),
    },
    portal: {
        name: 'Portal chamber',
        description: 'Physics puzzle: cross a chasm through linked portals, reach the exit pad.',
        load: () => import('./demos/portal'),
    },
    farm: {
        name: 'Farm',
        description: 'Plant, water, harvest and sell, across a real day cycle with a moving sun.',
        load: () => import('./demos/farm'),
    },
    tron: {
        name: 'Light cycles',
        description: 'Third person Tron: drive forward, steer, leave a lethal ribbon, outlast the rivals.',
        load: () => import('./demos/tron'),
    },
    delivery: {
        name: 'Delivery run',
        description: 'Cozy courier loop: collect a parcel at the beacon, drop it off for money.',
        load: () => import('./demos/delivery'),
    },
    vehicle: {
        name: 'Van test field',
        description: 'Drive a delivery van: suspension, engine, brakes and a chase camera.',
        load: () => import('./demos/vehicle'),
    },
    racing: {
        name: 'Time trial',
        description: 'Three laps on an oval: ordered gates, a best-lap clock and a minimap.',
        load: () => import('./demos/racing'),
    },
    'tower-defense': {
        name: 'Tower defence',
        description: 'Build along a road, hold off eight waves. Click plots to build, click towers to upgrade.',
        load: () => import('./demos/tower-defense'),
    },
    platformer: {
        name: 'Platformer',
        description: 'Coyote time, a variable jump, a second jump in the air and a moving platform that carries you.',
        load: () => import('./demos/platformer'),
    },
    characters: {
        name: 'Assets and animation',
        description: 'Real glTF models loaded from static/models, animations played with the Animator, switched with an in-canvas menu.',
        load: () => import('./demos/characters'),
    },
    inventory: {
        name: 'Inventory and shop',
        description: 'The library building blocks: resources, a bag with a key and a save slot, a shop, uses, gates and a spending toolbar.',
        load: () => import('./demos/inventory'),
    },
    blank: {
        name: 'Blank scene',
        description: 'Empty lit scene with one physics box. The starting point for a hand built game.',
        load: () => import('./demos/blank'),
    },
};

//#endregion Demo list

//#region Main

window.addEventListener('load', () => {
    void main();
});

async function main(): Promise<void> {
    const gallery = new DemoGallery(DEMOS);
    // Handy for the smoke test in `tools/smoke.mjs`, which loops over these keys.
    window.__gallery = gallery;
    await gallery.run();
}

//#endregion Main
