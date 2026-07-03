# OPEN CITY

A GTA-style open world **crossed with Spider-Man traversal**, running entirely
in your browser. No build step, no installs — just Three.js from a CDN and
plain JavaScript ES modules. Steal cars, fly helicopters, rob stores, fight a
gang for territory, outrun tanks at five stars... or ignore all of it and
web-swing between the towers at 200 km/h.

## Run it

Any static file server works. The easiest:

```
npm start
```

(or `npx -y http-server -p 8080 -c-1 .`)

Then open **http://localhost:8080** and click PLAY.

## Controls

### On foot & webs
| Input | Action |
| --- | --- |
| W A S D | Move (Shift = sprint, Space = jump) |
| Mouse | Look around / aim |
| **Right Click (hold)** | Web-swing — release at the front of the arc to fly |
| **Right Click (tap)** | Zip straight to a rooftop |
| Space / Shift (mid-swing) | Reel the web in / let it out |
| **W into a wall (airborne)** | Wall-run up it — Space kicks off |
| **Q** | Web-shot: pin peds, gangsters or cars in webbing |
| Left Click | Shoot |
| 1 / 2 / 3 | Pistol / Machine Gun / RPG |
| E | Enter vehicle / rob store (hold) |

### Vehicles
| Input | Action |
| --- | --- |
| W A S D | Drive / fly |
| Space | Handbrake / helicopter up |
| Shift | Helicopter down |
| **R** | Cycle the car radio (3 procedural stations) |
| Left Click (in tank) | Fire the cannon |
| E | Exit |

### Gamepad
Plug one in and play: left stick moves, right stick looks, **A** jump/up,
**B** sprint/down, **X** enter/exit, **Y** web-shot, **LB** radio,
**RB/LT** web-swing, **RT** shoot.

## Features

### Spider-Man traversal
- **Web swinging** — physical pendulum on buildings; anchors picked high and
  ahead so swinging down a street just works. Swing pump builds speed, the
  rope auto-winches clear of the asphalt, releases slingshot you into a
  floaty glide with seconds of hang-time to chain the next web.
- **Zip-to-point**, **wall-running**, rooftop landing with a forgiving
  superhero roll, and a **style meter**: mid-air catches, fast releases,
  wall-runs and zips earn points that cash out as money when you land.
- **Web attack (Q)** pins pedestrians, gangsters, traffic — even cop cars.

### The city
- Procedurally generated 64-block dusk city: towers with glowing windows,
  neon billboards, rooftop clutter, parks, helipads, street lamps.
- **Day/night cycle** (1 real minute = 1 game hour): the sun sets, windows
  light up, headlights come on, street lamps glow.
- **Weather**: rolling rain storms with lightning that dim the sky.
- Living streets: 70 pedestrians who flee gunfire, AI traffic that brakes,
  **pigeon flocks** that scatter, **rush-hour and night traffic density**,
  fewer people out after dark.

### Crime & economy
- **Rob the corner stores** (green rings, hold E) — cash plus 2-star heat.
- **Gang territory**: the Vipers hold the north-east district and shoot on
  sight. Put ten of them down to seize the turf — one-time reward plus
  passive protection income.
- **The WEB DEN** near spawn sells permanent upgrades: longer webs, faster
  winch, body armor (150 HP).
- Money & health pickups, ammo crates, and a style meter that pays for flair.

### Wanted system
- 5 stars of escalation: police cruisers ram and corner you, the **police
  helicopter** with a door gunner arrives at 3 stars, and at **5 stars the
  army sends a tank** — 600 HP, live cannon... and stealable. Left-click
  fires shells while you drive it.

### Vehicles
- Steal any car — arcade physics, handbrake drifts with **skid marks** and
  tyre smoke, speed-sensitive FOV.
- **Motorbikes** (every 4th parked vehicle): fast, nimble, lean into corners.
- Helicopters on the park helipads. Space to climb — it always wins over a
  held sprint key.
- **Car radio**: three procedural WebAudio stations (lofi, synthwave, bass).

### Missions — six types in rotation
Walk into the yellow beam: **Delivery** → **Street race** (5 checkpoints) →
**Swing race** (5 floating sky rings, webs only) → **Taxi shift** (2 fares) →
**Hit contract** → **Boss fight** (shoot down the rival crime chopper).
Rewards scale as you complete more.

### Tech
- Procedural WebAudio everything — guns, explosions, engines, sirens, rotor
  thump, thunder, mission stingers, radio. Zero audio files.
- Post-processing bloom, ACES tone mapping, PMREM reflections.
- Autosave to localStorage: money, missions, ammo, upgrades, territory.
- WASTED / BUSTED screens, HUD with minimap (cops, choppers, stores, gang
  turf, tanks), live WASD key indicator.

<!-- Project layout (hidden from the rendered page, kept for reference)

index.html        HUD, start screen, styles, Three.js import map
js/main.js        Game loop, player, camera, swinging/zipping, shooting, style
js/web.js         Web physics: anchor raycasts, pendulum, zip, poses
js/city.js        Procedural city generation + collision helpers
js/car.js         Car & motorbike meshes + arcade vehicle physics
js/characters.js  Blocky character builder + walk animation
js/npc.js         Pedestrians, traffic AI, parked vehicles, webbed states
js/police.js      Wanted system + police chase AI
js/heli.js        Helicopters: flight physics, police/boss chopper AI
js/army.js        The 5-star tank: AI, cannon, stealing
js/gangs.js       Viper territory: patrols, firefights, takeover
js/shops.js       Robbable stores + the WEB DEN upgrade shop
js/missions.js    Six mission types, markers, rewards
js/daynight.js    Sun, sky dome, window/lamp glow over 24 game hours
js/weather.js     Rain storms + lightning
js/ambient.js     Pigeon flocks
js/sound.js       Procedural WebAudio (guns, loops, radio stations)
js/effects.js     Tracers, explosions, smoke, sparks, debris, skid marks
js/hud.js         HUD + minimap rendering
js/input.js       Keyboard / mouse / pointer-lock / gamepad input
-->

## Tests

```
npm start                  # serve on :8080 (or PORT=xxxx for the tests)
node test/fulltest.mjs     # gameplay smoke suite — 22 checks
node test/featurecheck.mjs # feature audit: every feature verified live — 19 checks
```

Headless-browser suites (Playwright + Edge/Chrome) drive the real game:
movement, weapons, web swing/zip/wall-run/traversal, glide, style meter,
driving, motorbike, helicopter, police, tank spawn + stealing, web attack,
store robbery, the upgrade den, gang territory, all six mission types,
pigeons, day/night, death + respawn, and the save file.

## Roadmap — ideas for the next era

- **River + boats** along the south edge, with bridges (needs a map rework)
- **Elevated metro loop** you can ride and roof-surf (needs a map rework)
- Melee combat + web-yank finishers, dodge roll
- Unlockable suits with perks (symbiote, stealth)
- A rival web-swinger boss who chases you across rooftops
- Multi-stage heists, interiors (bank, nightclub, garage)
- Skill tree paid in style points: double-jump, web-pull, slow-mo aim
- Photo mode, stats & achievements, settings menu, save slots
- Landmark towers, NPC dialogue barks, slow-motion stunt moments
