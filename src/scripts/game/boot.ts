import * as THREE from 'three';

import { createThirdPersonGame } from '../templates/third-person-game';
import type { GameFlow } from '../core/game-state';
import { DayCycle } from '../game/daycycle';
import { Farm, type CropDefinition } from '../game/farm';
import { fitModel } from '../helpers/transform';
import { SYSTEM_ORDER } from '../core/systems';
import {
    addAtmosphere,
    addBarriers,
    addHotbar,
    addInventory,
    addLivestock,
    addMount,
    addResource,
    addRetroLook,
    addSafeZones,
    addVillagers,
    type AnimalDefinition,
} from '../kit';
import { createFolk, FolkAnimator } from '../content/folk';
import { createBike, spinWheels } from '../content/bike';
import { ITEMS, STORE_STOCK } from '../content/items';
import { REQUESTS, VILLAGERS } from '../content/villagers';
import { FARM, SAFE_ZONES, VILLAGE, WORLD_HALF } from '../content/world';
import { buildWorld, groundTexture } from './world';
import { setupMood } from './mood';
import { setupFarming, shipEverything } from './farming';
import { animateHollow, MonsterDirector } from './monsters';
import { setupDread } from './dread';

/**
 * Hollowmere: farm, deliver, and keep moving.
 *
 * Everything below is a kit call or a template feature; the game's own code is
 * the content (people, items, places) and the few rules that make it this game.
 */
const SAVE_SLOT = 'hollowmere';
/** Real seconds per in-game day. */
const DAY_LENGTH = 600;

const CROPS: CropDefinition[] = [
    { id: 'turnip', name: 'Turnip', seed: 'turnip-seed', produce: 'turnip', stages: 3, stageSeconds: [40, 40, 40], height: 0.5, colors: [0x5f8a52, 0x7aa064, 0xc8d8b0] },
    { id: 'corn', name: 'Corn', seed: 'corn-seed', produce: 'corn', yield: 2, stages: 4, stageSeconds: [50, 50, 50, 50], height: 1.7, colors: [0x5f8a52, 0x7a9a5a, 0xb0a85a, 0xd8c070] },
    { id: 'pumpkin', name: 'Pumpkin', seed: 'pumpkin-seed', produce: 'pumpkin', stages: 4, stageSeconds: [70, 70, 70, 70], height: 0.8, colors: [0x5f8a52, 0x7a9a52, 0xb07a3a, 0xd0702a] },
];

/** Look speed relative to the template default, remembered on this machine. */
const LOOK_BASE = 0.0012;
let lookScale = readLookScale();
/** Set once the template is up; the menu callbacks are built before it exists. */
let controlsRef: { flow: GameFlow; look: { sensitivity: number } } | undefined;

function readLookScale(): number {
    try {
        const stored = Number(localStorage.getItem('hollowmere.look'));
        return stored > 0 ? stored : 1;
    } catch {
        return 1;
    }
}

function setLookScale(scale: number): void {
    lookScale = scale;
    try {
        localStorage.setItem('hollowmere.look', String(scale));
    } catch {
        // Private windows may refuse storage; the setting still applies for this visit.
    }
    if (controlsRef) controlsRef.look.sensitivity = LOOK_BASE * scale;
}

