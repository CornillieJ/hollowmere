# Hollowmere

A PS1-era horror farming game. You are a farmer, a cat, who went to sleep at
home and woke on the old Pell farm outside Hollowmere, under a sky that is not
quite right. There is nothing to do about that, so you do what a farmer does:
grow turnips, wheat, corn and pumpkins, keep hens and a cow, cook over the fire,
and bring the village what it asks for. The villagers are kind, and mean it. They
are also a little wrong, and never mention that the dead walk the fog between
your farm and the square.

The Hollow are slow. They are never a fight, only something to manage: keep
moving, put a fence between you and them, ride the bicycle, or step into one of
the lit places they will not enter. If they catch you, you wake at home the next
morning a little poorer.

Built on [threejs-game-start](https://github.com/CornillieJ/threejs-game-start):
almost everything here is a kit call. Building the game found and fixed about
forty gaps in that template, which is the point of it.

## Play

```bash
npm install
npm run dev          # http://localhost:5260
```

| Key | Does |
| --- | --- |
| WASD, mouse | walk and look (or pedal and steer on the bicycle) |
| E | interact: plant, water, pick, chop, cook, talk, ride, sleep |
| F | use what you hold: put down a fence, swing the axe, eat |
| 1 to 8, wheel | pick a slot on the hotbar |
| Tab or I | the backpack |
| J | the notebook: tasks, requests, recipes, how everything works |
| Shift | run |
| Escape | pause: save, settings |

On a phone the on-screen stick and buttons appear at the first touch.

## The loop

- **The first day** is a short chain of jobs, told by the farmer thinking
  aloud: plant, water, chop, pick, cook, ride to the village, deliver, sleep.
- **Farm.** Hold seeds and press E at an empty plot, hold the watering can and
  press E to water (watered plots grow twice as fast that day), press E on a
  ripe crop. Every harvest hands a seed back, sometimes two. Collect eggs and
  milk from the pen.
- **Gather.** The axe fells dead trees for wood; they grow back. Pale caps grow
  by the mere and among the standing stones.
- **Cook.** The pot by the farmhouse turns crops into dishes: pick a recipe,
  wait, take it off the fire. Every dish burns 1 wood. The bench turns 3 wood
  into a fence kit.
- **Deliver.** Villagers ask for specific things, marked with a `!`. They take
  only what they asked for. Requests start with raw crops and move up to
  dishes that need a better pot, and they pay far more than the store.
- **Upgrade.** Barnaby's order book sells 2 more fields, 2 better pots, better
  seeds, hens and cows. His counter sells seeds and buys anything at half price.
- **Bond.** Talk every day and ask about things. People open up as they come to
  like you, and what they say gets stranger.
- **Survive.** More of the Hollow come at night and as the days go on, and a
  few never leave their spot. Safe places: the farmhouse, the barn lamp, the
  wayside chapel, the shrine in the square and the lamp on the lookout.
- **Sleep** at the farmhouse door to end the day and save. The pause menu saves
  too, and the title screen continues from the save.

## The valley

The farm lies low in the south west, the village on a rise in the north east
behind a low wall, with pale cobbles underfoot so it is plain where it ends.
The brown road joins them past the chapel. Thin paths lead off it to the mere,
the lookout hill above the mist, the standing stones, a ruined farm and the
graveyard. The rim of the valley is too steep to climb.

## Where things are

| Path | What |
| --- | --- |
| `src/scripts/game/boot.ts` | composes the game from kit calls |
| `src/scripts/game/world.ts` | terrain, ground colours, woods, buildings, lamps, the wall |
| `src/scripts/game/places.ts` | the mere, lookout, stones, ruin and graveyard |
| `src/scripts/game/story.ts` | the first day, step by step |
| `src/scripts/game/journal.ts` | the notebook |
| `src/scripts/game/monsters.ts` | what one of the Hollow is, and how many there should be |
| `src/scripts/game/dread.ts` | lantern, sound, and the tape that worsens as they near |
| `src/scripts/game/farming.ts` | what the held item does at a plot |
| `src/scripts/game/mood.ts` | light and fog through the day |
| `src/scripts/content/` | people and what they say, items, recipes, the map, the folk rig |
| `tools/probe-hollowmere.js` | plays the first day and the rest of the loop |

```bash
npm run smoke:play    # with the dev server running
```

Models are CC0; see `static/models/ATTRIBUTION.md`. The characters and the
places off the road are built in code.
