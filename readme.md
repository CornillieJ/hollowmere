# three.js game start

A starting point for a three.js game that is already a game. Instead of an empty
scene and a render loop, this gives you the systems every project rebuilds:
physics, input, camera rigs, HUD and menus, saving, effects, audio, and a set of
ready-to-call game templates.

It is the game counterpart to
[VR-start](https://github.com/CornillieJ/VR-start): same stack (Vite, TypeScript,
three.js, GSAP, stats.js, troika text), same house style, but aimed at flat
screen games.

## What it can already build

The suite was built with five specific games in mind, and each one has a working
demo in `scripts/demos`:

| Game | Template | Demo key |
| --- | --- | --- |
| Easy Delivery Co. style courier runs | `createDeliveryGame` | `?demo=delivery` |
| 3D chess | `createChess` (built on `createBoardGame`) | `?demo=chess` |
| Third person Tron | `createTronGame` | `?demo=tron` |
| Harvest Moon style farming | `createFarmGame` | `?demo=farm` |
| Portal | `createPortalGame` | `?demo=portal` |

Plus the general purpose ones: first person, third person, top-down, twin stick
and wave survival arenas.

Every game built from this template can publish itself to GitHub Pages with the
workflow in `.github/workflows/pages.yml`: enable Pages once per repo with
`gh api -X POST /repos/<owner>/<repo>/pages -f build_type=workflow` and the built
game appears at `https://<owner>.github.io/<repo>/`.

## Quick start

```bash
npm install
npm run dev      # http://localhost:5180
```

The default entry point is a gallery of every demo. Pick one, or add
`?demo=<key>` to the url to go straight in. To start a real project, replace the
body of `main` in `src/scripts/logic.ts` with one line:

```ts
import { createThirdPersonGame } from './templates/third-person-game';

void createThirdPersonGame({
    title: 'My game',
    arena: { size: 60, obstacles: 12 },
    autoStart: false, // show the main menu first
});
```

Scripts:

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server on port 5180, HTTP (a flat screen game does not need TLS) |
| `npm run build` | Production build into `dist/`, with three.js, Rapier and GSAP in separate chunks |
| `npm run typecheck` | `tsc --noEmit`, strict, plus `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` |
| `npm run smoke` | Headless Chromium boot check: fails on any console error, exception or failed request |
| `npm run smoke:combat` | The same, plus a combat probe that verifies damage, pickups, pause and the debug view |
| `npm run test` | Run `tests/**/*.test.ts` in Node, bundled with esbuild, no test framework |

## Project layout

```
src/
  index.html, css/style.css
  scripts/
    init.ts                 createGame / startGame / init: the bootstrap and the loop
    logic.ts                entry point, the demo gallery
    Constants/Constants.ts  every tuning number, grouped and `as const`
    types/types.ts          the ambient `Game` hub type and shared shapes
    core/                   events, time, systems, state machine, game flow
    input/                  keyboard, mouse with pointer lock, gamepad, unified Input
    controls/               pointer look, character movement, first/third/top-down/orbit
    physics/                Rapier world wrapper, character body, queries, layers, debug view
    helpers/                pure functions: maths, vectors, transform, timing, assets, text, build
    fx/                     particles, camera shake, floating text, trails, effects facade
    audio/                  Web Audio manager with music, sfx and ambient buses
    ui/                     HUD, menus, prompts, toasts, debug overlay
    game/                   gameplay systems: player, health, damage, enemies, weapon, pickups,
                            inventory, objectives, save, interaction, projectiles, spawner,
                            board, farm, day cycle, delivery, portals, light cycles
    setup/                  scene defaults: lighting, sky, fog, ground, environment
    templates/              complete games, callable in one line
    demos/                  one showcase per template, plus the gallery
tools/
  smoke.mjs                 headless smoke test
  probe-combat.js           example probe: damage, pickups, pause, debug view
```

## The kit: compose a game, do not write a template

The point of this repository is the library, not the templates. Every common
system installs into a game you already have, with one `add...` call and options
you can leave out. A game then reads as a list of installs plus its own rules.