export async function boot(): Promise<void> {
    const cat = createFolk({ species: 'cat', fur: 0x2b2522, accent: 0xd9b8a0, clothes: 0x6b4f3a });

    const { game, world } = await createThirdPersonGame({
        title: 'Hollowmere',
        subtitle: 'Grow. Deliver. Keep moving.',
        hint: 'WASD to walk, E to interact, F to use what you hold, 1 to 8 to pick it, I for the bag',
        autoStart: false,
        saveSlot: SAVE_SLOT,
        arena: false,
        weapon: false,
        scene: { preset: 'outdoor-dusk', groundSize: WORLD_HALF * 2.2, groundTexture: groundTexture(), fog: false },
        player: { lives: Infinity, maxHealth: 100, regenPerSecond: 2, regenDelay: 6, respawnDelay: 2.5 },
        spawnPoint: { x: FARM.door.x, y: 0.2, z: FARM.door.z },
        playerObject: () => cat.root,
        controls: { distance: 4.6, targetHeight: 1.3, shoulderOffset: 0.35, walkSpeed: 4.5, sprintSpeed: 6.8, cameraCollision: true },
        enemies: { animate: animateHollow, onAttack: (hub) => hub.effects.flash(0.25, 0x220000, 0.35) },
        touch: {
            buttons: [
                { action: 'interact', label: '✋', primary: true },
                { action: 'use', label: '◉' },
                { action: 'sprint', label: '≫', hold: true },
                { action: 'inventory', label: '🎒' },
            ],
        },
        flow: {
            pointerLock: true,
            crosshairWhen: [],
            pauseMenu: {
                title: 'Paused',
                buttons: [
                    { label: 'Resume', primary: true, action: () => controlsRef?.flow.resume() },
                    {
                        label: 'Mouse sensitivity',
                        slider: {
                            min: 0.2,
                            max: 2,
                            step: 0.05,
                            value: () => lookScale,
                            onChange: (value) => setLookScale(value),
                            format: (value) => `${Math.round(value * 100)}%`,
                        },
                    },
                    { label: 'Main menu', action: () => controlsRef?.flow.quit() },
                ],
            },
        },
        game: { stats: false, exposeDebug: true },
    });
    controlsRef = { flow: world.flow, look: world.controls.look };
    setLookScale(lookScale);
    animatePlayer(game, new FolkAnimator(cat));

    //#region Look

    const atmosphere = addAtmosphere(game, { color: 0x8b9488, density: 0.045, heightFalloff: 0.16, noiseScale: 0.05, noiseAmount: 0.7 });
    const look = addRetroLook(game, { resolutionScale: 0.36, psx: { colorLevels: 28, dither: 0.7 }, vhs: { wobble: 0.5, saturation: 0.72, noise: 0.07 } });
    game.renderer.toneMappingExposure = 1.1;

    //#endregion Look

    const refs = await buildWorld(game);
    const dayCycle = new DayCycle(game, { dayLength: DAY_LENGTH, startHour: 7 });
    setupMood(game, { dayCycle, atmosphere, lighting: world.scene.lighting, lamps: refs.lamps });

    //#region Money and inventories

    const coins = addResource(game, { id: 'coins', label: 'Coins', initial: 30, integer: true, format: (value) => `${value}c` });
    const pockets = addInventory(game, { items: ITEMS, capacity: 8, title: 'Pockets', persist: 'pockets', primary: true });
    const bag = addInventory(game, { items: ITEMS, capacity: 20, key: 'inventory', keys: ['Tab'], title: 'Backpack', persist: 'bag', primary: false, columns: 5 });
    bag.offerTransfer('To pockets', pockets);
    pockets.offerTransfer('To backpack', bag);
    const hotbar = addHotbar(game, { inventory: pockets, slots: 8, useAction: 'use', onUse: (slot) => farming.useHeld(slot) });

    /** New things go in the pockets, and into the backpack when the pockets are full. */
    const give = (itemId: string, amount: number): boolean => {
        const leftover = pockets.add(itemId, amount);
        const lost = leftover > 0 ? bag.add(itemId, leftover) : 0;
        if (lost > 0) game.toasts.push('Your pockets and backpack are full', { color: '#ff9a9a' });
        return lost === 0;
    };

    //#endregion Money and inventories

    //#region Farm, animals and the bike

    const farm = new Farm(game, {
        columns: FARM.field.columns,
        rows: FARM.field.rows,
        plotSize: 1.6,
        origin: { x: FARM.field.x, y: 0.02, z: FARM.field.z },
        crops: CROPS,
        soil: { dry: 0x3a2e24, wet: 0x1e1612 },
    });
    const barriers = addBarriers(game, { enemies: world.enemies, lifetime: 150, toughness: 7, onBroken: () => game.toasts.push('A fence gave way', { color: '#c8a0a0' }) });
    const farming = setupFarming(game, { farm, pockets, hotbar, barriers, give });

    const animals = await loadAnimals(game);
    addLivestock(game, {
        pen: { center: { x: FARM.pen.center.x, y: 0, z: FARM.pen.center.z }, halfSize: FARM.pen.halfSize },
        animals: animals.map((entry) => entry.definition),
        inventory: pockets,
        onCollect: (animal) => game.effects.text(animal.object.position.clone().setY(1.4), `+1 ${animal.product}`, { color: 0xe8e0c8 }),
        animate: (animal, speed, delta) => animals.find((entry) => entry.definition === animal)?.animate(speed, delta),
    });

    const bikeModel = createBike();
    const bike = addMount(game, {
        object: bikeModel,
        controller: world.controls,
        position: { x: FARM.bike.x, y: 0, z: FARM.bike.z },
        yaw: FARM.bike.yaw,
        maxSpeed: 12,
        seat: { x: 0, y: 0.28, z: -0.05 },
        prompt: 'Ride the bicycle',
    });
    game.systems.add({ name: 'bike-wheels', order: SYSTEM_ORDER.GAMEPLAY + 6, update: (delta) => spinWheels(bikeModel, bike.speed * delta) });

    //#endregion Farm, animals and the bike

    //#region The village

    const villagers = addVillagers(game, {
        villagers: VILLAGERS.map((villager) => ({
            id: villager.id,
            name: villager.name,
            portrait: villager.portrait,
            object: createFolk(villager.look).root,
            position: { x: VILLAGE.center.x + villager.spot.x, y: 0, z: VILLAGE.center.z + villager.spot.z },
            yaw: villager.spot.yaw,
            lines: villager.lines,
            loves: villager.loves,
            likes: villager.likes,
            dislikes: villager.dislikes,
        })),
        day: () => dayCycle.day,
        inventory: pockets,
        held: () => hotbar.selectedId,
        requests: { templates: REQUESTS, maxOpen: 3 },
        onPaid: (amount) => coins.add(amount),
        dialogue: { speed: 50 },
    });

    const shop = addInventory(game, { items: ITEMS, mode: 'shop', title: "Barnaby's store", catalogue: STORE_STOCK, primary: false, customer: pockets, currency: { resource: coins, label: 'purse', format: (amount) => `${amount}c` }, filters: false });
    const counter = new THREE.Object3D();
    counter.position.set(VILLAGE.store.x + 2, 0, VILLAGE.store.z + 5);
    game.scene.add(counter);
    game.interactions.add(counter, { prompt: 'Browse the store', range: 3, onInteract: () => shop.open() });

    //#endregion The village

    //#region Home

    const bin = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.8, 0.9), new THREE.MeshStandardMaterial({ color: 0x5a4430, roughness: 1 }));
    bin.position.set(FARM.shipping.x, 0.4, FARM.shipping.z);
    bin.castShadow = true;
    game.scene.add(bin);
    game.interactions.add(bin, {
        prompt: 'Ship crops and produce',
        range: 2.2,
        onInteract: () => {
            const made = shipEverything([pockets, bag], coins);
            game.toasts.push(made > 0 ? `Shipped for ${made}c` : 'Nothing to ship', { color: made > 0 ? '#d8e8b0' : '#c0b0a0' });
        },
    });

    const door = new THREE.Object3D();
    door.position.set(FARM.door.x - 1.5, 0, FARM.door.z);
    game.scene.add(door);
    game.interactions.add(door, { prompt: 'Sleep until morning', range: 2.2, onInteract: () => sleep('You sleep. Something scratches at the door until dawn.') });

    //#endregion Home

    //#region The Hollow

    const safeZones = addSafeZones(game, {
        enemies: world.enemies,
        zones: SAFE_ZONES,
        onEnter: (zone) => game.hud.setStat('safe', zone.name ?? 'Safe', 'here'),
        onLeave: () => game.hud.removeStat('safe'),
    });
    const director = new MonsterDirector(game, { enemies: world.enemies, dayCycle, safeZones, bounds: WORLD_HALF });
    setupDread(game, { enemies: world.enemies, look, dayCycle, isRiding: () => bike.mounted });

    // Fainting is not an ending: someone carries you home, and it costs a little.
    game.events.on('player:death', () => {
        const lost = Math.floor(coins.value() * 0.1);
        coins.add(-lost);
        game.effects.flash(1.2, 0x000000, 0.9);
        game.toasts.push(lost > 0 ? `You wake at home. ${lost}c missing from your purse.` : 'You wake at home.', { color: '#c8a0a0' });
    });
    game.events.on('player:respawn', () => {
        if (bike.mounted) bike.dismount();
        sleep();
    });

    //#endregion The Hollow

    //#region Days

    function sleep(message?: string): void {
        dayCycle.sleep();
        director.clear();
        if (message) game.toasts.push(message, { color: '#d0c8e0' });
        game.save.save(SAVE_SLOT);
    }

    dayCycle.hooks.onDayStart = (day) => {
        farm.newDay();
        villagers.newDay();
        game.toasts.push(`Day ${day}`, { color: '#e8e0c8' });
    };

    game.systems.add({
        name: 'clock-hud',
        order: SYSTEM_ORDER.EFFECTS,
        always: true,
        update: () => {
            game.hud.setStat('day', `Day ${dayCycle.day}`, dayCycle.clock);
            const request = villagers.requests?.open[0];
            game.hud.setObjective(request ? `${VILLAGERS.find((villager) => villager.id === request.from)?.name ?? '?'}: ${request.amount} ${pockets.inventory.registry.resolve(request.itemId).name.toLowerCase()} by day ${request.dueDay}` : 'Tend the farm');
        },
    });

    game.save.register('hollowmere', {
        save: () => ({ day: dayCycle.day, hour: dayCycle.hour, field: farm.toJSON() }),
        load: (data) => {
            const saved = data as { day?: number; hour?: number; field?: ReturnType<Farm['toJSON']> } | undefined;
            if (!saved) return;
            dayCycle.day = saved.day ?? 1;
            dayCycle.setHour(saved.hour ?? 7);
            if (saved.field) farm.fromJSON(saved.field);
        },
    });
    game.save.register('coins', { save: () => coins.value(), load: (value) => coins.set(Number(value ?? 30)) });

    //#endregion Days

    // A new farmer's kit.
    give('watering-can', 1);
    give('turnip-seed', 6);
    give('corn-seed', 3);
    give('fence-kit', 3);
    give('bread', 2);
    villagers.newDay();

    game.world = { ...world, farm, dayCycle, villagers, bike, barriers, director, pockets, bag, hotbar, coins, safeZones };
}

