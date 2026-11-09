import * as THREE from 'three';

import * as CONSTANTS from '../Constants/Constants';
import { SYSTEM_ORDER } from '../core/systems';
import { setupGameFlow, type GameFlow } from '../core/game-state';
import { setupSceneDefaults, type SceneDefaultsOptions } from '../setup/setup-scene';
import { BlockBuilder, checkerTexture } from '../helpers/build';
import { DayCycle, type DayCycleOptions } from '../game/daycycle';
import { Farm, STARTER_CROPS, type FarmOptions, type PlotState } from '../game/farm';
import { Player } from '../game/player';
import { addInventory, addResource, type ResourceHandle } from '../kit';
import { addTouchControls } from '../kit/touch';
import { TopDownController, type TopDownOptions } from '../controls/top-down';
import { createGame, startGame } from '../init';
import type { HudOptions } from '../ui/hud';

/**
 * Farming game.
 *
 * A cottage on a field of tillable plots, a day cycle that moves the sun, crops
 * that grow while you are away, and a sell crate. Water a plot to double its
 * growth for the day, harvest when the crop is ripe, sell for money, sleep to
 * roll into tomorrow.
 *
 * Controls are top-down: WASD moves, the mouse turns the camera, E plants or
 * harvests, F waters, and sleeping happens at the cottage door.
 */
export type FarmGameOptions = {
    game?: GameOptions;
    title?: string;
    subtitle?: string;
    scene?: SceneDefaultsOptions;
    controls?: TopDownOptions;
    /** Plot layout and crop list. */
    farm?: FarmOptions;
    /** Day length and starting time. */
    day?: DayCycleOptions;
    hud?: HudOptions;
    autoStart?: boolean;
    debug?: boolean;
    /** Money the player starts with. */
    startingMoney?: number;
    build?: (world: FarmWorld) => void;
    saveSlot?: string;
};

export type FarmWorld = {
    game: Game;
    player: Player;
    controls: TopDownController;
    farm: Farm;
    dayCycle: DayCycle;
    flow: GameFlow;
    builder: BlockBuilder;
    /** Money earned from selling produce, the same resource a shop can charge. */
    money: ResourceHandle;
    /** Sell everything currently carried. */
    sellAll: () => number;
    /** Put the player, the field and the clock back to the first morning. */
    restart: () => void;
    dispose: () => void;
};

/** Prices paid by the sell crate, per item id. */
export const CROP_PRICES: Record<string, number> = {
    turnip: 12,
    corn: 22,
    pumpkin: 40,
};