```ts
import { createGame, startGame } from './init';
import { addInventory, addMenu, addObjectives, addPlacement, addResource, addScene, addToolbar, addWaves } from './kit';

const game = await createGame();
addScene(game, { preset: 'outdoor-day', groundSize: 200 });
const gold = addResource(game, { id: 'gold', label: 'Gold', initial: 120, format: (v) => `$${v}` });

const bag = addInventory(game, {
    key: 'inventory',                    // the input action, rebindable like any other
    items: ITEMS,                        // one definition drives the world, the UI and the save
    currency: { resource: gold },
    persist: 'bag',                      // rides the game's save store
});

const shop = addInventory(game, {
    key: 'shop', primary: false,         // a second panel, same items
    mode: 'shop', catalogue: ['axe', 'lantern'],
    currency: { resource: gold },
    customer: bag,                       // purchases land in the bag; its level and unlocks gate the shop
});
addToolbar(game, { entries: [{ id: 'axe', label: 'Axe', cost: 90, hotkey: '1' }], onSelect: (id) => shop.buy(id) });
```

`addInventory` gives you items, stacking, uses with cooldowns, consumption,
costs, currency, unlock gates, a save slot, an open key and two screens (bag and
shop) from one list of definitions:

```ts
const ITEMS = [
    { id: 'bread', name: 'Bread', icon: '🍞', category: 'consumable', price: 8,
      description: 'Restores 25 health.', use: { onUse: ({ game }) => game?.player?.heal(25) } },
    { id: 'axe', name: 'Axe', icon: '🪓', category: 'tool', price: 90, maxStack: 1,
      requires: { level: 2 } },                       // locked until progression says otherwise
    { id: 'lantern', name: 'Lantern', icon: '🏮', price: 60, requires: { unlocks: ['workshop'] } },
];
```

Available installers, all of them optional:

| Installer | What it gives you |
| --- | --- |
| `addScene` | lights, sky, fog and a ground with physics |
| `addResource` | a named counter with a HUD row: gold, wood, XP, lives |
| `addInventory` | bag and shop: items, stacks, uses, costs, gates, save, panel |
| `addToolbar` | a row of selectable cards: towers, tools, units |
| `addPlacement` | click a grid cell to place something, with a placement ring |
| `addPathEnemies` | walkers on a route: convoys, escorts, tower defence enemies |
| `addGridTowers` | buildings on a grid that shoot whatever walks past, with upgrades and selling |
| `addPlatformerControls` | run and jump with coyote time, jump buffering and variable height |
| `addMovingPlatforms` | platforms on a route that carry whoever stands on them |
| `addCheckpoints` | pads that remember the last safe spot, in order for race gates |
| `addHazards` | lava, spikes, water and laser grids, damaging or respawning |
| `addObjectives` / `addObjective` | quest lines wired to the HUD and `level:complete` |
| `addWaves` | timed waves with a cleared-field rule |
| `addMenu` | menus with buttons, options and a pause behaviour |
| `addProgression` | levels, XP and unlock flags that gates read |

