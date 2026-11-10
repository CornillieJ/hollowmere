import * as THREE from 'three';

import { createThirdPersonGame } from '../templates/third-person-game';
import { DEATH_MENU, PAUSE_MENU } from '../core/game-state';
import { DayCycle } from '../game/daycycle';
import { Farm } from '../game/farm';
import { Synth } from '../audio/synth';
import { fitModel } from '../helpers/transform';
import { SYSTEM_ORDER } from '../core/systems';
import {
    addAtmosphere,
    addBarriers,
    addCompass,
    addCraftingStation,
    addDamageFeedback,
    addGroundDrag,
    addPanel,
    addHotbar,
    addInventory,
    addLivestock,
    addMount,
    addNarration,
    addPopulation,
    addResource,
    addResourceNodes,
    addRetroLook,
    addSafeZones,
    addSaveMenu,
    addSettings,
    addUpgrades,
    addVillagers,
    type AnimalDefinition,
} from '../kit';
import { createFolk, createHeldTool, FolkAnimator, type FolkRig } from '../content/folk';
import { createBike, spinWheels } from '../content/bike';
import { COOKING, CROPS, ITEMS, NEEDS_CROP, POT_TIERS, STORE_STOCK, WOODWORK } from '../content/items';
import { REQUESTS, VILLAGERS } from '../content/villagers';
import { BEND, FARM, HAUNTS, MERE_LEVEL, PLACES, SAFE_ZONES, VILLAGE, WORLD_HALF, homeOf } from '../content/world';
import { buildWorld, stump } from './world';
import { setupMood } from './mood';
import { setupFarming, shipEverything } from './farming';
import { animateHollow, forgetHollow, hollowTarget, isNight, pickKind, spawnHollow, updateWatchers, type HollowKind } from './monsters';
import { buildFarmyard, buildInfirmary } from './farmyard';
import { OMEN_THOUGHTS, setupOmens } from './omens';
import { setupDread } from './dread';
import { INTRO, setupStory } from './story';
import { setupJournal } from './journal';
import { setupLetters } from './letters';

/**
 * Hollowmere: farm, cook, deliver, and keep moving.
 *
 * Everything below is a kit call or a template feature; the game's own code is
 * the content (people, items, places) and the few rules that make it this game.
 */
const SAVE_SLOT = 'hollowmere';
/** Real seconds per in-game day. */
const DAY_LENGTH = 600;
const LOOK_BASE = 0.0012;
const coin = (amount: number): string => `${amount}c`;

