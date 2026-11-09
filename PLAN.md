# Hollowmere round 2: plan and progress

Working notes so a later session can pick up at any point. Update the
checkboxes as work lands. Delete this file when the round is done.

## Rules of the round

- Everything reusable goes into the template first
  (`~/Coding/Fun/threejs-game-start`, branch `feat/homestead-blocks`), then is
  synced into this game with `node tools/sync-template.mjs` (run from the game,
  see how the last round did it in git history / package.json).
- Template: merge the branch to `main`, push to `origin` and `ark`.
- Hollowmere has no remote yet (user must create the repo). Commit locally.
- Commits: one short imperative line, no body, no trailers.
- Verify with `npm run typecheck`, `npm test` (template), and the gameplay probe
  `node tools/smoke.mjs http://localhost:5260/ tools/probe-hollowmere.js`
  (dev server: `npm run dev`).

## Decisions made with the user

- Gifts are removed: villagers only take what they asked for
  (`addVillagers({ gifts: false })`).
- Real rolling terrain (heightfield), farm and village on flat pads.
- Title menu with Continue / New game, autosave on sleep, "Save game" in the
  pause menu. 1 save slot.
- Settings menu: VHS filter toggle, mouse sensitivity, sound volumes.
- Deliver everything in one go.

## Template blocks (branch feat/homestead-blocks)

Written and passing typecheck, NOT yet tested in a browser:

- [x] `physics/physics.ts`: `heightfield` collider shape (row/column order
      still needs a runtime check against `Terrain.heightAt`)
- [x] `helpers/noise.ts`: `createNoise2D`, `fbm`
- [x] `setup/terrain.ts` + `kit/terrain.ts`: `Terrain`, `addTerrain`
      (flats, vertex colours, `heightAt`, `place`, `scatter`)
- [x] `game/interaction.ts`: `prompt` and `blockedPrompt` may be functions
- [x] `init.ts`: pointer lock is released while a modal is up, retaken after
- [x] `ui/menus.ts`: buttons with `visible()` and `text()`, re-read on open and
      after a press
- [x] `ui/list-panel.ts` + `kit/panel.ts`: `addPanel` (rows, tabs, key)
- [x] `game/crafting.ts` + `kit/crafting.ts`: `addCraftingStation`
- [x] `game/upgrades.ts` + `kit/upgrades.ts`: `addUpgrades`
- [x] `game/storyline.ts`, `ui/subtitles.ts`, `kit/story.ts`: `addNarration`,
      `addStoryline`
- [x] `kit/nodes.ts`: `addResourceNodes` (chop, forage, respawn)
- [x] `kit/population.ts`: `addPopulation` (roamers plus fixed posts)
- [x] `kit/saves.ts`: `addSaveMenu`; `SaveStore.peek`; menu ids exported from
      `core/game-state.ts`
- [x] `kit/settings.ts`: `addSettings`
- [x] `game/requests.ts`: tiers, weighted draw, `completed`
- [x] `kit/villagers.ts`: `gifts`, `items`, `topics`, `thanks`, `onTalk`,
      `hasMet`, conversation loops back to the choice list
- [x] `game/farm.ts`: `extraFields` + `setActiveFields`, `seedReturn`,
      `bonusSeedChance`
- [x] `kit/livestock.ts`: `add`, `remove`, `animals`

Still to do in the template:

- [ ] CSS in `src/css/style.css` for `.list-panel*`, `.subtitles*`,
      `.menu-dynamic` (class names are in `ui/list-panel.ts`, `ui/subtitles.ts`)
- [ ] Unit tests: `tests/crafting.test.ts`, `upgrades`, `storyline`,
      `requests` tiers, `terrain` heights, `noise`
- [ ] readme.md and ROADMAP.md: document the new blocks; strike the roadmap
      items now done (dynamic prompts, settings screen, quests)
- [ ] `npm test`, `bash tools/smoke-all.sh`, merge to main, push origin + ark

## Hollowmere work (after syncing the template)

- [ ] `content/world.ts`: terrain height function, flats (farm at y 0, village,
      chapel, points of interest), extra field rectangles, POI positions
- [ ] `game/world.ts`: use `addTerrain` (`scene.groundSize: 0`), paint road /
      village cobbles / farm soil with vertex colours, put every object at
      `terrain.heightAt`, village wall with gate gaps and signposts, POIs:
      the mere (dark lake in a hollow), lookout hill with the hanging tree,
      stone circle, ruined farmstead, graveyard on a rise
- [ ] Everything that assumes y = 0: villagers, safe zones, bike, shop counter,
      bin, door, barriers (`placeInFront` uses the player's y, fine), monster
      spawns (`heightAt` option of `addPopulation`), probe teleports
- [ ] `content/items.ts`: axe, wood, wheat + seeds, mushroom, cooked dishes
- [ ] `content/recipes.ts`: cookpot tiers 1 to 3 (each dish needs 1 wood),
      workbench: fence kit from 3 wood
- [ ] Cookpot + fireplace by the farmhouse (procedural model), workbench
- [ ] Chopping: woods trees become resource nodes (axe, 4 hits, 2 to 4 wood,
      stump, regrow); mushrooms at the stone circle and the mere
- [ ] Farming: harvest gives 1 seed back with a chance of 2
      (`seedReturn: 1, bonusSeedChance: 0.35`); start with a 4x3 field
- [ ] Upgrades at Barnaby's ("Order book" next to the counter): field 2 and 3
      (fixed places), cookpot tiers, extra hen (x3), extra cow (x2), better
      seeds (unlock corn, then pumpkin in the store catalogue)
- [ ] Store sells and buys; shipping bin stays
- [ ] Requests: tiered templates (raw crops, then simple dishes, then better
      dishes), `from` specific villagers, 3 to 4 open so the player chooses
- [ ] Journal (key J): tabs Quests (story step + open requests), Recipes,
      How to play
- [ ] Story: intro monologue (farmer who woke up in another world, has to
      work to survive), storyline steps: plant 3, water, chop a tree, harvest,
      cook soup, ride to the village, talk to Barnaby, deliver, sleep
- [ ] Monsters: replace `MonsterDirector` with `addPopulation`, a few more by
      day and night, posts at the graveyard, the mere, the road
- [ ] Save menu (`addSaveMenu`), settings (`addSettings`: VHS, sensitivity,
      volumes), new pause menu via `game.menus.register(PAUSE_MENU, ...)`;
      remove the old `hollowmere.look` localStorage code in `boot.ts`
- [ ] Villager writing: deeper, endearing, unsettling under the surface;
      `topics` gated by hearts, e.g. "I like you. The last farmer was not as
      kind as you. So he had to go."
- [ ] Update `tools/probe-hollowmere.js` (heights, new steps: chop, cook,
      upgrade, save and continue), readme.md
- [ ] Commit