/** The cow and the hens, from their glTF models, with walk and idle clips. */
async function loadAnimals(game: Game): Promise<Array<{ definition: AnimalDefinition; animate: (speed: number, delta: number) => void }>> {
    const specs = [
        { id: 'cow', name: 'the cow', url: 'models/farm/cow.glb', length: 2.2, product: 'milk', every: 120, speed: 0.6 },
        { id: 'hen-1', name: 'the hen', url: 'models/farm/chicken_voxel.glb', length: 0.6, product: 'egg', every: 80, speed: 0.9 },
        { id: 'hen-2', name: 'the hen', url: 'models/farm/chicken_voxel.glb', length: 0.6, product: 'egg', every: 95, speed: 0.9 },
        { id: 'hen-3', name: 'the hen', url: 'models/farm/chicken_voxel.glb', length: 0.6, product: 'egg', every: 110, speed: 0.9 },
    ];
    return Promise.all(
        specs.map(async (spec) => {
            let object: THREE.Object3D;
            let mixer: THREE.AnimationMixer | undefined;
            let walk: THREE.AnimationAction | undefined;
            let idle: THREE.AnimationAction | undefined;
            try {
                const model = await game.assets.loadModel(spec.url);
                object = fitModel(model, { length: spec.length });
                const clips = (model.userData.animations as THREE.AnimationClip[] | undefined) ?? [];
                const clip = (name: string): THREE.AnimationClip | undefined => clips.find((candidate) => candidate.name.split('|').pop() === name);
                mixer = new THREE.AnimationMixer(model);
                const walkClip = clip('Walk') ?? clip('Run');
                const idleClip = clip('Idle') ?? clip('Idle_Peck') ?? clip('Eating');
                walk = walkClip ? mixer.clipAction(walkClip) : undefined;
                idle = idleClip ? mixer.clipAction(idleClip) : undefined;
                idle?.play();
            } catch {
                object = new THREE.Mesh(new THREE.BoxGeometry(spec.length * 0.5, spec.length * 0.4, spec.length), new THREE.MeshStandardMaterial({ color: 0xd8d0c0 }));
            }
            let walking = false;
            return {
                definition: { id: spec.id, name: spec.name, object, product: spec.product, every: spec.every, speed: spec.speed },
                animate: (speed: number, delta: number) => {
                    const moving = speed > 0.05;
                    if (moving !== walking && walk && idle) {
                        walking = moving;
                        (moving ? walk : idle).reset().fadeIn(0.3).play();
                        (moving ? idle : walk).fadeOut(0.3);
                    }
                    mixer?.update(delta);
                },
            };
        }),
    );
}

/** The player's walk cycle, driven by the character body's speed. */
export function animatePlayer(game: Game, animator: FolkAnimator): void {
    game.systems.add({ name: 'player-anim', order: SYSTEM_ORDER.GAMEPLAY + 7, update: (delta) => animator.update(game.player?.body.speed ?? 0, delta) });
}
