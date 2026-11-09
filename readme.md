# Hollowmere

A PS1-era horror farming game. You are a cat who has inherited the old Pell
farm outside Hollowmere. Grow turnips, corn and pumpkins, keep a cow and some
hens, and bring the village what it asks for. The villagers are kind, a little
wrong, and never mention that the dead walk the fog between your farm and the
square.

The Hollow are slow. They are never a fight, only something to manage: keep
moving, put a fence between you and them, ride the bicycle, or step into one of
the lit places they will not enter. If they catch you, you wake at home the next
morning a little poorer.

Built on [threejs-game-start](https://github.com/CornillieJ/threejs-game-start):
almost everything here is a kit call. Building the game found and fixed about
twenty gaps in that template, which is the point of it.

## Play

```bash
npm install
npm run dev          # http://localhost:5260
```

| Key | Does |
| --- | --- |
| WASD, mouse | walk and look (or pedal and steer on the bicycle) |
| E | interact: plant, water, pick, talk, ride, ship, sleep |
| F | use what you hold: put down a fence, eat bread |
| 1 to 8, wheel | pick a slot on the hotbar |
| I or Tab | the backpack |
| Shift | run |
| Escape | pause |

On a phone the on-screen stick and buttons appear at the first touch.

## The loop

- **Farm.** Hold seeds and press E at an empty plot, hold the watering can and
  press E to water (watered plots grow twice as fast that day), press E on a
  ripe crop to pick it. Collect eggs and milk from the pen.
- **Deliver.** Villagers ask for produce, marked with a `!` over their heads.
  Hand it over in conversation for coins and friendship. The shipping bin at the
  farm buys anything, for less.
- **Bond.** Talk every day, and give gifts: everyone has things they love and
  things they would rather not be given.
- **Survive.** More of the Hollow come at night and as the days go on. Fence
  kits from Barnaby's store hold them for a while. Safe places: the farmhouse,
  the barn lamp, the wayside chapel and the shrine in the square.
- **Sleep** at the farmhouse door to end the day and save.

## Where things are

| Path | What |
| --- | --- |
| `src/scripts/game/boot.ts` | composes the game from kit calls |
| `src/scripts/game/world.ts` | ground, road, woods, buildings, lamps |
| `src/scripts/game/monsters.ts` | the director that paces the Hollow |
| `src/scripts/game/dread.ts` | lantern, sound, and the tape that worsens as they near |
| `src/scripts/game/farming.ts` | what the held item does at a plot |
| `src/scripts/game/mood.ts` | light and fog through the day |
| `src/scripts/content/` | the people, items, places and the folk rig |
| `tools/probe-hollowmere.js` | plays a day: farm, ride, fence, deliver, faint |

```bash
npm run smoke:play    # with the dev server running
```

Models are CC0; see `static/models/ATTRIBUTION.md`. The characters are built in
code, since no CC0 set of animal folk exists.