export async function boot(): Promise<void> {
    const cat = createFolk({ species: 'cat', fur: 0x2b2522, accent: 0xd9b8a0, clothes: 0x6b4f3a });

    const { game, world } = await createThirdPersonGame({
        title: 'Hollowmere',
        autoStart: false,
        saveSlot: SAVE_SLOT,
        arena: false,
        weapon: false,
        // The valley brings its own ground.
        scene: { preset: 'outdoor-dusk', groundSize: 0, fog: false },
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
                { action: 'journal', label: '📖' },
            ],
        },
        flow: { pointerLock: true, crosshairWhen: [] },
        game: { stats: false, exposeDebug: true },
    });
    const body = new FolkAnimator(cat);
    // What is in the hand shows in the hand.
    const heldTools = new Map((['axe', 'watering-can', 'candle'] as const).map((kind) => [kind as string, createHeldTool(kind)]));
    for (const tool of heldTools.values()) {
        tool.visible = false;
        body.hand?.add(tool);
    }
    const synth = new Synth(game);

    //#region Look and land

    const atmosphere = addAtmosphere(game, { color: 0x8b9488, density: 0.045, heightFalloff: 0.16, noiseScale: 0.05, noiseAmount: 0.7 });
    const look = addRetroLook(game, { resolutionScale: 0.36, psx: { colorLevels: 28, dither: 0.7 }, vhs: { wobble: 0.5, saturation: 0.72, noise: 0.07 } });
    game.renderer.toneMappingExposure = 1.1;

    const refs = await buildWorld(game);
    const { terrain } = refs;
    const ground = (x: number, z: number): number => terrain.heightAt(x, z);
    const at = (spot: { x: number; z: number }, lift = 0): THREE.Vector3 => terrain.point(spot.x, spot.z, lift);
    // The ground arrived after the player did.
    world.player.body.teleport(at(FARM.door, 0.2));

    buildFarmyard(game, game.scene, terrain, refs.solids);
    buildInfirmary(game.scene, terrain);
    const omens = setupOmens(game, terrain);

    const dayCycle = new DayCycle(game, { dayLength: DAY_LENGTH, startHour: 7 });
    setupMood(game, { dayCycle, atmosphere, lighting: world.scene.lighting, lamps: refs.lamps });
    const narration = addNarration(game, { speaker: 'You', portrait: '🐱' });

    //#endregion Look and land

    //#region Money and inventories

    const coins = addResource(game, { id: 'coins', label: 'Coins', initial: 20, integer: true, format: coin });
    const pockets = addInventory(game, { items: ITEMS, capacity: 8, title: 'Pockets', persist: 'pockets', primary: true });
    const bag = addInventory(game, { items: ITEMS, capacity: 20, key: 'inventory', keys: ['Tab'], title: 'Backpack', persist: 'bag', primary: false, columns: 5 });
    bag.offerTransfer('To pockets', pockets);
    pockets.offerTransfer('To backpack', bag);
    const hotbar = addHotbar(game, { inventory: pockets, slots: 8, useAction: 'use', onUse: (slot) => (slot.itemId === 'candle' ? void lightCandle() : farming.useHeld(slot)) });
    game.systems.add({
        name: 'player-anim',
        order: SYSTEM_ORDER.GAMEPLAY + 7,
        update: (delta) => {
            body.riding = bike.mounted;
            // Hands are on the bars while riding, so nothing is carried in them.
            for (const [id, tool] of heldTools) tool.visible = !bike.mounted && hotbar.selectedId === id;
            body.update(bike.mounted ? Math.abs(bike.speed) : (game.player?.body.speed ?? 0), delta);
        },
    });
    addDamageFeedback(game, { invulnerableSeconds: 1.6, onHit: () => synth.noise({ duration: 0.25, gain: 0.2, filter: 400 }) });
    const carried = [pockets, bag];
    const have = (itemId: string): number => pockets.count(itemId) + bag.count(itemId);

    /** New things go in the pockets, then the backpack. Returns how many did not fit. */
    const stow = (itemId: string, amount: number): number => {
        const leftover = pockets.add(itemId, amount);
        return leftover > 0 ? bag.add(itemId, leftover) : 0;
    };
    const give = (itemId: string, amount: number): boolean => {
        const lost = stow(itemId, amount);
        if (lost > 0) game.toasts.push('Your pockets and backpack are full', { color: '#ff9a9a' });
        return lost === 0;
    };
    /** Takes from the pockets first, then the backpack, as if they were one bag. */
    const takeCarried = (itemId: string, amount: number): boolean => {
        if (have(itemId) < amount) return false;
        const fromPockets = Math.min(amount, pockets.count(itemId));
        if (fromPockets > 0) pockets.remove(itemId, fromPockets);
        if (amount > fromPockets) bag.remove(itemId, amount - fromPockets);
        return true;
    };

    //#endregion Money and inventories

    //#region Farm, animals and the bike

    /** Counted for the story and the journal, and saved with the day. */
    const tally = { harvested: 0, cooked: 0, wood: 0 };
    const thoughts = new Set<string>();

    const farm = new Farm(game, {
        columns: FARM.field.columns,
        rows: FARM.field.rows,
        plotSize: 1.6,
        origin: { x: FARM.field.x, y: 0.02, z: FARM.field.z },
        extraFields: FARM.extraFields.map((field) => ({ origin: { x: field.x, y: 0.02, z: field.z }, columns: field.columns, rows: field.rows })),
        crops: CROPS,
        soil: { dry: 0x3a2e24, wet: 0x1e1612 },
    });
    const barriers = addBarriers(game, { enemies: world.enemies, lifetime: 150, toughness: 7, onBroken: () => game.toasts.push('A fence gave way', { color: '#c8a0a0' }) });
    const farming = setupFarming(game, { farm, pockets, hotbar, barriers, give, nodes: () => nodes, onHarvest: (_itemId, amount) => {
            tally.harvested += amount;
            today.picked += amount;
        },
        onWork: (kind, plot) => {
            body.play(kind === 'water' ? 'pour' : 'reach');
            if (kind !== 'water') return;
            synth.noise({ duration: 0.7, gain: 0.07, filter: 3200 });
            game.effects.particles.burst(plot.position.clone().setY(0.7), { count: 18, color: 0x8fb8c8, size: 0.04, speed: 1.2, lifetime: 0.7 });
        },
    });

    const livestock = addLivestock(game, {
        pen: { center: { x: FARM.pen.center.x, y: 0, z: FARM.pen.center.z }, halfSize: FARM.pen.halfSize },
        animals: [],
        inventory: pockets,
        onCollect: (animal) => game.effects.text(animal.object.position.clone().setY(1.4), `+1 ${animal.product}`, { color: 0xe8e0c8 }),
        animate: (animal, speed, delta) => herd.get(animal.id)?.(speed, delta),
    });
    /** Walk and idle clips per animal, by id. */
    const herd = new Map<string, (speed: number, delta: number) => void>();
    /** Bring the pen to this many of a kind, loading or removing animals as needed. */
    const setHerd = (kind: 'hen' | 'cow', count: number): void => {
        for (let index = 1; index <= 8; index += 1) {
            const id = `${kind}-${index}`;
            const present = herd.has(id);
            if (index <= count && !present) {
                // Claimed before the model arrives, so two quick calls cannot load the same animal twice.
                herd.set(id, () => undefined);
                void loadAnimal(game, kind, id, index).then((animal) => {
                    if (!herd.has(id)) return;
                    herd.set(id, animal.animate);
                    livestock.add(animal.definition);
                });
            } else if (index > count && present) {
                herd.delete(id);
                livestock.remove(id);
            }
        }
    };

    const bikeModel = createBike();
    const bike = addMount(game, {
        object: bikeModel,
        controller: world.controls,
        position: at(FARM.bike),
        yaw: FARM.bike.yaw,
        maxSpeed: 12,
        seat: { x: 0, y: 0.28, z: -0.05 },
        prompt: 'Ride the bicycle',
    });
    game.systems.add({ name: 'bike-wheels', order: SYSTEM_ORDER.GAMEPLAY + 6, update: (delta) => spinWheels(bikeModel, bike.speed * delta) });

    //#endregion Farm, animals and the bike

    //#region Gathering and making

    const nodes = addResourceNodes(game, {
        kinds: {
            tree: { name: 'dead tree', verb: 'Chop', tool: 'axe', toolName: 'axe', hits: 4, drops: [{ itemId: 'wood', amount: [2, 4] }], respawnSeconds: DAY_LENGTH * 2, solid: { radius: 0.45, height: 4 }, remains: stump },
            mushroom: { name: 'pale caps', verb: 'Pick', hits: 1, drops: [{ itemId: 'mushroom', amount: [1, 2] }], respawnSeconds: DAY_LENGTH },
            crate: { name: 'old crate', verb: 'Search', hits: 1, drops: [{ itemId: 'corn-seed', amount: 3 }] },
        },
        nodes: [
            ...refs.trees.map((object) => ({ kind: 'tree', object })),
            ...refs.spots.mushrooms.map((object) => ({ kind: 'mushroom', object })),
            { kind: 'crate', object: refs.spots.crate },
        ],
        held: () => hotbar.selectedId,
        give: (itemId, amount) => {
            give(itemId, amount);
            if (itemId === 'wood') tally.wood += amount;
            game.toasts.push(`+${amount} ${pockets.inventory.registry.resolve(itemId).name.toLowerCase()}`, { color: '#d8e8b0' });
        },
        onHit: (node) => {
            body.play(node.kindId === 'tree' ? 'swing' : 'reach');
            if (node.kindId !== 'tree') return;
            synth.noise({ duration: 0.09, gain: 0.16, filter: 700 + Math.random() * 400 });
            game.effects.particles.burst(node.object.position.clone().setY(node.object.position.y + 1), { count: 6, color: 0x4a3e32, size: 0.06, speed: 2, lifetime: 0.4 });
        },
        onDepleted: (node) => {
            if (node.kindId === 'tree') synth.tone({ frequency: 60, duration: 0.5, type: 'triangle', gain: 0.2, sweep: 0.5 });
        },
        persist: 'nodes',
    });

    const cookpot = addCraftingStation(game, {
        id: 'cookpot',
        title: 'Cooking',
        object: refs.spots.hearth,
        recipes: COOKING,
        tierNames: POT_TIERS,
        sources: carried,
        give: stow,
        prompt: 'Cook at the fire',
        verb: 'Cook',
        onStarted: () => {
            body.play('reach');
            synth.noise({ duration: 0.5, gain: 0.08, filter: 2400 });
        },
        onFinished: () => synth.tone({ frequency: 660, duration: 0.25, type: 'sine', gain: 0.12 }),
        onCollected: () => {
            tally.cooked += 1;
            today.cooked += 1;
        },
    });
    const bench = addCraftingStation(game, { id: 'bench', title: 'Workbench', object: refs.spots.workbench, recipes: WOODWORK, sources: carried, give: stow, prompt: 'Use the workbench', verb: 'Build' });

    // The fire and the pot: it flickers always, and steams while something is cooking.
    const flame = refs.spots.hearth.getObjectByName('flame');
    game.systems.add({
        name: 'hearth',
        order: SYSTEM_ORDER.EFFECTS,
        update: () => {
            const flicker = 0.85 + Math.sin(game.time.elapsed * 13) * 0.08 + Math.sin(game.time.elapsed * 31) * 0.07;
            flame?.scale.set(flicker, flicker * (cookpot.station.busy ? 1.5 : 1), flicker);
        },
    });

    //#endregion Gathering and making

    //#region The village

    const folk = new Map<string, { rig: FolkRig; animator: FolkAnimator }>();
    const villagers = addVillagers(game, {
        villagers: VILLAGERS.map((villager) => {
            const rig = createFolk(villager.look);
            folk.set(villager.id, { rig, animator: new FolkAnimator(rig) });
            const square = at({ x: VILLAGE.center.x + villager.spot.x, z: VILLAGE.center.z + villager.spot.z });
            const home = villager.home !== undefined ? homeOf(villager.home) : undefined;
            return {
            id: villager.id,
            name: villager.name,
            portrait: villager.portrait,
            object: rig.root,
            position: square,
            yaw: villager.spot.yaw,
            // Out in the square by day, on their own doorstep by night, facing out.
            ...(home && villager.hours ? { schedule: [{ from: villager.hours[0], position: square, yaw: villager.spot.yaw }, { from: villager.hours[1], position: at(home), yaw: home.yaw }] } : {}),
            lines: villager.lines,
            topics: villager.topics,
            thanks: villager.thanks,
            };
        }),
        day: () => dayCycle.day,
        hour: () => dayCycle.hour,
        heightAt: ground,
        animate: (id, speed, delta) => folk.get(id)?.animator.update(speed, delta),
        inventory: pockets,
        // Deliveries may come out of the backpack too.
        items: { count: have, remove: takeCarried },
        // Nobody here takes presents: they take what they asked for.
        gifts: false,
        requests: {
            // Nobody asks for what cannot be made yet: a dish waits for its pot, a crop for its seeds.
            templates: REQUESTS.map((template) => ({ ...template, available: () => canGrow(NEEDS_CROP[template.itemId]) })),
            maxOpen: 4,
            tier: () => Math.min(Math.floor((villagers.requests?.completed ?? 0) / 3), cookpot.station.tier),
        },
        onPaid: (amount) => {
            coins.add(amount);
            today.delivered += 1;
        },
        formatReward: coin,
        onExpired: (request) => {
            const name = VILLAGERS.find((villager) => villager.id === request.from)?.name ?? 'Someone';
            game.toasts.push(`${name} stopped waiting for ${request.amount} ${pockets.inventory.registry.resolve(request.itemId).name.toLowerCase()}`, { color: '#c8a0a0' });
            villagers.relationships.add(request.from, -25);
        },
        dialogue: { speed: 50 },
    });

    /** True when the player has, or can buy, the seeds for a crop. `undefined` means no crop is needed. */
    const canGrow = (crop: string | undefined): boolean => {
        if (!crop) return true;
        const seed = `${crop}-seed`;
        return stock.includes(seed) || have(seed) > 0 || have(crop) > 0 || farm.plots.some((plot) => plot.crop?.id === crop);
    };

    const stock = [...STORE_STOCK];
    const shop = addInventory(game, { items: ITEMS, mode: 'shop', title: "Barnaby's store", catalogue: stock, primary: false, customer: pockets, currency: { resource: coins, label: 'purse', format: coin }, filters: false });
    const counter = storeFurniture(false);
    counter.position.copy(at({ x: VILLAGE.store.x + 3, z: VILLAGE.store.z + 6 }));
    counter.rotation.y = VILLAGE.store.yaw;
    const lectern = storeFurniture(true);
    lectern.position.copy(at({ x: VILLAGE.store.x + 5.6, z: VILLAGE.store.z + 4.8 }));
    lectern.rotation.y = VILLAGE.store.yaw;
    game.scene.add(counter, lectern);
    game.interactions.add(counter, { prompt: 'Buy and sell at the store', range: 2.6, onInteract: () => shop.open() });

    const upgrades = addUpgrades(game, {
        title: "Barnaby's order book",
        currency: coins,
        format: coin,
        object: lectern,
        prompt: 'Read the order book',
        upgrades: [
            {
                id: 'field',
                name: 'More land',
                icon: '🌱',
                levels: [
                    { cost: 150, name: 'The east field', description: '12 more plots beside the first field.' },
                    { cost: 340, name: 'The long field', description: '18 more plots along the south fence.' },
                ],
                apply: (level) => farm.setActiveFields(1 + level),
            },
            {
                id: 'pot',
                name: 'A better pot',
                icon: '🍲',
                levels: [
                    { cost: 180, name: 'Iron pot', description: 'Cooks chowder, omelettes and pale broth.' },
                    { cost: 450, name: 'Cauldron', description: 'Cooks pumpkin pie and Hollowmere stew.' },
                ],
                apply: (level) => (cookpot.station.tier = 1 + level),
            },
            {
                id: 'seeds',
                name: 'Better seeds',
                icon: '🌽',
                levels: [
                    { cost: 80, name: 'Corn seeds', description: 'The store starts stocking corn.' },
                    { cost: 170, name: 'Pumpkin seeds', description: 'The store starts stocking pumpkins.' },
                ],
                apply: (level) => {
                    stock.length = 0;
                    stock.push('turnip-seed', 'wheat-seed', ...(level >= 1 ? ['corn-seed'] : []), ...(level >= 2 ? ['pumpkin-seed'] : []), 'fence-kit', 'candle');
                },
            },
            { id: 'hen', name: 'Another hen', icon: '🐔', description: 'One more hen in the pen, laying eggs.', levels: [{ cost: 90 }, { cost: 120 }, { cost: 160 }], apply: (level) => setHerd('hen', 2 + level) },
            { id: 'cow', name: 'Another cow', icon: '🐄', description: 'One more cow in the pen, giving milk.', levels: [{ cost: 260 }, { cost: 360 }], apply: (level) => setHerd('cow', 1 + level) },
        ],
    });
    setHerd('hen', 2);
    setHerd('cow', 1);

    //#endregion The village

    //#region Home

    const bin = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.8, 0.9), new THREE.MeshStandardMaterial({ color: 0x5a4430, roughness: 1 }));
    bin.position.copy(at(FARM.shipping, 0.4));
    bin.castShadow = true;
    game.scene.add(bin);
    game.interactions.add(bin, {
        prompt: 'Ship produce and cooked food',
        range: 2.2,
        onInteract: () => {
            const made = shipEverything(carried, coins, (itemId) => shop.inventory.sellPrice(itemId));
            game.toasts.push(made > 0 ? `Shipped for ${coin(made)}` : 'Nothing to ship', { color: made > 0 ? '#d8e8b0' : '#c0b0a0' });
        },
    });

    const door = new THREE.Object3D();
    door.position.copy(at({ x: FARM.door.x - 1.5, z: FARM.door.z }));
    game.scene.add(door);
    game.interactions.add(door, { prompt: 'Sleep until morning', range: 2.2, onInteract: () => goToBed() });

    //#endregion Home

    //#region The Hollow

    const safeZones = addSafeZones(game, {
        enemies: world.enemies,
        zones: SAFE_ZONES.map((zone) => ({ ...zone, position: { ...zone.position, y: ground(zone.position.x, zone.position.z) } })),
        onEnter: (zone) => {
            game.hud.setStat('safe', zone.name ?? 'Safe', 'here');
            think('safe', ['They stop at the light. Remember that.']);
        },
        onLeave: () => game.hud.removeStat('safe'),
    });
    /** A grave candle on the ground: a small ring of safety that burns down. */
    const CANDLE_SECONDS = 90;
    const lightCandle = (): boolean => {
        const player = game.player;
        if (!player || !takeCarried('candle', 1)) return false;
        body.play('reach');
        const spot = player.position.clone();
        const candle = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.26, 0.1), new THREE.MeshStandardMaterial({ color: 0xfff2d0, emissive: 0xffc070, emissiveIntensity: 3 }));
        candle.position.copy(spot).setY(spot.y + 0.13);
        const glow = new THREE.PointLight(0xffb36b, 7, 8, 1.6);
        glow.position.y = 0.5;
        candle.add(glow);
        game.scene.add(candle);
        const zone = { position: { x: spot.x, y: spot.y, z: spot.z }, radius: 3.2, name: 'Candle' };
        safeZones.add(zone, { seconds: CANDLE_SECONDS, onExpire: () => candle.removeFromParent() });
        // It gutters for the last 15 seconds, which is the warning to move.
        const stop = game.systems.add({
            name: 'candle',
            order: SYSTEM_ORDER.EFFECTS,
            update: () => {
                const left = safeZones.remaining(zone);
                if (left === undefined) return void stop();
                glow.intensity = left < 15 ? 2 + Math.abs(Math.sin(game.time.elapsed * 9)) * 4 : 7;
            },
        });
        synth.tone({ frequency: 880, duration: 0.15, type: 'sine', gain: 0.06 });
        think('candle', ['A little light, and they keep off. It will not burn long.']);
        return true;
    };

    // The mere is knee deep: wading is slow, and the Hollow do not mind the water.
    addGroundDrag(game, {
        movement: world.controls.movement,
        dragAt: (position) => (MERE_LEVEL - position.y) / 0.6,
        onEnter: () => {
            synth.noise({ duration: 0.4, gain: 0.1, filter: 1200 });
            think('wade', ['Cold. And it pulls at the legs. I will not get anywhere fast in this.']);
        },
    });

    const population = addPopulation(game, {
        enemies: world.enemies,
        target: () => hollowTarget(dayCycle, hunting()),
        spawn: (position, post) => spawnHollow(world.enemies, position, { night: isNight(dayCycle), post, hunting: hunting(), kind: pickKind(dayCycle.day) }),
        interval: () => (isNight(dayCycle) ? [2.5, 5] : [5, 10]),
        // Not in a lit place, not on a cliff, and not standing in the water.
        canSpawnAt: (position) => !safeZones.zoneAt(position) && terrain.slopeAt(position.x, position.z) < 0.15 && ground(position.x, position.z) > MERE_LEVEL + 0.3,
        heightAt: ground,
        bounds: WORLD_HALF - 16,
        posts: HAUNTS,
        onDespawn: forgetHollow,
    });
    setupDread(game, { enemies: world.enemies, look, dayCycle, isRiding: () => bike.mounted });
    game.systems.add({ name: 'watchers', order: SYSTEM_ORDER.GAMEPLAY - 2, update: () => updateWatchers(game.camera) });

    /**
     * Until the first night is behind the farmer, the Hollow keep their distance:
     * a few wander the valley and can be met, but none come looking, and the
     * whole farm is ground they stay off. After that only the lit places are.
     */
    const hunting = (): boolean => story.story.completed.some((step) => step.id === 'sleep');
    let quietFarm: (() => void) | undefined = safeZones.add({ position: { x: FARM.centre.x, y: 0, z: FARM.centre.z }, radius: 31, name: 'The farm', ring: false });
    function endQuiet(): void {
        if (!quietFarm || !hunting()) return;
        quietFarm();
        quietFarm = undefined;
        // The ones already out there were made harmless; let them go and the real ones come.
        population.clear();
        think('yard', ['Tracks in the yard this morning. Right up to the field.', 'They come onto the farm now. Only the porch and the barn lamp keep them off.']);
    }

    // They kill. The farmer is found, days later, and wakes in the infirmary with nothing but their tools.
    const DAYS_LOST = 3;
    game.events.on('player:death', () => {
        if (bike.mounted) bike.dismount();
        game.effects.flash(1.6, 0x1a0000, 0.95);
        synth.tone({ frequency: 52, duration: 2.2, type: 'sawtooth', gain: 0.22, sweep: 0.4 });
        window.setTimeout(() => world.flow.die(), 900);
    });
    game.menus.register(DEATH_MENU, {
        title: 'You died',
        subtitle: `They found you in the fog and carried you to the infirmary. ${DAYS_LOST} days are gone, and so is everything you carried. Your tools were kept for you.`,
        buttons: [{ label: 'Wake up', primary: true, action: () => world.flow.restart() }],
    });
    game.events.on('state:changed', ({ from, to }) => {
        if (from === 'dead' && to === 'playing') wake();
    });
    function wake(): void {
        for (const inventory of carried) {
            for (const slot of [...inventory.inventory.slots]) if (!slot.definition.keep) inventory.remove(slot.itemId, slot.amount);
        }
        // The last of the lost days ends with a morning, like any other.
        dayCycle.day += DAYS_LOST - 1;
        sleep();
        const bed = homeOf(VILLAGE.infirmary);
        world.player.body.teleport(at({ x: bed.x + 0.4, z: bed.z + 0.8 }, 0.2));
        narration.clear();
        narration.say(['The infirmary. Clean sheets. Nobody about.', `${DAYS_LOST} days gone, and my pockets with them. Whoever was waiting on me has stopped waiting.`, 'They left my tools by the cot. Back to the farm, then. More carefully.']);
        saves.save();
    }

    //#endregion The Hollow

    //#region Story, notebook and thoughts

    const letters = setupLetters(game, {
        mailbox: at({ x: FARM.door.x + 1.5, z: FARM.door.z + 3.2 }),
        bend: at(BEND),
        bendYaw: BEND.yaw,
        day: () => dayCycle.day,
        narration,
        onGift: () => {
            give('name-slip', 1);
            game.toasts.push('Pell gives you a folded slip of paper', { color: '#ffe08a' });
        },
    });

    const story = setupStory(game, narration, {
        planted: () => farm.plantedCount + tally.harvested,
        watered: () => farm.plots.filter((plot) => plot.watered || plot.ripe).length + tally.harvested,
        wood: () => tally.wood,
        harvested: () => tally.harvested,
        cooked: () => tally.cooked,
        metShopkeeper: () => villagers.hasMet('barnaby'),
        delivered: () => villagers.requests?.completed ?? 0,
        day: () => dayCycle.day,
        lettersRead: () => letters.read,
        lettersTotal: letters.total,
        placesFound: () => SIGHTS.filter((sight) => thoughts.has(sight.id)).length,
        potTier: () => cookpot.station.tier,
        bestHearts: () => Math.max(...VILLAGERS.map((villager) => villagers.relationships.hearts(villager.id))),
        metPell: () => letters.metPell,
        reward: (amount) => {
            coins.add(amount);
            game.toasts.push(`+${coin(amount)}`, { color: '#ffe08a' });
        },
    });
    const journal = setupJournal(game, {
        story,
        villagers,
        stations: [
            { label: 'The pot', handle: cookpot, tiers: POT_TIERS },
            { label: 'The workbench', handle: bench },
        ],
        registry: pockets.inventory.registry,
        have,
        day: () => dayCycle.day,
    });

    // The compass: home, the village, and wherever the current task is.
    const fieldCentre = { x: FARM.field.x + 2.4, z: FARM.field.z + 1.6 };
    const mailboxSpot = { x: FARM.door.x + 1.5, z: FARM.door.z + 3.2 };
    const TARGETS: Record<string, { x: number; z: number }> = {
        wake: fieldCentre,
        plant: fieldCentre,
        water: fieldCentre,
        harvest: fieldCentre,
        chop: FARM.orchard[0] as { x: number; z: number },
        cook: FARM.hearth,
        ride: VILLAGE.center,
        meet: { x: VILLAGE.center.x - 6, z: VILLAGE.center.z + 4 },
        sleep: FARM.door,
        mailbox: mailboxSpot,
        letters: mailboxSpot,
        pot: { x: VILLAGE.store.x + 5.6, z: VILLAGE.store.z + 4.8 },
        pell: BEND,
    };
    addCompass(game, {
        markers: () => {
            const step = story.story.current?.id;
            const target = step === 'deliver' ? villagerSpot(villagers.requests?.open[0]?.from) : step ? TARGETS[step] : undefined;
            return [
                { glyph: '🏠', position: { x: FARM.door.x, y: 0, z: FARM.door.z }, hideWithin: 14 },
                { glyph: '🕯', position: { x: VILLAGE.center.x, y: 0, z: VILLAGE.center.z }, hideWithin: 22 },
                ...(target ? [{ glyph: '➤', position: { x: target.x, y: 0, z: target.z }, hideWithin: 3 }] : []),
            ];
        },
    });
    const villagerSpot = (id: string | undefined): { x: number; z: number } | undefined => (id ? game.scene.getObjectByName(`villager-${id}`)?.position : undefined);

    /** Something the farmer thinks once, the first time it comes up. */
    function think(id: string, lines: string[]): void {
        if (thoughts.has(id) || !game.state.is('playing')) return;
        thoughts.add(id);
        narration.say(lines);
    }
    const SIGHTS: Array<{ id: string; spot: { x: number; z: number }; within: number; lines: string[] }> = [
        { id: 'mere', spot: PLACES.mere, within: 26, lines: ['Still water. No wind on it at all.', 'So this is the mere. I do not think I will drink from it.'] },
        { id: 'lookout', spot: PLACES.lookout, within: 8, lines: ['Above the mist, at last.', 'From up here it almost looks like home. Almost.'] },
        { id: 'stones', spot: PLACES.stones, within: 11, lines: ['Somebody stood these up. Somebody still keeps the candle lit.'] },
        { id: 'ruin', spot: PLACES.ruin, within: 12, lines: ['Another farm. Another farmer.', 'The scarecrow is facing the house.'] },
        { id: 'graveyard', spot: PLACES.graveyard, within: 11, lines: ['One of these is open. And empty.'] },
    ];
    /**
     * Nobody can get stuck. A farmer with no seeds, nothing growing and no money
     * for more finds a few on the doorstep, at most once a day, and a lost tool
     * always finds its way back.
     */
    let rescuedOn = 0;
    const SEEDS = CROPS.map((crop) => crop.seed as string);
    function rescue(): void {
        for (const tool of ['watering-can', 'axe']) {
            if (have(tool) === 0 && give(tool, 1)) narration.say([`My ${tool === 'axe' ? 'axe' : 'watering can'}, leaning against the door. Fen must have found it on the road.`]);
        }
        if (rescuedOn === dayCycle.day) return;
        const broke = coins.value() < 4 && farm.plantedCount === 0 && SEEDS.every((seed) => have(seed) === 0) && have('turnip') === 0 && have('wheat') === 0;
        if (!broke || !give('turnip-seed', 3)) return;
        rescuedOn = dayCycle.day;
        narration.say(['A paper twist of turnip seeds on the doorstep.', 'Barnaby has written on it: "On account. Do not let it happen twice."']);
    }
    let thoughtTimer = 0;
    game.systems.add({
        name: 'thoughts',
        order: SYSTEM_ORDER.GAMEPLAY + 9,
        update: (delta) => {
            thoughtTimer -= delta;
            const player = game.player?.position;
            if (thoughtTimer > 0 || !player) return;
            thoughtTimer = 0.5;
            rescue();
            endQuiet();
            const sign = omens.near(player);
            if (sign) think(`omen-${sign}`, OMEN_THOUGHTS[sign]);
            for (const sight of SIGHTS) if (Math.hypot(player.x - sight.spot.x, player.z - sight.spot.z) < sight.within) think(sight.id, sight.lines);
            if (dayCycle.hour >= 18 && dayCycle.hour < 21) think('dusk', ['The light is going. There will be more of them soon.', 'A lamp, a door, or the bicycle. Not the open road.']);
            const nearest = world.enemies.nearest(player);
            if (nearest && nearest.root.position.distanceTo(player) < 9 && !safeZones.playerSafe) think('hollow', ['It has seen me.', 'It is slow. I am not. Walk away and it loses interest.']);
        },
    });

    //#endregion Story, notebook and thoughts

    //#region Days and saving

    /** What the day came to, shown on waking after a night in bed. */
    const today = { earned: 0, delivered: 0, cooked: 0, picked: 0 };
    coins.onChange((_value, delta) => {
        if (delta > 0) today.earned += delta;
    });
    const morning = addPanel(game, {
        title: 'Morning',
        rows: () => [
            { icon: '🌅', title: `Day ${dayCycle.day}`, detail: nightLine },
            { heading: true, title: 'Yesterday' },
            { icon: '🪙', title: 'Earned', meta: coin(today.earned) },
            { icon: '❗', title: 'Requests filled', meta: String(today.delivered) },
            { icon: '🍲', title: 'Dishes cooked', meta: String(today.cooked) },
            { icon: '🌱', title: 'Crops picked', meta: String(today.picked) },
            ...(letters.waiting ? [{ icon: '✉', title: 'There is a letter in the mailbox' }] : []),
            ...(cookpot.station.ready.length > 0 ? [{ icon: '🍲', title: 'The pot finished overnight' }] : []),
            { title: 'Saved.', dim: true, action: { label: 'Get up', onPress: () => morning.close() } },
        ],
        onClose: () => Object.assign(today, { earned: 0, delivered: 0, cooked: 0, picked: 0 }),
    });
    const NIGHTS = [
        'Something scratched at the door until dawn.',
        'You dreamed of a kitchen. You could not find the door out of it.',
        'Footsteps went round the house all night, slowly, the same way each time.',
        'Somebody stood at the window for a while. They were only looking.',
        'It was quiet. You lay awake waiting for it not to be.',
        'You woke once and the lamp on the porch was lit. You had not lit it.',
    ];
    let nightLine = NIGHTS[0] as string;

    function sleep(message?: string): void {
        dayCycle.sleep();
        // A night is long enough for anything left on the fire or the bench.
        cookpot.skip(DAY_LENGTH);
        bench.skip(DAY_LENGTH);
        population.clear();
        villagers.snapToSchedule();
        if (message) game.toasts.push(message, { color: '#d0c8e0' });
        saves.save();
    }

    /** Going to bed on purpose: the night passes, and the morning adds the day up. */
    function goToBed(): void {
        nightLine = NIGHTS[dayCycle.day % NIGHTS.length] as string;
        game.effects.flash(0.9, 0x000000, 0.95);
        sleep();
        morning.open();
    }

    dayCycle.hooks.onDayStart = (day) => {
        farm.newDay();
        villagers.newDay();
        omens.setDay(day);
        game.toasts.push(`Day ${day}`, { color: '#e8e0c8' });
    };

    game.systems.add({
        name: 'clock-hud',
        order: SYSTEM_ORDER.EFFECTS,
        always: true,
        update: () => {
            game.hud.setStat('day', `Day ${dayCycle.day}`, dayCycle.clock);
            if (!story.finished) return;
            // After the first day the best paid request is the thing to chase.
            const request = [...(villagers.requests?.open ?? [])].sort((a, b) => b.reward - a.reward)[0];
            const name = request ? pockets.inventory.registry.resolve(request.itemId).name.toLowerCase() : '';
            game.hud.setObjective(request ? `${VILLAGERS.find((villager) => villager.id === request.from)?.name ?? '?'} wants ${request.amount} ${name} (${coin(request.reward)}). J for the notebook` : 'Tend the farm. J for the notebook');
        },
    });

    type Saved = { day?: number; hour?: number; field?: ReturnType<Farm['toJSON']>; tally?: typeof tally; thoughts?: string[] };
    game.save.register('hollowmere', {
        save: (): Saved => ({ day: dayCycle.day, hour: dayCycle.hour, field: farm.toJSON(), tally: { ...tally }, thoughts: [...thoughts] }),
        load: (data) => {
            const saved = data as Saved | undefined;
            if (!saved) return;
            dayCycle.day = saved.day ?? 1;
            dayCycle.setHour(saved.hour ?? 7);
            omens.setDay(dayCycle.day);
            if (saved.field) farm.fromJSON(saved.field);
            Object.assign(tally, saved.tally);
            thoughts.clear();
            for (const id of saved.thoughts ?? []) thoughts.add(id);
        },
    });
    game.save.register('coins', { save: () => coins.value(), load: (value) => coins.set(Number(value ?? 20)) });

    const settings = addSettings(game, {
        namespace: 'hollowmere',
        volume: ['master', 'ambient', 'sfx'],
        settings: [
            { id: 'look', label: 'Mouse sensitivity', kind: 'slider', min: 0.2, max: 2, step: 0.05, default: 1, percent: true, apply: (value) => (world.controls.look.sensitivity = LOOK_BASE * value) },
            { id: 'vhs', label: 'VHS tape (wobble, colour fringes, static)', kind: 'toggle', default: true, apply: (on) => look.setVhs(on) },
            { id: 'shimmer', label: 'PS1 shimmer (wobbling edges)', kind: 'slider', min: 0, max: 1.5, step: 0.05, default: 0.6, percent: true, apply: (value) => look.setSnapStrength(value) },
            { id: 'psx', label: 'PS1 colours (dithering)', kind: 'toggle', default: true, apply: (on) => look.setPsx(on) },
            { id: 'mist', label: 'Drifting mist', kind: 'toggle', default: true, apply: (on) => atmosphere.setNoise(on ? 0.7 : 0) },
            { id: 'shake', label: 'Screen shake', kind: 'toggle', default: true, apply: (on) => (game.effects.shakeEnabled = on) },
        ],
    });
    const saves = addSaveMenu(game, {
        flow: world.flow,
        slot: SAVE_SLOT,
        title: 'Hollowmere',
        subtitle: 'Grow. Cook. Deliver. Keep moving.',
        hint: 'WASD to walk, E to interact, F to use what you hold, 1 to 8 to pick it, Tab for the bag, J for the notebook',
        describe: (save) => `day ${(save.data.hollowmere as Saved | undefined)?.day ?? 1}`,
        onNewGame: () => void narration.speak(INTRO),
        onContinue: () => villagers.snapToSchedule(),
        buttons: [settings.button],
    });
    game.menus.register(PAUSE_MENU, {
        title: 'Paused',
        buttons: [
            { label: 'Resume', primary: true, action: () => world.flow.resume() },
            saves.saveButton,
            settings.button,
            { label: 'Main menu', action: () => world.flow.quit() },
        ],
    });

    //#endregion Days and saving

    // What the farmer woke up with.
    give('watering-can', 1);
    give('axe', 1);
    give('turnip-seed', 5);
    give('wheat-seed', 3);
    give('fence-kit', 2);
    give('candle', 1);
    villagers.newDay();

    game.world = { ...world, narration, body, terrain, farm, dayCycle, villagers, bike, barriers, population, pockets, bag, hotbar, coins, safeZones, nodes, cookpot, bench, upgrades, story, journal, saves, settings, shop, tally, letters, morning, lightCandle, goToBed, omens, wake, hunting,
        // For the probe and for trying things out from the console.
        spawnKind: (x: number, z: number, kind: HollowKind) => spawnHollow(world.enemies, terrain.point(x, z, 0.4), { night: isNight(dayCycle), hunting: hunting(), kind }),
    };
}

