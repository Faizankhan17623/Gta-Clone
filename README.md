# OPEN CITY

A GTA-style open-world game that runs entirely in your browser. No build step,
no dependencies to install — just Three.js loaded from a CDN and plain
JavaScript ES modules. The whole game is yours to modify.

## Run it

Any static file server works. The easiest:

```
npm start
```

(or `npx -y http-server -p 8080 -c-1 .`)

Then open **http://localhost:8080** in your browser and click PLAY.

## Controls

| Key | Action |
| --- | --- |
| W A S D | Move / Drive / Fly |
| Mouse | Look around / Aim |
| Shift | Sprint / Helicopter down |
| Space | Jump / Handbrake / Helicopter up |
| E or F | Enter / Exit vehicle or helicopter |
| Left Click | Shoot (on foot) |
| 1 / 2 / 3 | Pistol / Machine Gun / RPG |

## Features

- Procedurally generated dusk city: 64 blocks, towers with glowing windows,
  neon billboards, rooftop AC units and antennas, parks, street lamps and a
  full road grid
- Third-person on-foot movement with sprint and jump
- Three weapons: pistol, full-auto machine gun, and an RPG that fires real
  rockets with splash damage
- Steal any parked or moving car — arcade driving physics with handbrake
  drifts and speed-sensitive FOV
- Flyable helicopters parked on park helipads (Space/Shift for altitude)
- Living world: 70 pedestrians who stroll the sidewalks and flee from danger,
  plus AI traffic that brakes for obstacles
- 5-star wanted system: police cars hunt and ram you — and at 3+ stars the
  police helicopter shows up with a door gunner
- Procedural WebAudio sound: gunshots, explosions, engine, sirens, rotor thump
- WASTED / BUSTED screens with respawn
- HUD: minimap with police and chopper blips, health bar, money, wanted stars,
  weapon display and speedometer
- Money and health pickups scattered across the city

## Project layout

```
index.html        HUD, start screen, styles, Three.js import map
js/main.js        Game loop, player, camera, shooting, pickups, respawn
js/city.js        Procedural city generation + collision helpers
js/car.js         Car meshes + arcade vehicle physics
js/characters.js  Blocky character builder + walk animation
js/npc.js         Pedestrians, traffic AI, parked cars
js/police.js      Wanted system + police chase AI
js/heli.js        Helicopter meshes, flight physics, police chopper AI
js/sound.js       Procedural WebAudio sound (no audio files)
js/effects.js     Tracers, explosions, smoke
js/hud.js         HUD + minimap rendering
js/input.js       Keyboard / mouse / pointer-lock input
```

## Ideas to extend

- Missions (drive here, deliver that, escape the cops)
- Helicopters at 3+ stars
- Day/night cycle with working street lights
- Engine/gunshot sounds via WebAudio
- Bigger map with districts (downtown, docks, suburbs)