/** Configure an existing game as a farming game. */
export function setupFarmGame(game: Game, options: FarmGameOptions = {}): FarmWorld {
    const spawnPoint = new THREE.Vector3(0, 0.4, 6);

    const lighting = setupSceneDefaults(game.scene, game.renderer, game.physics, {
        preset: 'outdoor-day',
        groundSize: 0,
        fog: true,
        ...options.scene,
    }).lighting;

    const builder = new BlockBuilder(game);
    const size = 90;
    const ground = builder.platform(size, 0, 0.4, { color: 0x7ba05b, tag: 'ground', receiveShadow: true });
    ground.material = new THREE.MeshStandardMaterial({ map: checkerTexture(256, 2, '#7ba05b', '#719454'), roughness: 1 });

    const dayCycle = new DayCycle(game, { dayLength: 480, startHour: 7, lighting, ...options.day });
    const farm = new Farm(game, { columns: 5, rows: 4, origin: { x: -2.5, y: 0.2, z: -3.5 }, crops: STARTER_CROPS, ...options.farm });

    // Cottage and sell crate, plus a scatter of trees for depth.
    builder.box({ size: { x: 5, y: 3, z: 4.5 }, position: { x: -9, y: 1.5, z: 8 }, color: 0xe4d7c3, tag: 'house' });
    builder.box({ size: { x: 5.6, y: 0.4, z: 5.1 }, position: { x: -9, y: 3.2, z: 8 }, color: 0x8c4a3a, tag: 'roof' });
    const crate = builder.box({ size: { x: 1.6, y: 1.2, z: 1.6 }, position: { x: 4.5, y: 0.6, z: 6.5 }, color: 0xb5793f, tag: 'sell-crate' });
    builder.scatter(14, size * 0.75, { color: 0x3f6b3a, tag: 'tree', minSize: 2, maxSize: 3.4, avoid: { position: { x: 0, y: 0, z: 0 }, radius: 14 } });

    const player = new Player(game, { position: spawnPoint, object: new THREE.Group() });
    game.player = player;
    const controls = new TopDownController(game, player, { height: 15, pitch: -Math.PI / 2.7, rotateWithMouse: true, jumpEnabled: false, ...options.controls });

    // The interaction registry is off: this template drives its own prompts so it
    // can describe the nearest plot instead of a single fixed object.
    game.interactions.enabled = false;

    // One bag, with the seeds and the produce priced so the crate can sell them.
    const bag = addInventory(game, {
        key: 'inventory',
        persist: 'inventory',
        items: [
            { id: 'turnip-seed', name: 'Turnip seeds', icon: '🌱', category: 'material', price: 4 },
            { id: 'corn-seed', name: 'Corn seeds', icon: '🌱', category: 'material', price: 6 },
            { id: 'pumpkin-seed', name: 'Pumpkin seeds', icon: '🌱', category: 'material', price: 9 },
            { id: 'turnip', name: 'Turnip', icon: '🥬', category: 'treasure', price: 12 },
            { id: 'corn', name: 'Corn', icon: '🌽', category: 'treasure', price: 22 },
            { id: 'pumpkin', name: 'Pumpkin', icon: '🎃', category: 'treasure', price: 40 },
        ],
    });
    const stockStarterSeeds = (): void => {
        bag.add('turnip-seed', 6);
        bag.add('corn-seed', 4);
        bag.add('pumpkin-seed', 2);
    };
    stockStarterSeeds();

    const startingMoney = options.startingMoney ?? 20;
    const money = addResource(game, { id: 'money', label: 'Money', initial: startingMoney, integer: true, format: (value) => `$${value}` });

    game.hud.setCombatCountersVisible(false);
    game.hud.setCrosshair(false, false);

    // Plant and harvest with ✋, water with 💧, open the bag with the inventory key.
    addTouchControls(game, {
        buttons: [
            { action: 'interact', label: '✋', primary: true },
            { action: 'use', label: '💧' },
            { action: 'sprint', label: '≫', hold: true },
            { action: 'inventory', label: '🎒' },
        ],
    });

    const world: FarmWorld = {
        game,
        player,
        controls,
        farm,
        dayCycle,
        flow: undefined as unknown as GameFlow,
        builder,
        money,
        sellAll: () => sellAll(),
        restart: () => {
            // A new game: empty field, starter bag, first morning.
            farm.clearField();
            bag.inventory.fromJSON({ slots: [] });
            stockStarterSeeds();
            dayCycle.day = 1;
            dayCycle.setHour(7);
            dayCycle.paused = false;
            player.restart(spawnPoint);
            money.set(startingMoney);
            refreshHud();
        },
        dispose: () => {
            farm.dispose();
            builder.dispose();
            controls.dispose();
            player.destroy();
        },
    };

    function sellAll(): number {
        let total = 0;
        for (const slot of game.inventory.slots) {
            const price = CROP_PRICES[slot.itemId];
            if (!price) continue;
            total += price * slot.amount;
            game.inventory.remove(slot.itemId, slot.amount);
        }
        if (total <= 0) {
            game.toasts.push('Nothing to sell', { color: '#ff9a9a' });
            return 0;
        }
        money.add(total);
        game.toasts.push(`Sold for $${total}`, { color: '#b6f5b6' });
        game.effects.particles.burst(crate.position.clone().setY(1.4), { count: 18, color: 0xffd166, size: 0.08, speed: 3, lifetime: 0.5 });
        refreshHud();
        return total;
    }

    function refreshHud(): void {
        game.hud.setStat('day', dayCycle.day, 'day');
        game.hud.setStat('time', dayCycle.clock, 'time');
        game.hud.setStat('crops', `${farm.plantedCount} planted`, 'field');
        game.hud.setObjective(farm.ripeCount > 0 ? `Harvest ${farm.ripeCount} ready crop(s)` : 'Plant seeds, water them, then sell at the crate');
    }

    dayCycle.hooks.onTick = () => {
        game.hud.setStat('time', dayCycle.clock, 'time');
    };
    dayCycle.hooks.onDayStart = (day) => {
        farm.newDay();
        game.toasts.push(`Day ${day}`, { color: '#ffe9a8' });
        game.hud.setStat('day', day, 'day');
    };
    farm.onChange(() => refreshHud());
    // The inventory reports changes through the options it was installed with,
    // so hook the refresh there rather than polling every frame.
    bag.onChange(() => refreshHud());

    // One system for "use what is in front of me": plots first, then the crate,
    // then the cottage door.
    const scratch = new THREE.Vector3();
    game.systems.add({
        name: 'farm-actions',
        order: SYSTEM_ORDER.GAMEPLAY + 1,
        update: () => {
            if (player.isDead || game.state.current !== 'playing') return;
            const plot = farm.nearestPlot(player.position, 1.8);
            const nearCrate = scratch.copy(player.position).sub(crate.position).setY(0).length() < 2;
            const nearDoor = scratch.copy(player.position).sub(new THREE.Vector3(-9, 0, 5.5)).setY(0).length() < 2.5;

            if (plot) handlePlot(plot);
            else if (nearCrate) {
                game.prompts.show('Sell produce', 'E');
                if (game.input.wasPressed('interact')) sellAll();
            } else if (nearDoor) {
                game.prompts.show('Sleep until morning', 'E');
                // Sleeping moves to the next day; the field and the money stay.
                if (game.input.wasPressed('interact')) dayCycle.sleep();
            } else {
                game.prompts.hide();
            }
        },
    });

    function handlePlot(plot: PlotState): void {
        if (plot.ripe) {
            game.prompts.show('Harvest', 'E');
            if (game.input.wasPressed('interact')) collectHarvest(plot);
            return;
        }
        if (!plot.crop) {
            const seed = nextSeed();
            if (!seed) {
                game.prompts.show('No seeds left', '');
                return;
            }
            game.prompts.show(`Plant ${seed.crop.name ?? seed.cropId}`, 'E');
            if (game.input.wasPressed('interact')) farm.plant(plot, seed.cropId);
            return;
        }
        game.prompts.show(plot.watered ? 'Growing' : 'Water', plot.watered ? '' : 'F');
        if (!plot.watered && game.input.wasPressed('use')) farm.water(plot);
    }

    function collectHarvest(plot: PlotState): void {
        const harvest = farm.harvest(plot);
        if (!harvest) return;
        game.inventory.add(harvest.itemId, harvest.amount);
        game.effects.text(plot.position.clone().setY(1), `+${harvest.amount} ${harvest.itemId}`, { color: 0x8ce09a });
    }

    function nextSeed(): { cropId: string; crop: (typeof STARTER_CROPS)[number] } | undefined {
        for (const [cropId, crop] of farm.crops) {
            if (crop.seed && game.inventory.has(crop.seed, 1)) return { cropId, crop };
        }
        return undefined;
    }

    world.flow = setupGameFlow(game, {
        title: options.title ?? 'Harvest Season',
        ...(options.subtitle !== undefined ? { subtitle: options.subtitle } : {}),
        autoStart: options.autoStart ?? true,
        simulateWhen: ['playing'],
        hudWhen: ['playing', 'paused'],
        crosshairWhen: [],
        pointerLock: true,
        onStart: () => game.input.requestPointerLock(),
        onRestart: () => world.restart(),
        onContinue: () => game.save.load(options.saveSlot ?? 'default'),
    });

    game.save.register('farm', {
        save: () => ({ money: money.value(), day: dayCycle.day, hour: dayCycle.hour, field: farm.toJSON() }),
        load: (data) => {
            const saved = data as { money?: number; day?: number; hour?: number; field?: ReturnType<Farm['toJSON']> } | undefined;
            if (!saved) return;
            money.set(saved.money ?? money.value());
            dayCycle.day = saved.day ?? dayCycle.day;
            dayCycle.setHour(saved.hour ?? dayCycle.hour);
            if (saved.field) farm.fromJSON(saved.field);
            refreshHud();
        },
    });

    refreshHud();
    options.build?.(world);
    game.world = world;
    if (options.debug) game.debug.toggle(true);
    return world;
}

/** Create the game, set it up as a farming game and start it. */
export async function createFarmGame(options: FarmGameOptions = {}): Promise<{ game: Game; world: FarmWorld }> {
    const game = await createGame({ shadows: true, ...options.game });
    const world = setupFarmGame(game, options);
    startGame(game);
    return { game, world };
}

/** Eye height used by the farm's first person fallback camera. */
export const FARM_EYE_HEIGHT = CONSTANTS.PLAYER_DEFAULTS.EYE_HEIGHT;