/** A counter for the store, or the stand its order book lies on. */
function storeFurniture(lectern: boolean): THREE.Object3D {
    const group = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ color: 0x4e3e2e, roughness: 1, flatShading: true });
    const body = new THREE.Mesh(lectern ? new THREE.BoxGeometry(0.5, 1.1, 0.5) : new THREE.BoxGeometry(2, 0.95, 0.7), wood);
    body.position.y = lectern ? 0.55 : 0.47;
    body.castShadow = true;
    group.add(body);
    if (lectern) {
        const book = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.06, 0.34), new THREE.MeshStandardMaterial({ color: 0x1e3a2a, roughness: 0.9 }));
        book.position.set(0, 1.15, 0);
        book.rotation.x = -0.35;
        group.add(book);
    }
    return group;
}

/** A hen or a cow from its glTF model, with walk and idle clips. */
async function loadAnimal(game: Game, kind: 'hen' | 'cow', id: string, index: number): Promise<{ definition: AnimalDefinition; animate: (speed: number, delta: number) => void }> {
    const spec =
        kind === 'cow'
            ? { name: 'the cow', url: 'models/farm/cow.glb', length: 2.2, product: 'milk', every: 110 + index * 10, speed: 0.6 }
            : { name: 'the hen', url: 'models/farm/chicken_voxel.glb', length: 0.6, product: 'egg', every: 70 + index * 12, speed: 0.9 };
    let object: THREE.Object3D;
    let mixer: THREE.AnimationMixer | undefined;
    let walk: THREE.AnimationAction | undefined;
    let idle: THREE.AnimationAction | undefined;
    try {
        // Each animal needs its own skeleton, so the model is loaded fresh rather than cloned.
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
        definition: { id, name: spec.name, object, product: spec.product, every: spec.every, speed: spec.speed },
        animate: (speed, delta) => {
            const moving = speed > 0.05;
            if (moving !== walking && walk && idle) {
                walking = moving;
                (moving ? walk : idle).reset().fadeIn(0.3).play();
                (moving ? idle : walk).fadeOut(0.3);
            }
            mixer?.update(delta);
        },
    };
}