The templates in `scripts/templates` are examples of composing these. The
building blocks do not depend on them: `scripts/demos` shows each installer on
its own, and the tower defence game in
[CornillieJ/tower-defence](https://github.com/CornillieJ/tower-defence) is the
same blocks in a different order.

### A jump that feels fair

The platformer controller carries the three assists every platformer needs, as
options rather than code:

```ts
addPlatformerControls(game, player.body, {
    jumpHeight: 2.2,
    jumpCut: 0.42,      // releasing the key cuts the rise short
    coyoteTime: 0.14,   // you can still jump just after walking off a ledge
    jumpBuffer: 0.16,   // a jump pressed just before landing still happens
    airJumps: 1,        // one extra jump in the air
    airControl: 0.8,
});
```

A moving platform carries a kinematic character by writing its step into the
character's `carry` vector, so you stand still and travel, and jump off with your
momentum intact. That one mechanism is why `addMovingPlatforms` exists as a
block rather than a game-specific detail.

## How the engine is wired

Everything hangs off one object, `Game`, which every module receives:

```ts
game.renderer / scene / camera / canvas / sizes
game.time        // scaled delta, fixed-step accumulator
game.events      // typed event bus
game.input       // actions, move and look axes, gamepad included
game.physics     // Rapier world, bodies, raycasts
game.assets      // cached loaders with progress
game.audio       // music, sfx, ambient buses
game.hud / menus / prompts / toasts / debug
game.systems     // ordered update lists
game.state       // boot, menu, playing, paused, dead, victory
game.player / inventory / objectives / interactions / projectiles / save / effects
```

**The loop** (`init.ts`) is deliberately fixed: sample input, run frame systems,
drain fixed physics steps, run camera and UI systems, clear input edges, render.
Anything with different timing needs registers a **system** with an explicit
order instead:

```ts
game.systems.add({
    name: 'sway',
    order: SYSTEM_ORDER.GAMEPLAY,
    update: (delta, game) => { /* every frame */ },
    fixedUpdate: (step, game) => { /* every physics step */ },
    lateUpdate: (delta, game) => { /* after cameras */ },
});
```

Two rules worth remembering:

- `always: true` on a system makes it run while a menu is open. That is how the
  pause key keeps working while paused.
- Systems with an order at or after `SYSTEM_ORDER.EFFECTS` (95) also run while
  paused, which is what keeps UI and particles alive.

**Pausing** is owned, not shared. Anything that freezes the clock does it under
its own name, and time only runs again once every owner has let go:

```ts
game.time.pause(dialog);        // a dialog over an open inventory...
game.time.resume(dialog);       // ...closes, and the game stays frozen behind the inventory
game.time.slowMotion(0.06, 0.05);   // hit stop, measured in real seconds
game.time.scale = 0.5;          // your own slow motion, untouched by the two above
```

Screen layers work the same way: `game.screens.show('modal', owner)` keeps the
layer up until every owner has hidden it. State changes are published on the
bus as `state:changed`.

**Game flow** (`core/game-state.ts`) wires menu, playing, paused, dead and
victory to input, tweens, HUD and pointer lock. You supply what "start",
"restart" and "quit" mean:

```ts
setupGameFlow(game, {
    title: 'My game',
    autoStart: false,
    onRestart: () => respawnEverything(),
});
```

## Physics

Rapier 3D through `@dimforge/rapier3d-compat`, wrapped so gameplay code never
touches Rapier directly.

```ts
// Bodies
const box = game.physics.add({ kind: 'dynamic', shape: { type: 'box', size: { x: 1, y: 1, z: 1 } }, position, object: mesh });
box.applyImpulse(new THREE.Vector3(0, 5, 0));

// Static geometry from an imported model
game.physics.addStaticFromObject(gltf.scene, { tag: 'wall' });

// Walking, sliding, stairs and slopes. The object stands on its feet: the capsule
// is centred, so the sync puts the model half a height lower and leaves its yaw alone.
const character = new CharacterBody(game.physics, { position, radius: 0.35, height: 1.8, object: avatar });

// The same for any body whose model origin is not the collider centre
game.physics.add({ shape, object: model, syncOffset: { x: 0, y: -0.9, z: 0 }, syncRotation: false });

// Queries
const hit = game.physics.raycast(origin, direction, 50);
const everything = raycastAll(game.physics, origin, direction, 50);
const inBlast = overlapSphere(game.physics, centre, 6);
const clear = hasLineOfSight(game.physics, from, to);
```

### Collision layers

`physics/layers.ts` packs membership and mask into one number, so a bullet never
hits the player who fired it and enemy shots never hit each other. Bodies pick a
group from their tag (`player`, `enemy`, `ground`, `wall`, ...), or you set one
explicitly:

```ts
game.physics.add({ shape, tag: 'enemy' });              // picks GROUP.enemy
game.physics.add({ shape, groups: GROUP.playerProjectile });
```

## Input

```ts
game.input.move                 // Vector2, clamped to length 1
game.input.look                 // pixels-equivalent; gamepad sticks are rescaled
game.input.isDown('sprint')     // actions, not key codes
game.input.wasPressed('interact')
game.input.bind('interact', ['KeyE', 'Pad2']);
```

Default actions: `forward back left right jump sprint crouch interact use attack
aim reload inventory pause confirm cancel`. Keys, mouse buttons (`Mouse0`) and
gamepad buttons (`Pad0`) are all just codes in a binding, and movement is read
from the bindings too, so rebinding `left` really moves it.

Input closes while a menu or panel is up: `move`, `look` and every action read
as idle. Two calls exist for the keys that must still work then:

```ts
game.input.wasPressedUngated('inventory')   // the key that closes the panel it opened
game.input.consume('cancel')                // swallow a press so nothing later in the frame sees it
```

Dialogs and panels listen for their keys in the capture phase and stop them, so
Escape closing a dialog never also pauses, and `1` picking an option never also
selects a tool.

**Taps, not clicks.** For anything you pick in the world, use `onTap`: it fires
on release, only when the pointer did not travel, so a camera drag that starts
on a piece never selects it. It is what the board and the tower grid use.

```ts
onTap(game.canvas, ({ clientX, clientY }) => pick(clientX, clientY), { ignore: (e) => game.input.pointerOverUi });
```

## Controls

`new FirstPersonController(game, player, options)` and friends register
themselves as systems, so creating one is the whole integration.

- `FirstPersonController` pointer locked eye camera, head bob, crouch, sprint FOV kick
- `ThirdPersonController` orbit pivot with lag, wheel zoom, wall-aware camera
- `TopDownController` screen-relative movement, optional mouse rotation, isometric `fixedYaw`
- `OrbitController` three.js OrbitControls for menus and board games

## Templates

Each template is a complete game. `createXGame()` creates the hub, sets up the
world and starts the loop; `setupXGame(game, options)` does the same for an
existing hub, which is how you compose templates.

```ts
import { createBoardGame } from './templates/board-game';
import { createDeliveryGame } from './templates/delivery-game';

const { game } = await createDeliveryGame({ town: { buildings: 24 } });
```

| Template | What you get |
| --- | --- |
| `first-person-game` | FPS arena: weapon, enemies, pickups, HUD, pause menu, save slot |
| `third-person-game` | The same with an over-the-shoulder camera and a visible avatar |
| `top-down-game` | The same from above, screen-relative movement |
| `twin-stick-game` | Top-down shooter: character faces the mouse, shots fly flat |
| `arena-shooter` | Wave survival, three camera styles, `waves`, `startCount`, `countStep` |
| `board-game` | Clickable grid with pieces, turns, hover, highlights, orbit camera |
| `portal` | First person chamber with linked portals and an exit pad |
| `farm` | Plots, crops, water, day cycle, sell crate, sleep, money as a resource |
| `tron` | Light cycles, lethal ribbons, AI rivals, last one driving wins |
| `delivery-game` | Parcel pickups, drop off markers, timer, wallet |
| `racing` | Time trial: ordered gates, laps, best lap, minimap |
| `tower-defense` | Road, build plots, waves, towers with upgrades and selling |

Templates take `build: (world) => { ... }` for level content that is made once
(the board game calls it `setup`). The action templates also take
`populate: (world) => { ... }` for what a restart must bring back, such as
enemies and pickups: it runs at the start and again after every restart. They
share `player`, `arena`, `weapon`, `hud`, `spawnPoint` and `saveSlot`.

Every template reports a win by emitting `level:complete`; the game flow turns
that into the victory screen, so a new template gets one for free.

### Chess in one call

```ts
import { createChess } from './chess';
const { chess } = await createChess();          // menu, engine, two players, undo, hints, saves
```

`scripts/chess` is a game pack on top of `createBoardGame`: perft-tested rules
(`rules.ts`), an alpha-beta engine on three levels (`ai.ts`), the CC0 piece
models in `static/models/chess`, the side panel and the synthesised sounds.

## Helpers

Pure functions, imported as a namespace so call sites read well:

```ts
import * as HELP from './helpers';
HELP.clamp(value, 0, 1);
HELP.damp(current, target, 0.001, delta);      // frame-rate independent
HELP.lookAtXZ(mesh, target);
HELP.snapToGround(mesh, 0);
HELP.closestTo(position, enemies);
HELP.animateScale(mesh, 1.4, 0.2);
```

- `math` clamp, lerp, damp, moveTowards, remap, smoothstep, wrapAngle, decay
- `vector` lerp/damp/clampLength, angle conversions, applySpread, flatten
- `distance` distance, distanceXZ, isWithinRadius, isInViewCone, closestPointOnSegment
- `transform` place, lookAtXZ, turnTowards, snapToGround, ringLayout, gridLayout, attachKeepingWorld
- `object` userData helpers, findByName/Tag, dispose, destroy, clearGroup, setOpacity, memory snapshots
- `build` `BlockBuilder` for grey-box levels: `box`, `sphere`, `cylinder`, `platform`, `walls`, `stairs`, `scatter`, `createAvatar`, `checkerTexture`
- `timing` Timer, Cooldown, Interval, Stopwatch, Ticker
- `animation` GSAP wrappers: animatePosition/Rotation/Scale/Pop/Shake/Opacity, pauseTweens
- `assets` cached model, texture, cube map, JSON and audio loaders with progress
- `text` troika labels, billboards, counters
- `raycast` screenToRay, pickFromCamera, worldToScreen, isOnScreen
- `grid` `Grid` with cell/world conversion, neighbours, chess notation
- `pathfinding` A\* over `Grid`, line of sight, path smoothing, `PathFollower`
- `curve` `CurvePath` (loop, ping-pong, speed, offsets) and `RailCamera`
- `animation-state` `Animator` over `AnimationMixer`: crossfades and one-shot clips
- `mesh-batch` merge static meshes per material, or instance many copies of one
- `profiler` per-system frame timing, no changes needed in the systems
- `tap` `onTap`: a press and release that did not turn into a drag
- `viewport` `setViewInset`: keep the 3D view centred beside a side panel, picking included
- `color`, `random`, `dom` the obvious small things

The orbit camera can glide to a view on its own: `orbit.orbitTo({ azimuth: Math.PI }, 0.8)`.
`setupGradientBackground(scene, top, bottom)` gives a backdrop that reads better than a flat colour.

## Gameplay systems

```ts
game.health                          // or new Health({ max: 120, regenPerSecond: 2 })
applyDamage(game, object, 25, { point, knockback: 6, headshotMultiplier: 2 });
const enemy = new EnemyManager(game);   // idle / chase / attack / dead, ranged or melee
const weapon = new Weapon(game, { damage: 25, fireRate: 5, magazineSize: 12, ammoItem: 'cell' });
const pickups = new PickupManager(game); // touch or interact, spins, bobs, floats text
const spawner = new WaveSpawner(game, { waves, spawn: (i, wave) => { ... } });
game.inventory.add('wood', 3);
game.objectives.add('wood', 'Collect 10 wood', { target: 10 });
game.save.register('mySystem', { save: () => state, load: (data) => restore(data) });
game.interactions.add(door, { prompt: 'Open', onInteract: () => open(door) });
```

Put a `Health` in `userData.health` and `applyDamage`, projectiles and explosions
all work on that object with no further wiring:

```ts
const health = new Health({ max: 80 });
mesh.userData.health = health;
health.onDeath(() => removeEnemy(mesh));
```

Larger systems: `board` (clickable grids for board games), `daycycle`, `farm`,
`delivery`, `portals`, `light-cycle`.

### Enemies that plan a route

`EnemyManager` walks straight at the player by default, which is fine in the
open. Give it a navigation grid and it plans around cover instead, replanning a
few times a second:

```ts
const grid = new Grid({ width: 40, depth: 40, spacing: 1, origin: { x: -20, y: 0, z: -20 } });
const blocked = buildBlockedSet(builder.groups.get('cover')?.children ?? [], grid, { padding: 1 });

setupThirdPersonGame(game, {
    navigation: { grid, isWalkable: walkableUnlessBlocked(blocked), replanInterval: 0.5 },
});
```

## Effects, audio and UI

```ts
game.effects.impact(point);                     // sparks plus a small shake
game.effects.explosion(point, 4);
game.effects.damageText(position, 25);
game.effects.flash(0.3, 0xff0000, 0.2);
game.effects.hitStop(0.06);                     // brief slow motion
new Trail(object, { height: 1.5, color: 0x59d3ff });

game.audio.play('sfx/step.ogg', { rateVariance: 0.08 });
game.audio.playMusic('music/theme.ogg');
game.audio.setVolume('sfx', 0.6);

game.hud.setHealth(72, 100);
game.hud.setStat('gold', 240);
game.prompts.show('Open door', 'E');
game.toasts.push('Checkpoint reached');
game.debug.toggle(true);                        // fps, draw calls, bodies
game.debug.togglePhysics(true);                 // collider wireframe
```

## Several games on one machine

The dev port comes from `VITE_PORT` in `.env`, so a machine can serve the
template and every game built from it at once:

```bash
cp .env.example .env    # then set VITE_PORT=5240
```

## Keeping a game in sync with the template

A repository created with "use this template" has an unrelated git history, so
`git merge` conflicts on every file. What differs is ownership: the template owns
the library, the game owns its entry point, content and configuration. Copy the
library instead:

```bash
git remote add template https://github.com/CornillieJ/threejs-game-start.git
git config remote.template.fetch "+refs/heads/*:refs/remotes/template/*"
node tools/sync-template.mjs        # then npm run typecheck && npm test
```

`tools/sync-template.mjs` lists the paths the template owns and deliberately
leaves `package.json`, `index.html`, `readme.md`, `.env`, `tsconfig.json` and
`vite.config.ts` alone.

## Testing

Two paths, for two kinds of code.

**Pure logic** goes in `tests/*.test.ts` and runs in Node:

```bash
npm run test
```

There is no framework: a test file asserts with `node:assert/strict` and anything
that throws fails the run. `tools/unit.mjs` bundles each file with esbuild, so
extensionless imports and `three` types resolve exactly as they do in the app.
See `tests/math.test.ts` for the shape to copy. This is where rules, damage
formulas, save formats and maths belong.

**Anything with a canvas** goes through `tools/smoke.mjs`: it boots the game in
headless Chromium and fails on any console error, uncaught exception or failed
request. Optional probe files reach into the live game through the
`window.__game` handle:

```bash
npm run dev &
node tools/smoke.mjs http://localhost:5180/ tools/probe-combat.js
```

Every demo can be smoke tested in a loop:

```bash
for d in third-person first-person top-down twin-stick arena chess portal farm tron delivery blank; do
    node tools/smoke.mjs "http://localhost:5180/?demo=$d" || exit 1
done
```

## Deliberate choices

- **Rapier, not ammo.js.** Same wasm-in-the-browser idea, but it ships a
  character controller (sliding, autostep, ground snapping), a much smaller API
  surface, and a base64 build that needs no bundler configuration.
- **A fixed physics step.** Rendering runs at whatever the display does;
  gameplay and physics always see the same step, so nothing explodes on a slow
  machine and behaviour is reproducible.
- **Systems instead of a scene graph of scripts.** Order is explicit, toggling a
  whole feature off is one call, and "does this run while paused" is answerable.
- **GSAP keeps its own ticker.** Nothing in the game loop has to tick it; pause
  is `setTweenSpeed(0)`.
- **The gallery is part of the starter.** A template you cannot run in one click
  is a template nobody trusts.

## Not included (on purpose)

Full chess rules (check, checkmate, castling, promotion), a portal gun,
vehicles, networking, a level editor, and animation state machines. The roadmap
in `ROADMAP.md` lists them with notes on what each would take.
