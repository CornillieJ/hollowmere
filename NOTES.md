# Working notes

Where the project stands and how to carry on. Keep this short and current.

## How the two repos fit

- `~/Coding/Fun/threejs-game-start` is the template. Anything reusable is built
  there first (branch, test, merge to `main`, push to `origin` and `ark`).
- This game pulls the library with `node tools/sync-template.mjs` (remote
  `template` points at the local template repo). A second argument syncs a
  branch that is not merged yet: `node tools/sync-template.mjs template my-branch`.
- Never edit synced paths here (`src/scripts/{kit,game/*.ts from the template,ui,core,...}`,
  `src/css/style.css`): the next sync overwrites them. The game owns
  `src/scripts/game/{boot,world,places,story,journal,monsters,dread,farming,mood}.ts`,
  `src/scripts/content/`, `src/css/hollowmere.css`, `tools/probe-hollowmere.js`.

## Checks before a commit

```bash
npm run typecheck && npm test
npm run dev                      # port 5260
npm run smoke:play               # plays the first day and the whole loop
node tools/smoke.mjs http://localhost:5260/ tools/probe-mobile.js --mobile
```

The probe drives the real game through `window.__game.world`; add a step there
for every new mechanic.

## Done in round 2 (November 2026)

Terrain with flats and painted ground, village wall, 5 places off the road,
first-day storyline with the farmer's monologue, notebook (J), chopping and
foraging, seeds back on harvest, cookpot with 3 tiers and a workbench, tiered
requests from specific villagers (no gifts), store plus order book (fields,
pots, seeds, hens, cows), more Hollow plus 6 that keep to a place, title menu
with Continue and New game, save from the pause menu, settings (sensitivity,
VHS, screen shake, 3 volumes), deeper villager writing with topics that open
with hearts.

## Done in round 3 (November 2026)

Lethal Hollow with a death screen, infirmary, 3 lost days and loss of
everything but kept items; weaving, uneven pace, drift towards the player,
territories with leashes (`HAUNTS`), crawlers and watchers, one more every day;
a quiet first day (the farm is safe until the `sleep` step is done); omens by
day and villagers talking about the missing; farmyard clutter; letters and
Pell; grave candles; wading in the mere; villager day schedules; morning
summary; cooking finishes overnight; compass; settings for every picture
effect; softlock guards (`keep` items, request availability, seed rescue);
store buys what you carry; hotbar owns the wheel.

## Done in round 4 (November 2026)

Tutorial and intro lines are spoken in a dialogue box that must be read
(`narration.speak`, `addStoryline({ spoken: true })`); enemy wind-up before a
hit with a raised-arms pose; damage feedback and 1.6 s of invulnerability;
work motions (axe swing, pour, reach) and held tools on the farmer; a seated,
pedalling pose on the bicycle; a slider for the PS1 shimmer (default 60%).

## Done in round 5 (November 2026)

Pack screen (Tab) with stats, drag and drop, drop into the world, item menu;
backpack starts at 3 slots with 3 upgrades; chest by the barn; Escape closes
windows before pausing; all of the farmer's lines are spoken in the box;
trees regrow in 2 to 3 days; deposits on tier 2 and 3 requests; the way home
(`escape.ts`: 12000c in 60 days, Pell on the hill); the world wraps at
`WRAP_AT`; sieges and overruns (`happenings.ts`); 17 deeds; seeds have their
own icons.

Numbers to tune after play: `ESCAPE.price` and `.days`, deposit share (0.33 in
`content/villagers.ts`), `CHANCE` in `happenings.ts`, crowd sizes.

## Done in round 6 (November 2026): feel

GitHub Pages at https://cornilliej.github.io/hollowmere/ (repo is public).
`addJuice` everywhere: chimes, pops, reward text, banners, hit-stop on the
axe, slow motion on a dodged blow. Smart E (right action, right tool) and hold
E along a row. Ripe crops glint, crops hop on growth. Delivery streak bonus
(+10% per further delivery that day, max +50%), best-day record in the morning
summary. Timer over the pot. FOV widens on the bicycle. A self-writing tune by
day and night with its own volume slider.

## Not verified by a person yet

- Pointer lock handover when a panel or dialogue opens and closes: the probe
  runs headless, where there is no pointer lock. Test in a real browser.
- Balance: prices, crop times, how many Hollow feel right at night, how hard
  the watchers and crawlers are, whether 25 damage a hit is fair.
- Which effect the player meant by "shimmer": VHS, PS1 shimmer, PS1 colours
  and drifting mist each have a toggle now.
- Sound levels of the new chop and cooking cues.

## Ideas, not started

- A ribbon mesh for the road (crisper than vertex colours).
- Villagers walk in straight lines between stops; they can clip a corner.
- The store only buys out of the pockets, not the backpack.
- What the shrine costs (Hollis's topic) as a late thread.
- Dropped items are not saved; they are gone after a reload.
- The barn is a solid model, so the chest stands outside against its wall.
- An ending cutscene instead of a menu when the farmer wakes.
