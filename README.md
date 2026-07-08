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
| **Q** | Web-shot (again on a webbed enemy = **web-yank** takedown) |
| **F** | Punch combo on the ground · **web-dash** in the air (level 4) |
| Double-tap W/A/S/D | Dodge roll with i-frames |
| C (hold) / T | Charge super-jump / sling a web trampoline |
| **M** | Full city map — click to set a waypoint |
| **L** | The LEGEND board — 16-item completion list; 100% crowns you King of the City |
| **P / Esc** | Pause: settings, lifetime stats, photo mode |
| Left Click | Shoot |
| 1–6 / **X** | Pick weapon / cycle: Pistol, MG, Shotgun, Sniper (scoped), RPG, Grenade |
| **J** | Jetpack on/off (once bought — Space climbs, C drops) |
| **Z** | Send REX to bite the nearest enemy |
| E | Enter vehicle / rob store (hold) / casino / bank vault (hold) / bounty board / lotto / fight club |

### Vehicles
| Input | Action |
| --- | --- |
| W A S D | Drive / fly / boat |
| Space | Handbrake / helicopter up |
| Shift | Helicopter down |
| **R** | Cycle the car radio (5 procedural stations) |
| Left Click (in tank) | Fire the cannon |
| **V** (in a police car) | Start a **vigilante** chase streak |
| E | Exit — mid-flight in a helicopter it's a **skydive** (hold Space for the chute) |

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
- **The bank job**: crack the City Bank vault (hold E), hold the lobby
  against guards while the drill runs, then escape a 4-star manhunt to the
  safehouse beam. Once per in-game day, $3000.
- **The armored truck**: a 400 HP cash transporter runs routes every few
  minutes (gold square on the minimap). Wreck it for $1000 plus a ring of
  spilled cash cubes — and the heat that comes with it.
- **Vigilante**: steal a police cruiser mid-patrol, press **V**, and chase
  down fleeing criminals. Every takedown chains a tougher, faster target;
  payouts escalate and your best streak is saved.
- **The Lucky 7 casino**: blackjack (hit/stand/double, 3:2 blackjack), a
  slot machine (7-7-7 jackpot pays 25×) and European roulette (red/black,
  dozens, or a 36× lucky number) — walk in with E, hop between the games
  at the table.
- **Property raids**: own real estate and crooks will come for it — a crew
  hits your casino/stadium/Spire every few minutes. Wipe them out for cash
  and rep, or the place gets ransacked and pays no income for the day.
- **Gang territory**: the Vipers hold the north-east district and shoot on
  sight. Put ten of them down to seize the turf — then defend it when the
  **Jackals raid** in periodic turf wars, or lose the district again.
- **REX the dog**: adopt him at the kennel near spawn ($500). He follows
  you across the city, fetches money pickups, and barks when cops close in.
- **Odd jobs & toys everywhere**: ambulance rescues, harbor vehicle exports,
  bounty contracts with bodyguards, a bare-knuckle **fight club** on the
  waterfront after dark, a lottery kiosk, **five-card poker** at the casino,
  a **jetpack** shop, BASE-jump ring trials off the Spire, ten golden sky
  hoops — and strange lights over the Spire past midnight.
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
- **Boats & jet-skis** at the harbor past the east edge — plus two boat
  races (Harbor Circuit and Buoy Slalom).
- **Car radio**: five procedural WebAudio stations (lofi, synthwave, bass,
  desi, night jazz).

### Missions — ten types in rotation
Walk into the yellow beam: **Delivery**, **Street race**, **Swing race**
(floating sky rings, webs only), **Taxi shift**, **Hit contract**,
**Boss chopper**, **Firefighter**, **Rooftop hit**, **Witness escort**, and
a **rival web-slinger** duel. Rewards scale as you complete more — plus
free-roam races, the stadium arena, the bank heist, vigilante chases and
turf wars outside the mission beam.

### Progression
- **XP levels** unlock skills: double-jump (2), web-dash (4), slow-motion
  airborne aim (6), parkour sprint (8).
- **Wardrobe suits** with perks: Classic (+50% style), Symbiote (2x melee,
  10s webs), Stealth (heat fades twice as fast).
- **Lifetime stats and 10 achievements**, all in the pause menu.

### Tech
- **Playable on phones**: virtual joystick + buttons, and it's a **PWA** —
  add to home screen, runs full-screen, works offline after the first load.
- Pause menu with volume / sensitivity / invert-Y / low-graphics settings,
  **photo mode** with filters, full-screen map with waypoints, chase music
  that swells with the wanted level, NPC speech bubbles, intro flyover.
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
js/economy.js     Properties, reputation, daily challenges, chaos meter
js/races.js       Free-roam street / swing / boat races
js/water.js       The harbor: water, boats, jet-ski, swimming
js/arena.js       Stadium wave-survival arena
js/heist.js       The City Bank job
js/vigilante.js   Cop-car criminal chase streaks
js/armored.js     The roaming armored cash truck
js/turfwar.js     Jackal raids on your district
js/blackjack.js   Lucky 7 blackjack table (DOM overlay)
js/slots.js       Lucky 7 slot machine (DOM overlay)
js/dog.js         REX the companion dog
js/stunts.js      Ramps, rampage skulls, web trampolines
-->

