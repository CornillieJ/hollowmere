import * as THREE from 'three';

import { createThirdPersonGame } from '../templates/third-person-game';
import { DEATH_MENU, PAUSE_MENU, VICTORY_MENU } from '../core/game-state';
import { DayCycle } from '../game/daycycle';
import { Farm } from '../game/farm';
import { fitModel } from '../helpers/transform';
import { createBillboardLabel, faceCamera } from '../helpers/text';
import { addFullscreenButton } from '../helpers/fullscreen';
import { SYSTEM_ORDER } from '../core/systems';
import {
    addAchievements,
    addAtmosphere,
    addBarriers,
    addCompass,
    addCraftingStation,
    addDamageFeedback,
    addGroundDrag,
    addPanel,
    addHotbar,
    addInventory,
    addJuice,
    addMusicBox,
    addLivestock,
    addMount,
    addNarration,
    addPack,
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
import { createFolk, createHeldTool, dressFolk, FolkAnimator, type FolkRig } from '../content/folk';
import { createBike } from '../content/bike';
import { COOKING, CROPS, ITEMS, NEEDS_CROP, POT_TIERS, STORE_STOCK, WOODWORK } from '../content/items';
import { REQUESTS, VILLAGERS } from '../content/villagers';
import { FARM, HAUNTS, POOL_LEVEL, PELL_SPOT, PLACES, SAFE_ZONES, VILLAGE, WORLD_HALF, WRAP_AT, homeOf } from '../content/world';
import { buildWorld, solid, stump } from './world';
import { setupMood } from './mood';
import { setupFarming } from './farming';
import { useHollowModels, animateHollow, forgetHollow, hollowTarget, isNight, pickKind, setNightTemper, setScent, spawnHollow, type HollowKind } from './monsters';
import { buildFarmyard, buildInfirmary } from './farmyard';
import { modelOnly, modelled } from './models';
import { setupCrate } from './crate';
import { setupBarn } from './barn';
import { HOT_HOURS, setupWarmth } from './warmth';
import { LANTERN, setupLanterns } from './lanterns';
import { setupScarecrows } from './scarecrows';
import { setupRegulars } from './regulars';
import { REGULARS } from '../content/regulars';
import { setupWrongness } from './wrongness';
import { STAY_SLIDES, WAKE_SLIDES, setupEnding } from './ending';
import { HELD_PLACEHOLDER, setupPlates, type PlatesHandle } from './plates';
import { OMEN_THOUGHTS, setupOmens } from './omens';
import { setupDread } from './dread';
import { INTRO, setupStory } from './story';
import { worded } from './wording';
import { setupWeather } from './weather';
import { setupWhispers } from './whispers';
import { setupPool } from './pool';
import { setupJournal } from './journal';
import { setupLetters } from './letters';
import { ESCAPE, setupEscape } from './escape';
import { setupHappenings } from './happenings';

/**
 * Hollowveil: farm, cook, deliver, and keep moving.
 *
 * Everything below is a kit call or a template feature; the game's own code is
 * the content (people, items, places) and the few rules that make it this game.
 */
const SAVE_SLOT = 'hollowveil-farm';
/** Real seconds per in-game day. */
const DAY_LENGTH = 600;
/** Real seconds in one hour on the clock. */
const HOUR_SECONDS = DAY_LENGTH / 24;
const LOOK_BASE = 0.0012;
const coin = (amount: number): string => `${amount}c`;

export async function boot(): Promise<void> {
    const cat = createFolk({ species: 'cat', fur: 0x2b2522, accent: 0xd9b8a0, clothes: 0x6b4f3a });

    const { game, world } = await createThirdPersonGame({
        title: 'Hollowveil Farm',
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
            // What is in the hand; it opens the pockets, which a phone otherwise keeps folded away.
            actions: [{ label: HELD_PLACEHOLDER, onClick: () => plates?.togglePockets() }],
        },
        flow: { pointerLock: true, crosshairWhen: [] },
        game: { stats: false, exposeDebug: true },
    });
    let plates: PlatesHandle | undefined;
    void dressFolk(game, cat, 'farmer');
    const body = new FolkAnimator(cat);
    // What is in the hand shows in the hand.
    const heldTools = new Map((['axe', 'watering-can', 'candle'] as const).map((kind) => [kind as string, createHeldTool(kind, game)]));
    for (const tool of heldTools.values()) {
        tool.visible = false;
        body.hand?.add(tool);
    }
    const juice = addJuice(game);
    const synth = juice.synth;

    //#region Look and land

    const atmosphere = addAtmosphere(game, { color: 0x8b9488, density: 0.045, heightFalloff: 0.16, noiseScale: 0.05, noiseAmount: 0.7 });
    const look = addRetroLook(game, { resolutionScale: 0.36, psx: { colorLevels: 28, dither: 0.7 }, vhs: { wobble: 0.5, saturation: 0.72, noise: 0.07 } });
    game.renderer.toneMappingExposure = 1.1;

    const say = worded(game);
    if (game.device.touch) for (const item of ITEMS) if (item.description) item.description = say(item.description);

    const refs = await buildWorld(game);
    const { terrain } = refs;
    const ground = (x: number, z: number): number => terrain.heightAt(x, z);
    const at = (spot: { x: number; z: number }, lift = 0): THREE.Vector3 => terrain.point(spot.x, spot.z, lift);
    // The ground arrived after the player did.
    world.player.body.teleport(at(FARM.door, 0.2));

    useHollowModels(game, world.enemies);
    const yard = buildFarmyard(game, game.scene, terrain, refs.solids);
    buildInfirmary(game.scene, terrain);
    const omens = setupOmens(game, terrain);

    const dayCycle = new DayCycle(game, { dayLength: DAY_LENGTH, startHour: 7, stopAtHour: 3 });
    setupMood(game, { dayCycle, atmosphere, lighting: world.scene.lighting, lamps: refs.lamps });
    const narration = addNarration(game, { speaker: 'You', portrait: '🐱' });

    //#endregion Look and land

    //#region Money and inventories

    const coins = addResource(game, { id: 'coins', label: 'Coins', initial: 20, integer: true, format: coin, showInHud: false });
    const pockets = addInventory(game, { items: ITEMS, capacity: 8, title: 'Pockets', persist: 'pockets', primary: true });
    /** Backpack slots by upgrade level. It starts small on purpose: what to carry is a choice. */
    const BAG_SLOTS = [3, 6, 10, 16];
    const bag = addInventory(game, { items: ITEMS, capacity: BAG_SLOTS[0] as number, title: 'Backpack', persist: 'bag', primary: false });
    const chest = addInventory(game, { items: ITEMS, capacity: 16, title: 'Chest', persist: 'chest', primary: false });

    /** What is dropped lies on the ground in front of the farmer until it is picked up again. */
    const dropInWorld = (itemId: string, amount: number): void => {
        const player = game.player;
        if (!player) return;
        const yaw = player.root.rotation.y;
        const x = player.position.x + Math.sin(yaw) * 1.3;
        const z = player.position.z + Math.cos(yaw) * 1.3;
        // At the farmer's own height: the ground is not always what is underfoot.
        layDown({ itemId, amount, x, y: player.position.y + 0.45, z });
    };
    /** What lies about, so it is still there after a reload. */
    type Drop = { itemId: string; amount: number; x: number; y: number; z: number };
    const drops = new Map<THREE.Object3D, Drop>();
    const layDown = (drop: Drop): void => {
        const name = pockets.inventory.registry.resolve(drop.itemId).name;
        const pickup = world.pickups.spawn({
            position: new THREE.Vector3(drop.x, drop.y, drop.z),
            itemId: drop.itemId,
            amount: drop.amount,
            collect: 'interact',
            prompt: `Pick up ${drop.amount > 1 ? `${drop.amount} ` : ''}${name.toLowerCase()}`,
            color: 0xd8c8a0,
            size: 0.22,
            onCollect: (_game, object) => drops.delete(object),
        });
        drops.set(pickup, drop);
    };
    game.save.register('drops', {
        save: (): Drop[] => [...drops.values()],
        load: (data) => {
            for (const pickup of drops.keys()) world.pickups.remove(pickup);
            drops.clear();
            for (const drop of Array.isArray(data) ? (data as Drop[]) : []) if (pockets.inventory.registry.get(drop.itemId)) layDown(drop);
        },
    });
    const stats = (): Array<{ icon: string; label: string; value: string }> => [
        { icon: '❤', label: 'Health', value: `${Math.ceil(game.player?.health.current ?? 0)}/${game.player?.health.max ?? 100}` },
        { icon: '🪙', label: 'Coins', value: coin(coins.value()) },
        { icon: isNight(dayCycle) ? '☾' : '☀', label: dayCycle.clock, value: `Day ${dayCycle.day}` },
        { icon: '❗', label: 'Requests filled', value: String(villagers.requests?.completed ?? 0) },
        { icon: '♥', label: 'Hearts', value: String(VILLAGERS.reduce((total, villager) => total + villagers.relationships.hearts(villager.id), 0)) },
        ...(escape.pledge.state === 'running' ? [{ icon: '🌅', label: `${escape.pledge.daysLeft} days to wake`, value: coin(escape.pledge.remaining) }] : []),
    ];
    const pack = addPack(game, {
        title: 'Backpack',
        key: 'inventory',
        keys: ['Tab'],
        sections: [
            { label: 'Backpack', inventory: bag },
            { label: 'Pockets', inventory: pockets },
        ],
        stats,
        onDrop: dropInWorld,
    });
    const chestPack = addPack(game, {
        title: 'Barn chest',
        sections: [
            { label: 'Chest', inventory: chest },
            { label: 'Backpack', inventory: bag },
            { label: 'Pockets', inventory: pockets },
        ],
        onDrop: dropInWorld,
    });
    const escape = setupEscape(game, { coins, day: () => dayCycle.day, narration, format: coin });
    const hotbar = addHotbar(game, { inventory: pockets, slots: 8, useAction: 'use', onUse: (slot) => (dayCycle.stalled ? undefined : slot.itemId === 'candle' ? void lightCandle() : slot.itemId === 'lantern' ? void lanterns.place() : slot.itemId === 'scarecrow' ? void scarecrows.place() : farming.useHeld(slot)) });
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

    /** A call paid after dark is worth this much more: nobody expects the door to be knocked on then. */
    const NIGHT_PAY = 0.5;
    const lateCall = (): void => think('late', ['They did not expect anybody at the door after dark. They paid half as much again, and did not count it.', '(Every delivery made at night pays 50% more. The road there is the price.)']);

    /** Counted for the story and the journal, and saved with the day. */
    const tally = { harvested: 0, cooked: 0, wood: 0, wrapped: 0, bigJobs: 0, bestStreak: 0, bestDay: 0, dodged: 0, regulars: 0, stayed: 0, burned: 0 };
    const thoughts = new Set<string>();

    /** The watering can holds this many waterings, and is filled at the well. */
    const CAN_SIZES = [5, 10, 20];
    const canSize = (): number => CAN_SIZES[upgrades.level('can')] ?? 5;
    const can = { left: 5 };
    const farm = new Farm(game, {
        columns: FARM.field.columns,
        rows: FARM.field.rows,
        plotSize: 1.6,
        origin: { x: FARM.field.x, y: 0.02, z: FARM.field.z },
        extraFields: FARM.extraFields.map((field) => ({ origin: { x: field.x, y: 0.02, z: field.z }, columns: field.columns, rows: field.rows })),
        crops: CROPS,
        soil: { dry: 0x3a2e24, wet: 0x1e1612 },
        // Planting, watering and picking each answer for themselves; no toasts on top.
        quiet: true,
        // One part per growth stage in the model: see `crop` in tools/blender/build_props.py.
        createPlant: (crop) => {
            const plant = modelOnly(game, `crop-${crop.id}`);
            plant.userData.staged = true;
            return plant;
        },
    });
    const barriers = addBarriers(game, { enemies: world.enemies, lifetime: 150, toughness: 7, onBroken: () => game.toasts.push('A fence gave way', { color: '#c8a0a0' }) });
    const scarecrows = setupScarecrows(game, {
        farm,
        plotSize: 1.6,
        take: () => takeCarried('scarecrow', 1),
        give: () => void give('scarecrow', 1),
        say: (message, color) => game.toasts.push(message, color ? { color } : undefined),
        onPlaced: (position) => {
            body.play('reach');
            juice.chime('plant');
            game.effects.particles.burst(position.clone().setY(position.y + 0.2), { count: 10, color: 0x4a3a2a, size: 0.06, speed: 1.6, lifetime: 0.4 });
            think('scarecrow', ['There. It does not look at the field. It looks at the house.', 'Barnaby says they weep in the small hours, and that I should not go and ask one why.']);
        },
    });
    game.save.register('scarecrows', { save: () => scarecrows.toJSON(), load: (data) => scarecrows.fromJSON(data) });
    const farming = setupFarming(game, { farm, pockets, hotbar, barriers, give, nodes: () => nodes,
        water: { left: () => can.left, use: () => (can.left -= 1) },
        enabled: () => !dayCycle.stalled,
        onHarvest: (itemId, amount, seeds, plot) => {
            tally.harvested += amount;
            today.picked += amount;
            const name = pockets.inventory.registry.resolve(itemId).name.toLowerCase();
            juice.reward(plot.position.clone().setY(1.1), `+${amount} ${name}${seeds > 0 ? `  +${seeds} seed${seeds > 1 ? 's' : ''}` : ''}`, { color: seeds > 1 ? 0xb8f0a0 : 0xffe9a8 });
        },
        secondsPerHour: HOUR_SECONDS,
        onWork: (kind, plot) => {
            body.play(kind === 'water' ? 'pour' : 'reach');
            // Working down a row climbs a scale: each plot within a breath of the last is a note higher.
            const now = game.time.elapsed;
            row.count = kind === row.kind && now - row.at < 1.4 ? row.count + 1 : 0;
            row.kind = kind;
            row.at = now;
            if (row.count > 0) synth.tone({ frequency: 392 * 2 ** (ROW_SCALE[Math.min(row.count, ROW_SCALE.length) - 1] as number / 12), duration: 0.12, type: 'triangle', gain: 0.06 });
            if (kind === 'plant') {
                juice.chime('plant');
                juice.pop(plot.plant, 0.6);
                game.effects.particles.burst(plot.position.clone().setY(0.15), { count: 6, color: 0x4a3a2a, size: 0.05, speed: 1.2, lifetime: 0.35 });
            }
            if (kind !== 'water') return;
            juice.chime('water');
            juice.pop(plot.soil, 0.12);
            synth.noise({ duration: 0.7, gain: 0.07, filter: 3200 });
            game.effects.particles.burst(plot.position.clone().setY(0.7), { count: 18, color: 0x8fb8c8, size: 0.04, speed: 1.2, lifetime: 0.7 });
        },
    });

    const row = { kind: '', count: 0, at: 0 };
    /** Semitones above G: a major scale over 2 octaves, so a long row keeps rising. */
    const ROW_SCALE = [2, 4, 5, 7, 9, 11, 12, 14, 16, 17, 19, 21, 23, 24];

    /** Hours that go by at once (a night, a visit) pass over the field too. Returns how many crops ripened. */
    let skipping = false;
    const growFor = (hours: number): number => {
        skipping = true;
        const ripened = farm.advance(hours * HOUR_SECONDS);
        skipping = false;
        return ripened;
    };

    // Crops hop when they grow a stage, and a ripe one glints until it is picked.
    const stages = new Map<object, number>();
    farm.onChange((plot) => {
        if (!skipping && plot.crop && stages.get(plot) !== plot.stage && plot.stage > 0) {
            juice.pop(plot.plant, 0.35);
            if (plot.ripe) {
                juice.sparkle(plot.position.clone().setY(0.9), 0xfff0b0, 14);
                if (game.player && plot.position.distanceTo(game.player.position) < 30) juice.chime('tick');
            }
        }
        stages.set(plot, plot.crop ? plot.stage : -1);
    });
    let glint = 0;
    game.systems.add({
        name: 'ripe-glint',
        order: SYSTEM_ORDER.EFFECTS,
        update: (delta) => {
            glint -= delta;
            if (glint > 0) return;
            glint = 0.7;
            const ripe = farm.plots.filter((plot) => plot.active && plot.ripe);
            const plot = ripe[Math.floor(Math.random() * ripe.length)];
            if (plot) juice.sparkle(plot.position.clone().setY(0.6 + Math.random() * 0.5), 0xfff0b0, 3);
        },
    });

    const livestock = addLivestock(game, {
        pen: { center: { x: FARM.pen.center.x, y: 0, z: FARM.pen.center.z }, halfSize: FARM.pen.halfSize },
        animals: [],
        inventory: pockets,
        onCollect: (animal) => {
            juice.reward(animal.object.position.clone().setY(1.4), `+1 ${animal.product}`);
            juice.pop(animal.object, 0.2);
        },
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
        wheels: ['front-wheel', 'rear-wheel'],
    });

    //#endregion Farm, animals and the bike

    //#region Gathering and making

    /** What the last gathered thing gave, for the text that floats up from it. */
    let lastDrop = '';
    const nodes = addResourceNodes(game, {
        kinds: {
            tree: { name: 'dead tree', verb: 'Chop', tool: 'axe', toolName: 'axe', hits: 4, drops: [{ itemId: 'wood', amount: [2, 4] }], respawnSeconds: [DAY_LENGTH * 2, DAY_LENGTH * 3], solid: { radius: 0.45, height: 4 }, remains: stump },
            mushroom: { name: 'pale caps', verb: 'Pick', hits: 1, drops: [{ itemId: 'mushroom', amount: [1, 2] }], respawnSeconds: DAY_LENGTH },
            crate: { name: 'old crate', verb: 'Search', hits: 1, drops: [{ itemId: 'corn-seed', amount: 3 }] },
        },
        nodes: [
            ...refs.trees.map((object) => ({ kind: 'tree', object })),
            ...refs.spots.mushrooms.map((object) => ({ kind: 'mushroom', object })),
            { kind: 'crate', object: refs.spots.crate },
        ],
        // The axe comes to hand by itself when it is carried: no fumbling through pockets at a tree.
        held: () => (pockets.count('axe') > 0 ? 'axe' : hotbar.selectedId),
        give: (itemId, amount) => {
            give(itemId, amount);
            if (itemId === 'wood') tally.wood += amount;
            lastDrop = `+${amount} ${pockets.inventory.registry.resolve(itemId).name.toLowerCase()}`;
        },
        onHit: (node) => {
            body.play(node.kindId === 'tree' ? 'swing' : 'reach');
            if (node.kindId !== 'tree') return;
            hotbar.select(pockets.inventory.slots.findIndex((slot) => slot.itemId === 'axe'));
            // Each blow lands: a held frame, a jolt, and the trunk shudders.
            juice.hitStop(0.05);
            game.effects.shakeCamera(0.07);
            juice.pop(node.object, 0.05);
            synth.noise({ duration: 0.09, gain: 0.16, filter: 700 + Math.random() * 400 });
            game.effects.particles.burst(node.object.position.clone().setY(node.object.position.y + 1), { count: 6, color: 0x4a3e32, size: 0.06, speed: 2, lifetime: 0.4 });
        },
        onDepleted: (node) => {
            juice.reward(node.object.position.clone().setY(node.object.position.y + 1.3), lastDrop);
            if (node.kindId === 'tree') game.effects.shakeCamera(0.2);
            if (node.kindId === 'tree') synth.tone({ frequency: 60, duration: 0.5, type: 'triangle', gain: 0.2, sweep: 0.5 });
        },
        persist: 'nodes',
    });

    // Dishes are hot out of the pot and cool by the hour; hot ones pay more.
    const warmth = setupWarmth(game, {
        dishes: new Set([...COOKING, ...REGULARS.map((regular) => regular.teaches)].map((recipe) => recipe.output.itemId)),
        have,
        now: () => dayCycle.day * 24 + dayCycle.hour,
        // Mother Hollis's cosy keeps a basket hot half as long again.
        keep: () => (regulars.has('cosy') ? 1.5 : 1) / weather.cooling,
    });
    game.save.register('warmth', { save: () => warmth.toJSON(), load: (data) => warmth.fromJSON(data) });
    // In the bicycle's basket, under its cloth, a dish cools half as fast.
    let basketClock = 0;
    game.systems.add({
        name: 'basket',
        order: SYSTEM_ORDER.GAMEPLAY + 8,
        update: () => {
            const now = dayCycle.day * 24 + dayCycle.hour;
            const passed = now - basketClock;
            basketClock = now;
            if (!bike.mounted || passed <= 0 || passed > 1) return;
            warmth.spare(passed * 0.5);
            if (warmth.carried().some((dish) => dish.heat !== 'cold')) think('basket', ['The basket on the handlebars has a cloth in it. Somebody rode hot food about before I did.', '(A dish cools half as fast while you ride.)']);
        },
    });

    // What the pot can make: the dishes anyone knows, and the ones a villager has taught.
    const potRecipes = [...COOKING];
    const regulars = setupRegulars({
        day: () => dayCycle.day,
        hearts: (id) => villagers.relationships.hearts(id),
        nameOf: (id) => VILLAGERS.find((villager) => villager.id === id)?.name ?? id,
        itemName: (itemId) => pockets.inventory.registry.resolve(itemId).name,
        have,
        take: takeCarried,
        stallPrice: (itemId) => shop.inventory.sellPrice(itemId),
        format: coin,
        onRecipesChanged: () => {
            potRecipes.length = 0;
            potRecipes.push(...COOKING, ...REGULARS.filter((regular) => regulars.taught(regular.id)).map((regular) => regular.teaches));
        },
        onTaught: (regular) => {
            const dish = pockets.inventory.registry.resolve(regular.teaches.output.itemId);
            juice.banner(`${dish.icon ?? '🍲'} ${dish.name}`, `${VILLAGERS.find((villager) => villager.id === regular.id)?.name} taught you a dish. It is in the pot's list now.`, { color: '#b8f0a0', seconds: 4 });
            juice.chime('fanfare');
        },
        onFavour: (regular) => {
            juice.banner(`♥ ${regular.favour.title}`, regular.favour.text, { color: '#ffc8d8', seconds: 5 });
            juice.chime('fanfare');
        },
        onDelivered: (regular, itemId, _amount, pay) => {
            today.delivered += 1;
            const heat = warmth.heatOf(itemId);
            const heatBonus = Math.round(pay * warmth.bonus(itemId));
            const nightBonus = isNight(dayCycle) ? Math.round(pay * NIGHT_PAY) : 0;
            if (nightBonus > 0) lateCall();
            dayCycle.advance(visitHours());
            growFor(visitHours());
            coins.add(pay + heatBonus + nightBonus);
            villagers.relationships.add(regular.id, heat === 'hot' ? 45 : 35);
            tally.bestStreak = Math.max(tally.bestStreak, today.delivered);
            tally.regulars += 1;
            const name = VILLAGERS.find((villager) => villager.id === regular.id)?.name ?? '';
            juice.banner('Regular order filled', `${name}  +${coin(pay)}${heat === 'hot' ? `  ·  still hot: +${coin(heatBonus)}` : heat === 'warm' ? `  ·  still warm: +${coin(heatBonus)}` : heat === 'cold' ? '  ·  gone cold' : ''}${nightBonus > 0 ? `  ·  after dark: +${coin(nightBonus)}` : ''}`, { color: '#ffe9a8' });
            juice.chime('fanfare');
            game.toasts.push(`${visitHours()} hours pass. It is ${dayCycle.clock}.`, { color: '#c8c0b0' });
        },
        onOpened: (regular, itemId, first) => {
            const name = VILLAGERS.find((villager) => villager.id === regular.id)?.name ?? '';
            game.toasts.push(`${name}'s regular order has come round: ${regular.amount} ${pockets.inventory.registry.resolve(itemId).name.toLowerCase()}`, { color: '#ffe9a8' });
            if (first) think(`regular-${regular.id}`, [regular.asks, '(Regular orders are in the notebook, under Regulars. Hand one over when you talk to them.)']);
        },
        onLapsed: (regular, itemId) => {
            const name = VILLAGERS.find((villager) => villager.id === regular.id)?.name ?? 'Someone';
            game.toasts.push(`${name} went without their ${pockets.inventory.registry.resolve(itemId).name.toLowerCase()} this time`, { color: '#c8a0a0' });
            villagers.relationships.add(regular.id, -15);
        },
    });
    game.save.register('regulars', { save: () => regulars.toJSON(), load: (data) => regulars.fromJSON(data) });
    /** A call on somebody takes this much of the day. Fen knows a shorter way round. */
    const visitHours = (): number => (regulars.has('shortcut') ? 2 : 3);

    const cookpot = addCraftingStation(game, {
        id: 'cookpot',
        title: 'Cooking',
        object: refs.spots.hearth,
        recipes: potRecipes,
        tierNames: POT_TIERS,
        sources: carried,
        give: stow,
        prompt: 'Cook at the fire',
        verb: 'Cook',
        onStarted: () => {
            body.play('reach');
            synth.noise({ duration: 0.5, gain: 0.08, filter: 2400 });
        },
        onFinished: () => {
            juice.chime('success');
            juice.sparkle(refs.spots.hearth.position.clone().setY(refs.spots.hearth.position.y + 1.3), 0xffd9a0, 16);
        },
        onCollected: (itemId, amount) => {
            tally.cooked += 1;
            today.cooked += 1;
            warmth.collected(itemId, amount);
            think('hot', [`Hot from the pot. It will not stay that way: ${HOT_HOURS} hours, perhaps, and then it is only warm, and then it is cold.`, 'They pay more for hot food. And every visit takes hours of the day. So who gets theirs first is worth a thought.']);
        },
    });
    const bench = addCraftingStation(game, { id: 'bench', title: 'Workbench', object: refs.spots.workbench, recipes: WOODWORK, sources: carried, give: stow, prompt: 'Use the workbench', verb: 'Build' });

    // The fire and the pot: it flickers always, and steams while something is cooking.
    // Looked up each frame: the fire is a box until its model arrives.
    const fireOf = (): THREE.Object3D | undefined => refs.spots.hearth.getObjectByName('glow-flame') ?? refs.spots.hearth.getObjectByName('flame');
    game.systems.add({
        name: 'hearth',
        order: SYSTEM_ORDER.EFFECTS,
        update: () => {
            const flicker = 0.85 + Math.sin(game.time.elapsed * 13) * 0.08 + Math.sin(game.time.elapsed * 31) * 0.07;
            fireOf()?.scale.set(flicker, flicker * (cookpot.station.busy ? 1.5 : 1), flicker);
        },
    });

    //#endregion Gathering and making

    //#region The village

    const folk = new Map<string, { rig: FolkRig; animator: FolkAnimator }>();
    const villagers = addVillagers(game, {
        villagers: VILLAGERS.map((villager) => {
            const rig = createFolk(villager.look);
            folk.set(villager.id, { rig, animator: new FolkAnimator(rig) });
            void dressFolk(game, rig, villager.id);
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
            // Some days they are sure they did not see the farmer yesterday.
            lines: (context: Parameters<typeof villager.lines>[0]) => {
                const denial = wrongness.denial(villager.id);
                return denial ? [denial] : villager.lines(context);
            },
            topics: [...regulars.topicsFor(villager.id), ...villager.topics],
            thanks: villager.thanks,
            };
        }),
        day: () => dayCycle.day,
        hour: () => dayCycle.hour,
        heightAt: ground,
        onTalk: (id) => wrongness.talked(id),
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
        onPaid: (amount, request) => {
            today.delivered += 1;
            // Read before the visit takes its hours: it is as hot as it was when it was handed over.
            const heat = warmth.heatOf(request.itemId);
            const heatBonus = Math.round(request.reward * warmth.bonus(request.itemId));
            const nightBonus = isNight(dayCycle) ? Math.round(request.reward * NIGHT_PAY) : 0;
            if (nightBonus > 0) lateCall();
            // A delivery is a visit: hours go by.
            dayCycle.advance(visitHours());
            growFor(visitHours());
            game.toasts.push(`${visitHours()} hours pass. It is ${dayCycle.clock}.`, { color: '#c8c0b0' });
            // Each further delivery on the same day pays a little more, up to half as much again.
            const streak = Math.min(5, today.delivered - 1);
            const bonus = Math.round(request.reward * 0.1 * streak);
            coins.add(amount + bonus + heatBonus + nightBonus);
            if (heat === 'hot') villagers.relationships.add(request.from, 10);
            if (request.deposit > 0) tally.bigJobs += 1;
            tally.bestStreak = Math.max(tally.bestStreak, today.delivered);
            const name = VILLAGERS.find((villager) => villager.id === request.from)?.name ?? '';
            const heatLine = heat === 'hot' ? `  ·  still hot: +${coin(heatBonus)}` : heat === 'warm' ? `  ·  still warm: +${coin(heatBonus)}` : heat === 'cold' ? '  ·  gone cold' : '';
            juice.banner('Request filled', `${name}  +${coin(request.reward)}${heatLine}${nightBonus > 0 ? `  ·  after dark: +${coin(nightBonus)}` : ''}${bonus > 0 ? `  ·  ${today.delivered} today: +${coin(bonus)} bonus` : ''}`, { color: '#ffe9a8' });
            juice.chime(streak > 0 ? 'fanfare' : 'success');
        },
        formatReward: coin,
        payDeposit: (amount) => coins.trySpend(amount),
        onExpired: (request) => {
            // A job that was only on offer lapses quietly.
            if (!request.accepted) return;
            const name = VILLAGERS.find((villager) => villager.id === request.from)?.name ?? 'Someone';
            if (request.deposit > 0) game.toasts.push(`${name} keeps your ${coin(request.deposit)} deposit`, { color: '#ff9a9a' });
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

    /** The name of whoever has asked for this, if anybody has. */
    const wantedBy = (itemId: string): string | undefined => {
        const request = villagers.requests?.open.find((open) => open.itemId === itemId);
        return request ? VILLAGERS.find((villager) => villager.id === request.from)?.name : regulars.wanted(itemId);
    };

    const stock = [...STORE_STOCK];
    /** What is on the shelf: seeds by what has been ordered in, and the next backpack up. */
    function restock(): void {
        const seeds = upgrades.level('seeds');
        const bagLevel = upgrades.level('bag');
        stock.length = 0;
        stock.push('turnip-seed', 'wheat-seed', ...(seeds >= 1 ? ['corn-seed'] : []), ...(seeds >= 2 ? ['pumpkin-seed'] : []), 'fence-kit', 'candle', 'lantern', 'lamp-oil', 'scarecrow', ...(bagLevel < 3 ? [`backpack-${bagLevel + 1}`] : []));
        if (shop.isOpen) shop.screen.refresh();
    }
    // A backpack bought at the counter is put on there and then.
    pockets.onChange(() => {
        const bought = [1, 2, 3].find((level) => pockets.count(`backpack-${level}`) > 0);
        if (bought === undefined) return;
        pockets.remove(`backpack-${bought}`, 1);
        upgrades.upgrades.set('bag', Math.max(bought, upgrades.level('bag')));
        juice.banner(pockets.inventory.registry.resolve(`backpack-${bought}`).name, `${bag.inventory.capacity} slots`, { color: '#b8f0a0' });
        juice.chime('fanfare');
    });
    const shop = addInventory(game, { items: ITEMS, mode: 'shop', title: "Barnaby's store", catalogue: stock, primary: false, customer: pockets, currency: { resource: coins, label: 'purse', format: coin }, filters: false });
    const counter = modelled(game, 'stall', storeFurniture(false));
    counter.position.copy(at({ x: VILLAGE.store.x + 3, z: VILLAGE.store.z + 6 }));
    counter.rotation.y = VILLAGE.store.yaw;
    const lectern = modelled(game, 'lectern', storeFurniture(true));
    lectern.position.copy(at({ x: VILLAGE.store.x + 5.6, z: VILLAGE.store.z + 4.8 }));
    lectern.rotation.y = VILLAGE.store.yaw;
    game.scene.add(counter, lectern);
    solid(game, counter, refs, 1);
    solid(game, lectern, refs, 1);
    game.interactions.add(counter, { prompt: 'Buy at the store', range: 2.6, onInteract: () => shop.open() });
    // The counter only reaches into the pockets. The crate at its end takes from the backpack as well.
    const scales = setupCrate(game, {
        position: at({ x: VILLAGE.store.x + 0.4, z: VILLAGE.store.z + 7.1 }),
        yaw: VILLAGE.store.yaw,
        solids: refs.solids,
        carried,
        coins,
        stallPrice: (itemId) => shop.inventory.sellPrice(itemId),
        share: 1,
        title: 'Sell to Barnaby',
        intro: { title: 'Half price, counted twice', detail: 'Barnaby buys crops, food and wood out of your pockets and your backpack. A villager who asked for something pays far more.' },
        prompt: 'Sell to Barnaby',
        payer: 'Barnaby',
        model: 'crate',
        wantedBy: (itemId) => wantedBy(itemId),
        format: coin,
    });

    const upgrades = addUpgrades(game, {
        title: "Barnaby's order book",
        currency: coins,
        format: coin,
        object: lectern,
        prompt: 'Read the order book',
        onBought: (definition, level) => {
            juice.banner(definition.levels[level - 1]?.name ?? definition.name, 'Bought', { color: '#b8f0a0' });
            juice.chime('fanfare');
        },
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
                    { cost: 450, name: 'Cauldron', description: 'Cooks pumpkin pie and Hollowveil stew.' },
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
                apply: () => restock(),
            },
            {
                id: 'bag',
                name: 'A bigger backpack',
                icon: '🎒',
                levels: [
                    { cost: 150, name: 'Stitched backpack', description: '6 slots instead of 3. Also on the store shelf.' },
                    { cost: 400, name: 'Leather backpack', description: '10 slots.' },
                    { cost: 900, name: "Postman's satchel", description: '16 slots. Fen will not say where the last postman went.' },
                ],
                apply: (level) => {
                    bag.inventory.capacity = BAG_SLOTS[level] ?? 16;
                    restock();
                },
            },
            {
                id: 'can',
                name: 'A bigger watering can',
                icon: '💧',
                levels: [
                    { cost: 110, name: 'Two-gallon can', description: 'Holds 10 waterings instead of 5.' },
                    { cost: 280, name: 'Yoke and pails', description: 'Holds 20 waterings.' },
                ],
                // It comes full.
                apply: () => (can.left = canSize()),
            },
            { id: 'hen', name: 'Another hen', icon: '🐔', description: 'One more hen in the pen, laying eggs.', levels: [{ cost: 90 }, { cost: 120 }, { cost: 160 }], apply: (level) => setHerd('hen', 2 + level) },
            { id: 'cow', name: 'Another cow', icon: '🐄', description: 'One more cow in the pen, giving milk.', levels: [{ cost: 260 }, { cost: 360 }], apply: (level) => setHerd('cow', 1 + level) },
        ],
    });
    setHerd('hen', 2);
    setHerd('cow', 1);
    restock();

    //#endregion The village

    //#region Home

    // Beside the mailbox: what is too much goes in, and Barnaby pays for it, less than at his stall.
    const crateSpot = at({ x: FARM.door.x + 3.2, z: FARM.door.z + 3.5 });
    const crate = setupCrate(game, {
        position: crateSpot,
        yaw: Math.PI,
        solids: refs.solids,
        carried,
        coins,
        // In Barnaby's green book the crate pays what the stall does.
        share: () => (regulars.has('ledger') ? 1 : 0.8),
        stallPrice: (itemId) => shop.inventory.sellPrice(itemId),
        wantedBy: (itemId) => wantedBy(itemId),
        format: coin,
    });

    // A chest in the barn: what is in it is safe from dying.
    const barnWall = refs.solids.find((box) => box.containsPoint(new THREE.Vector3(FARM.barn.x, box.min.y + 1, FARM.barn.z)));
    const chestMesh = new THREE.Group();
    const chestBody = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.7, 0.8), new THREE.MeshStandardMaterial({ color: 0x5a4430, roughness: 1, flatShading: true }));
    chestBody.position.y = 0.35;
    const chestLid = new THREE.Mesh(new THREE.BoxGeometry(1.36, 0.16, 0.86), new THREE.MeshStandardMaterial({ color: 0x3a2e24, roughness: 1, flatShading: true }));
    chestLid.position.y = 0.78;
    const chestLock = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.2, 0.06), new THREE.MeshStandardMaterial({ color: 0xb8a060, roughness: 0.5, metalness: 0.6 }));
    chestLock.position.set(0, 0.6, 0.42);
    chestMesh.add(chestBody, chestLid, chestLock);
    modelled(game, 'chest', chestMesh);
    const barnFront = (barnWall?.min.x ?? FARM.barn.x - 5) - 0.5;
    const barn = setupBarn(game, {
        door: at({ x: barnFront, z: FARM.barn.z }, 1),
        outside: at({ x: barnFront - 1.4, z: FARM.barn.z }, 0.3),
        atmosphere,
        canEnter: () => (bike.mounted ? 'The bicycle stays outside' : dayCycle.stalled ? 'You need to sleep. Go home to bed.' : undefined),
        onEnter: () => {
            plates?.setPlace('The barn');
            think('barn', ['Straw, old wood, one lamp. And quiet: the first real quiet since I woke up here.', 'Nothing has ever come in after me. They do not seem to know it has an inside.']);
        },
        onLeave: () => plates?.setPlace(safeZones.zoneAt(game.player?.position ?? barn.floor)?.name),
    });
    chestMesh.position.set(3.6, 0, 2.2);
    chestMesh.rotation.y = -Math.PI / 2;
    barn.room.add(chestMesh);
    game.interactions.add(chestMesh, { prompt: 'Open the chest', range: 2.4, onInteract: () => chestPack.open() });

    const well = new THREE.Object3D();
    well.position.copy(at(FARM.well));
    game.scene.add(well);
    game.interactions.add(well, {
        prompt: () => `Fill the watering can (${can.left}/${canSize()})`,
        blockedPrompt: () => (have('watering-can') === 0 ? 'A well. You have no can to fill' : 'The watering can is full'),
        range: 2.8,
        canInteract: () => can.left < canSize() && have('watering-can') > 0,
        onInteract: () => {
            can.left = canSize();
            body.play('reach');
            juice.chime('water');
            synth.noise({ duration: 0.9, gain: 0.08, filter: 2600 });
            juice.reward(well.position.clone().setY(well.position.y + 1.6), 'Can filled', { chime: false, color: 0x8fb8c8 });
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
            plates?.setPlace(zone.name ?? 'Safe');
            think('safe', ['They stop at the light. Remember that.']);
        },
        onLeave: () => plates?.setPlace(undefined),
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

    // Lanterns: put up anywhere outdoors, kept in oil, each a small safe ring and a hole in the Veil.
    const lanterns = setupLanterns(game, {
        safeZones,
        ground: (x, z) => terrain.point(x, z, 0),
        now: () => dayCycle.day * 24 + dayCycle.hour,
        have,
        take: takeCarried,
        give: (itemId, amount) => void give(itemId, amount),
        refuse: (spot) => (barn.inside ? 'Not in here' : safeZones.zoneAt(spot) ? 'There is light here already' : ground(spot.x, spot.z) < POOL_LEVEL + 0.3 ? 'Not in the water' : undefined),
        onPlaced: () => {
            body.play('reach');
            synth.tone({ frequency: 660, duration: 0.2, type: 'sine', gain: 0.07 });
            juice.chime('success');
            think('lantern', ['There. A ring of light they will not step into, and the Veil draws back from it a little.', `It has a day of oil in it. A flask buys another day. If I let it go dark it is only a post.`]);
        },
        onFilled: (lantern) => {
            body.play('pour');
            juice.reward(lantern.position.clone().setY(lantern.position.y + 2.2), `${Math.ceil(lanterns.hoursLeft(lantern))}h of oil`, { chime: false, color: 0xffd9a0 });
        },
    });
    game.save.register('lanterns', { save: () => lanterns.toJSON(), load: (data) => lanterns.fromJSON(data) });

    /**
     * How much thicker than the hour makes it the Veil is where the farmer stands: 1 by any
     * light, up to nearly double far from all of them late in the day.
     */
    let veilFactor = 1;
    const veilAt = (position: THREE.Vector3): number => {
        let toLight = lanterns.distanceToLight(position) - LANTERN.clearing * 0.5;
        for (const zone of safeZones.zones) toLight = Math.min(toLight, Math.hypot(position.x - zone.position.x, position.z - zone.position.z) - zone.radius);
        const far = THREE.MathUtils.smoothstep(toLight, 4, 55);
        const hour = dayCycle.hour;
        const late = hour < 5.5 ? 1 : THREE.MathUtils.smoothstep(hour, 12, 19.5);
        return 1 + far * (0.2 + 0.8 * late) * 0.9;
    };

    // The pool is knee deep: wading is slow, and the Hollow do not mind the water.
    addGroundDrag(game, {
        movement: world.controls.movement,
        dragAt: (position) => (POOL_LEVEL - position.y) / 0.6,
        onEnter: () => {
            synth.noise({ duration: 0.4, gain: 0.1, filter: 1200 });
            think('wade', ['Cold. And it pulls at the legs. I will not get anywhere fast in this.']);
        },
    });

    const population = addPopulation(game, {
        enemies: world.enemies,
        target: () => Math.round(hollowTarget(dayCycle, hunting()) * weather.hollow),
        spawn: (position, post) => spawnHollow(world.enemies, position, { night: isNight(dayCycle), post, hunting: hunting(), kind: pickKind(dayCycle.day) }),
        // Night fills up fast; day thins out slowly.
        interval: () => (isNight(dayCycle) ? [1, 2.5] : [4, 8]),
        // Not in a lit place, not on a cliff, and not standing in the water.
        canSpawnAt: (position) => !safeZones.zoneAt(position) && terrain.slopeAt(position.x, position.z) < 0.15 && ground(position.x, position.z) > POOL_LEVEL + 0.3,
        heightAt: ground,
        bounds: WORLD_HALF - 16,
        posts: HAUNTS,
        onDespawn: forgetHollow,
    });
    setupDread(game, { enemies: world.enemies, look, dayCycle, isRiding: () => bike.mounted });
    // Nightfall and dawn: 3 times as many walk at night, and they come on harder.
    let wasNight = isNight(dayCycle);
    game.systems.add({
        name: 'watchers',
        order: SYSTEM_ORDER.GAMEPLAY - 2,
        update: () => {
            const night = isNight(dayCycle);
            setNightTemper(night);
            if (night === wasNight) return;
            wasNight = night;
            if (!hunting()) return;
            game.toasts.push(night ? 'Night. The fog is full of them now.' : 'Dawn. Most of them drift back into the fog.', { color: night ? '#c8a0a0' : '#e8e0c8' });
            if (night) synth.tone({ frequency: 46, duration: 3, type: 'sawtooth', gain: 0.16, sweep: 0.7 });
            if (night) think('night', ['Night. There are 3 of them now for every one I saw by day, and they are not wandering any more.', 'A lamp, a candle, a door. Or the bicycle, and do not stop.']);
        },
    });

    // Hot food carries on the air. 4 hot dishes is as strong as it gets; a lit place or the barn hides it.
    let scentTimer = 0;
    // Pike's smell on the basket halves it.
    const scentLevel = (): number => (!hunting() || barn.inside || safeZones.playerSafe ? 0 : Math.min(1, warmth.scent() / 8) * (regulars.has('guard') ? 0.5 : 1));
    game.systems.add({
        name: 'scent',
        order: SYSTEM_ORDER.GAMEPLAY - 2,
        update: (delta) => {
            scentTimer -= delta;
            if (scentTimer > 0) return;
            scentTimer = 0.5;
            const level = scentLevel();
            setScent(level);
            if (level >= 0.25) think('scent', ['They turned their heads. All of them, the same way, as I came past with the basket.', 'It is the food. They can smell it while it is hot. The more I carry, the further off they notice, and the more of them come.']);
        },
    });

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
        subtitle: `They found you out in the Veil and carried you to the infirmary. ${DAYS_LOST} days are gone, and so is everything you carried. Your tools were kept for you.`,
        buttons: [{ label: 'Wake up', primary: true, action: () => world.flow.restart() }],
    });
    game.events.on('state:changed', ({ from, to }) => {
        if (from === 'dead' && to === 'playing') wake();
    });
    function wake(): void {
        for (const inventory of carried) {
            for (const slot of [...inventory.inventory.slots]) {
                if (slot.definition.keep) continue;
                pool.keep(slot.itemId, slot.amount);
                inventory.remove(slot.itemId, slot.amount);
            }
        }
        // The last of the lost days ends with a morning, like any other.
        // Dying after midnight is already on the new day, so the morning does not add one.
        dayCycle.day += dayCycle.hour >= 6 ? DAYS_LOST - 1 : DAYS_LOST;
        sleep();
        deeds.award('died');
        const bed = homeOf(VILLAGE.infirmary);
        world.player.body.teleport(at({ x: bed.x + 0.4, z: bed.z + 0.8 }, 0.2));
        narration.clear();
        void narration.speak(['The infirmary. Clean sheets. Nobody about.', `${DAYS_LOST} days gone, and my pockets with them. Whoever was waiting on me has stopped waiting.`, 'They left my tools by the cot. Back to the farm, then. More carefully.']);
        saves.save();
    }

    //#endregion The Hollow

    //#region The edge, bad days and deeds

    // The valley loops. Near the edge the Veil closes in; whoever keeps walking is covered
    // by it completely, moved while nothing can be seen, and let out on the far side.
    const veil = document.createElement('div');
    veil.className = 'veil';
    game.screens.layer('overlay').appendChild(veil);
    game.screens.show('overlay', veil);
    let crossing: { phase: 'in' | 'hold' | 'out'; left: number; x: number; z: number } | undefined;
    game.systems.add({
        name: 'world-wrap',
        order: SYSTEM_ORDER.EFFECTS,
        update: () => {
            const player = game.player;
            if (!player) return;
            const { x, z } = player.position;
            const out = Math.max(Math.abs(x), Math.abs(z));
            // Thicker away from any light and late in the day, and thicker still at the edge of the valley.
            veilFactor += (veilAt(player.position) - veilFactor) * Math.min(1, game.time.delta * 0.8);
            if (veilFactor > 1.55) think('thick', ['I can hardly see my own hands. It was not like this at noon, or near the lamps.', 'The Veil is thickest late in the day and far from any light. A lantern on the way would make a hole in it.']);
            atmosphere.setDensity(atmosphere.fog.density * veilFactor * weather.fog * (1 + (1 - THREE.MathUtils.smoothstep(WRAP_AT - out, 0, 24)) * 4));

            if (!crossing) {
                if (out <= WRAP_AT) return;
                const back = WRAP_AT - 6;
                crossing = { phase: 'in', left: 0.6, x: Math.abs(x) > WRAP_AT ? -Math.sign(x) * back : x, z: Math.abs(z) > WRAP_AT ? -Math.sign(z) * back : z };
                veil.style.background = `#${atmosphere.fog.color.getHexString()}`;
                veil.classList.add('is-closed');
                return;
            }
            crossing.left -= game.time.delta;
            if (crossing.left > 0) return;
            if (crossing.phase === 'in') {
                // Fully covered: now the move, and a moment for the camera to catch up unseen.
                player.body.teleport(terrain.point(crossing.x, crossing.z, 0.3));
                crossing.phase = 'hold';
                crossing.left = 0.9;
            } else if (crossing.phase === 'hold') {
                veil.classList.remove('is-closed');
                crossing.phase = 'out';
                crossing.left = 1.1;
            } else {
                crossing = undefined;
                tally.wrapped += 1;
                // Only once the far side can be seen does the farmer remark on it.
                think('wrap', ['The Veil went solid white, and then thinned again.', 'I am on the far side of the valley. I walked out of it one way and came in by the other. There is no out.']);
            }
        },
    });

    const happenings = setupHappenings(game, {
        enemies: world.enemies,
        day: () => dayCycle.day,
        hour: () => dayCycle.hour,
        enabled: () => hunting(),
        village: { x: VILLAGE.center.x, z: VILLAGE.center.z, radius: VILLAGE.wallRadius },
        farm: FARM.centre,
        heightAt: ground,
        blocked: (position) => safeZones.zoneAt(position) !== undefined,
        onStart: (kind) => {
            synth.tone({ frequency: 40, duration: 4, type: 'sawtooth', gain: 0.2, sweep: 0.8 });
            game.toasts.push(kind === 'siege' ? 'They are gathering round the village' : 'They are all over the farm', { color: '#ff9a9a' });
            void narration.speak(
                kind === 'siege'
                    ? ['Something is wrong in the village. They are standing all round the wall, shoulder to shoulder, facing in.', 'They cannot cross into the light. But there is no way in or out except through them. (They will be gone by dawn.)']
                    : ['Something is wrong at home. The yard is full of them. The field, the pen, right up to the porch.', 'Only the porch and the barn lamp are still mine. (They will be gone by dawn.)'],
            );
        },
    });

    const inVillage = (): boolean => Math.hypot((game.player?.position.x ?? 0) - VILLAGE.center.x, (game.player?.position.z ?? 0) - VILLAGE.center.z) < 11;
    const atHome = (): boolean => Math.hypot((game.player?.position.x ?? 0) - FARM.door.x, (game.player?.position.z ?? 0) - FARM.door.z) < 8;
    const deeds = addAchievements(game, {
        onEarned: (achievement) => {
            juice.banner(`${achievement.icon ?? '★'} ${achievement.title}`, achievement.description, { color: '#ffe9a8', seconds: 3.2 });
            juice.chime('success');
        },
        achievements: [
            { id: 'harvest', icon: '🌱', title: 'Soil is soil', description: 'Pick your first crop.', done: () => tally.harvested > 0 },
            { id: 'dish', icon: '🍲', title: 'Something hot', description: 'Cook a dish.', done: () => tally.cooked > 0 },
            { id: 'delivery', icon: '❗', title: 'Worth keeping', description: 'Fill a request.', done: () => (villagers.requests?.completed ?? 0) >= 1 },
            { id: 'regular', icon: '🧺', title: 'Part of the village', description: 'Fill 10 requests.', done: () => (villagers.requests?.completed ?? 0) >= 10 },
            { id: 'trusted', icon: '🤝', title: 'Money down', description: 'Take a job that wants a deposit, and deliver it.', done: () => tally.bigJobs > 0 },
            { id: 'friend', icon: '♥', title: 'Easier to love', description: 'Reach 3 hearts with someone.', done: () => VILLAGERS.some((villager) => villagers.relationships.hearts(villager.id) >= 3) },
            { id: 'cauldron', icon: '🫕', title: 'Funerals and weddings', description: 'Own the cauldron.', done: () => cookpot.station.tier >= 3 },
            { id: 'land', icon: '🌾', title: 'All of it under seed', description: 'Buy both extra fields.', done: () => farm.activeFields >= 3 },
            { id: 'places', icon: '🧭', title: 'What is in this valley with me', description: 'Find all 5 places off the road.', done: () => SIGHTS.every((sight) => thoughts.has(sight.id)) },
            { id: 'wrap', icon: '🌫', title: 'There is no out', description: 'Walk out of the valley and come in by the other side.', done: () => tally.wrapped > 0 },
            { id: 'candle', icon: '🕯', title: 'A little light', description: 'Light a grave candle.', done: () => thoughts.has('candle') },
            { id: 'letters', icon: '✉', title: 'Your neighbour, Pell', description: 'Read every letter.', done: () => letters.read >= letters.total },
            { id: 'bargain', icon: '🌅', title: 'A way home', description: 'Say yes to Pell.', done: () => escape.pledge.state !== 'idle' },
            { id: 'halfway', icon: '🔥', title: 'It burns green', description: 'Burn half the price.', done: () => escape.pledge.paid >= ESCAPE.price / 2 },
            { id: 'siege', icon: '🏘', title: 'Shoulder to shoulder', description: 'Be in the village square while they ring the wall.', hidden: true, done: () => happenings.active === 'siege' && inVillage() },
            { id: 'overrun', icon: '🏚', title: 'Only the porch is mine', description: 'Stand on your porch while the farm is overrun.', hidden: true, done: () => happenings.active === 'overrun' && atHome() },
            { id: 'dodge', icon: '💨', title: 'Close!', description: 'Step out from under a blow.', done: () => tally.dodged > 0 },
            { id: 'streak', icon: '🔔', title: 'A good day', description: 'Fill 3 requests in one day.', done: () => tally.bestStreak >= 3 },
            { id: 'noticing', icon: '✎', title: 'It is an ordinary valley', description: 'Notice 4 things that are not right.', done: () => wrongness.noticed.size >= 4 },
            { id: 'all-wrong', icon: '🪞', title: 'Everybody says so', description: 'Notice all 7.', hidden: true, done: () => wrongness.noticed.size >= 7 },
            { id: 'regulars', icon: '🧺', title: 'On the day', description: 'Fill 5 regular orders.', done: () => tally.regulars >= 5 },
            { id: 'stayed', icon: '🌫', title: 'There are worse neighbours', description: 'Let the last day pass, and stay.', hidden: true },
            { id: 'died', icon: '🛏', title: 'Clean sheets', description: 'Wake up in the infirmary.', hidden: true },
        ],
    });

    //#endregion The edge, bad days and deeds

    //#region Weather, sounds that lie, and the pool

    const weather = setupWeather(game, {
        clock: () => dayCycle.day * 24 + dayCycle.hour,
        hour: () => dayCycle.hour,
        enabled: () => hunting() && game.state.is('playing') && !ending.playing,
        sheltered: () => barn.inside,
        synth,
        waterField: () => farm.plots.filter((plot) => plot.active && plot.crop && !plot.ripe && farm.water(plot)).length,
        setCompass: (visible) => compass.setVisible(visible),
        banner: (title, effect) => juice.banner(title, effect, { color: '#c8d4d8' }),
    });

    const whispers = setupWhispers(game, {
        synth,
        hour: () => dayCycle.hour,
        night: () => isNight(dayCycle),
        enabled: () => hunting() && game.state.is('playing') && !narration.speaking && !ending.playing,
        inBarn: () => barn.inside,
        safe: () => safeZones.playerSafe,
        riding: () => bike.mounted,
        toVillage: () => Math.hypot((game.player?.position.x ?? 0) - VILLAGE.center.x, (game.player?.position.z ?? 0) - VILLAGE.center.z),
        thick: () => weather.id === 'thick',
        say: (line) => game.toasts.push(line, { color: '#b8c8c0', duration: 5 }),
        think,
    });

    // What the farmer carried when they died is kept by the black pool, and given back there after dark.
    const pool = setupPool(game, {
        terrain,
        night: () => isNight(dayCycle),
        stow,
        knows: (itemId) => pockets.inventory.registry.get(itemId) !== undefined,
        say: (line) => game.toasts.push(line, { color: '#b8c8c0', duration: 5 }),
        think,
        onReturned: (count, left) => {
            if (count === 0) {
                game.toasts.push(left > 0 ? 'Your pockets and backpack are full' : 'Cold water. Nothing else.', { color: '#c8a0a0' });
                return;
            }
            synth.tone({ frequency: 70, duration: 1.6, type: 'sine', gain: 0.18, sweep: 1.6 });
            juice.banner('The water gives it back', left > 0 ? `${count} things. ${left} more are still down there.` : `${count} things, cold and wet, and all yours.`, { color: '#a8c8d0' });
            think('pool-back', ['Cold, right up to the shoulder. And then a strap, in my hand. Mine.', 'Everything I was carrying when they got me. It was all laid out down there, in a row.', 'I did not feel the bottom. I felt it being handed up.']);
            saves.save();
        },
    });

    //#endregion Weather, sounds that lie, and the pool

    //#region What is not right

    const wrongness = setupWrongness(game, {
        terrain,
        day: () => dayCycle.day,
        hour: () => dayCycle.hour,
        scarecrow: yard.scarecrow,
        think: (id, lines) => think(id, lines),
        // Once the farmer belongs here nothing is out of place any more.
        settled: () => tally.stayed > 0,
        waterField: () => farm.plots.filter((plot) => plot.active && plot.crop && !plot.ripe && farm.water(plot)).length,
        onNoticed: () => game.toasts.push('Written in the notebook, under "Not right"', { color: '#c8c0b0' }),
    });
    game.save.register('wrongness', { save: () => wrongness.toJSON(), load: (data) => wrongness.fromJSON(data) });

    //#endregion What is not right

    //#region Feel

    // A blow that was wound up and then missed: the world holds its breath for a moment.
    const winding = new Set<number>();
    let healthBefore = 100;
    game.systems.add({
        name: 'near-miss',
        order: SYSTEM_ORDER.GAMEPLAY + 9,
        update: () => {
            const player = game.player;
            if (!player) return;
            for (const enemy of world.enemies.all) {
                if (enemy.windup > 0) winding.add(enemy.id);
                else if (winding.delete(enemy.id) && player.health.current >= healthBefore && !player.health.isInvulnerable && !player.isDead) {
                    tally.dodged += 1;
                    juice.slowMo(0.45, 0.3);
                    juice.chime('close');
                    game.effects.text(player.position.clone().setY(player.position.y + 2.1), 'Close!', { color: 0xd8f0ff });
                }
            }
            healthBefore = player.health.current;
        },
    });

    // Three in the morning: the clock stops, and nothing can be done but go to bed.
    let nagTimer = 0;
    game.systems.add({
        name: 'exhaustion',
        order: SYSTEM_ORDER.GAMEPLAY - 3,
        update: (delta) => {
            const spent = dayCycle.stalled;
            game.interactions.filter = spent ? (object) => object === door || object === barn.exit : undefined;
            if (!spent) {
                nagTimer = 0;
                return;
            }
            game.hud.setObjective('You need to sleep. Go home to bed.');
            nagTimer -= delta;
            if (nagTimer > 0) return;
            nagTimer = 7;
            juice.banner('You need to sleep', 'It is 3 in the morning. Nothing more can be done today: go home to bed.', { color: '#c8b8e8', seconds: 4.5 });
        },
    });

    // Speed is felt: the view widens as the bicycle gets going.
    game.systems.add({
        name: 'speed-feel',
        order: SYSTEM_ORDER.CONTROL + 2,
        update: () => {
            world.controls.fovBoost = bike.mounted ? Math.min(12, Math.abs(bike.speed)) : 0;
        },
    });

    // The pot says how long it has left, so nobody has to open the panel to find out.
    const potLabel = createBillboardLabel('', { x: 0, y: 2.1, z: 0 }, { fontSize: 0.34, color: 0xffe2a0 });
    refs.spots.hearth.add(potLabel);
    let potText = '';
    game.systems.add({
        name: 'pot-label',
        order: SYSTEM_ORDER.UI,
        update: () => {
            const { station } = cookpot;
            const text = station.job ? `${Math.max(1, Math.ceil(station.job.recipe.seconds - station.job.elapsed))}s` : station.ready.length > 0 ? '✓ ready' : '';
            if (text !== potText) {
                potText = text;
                potLabel.text = text;
                potLabel.sync();
            }
            potLabel.visible = text !== '';
            if (potLabel.visible) faceCamera(potLabel, game.camera);
        },
    });

    // A tune that never repeats: gentle by day, low and sparse after dark, silent when one of them is close.
    const DAY_TUNE = [196, 220, 261.6, 293.7, 329.6, 392, 440, 523.3];
    const NIGHT_TUNE = [98, 110, 116.5, 146.8, 164.8, 174.6, 220];
    const music = addMusicBox(game, {
        scale: DAY_TUNE,
        gain: 0.05,
        playing: () => {
            const nearest = game.player ? world.enemies.nearest(game.player.position) : undefined;
            return !nearest || nearest.root.position.distanceTo(game.player?.position ?? nearest.root.position) > 16;
        },
    });
    let tuneIsNight = false;
    game.systems.add({
        name: 'tune',
        order: SYSTEM_ORDER.EFFECTS,
        update: () => {
            const night = isNight(dayCycle);
            if (night === tuneIsNight) return;
            tuneIsNight = night;
            music.setScale(night ? NIGHT_TUNE : DAY_TUNE, { gap: night ? [4, 9] : [1.6, 4] });
        },
    });

    // The price is burned in quarters: each one puts green on the old tree and is spoken of once.
    const QUARTERS: Array<{ title: string; sub: string; lines: string[] }> = [
        { title: 'A quarter burned', sub: 'The old tree on the hill has put out leaves.', lines: ['A quarter of it, gone up green.', 'Pell says that tree has not had a leaf since before he came. It has a handful now, low down, where the smoke went.'] },
        { title: 'Half burned', sub: 'More green on the old tree.', lines: ['Half. I caught myself humming this morning: a tune from the other kitchen. I had forgotten I knew it.', 'Pell did not know it. He asked me to hum it again, slowly, and stood very still.'] },
        { title: 'Three quarters burned', sub: 'The old tree is almost in leaf.', lines: ['Three quarters. Pell asked me the name of my street and I had it at once.', 'He wrote it down and put it in my pocket. In case I do not have it, later. "Read it on the last night," he said.'] },
    ];
    const treeGreen = new THREE.Group();
    const leafMaterial = new THREE.MeshBasicMaterial({ color: 0x86e89a, side: THREE.DoubleSide });
    const leafShape = new THREE.PlaneGeometry(0.55, 0.32);
    QUARTERS.forEach((_quarter, tier) => {
        const cluster = new THREE.Group();
        for (let index = 0; index < 9; index += 1) {
            const leaf = new THREE.Mesh(leafShape, leafMaterial);
            const angle = index * 2.4 + tier;
            leaf.position.set(Math.cos(angle) * (0.9 + (index % 3) * 0.45), 2.6 + tier * 1.5 + (index % 4) * 0.35, Math.sin(angle) * (0.9 + (index % 3) * 0.45));
            leaf.rotation.set(index, angle, index * 0.7);
            cluster.add(leaf);
        }
        cluster.visible = false;
        treeGreen.add(cluster);
    });
    const treeLight = new THREE.PointLight(0x7dff8a, 0, 14, 1.6);
    treeLight.position.y = 4;
    treeGreen.add(treeLight);
    treeGreen.position.copy(at({ x: PLACES.lookout.x - 2.5, z: PLACES.lookout.z - 2 }));
    game.scene.add(treeGreen);
    game.systems.add({
        name: 'quarters',
        order: SYSTEM_ORDER.EFFECTS,
        update: () => {
            const { pledge } = escape;
            const reached = pledge.state === 'idle' ? 0 : pledge.state === 'kept' ? QUARTERS.length : Math.min(QUARTERS.length, Math.floor((pledge.paid / ESCAPE.price) * 4));
            treeGreen.children.forEach((cluster, tier) => {
                if (cluster !== treeLight) cluster.visible = tier < reached;
            });
            treeLight.intensity = reached * 1.2 + (reached > 0 ? Math.sin(game.time.elapsed * 2.3) * 0.3 : 0);
            tally.burned = Math.min(tally.burned, reached);
            if (reached <= tally.burned || !game.state.is('playing') || pledge.state !== 'running') return;
            tally.burned = reached;
            const quarter = QUARTERS[reached - 1] as (typeof QUARTERS)[number];
            juice.banner(`🔥 ${quarter.title}`, quarter.sub, { color: '#9af0a8', seconds: 4.5 });
            juice.chime('fanfare');
            juice.sparkle(treeGreen.position.clone().setY(treeGreen.position.y + 3), 0x86e89a, 30);
            void narration.speak(quarter.lines);
        },
    });

    //#endregion Feel

    //#region Story, notebook and thoughts

    const letters = setupLetters(game, {
        mailbox: at({ x: FARM.door.x + 1.5, z: FARM.door.z + 3.2 }),
        hill: at(PELL_SPOT),
        hillYaw: PELL_SPOT.yaw,
        deal: (dialogue) => escape.talk(dialogue),
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
        deeds: () => deeds.rows(),
        wrong: () => wrongness.rows(),
        extra: () => [
            ...regulars.rows(),
            ...(escape.pledge.state === 'running'
                ? [
                      { heading: true, title: 'Going home' },
                      { icon: '🌅', title: `Burn ${coin(escape.pledge.remaining)} more at the old tree`, detail: `${escape.pledge.daysLeft} days left, to the end of day ${escape.pledge.deadline}. Paid so far: ${coin(escape.pledge.paid)}. Dying costs 3 days.`, progress: escape.pledge.paid / ESCAPE.price },
                  ]
                : escape.waiting
                  ? [{ heading: true, title: 'Going home' }, { icon: '🕯', title: 'Pell is waiting on the hill', detail: 'Up the west path from the chapel, to the old tree on the lookout. He has something to say about going home.' }]
                  : []),
        ],
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
        pell: PELL_SPOT,
    };
    const compass = addCompass(game, {
        markers: () => {
            const step = dayCycle.stalled ? 'sleep' : story.story.current?.id;
            const target = step === 'deliver' ? villagerSpot(villagers.requests?.open[0]?.from) : step ? TARGETS[step] : undefined;
            return [
                { glyph: '🏠', position: { x: FARM.door.x, y: 0, z: FARM.door.z }, hideWithin: 14 },
                { glyph: '🕯', position: { x: VILLAGE.center.x, y: 0, z: VILLAGE.center.z }, hideWithin: 22 },
                ...(escape.waiting ? [{ glyph: '⛰', position: { x: PELL_SPOT.x, y: 0, z: PELL_SPOT.z }, hideWithin: 4 }] : []),
                // Whoever can be paid a call right now, with what is being carried.
                ...(story.finished ? VILLAGERS.filter((villager) => owed(villager.id)).flatMap((villager) => { const spot = villagerSpot(villager.id); return spot ? [{ glyph: '❗', position: { x: spot.x, y: 0, z: spot.z }, hideWithin: 6 }] : []; }) : []),
                ...(target ? [{ glyph: '➤', position: { x: target.x, y: 0, z: target.z }, hideWithin: 3 }] : []),
            ];
        },
    });
    /** True when what this villager is waiting for is in the pockets or the backpack. */
    const owed = (id: string): boolean => {
        const order = regulars.orderOf(id);
        if (order?.open && have(order.itemId) >= order.amount) return true;
        return (villagers.requests?.open ?? []).some((request) => request.from === id && request.accepted && have(request.itemId) >= request.amount);
    };
    const villagerSpot = (id: string | undefined): { x: number; z: number } | undefined => (id ? game.scene.getObjectByName(`villager-${id}`)?.position : undefined);

    /** Something the farmer thinks once, the first time it comes up. */
    function think(id: string, lines: string[]): void {
        if (thoughts.has(id) || !game.state.is('playing')) return;
        thoughts.add(id);
        void narration.speak(lines);
    }
    const SIGHTS: Array<{ id: string; spot: { x: number; z: number }; within: number; lines: string[] }> = [
        { id: 'pool', spot: PLACES.pool, within: 26, lines: ['Still water. No wind on it at all.', 'Black, and it does not show the sky. I do not think I will drink from it.'] },
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
            if (have(tool) === 0 && give(tool, 1)) void narration.speak([`My ${tool === 'axe' ? 'axe' : 'watering can'}, leaning against the door. Fen must have found it on the road.`]);
        }
        if (rescuedOn === dayCycle.day) return;
        const broke = coins.value() < 4 && farm.plantedCount === 0 && SEEDS.every((seed) => have(seed) === 0) && have('turnip') === 0 && have('wheat') === 0;
        if (!broke || !give('turnip-seed', 3)) return;
        rescuedOn = dayCycle.day;
        void narration.speak(['A paper twist of turnip seeds on the doorstep.', 'Barnaby has written on it: "On account. Do not let it happen twice."']);
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
            if (escape.waiting && letters.read >= 2) think('hill', ['Pell wants me up the hill, by the old tree. Something about going home.', '(The west path from the chapel. ⛰ on the compass.)']);
            endQuiet();
            const sign = omens.near(player);
            if (sign) think(`omen-${sign}`, OMEN_THOUGHTS[sign]);
            if (Math.max(Math.abs(player.x), Math.abs(player.z)) > WRAP_AT - 26) think('edge', ['The fog is getting thicker out here. I cannot see the ground ahead. This must be what they mean by the Veil.']);
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
        if (delta <= 0) return;
        today.earned += delta;
        juice.chime('coin');
    });
    const morning = addPanel(game, {
        title: 'Morning',
        rows: () => [
            { icon: '🌅', title: `Day ${dayCycle.day}`, detail: nightLine },
            { heading: true, title: 'Yesterday' },
            { icon: '🪙', title: today.earned > 0 && today.earned >= tally.bestDay ? 'Earned (your best day yet)' : 'Earned', meta: coin(today.earned), ...(tally.bestDay > 0 ? { detail: `Best day: ${coin(tally.bestDay)}. Most requests in a day: ${tally.bestStreak}.` } : {}) },
            { icon: '❗', title: 'Requests filled', meta: String(today.delivered) },
            { icon: '🍲', title: 'Dishes cooked', meta: String(today.cooked) },
            { icon: '🌱', title: 'Crops picked', meta: String(today.picked) },
            ...nightRows,
            { heading: true, title: 'Today' },
            ...planRows(),
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

    /** Plots the scarecrows left wet this morning. */
    let wept = 0;
    /** What the day ahead holds, for the morning panel: who is waiting, what is ready, what is owed. */
    const planRows = (): Array<{ icon: string; title: string; meta?: string; detail?: string }> => {
        const nameOf = (id: string): string => VILLAGERS.find((villager) => villager.id === id)?.name ?? '?';
        const item = (itemId: string, amount: number): string => `${amount} ${pockets.inventory.registry.resolve(itemId).name.toLowerCase()}`;
        const due = (day: number): string => (day <= dayCycle.day ? 'Today is the last day' : day === dayCycle.day + 1 ? 'By the end of tomorrow' : `By the end of day ${day}`);
        const orders = REGULARS.flatMap((regular) => {
            const order = regulars.orderOf(regular.id);
            return order?.open ? [{ icon: '🧺', title: `${nameOf(regular.id)}'s regular order: ${item(order.itemId, order.amount)}`, meta: coin(order.pay), detail: `${due(order.dueDay)}${have(order.itemId) >= order.amount ? '. You have it on you.' : ''}`, dueDay: order.dueDay }] : [];
        });
        const asked = (villagers.requests?.open ?? []).map((request) => ({
            icon: '❗',
            title: `${nameOf(request.from)} wants ${item(request.itemId, request.amount)}`,
            meta: coin(request.reward),
            detail: `${request.accepted ? due(request.dueDay) : `On offer, for ${coin(request.deposit)} down`}${have(request.itemId) >= request.amount ? '. You have it on you.' : ''}`,
            dueDay: request.dueDay,
        }));
        const ripe = farm.ripeCount;
        const empty = farm.plots.filter((plot) => plot.active && !plot.crop).length;
        return [
            ...[...orders, ...asked].sort((a, b) => a.dueDay - b.dueDay).slice(0, 4).map(({ dueDay: _dueDay, ...row }) => row),
            ...(ripe > 0 || empty > 0 ? [{ icon: '🌱', title: [ripe > 0 ? `${ripe} ${ripe === 1 ? 'crop is' : 'crops are'} ready to pick` : '', empty > 0 ? `${empty} ${empty === 1 ? 'plot is' : 'plots are'} empty` : ''].filter(Boolean).join(', '), ...(ripenedOvernight > 0 ? { detail: `${ripenedOvernight} ripened in the night.` } : {}) }] : []),
            ...(wept > 0 ? [{ icon: '💧', title: `The scarecrows wept over ${wept} ${wept === 1 ? 'plot' : 'plots'}`, detail: 'Those are watered for the day.' }] : []),
            ...(weather.line ? [{ icon: '☁', title: weather.line }] : []),
            ...(escape.pledge.state === 'running' ? [{ icon: '🌅', title: `${coin(escape.pledge.remaining)} still to burn`, meta: `${escape.pledge.daysLeft}d`, ...(coins.value() >= 100 ? { detail: `You have ${coin(coins.value())}. Pell is on the hill.` } : {}) }] : []),
        ];
    };

    /** What was done in the night, for the morning to mention. */
    let nightRows: ReturnType<typeof wrongness.newDay> = [];
    let ripenedOvernight = 0;
    function sleep(message?: string): void {
        // The field has the night as well, watered or not, before the morning dries it.
        ripenedOvernight = growFor((30 - dayCycle.hour) % 24);
        dayCycle.sleep();
        nightRows = wrongness.newDay();
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
        // Paid in full: this is the night the farmer does not wake up here.
        if (escape.pledge.state === 'kept') {
            saves.save();
            void ending.play({ kind: 'wake', title: 'You woke up', slides: WAKE_SLIDES, tally: lifeTally(), button: 'Wake' }).then(() => world.flow.win());
            return;
        }
        // The last day went by unpaid: this is the night the farmer stops being a visitor.
        if (escape.pledge.state === 'missed' && tally.stayed === 0) {
            tally.stayed = dayCycle.day;
            tally.bestDay = Math.max(tally.bestDay, today.earned);
            nightLine = 'You slept well. You always sleep well now.';
            sleep();
            deeds.award('stayed');
            void ending.play({ kind: 'stay', title: 'You stayed', slides: STAY_SLIDES, tally: lifeTally(), button: 'Go on living here' }).then(() => morning.open());
            return;
        }
        tally.bestDay = Math.max(tally.bestDay, today.earned);
        nightLine = NIGHTS[dayCycle.day % NIGHTS.length] as string;
        game.effects.flash(0.9, 0x000000, 0.95);
        sleep();
        morning.open();
    }

    const ending = setupEnding(game);
    /** What a life here came to, for the last card of an ending. */
    const lifeTally = (): Array<{ label: string; value: string }> => [
        { label: 'Days in Hollowveil', value: String(dayCycle.day) },
        { label: 'Requests filled', value: String(villagers.requests?.completed ?? 0) },
        { label: 'Regular orders kept', value: String(tally.regulars) },
        { label: 'Crops picked', value: String(tally.harvested) },
        { label: 'Hearts', value: String(VILLAGERS.reduce((total, villager) => total + villagers.relationships.hearts(villager.id), 0)) },
        { label: 'Things noticed that were not right', value: `${wrongness.noticed.size} of 7` },
        { label: 'Deeds', value: String(deeds.earned) },
    ];

    dayCycle.hooks.onDayStart = (day) => {
        farm.newDay();
        wept = scarecrows.weep();
        villagers.newDay();
        regulars.newDay();
        // Wren's half: a few seeds on the step, of whatever the store stocks.
        if (regulars.has('seeds')) {
            const seeds = stock.filter((itemId) => itemId.endsWith('-seed'));
            const seed = seeds[day % seeds.length] as string;
            give(seed, 2);
            game.toasts.push(`Wren left 2 ${pockets.inventory.registry.resolve(seed).name.toLowerCase()} on your step`, { color: '#b8f0a0' });
        }
        happenings.newDay();
        omens.setDay(day);
        juice.banner(`Day ${day}`, escape.pledge.state === 'running' ? `${escape.pledge.daysLeft} days left to wake` : '');
    };

    plates = setupPlates(game, {
        dayCycle,
        isNight: () => isNight(dayCycle),
        coins,
        format: coin,
        hotbar,
        clock: () => wrongness.clock(),
        label: () => wrongness.questLabel(),
        note: () => (escape.pledge.state === 'running' ? `${coin(escape.pledge.remaining)} to wake · ${escape.pledge.daysLeft}d` : ''),
        basket: () =>
            [
                ...warmth.carried().slice(0, 4).map((dish) => {
                    const name = pockets.inventory.registry.resolve(dish.itemId).name;
                    const left = dish.hoursLeft >= 1 ? `${Math.floor(dish.hoursLeft)}h` : `${Math.max(1, Math.round(dish.hoursLeft * 60))}m`;
                    return { text: `${dish.heat === 'cold' ? '❄' : '♨'} ${name}${dish.amount > 1 ? ` ×${dish.amount}` : ''} · ${dish.heat}${dish.heat === 'cold' ? '' : ` ${left}`}`, tone: dish.heat };
                }),
                ...(bike.mounted && warmth.carried().some((dish) => dish.heat !== 'cold') ? [{ text: '🚲 In the basket: cooling half as fast', tone: 'warm' as const }] : []),
                ...(weather.line ? [{ text: weather.line, tone: 'warm' as const }] : []),
                ...(scentLevel() >= 0.5 ? [{ text: '☁ They smell this from far off', tone: 'bad' as const }] : scentLevel() >= 0.25 ? [{ text: '☁ The smell carries', tone: 'bad' as const }] : []),
            ],
    });
    // A phone has no J: the notebook is a button there.
    const notebookHint = game.device.touch ? '' : '. J for the notebook';
    game.systems.add({
        name: 'clock-hud',
        order: SYSTEM_ORDER.EFFECTS,
        always: true,
        update: () => {
            if (!story.finished || dayCycle.stalled) return;
            // After the first day the best paid request is the thing to chase.
            const request = [...(villagers.requests?.open ?? [])].sort((a, b) => b.reward - a.reward)[0];
            const name = request ? pockets.inventory.registry.resolve(request.itemId).name.toLowerCase() : '';
            game.hud.setObjective(request ? `${VILLAGERS.find((villager) => villager.id === request.from)?.name ?? '?'} wants ${request.amount} ${name} (${coin(request.reward)})${notebookHint}` : `Tend the farm${notebookHint}`);
        },
    });

    type Saved = { day?: number; hour?: number; field?: ReturnType<Farm['toJSON']>; tally?: typeof tally; thoughts?: string[]; can?: number };
    game.save.register('hollowveil', {
        save: (): Saved => ({ day: dayCycle.day, hour: dayCycle.hour, field: farm.toJSON(), tally: { ...tally }, thoughts: [...thoughts], can: can.left }),
        load: (data) => {
            const saved = data as Saved | undefined;
            if (!saved) return;
            dayCycle.day = saved.day ?? 1;
            dayCycle.setHour(saved.hour ?? 7);
            omens.setDay(dayCycle.day);
            if (saved.field) farm.fromJSON(saved.field);
            Object.assign(tally, saved.tally);
            can.left = saved.can ?? canSize();
            thoughts.clear();
            for (const id of saved.thoughts ?? []) thoughts.add(id);
        },
    });
    game.save.register('coins', { save: () => coins.value(), load: (value) => coins.set(Number(value ?? 20)) });

    const settings = addSettings(game, {
        namespace: 'hollowveil-farm',
        fullscreen: true,
        volume: ['master', 'music', 'ambient', 'sfx'],
        settings: [
            { id: 'look', label: 'Mouse sensitivity', kind: 'slider', min: 0.2, max: 2, step: 0.05, default: 1, percent: true, apply: (value) => (world.controls.look.sensitivity = LOOK_BASE * value) },
            { id: 'vhs', label: 'VHS tape (wobble, colour fringes, static)', kind: 'toggle', default: true, apply: (on) => look.setVhs(on) },
            { id: 'shimmer', label: 'PS1 shimmer (wobbling edges)', kind: 'slider', min: 0, max: 1.5, step: 0.05, default: 0.6, percent: true, apply: (value) => look.setSnapStrength(value) },
            { id: 'psx', label: 'PS1 colours (dithering)', kind: 'toggle', default: true, apply: (on) => look.setPsx(on) },
            { id: 'mist', label: 'Drifting mist', kind: 'toggle', default: true, apply: (on) => atmosphere.setNoise(on ? 0.7 : 0) },
            { id: 'shake', label: 'Screen shake', kind: 'toggle', default: true, apply: (on) => (game.effects.shakeEnabled = on) },
        ],
    });
    // In the corner past the clock. It can be clicked from any menu; in play the mouse is held by the game.
    addFullscreenButton({ parent: game.uiRoot, corner: 'top-right', hideWhenActive: false, landscape: false });

    const saves = addSaveMenu(game, {
        flow: world.flow,
        slot: SAVE_SLOT,
        title: 'Hollowveil Farm',
        subtitle: 'A farm for the hollow, behind the veil.',
        hint: say('WASD to walk, E to interact, F to use what you hold, 1 to 8 to pick it, Tab for the bag, J for the notebook'),
        describe: (save) => `day ${(save.data.hollowveil as Saved | undefined)?.day ?? 1}`,
        onNewGame: () => void narration.speak(INTRO.map(say)),
        onContinue: () => villagers.snapToSchedule(),
        buttons: [settings.button],
    });
    game.menus.register(VICTORY_MENU, {
        title: 'You woke up',
        subtitle: 'Your own ceiling. Your own kitchen, and rain of the ordinary kind. On the pillow beside you: a folded slip with your name on it, and one pale turnip seed.',
        buttons: [{ label: 'Main menu', primary: true, action: () => world.flow.quit() }],
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

    game.world = { ...world, scarecrows, narration, body, pack, chest, chestPack, escape, happenings, deeds, terrain, farm, dayCycle, villagers, bike, barriers, population, pockets, bag, hotbar, coins, safeZones, nodes, cookpot, bench, upgrades, story, journal, saves, settings, shop, tally, can, restock, letters, morning, lightCandle, goToBed, omens, wake, hunting, crate, crateSpot, plates, warmth, scentLevel, wrongness, ending, goToBedNow: () => goToBed(), regulars, potRecipes, visitHours, lanterns, veilAt, atmosphere, barn, scales, drops, dropInWorld,
        // For the probe and for trying things out from the console.
        hollowTarget: () => hollowTarget(dayCycle, hunting()),
        weather,
        whispers,
        pool,
        wakeFromDeath: wake,
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
