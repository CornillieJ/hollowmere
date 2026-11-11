# Hollowveil Farm

A PS1-era horror farming game. You are a farmer, a cat, who went to sleep at
home and woke on the old Pell farm outside Hollowveil, under a sky that is not
quite right. There is nothing to do about that, so you do what a farmer does:
grow turnips, wheat, corn and pumpkins, keep hens and a cow, cook over the fire,
and bring the village what it asks for. The villagers are kind, and mean it. They
are also a little wrong, and never mention that the dead walk the fog between
your farm and the square.

The Hollow are slow. They are never a fight, only something to manage: keep
moving, put a fence between you and them, light a candle, ride the bicycle, or
step into one of the lit places they will not enter. If they kill you, you wake
in the village infirmary 3 days later with nothing but your tools.

Built on [threejs-game-start](https://github.com/CornillieJ/threejs-game-start):
almost everything here is a kit call. Building the game found and fixed about
forty gaps in that template, which is the point of it.

## Play

In the browser: https://cornilliej.github.io/hollowveil-farm/ (deployed from `main` by `.github/workflows/pages.yml`).

Or locally:

```bash
npm install
npm run dev          # http://localhost:5260
```

| Key | Does |
| --- | --- |
| WASD, mouse | walk and look (or pedal and steer on the bicycle) |
| E | interact: plant, water, pick, chop, cook, talk, ride, sleep |
| F | use what you hold: put down a fence, light a candle, swing the axe, eat |
| 1 to 8, wheel | pick a slot on the hotbar (the wheel does not zoom) |
| Tab or I | the backpack: stats, drag to move, drag out to drop, click for more. Tab closes it again |
| J | the notebook: tasks, requests, recipes, how everything works |
| Shift | run |
| Escape or Tab | closes whatever window is open. With none open, Escape pauses: save, settings (fullscreen, sensitivity, picture effects, volumes) |

On a phone the on-screen stick and buttons appear at the first touch.

## The loop

- **The first day** is a short chain of jobs. The farmer says each one in a
  dialogue box that waits to be read (Space, E or a click): plant, water, chop, pick, cook, ride to the village, deliver, sleep.
- **Farm.** Press E at a plot and the right thing happens: plant, water (twice
  as fast that day) or pick. Hold E and walk to work down a row; the right
  tool comes to hand by itself. Every harvest hands a seed back, sometimes two. Collect eggs and
  milk from the pen.
- **Water and time.** The can holds 5 waterings; fill it at the well. Filling
  a request takes 3 hours. At 3 in the morning the clock stops and the only
  thing left to do is go home to bed.
- **Gather.** The axe fells dead trees for wood; they grow back. Pale caps grow
  by the black pool and among the standing stones.
- **Cook.** The pot by the farmhouse turns crops into dishes: pick a recipe,
  wait, take it off the fire. Every dish burns 1 wood. The bench turns 3 wood
  into a fence kit.
- **Going home.** From day 3 Pell, who had the farm before you and wrote the
  letters, waits on the lookout hill. Burn 12000c at the old tree within 60
  days and you wake up in your real life; say yes and the countdown starts.
  Pay in parts whenever you call on him. Miss the last day and you stay for
  good, and the game goes on.
- **Big jobs.** The better-paid requests want a third of the pay down first,
  asked as a yes or no. It comes back on delivery and is kept if the day passes.
- **Bad days.** From day 3 there is a 30% chance each day that a crowd gathers
  at some hour: ringing the village wall, or all over the farmyard. They cannot
  enter the lit places and are gone by dawn.
- **Carrying.** 8 pockets on the hotbar and a backpack that starts with 3
  slots; the store and the order book sell 6, 10 and 16 (150c, 400c, 900c).
  Drag one item onto another to swap them. The chest by the barn holds 16
  stacks, and what is in it survives dying.
- **Deeds.** 17 achievements, listed in the notebook.
- **Deliver.** Villagers ask for specific things, marked with a `!`. They take
  only what they asked for. Requests start with raw crops and move up to
  dishes that need a better pot, and they pay far more than the store.
- **Upgrade.** Barnaby's order book sells 2 more fields, 2 better pots, better
  seeds, hens and cows. His counter sells seeds and buys anything at half price.
- **Bond.** Talk every day and ask about things. People open up as they come to
  like you, and what they say gets stranger.
- **Day and night.** A day is 10 minutes. Night runs from 19:30 to 05:30, and
  the clock at the bottom right shows ☀ or ☾. At night 3 times as many of the
  Hollow roam, they see farther, walk a quarter faster and head for you
  instead of wandering. At dawn the extra ones slip away.
- **Survive.** The Hollow wander towards wherever you are, weaving, never at a
  steady pace, and hurry a little once they are close. More come at night and
  one more every day. Crawlers turn up from day 3, and from day 5 pale ones
  that only move while you are not looking. Each place off the road has its
  own few who will not be led away from it. During the first day they keep off
  the farm; after it only the lit places are safe: the farmhouse porch, the
  barn lamp, the wayside chapel, the shrine in the square, the lamp on the
  lookout, and for 90 seconds any grave candle you set down.
- **Getting hit.** One of the Hollow stops and raises its arms for half a
  second before the blow, which is the moment to step back. A hit takes 25 of
  100 health, flashes the screen edges and gives 1.6 seconds in which nothing
  can hurt you again. Health is the bar at the bottom left; it mends by itself.
- **Dying** costs 3 days and everything you carry except your tools. Requests
  have deadlines, so anyone waiting on you gives up, and likes you less for it.
- **Letters.** From day 2 a letter waits in the mailbox each morning. Reading
  them all leads to the tall one at the bend in the road.
- **The valley gets worse.** Blood, a boot, a dropped basket: more signs lie
  about with every day, and the villagers start mentioning who has not been in.
- **Sleep** at the farmhouse door to end the day and save. Whatever is on the
  fire finishes overnight, and the morning adds the day up. The pause menu
  saves too, and the title screen continues from the save.
- **Nothing can strand you.** Tools cannot be dropped or sold, nobody asks for
  a dish you cannot make yet, and a farmer with no seeds and no money finds a
  few on the doorstep.

## The valley

The farm lies low in the south west, the village on a rise in the north east
behind a low wall, with pale cobbles underfoot so it is plain where it ends.
The brown road joins them past the chapel. Thin paths lead off it to the black pool,
the lookout hill above the mist, the standing stones, a ruined farm and the
graveyard. The valley has no edge: walk far enough into the fog and you come
out on the far side.

## Where things are

| Path | What |
| --- | --- |
| `src/scripts/game/boot.ts` | composes the game from kit calls |
| `src/scripts/game/world.ts` | terrain, ground colours, woods, buildings, lamps, the wall |
| `src/scripts/game/places.ts` | the black pool, lookout, stones, ruin and graveyard |
| `src/scripts/game/farmyard.ts` | the clutter on the farm, and the infirmary |
| `src/scripts/game/omens.ts` | what lies about on the plains, by day |
| `src/scripts/game/letters.ts` | the mailbox and Pell |
| `src/scripts/game/escape.ts` | the bargain for a way home: price, days, the talk |
| `src/scripts/game/happenings.ts` | sieges and overruns |
| `src/scripts/game/story.ts` | the first day, step by step |
| `src/scripts/game/journal.ts` | the notebook |
| `src/scripts/game/monsters.ts` | the three kinds of Hollow, and how many there should be |
| `src/scripts/game/dread.ts` | lantern, sound, and the tape that worsens as they near |
| `src/scripts/game/farming.ts` | what the held item does at a plot |
| `src/scripts/game/mood.ts` | light and fog through the day |
| `src/scripts/content/` | people and what they say, items, recipes, the map, the folk rig |
| `tools/probe-hollowveil.js` | plays the first day and the rest of the loop |

```bash
npm run smoke:play    # with the dev server running
```

Buildings, props and animals are CC0 downloads; see
`static/models/ATTRIBUTION.md`. The farmer and the villagers are original
models, built and textured by `tools/blender/build_folk.py` (`npm run models`,
needs Blender) into `static/models/folk/`. The Hollow and the places off the
road are built in code.
